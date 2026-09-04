use std::time::Duration;

use axum::{Json, extract::State, response::IntoResponse};
use axum_extra::extract::{PrivateCookieJar, cookie::Cookie};
use bson::oid::ObjectId;
use http::StatusCode;
use mongodb::bson::doc;
use oauth2::{
    AccessToken, EmptyExtraTokenFields, StandardTokenResponse, TokenResponse, basic::BasicTokenType,
};
use serde::{Deserialize, Serialize};
use tower_sessions::Session;
use tracing::instrument;

use crate::{database::prisma, errors::Error, state::ServerState};

pub mod github;

/// Logs the user out by deleting the db session(s), and unsetting the sid
#[instrument(skip_all, err(Debug), level = "debug")]
pub async fn delete_logout(
    user: prisma::ExamCreatorUser,
    jar: PrivateCookieJar,
    State(server_state): State<ServerState>,
) -> Result<PrivateCookieJar, Error> {
    let _cookie = jar
        .get("sid")
        .map(|cookie| cookie.value().to_owned())
        .ok_or(Error::Server(
            StatusCode::UNAUTHORIZED,
            format!("invalid sid in cookie jar"),
        ))?;

    server_state
        .production_database
        .exam_creator_session
        .delete_many(doc! {"user_id": &user.id})
        .await?;

    Ok(jar.remove(Cookie::build(("sid", "")).path("/")))
}

#[derive(Deserialize)]
pub struct DevLoginBody {
    pub name: String,
    pub email: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DevLoginStatus {
    enabled: bool,
}

pub async fn get_dev_login_status(State(server_state): State<ServerState>) -> Json<DevLoginStatus> {
    Json(DevLoginStatus {
        enabled: cfg!(debug_assertions) && server_state.env_vars.mock_auth,
    })
}

/// Dev login route for development purposes only
///
/// Takes a name and email as body parameters, creates a user if one does not exist,
/// and creates a session for that user, setting the sid cookie in the response.
#[instrument(skip_all, err(Debug), level = "debug")]
pub async fn post_dev_login(
    _session: Session,
    jar: PrivateCookieJar,
    State(server_state): State<ServerState>,
    Json(mut user_body): Json<DevLoginBody>,
) -> Result<impl IntoResponse, Error> {
    user_body.name = user_body.name.trim().to_string();
    user_body.email = user_body.email.trim().to_ascii_lowercase();
    if user_body.name.is_empty()
        || user_body.name.chars().count() > 80
        || user_body.email.is_empty()
        || user_body.email.chars().count() > 254
        || !user_body.email.contains('@')
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "development login requires a valid name and email".to_string(),
        ));
    }

    let dev_user = server_state
        .production_database
        .exam_creator_user
        .find_one(doc! {"email": &user_body.email})
        .await?;

    let user = match dev_user {
        Some(user) => user,
        None => {
            let user = prisma::ExamCreatorUser {
                id: ObjectId::new(),
                name: user_body.name,
                email: user_body.email,
                github_id: None,
                picture: None,
                settings: Default::default(),
                version: 2,
            };
            let _ = server_state
                .production_database
                .exam_creator_user
                .insert_one(&user)
                .await?;
            user
        }
    };

    let access_token = user.email.clone();
    let token = StandardTokenResponse::new(
        AccessToken::new(access_token.clone()),
        BasicTokenType::Bearer,
        EmptyExtraTokenFields {},
    );

    let expires_in = token
        .expires_in()
        .unwrap_or(Duration::from_secs(server_state.env_vars.session_ttl_in_s));
    let expires_at = chrono::Utc::now() + expires_in;
    let expires_at = expires_at.into();
    let session_id = access_token;
    // Create session
    let session = prisma::ExamCreatorSession {
        id: ObjectId::new(),
        user_id: user.id,
        session_id,
        expires_at,
        version: 1,
    };

    server_state
        .production_database
        .exam_creator_session
        .insert_one(&session)
        .await?;

    let cookie = Cookie::build(("sid", session.session_id))
        // .domain("http://127.0.0.1:3001")
        .path("/")
        .secure(!cfg!(debug_assertions))
        .http_only(true)
        .max_age(expires_in.try_into()?);

    return Ok(jar.add(cookie));
}
