use std::collections::{HashMap, HashSet};

use axum::{
    Extension, Json,
    body::Bytes,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use hmac::{Hmac, Mac};
use http::{HeaderMap, StatusCode};
use mongodb::bson::{doc, serialize_to_document};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use tracing::error;
use uuid::Uuid;

use crate::{
    config::GithubReviewConfig,
    database::prisma,
    errors::Error,
    language_items::{
        domain::{
            GithubReviewBatch, GithubReviewLink, GithubReviewState, GithubSyncDelivery,
            LanguageItem, LanguageItemAuditEvent, LanguageItemRecordState, LanguageItemReview,
            LanguageItemStatus, LanguageItemVersion, ReviewDecision, TaskPackage,
            task_package_hash,
        },
        github::{GithubClient, RepositoryFile},
        registry::snapshot_for,
        validation::validate_task_package,
    },
    state::ServerState,
};

static GITHUB_SYNC_LOCK: Lazy<tokio::sync::Mutex<()>> = Lazy::new(|| tokio::sync::Mutex::new(()));

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn github_config(state: &ServerState) -> Result<&GithubReviewConfig, Error> {
    state.env_vars.github_review.as_ref().ok_or_else(|| {
        Error::Server(
            StatusCode::SERVICE_UNAVAILABLE,
            "GitHub review integration is not configured".to_string(),
        )
    })
}

fn not_found(kind: &str, id: &str) -> Error {
    Error::Server(StatusCode::NOT_FOUND, format!("{kind} not found: {id}"))
}

fn conflict(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

async fn write_audit(
    state: &ServerState,
    item_id: &str,
    version_id: Option<&str>,
    action: &str,
    actor_email: &str,
    details: serde_json::Value,
) -> Result<(), Error> {
    let audit_id = format!(
        "LIA-GITHUB-{}",
        hex::encode(Sha256::digest(
            format!("{item_id}|{version_id:?}|{action}|{details}").as_bytes()
        ))
    );
    let event = LanguageItemAuditEvent {
        id: audit_id.clone(),
        item_id: item_id.to_string(),
        version_id: version_id.map(str::to_string),
        action: action.to_string(),
        actor_email: actor_email.to_string(),
        details,
        created_at: now(),
    };
    state
        .workbench_database
        .audit_events
        .update_one(
            doc! { "id": audit_id },
            doc! { "$setOnInsert": serialize_to_document(&event)? },
        )
        .upsert(true)
        .await?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIntegrationStatus {
    enabled: bool,
    repository: Option<String>,
    base_branch: Option<String>,
    review_mode: &'static str,
    automatic_sync: bool,
}

pub async fn get_status(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Json<GithubIntegrationStatus> {
    let config = state.env_vars.github_review.as_ref();
    Json(GithubIntegrationStatus {
        enabled: config.is_some(),
        repository: config.map(|config| config.repository.clone()),
        base_branch: config.map(|config| config.base_branch.clone()),
        review_mode: "pullRequest",
        automatic_sync: config.is_some_and(|config| config.webhook_secret.is_some()),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateGithubReviewBatchBody {
    item_ids: Vec<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GithubItemSource {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    batch_id: Option<String>,
    version_id: String,
    version_number: u64,
    content_hash: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GithubItemFile {
    schema_version: String,
    item_id: String,
    title: String,
    source: GithubItemSource,
    task_package: TaskPackage,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GithubBatchManifest {
    schema_version: &'static str,
    batch_id: String,
    items: Vec<GithubBatchManifestItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GithubBatchManifestItem {
    item_id: String,
    version_id: String,
    path: String,
    content_hash: String,
    version_number: u64,
    registry_version: String,
    registry_snapshot_path: String,
    task_package_schema_path: String,
    candidate_schema_path: String,
}

fn slot_name(id: &str) -> &str {
    match id {
        "R-A1-1" => "Signs, labels, and short notices",
        "R-A1-2" => "Short messages and online information",
        "R-A1-3" => "Practical structured information",
        "R-A1-4" => "Short profiles, routines, and basic descriptions",
        "L-A1-1" => "Basic personal and familiar information",
        "L-A1-2" => "Explicit details in short dialogues",
        "L-A1-3" => "Announcements, messages, and information records",
        "L-A1-4" => "Simple communicative purposes and one-step instructions",
        "W-A1-1" => "Complete a basic online form",
        "W-A1-2" => "Reply to a very short practical message",
        "W-A1-3" => "Relay simple information in writing",
        "S-A1-1" => "Basic personal questions and answers",
        "S-A1-2" => "Express direct needs and familiar content",
        "S-A1-3" => "Simple everyday interaction and arrangement confirmation",
        "S-A1-4" => "Relay simple information orally",
        _ => "Registered blueprint task",
    }
}

fn can_do_name(id: &str) -> &str {
    match id {
        "A1-L1" => "Understand basic personal and familiar information",
        "A1-L2" => "Extract explicit practical information",
        "A1-L3" => "Understand simple communicative purposes and instructions",
        "A1-R1" => "Understand signs, labels, and short notices",
        "A1-R2" => "Find key information in short messages and practical texts",
        "A1-S1" => "Provide basic personal information",
        "A1-S2" => "Express direct needs and familiar content",
        "A1-W1" => "Complete a basic online form",
        "A1-W2" => "Write a very short practical message",
        "A1-I1" => "Conduct a basic personal exchange",
        "A1-I2" => "Complete a simple, predictable everyday exchange",
        "A1-I3a" => "Arrange or confirm a simple plan orally",
        "A1-I3b" => "Arrange or confirm a simple plan in writing",
        "A1-I4" => "Maintain and repair a basic exchange",
        "A1-M1" => "Relay simple explicit information orally",
        "A1-M2" => "Relay simple explicit information in writing",
        _ => "Registered A1 Can-do",
    }
}

fn item_format_name(id: &str) -> &str {
    match id {
        "IF-SINGLE-SELECT" => "Single select",
        "IF-MATCHING" => "Matching",
        "IF-RESTRICTED-INPUT" => "Restricted input",
        "IF-FORM-ENTRY" => "Form entry",
        "IF-TYPED-MESSAGE" => "Typed message",
        "IF-SPOKEN-SINGLE" => "Spoken response",
        "IF-SPOKEN-MULTITURN" => "Spoken interaction",
        _ => "Registered item format",
    }
}

fn review_display_title(item: &LanguageItem) -> String {
    let title = item.title.trim();
    if !title.is_empty() && title.is_ascii() {
        title.to_string()
    } else {
        format!(
            "{} — {}",
            slot_name(&item.draft.blueprint_slot_id),
            item_format_name(&item.draft.item_format_id)
        )
    }
}

fn review_focus_for_item(item: &LanguageItem) -> String {
    let format_checks = match item.draft.item_format_id.as_str() {
        "IF-SINGLE-SELECT" => {
            "- [ ] There is exactly one unambiguous correct answer; distractors are plausible and contain no answer cues"
        }
        "IF-MATCHING" => {
            "- [ ] Every match is unambiguous and the reuse rule agrees with the instructions"
        }
        "IF-RESTRICTED-INPUT" | "IF-FORM-ENTRY" => {
            "- [ ] Every response field has a clear answer and reasonable equivalent forms are covered"
        }
        "IF-TYPED-MESSAGE" | "IF-SPOKEN-SINGLE" | "IF-SPOKEN-MULTITURN" => {
            "- [ ] Required content points are sufficient and observable, with no hidden criteria outside the fixed rubric"
        }
        _ => "- [ ] The item structure matches the selected item format",
    };
    format!(
        "## {}\n\n- Blueprint slot: {}\n- Primary Can-do: {}\n- Skill: {}\n- Communicative activity: {}\n- Item format: {}\n\n### Item-specific check\n\n{}",
        review_display_title(item),
        slot_name(&item.draft.blueprint_slot_id),
        can_do_name(&item.draft.content.primary_can_do_id),
        item.draft.content.primary_reported_skill,
        item.draft.content.communicative_activity,
        item_format_name(&item.draft.item_format_id),
        format_checks,
    )
}

pub async fn post_batch(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    Json(body): Json<CreateGithubReviewBatchBody>,
) -> Result<Json<GithubReviewBatch>, Error> {
    let config = github_config(&state)?;
    if body.item_ids.is_empty() || body.item_ids.len() > 50 {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "Select between 1 and 50 items for one GitHub review batch".to_string(),
        ));
    }
    let mut requested = body.item_ids;
    requested.sort();
    requested.dedup();
    let items: Vec<LanguageItem> = state
        .workbench_database
        .language_items
        .find(doc! { "id": { "$in": &requested } })
        .await?
        .try_collect()
        .await?;
    if items.len() != requested.len() {
        return Err(Error::Server(
            StatusCode::NOT_FOUND,
            "One or more selected language items do not exist".to_string(),
        ));
    }
    let items_by_id: HashMap<_, _> = items
        .into_iter()
        .map(|item| (item.id.clone(), item))
        .collect();
    let ordered_items: Vec<_> = requested
        .iter()
        .map(|id| items_by_id.get(id).expect("selected item exists").clone())
        .collect();
    let mut versions_by_item = HashMap::new();
    let mut versions_to_insert = Vec::new();
    for item in &ordered_items {
        if item.owner_email != user.email {
            return Err(Error::Server(
                StatusCode::FORBIDDEN,
                "Only the item owner can submit it to GitHub review".to_string(),
            ));
        }
        if item.record_state != LanguageItemRecordState::Active {
            return Err(conflict(format!(
                "Item {} must be restored before GitHub review",
                item.id
            )));
        }
        if item
            .github_review
            .as_ref()
            .is_some_and(|review| review.state != GithubReviewState::Closed)
        {
            return Err(conflict(format!(
                "Item {} already belongs to an active GitHub review",
                item.id
            )));
        }

        let version = if item.status == LanguageItemStatus::Draft {
            let mut package = item.draft.clone();
            let version_number = state
                .workbench_database
                .versions
                .find_one(doc! { "itemId": &item.id })
                .sort(doc! { "versionNumber": -1 })
                .await?
                .map_or(1, |version| version.version_number + 1);
            package.task_version = version_number.to_string();
            let validation = validate_task_package(&package);
            if !validation.valid {
                return Err(Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    serde_json::to_string(&validation)
                        .unwrap_or_else(|_| "invalid draft".to_string()),
                ));
            }
            let version = LanguageItemVersion {
                id: format!("LIV-{}", Uuid::new_v4()),
                item_id: item.id.clone(),
                version_number,
                created_from_draft_revision: item.revision,
                author_email: item.owner_email.clone(),
                submitted_by: item.owner_email.clone(),
                frozen: true,
                content_hash: task_package_hash(&package),
                lifecycle_status: "reviewSubmission".to_string(),
                package,
                validation,
                created_at: now(),
            };
            versions_to_insert.push(version.clone());
            version
        } else if matches!(
            item.status,
            LanguageItemStatus::ReadyForReview | LanguageItemStatus::Rejected
        ) {
            let version_id = item
                .latest_version_id
                .as_deref()
                .ok_or_else(|| conflict("Legacy review item is missing its snapshot"))?;
            state
                .workbench_database
                .versions
                .find_one(doc! { "id": version_id })
                .await?
                .ok_or_else(|| not_found("language item version", version_id))?
        } else {
            return Err(conflict(format!(
                "Item {} is not an editable draft",
                item.id
            )));
        };
        versions_by_item.insert(item.id.clone(), version);
    }

    let batch_id = format!("LIB-{}", Uuid::new_v4());
    let mut files = Vec::new();
    let mut manifest_items = Vec::new();
    let mut rule_paths = HashSet::new();
    for item in &ordered_items {
        let version = versions_by_item
            .get(&item.id)
            .expect("submission snapshot exists");
        if !version.validation.valid
            || !validate_task_package(&version.package).valid
            || task_package_hash(&version.package) != version.content_hash
        {
            return Err(conflict(format!(
                "Frozen version {} no longer passes validation",
                version.id
            )));
        }
        let repository_path = format!("items/{}.json", item.id);
        let file = GithubItemFile {
            schema_version: "1.1".to_string(),
            item_id: item.id.clone(),
            title: review_display_title(item),
            source: GithubItemSource {
                batch_id: Some(batch_id.clone()),
                version_id: version.id.clone(),
                version_number: version.version_number,
                content_hash: version.content_hash.clone(),
            },
            task_package: version.package.clone(),
        };
        let mut content = serde_json::to_string_pretty(&file).map_err(|error| {
            Error::Server(
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Unable to serialize GitHub item: {error}"),
            )
        })?;
        content.push('\n');
        files.push(RepositoryFile {
            path: repository_path.clone(),
            content,
        });
        let registry_version = &version.package.spec_versions.registry_bundle_version;
        let registry = snapshot_for(registry_version).ok_or_else(|| {
            conflict("The item's pinned Assessment Settings version is unavailable")
        })?;
        let rules_directory = format!(
            "review-batches/{batch_id}/rules/{}",
            hex::encode(Sha256::digest(registry_version.as_bytes()))
        );
        let registry_snapshot_path = format!("{rules_directory}/snapshot.json");
        let task_package_schema_path = format!("{rules_directory}/task-package.schema.json");
        let candidate_schema_path = format!(
            "{rules_directory}/{}.schema.json",
            version.package.item_format_id
        );
        let schema_index = [
            "IF-SINGLE-SELECT",
            "IF-MATCHING",
            "IF-RESTRICTED-INPUT",
            "IF-FORM-ENTRY",
            "IF-TYPED-MESSAGE",
            "IF-SPOKEN-SINGLE",
            "IF-SPOKEN-MULTITURN",
        ]
        .iter()
        .position(|id| *id == version.package.item_format_id)
        .ok_or_else(|| conflict("Unregistered item format"))?;
        let candidate_schema = registry
            .candidate_schemas
            .get(schema_index)
            .ok_or_else(|| conflict("The pinned candidate schema is unavailable"))?;
        for (path, value) in [
            (&registry_snapshot_path, serde_json::to_value(&*registry)),
            (
                &task_package_schema_path,
                Ok(registry.task_package_schema.clone()),
            ),
            (&candidate_schema_path, Ok(candidate_schema.clone())),
        ] {
            if rule_paths.insert(path.clone()) {
                let value =
                    value.map_err(|_| conflict("Unable to serialize the pinned review rules"))?;
                files.push(RepositoryFile {
                    path: path.clone(),
                    content: format!(
                        "{}\n",
                        serde_json::to_string_pretty(&value)
                            .map_err(|_| conflict("Unable to serialize the pinned review rules"))?
                    ),
                });
            }
        }
        manifest_items.push(GithubBatchManifestItem {
            item_id: item.id.clone(),
            version_id: version.id.clone(),
            path: repository_path,
            content_hash: version.content_hash.clone(),
            version_number: version.version_number,
            registry_version: registry_version.clone(),
            registry_snapshot_path,
            task_package_schema_path,
            candidate_schema_path,
        });
    }
    let manifest = GithubBatchManifest {
        schema_version: "1.1",
        batch_id: batch_id.clone(),
        items: manifest_items,
    };
    let mut manifest_content = serde_json::to_string_pretty(&manifest).map_err(|error| {
        Error::Server(
            StatusCode::INTERNAL_SERVER_ERROR,
            format!("Unable to serialize GitHub review manifest: {error}"),
        )
    })?;
    manifest_content.push('\n');
    files.push(RepositoryFile {
        path: format!("review-batches/{batch_id}.json"),
        content: manifest_content,
    });

    let title = if ordered_items.len() == 1 {
        format!("[Item Review] {}", review_display_title(&ordered_items[0]))
    } else {
        format!(
            "[Item Review Batch] Chinese A1 · {} items",
            ordered_items.len()
        )
    };
    let review_focus = ordered_items
        .iter()
        .map(review_focus_for_item)
        .collect::<Vec<_>>()
        .join("\n\n");
    let pull_body = format!(
        "{review_focus}\n\n## Review checklist\n\n- [ ] The item measures the stated Can-do and stays within A1 difficulty\n- [ ] The context, communicative purpose, stimulus, and instructions are complete and natural\n- [ ] Language content contains no unnecessary out-of-scope language\n- [ ] The correct answer or required content points agree with the task\n- [ ] The item structure and candidate rendering are correct and reveal no answers\n- [ ] After changing a prompt, option, or answer, every related field remains consistent\n\nUse pull-request reviews and inline comments. Merging confirms that the item has passed the checks above.\n"
    );
    let github = GithubClient::new(&http_client, config);
    let pull = github
        .create_review_pull_request(&batch_id, &title, &pull_body, &files)
        .await?;
    let timestamp = now();
    for version in &versions_to_insert {
        state
            .workbench_database
            .versions
            .insert_one(version)
            .await?;
        state
            .workbench_database
            .reviews
            .insert_one(LanguageItemReview {
                id: format!("LIR-{}", Uuid::new_v4()),
                version_id: version.id.clone(),
                gate_id: "automatedPrecheck".to_string(),
                decision: ReviewDecision::Approved,
                field_path: None,
                rule_ref: Some("review.automatedPrecheck".to_string()),
                comment: "Server validation passed when the GitHub PR was created.".to_string(),
                reviewer_email: "system".to_string(),
                created_at: timestamp.clone(),
            })
            .await?;
    }
    for mut item in ordered_items {
        let expected_revision = item.revision;
        let expected_version_id = item.latest_version_id.clone();
        let source_version = versions_by_item
            .get(&item.id)
            .expect("submission snapshot exists");
        let source_version_id = source_version.id.clone();
        let link = GithubReviewLink {
            batch_id: batch_id.clone(),
            repository: config.repository.clone(),
            pull_request_number: pull.number,
            pull_request_url: pull.html_url.clone(),
            base_ref: pull.base_ref.clone(),
            head_ref: pull.head_ref.clone(),
            head_sha: pull.head_sha.clone(),
            submission_head_sha: Some(pull.head_sha.clone()),
            repository_path: format!("items/{}.json", item.id),
            source_version_id: source_version_id.clone(),
            source_content_hash: source_version.content_hash.clone(),
            state: GithubReviewState::Open,
            approval_count: 0,
            changes_requested_count: 0,
            merge_commit_sha: None,
            approved_version_id: None,
            sync_error: None,
            last_synced_at: timestamp.clone(),
        };
        item.github_review = Some(link);
        item.latest_version_id = Some(source_version_id.clone());
        item.status = LanguageItemStatus::InReview;
        item.updated_at = timestamp.clone();
        let result = state
            .workbench_database
            .language_items
            .update_one(doc! { "id": &item.id, "revision": expected_revision as i64, "latestVersionId": &expected_version_id,
                "$or": [{ "recordState": "active" }, { "recordState": { "$exists": false } }] },
                doc! { "$set": { "githubReview": serialize_to_document(item.github_review.as_ref().expect("assigned above"))?,
                    "latestVersionId": &source_version_id, "status": "inReview", "updatedAt": &timestamp } })
            .await?;
        if result.matched_count != 1 {
            return Err(conflict(format!(
                "Review PR {} was created, but item {} changed during submission; its newer draft was preserved",
                pull.html_url, item.id
            )));
        }
        write_audit(
            &state,
            &item.id,
            Some(&source_version_id),
            "github_review.submitted",
            &user.email,
            json!({
                "batchId": batch_id,
                "repository": config.repository,
                "pullRequestNumber": pull.number,
                "pullRequestUrl": pull.html_url,
            }),
        )
        .await?;
    }
    Ok(Json(GithubReviewBatch {
        batch_id,
        repository: config.repository.clone(),
        pull_request_number: pull.number,
        pull_request_url: pull.html_url,
        state: GithubReviewState::Open,
        item_ids: requested,
        approval_count: 0,
        changes_requested_count: 0,
        last_synced_at: timestamp,
    }))
}

pub async fn post_sync_batch(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    Path(batch_id): Path<String>,
) -> Result<Json<GithubReviewBatch>, Error> {
    sync_review_batch(&state, &http_client, &batch_id, &user.email)
        .await
        .map(Json)
}

#[derive(Deserialize)]
struct GithubWebhookPullRequest {
    merged: bool,
    merge_commit_sha: Option<String>,
}

#[derive(Deserialize)]
struct GithubWebhookRepository {
    full_name: String,
}

#[derive(Deserialize)]
struct GithubWebhookSender {
    login: String,
}

#[derive(Deserialize)]
struct GithubWebhookPayload {
    action: String,
    number: u64,
    pull_request: GithubWebhookPullRequest,
    repository: GithubWebhookRepository,
    sender: GithubWebhookSender,
}

fn verify_webhook_signature(secret: &str, signature: &str, body: &[u8]) -> bool {
    let Some(hex_signature) = signature.strip_prefix("sha256=") else {
        return false;
    };
    let Ok(expected) = hex::decode(hex_signature) else {
        return false;
    };
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return false;
    };
    mac.update(body);
    mac.verify_slice(&expected).is_ok()
}

pub async fn post_webhook(
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, Error> {
    let config = github_config(&state)?;
    let secret = config.webhook_secret.as_deref().ok_or_else(|| {
        Error::Server(
            StatusCode::SERVICE_UNAVAILABLE,
            "GitHub review webhook is not configured".to_string(),
        )
    })?;
    let signature = headers
        .get("x-hub-signature-256")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default();
    if !verify_webhook_signature(secret, signature, &body) {
        return Err(Error::Server(
            StatusCode::UNAUTHORIZED,
            "invalid GitHub webhook signature".to_string(),
        ));
    }
    if headers
        .get("x-github-event")
        .and_then(|value| value.to_str().ok())
        != Some("pull_request")
    {
        return Ok(StatusCode::ACCEPTED);
    }
    let delivery_id = headers
        .get("x-github-delivery")
        .and_then(|value| value.to_str().ok())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            Error::Server(
                StatusCode::BAD_REQUEST,
                "missing GitHub delivery id".to_string(),
            )
        })?
        .to_string();
    let payload: GithubWebhookPayload = serde_json::from_slice(&body).map_err(|error| {
        Error::Server(
            StatusCode::BAD_REQUEST,
            format!("invalid GitHub webhook payload: {error}"),
        )
    })?;
    if payload.repository.full_name != config.repository
        || payload.action != "closed"
        || !payload.pull_request.merged
    {
        return Ok(StatusCode::ACCEPTED);
    }
    if let Some(existing) = state
        .workbench_database
        .github_sync_deliveries
        .find_one(doc! { "id": &delivery_id })
        .await?
    {
        if existing.repository != config.repository
            || existing.pull_request_number != payload.number
        {
            return Err(conflict(
                "Webhook delivery identity was reused for a different pull request",
            ));
        }
        if existing.status == "completed" {
            return Ok(StatusCode::ACCEPTED);
        }
        if matches!(existing.status.as_str(), "failed" | "blocked") {
            state.workbench_database.github_sync_deliveries.update_one(
                doc! { "id": &delivery_id, "status": &existing.status, "updatedAt": &existing.updated_at },
                doc! { "$set": { "status": "queued", "updatedAt": now(), "error": null, "completedAt": null } }).await?;
        }
        tokio::spawn(run_sync_delivery(state, http_client, delivery_id));
        return Ok(StatusCode::ACCEPTED);
    }
    let Some(item) = state.workbench_database.language_items.find_one(doc! {
        "githubReview.repository": &config.repository, "githubReview.pullRequestNumber": payload.number as i64,
    }).await? else {
        return Ok(StatusCode::ACCEPTED);
    };
    let batch_id = item
        .github_review
        .as_ref()
        .expect("query guarantees link")
        .batch_id
        .clone();
    let timestamp = now();
    let delivery = GithubSyncDelivery {
        id: delivery_id.clone(),
        repository: config.repository.clone(),
        pull_request_number: payload.number,
        batch_id,
        merge_commit_sha: payload.pull_request.merge_commit_sha,
        actor_email: format!("github:{}", payload.sender.login),
        status: "queued".to_string(),
        error: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
        completed_at: None,
    };
    state
        .workbench_database
        .github_sync_deliveries
        .update_one(
            doc! { "id": &delivery_id },
            doc! { "$setOnInsert": serialize_to_document(&delivery)? },
        )
        .upsert(true)
        .await?;
    tokio::spawn(run_sync_delivery(state, http_client, delivery_id));
    Ok(StatusCode::ACCEPTED)
}

fn delivery_ready_for_retry(
    delivery: &GithubSyncDelivery,
    current: chrono::DateTime<chrono::Utc>,
) -> bool {
    delivery.status == "queued"
        || (matches!(delivery.status.as_str(), "failed" | "running")
            && chrono::DateTime::parse_from_rfc3339(&delivery.updated_at).map_or(true, |updated| {
                current.signed_duration_since(updated).num_seconds() >= 60
            }))
}

async fn run_sync_delivery(state: ServerState, http_client: reqwest::Client, delivery_id: String) {
    let result = async {
        let Some(delivery) = state.workbench_database.github_sync_deliveries.find_one(doc! { "id": &delivery_id }).await? else { return Ok::<(), Error>(()); };
        if !delivery_ready_for_retry(&delivery, chrono::Utc::now()) { return Ok(()); }
        let started_at = now();
        let claimed = state.workbench_database.github_sync_deliveries.update_one(
            doc! { "id": &delivery_id, "status": &delivery.status, "updatedAt": &delivery.updated_at },
            doc! { "$set": { "status": "running", "updatedAt": &started_at, "completedAt": null } }).await?;
        if claimed.matched_count != 1 { return Ok(()); }
        let outcome = sync_review_batch(&state, &http_client, &delivery.batch_id, &delivery.actor_email).await;
        let finished_at = now();
        let (status, message) = match outcome {
            Ok(_) => ("completed", None),
            Err(error) => {
                let permanent = matches!(&error, Error::Server(code, _) if matches!(*code,
                    StatusCode::CONFLICT | StatusCode::UNPROCESSABLE_ENTITY | StatusCode::NOT_FOUND | StatusCode::FORBIDDEN));
                (if permanent { "blocked" } else { "failed" }, Some(error.to_string().chars().take(1000).collect::<String>()))
            }
        };
        state.workbench_database.github_sync_deliveries.update_one(
            doc! { "id": &delivery_id, "status": "running", "updatedAt": &started_at },
            doc! { "$set": { "status": status, "error": message, "updatedAt": &finished_at,
                "completedAt": if status == "completed" { Some(&finished_at) } else { None } } }).await?;
        Ok(())
    }.await;
    if let Err(error) = result {
        error!(delivery_id, error = %error, "GitHub webhook worker persistence failed; durable delivery will be retried");
    }
}

pub fn start_github_sync_worker(state: ServerState, http_client: reqwest::Client) {
    if state
        .env_vars
        .github_review
        .as_ref()
        .is_none_or(|config| config.webhook_secret.is_none())
    {
        return;
    }
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(30));
        loop {
            interval.tick().await;
            let cutoff = (chrono::Utc::now() - chrono::Duration::seconds(60)).to_rfc3339();
            let pending = async {
                state.workbench_database.github_sync_deliveries.find(doc! { "$or": [
                    { "status": "queued" },
                    { "status": { "$in": ["failed", "running"] }, "updatedAt": { "$lte": cutoff } }
                ] }).limit(10).await?.try_collect::<Vec<GithubSyncDelivery>>().await
            }
            .await;
            match pending {
                Ok(deliveries) => {
                    for delivery in deliveries {
                        run_sync_delivery(state.clone(), http_client.clone(), delivery.id).await;
                    }
                }
                Err(error) => {
                    error!(error = %error, "Unable to read pending GitHub webhook deliveries")
                }
            }
        }
    });
}

fn merged_identity_matches(
    file: &GithubItemFile,
    item: &LanguageItem,
    link: &GithubReviewLink,
    source: &LanguageItemVersion,
) -> bool {
    matches!(file.schema_version.as_str(), "1.0" | "1.1")
        && (file.schema_version == "1.0"
            || file.source.batch_id.as_deref() == Some(link.batch_id.as_str()))
        && file
            .source
            .batch_id
            .as_deref()
            .is_none_or(|batch| batch == link.batch_id)
        && file.item_id == item.id
        && source.item_id == item.id
        && file.task_package.task_id == item.id
        && file.source.version_id == source.id
        && file.source.version_id == link.source_version_id
        && file.source.version_number == source.version_number
        && file.source.content_hash == source.content_hash
        && file.source.content_hash == link.source_content_hash
        && file.task_package.spec_versions.registry_bundle_version
            == source.package.spec_versions.registry_bundle_version
        && submission_settings_match(&file.task_package, &source.package)
        && !file.title.trim().is_empty()
}

fn submission_settings_match(reviewed: &TaskPackage, submitted: &TaskPackage) -> bool {
    let (Ok(reviewed), Ok(submitted)) = (
        serde_json::to_value(reviewed),
        serde_json::to_value(submitted),
    ) else {
        return false;
    };
    // Keep this boundary aligned with review-repository/scripts/registry-checks.mjs.
    // A valid alternative setup is still a different assessment, not a content edit.
    [
        "/taskId",
        "/taskVersion",
        "/specVersions",
        "/blueprintSlotId",
        "/taskFamilyId",
        "/itemFormatId",
        "/renderer",
        "/deliveryPolicyRefs",
        "/reviewPackage",
        "/content/primaryCanDoId",
        "/content/primaryReportedSkill",
        "/content/communicativeActivity",
        "/content/primaryDomain",
        "/content/contextId",
        "/content/difficultyBand",
        "/content/difficulty",
        "/scoringPackage/scoringContractTemplateId",
        "/scoringPackage/scoringContractTemplateVersion",
        "/scoringPackage/rubricId",
        "/scoringPackage/benchmarkSetVersion",
    ]
    .iter()
    .all(|path| reviewed.pointer(path) == submitted.pointer(path))
}

fn import_already_applied(item: &LanguageItem, merge_sha: Option<&str>) -> bool {
    item.github_review.as_ref().is_some_and(|link| {
        link.state == GithubReviewState::Merged
            && link.merge_commit_sha.as_deref() == merge_sha
            && link.approved_version_id.is_some()
    })
}

fn source_is_current(item: &LanguageItem, source: &LanguageItemVersion) -> bool {
    item.latest_version_id.as_deref() == Some(source.id.as_str())
        && item.revision == source.created_from_draft_revision
}

async fn sync_review_batch(
    state: &ServerState,
    http_client: &reqwest::Client,
    batch_id: &str,
    actor_email: &str,
) -> Result<GithubReviewBatch, Error> {
    let _guard = GITHUB_SYNC_LOCK.lock().await;
    let config = github_config(state)?;
    let mut items: Vec<LanguageItem> = state
        .workbench_database
        .language_items
        .find(doc! { "githubReview.batchId": batch_id })
        .await?
        .try_collect()
        .await?;
    if items.is_empty() {
        return Err(not_found("GitHub review batch", batch_id));
    }
    let first_link = items[0]
        .github_review
        .as_ref()
        .expect("query guarantees link");
    if items.iter().any(|item| {
        item.github_review.as_ref().is_none_or(|link| {
            link.repository != config.repository
                || link.pull_request_number != first_link.pull_request_number
        })
    }) {
        return Err(conflict(
            "GitHub review batch identity does not match configuration",
        ));
    }
    let github = GithubClient::new(http_client, config);
    let remote = match github
        .pull_request_summary(first_link.pull_request_number)
        .await
    {
        Ok(remote) => remote,
        Err(error) => {
            let _ = mark_sync_failed(state, &mut items, actor_email, &error.to_string()).await;
            return Err(error);
        }
    };
    let timestamp = now();
    let mut imports = HashMap::new();
    if remote.state == GithubReviewState::Merged {
        let merge_sha = remote
            .merge_commit_sha
            .as_deref()
            .ok_or_else(|| conflict("Merged PR is missing its commit"))?;
        // Read and validate the entire pending batch before changing any item.
        for item in &items {
            if import_already_applied(item, Some(merge_sha)) {
                continue;
            }
            let link = item.github_review.as_ref().expect("query guarantees link");
            let source = state
                .workbench_database
                .versions
                .find_one(doc! { "id": &link.source_version_id })
                .await?
                .ok_or_else(|| not_found("language item version", &link.source_version_id))?;
            if !source_is_current(item, &source) {
                return Err(conflict(format!(
                    "Item {} has a newer draft; merged content cannot replace it",
                    item.id
                )));
            }
            let bytes = github
                .repository_file_at(&link.repository_path, merge_sha)
                .await?;
            let file: GithubItemFile = serde_json::from_slice(&bytes).map_err(|error| {
                Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!("Merged item {} has invalid JSON: {error}", item.id),
                )
            })?;
            if !merged_identity_matches(&file, item, link, &source) {
                return Err(Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!(
                        "Merged item {} changed immutable submission identity",
                        item.id
                    ),
                ));
            }
            let validation = validate_task_package(&file.task_package);
            if !validation.valid {
                let message = format!(
                    "Merged item {} failed validation: {}",
                    item.id,
                    serde_json::to_string(&validation).unwrap_or_default()
                );
                let _ = mark_sync_failed(state, &mut items.clone(), actor_email, &message).await;
                return Err(Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message));
            }
            imports.insert(item.id.clone(), (file, source));
        }
    }

    for item in &mut items {
        if remote.state == GithubReviewState::Merged
            && import_already_applied(item, remote.merge_commit_sha.as_deref())
        {
            let link = item.github_review.as_ref().expect("query guarantees link");
            write_audit(state, &item.id, link.approved_version_id.as_deref(), "github_review.merged_content_imported", actor_email,
                json!({"sourceVersionId":link.source_version_id,"approvedVersionId":link.approved_version_id,"mergeCommitSha":link.merge_commit_sha})).await?;
            continue;
        }
        let expected_revision = item.revision;
        let expected_version_id = item.latest_version_id.clone();
        let mut link = item.github_review.clone().expect("query guarantees link");
        link.state = remote.state.clone();
        link.head_ref = remote.head_ref.clone();
        link.head_sha = remote.head_sha.clone();
        link.base_ref = remote.base_ref.clone();
        link.pull_request_url = remote.html_url.clone();
        link.approval_count = remote.approval_count;
        link.changes_requested_count = remote.changes_requested_count;
        link.merge_commit_sha = remote.merge_commit_sha.clone();
        link.sync_error = None;
        link.last_synced_at = timestamp.clone();
        item.status = match remote.state {
            GithubReviewState::Merged => LanguageItemStatus::ApprovedForExport,
            GithubReviewState::ChangesRequested => LanguageItemStatus::NeedsRevision,
            GithubReviewState::Closed => LanguageItemStatus::Rejected,
            GithubReviewState::Open | GithubReviewState::Approved => LanguageItemStatus::InReview,
            GithubReviewState::SyncFailed => LanguageItemStatus::ReviewBlocked,
        };
        if let Some((file, source)) = imports.get(&item.id) {
            let approved_id = format!(
                "LIV-GITHUB-{}",
                hex::encode(Sha256::digest(
                    format!(
                        "{}:{}",
                        source.id,
                        remote.merge_commit_sha.as_deref().unwrap_or_default()
                    )
                    .as_bytes()
                ))
            );
            let approved = if let Some(existing) = state
                .workbench_database
                .versions
                .find_one(doc! { "id": &approved_id })
                .await?
            {
                let mut expected = file.task_package.clone();
                expected.task_version = existing.version_number.to_string();
                if existing.content_hash != task_package_hash(&expected) {
                    return Err(conflict(
                        "An existing merge import differs from this merge commit",
                    ));
                }
                existing
            } else {
                let number = state
                    .workbench_database
                    .versions
                    .find_one(doc! { "itemId": &item.id })
                    .sort(doc! { "versionNumber": -1 })
                    .await?
                    .map_or(1, |version| version.version_number + 1);
                let mut package = file.task_package.clone();
                package.task_version = number.to_string();
                let validation = validate_task_package(&package);
                if !validation.valid {
                    return Err(conflict(
                        "Merged content is invalid after version normalization",
                    ));
                }
                let approved = LanguageItemVersion {
                    id: approved_id.clone(),
                    item_id: item.id.clone(),
                    version_number: number,
                    created_from_draft_revision: expected_revision,
                    author_email: source.author_email.clone(),
                    submitted_by: format!(
                        "github:{}",
                        remote.merged_by.as_deref().unwrap_or("unknown")
                    ),
                    frozen: true,
                    content_hash: task_package_hash(&package),
                    lifecycle_status: "approved".to_string(),
                    package,
                    validation,
                    created_at: timestamp.clone(),
                };
                state
                    .workbench_database
                    .versions
                    .update_one(
                        doc! { "id": &approved_id },
                        doc! { "$setOnInsert": serialize_to_document(&approved)? },
                    )
                    .upsert(true)
                    .await?;
                approved
            };
            // A merge always creates its own immutable approved record, even if
            // reviewers left the package unchanged. Never rewrite the submission.
            item.revision += 1;
            item.title = file.title.trim().to_string();
            item.draft = approved.package.clone();
            item.latest_version_id = Some(approved.id.clone());
            link.approved_version_id = Some(approved.id);
        }
        item.github_review = Some(link.clone());
        item.updated_at = timestamp.clone();
        let result = state.workbench_database.language_items.update_one(
            doc! { "id": &item.id, "revision": expected_revision as i64,
                "latestVersionId": &expected_version_id, "githubReview.batchId": batch_id },
            doc! { "$set": {
                "title": &item.title, "draft": serialize_to_document(&item.draft)?, "revision": item.revision as i64,
                "latestVersionId": &item.latest_version_id, "githubReview": serialize_to_document(&link)?,
                "status": mongodb::bson::serialize_to_bson(&item.status)?, "updatedAt": &item.updated_at,
            } }).await?;
        if result.matched_count != 1 {
            return Err(conflict(format!(
                "Item {} changed during sync; its newer draft was preserved",
                item.id
            )));
        }
        if remote.state == GithubReviewState::Merged {
            write_audit(state, &item.id, link.approved_version_id.as_deref(), "github_review.merged_content_imported", actor_email,
                json!({"sourceVersionId":link.source_version_id,"approvedVersionId":link.approved_version_id,"mergeCommitSha":link.merge_commit_sha})).await?;
        }
        write_audit(state, &item.id, item.latest_version_id.as_deref(), "github_review.synced", actor_email,
            json!({"batchId":batch_id,"pullRequestNumber":remote.number,"state":remote.state,
                "approvalCount":remote.approval_count,"changesRequestedCount":remote.changes_requested_count,
                "mergeCommitSha":remote.merge_commit_sha})).await?;
    }
    Ok(GithubReviewBatch {
        batch_id: batch_id.to_string(),
        repository: config.repository.clone(),
        pull_request_number: remote.number,
        pull_request_url: remote.html_url,
        state: remote.state,
        item_ids: items.into_iter().map(|item| item.id).collect(),
        approval_count: remote.approval_count,
        changes_requested_count: remote.changes_requested_count,
        last_synced_at: timestamp,
    })
}

async fn mark_sync_failed(
    state: &ServerState,
    items: &mut [LanguageItem],
    actor_email: &str,
    message: &str,
) -> Result<(), Error> {
    for item in items {
        let Some(link) = &item.github_review else {
            continue;
        };
        if link.state == GithubReviewState::Merged {
            continue;
        }
        let result = state.workbench_database.language_items.update_one(
            doc! { "id": &item.id, "revision": item.revision as i64, "githubReview.batchId": &link.batch_id,
                "latestVersionId": &item.latest_version_id },
            doc! { "$set": { "githubReview.state": "syncFailed", "githubReview.syncError": message.chars().take(500).collect::<String>(),
                "githubReview.lastSyncedAt": now(), "status": "reviewBlocked" } }).await?;
        if result.matched_count == 1 {
            write_audit(
                state,
                &item.id,
                item.latest_version_id.as_deref(),
                "github_review.sync_failed",
                actor_email,
                json!({"batchId":link.batch_id,"message":message}),
            )
            .await?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn submission_fixture() -> (LanguageItem, LanguageItemVersion, GithubItemFile) {
        let mut package = TaskPackage::new("LI-test".to_string());
        package.task_version = "1".to_string();
        let payload = package.candidate_payload.as_single_select_mut().unwrap();
        payload.stimulus.text = Some("星期一不开门".to_string());
        payload.prompt = "哪一天不能来？".to_string();
        payload.options[0].text = Some("星期一".to_string());
        payload.options[1].text = Some("星期二".to_string());
        package.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        package.content.required_information_points =
            vec![crate::language_items::domain::InformationPoint::new(
                0,
                "营业日期",
            )];
        assert!(validate_task_package(&package).valid);
        let content_hash = task_package_hash(&package);
        let source = LanguageItemVersion {
            id: "LIV-source".to_string(),
            item_id: package.task_id.clone(),
            version_number: 1,
            created_from_draft_revision: 3,
            author_email: "author@example.test".to_string(),
            submitted_by: "author@example.test".to_string(),
            frozen: true,
            content_hash: content_hash.clone(),
            lifecycle_status: "reviewSubmission".to_string(),
            validation: validate_task_package(&package),
            package: package.clone(),
            created_at: "2026-09-08T00:00:00Z".to_string(),
        };
        let link = GithubReviewLink {
            batch_id: "LIB-test".to_string(),
            repository: "owner/review".to_string(),
            pull_request_number: 7,
            pull_request_url: "https://github.test/owner/review/pull/7".to_string(),
            base_ref: "main".to_string(),
            head_ref: "item-review/LIB-test".to_string(),
            head_sha: "original".to_string(),
            submission_head_sha: Some("original".to_string()),
            repository_path: "items/LI-test.json".to_string(),
            source_version_id: source.id.clone(),
            source_content_hash: content_hash.clone(),
            state: GithubReviewState::Open,
            approval_count: 0,
            changes_requested_count: 0,
            merge_commit_sha: None,
            approved_version_id: None,
            sync_error: None,
            last_synced_at: source.created_at.clone(),
        };
        let item = LanguageItem {
            id: package.task_id.clone(),
            title: "A sign".to_string(),
            owner_email: source.author_email.clone(),
            status: LanguageItemStatus::InReview,
            record_state: LanguageItemRecordState::Active,
            record_state_updated_at: None,
            record_state_updated_by: None,
            has_staging_export: false,
            github_review: Some(link.clone()),
            revision: source.created_from_draft_revision,
            draft: package.clone(),
            latest_version_id: Some(source.id.clone()),
            created_at: source.created_at.clone(),
            updated_at: source.created_at.clone(),
        };
        let file = GithubItemFile {
            schema_version: "1.1".to_string(),
            item_id: item.id.clone(),
            title: item.title.clone(),
            source: GithubItemSource {
                batch_id: Some(link.batch_id),
                version_id: source.id.clone(),
                version_number: source.version_number,
                content_hash,
            },
            task_package: package,
        };
        (item, source, file)
    }

    #[test]
    fn reviewed_content_can_change_without_changing_original_submission_hash() {
        let (item, source, mut file) = submission_fixture();
        let original = serde_json::to_value(&source).unwrap();
        file.title = "Reviewed sign".to_string();
        file.task_package.variation = json!({"reviewed": true});
        file.task_package
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "哪天不能来？".to_string();
        file.task_package.scoring_package.correct_option_id = Some("B".to_string());
        assert!(validate_task_package(&file.task_package).valid);
        assert_ne!(task_package_hash(&file.task_package), source.content_hash);
        assert!(merged_identity_matches(
            &file,
            &item,
            item.github_review.as_ref().unwrap(),
            &source
        ));
        assert_eq!(serde_json::to_value(&source).unwrap(), original);
    }

    #[test]
    fn merged_files_cannot_rewrite_submission_identity_or_pinned_rules() {
        let (item, source, file) = submission_fixture();
        let link = item.github_review.as_ref().unwrap();
        for mutation in 0..7 {
            let mut changed = file.clone();
            match mutation {
                0 => changed.source.content_hash = "different".to_string(),
                1 => changed.source.batch_id = Some("other-batch".to_string()),
                2 => changed.source.version_id = "other-version".to_string(),
                3 => changed.source.version_number += 1,
                4 => {
                    changed.task_package.spec_versions.registry_bundle_version =
                        "other-rules".to_string()
                }
                5 => changed.task_package.task_id = "other-item".to_string(),
                _ => changed.source.batch_id = None,
            }
            assert!(
                !merged_identity_matches(&changed, &item, link, &source),
                "mutation {mutation}"
            );
        }
    }

    #[test]
    fn legacy_submission_files_remain_importable_without_new_batch_field() {
        let (item, source, mut file) = submission_fixture();
        file.schema_version = "1.0".to_string();
        file.source.batch_id = None;
        assert!(merged_identity_matches(
            &file,
            &item,
            item.github_review.as_ref().unwrap(),
            &source
        ));
    }

    #[test]
    fn valid_alternative_context_or_difficulty_cannot_replace_submitted_settings() {
        let (item, source, file) = submission_fixture();
        let registry = snapshot_for(&source.package.spec_versions.registry_bundle_version).unwrap();
        let alternate = registry
            .context_options
            .iter()
            .find_map(|context| {
                if context.id == file.task_package.content.context_id {
                    return None;
                }
                let mut changed = file.clone();
                changed.task_package.content.context_id = context.id.clone();
                validate_task_package(&changed.task_package)
                    .valid
                    .then_some(changed)
            })
            .expect("baseline supports more than one valid context");
        assert!(!merged_identity_matches(
            &alternate,
            &item,
            item.github_review.as_ref().unwrap(),
            &source
        ));
        let mut alternate = file.clone();
        alternate.task_package.content.difficulty_band = "LowerA1".to_string();
        alternate
            .task_package
            .content
            .difficulty
            .as_mut()
            .unwrap()
            .intended_band = "LowerA1".to_string();
        assert!(validate_task_package(&alternate.task_package).valid);
        assert!(!merged_identity_matches(
            &alternate,
            &item,
            item.github_review.as_ref().unwrap(),
            &source
        ));
        // Legacy PRs must obey the same assessment boundary even without the new CI assets.
        alternate.schema_version = "1.0".to_string();
        alternate.source.batch_id = None;
        assert!(!merged_identity_matches(
            &alternate,
            &item,
            item.github_review.as_ref().unwrap(),
            &source
        ));
    }

    #[test]
    fn assessment_reference_changes_are_rejected_independently_of_registry_validity() {
        let (_, source, _) = submission_fixture();
        let mut original = serde_json::to_value(&source.package).unwrap();
        original["scoringPackage"]["rubricId"] = serde_json::Value::Null;
        original["scoringPackage"]["benchmarkSetVersion"] = serde_json::Value::Null;
        for pointer in [
            "/taskVersion",
            "/specVersions/planningSpecVersion",
            "/blueprintSlotId",
            "/taskFamilyId",
            "/itemFormatId",
            "/renderer/rendererVersion",
            "/deliveryPolicyRefs/navigationPolicyId",
            "/content/primaryCanDoId",
            "/content/primaryReportedSkill",
            "/content/communicativeActivity",
            "/content/primaryDomain",
            "/scoringPackage/scoringContractTemplateId",
            "/scoringPackage/scoringContractTemplateVersion",
            "/scoringPackage/rubricId",
            "/scoringPackage/benchmarkSetVersion",
        ] {
            let mut changed = original.clone();
            *changed.pointer_mut(pointer).unwrap() = json!("changed");
            let changed: TaskPackage = serde_json::from_value(changed).unwrap();
            assert!(
                !submission_settings_match(&changed, &source.package),
                "{pointer}"
            );
        }
    }

    #[test]
    fn newer_drafts_are_not_merge_targets_and_completed_imports_are_retryable() {
        let (mut item, source, _) = submission_fixture();
        assert!(source_is_current(&item, &source));
        item.revision += 1;
        assert!(!source_is_current(&item, &source));
        item.revision = source.created_from_draft_revision;
        item.latest_version_id = Some("LIV-newer".to_string());
        assert!(!source_is_current(&item, &source));
        let link = item.github_review.as_mut().unwrap();
        link.state = GithubReviewState::Merged;
        link.merge_commit_sha = Some("merged-sha".to_string());
        link.approved_version_id = Some("LIV-newer".to_string());
        assert!(import_already_applied(&item, Some("merged-sha")));
        assert!(!import_already_applied(&item, Some("different-merge")));
        // A user may already have started another draft after the successful import.
        // Retrying that delivery must skip this item, not require the old source pointer.
        item.latest_version_id = None;
        item.revision += 1;
        assert!(import_already_applied(&item, Some("merged-sha")));
    }

    #[test]
    fn worker_recovers_stale_deliveries_but_does_not_loop_on_blocked_content() {
        let current = chrono::DateTime::parse_from_rfc3339("2026-09-08T00:02:00Z")
            .unwrap()
            .with_timezone(&chrono::Utc);
        let mut delivery = GithubSyncDelivery {
            id: "delivery".to_string(),
            repository: "owner/review".to_string(),
            pull_request_number: 7,
            batch_id: "LIB-test".to_string(),
            merge_commit_sha: Some("merge".to_string()),
            actor_email: "github:webhook".to_string(),
            status: "queued".to_string(),
            error: None,
            created_at: "2026-09-08T00:00:00Z".to_string(),
            updated_at: "2026-09-08T00:00:00Z".to_string(),
            completed_at: None,
        };
        for status in ["queued", "failed", "running"] {
            delivery.status = status.to_string();
            assert!(delivery_ready_for_retry(&delivery, current), "{status}");
        }
        for status in ["completed", "blocked"] {
            delivery.status = status.to_string();
            assert!(!delivery_ready_for_retry(&delivery, current), "{status}");
        }
        delivery.status = "running".to_string();
        delivery.updated_at = "2026-09-08T00:01:30Z".to_string();
        assert!(!delivery_ready_for_retry(&delivery, current));
        delivery.status = "failed".to_string();
        assert!(!delivery_ready_for_retry(&delivery, current));
    }

    #[test]
    fn verifies_github_sha256_signature() {
        let body = br#"{"action":"closed"}"#;
        assert!(verify_webhook_signature(
            "secret",
            "sha256=336cf634bffeed63498de4350ea7c1c1ad9ecb668d04a357794118841e02c3db",
            body,
        ));
        assert!(!verify_webhook_signature(
            "secret",
            "sha256=003f6b8a4a4f5a8f54d43b0f07a2621f9867eddb6ca0e0432085ed12b99f0e99",
            body,
        ));
    }
}
