use axum::extract::MatchedPath;
use axum::extract::Request;
use axum::routing::delete;
use axum::routing::patch;
use axum::{
    Extension, Router,
    routing::{any, get, post, put},
};
use axum_extra::extract::cookie::Key;
use http::StatusCode;
use http::header::ACCEPT;
use http::header::AUTHORIZATION;
use http::header::ORIGIN;
use http::header::SET_COOKIE;
use http::header::X_CONTENT_TYPE_OPTIONS;
use mongodb::options::ClientOptions;
use oauth2::{AuthUrl, ClientId, ClientSecret, RedirectUrl, TokenUrl, basic::BasicClient};
use reqwest::Method;
use sentry::integrations::tower::{NewSentryLayer, SentryHttpLayer};
use std::sync::{Arc, Mutex};
use supabase_rs::SupabaseClient;
use tower_http::limit::RequestBodyLimitLayer;
use tower_http::timeout::TimeoutLayer;
use tower_http::trace::TraceLayer;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
};
use tower_sessions::{Expiry, MemoryStore, SessionManagerLayer};
use tracing::info;
use tracing::warn;

use crate::errors::Error;
use crate::state::Cache;
use crate::{
    database, extractor, routes,
    state::{self, ClientSync, ServerState},
};

use crate::config::EnvVars;

pub async fn app(env_vars: EnvVars) -> Result<Router, Error> {
    info!("Creating app...");
    let mut production_client_options = ClientOptions::parse(&env_vars.mongodb_uri_production)
        .await
        .unwrap();
    production_client_options.app_name = Some("Exam Creator".to_string());
    let mut staging_client_options = ClientOptions::parse(&env_vars.mongodb_uri_staging)
        .await
        .unwrap();
    staging_client_options.app_name = Some("Exam Creator".to_string());

    let production_client = mongodb::Client::with_options(production_client_options).unwrap();
    let staging_client = mongodb::Client::with_options(staging_client_options).unwrap();

    // Ensure database is defined in URI with `/<database_name>`
    let production_database = production_client
        .default_database()
        .expect("database must be defined in the MONGODB_URI_PRODUCTION URI");
    let staging_mongodb_database = staging_client
        .default_database()
        .expect("database must be defined in the MONGODB_URI_STAGING URI");

    let session_store = MemoryStore::default();
    let session_layer = SessionManagerLayer::new(session_store)
        .with_secure(false)
        .with_expiry(Expiry::OnInactivity(time::Duration::seconds(
            env_vars.session_ttl_in_s.try_into().unwrap_or(i64::MAX),
        )));

    let production_database = database::Database {
        user: production_database.collection("user"),
        exam_creator_exam: production_database.collection("ExamCreatorExam"),
        exam: production_database.collection("ExamEnvironmentExam"),
        exam_attempt: production_database.collection("ExamEnvironmentExamAttempt"),
        exam_environment_challenge: production_database.collection("ExamEnvironmentChallenge"),
        generated_exam: production_database.collection("ExamEnvironmentGeneratedExam"),
        exam_creator_user: production_database.collection("ExamCreatorUser"),
        exam_creator_session: production_database.collection("ExamCreatorSession"),
        exam_environment_exam_moderation: production_database
            .collection("ExamEnvironmentExamModeration"),
    };

    let staging_database = database::Database {
        user: staging_mongodb_database.collection("user"),
        exam_creator_exam: staging_mongodb_database.collection("ExamCreatorExam"),
        exam: staging_mongodb_database.collection("ExamEnvironmentExam"),
        exam_attempt: staging_mongodb_database.collection("ExamEnvironmentExamAttempt"),
        exam_environment_challenge: staging_mongodb_database.collection("ExamEnvironmentChallenge"),
        generated_exam: staging_mongodb_database.collection("ExamEnvironmentGeneratedExam"),
        // Should not be used
        exam_creator_user: staging_mongodb_database.collection("ExamCreatorUser"),
        // Should not be used
        exam_creator_session: staging_mongodb_database.collection("ExamCreatorSession"),
        exam_environment_exam_moderation: staging_mongodb_database
            .collection("ExamEnvironmentExamModeration"),
    };

    let workbench_database = database::WorkbenchDatabase {
        registry_versions: staging_mongodb_database
            .collection("LanguageAssessmentRegistryVersions"),
        registry_audit_events: staging_mongodb_database
            .collection("LanguageAssessmentRegistryAuditEvents"),
        language_items: staging_mongodb_database.collection("LanguageItems"),
        versions: staging_mongodb_database.collection("LanguageItemVersions"),
        ai_generation_runs: staging_mongodb_database.collection("LanguageItemAiRuns"),
        ai_review_runs: staging_mongodb_database.collection("LanguageItemAiReviewRuns"),
        reviews: staging_mongodb_database.collection("LanguageItemReviews"),
        review_discussions: staging_mongodb_database.collection("LanguageItemReviewDiscussions"),
        review_discussion_events: staging_mongodb_database
            .collection("LanguageItemReviewDiscussionEvents"),
        exports: staging_mongodb_database.collection("LanguageItemExports"),
        audit_events: staging_mongodb_database.collection("LanguageItemAuditEvents"),
        github_sync_deliveries: staging_mongodb_database
            .collection("LanguageItemGithubSyncDeliveries"),
        staging_items: staging_mongodb_database.collection("LanguageItemStaging"),
    };
    workbench_database.ensure_indexes().await?;
    crate::language_items::registry_store::initialize(&workbench_database).await?;
    let interrupted_at = chrono::Utc::now().to_rfc3339();
    workbench_database
        .ai_generation_runs
        .update_many(
            mongodb::bson::doc! { "status": { "$in": ["queued", "running"] } },
            mongodb::bson::doc! { "$set": {
                "status": "failed",
                "error": "The server restarted before this AI run completed. Start a new run.",
                "updatedAt": &interrupted_at,
                "completedAt": &interrupted_at,
            } },
        )
        .await?;
    workbench_database
        .github_sync_deliveries
        .update_many(
            mongodb::bson::doc! { "status": { "$in": ["queued", "running"] } },
            mongodb::bson::doc! { "$set": {
                "status": "failed",
                "error": "The server restarted before this GitHub synchronization completed. Automatic sync will retry when configured; Sync PRs remains available.",
                "updatedAt": &interrupted_at,
                "completedAt": &interrupted_at,
            } },
        )
        .await?;

    let client_sync = Arc::new(Mutex::new(ClientSync {
        users: Vec::new(),
        exams: Vec::new(),
    }));

    let exam_metrics_by_id_cache = Arc::new(Mutex::new(vec![]));
    let attempt_metrics_cache = Arc::new(Mutex::new(Cache::new()));
    let pending_deletes = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let pending_merges = Arc::new(Mutex::new(std::collections::HashMap::new()));
    let attempt_page_views = Arc::new(Mutex::new(std::collections::HashMap::new()));

    let supabase_url = &env_vars.supabase_url;
    let supabase_key = &env_vars.supabase_key;
    let supabase = SupabaseClient::new(supabase_url, supabase_key)?;

    let server_state = ServerState {
        production_database,
        staging_database,
        workbench_database,
        supabase,
        client_sync,
        key: Key::from(env_vars.cookie_key.as_bytes()),
        env_vars: env_vars.clone(),
        exam_metrics_by_id_cache,
        attempt_metrics_cache,
        pending_deletes,
        pending_merges,
        attempt_page_views,
    };

    tokio::spawn(state::cleanup_online_users(
        Arc::clone(&server_state.client_sync),
        std::time::Duration::from_secs(5 * 60),
    ));

    let cors = CorsLayer::new()
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::PATCH,
            Method::CONNECT,
            Method::DELETE,
        ])
        .allow_headers([
            AUTHORIZATION,
            ACCEPT,
            ORIGIN,
            X_CONTENT_TYPE_OPTIONS,
            SET_COOKIE,
        ])
        .allow_credentials(true)
        .allow_origin(env_vars.allowed_origins);

    let github_client_id = ClientId::new(env_vars.github_client_id);

    let github_client_secret = ClientSecret::new(env_vars.github_client_secret);

    let auth_url = AuthUrl::new("https://github.com/login/oauth/authorize".to_string())?;
    let token_url = TokenUrl::new("https://github.com/login/oauth/access_token".to_string())?;

    // Set up the config for the GitHub OAuth2 process.
    let github_client = BasicClient::new(github_client_id)
        .set_client_secret(github_client_secret)
        .set_auth_uri(auth_url)
        .set_token_uri(token_url)
        .set_redirect_uri(RedirectUrl::new(env_vars.github_redirect_url)?);

    let http_client = reqwest::ClientBuilder::new()
        // Following redirects opens the client up to SSRF vulnerabilities.
        .redirect(reqwest::redirect::Policy::none())
        .build()?;

    routes::language_item_github::start_github_sync_worker(
        server_state.clone(),
        http_client.clone(),
    );

    let app = if cfg!(debug_assertions) && env_vars.mock_auth {
        warn!("Debug assertions are enabled; adding dev login route.");
        Router::new().route("/auth/login/dev", post(routes::auth::post_dev_login))
    } else {
        Router::new()
    };

    let app = app
        .route(
            "/auth/login/dev/status",
            get(routes::auth::get_dev_login_status),
        )
        .route("/api/exams", get(routes::exams::get_exams))
        .route(
            "/api/language-items/registry",
            get(routes::language_items::get_registry),
        )
        .route(
            "/api/language-items/registry/{registry_version}",
            get(routes::language_items::get_registry_version),
        )
        .route(
            "/api/language-assessment/registry/active",
            get(routes::language_assessment_settings::get_active),
        )
        .route(
            "/api/language-assessment/registry/versions",
            get(routes::language_assessment_settings::get_versions),
        )
        .route(
            "/api/language-assessment/registry/versions/{version_id}",
            get(routes::language_assessment_settings::get_version),
        )
        .route(
            "/api/language-assessment/registry/versions/{version_id}/audit",
            get(routes::language_assessment_settings::get_audit),
        )
        .route(
            "/api/language-assessment/registry/drafts",
            post(routes::language_assessment_settings::post_draft),
        )
        .route(
            "/api/language-assessment/registry/drafts/{version_id}",
            put(routes::language_assessment_settings::put_draft),
        )
        .route(
            "/api/language-assessment/registry/drafts/{version_id}/validate",
            post(routes::language_assessment_settings::post_validate),
        )
        .route(
            "/api/language-assessment/registry/drafts/{version_id}/impact",
            get(routes::language_assessment_settings::get_impact),
        )
        .route(
            "/api/language-assessment/registry/drafts/{version_id}/publish",
            post(routes::language_assessment_settings::post_publish),
        )
        .route(
            "/api/language-items/ai-provider",
            get(routes::language_items::get_ai_provider_status),
        )
        .route(
            "/api/language-items/github-review/status",
            get(routes::language_item_github::get_status),
        )
        .route(
            "/api/integrations/github/webhook",
            post(routes::language_item_github::post_webhook),
        )
        .route(
            "/api/language-items/github-review/batches",
            post(routes::language_item_github::post_batch),
        )
        .route(
            "/api/language-items/github-review/batches/{batch_id}/sync",
            post(routes::language_item_github::post_sync_batch),
        )
        .route(
            "/api/language-items",
            get(routes::language_items::get_items).post(routes::language_items::post_item),
        )
        .route(
            "/api/language-item-review-queue",
            get(routes::language_items::get_review_queue),
        )
        .route(
            "/api/language-items/{item_id}",
            get(routes::language_items::get_item).delete(routes::language_items::delete_item),
        )
        .route(
            "/api/language-items/{item_id}/record-state",
            put(routes::language_items::put_record_state),
        )
        .route(
            "/api/language-items/{item_id}/preview",
            get(routes::language_items::get_candidate_preview),
        )
        .route(
            "/api/language-items/{item_id}/draft",
            put(routes::language_items::put_draft),
        )
        .route(
            "/api/language-items/{item_id}/validate",
            post(routes::language_items::post_validate),
        )
        .route(
            "/api/language-items/{item_id}/versions",
            get(routes::language_items::get_versions).post(routes::language_items::post_version),
        )
        .route(
            "/api/language-items/{item_id}/exports",
            get(routes::language_items::get_exports),
        )
        .route(
            "/api/language-items/{item_id}/audit",
            get(routes::language_items::get_audit_events),
        )
        .route(
            "/api/language-items/{item_id}/review-discussions",
            get(routes::language_items::get_review_discussions),
        )
        .route(
            "/api/language-items/{item_id}/ai-runs",
            get(routes::language_items::get_ai_runs)
                .post(routes::language_items::post_ai_generation),
        )
        .route(
            "/api/language-items/{item_id}/ai-review",
            get(routes::language_items::get_draft_ai_reviews)
                .post(routes::language_items::post_draft_ai_review),
        )
        .route(
            "/api/language-items/{item_id}/ai-runs/{run_id}/candidates/{candidate_id}/adopt",
            post(routes::language_items::post_adopt_candidate),
        )
        .route(
            "/api/language-item-versions/{version_id}/ai-review",
            get(routes::language_items::get_ai_reviews)
                .post(routes::language_items::post_ai_review),
        )
        .route(
            "/api/language-item-versions/{version_id}/diff",
            get(routes::language_item_diffs::get_version_diff),
        )
        .route(
            "/api/language-item-versions/{version_id}/reviews",
            get(routes::language_items::get_reviews).post(routes::language_items::post_review),
        )
        .route(
            "/api/language-item-versions/{version_id}/review-discussions",
            post(routes::language_items::post_review_discussion),
        )
        .route(
            "/api/language-item-review-discussions/{discussion_id}/events",
            post(routes::language_items::post_review_discussion_event),
        )
        .route(
            "/api/language-item-versions/{version_id}/revise",
            post(routes::language_items::post_revise_version),
        )
        .route(
            "/api/language-item-versions/{version_id}/exports/staging",
            post(routes::language_items::post_staging_export),
        )
        .route(
            "/api/language-item-versions/{version_id}/exports/production",
            post(routes::language_items::post_production_export),
        )
        .route("/api/exams", post(routes::exams::post_exam))
        .route("/api/exams/{exam_id}", get(routes::exams::get_exam_by_id))
        .route("/api/exams/{exam_id}", put(routes::exams::put_exam))
        .route(
            "/api/exams/{exam_id}/seed/staging",
            put(routes::exams::put_exam_by_id_to_staging),
        )
        .route(
            "/api/exams/{exam_id}/seed/production",
            put(routes::exams::put_exam_by_id_to_production),
        )
        .route(
            "/api/exams/{exam_id}/generations/{database_environment}",
            get(routes::exams::get_generations_by_exam_id_with_database_environment)
                .put(routes::exams::put_generations_by_exam_id_with_database_environment),
        )
        .route(
            "/api/exams/{exam_id}/config/validate",
            post(routes::exams::post_validate_config_by_exam_id),
        )
        // .route("/api/attempts", get(routes::attempts::get_attempts))
        .route(
            "/api/metrics/exams",
            get(routes::metrics::get_exams_metrics),
        )
        .route(
            "/api/metrics/attempts",
            get(routes::metrics::get_attempts_metrics),
        )
        .route(
            "/api/metrics/exams/{exam_id}",
            get(routes::metrics::get_exam_metrics_by_exam_id),
        )
        .route(
            "/api/attempts/{attempt_id}",
            get(routes::attempts::get_attempt_by_id),
        )
        .route(
            "/api/attempts/{attempt_id}/pending-deletion",
            put(routes::attempts::put_pending_deletion)
                .delete(routes::attempts::delete_pending_deletion),
        )
        .route(
            "/api/attempts/{attempt_id}/moderation",
            patch(routes::attempts::patch_moderation_status_by_attempt_id)
                .get(routes::moderations::get_moderation_by_attempt_id),
        )
        .route(
            "/api/attempts/{attempt_id}/moderation/view",
            put(routes::attempts::put_moderation_view_start),
        )
        .route("/api/attempts", get(routes::moderations::get_moderations))
        .route(
            "/api/attempts/moderations/count",
            get(routes::moderations::get_moderations_count),
        )
        .route(
            "/api/attempts/user/{user_id}",
            get(routes::attempts::get_attempts_by_user_id),
        )
        .route(
            "/api/attempts/user/{user_id}/count",
            get(routes::attempts::get_number_of_attempts_by_user_id),
        )
        .route(
            "/api/exam-challenges/{exam_id}",
            get(routes::exam_challenge::get_exam_challenges)
                .put(routes::exam_challenge::put_exam_challenges), // .delete(routes::exam_challenge::delete_exam_challenge),
        )
        .route("/api/users", get(routes::users::get_users))
        .route("/api/users/search", get(routes::users::get_user_search))
        .route(
            "/api/users/duplicates",
            get(routes::users::get_user_duplicates),
        )
        .route("/api/users/merge", post(routes::users::post_user_merge))
        .route(
            "/api/users/merge/{survivor_id}",
            delete(routes::users::delete_user_merge),
        )
        .route("/api/users/session", get(routes::users::get_session_user))
        .route(
            "/api/users/session/settings",
            put(routes::users::put_user_settings),
        )
        .route(
            "/api/state/exams/{exam_id}",
            put(routes::discard_exam_state_by_id),
        )
        .route(
            "/api/events/attempts/{attempt_id}",
            get(routes::events::get_events_by_attempt_id),
        )
        .route(
            "/auth/login/github",
            get(routes::auth::github::github_login_handler),
        )
        .route("/auth/github", get(routes::auth::github::github_handler))
        .route("/auth/logout", delete(routes::auth::delete_logout))
        .route("/status/ping", get(routes::get_status_ping))
        .route("/ws/exam/{exam_id}", any(extractor::ws_handler_exam))
        .route("/ws/users", any(extractor::ws_handler_users))
        .route_service("/", ServeFile::new("dist/index.html"))
        .route_service("/auth/callback/github", ServeFile::new("dist/index.html"))
        .route_service("/attempts", ServeFile::new("dist/index.html"))
        .route_service("/attempts/{*id}", ServeFile::new("dist/index.html"))
        .route_service("/exams", ServeFile::new("dist/index.html"))
        .route_service("/exams/{*id}", ServeFile::new("dist/index.html"))
        .route_service("/language-items", ServeFile::new("dist/index.html"))
        .route_service("/language-items/{*id}", ServeFile::new("dist/index.html"))
        .route_service("/metrics", ServeFile::new("dist/index.html"))
        .route_service("/users", ServeFile::new("dist/index.html"))
        .route_service("/user/deduplicate", ServeFile::new("dist/index.html"))
        .route_service("/metrics/exams/{*id}", ServeFile::new("dist/index.html"))
        .route_service("/login", ServeFile::new("dist/index.html"))
        .fallback_service(ServeDir::new("dist"))
        .layer(cors)
        .layer(session_layer)
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            std::time::Duration::from_millis(env_vars.request_timeout_in_ms),
        ))
        .layer(RequestBodyLimitLayer::new(env_vars.request_body_size_limit))
        .layer(Extension(github_client))
        .layer(Extension(http_client))
        .layer(
            TraceLayer::new_for_http()
                // Create span for the request and include the matched path. The matched
                // path is useful for figuring out which handler the request was routed to.
                .make_span_with(|req: &Request| {
                    let method = req.method();
                    let uri = req.uri();

                    // axum automatically adds this extension.
                    let matched_path = req
                        .extensions()
                        .get::<MatchedPath>()
                        .map(|matched_path| matched_path.as_str());

                    tracing::debug_span!("request", %method, %uri, matched_path)
                })
                .on_request(|request: &Request, _span: &tracing::Span| {
                    let method = request.method();
                    let uri = request.uri();
                    tracing::debug!("--> {} {}", method, uri);
                })
                .on_response(
                    |response: &axum::http::Response<_>,
                     latency: std::time::Duration,
                     _span: &tracing::Span| {
                        tracing::debug!("<-- {} ({} ms)", response.status(), latency.as_millis());
                    },
                )
                // By default `TraceLayer` will log 5xx
                .on_failure(()),
        )
        .layer(SentryHttpLayer::new().enable_transaction())
        // Outermost: fresh Sentry hub per request so scope data does not leak
        // across concurrent requests.
        .layer(NewSentryLayer::<Request>::new_from_top())
        .with_state(server_state);

    info!("Successfully created app.");
    Ok(app)
}
