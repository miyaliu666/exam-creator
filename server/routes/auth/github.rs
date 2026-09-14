use std::time::Duration;

use axum::{
    Extension,
    extract::{Query, State},
    response::{IntoResponse, Redirect},
};
use axum_extra::extract::{
    PrivateCookieJar,
    cookie::{Cookie, SameSite},
};
use http::{
    HeaderMap, StatusCode,
    header::{ACCEPT, HOST, USER_AGENT},
};
use mongodb::bson::{doc, oid::ObjectId};
use oauth2::{
    AccessToken, AuthorizationCode, CsrfToken, EmptyExtraTokenFields, EndpointNotSet, EndpointSet,
    Scope, StandardTokenResponse, TokenResponse,
    basic::{BasicClient, BasicTokenType},
};
use reqwest::Client;
use sha2::{Digest, Sha256};
use tokio::sync::Mutex;
use tower_sessions::Session;
use tracing::{error, info, warn};
use url::Url;

use crate::{database::prisma, errors::Error, state::ServerState};

type GitHubClient =
    BasicClient<EndpointSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

const GITHUB_OAUTH_STATE_KEY: &str = "github_oauth_state";
const GITHUB_OAUTH_STATE_TTL_SECONDS: i64 = 600;

// The in-memory session store has no atomic take operation. Serialize the short
// load/remove/save sequence so concurrent callbacks cannot consume one state twice.
static GITHUB_OAUTH_STATE_LOCK: Mutex<()> = Mutex::const_new(());

#[derive(serde::Serialize, serde::Deserialize)]
struct GitHubOAuthState {
    secret: String,
    expires_at: i64,
}

pub async fn github_login_handler(
    headers: HeaderMap,
    session: Session,
    State(server_state): State<ServerState>,
    Extension(github_client): Extension<GitHubClient>,
) -> Result<Redirect, Error> {
    if server_state.env_vars.mock_auth {
        let host = headers
            .get(HOST)
            .and_then(|value| value.to_str().ok())
            .unwrap_or("127.0.0.1:8080");
        let callback_url = format!("http://{host}/auth/callback/github");
        let redirect_url = Url::parse_with_params(
            &callback_url,
            &[("code", "anything"), ("state", "anything")],
        )
        .expect("Unreachable. Development static string parsing.");
        return Ok(Redirect::to(redirect_url.as_str()));
    }

    begin_github_authorization(&session, &github_client).await
}

async fn begin_github_authorization(
    session: &Session,
    github_client: &GitHubClient,
) -> Result<Redirect, Error> {
    let (authorize_url, csrf_state) = github_client
        .authorize_url(CsrfToken::new_random)
        // .add_scope(Scope::new("user".to_string()))
        .add_scope(Scope::new("read:user".to_string()))
        .add_scope(Scope::new("user:email".to_string()))
        .url();

    let _guard = GITHUB_OAUTH_STATE_LOCK.lock().await;
    if session.id().is_some() {
        session.load().await?;
    }
    session
        .insert(
            GITHUB_OAUTH_STATE_KEY,
            GitHubOAuthState {
                secret: csrf_state.secret().to_owned(),
                expires_at: chrono::Utc::now().timestamp() + GITHUB_OAUTH_STATE_TTL_SECONDS,
            },
        )
        .await?;
    session.save().await?;
    Ok(Redirect::to(authorize_url.as_str()))
}

async fn consume_github_oauth_state(
    session: &Session,
    supplied_state: Option<&str>,
) -> Result<(), Error> {
    let invalid_state = || {
        Error::Server(
            StatusCode::BAD_REQUEST,
            "Invalid or expired GitHub login. Please start sign-in again.".to_string(),
        )
    };
    let _guard = GITHUB_OAUTH_STATE_LOCK.lock().await;
    if session.id().is_none() {
        return Err(invalid_state());
    }
    session.load().await?;
    let expected = session
        .remove::<GitHubOAuthState>(GITHUB_OAUTH_STATE_KEY)
        .await?
        .ok_or_else(invalid_state)?;

    // Persist consumption before any token exchange, including failed callbacks.
    session.save().await?;
    let supplied = supplied_state.filter(|state| !state.is_empty());
    let valid = supplied.is_some_and(|state| {
        // Hashing avoids exposing matching prefixes of the secret through timing.
        Sha256::digest(state.as_bytes()) == Sha256::digest(expected.secret.as_bytes())
    });
    if !valid || expected.expires_at <= chrono::Utc::now().timestamp() {
        return Err(invalid_state());
    }
    Ok(())
}

#[derive(Debug, serde::Deserialize)]
pub struct AuthCallbackQueryParams {
    code: AuthorizationCode,
    state: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct GitHubUserInfo {
    id: i64,
    avatar_url: String,
    email: Option<String>,
    name: Option<String>,
}
#[derive(Debug, serde::Deserialize)]
pub struct GitHubUserEmail {
    email: String,
    primary: bool,
    verified: bool,
}

pub async fn github_handler(
    session: Session,
    jar: PrivateCookieJar,
    Extension(github_client): Extension<GitHubClient>,
    Extension(http_client): Extension<Client>,
    State(server_state): State<ServerState>,
    Query(params): Query<AuthCallbackQueryParams>,
) -> Result<impl IntoResponse, Error> {
    let AuthCallbackQueryParams { code, state } = params;
    if !server_state.env_vars.mock_auth {
        consume_github_oauth_state(&session, state.as_deref()).await?;
    }

    let (token, access_token) = get_access_token(
        code,
        &github_client,
        &http_client,
        server_state.env_vars.mock_auth,
    )
    .await?;

    let github_user_info =
        get_github_user_info(&access_token, &http_client, server_state.env_vars.mock_auth).await?;

    let email = match github_user_info.email {
        Some(email) => email,
        None => {
            let emails = get_github_user_emails(
                &access_token,
                &http_client,
                server_state.env_vars.mock_auth,
            )
            .await?;
            let email =
                emails
                    .into_iter()
                    .find(|e| e.verified && e.primary)
                    .ok_or(Error::Server(
                        StatusCode::UNAUTHORIZED,
                        format!("no verified and primary emails associated with GitHub"),
                    ))?;
            email.email
        }
    };

    // If mocking auth, add camperbot user to database
    if server_state.env_vars.mock_auth {
        let mock_user = prisma::ExamCreatorUser {
            id: ObjectId::parse_str("685d2e1c178564e7b9045589")
                .expect("Unreachable. development static string"),
            name: "Camperbot".to_string(),
            github_id: None,
            picture: None,
            email: "camperbot@freecodecamp.org".to_string(),
            settings: prisma::ExamCreatorUserSettings::default(),
            version: 1,
        };
        let res = server_state
            .production_database
            .exam_creator_user
            .insert_one(mock_user)
            .await;

        match res {
            Ok(_insert_result) => {
                info!("Camperbot user inserted into database");
            }
            Err(e) => {
                error!("{:?}", e);
            }
        }
    }

    // TEMP: User email must be in database
    let user = server_state
        .production_database
        .exam_creator_user
        .find_one(doc! {"email": &email})
        .await?;

    let Some(user) = user else {
        warn!({ email }, "login attempt for non-existent user");
        sentry::metrics::counter("auth.login", 1)
            .attribute("outcome", "unauthorized")
            .capture();
        return Err(Error::Server(
            StatusCode::UNAUTHORIZED,
            format!("user non-existent: {email}"),
        ));
    };

    // Update user picture
    server_state
        .production_database
        .exam_creator_user
        .update_one(
            doc! {"_id": user.id},
            doc! {"$set": {"picture": github_user_info.avatar_url}},
        )
        .await?;

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

    sentry::metrics::counter("auth.login", 1)
        .attribute("outcome", "success")
        .capture();

    let cookie = Cookie::build(("sid", session.session_id))
        // .domain("http://127.0.0.1:3001")
        .path("/")
        .secure(!cfg!(debug_assertions))
        .http_only(true)
        .same_site(SameSite::Lax)
        .max_age(expires_in.try_into()?);

    return Ok(jar.add(cookie));
}

async fn get_github_user_info(
    access_token: &str,
    http_client: &Client,
    mock_auth: bool,
) -> Result<GitHubUserInfo, Error> {
    if mock_auth {
        let github_user_info = GitHubUserInfo {
            id: 0,
            avatar_url: "".to_string(),
            email: Some("camperbot@freecodecamp.org".to_string()),
            name: Some("Camperbot".to_string()),
        };

        return Ok(github_user_info);
    }

    let user_info_request = http_client
        .get("https://api.github.com/user")
        .bearer_auth(access_token)
        .header(USER_AGENT, "Exam Creator (local)")
        // .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header(ACCEPT, "application/vnd.github+json");

    let user_info_res = user_info_request.send().await?;
    let res = user_info_res.error_for_status()?;
    let github_user_info: GitHubUserInfo = res.json().await?;
    info!(
        "{} {:?} {:?} {}",
        github_user_info.id,
        github_user_info.email,
        github_user_info.name,
        github_user_info.avatar_url
    );

    Ok(github_user_info)
}

async fn get_github_user_emails(
    access_token: &str,
    http_client: &Client,
    mock_auth: bool,
) -> Result<Vec<GitHubUserEmail>, Error> {
    if mock_auth {
        let github_user_email = GitHubUserEmail {
            email: "camperbot@freecodecamp.org".to_string(),
            primary: true,
            verified: true,
        };

        return Ok(vec![github_user_email]);
    }

    let user_emails_request = http_client
        .get("https://api.github.com/user/emails")
        .bearer_auth(&access_token)
        .header(USER_AGENT, "Exam Creator (local)")
        // .header(AUTHORIZATION, format!("Bearer {access_token}"))
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header(ACCEPT, "application/vnd.github+json");

    let user_emails_res = user_emails_request.send().await?;
    let res = user_emails_res.error_for_status()?;
    let emails: Vec<GitHubUserEmail> = res.json().await?;

    Ok(emails)
}

async fn get_access_token(
    code: AuthorizationCode,
    github_client: &GitHubClient,
    http_client: &Client,
    mock_auth: bool,
) -> Result<
    (
        StandardTokenResponse<EmptyExtraTokenFields, BasicTokenType>,
        String,
    ),
    Error,
> {
    if mock_auth {
        let access_token = String::from("camperbot-access-token");
        let token = StandardTokenResponse::new(
            AccessToken::new(access_token.clone()),
            BasicTokenType::Bearer,
            EmptyExtraTokenFields {},
        );
        return Ok((token, access_token));
    }

    // Request access token from GitHub
    let token = github_client
        .exchange_code(code)
        .request_async(http_client)
        .await
        .map_err(|e| Error::Server(StatusCode::INTERNAL_SERVER_ERROR, format!("{e}")))?;
    // Check granted scopes includes necessary information:
    // https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authenticating-to-the-rest-api-with-an-oauth-app#checking-granted-scopes
    let scopes = token.scopes().ok_or(Error::Server(
        StatusCode::UNAUTHORIZED,
        format!("No scopes provided in GitHub auth"),
    ))?;

    let scopes = scopes
        .iter()
        .flat_map(|comma_separated| comma_separated.split(','))
        .collect::<Vec<_>>();
    // if !scopes.contains(&"user") {
    if !scopes.contains(&"read:user") || !scopes.contains(&"user:email") {
        info!("Bad scopes: {:?}", scopes);
        return Err(Error::Server(
            StatusCode::UNAUTHORIZED,
            format!("Insufficient scopes: {scopes:?}"),
        ));
    }

    let access_token = token.access_token().secret().to_owned();
    Ok((token, access_token))
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use oauth2::{AuthUrl, ClientId, TokenUrl};
    use tower_sessions::MemoryStore;

    use super::*;

    fn github_client() -> GitHubClient {
        BasicClient::new(ClientId::new("test-client".to_string()))
            .set_auth_uri(
                AuthUrl::new("https://github.com/login/oauth/authorize".to_string()).unwrap(),
            )
            .set_token_uri(
                TokenUrl::new("https://github.com/login/oauth/access_token".to_string()).unwrap(),
            )
    }

    async fn start_login(session: &Session) -> String {
        let response = begin_github_authorization(session, &github_client())
            .await
            .unwrap()
            .into_response();
        let url = Url::parse(response.headers()[http::header::LOCATION].to_str().unwrap()).unwrap();
        assert_eq!(url.host_str(), Some("github.com"));
        let state = url
            .query_pairs()
            .find(|(name, _)| name == "state")
            .unwrap()
            .1
            .into_owned();
        assert!(!state.is_empty());
        state
    }

    fn assert_invalid(result: Result<(), Error>) {
        assert_eq!(
            StatusCode::from(result.unwrap_err()),
            StatusCode::BAD_REQUEST
        );
    }

    #[tokio::test]
    async fn oauth_state_is_bound_to_session_and_consumed_across_requests() {
        let store = Arc::new(MemoryStore::default());
        let login_session = Session::new(None, store.clone(), None);
        let state = start_login(&login_session).await;
        let other_browser = Session::new(None, store.clone(), None);
        assert_invalid(consume_github_oauth_state(&other_browser, Some(&state)).await);

        let callback_session = Session::new(login_session.id(), store.clone(), None);
        consume_github_oauth_state(&callback_session, Some(&state))
            .await
            .unwrap();
        let replay_session = Session::new(login_session.id(), store, None);
        assert_invalid(consume_github_oauth_state(&replay_session, Some(&state)).await);
    }

    #[tokio::test]
    async fn oauth_state_rejects_missing_empty_and_mismatched_callbacks() {
        for supplied_state in [None, Some(""), Some("incorrect-state")] {
            let store = Arc::new(MemoryStore::default());
            let login_session = Session::new(None, store.clone(), None);
            let state = start_login(&login_session).await;
            let callback_session = Session::new(login_session.id(), store.clone(), None);
            assert_invalid(consume_github_oauth_state(&callback_session, supplied_state).await);
            let retry_session = Session::new(login_session.id(), store, None);
            assert_invalid(consume_github_oauth_state(&retry_session, Some(&state)).await);
        }
    }

    #[tokio::test]
    async fn oauth_state_expires_and_cannot_be_retried() {
        let store = Arc::new(MemoryStore::default());
        let login_session = Session::new(None, store.clone(), None);
        let state = start_login(&login_session).await;
        login_session
            .insert(
                GITHUB_OAUTH_STATE_KEY,
                GitHubOAuthState {
                    secret: state.clone(),
                    expires_at: chrono::Utc::now().timestamp() - 1,
                },
            )
            .await
            .unwrap();
        login_session.save().await.unwrap();
        let callback_session = Session::new(login_session.id(), store.clone(), None);
        assert_invalid(consume_github_oauth_state(&callback_session, Some(&state)).await);
        let retry_session = Session::new(login_session.id(), store, None);
        assert_invalid(consume_github_oauth_state(&retry_session, Some(&state)).await);
    }

    #[tokio::test]
    async fn oauth_state_new_login_uses_a_fresh_secret() {
        let store = Arc::new(MemoryStore::default());
        let login_session = Session::new(None, store.clone(), None);
        let first_state = start_login(&login_session).await;
        let second_state = start_login(&login_session).await;
        assert_ne!(first_state, second_state);
        let saved = login_session
            .get::<GitHubOAuthState>(GITHUB_OAUTH_STATE_KEY)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(saved.secret, second_state);
        assert!(saved.expires_at > chrono::Utc::now().timestamp());
        let callback_session = Session::new(login_session.id(), store, None);
        assert_invalid(consume_github_oauth_state(&callback_session, Some(&first_state)).await);
    }

    #[tokio::test]
    async fn oauth_state_concurrent_callbacks_accept_only_one_request() {
        let store = Arc::new(MemoryStore::default());
        let login_session = Session::new(None, store.clone(), None);
        let state = start_login(&login_session).await;
        let first_callback = Session::new(login_session.id(), store.clone(), None);
        let second_callback = Session::new(login_session.id(), store, None);
        // Simulate two requests that both read the pending login before validation.
        first_callback.load().await.unwrap();
        second_callback.load().await.unwrap();
        let (first, second) = tokio::join!(
            consume_github_oauth_state(&first_callback, Some(&state)),
            consume_github_oauth_state(&second_callback, Some(&state)),
        );
        assert_eq!(usize::from(first.is_ok()) + usize::from(second.is_ok()), 1);
        if first.is_err() {
            assert_invalid(first);
        } else {
            assert_invalid(second);
        }
    }
}
