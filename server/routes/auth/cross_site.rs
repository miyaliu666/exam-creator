//! Short-lived, single-use login handoffs and WebSocket tickets for a fixed SPA origin.
//! App bearer tokens are random and only their digest is stored in MongoDB.
use std::{
    collections::HashMap,
    sync::{LazyLock, Mutex},
    time::{Duration, Instant},
};

use axum::{
    Json,
    extract::State,
    response::{IntoResponse, Response},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, Mac};
use http::{
    HeaderMap, StatusCode,
    header::{AUTHORIZATION, CACHE_CONTROL, ORIGIN},
};
use mongodb::bson::{doc, oid::ObjectId};
use oauth2::CsrfToken;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use url::Url;

use crate::{database::prisma, errors::Error, state::ServerState};

const HANDOFF_TTL: Duration = Duration::from_secs(120);
const SOCKET_TTL: Duration = Duration::from_secs(30);
const MAX_TICKETS: usize = 10_000;

#[derive(Clone, Debug)]
pub struct FrontendUrl(Url);

impl FrontendUrl {
    pub fn parse(value: &str) -> Result<Self, &'static str> {
        let mut url =
            Url::parse(value).map_err(|_| "FRONTEND_URL must be an absolute HTTPS URL")?;
        if url.scheme() != "https"
            || url.host_str().is_none()
            || !url.username().is_empty()
            || url.password().is_some()
            || url.query().is_some()
            || url.fragment().is_some()
        {
            return Err("FRONTEND_URL must be HTTPS without credentials, query or fragment");
        }
        let path = format!("{}/", url.path().trim_end_matches('/'));
        url.set_path(&path);
        Ok(Self(url))
    }

    pub fn origin(&self) -> String {
        self.0.origin().ascii_serialization()
    }

    pub fn callback(&self, name: &str, value: &str) -> Url {
        let mut url = self
            .0
            .join("auth/callback/github")
            .expect("fixed relative callback path");
        url.query_pairs_mut().append_pair(name, value);
        url
    }

    pub fn require_origin(&self, headers: &HeaderMap) -> Result<(), Error> {
        if headers.get(ORIGIN).and_then(|value| value.to_str().ok()) != Some(self.origin().as_str())
        {
            return Err(Error::Server(
                StatusCode::FORBIDDEN,
                "This sign-in origin is not allowed".into(),
            ));
        }
        Ok(())
    }
}

pub fn secret_matches(expected: &[u8], supplied: &[u8]) -> bool {
    // HMAC's verify_slice performs a constant-time comparison of fixed-size tags.
    let mut expected_mac =
        Hmac::<Sha256>::new_from_slice(b"exam-creator-auth-comparison-v1").unwrap();
    expected_mac.update(expected);
    let mut supplied_mac =
        Hmac::<Sha256>::new_from_slice(b"exam-creator-auth-comparison-v1").unwrap();
    supplied_mac.update(supplied);
    expected_mac
        .verify_slice(&supplied_mac.finalize().into_bytes())
        .is_ok()
}

pub fn valid_challenge(value: &str) -> bool {
    value.len() == 43
        && URL_SAFE_NO_PAD
            .decode(value)
            .is_ok_and(|bytes| bytes.len() == 32)
}

fn valid_verifier(value: &str) -> bool {
    (43..=128).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-._~".contains(&byte))
}

fn challenge_matches(challenge: &str, verifier: &str) -> bool {
    valid_verifier(verifier)
        && secret_matches(
            challenge.as_bytes(),
            URL_SAFE_NO_PAD.encode(Sha256::digest(verifier)).as_bytes(),
        )
}

fn token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}
fn random_token() -> String {
    CsrfToken::new_random_len(32).into_secret()
}
fn invalid_ticket() -> Error {
    Error::Server(
        StatusCode::UNAUTHORIZED,
        "Sign-in expired or was already used. Please sign in again.".into(),
    )
}

struct Expiring<T> {
    value: T,
    expires_at: Instant,
}
struct OneTime<T> {
    entries: HashMap<String, Expiring<T>>,
}
impl<T> Default for OneTime<T> {
    fn default() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }
}
impl<T> OneTime<T> {
    fn issue(&mut self, value: T, ttl: Duration, now: Instant) -> Result<String, Error> {
        self.entries.retain(|_, entry| entry.expires_at > now);
        if self.entries.len() >= MAX_TICKETS {
            return Err(Error::Server(
                StatusCode::TOO_MANY_REQUESTS,
                "Please retry sign-in shortly".into(),
            ));
        }
        let token = random_token();
        self.entries.insert(
            token_hash(&token),
            Expiring {
                value,
                expires_at: now + ttl,
            },
        );
        Ok(token)
    }
    fn take(&mut self, token: &str, now: Instant) -> Option<T> {
        if token.len() != 43 {
            return None;
        }
        self.entries
            .remove(&token_hash(token))
            .filter(|entry| entry.expires_at > now)
            .map(|entry| entry.value)
    }
}

struct LoginHandoff {
    user_id: ObjectId,
    challenge: String,
}
static HANDOFFS: LazyLock<Mutex<OneTime<LoginHandoff>>> =
    LazyLock::new(|| Mutex::new(OneTime::default()));
pub fn issue_handoff(user_id: ObjectId, challenge: String) -> Result<String, Error> {
    HANDOFFS.lock().unwrap().issue(
        LoginHandoff { user_id, challenge },
        HANDOFF_TTL,
        Instant::now(),
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExchangeBody {
    code: String,
    code_verifier: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExchangeResult {
    access_token: String,
    expires_at: String,
}

pub async fn exchange(
    headers: HeaderMap,
    State(state): State<ServerState>,
    Json(body): Json<ExchangeBody>,
) -> Result<Response, Error> {
    let frontend = state
        .env_vars
        .frontend_url
        .as_ref()
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Not found".into()))?;
    frontend.require_origin(&headers)?;
    // Remove before verification. One code permits one attempt, including invalid verifiers.
    let handoff = HANDOFFS
        .lock()
        .unwrap()
        .take(&body.code, Instant::now())
        .ok_or_else(invalid_ticket)?;
    if !challenge_matches(&handoff.challenge, &body.code_verifier) {
        return Err(invalid_ticket());
    }
    let user = state
        .production_database
        .exam_creator_user
        .find_one(doc! { "_id": handoff.user_id })
        .await?
        .ok_or_else(invalid_ticket)?;
    let access_token = format!("ec_{}", random_token());
    let expires_at = chrono::Utc::now() + Duration::from_secs(state.env_vars.session_ttl_in_s);
    let app_session = prisma::ExamCreatorSession {
        id: ObjectId::new(),
        user_id: user.id,
        session_id: bearer_session_key(&access_token).expect("generated app token"),
        expires_at: expires_at.into(),
        version: 2,
    };
    state
        .production_database
        .exam_creator_session
        .insert_one(app_session)
        .await?;
    let mut response = Json(ExchangeResult {
        access_token,
        expires_at: expires_at.to_rfc3339(),
    })
    .into_response();
    response
        .headers_mut()
        .insert(CACHE_CONTROL, "no-store".parse().unwrap());
    Ok(response)
}

/// Presenting an Authorization header never falls back to a cookie.
pub fn bearer_session_key(token: &str) -> Option<String> {
    let random = token.strip_prefix("ec_")?;
    if random.len() != 43
        || !URL_SAFE_NO_PAD
            .decode(random)
            .is_ok_and(|bytes| bytes.len() == 32)
    {
        return None;
    }
    Some(format!("app-sha256:{}", token_hash(token)))
}

pub fn bearer_from_headers(headers: &HeaderMap) -> Result<Option<String>, Error> {
    let Some(header) = headers.get(AUTHORIZATION) else {
        return Ok(None);
    };
    let value = header
        .to_str()
        .ok()
        .and_then(|value| value.strip_prefix("Bearer "))
        .and_then(bearer_session_key)
        .ok_or_else(invalid_ticket)?;
    Ok(Some(value))
}

#[derive(Clone)]
pub struct AuthenticatedSession {
    pub id: ObjectId,
    pub bearer: bool,
}
struct SocketTicket {
    session_id: ObjectId,
    allowed_origins: Vec<String>,
}
static SOCKET_TICKETS: LazyLock<Mutex<OneTime<SocketTicket>>> =
    LazyLock::new(|| Mutex::new(OneTime::default()));

pub fn issue_socket_ticket(
    state: &ServerState,
    session: &AuthenticatedSession,
) -> Result<String, Error> {
    let allowed_origins = if session.bearer {
        vec![
            state
                .env_vars
                .frontend_url
                .as_ref()
                .ok_or_else(invalid_ticket)?
                .origin(),
        ]
    } else {
        let mut origins: Vec<String> = state
            .env_vars
            .allowed_origins
            .iter()
            .filter_map(|value| value.to_str().ok().map(str::to_owned))
            .collect();
        if let Ok(url) = Url::parse(&state.env_vars.github_redirect_url) {
            origins.push(url.origin().ascii_serialization());
        }
        origins
    };
    SOCKET_TICKETS.lock().unwrap().issue(
        SocketTicket {
            session_id: session.id,
            allowed_origins,
        },
        SOCKET_TTL,
        Instant::now(),
    )
}

pub fn consume_socket_ticket(token: &str, headers: &HeaderMap) -> Result<ObjectId, Error> {
    let ticket = SOCKET_TICKETS
        .lock()
        .unwrap()
        .take(token, Instant::now())
        .ok_or_else(invalid_ticket)?;
    let origin = headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(invalid_ticket)?;
    if !ticket
        .allowed_origins
        .iter()
        .any(|allowed| allowed == origin)
    {
        return Err(invalid_ticket());
    }
    Ok(ticket.session_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;

    #[test]
    fn pkce_matches_rfc7636_vector_and_rejects_plain_or_malformed_verifiers() {
        let challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
        let verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
        assert!(valid_challenge(challenge));
        assert!(challenge_matches(challenge, verifier));
        assert!(!challenge_matches(challenge, challenge));
        assert!(!challenge_matches(challenge, &format!("{verifier}!")));
        assert!(!challenge_matches(challenge, "short"));
        assert!(!valid_challenge(&format!("{challenge}=")));
    }

    #[test]
    fn fixed_frontend_preserves_pages_base_and_rejects_untrusted_origins() {
        let frontend = FrontendUrl::parse("https://owner.github.io/exam-creator").unwrap();
        assert_eq!(
            frontend.callback("login_code", "a&b").as_str(),
            "https://owner.github.io/exam-creator/auth/callback/github?login_code=a%26b"
        );
        for value in [
            "http://owner.github.io",
            "https://user:pass@owner.github.io",
            "https://owner.github.io/?next=evil",
            "https://owner.github.io/#callback",
        ] {
            assert!(FrontendUrl::parse(value).is_err());
        }
        let mut headers = HeaderMap::new();
        assert!(frontend.require_origin(&headers).is_err());
        for value in [
            "null",
            "https://owner.github.io.evil.example",
            "https://evil.github.io",
            "https://owner.github.io:8443",
        ] {
            headers.insert(ORIGIN, value.parse().unwrap());
            assert!(frontend.require_origin(&headers).is_err());
        }
        headers.insert(ORIGIN, "https://owner.github.io".parse().unwrap());
        assert!(frontend.require_origin(&headers).is_ok());
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
    async fn concurrent_redemption_has_exactly_one_winner() {
        let store = Arc::new(Mutex::new(OneTime::default()));
        let token = store
            .lock()
            .unwrap()
            .issue(7, HANDOFF_TTL, Instant::now())
            .unwrap();
        let barrier = Arc::new(tokio::sync::Barrier::new(16));
        let mut tasks = Vec::new();
        for _ in 0..16 {
            let (store, token, barrier) = (store.clone(), token.clone(), barrier.clone());
            tasks.push(tokio::spawn(async move {
                barrier.wait().await;
                store.lock().unwrap().take(&token, Instant::now())
            }));
        }
        let mut accepted = 0;
        for task in tasks {
            if task.await.unwrap() == Some(7) {
                accepted += 1;
            }
        }
        assert_eq!(accepted, 1);
    }

    #[test]
    fn ticket_expiry_failed_proof_and_replay_cannot_issue_a_session() {
        let mut store = OneTime::default();
        let now = Instant::now();
        let code = store.issue("proof", HANDOFF_TTL, now).unwrap();
        assert!(store.take(&code, now + HANDOFF_TTL).is_none());
        let code = store.issue("proof", HANDOFF_TTL, now).unwrap();
        let expected = store.take(&code, now).unwrap();
        assert!(!challenge_matches(expected, "wrong"));
        assert!(store.take(&code, now).is_none());
        let code = store.issue("socket", SOCKET_TTL, now).unwrap();
        assert!(store.take(&code, now + SOCKET_TTL).is_none());
    }

    #[test]
    fn bearer_credentials_are_distinct_random_app_secrets_and_stored_as_digests() {
        let token = format!("ec_{}", random_token());
        let key = bearer_session_key(&token).unwrap();
        assert!(!key.contains(&token));
        assert!(key.starts_with("app-sha256:"));
        assert!(bearer_session_key("gho_example_github_token").is_none());
        assert!(bearer_session_key(&key).is_none());
        let mut headers = HeaderMap::new();
        headers.insert(AUTHORIZATION, "Basic bad".parse().unwrap());
        assert!(bearer_from_headers(&headers).is_err());
        assert!(secret_matches(b"secret", b"secret"));
        assert!(!secret_matches(b"secret", b"secreu"));
    }
}
