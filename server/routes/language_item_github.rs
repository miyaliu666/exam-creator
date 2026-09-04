use std::collections::HashMap;

use axum::{
    Extension, Json,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    config::GithubReviewConfig,
    database::prisma,
    errors::Error,
    language_items::{
        domain::{
            GithubReviewBatch, GithubReviewLink, GithubReviewState, LanguageItem,
            LanguageItemAuditEvent, LanguageItemRecordState, LanguageItemReview,
            LanguageItemStatus, LanguageItemVersion, ReviewDecision, TaskPackage,
            task_package_hash,
        },
        github::{GithubClient, RepositoryFile},
        validation::validate_task_package,
    },
    state::ServerState,
};

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
    state
        .workbench_database
        .audit_events
        .insert_one(LanguageItemAuditEvent {
            id: Uuid::new_v4().to_string(),
            item_id: item_id.to_string(),
            version_id: version_id.map(str::to_string),
            action: action.to_string(),
            actor_email: actor_email.to_string(),
            details,
            created_at: now(),
        })
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
        "## {}\n\n- Exam task: {}\n- Can-do: {}\n- Skill: {}\n- Communicative activity: {}\n- Item format: {}\n\n### Item-specific check\n\n{}",
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
                .count_documents(doc! { "itemId": &item.id })
                .await?
                + 1;
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
            schema_version: "1.0".to_string(),
            item_id: item.id.clone(),
            title: review_display_title(item),
            source: GithubItemSource {
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
        manifest_items.push(GithubBatchManifestItem {
            item_id: item.id.clone(),
            version_id: version.id.clone(),
            path: repository_path,
            content_hash: version.content_hash.clone(),
        });
    }
    let manifest = GithubBatchManifest {
        schema_version: "1.0",
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
        state
            .workbench_database
            .language_items
            .replace_one(doc! { "id": &item.id }, &item)
            .await?;
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
    let config = github_config(&state)?;
    let mut items: Vec<LanguageItem> = state
        .workbench_database
        .language_items
        .find(doc! { "githubReview.batchId": &batch_id })
        .await?
        .try_collect()
        .await?;
    if items.is_empty() {
        return Err(not_found("GitHub review batch", &batch_id));
    }
    let first_link = items[0]
        .github_review
        .as_ref()
        .expect("query guarantees GitHub review");
    if first_link.repository != config.repository {
        return Err(conflict(
            "GitHub review repository does not match configuration",
        ));
    }
    let github = GithubClient::new(&http_client, config);
    let remote = match github
        .pull_request_summary(first_link.pull_request_number)
        .await
    {
        Ok(remote) => remote,
        Err(error) => {
            let message = error.to_string();
            let _ = mark_sync_failed(&state, &mut items, &user.email, &message).await;
            return Err(error);
        }
    };
    let timestamp = now();

    let import_result = async {
        if remote.state != GithubReviewState::Merged {
            return Ok(None);
        }
        let merge_sha = remote.merge_commit_sha.as_deref().ok_or_else(|| {
            Error::Server(
                StatusCode::BAD_GATEWAY,
                "Merged GitHub PR did not include a merge commit SHA".to_string(),
            )
        })?;
        let mut files = HashMap::new();
        for item in &items {
            let link = item.github_review.as_ref().expect("query guarantees link");
            let bytes = github
                .repository_file_at(&link.repository_path, merge_sha)
                .await?;
            let file: GithubItemFile = serde_json::from_slice(&bytes).map_err(|error| {
                Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!("Merged GitHub item {} is invalid JSON: {error}", item.id),
                )
            })?;
            if file.schema_version != "1.0"
                || file.item_id != item.id
                || file.task_package.task_id != item.id
                || file.source.version_id != link.source_version_id
                || file.source.content_hash != link.source_content_hash
                || file.title.trim().is_empty()
            {
                return Err(Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!(
                        "Merged GitHub item {} has invalid identity metadata",
                        item.id
                    ),
                ));
            }
            let validation = validate_task_package(&file.task_package);
            if !validation.valid {
                return Err(Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    format!(
                        "Merged GitHub item {} failed validation: {}",
                        item.id,
                        serde_json::to_string(&validation).unwrap_or_default()
                    ),
                ));
            }
            files.insert(item.id.clone(), (file, validation));
        }
        Ok(Some(files))
    }
    .await;
    let imported_files = match import_result {
        Ok(files) => files,
        Err(error) => {
            let message = error.to_string();
            let _ = mark_sync_failed(&state, &mut items, &user.email, &message).await;
            return Err(error);
        }
    };

    let mut item_ids = Vec::new();
    for item in &mut items {
        item_ids.push(item.id.clone());
        let mut link = item
            .github_review
            .clone()
            .expect("query guarantees GitHub review");
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

        if let Some(files) = &imported_files {
            let (file, validation) = files.get(&item.id).expect("validated above");
            let final_hash = task_package_hash(&file.task_package);
            let current_version_id = item
                .latest_version_id
                .clone()
                .ok_or_else(|| conflict("Reviewed item lost its frozen version"))?;
            let mut current_version = state
                .workbench_database
                .versions
                .find_one(doc! { "id": &current_version_id })
                .await?
                .ok_or_else(|| not_found("language item version", &current_version_id))?;
            let changed = current_version.content_hash != final_hash
                || item.title.trim() != file.title.trim();
            current_version.content_hash = final_hash;
            current_version.lifecycle_status = "approved".to_string();
            current_version.package = file.task_package.clone();
            current_version.validation = validation.clone();
            current_version.submitted_by = format!(
                "github:{}",
                remote.merged_by.as_deref().unwrap_or("unknown")
            );
            state
                .workbench_database
                .versions
                .replace_one(doc! { "id": &current_version.id }, &current_version)
                .await?;
            if changed {
                item.revision += 1;
            }
            item.title = file.title.trim().to_string();
            item.draft = file.task_package.clone();
            item.latest_version_id = Some(current_version.id.clone());
            link.approved_version_id = Some(current_version.id);
        }
        item.github_review = Some(link.clone());
        item.updated_at = timestamp.clone();
        state
            .workbench_database
            .language_items
            .replace_one(doc! { "id": &item.id }, &*item)
            .await?;
        write_audit(
            &state,
            &item.id,
            item.latest_version_id.as_deref(),
            "github_review.synced",
            &user.email,
            json!({
                "batchId": batch_id,
                "pullRequestNumber": remote.number,
                "state": remote.state,
                "approvalCount": remote.approval_count,
                "changesRequestedCount": remote.changes_requested_count,
                "mergeCommitSha": remote.merge_commit_sha,
            }),
        )
        .await?;
    }
    Ok(Json(GithubReviewBatch {
        batch_id,
        repository: config.repository.clone(),
        pull_request_number: remote.number,
        pull_request_url: remote.html_url,
        state: remote.state,
        item_ids,
        approval_count: remote.approval_count,
        changes_requested_count: remote.changes_requested_count,
        last_synced_at: timestamp,
    }))
}

async fn mark_sync_failed(
    state: &ServerState,
    items: &mut [LanguageItem],
    actor_email: &str,
    message: &str,
) -> Result<(), Error> {
    let timestamp = now();
    for item in items {
        let Some(mut link) = item.github_review.clone() else {
            continue;
        };
        link.state = GithubReviewState::SyncFailed;
        link.sync_error = Some(message.chars().take(500).collect());
        link.last_synced_at = timestamp.clone();
        item.github_review = Some(link.clone());
        item.status = LanguageItemStatus::ReviewBlocked;
        item.updated_at = timestamp.clone();
        state
            .workbench_database
            .language_items
            .replace_one(doc! { "id": &item.id }, &*item)
            .await?;
        write_audit(
            state,
            &item.id,
            item.latest_version_id.as_deref(),
            "github_review.sync_failed",
            actor_email,
            json!({
                "batchId": link.batch_id,
                "pullRequestNumber": link.pull_request_number,
                "message": link.sync_error,
            }),
        )
        .await?;
    }
    Ok(())
}
