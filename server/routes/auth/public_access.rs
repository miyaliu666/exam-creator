//! Explicit shared workspace sessions, bound to one existing server-configured author.
use axum::{Json, extract::State, response::IntoResponse};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use bson::{DateTime, doc, oid::ObjectId};
use http::{StatusCode, header::CACHE_CONTROL};
use serde::Serialize;

use crate::{database::prisma, errors::Error, state::ServerState};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessMode {
    public_access: bool,
}

pub async fn get_access_mode(State(state): State<ServerState>) -> impl IntoResponse {
    (
        [(CACHE_CONTROL, "no-store")],
        Json(AccessMode {
            public_access: state.env_vars.public_access,
        }),
    )
}

fn new_session(user_id: ObjectId, expires_at: DateTime) -> prisma::ExamCreatorSession {
    let token = URL_SAFE_NO_PAD.encode(rand::random::<[u8; 32]>());
    prisma::ExamCreatorSession {
        id: ObjectId::new(),
        user_id,
        session_id: format!("public_{token}"),
        expires_at,
        version: 1,
    }
}

fn reusable_session(
    session: &prisma::ExamCreatorSession,
    user_id: ObjectId,
    now: DateTime,
) -> bool {
    session.user_id == user_id
        && session.session_id.starts_with("public_")
        && session.expires_at > now
}

/// The request cannot select an identity or register an author.
pub async fn post_public_session(
    jar: PrivateCookieJar,
    State(state): State<ServerState>,
) -> Result<impl IntoResponse, Error> {
    let email = state
        .env_vars
        .public_user_email
        .as_deref()
        .filter(|_| state.env_vars.public_access)
        .ok_or_else(|| {
            Error::Server(
                StatusCode::NOT_FOUND,
                "Public workspace access is disabled.".into(),
            )
        })?;
    let user = state.production_database.exam_creator_user
        .find_one(doc! { "email": email }).await?
        .ok_or_else(|| Error::Server(
            StatusCode::SERVICE_UNAVAILABLE,
            "Public workspace account is unavailable. Register the configured PUBLIC_USER_EMAIL in the production database.".into(),
        ))?;

    let now = DateTime::now();
    let ttl =
        time::Duration::seconds(state.env_vars.session_ttl_in_s.try_into().map_err(|_| {
            Error::Server(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid session duration.".into(),
            )
        })?);
    let expires_at = DateTime::from_millis(now.timestamp_millis().saturating_add(
        ttl.whole_milliseconds().try_into().map_err(|_| {
            Error::Server(
                StatusCode::INTERNAL_SERVER_ERROR,
                "Invalid session duration.".into(),
            )
        })?,
    ));
    let existing = if let Some(cookie) = jar.get("sid") {
        state
            .production_database
            .exam_creator_session
            .find_one(doc! { "session_id": cookie.value() })
            .await?
            .filter(|session| reusable_session(session, user.id, now))
    } else {
        None
    };
    let session = if let Some(mut session) = existing {
        state
            .production_database
            .exam_creator_session
            .update_one(
                doc! { "_id": session.id },
                doc! { "$set": { "expires_at": expires_at } },
            )
            .await?;
        session.expires_at = expires_at;
        session
    } else {
        let session = new_session(user.id, expires_at);
        state
            .production_database
            .exam_creator_session
            .insert_one(&session)
            .await?;
        session
    };
    let cookie = Cookie::build(("sid", session.session_id))
        .path("/")
        .http_only(true)
        .same_site(SameSite::Lax)
        .secure(!cfg!(debug_assertions))
        .max_age(ttl);
    Ok((
        StatusCode::NO_CONTENT,
        [(CACHE_CONTROL, "no-store")],
        jar.add(cookie),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn public_sessions_use_independent_random_credentials() {
        let user_id = ObjectId::new();
        let first = new_session(user_id, DateTime::now());
        let second = new_session(user_id, DateTime::now());
        assert_ne!(first.session_id, second.session_id);
        assert_ne!(first.id, second.id);
        assert_eq!(
            URL_SAFE_NO_PAD
                .decode(first.session_id.strip_prefix("public_").unwrap())
                .unwrap()
                .len(),
            32
        );
    }

    #[test]
    fn public_session_reuse_rejects_other_authors_expiry_and_legacy_tokens() {
        let user_id = ObjectId::new();
        let now = DateTime::from_millis(1000);
        let mut session = new_session(user_id, DateTime::from_millis(2000));
        assert!(reusable_session(&session, user_id, now));
        assert!(!reusable_session(&session, ObjectId::new(), now));
        assert!(!reusable_session(&session, user_id, session.expires_at));
        session.session_id = "author@exam-creator.local".into();
        assert!(!reusable_session(&session, user_id, now));
    }
}
