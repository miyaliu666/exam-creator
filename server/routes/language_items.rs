use std::{collections::HashMap, sync::Arc};

use axum::{
    Extension, Json,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::{doc, oid::ObjectId, serialize_to_document};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        ai,
        domain::{
            AiGenerationRun, AiReviewRun, CandidatePreview, DifficultyProfile, GithubReviewState,
            LanguageItem, LanguageItemAuditEvent, LanguageItemExport, LanguageItemRecordState,
            LanguageItemReview, LanguageItemReviewDiscussion, LanguageItemReviewDiscussionEvent,
            LanguageItemReviewDiscussionView, LanguageItemStatus, LanguageItemVersion,
            ReviewDecision, ReviewDiscussionEventKind, ReviewDiscussionKind,
            ReviewDiscussionStatus, StagingLanguageItem, TaskPackage, ValidationResult,
            ai_generation_setup_snapshot, task_package_hash,
        },
        export::build_legacy_export,
        registry::{
            RegistrySnapshot, WorkbenchCapability, active_snapshot, capability_for,
            context_supports_capability, difficulty_standards_for_capability, snapshot_for,
        },
        validation::{
            validate_candidate_privacy, validate_generation_setup, validate_task_package,
        },
    },
    state::ServerState,
};

#[cfg(test)]
use crate::language_items::registry::snapshot;

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn not_found(kind: &str, id: &str) -> Error {
    Error::Server(StatusCode::NOT_FOUND, format!("{kind} not found: {id}"))
}

fn conflict(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

fn pinned_registry(version: &str) -> Result<Arc<RegistrySnapshot>, Error> {
    snapshot_for(version).ok_or_else(|| {
        conflict(format!(
            "Registry version {version} is unavailable; the item cannot use a different rule version"
        ))
    })
}

fn require_owner(item: &LanguageItem, user: &prisma::ExamCreatorUser) -> Result<(), Error> {
    if item.owner_email == user.email {
        Ok(())
    } else {
        Err(Error::Server(
            StatusCode::FORBIDDEN,
            "only the item owner can change its draft or create versions".to_string(),
        ))
    }
}

fn require_mutable_draft(item: &LanguageItem) -> Result<(), Error> {
    if item.status == LanguageItemStatus::Draft {
        Ok(())
    } else {
        Err(conflict(
            "the submitted draft is locked; start a revision from a frozen version",
        ))
    }
}

fn require_active_item(item: &LanguageItem) -> Result<(), Error> {
    if item.record_state == LanguageItemRecordState::Active {
        Ok(())
    } else {
        Err(conflict(
            "archived or deleted items must be restored before they can be changed",
        ))
    }
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

fn discussion_status(events: &[LanguageItemReviewDiscussionEvent]) -> ReviewDiscussionStatus {
    events
        .iter()
        .fold(ReviewDiscussionStatus::Open, |status, event| {
            match event.kind {
                ReviewDiscussionEventKind::Addressed => ReviewDiscussionStatus::Addressed,
                ReviewDiscussionEventKind::Resolved => ReviewDiscussionStatus::Resolved,
                ReviewDiscussionEventKind::Reopened => ReviewDiscussionStatus::Open,
                ReviewDiscussionEventKind::Comment => status,
            }
        })
}

async fn review_discussion_views(
    state: &ServerState,
    item_id: &str,
) -> Result<Vec<LanguageItemReviewDiscussionView>, Error> {
    let discussions: Vec<LanguageItemReviewDiscussion> = state
        .workbench_database
        .review_discussions
        .find(doc! { "itemId": item_id })
        .sort(doc! { "createdAt": 1 })
        .await?
        .try_collect()
        .await?;
    if discussions.is_empty() {
        return Ok(Vec::new());
    }

    let discussion_ids: Vec<String> = discussions
        .iter()
        .map(|discussion| discussion.id.clone())
        .collect();
    let events: Vec<LanguageItemReviewDiscussionEvent> = state
        .workbench_database
        .review_discussion_events
        .find(doc! { "discussionId": { "$in": discussion_ids } })
        .sort(doc! { "createdAt": 1 })
        .await?
        .try_collect()
        .await?;
    let mut events_by_discussion: HashMap<String, Vec<LanguageItemReviewDiscussionEvent>> =
        HashMap::new();
    for event in events {
        events_by_discussion
            .entry(event.discussion_id.clone())
            .or_default()
            .push(event);
    }

    Ok(discussions
        .into_iter()
        .map(|discussion| {
            let events = events_by_discussion
                .remove(&discussion.id)
                .unwrap_or_default();
            LanguageItemReviewDiscussionView {
                status: discussion_status(&events),
                discussion,
                events,
            }
        })
        .collect())
}

async fn unresolved_change_request_count(
    state: &ServerState,
    item_id: &str,
) -> Result<usize, Error> {
    Ok(review_discussion_views(state, item_id)
        .await?
        .into_iter()
        .filter(|view| {
            view.discussion.kind == ReviewDiscussionKind::ChangeRequest
                && view.status != ReviewDiscussionStatus::Resolved
        })
        .count())
}

async fn compensate_failed_staging_export(
    state: &ServerState,
    artifact_id: &str,
    legacy_exam_id: Option<ObjectId>,
    export_id: &str,
) {
    let _ = state
        .workbench_database
        .exports
        .delete_one(doc! { "id": export_id })
        .await;
    if let Some(legacy_exam_id) = legacy_exam_id {
        let _ = state
            .staging_database
            .exam
            .delete_one(doc! { "_id": legacy_exam_id })
            .await;
        let _ = state
            .staging_database
            .exam_creator_exam
            .delete_one(doc! { "_id": legacy_exam_id })
            .await;
    }
    let _ = state
        .workbench_database
        .staging_items
        .delete_one(doc! { "id": artifact_id })
        .await;
}

pub async fn get_registry(_: prisma::ExamCreatorUser) -> Json<RegistrySnapshot> {
    Json((*active_snapshot()).clone())
}

pub async fn get_registry_version(
    _: prisma::ExamCreatorUser,
    Path(registry_version): Path<String>,
) -> Result<Json<RegistrySnapshot>, Error> {
    snapshot_for(&registry_version)
        .map(|registry| Json((*registry).clone()))
        .ok_or_else(|| not_found("Registry version", &registry_version))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderStatus {
    provider: String,
    model: String,
    uses_real_model: bool,
}

pub async fn get_ai_provider_status(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Json<AiProviderStatus> {
    let metadata = ai::provider_metadata(&state.env_vars.language_item_ai);
    Json(AiProviderStatus {
        provider: metadata.provider.to_string(),
        model: metadata.model.to_string(),
        uses_real_model: metadata.provider != ai::PROVIDER,
    })
}

pub async fn get_items(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<LanguageItem>>, Error> {
    let mut items: Vec<LanguageItem> = state
        .workbench_database
        .language_items
        .find(doc! {})
        .sort(doc! { "updatedAt": -1 })
        .await?
        .try_collect()
        .await?;
    for item in &mut items {
        item.draft.ensure_item_scoring_spec();
    }
    Ok(Json(items))
}

pub async fn get_review_queue(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<LanguageItem>>, Error> {
    let mut items: Vec<LanguageItem> = state
        .workbench_database
        .language_items
        .find(doc! {
            "status": { "$in": ["inReview", "reviewBlocked"] },
            "ownerEmail": { "$ne": user.email },
            "$or": [
                { "recordState": "active" },
                { "recordState": { "$exists": false } }
            ]
        })
        .sort(doc! { "updatedAt": 1 })
        .await?
        .try_collect()
        .await?;
    for item in &mut items {
        item.draft.ensure_item_scoring_spec();
    }
    Ok(Json(items))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateItemBody {
    title: Option<String>,
    template_id: Option<String>,
    blueprint_slot_id: Option<String>,
    item_format_id: Option<String>,
    primary_can_do_id: Option<String>,
    primary_domain: Option<String>,
    context_id: Option<String>,
    difficulty_band: Option<String>,
}

fn template_for_format(item_format_id: &str) -> Option<&'static str> {
    match item_format_id {
        "IF-SINGLE-SELECT" => Some("reading-single-select"),
        "IF-MATCHING" => Some("reading-matching"),
        "IF-RESTRICTED-INPUT" => Some("reading-restricted-input"),
        "IF-FORM-ENTRY" => Some("writing-form-entry"),
        "IF-TYPED-MESSAGE" => Some("writing-typed-message"),
        "IF-SPOKEN-SINGLE" => Some("speaking-single"),
        "IF-SPOKEN-MULTITURN" => Some("speaking-multiturn"),
        _ => None,
    }
}

pub(crate) fn draft_for_capability(
    id: String,
    capability: &WorkbenchCapability,
    registry: &RegistrySnapshot,
    requested_domain: Option<&str>,
    requested_context_id: Option<&str>,
    requested_difficulty_band: Option<&str>,
) -> Result<TaskPackage, Error> {
    let template_id = template_for_format(&capability.item_format_id).ok_or_else(|| {
        Error::Server(
            StatusCode::BAD_REQUEST,
            format!(
                "unsupported language item format: {}",
                capability.item_format_id
            ),
        )
    })?;
    let mut package = TaskPackage::from_template(id, template_id).ok_or_else(|| {
        Error::Server(
            StatusCode::BAD_REQUEST,
            format!("unsupported language item template: {template_id}"),
        )
    })?;

    let mut contexts = registry.context_options.iter().filter(|context| {
        capability.allowed_context_ids.contains(&context.id)
            && context_supports_capability(context, capability)
    });
    let context = contexts
        .find(|context| {
            requested_context_id.is_none_or(|id| context.id == id)
                && requested_domain.is_none_or(|domain| {
                    context.primary_domains.iter().any(|value| value == domain)
                })
        })
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "no active Context supports {} × {} × {} for the requested Domain",
                    capability.blueprint_slot_id,
                    capability.item_format_id,
                    capability.primary_can_do_id
                ),
            )
        })?;
    let domain = requested_domain
        .map(str::to_string)
        .or_else(|| context.primary_domains.first().cloned())
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("Context {} does not belong to a Domain", context.id),
            )
        })?;
    if !capability.allowed_domains.contains(&domain) {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!("Domain {domain} is not allowed for the selected capability"),
        ));
    }

    package.blueprint_slot_id = capability.blueprint_slot_id.clone();
    package.task_family_id = capability.task_family_id.clone();
    package.item_format_id = capability.item_format_id.clone();
    package.renderer.renderer_id = capability.renderer_id.clone();
    package.scoring_package.scoring_contract_template_id =
        capability.scoring_contract_template_id.clone();
    package.content.primary_can_do_id = capability.primary_can_do_id.clone();
    package.content.primary_reported_skill = capability.primary_reported_skill.clone();
    package.content.communicative_activity = capability.communicative_activity.clone();
    package.content.primary_domain = domain;
    package.content.context_id = context.id.clone();
    package.content.target_content_ids.clear();
    package.content.supporting_content_refs.clear();
    package.content.required_information_points.clear();
    package.delivery_policy_refs = capability.delivery_policy_refs.clone();
    let standards = difficulty_standards_for_capability(registry, capability);
    let difficulty_standard = requested_difficulty_band
        .and_then(|band| standards.iter().find(|standard| standard.id == band))
        .or_else(|| standards.iter().find(|standard| standard.id == "TypicalA1"))
        .or_else(|| standards.first())
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                "the selected capability has no difficulty profiles".to_string(),
            )
        })?;
    if requested_difficulty_band.is_some_and(|band| band != difficulty_standard.id) {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "the requested difficulty band is not allowed for the selected capability".to_string(),
        ));
    }
    package.content.difficulty_band = difficulty_standard.id.clone();
    package.content.difficulty = Some(difficulty_for_selection(
        capability,
        registry,
        &difficulty_standard.id,
    )?);
    if let Some(contract) = registry.scoring_contracts.iter().find(|contract| {
        contract.scoring_contract_template_id == capability.scoring_contract_template_id
    }) {
        package.scoring_package.scoring_contract_template_version =
            contract.template_version.clone();
    }
    package.ensure_item_scoring_spec();
    Ok(package)
}

fn difficulty_for_selection(
    capability: &WorkbenchCapability,
    registry: &RegistrySnapshot,
    band: &str,
) -> Result<DifficultyProfile, Error> {
    let difficulty_standard = difficulty_standards_for_capability(registry, capability)
        .iter()
        .find(|standard| standard.id == band)
        .ok_or_else(|| Error::Server(StatusCode::UNPROCESSABLE_ENTITY,
            "the requested difficulty band is unavailable in the item's saved Assessment Settings".to_string()))?;
    // Response shape belongs to the fixed item template; every configurable
    // driver and the rationale come from the item's immutable Registry version.
    let mut difficulty = template_for_format(&capability.item_format_id)
        .and_then(|template| TaskPackage::from_template(String::new(), template))
        .and_then(|package| package.content.difficulty)
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                "the selected item format has no difficulty template".to_string(),
            )
        })?;
    difficulty.intended_band = difficulty_standard.id.clone();
    difficulty.status = "AuthorEstimated".to_string();
    difficulty.drivers.input_length = difficulty_standard.default_drivers.input_length.clone();
    difficulty.drivers.information_points = difficulty_standard.default_drivers.information_points;
    difficulty.drivers.support_level = difficulty_standard.default_drivers.support_level.clone();
    difficulty.drivers.distractor_similarity = if matches!(
        capability.item_format_id.as_str(),
        "IF-SINGLE-SELECT" | "IF-MATCHING"
    ) {
        difficulty_standard
            .default_drivers
            .distractor_similarity
            .clone()
    } else {
        "notApplicable".to_string()
    };
    difficulty.drivers.independence_level = difficulty_standard
        .default_drivers
        .independence_level
        .clone();
    difficulty.drivers.inference_required = difficulty_standard.default_drivers.inference_required;
    difficulty.rationale = vec![difficulty_standard.description.clone()];
    Ok(difficulty)
}

fn apply_locked_draft_setup(
    previous: &TaskPackage,
    proposed: &mut TaskPackage,
) -> Result<(), Error> {
    if proposed.blueprint_slot_id != previous.blueprint_slot_id
        || proposed.item_format_id != previous.item_format_id
        || proposed.content.primary_can_do_id != previous.content.primary_can_do_id
        || json!(&proposed.spec_versions) != json!(&previous.spec_versions)
    {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "task configuration and saved Assessment Settings are locked after item creation"
                .to_string(),
        ));
    }
    if proposed.content.difficulty_band == previous.content.difficulty_band {
        // Keep historical saved profiles intact. Comparing with the persisted
        // value prevents tuning without silently reinterpreting existing items.
        if json!(&proposed.content.difficulty) != json!(&previous.content.difficulty) {
            return Err(Error::Server(StatusCode::UNPROCESSABLE_ENTITY,
                "difficulty rules cannot be edited on an item; select a complete difficulty profile or change rules in Assessment Settings".to_string()));
        }
    } else {
        let registry = pinned_registry(&previous.spec_versions.registry_bundle_version)?;
        let capability = capability_for(
            &registry,
            &previous.blueprint_slot_id,
            &previous.item_format_id,
            Some(&previous.content.primary_can_do_id),
        )
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                "the item's task configuration is unavailable in its saved Assessment Settings"
                    .to_string(),
            )
        })?;
        proposed.content.difficulty = Some(difficulty_for_selection(
            capability,
            &registry,
            &proposed.content.difficulty_band,
        )?);
    }
    Ok(())
}

fn blocks_draft_save(issue: &crate::language_items::domain::ValidationIssue) -> bool {
    // Setup changes may temporarily leave authored language targets incompatible.
    // Preserve them in drafts; generation, checking and submission still reject them.
    (issue.code.starts_with("registry.") && issue.code != "registry.contentCompatibility")
        || issue.code.starts_with("contract.")
        || issue.code.starts_with("capability.")
        || issue.code == "schema.uniqueItems"
}

fn apply_locked_capability_contract(package: &mut TaskPackage) -> Result<(), Error> {
    let registry = pinned_registry(&package.spec_versions.registry_bundle_version)?;
    let capability = capability_for(
        &registry,
        &package.blueprint_slot_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    )
    .ok_or_else(|| {
        Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            format!(
                "item format {} is not allowed for blueprint slot {}",
                package.item_format_id, package.blueprint_slot_id
            ),
        )
    })?;

    // These values are Registry-owned, not author input. Reapplying them on
    // every save also repairs mutable drafts created under an older Registry.
    package.task_family_id = capability.task_family_id.clone();
    package.renderer.renderer_id = capability.renderer_id.clone();
    package.scoring_package.scoring_contract_template_id =
        capability.scoring_contract_template_id.clone();
    if let Some(contract) = registry.scoring_contracts.iter().find(|contract| {
        contract.scoring_contract_template_id == capability.scoring_contract_template_id
    }) {
        package.scoring_package.scoring_contract_template_version =
            contract.template_version.clone();
    }
    package.content.primary_can_do_id = capability.primary_can_do_id.clone();
    package.content.primary_reported_skill = capability.primary_reported_skill.clone();
    package.content.communicative_activity = capability.communicative_activity.clone();
    package.delivery_policy_refs = capability.delivery_policy_refs.clone();
    package.scoring_package.item_scoring_version = "0.1".to_string();
    package.scoring_package.scoring_points.clear();
    package.scoring_package.max_raw_score = 0;
    package.scoring_package.answer_key_ref = None;
    package.scoring_package.task_specific_criteria.clear();
    package.scoring_package.rubric_id = match package.item_format_id.as_str() {
        "IF-TYPED-MESSAGE" => Some("RUB-W-A1-v0.1".to_string()),
        "IF-SPOKEN-SINGLE" => Some("RUB-S-A1-PRODUCTION-v0.1".to_string()),
        "IF-SPOKEN-MULTITURN" => Some("RUB-S-A1-INTERACTION-v0.1".to_string()),
        _ => None,
    };
    package.scoring_package.benchmark_set_version = package
        .scoring_package
        .rubric_id
        .as_ref()
        .map(|_| "PendingRealCandidateResponses".to_string());
    package.ensure_item_scoring_spec();
    Ok(())
}

pub async fn post_item(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Json(body): Json<CreateItemBody>,
) -> Result<Json<LanguageItem>, Error> {
    let id = format!("LI-{}", Uuid::new_v4());
    let timestamp = now();
    let registry = active_snapshot();
    let selected_capability = match (&body.blueprint_slot_id, &body.item_format_id) {
        (Some(slot_id), Some(format_id)) => Some(
            capability_for(
                &registry,
                slot_id,
                format_id,
                body.primary_can_do_id.as_deref(),
            )
            .ok_or_else(|| {
                Error::Server(
                    StatusCode::BAD_REQUEST,
                    format!("item format {format_id} is not allowed for blueprint slot {slot_id}"),
                )
            })?,
        ),
        (None, None) => None,
        _ => {
            return Err(Error::Server(
                StatusCode::BAD_REQUEST,
                "blueprintSlotId and itemFormatId must be selected together".to_string(),
            ));
        }
    };
    let draft = if let Some(capability) = selected_capability {
        draft_for_capability(
            id.clone(),
            capability,
            &registry,
            body.primary_domain.as_deref(),
            body.context_id.as_deref(),
            body.difficulty_band.as_deref(),
        )?
    } else {
        let template_id = body
            .template_id
            .as_deref()
            .unwrap_or("reading-single-select");
        let template = TaskPackage::from_template(id.clone(), template_id).ok_or_else(|| {
            Error::Server(
                StatusCode::BAD_REQUEST,
                format!("unsupported language item template: {template_id}"),
            )
        })?;
        let capability = capability_for(
            &registry,
            &template.blueprint_slot_id,
            &template.item_format_id,
            Some(&template.content.primary_can_do_id),
        )
        .ok_or_else(|| {
            Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                "the requested template is unavailable in the active Assessment Settings"
                    .to_string(),
            )
        })?;
        draft_for_capability(
            id.clone(),
            capability,
            &registry,
            body.primary_domain.as_deref(),
            body.context_id.as_deref(),
            body.difficulty_band.as_deref(),
        )?
    };
    let mut draft = draft;
    draft.spec_versions.registry_bundle_version = registry.bundle_version.clone();
    let item = LanguageItem {
        id: id.clone(),
        title: body
            .title
            .map(|title| title.trim().to_string())
            .unwrap_or_default(),
        owner_email: user.email.clone(),
        status: LanguageItemStatus::Draft,
        record_state: LanguageItemRecordState::Active,
        record_state_updated_at: None,
        record_state_updated_by: None,
        has_staging_export: false,
        github_review: None,
        revision: 1,
        draft,
        latest_version_id: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state
        .workbench_database
        .language_items
        .insert_one(&item)
        .await?;
    write_audit(&state, &id, None, "item.created", &user.email, json!({})).await?;
    Ok(Json(item))
}

pub async fn get_item(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<LanguageItem>, Error> {
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    item.draft.ensure_item_scoring_spec();
    Ok(Json(item))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRecordStateBody {
    record_state: LanguageItemRecordState,
}

async fn set_record_state(
    state: &ServerState,
    user: &prisma::ExamCreatorUser,
    item_id: &str,
    target: LanguageItemRecordState,
) -> Result<LanguageItem, Error> {
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": item_id })
        .await?
        .ok_or_else(|| not_found("language item", item_id))?;
    require_owner(&item, user)?;

    if item.record_state == target {
        return Ok(item);
    }
    if item.record_state == LanguageItemRecordState::Deleted
        && target == LanguageItemRecordState::Archived
    {
        return Err(conflict("restore the deleted item before archiving it"));
    }

    let previous = item.record_state;
    let timestamp = now();
    item.record_state = target;
    item.record_state_updated_at = Some(timestamp.clone());
    item.record_state_updated_by = Some(user.email.clone());
    item.updated_at = timestamp;
    let result = state
        .workbench_database
        .language_items
        .replace_one(doc! { "id": item_id }, &item)
        .await?;
    if result.matched_count != 1 {
        return Err(conflict("item record state was updated concurrently"));
    }

    let (action, target_label) = match target {
        LanguageItemRecordState::Active => ("item.restored", "active"),
        LanguageItemRecordState::Archived => ("item.archived", "archived"),
        LanguageItemRecordState::Deleted => ("item.deleted", "deleted"),
    };
    write_audit(
        state,
        item_id,
        item.latest_version_id.as_deref(),
        action,
        &user.email,
        json!({
            "from": match previous {
                LanguageItemRecordState::Active => "active",
                LanguageItemRecordState::Archived => "archived",
                LanguageItemRecordState::Deleted => "deleted",
            },
            "to": target_label,
        }),
    )
    .await?;
    Ok(item)
}

pub async fn put_record_state(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
    Json(body): Json<UpdateRecordStateBody>,
) -> Result<Json<LanguageItem>, Error> {
    if body.record_state == LanguageItemRecordState::Deleted {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "use DELETE /api/language-items/{item_id} to delete an item".to_string(),
        ));
    }
    Ok(Json(
        set_record_state(&state, &user, &item_id, body.record_state).await?,
    ))
}

pub async fn delete_item(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<LanguageItem>, Error> {
    Ok(Json(
        set_record_state(&state, &user, &item_id, LanguageItemRecordState::Deleted).await?,
    ))
}

pub async fn get_candidate_preview(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<CandidatePreview>, Error> {
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    Ok(Json(checked_candidate_preview(&item.draft)?))
}

fn checked_candidate_preview(package: &TaskPackage) -> Result<CandidatePreview, Error> {
    // Incomplete drafts remain previewable, but historical private metadata must
    // not escape merely because it predates the save-time boundary check.
    if !validate_candidate_privacy(package).is_empty() {
        return Err(Error::Server(StatusCode::UNPROCESSABLE_ENTITY,
            "Candidate content contains private answer or review metadata. Remove it before previewing.".to_string()));
    }
    Ok(CandidatePreview::from(package))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDraftBody {
    expected_revision: u64,
    title: String,
    package: TaskPackage,
}

pub async fn put_draft(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
    Json(body): Json<UpdateDraftBody>,
) -> Result<Json<LanguageItem>, Error> {
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    require_mutable_draft(&item)?;
    if item.revision != body.expected_revision {
        return Err(conflict(format!(
            "draft revision changed: expected {}, current {}",
            body.expected_revision, item.revision
        )));
    }
    if body.package.task_id != item_id {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "package taskId must match item id".to_string(),
        ));
    }
    if body.title.trim().is_empty() {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "title cannot be empty".to_string(),
        ));
    }
    let mut proposed_package = body.package;
    apply_locked_draft_setup(&item.draft, &mut proposed_package)?;
    apply_locked_capability_contract(&mut proposed_package)?;
    let constraint_validation = validate_task_package(&proposed_package);
    let constraint_issues: Vec<_> = constraint_validation
        .issues
        .iter()
        .filter(|issue| blocks_draft_save(issue))
        .collect();
    if !constraint_issues.is_empty() {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&constraint_issues)
                .unwrap_or_else(|_| "draft violates locked constraints".to_string()),
        ));
    }
    item.title = body.title.trim().to_string();
    item.draft = proposed_package;
    item.revision += 1;
    item.status = LanguageItemStatus::Draft;
    item.latest_version_id = None;
    item.updated_at = now();
    let result = state
        .workbench_database
        .language_items
        .replace_one(
            doc! { "id": &item_id, "revision": body.expected_revision as i64 },
            &item,
        )
        .await?;
    if result.matched_count != 1 {
        return Err(conflict("draft was updated concurrently"));
    }
    write_audit(
        &state,
        &item_id,
        None,
        "draft.updated",
        &user.email,
        json!({ "revision": item.revision }),
    )
    .await?;
    Ok(Json(item))
}

pub async fn post_validate(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<ValidationResult>, Error> {
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_active_item(&item)?;
    let result = validate_task_package(&item.draft);
    write_audit(
        &state,
        &item_id,
        item.latest_version_id.as_deref(),
        "draft.validated",
        &user.email,
        json!({ "valid": result.valid, "issueCount": result.issues.len() }),
    )
    .await?;
    Ok(Json(result))
}

pub async fn get_versions(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<LanguageItemVersion>>, Error> {
    let versions = state
        .workbench_database
        .versions
        .find(doc! { "itemId": &item_id })
        .sort(doc! { "versionNumber": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(versions))
}

pub async fn get_exports(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<LanguageItemExport>>, Error> {
    let exports = state
        .workbench_database
        .exports
        .find(doc! { "itemId": &item_id })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(exports))
}

pub async fn get_audit_events(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<LanguageItemAuditEvent>>, Error> {
    let events = state
        .workbench_database
        .audit_events
        .find(doc! { "itemId": &item_id })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(events))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreezeVersionBody {
    expected_revision: u64,
}

pub async fn post_version(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
    Json(body): Json<FreezeVersionBody>,
) -> Result<Json<LanguageItemVersion>, Error> {
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    require_mutable_draft(&item)?;
    if item.revision != body.expected_revision {
        return Err(conflict(format!(
            "draft revision changed: expected {}, current {}",
            body.expected_revision, item.revision
        )));
    }
    let validation = validate_task_package(&item.draft);
    if !validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&validation).unwrap_or_else(|_| "invalid draft".to_string()),
        ));
    }
    let version_number = state
        .workbench_database
        .versions
        .count_documents(doc! { "itemId": &item_id })
        .await?
        + 1;
    let version_id = format!("LIV-{}", Uuid::new_v4());
    let mut package = item.draft.clone();
    package.task_version = version_number.to_string();
    let content_hash = task_package_hash(&package);
    let version = LanguageItemVersion {
        id: version_id.clone(),
        item_id: item_id.clone(),
        version_number,
        created_from_draft_revision: item.revision,
        author_email: user.email.clone(),
        submitted_by: user.email.clone(),
        frozen: true,
        evidence_content_hash: Some(crate::language_items::evidence::evidence_content_hash(
            &package,
        )),
        content_hash,
        lifecycle_status: "submitted".to_string(),
        package,
        validation,
        created_at: now(),
    };
    state
        .workbench_database
        .versions
        .insert_one(&version)
        .await?;
    let precheck = LanguageItemReview {
        id: format!("LIR-{}", Uuid::new_v4()),
        version_id: version_id.clone(),
        gate_id: "automatedPrecheck".to_string(),
        decision: ReviewDecision::Approved,
        field_path: None,
        rule_ref: Some("review.automatedPrecheck".to_string()),
        comment: "Server validation passed at freeze time.".to_string(),
        reviewer_email: "system".to_string(),
        created_at: now(),
    };
    if let Err(error) = state.workbench_database.reviews.insert_one(&precheck).await {
        state
            .workbench_database
            .versions
            .delete_one(doc! { "id": &version_id })
            .await?;
        return Err(error.into());
    }
    item.status = LanguageItemStatus::ReadyForReview;
    item.latest_version_id = Some(version_id.clone());
    item.updated_at = now();
    let replace_result = state
        .workbench_database
        .language_items
        .replace_one(
            doc! { "id": &item_id, "revision": body.expected_revision as i64 },
            &item,
        )
        .await?;
    if replace_result.matched_count != 1 {
        state
            .workbench_database
            .reviews
            .delete_one(doc! { "id": &precheck.id })
            .await?;
        state
            .workbench_database
            .versions
            .delete_one(doc! { "id": &version_id })
            .await?;
        return Err(conflict("draft was updated concurrently"));
    }
    write_audit(
        &state,
        &item_id,
        Some(&version_id),
        "version.frozen",
        &user.email,
        json!({ "versionNumber": version_number }),
    )
    .await?;
    Ok(Json(version))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviseVersionBody {
    expected_revision: u64,
}

pub async fn post_revise_version(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
    Json(body): Json<ReviseVersionBody>,
) -> Result<Json<LanguageItem>, Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &version.item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    if item.revision != body.expected_revision {
        return Err(conflict(format!(
            "draft revision changed: expected {}, current {}",
            body.expected_revision, item.revision
        )));
    }
    if item.github_review.as_ref().is_some_and(|review| {
        !matches!(
            review.state,
            GithubReviewState::Merged | GithubReviewState::Closed
        )
    }) {
        return Err(conflict(
            "Finish or close the active GitHub review before starting a new revision",
        ));
    }

    let prior_github_review = item.github_review.take();
    item.draft = version.package.clone();
    item.draft.task_version = "draft".to_string();
    item.revision += 1;
    item.status = LanguageItemStatus::Draft;
    item.latest_version_id = None;
    item.has_staging_export = false;
    item.updated_at = now();
    let result = state
        .workbench_database
        .language_items
        .replace_one(
            doc! { "id": &version.item_id, "revision": body.expected_revision as i64 },
            &item,
        )
        .await?;
    if result.matched_count != 1 {
        return Err(conflict("draft was updated concurrently"));
    }
    write_audit(
        &state,
        &version.item_id,
        Some(&version_id),
        "version.revision.started",
        &user.email,
        json!({
            "revision": item.revision,
            "priorGithubReview": prior_github_review,
        }),
    )
    .await?;
    Ok(Json(item))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerationBody {
    count: Option<u64>,
    idempotency_key: Option<String>,
}

impl AiGenerationBody {
    fn candidate_count(&self) -> Result<u64, Error> {
        let count = self.count.unwrap_or(3);
        ai::validate_candidate_count(count)
            .map_err(|message| Error::Server(StatusCode::BAD_REQUEST, message.to_string()))?;
        Ok(count)
    }
}

pub async fn post_ai_generation(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    Path(item_id): Path<String>,
    Json(body): Json<AiGenerationBody>,
) -> Result<Json<AiGenerationRun>, Error> {
    let count = body.candidate_count()?;
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    let idempotency_key = body
        .idempotency_key
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    if idempotency_key
        .as_ref()
        .is_some_and(|value| value.chars().count() > 128)
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "AI generation idempotency key must not exceed 128 characters".to_string(),
        ));
    }
    if let Some(key) = &idempotency_key
        && let Some(existing) = state
            .workbench_database
            .ai_generation_runs
            .find_one(doc! {
                "itemId": &item_id,
                "createdBy": &user.email,
                "idempotencyKey": key,
            })
            .await?
    {
        return Ok(Json(existing));
    }
    require_mutable_draft(&item)?;
    let setup_validation = validate_generation_setup(&item.draft);
    if !setup_validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&setup_validation)
                .unwrap_or_else(|_| "The authoring setup is incomplete".to_string()),
        ));
    }
    let metadata = ai::provider_metadata(&state.env_vars.language_item_ai);
    let timestamp = now();
    let run = AiGenerationRun {
        id: format!("AIR-{}", Uuid::new_v4()),
        item_id: item_id.clone(),
        provider: metadata.provider.to_string(),
        model: metadata.model.to_string(),
        model_version: metadata.model_version.to_string(),
        prompt_id: ai::GENERATION_PROMPT_ID.to_string(),
        prompt_version: ai::GENERATION_PROMPT_VERSION.to_string(),
        output_schema_version: ai::GENERATION_OUTPUT_SCHEMA_VERSION.to_string(),
        spec_versions: item.draft.spec_versions.clone(),
        blueprint_slot_id: item.draft.blueprint_slot_id.clone(),
        task_family_id: item.draft.task_family_id.clone(),
        item_format_id: item.draft.item_format_id.clone(),
        renderer_id: item.draft.renderer.renderer_id.clone(),
        primary_can_do_id: item.draft.content.primary_can_do_id.clone(),
        primary_domain: item.draft.content.primary_domain.clone(),
        context_id: item.draft.content.context_id.clone(),
        difficulty_band: item.draft.content.difficulty_band.clone(),
        target_content_ids: item.draft.content.target_content_ids.clone(),
        required_information_points: item
            .draft
            .content
            .required_information_points
            .iter()
            .map(|point| point.label.clone())
            .collect(),
        generation_setup_snapshot: Some(ai_generation_setup_snapshot(&item.draft)),
        requested_count: count,
        candidates: Vec::new(),
        adopted_candidate_id: None,
        status: "queued".to_string(),
        error: None,
        idempotency_key,
        attempt_count: 0,
        retry_count: 0,
        elapsed_milliseconds: None,
        provider_calls: Vec::new(),
        candidate_errors: Vec::new(),
        created_by: user.email.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
        completed_at: None,
    };
    state
        .workbench_database
        .ai_generation_runs
        .insert_one(&run)
        .await?;
    write_audit(
        &state,
        &item_id,
        None,
        "ai.generation.queued",
        &user.email,
        json!({ "runId": run.id, "count": count }),
    )
    .await?;
    let background_state = state.clone();
    let background_client = http_client.clone();
    let background_run_id = run.id.clone();
    let background_package = item.draft.clone();
    let background_actor = user.email;
    tokio::spawn(async move {
        if let Err(error) = execute_ai_generation(
            background_state,
            background_client,
            background_run_id,
            background_package,
            background_actor,
            count,
            None,
        )
        .await
        {
            tracing::error!(error = %error, "background language-item AI generation failed");
        }
    });
    Ok(Json(run))
}

pub(crate) async fn execute_ai_generation(
    state: ServerState,
    http_client: reqwest::Client,
    run_id: String,
    package: TaskPackage,
    actor_email: String,
    count: u64,
    batch: Option<(&str, &str)>,
) -> Result<(), Error> {
    let Some(mut run) = state
        .workbench_database
        .ai_generation_runs
        .find_one(doc! { "id": &run_id })
        .await?
    else {
        return Ok(());
    };
    let claimed = state
        .workbench_database
        .ai_generation_runs
        .update_one(
            doc! { "id": &run_id, "status": "queued" },
            doc! { "$set": { "status": "running", "updatedAt": now() } },
        )
        .await?;
    if claimed.matched_count != 1 {
        return Ok(());
    }
    run.status = "running".to_string();
    run.updated_at = now();

    let report = ai::generate_candidates_independently(
        &state.env_vars.language_item_ai,
        &http_client,
        &package,
        count,
        || async {
            let Some((batch_id, worker_token)) = batch else {
                return true;
            };
            match state.workbench_database.batch_generation_jobs.find_one(doc! {
                "id": batch_id,
                "workerToken": worker_token,
                "status": { "$in": ["queued", "running"] },
                "leaseExpiresAt": { "$gt": crate::language_items::batch::now() },
            }).await {
                Ok(job) => job.is_some(),
                Err(error) => {
                    tracing::error!(batch_id = %batch_id, error = %error, "cannot confirm batch may start another candidate request");
                    false
                }
            }
        },
    )
    .await;
    let completed_at = now();
    run.status = if report.candidates.is_empty() {
        "failed"
    } else if report.candidates.len() as u64 != count || !report.errors.is_empty() {
        "partial"
    } else {
        "completed"
    }
    .to_string();
    run.error = (!report.errors.is_empty()).then(|| report.errors.join("; "));
    run.candidate_errors = report.errors;
    run.candidates = report.candidates;
    run.attempt_count = report.attempt_count;
    run.retry_count = report.retry_count;
    run.elapsed_milliseconds = Some(report.elapsed_milliseconds);
    run.provider_calls = report.provider_calls;
    run.updated_at = completed_at.clone();
    run.completed_at = Some(completed_at);
    let persisted = state
        .workbench_database
        .ai_generation_runs
        .replace_one(doc! { "id": &run_id, "status": "running" }, &run)
        .await;
    let persisted = match persisted {
        Ok(result) => result,
        Err(error) => {
            tracing::error!(run_id = %run_id, error = %error, "AI generation results could not be persisted");
            discard_unsaved_ai_generation_results(&mut run);
            // A large result must not leave a charged run looking active forever. The condition
            // also preserves a completed write whose acknowledgement failed transiently.
            state
                .workbench_database
                .ai_generation_runs
                .replace_one(doc! { "id": &run_id, "status": "running" }, &run)
                .await?
        }
    };
    if persisted.matched_count != 1 {
        return Ok(());
    }
    write_audit(
        &state,
        &run.item_id,
        None,
        match run.status.as_str() {
            "completed" => "ai.generation.completed",
            "partial" => "ai.generation.partial",
            _ => "ai.generation.failed",
        },
        &actor_email,
        json!({
            "runId": run.id,
            "requestedCount": count,
            "candidateCount": run.candidates.len(),
            "attemptCount": run.attempt_count,
            "retryCount": run.retry_count,
            "errors": run.candidate_errors,
        }),
    )
    .await
}

fn discard_unsaved_ai_generation_results(run: &mut AiGenerationRun) {
    let message = "AI generation finished, but its results could not be saved. No candidates were saved for this run. Request fewer candidates or retry explicitly; this run will not be generated again automatically.";
    run.status = "failed".to_string();
    run.error = Some(message.to_string());
    run.candidate_errors = vec![message.to_string()];
    run.candidates.clear();
    run.provider_calls.clear();
}

pub async fn get_ai_runs(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<AiGenerationRun>>, Error> {
    let runs = state
        .workbench_database
        .ai_generation_runs
        .find(doc! { "itemId": &item_id })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(runs))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptCandidateBody {
    expected_revision: u64,
}

fn generation_setup_matches(run: &AiGenerationRun, package: &TaskPackage) -> bool {
    if let Some(snapshot) = &run.generation_setup_snapshot {
        return snapshot == &ai_generation_setup_snapshot(package);
    }
    // Older runs did not persist the full brief. Compare every setup field they
    // did record without making unrelated title or payload edits stale a run.
    json!(&run.spec_versions) == json!(&package.spec_versions)
        && run.blueprint_slot_id == package.blueprint_slot_id
        && run.task_family_id == package.task_family_id
        && run.item_format_id == package.item_format_id
        && run.renderer_id == package.renderer.renderer_id
        && run.primary_can_do_id == package.content.primary_can_do_id
        && run.primary_domain == package.content.primary_domain
        && run.context_id == package.content.context_id
        && run.difficulty_band == package.content.difficulty_band
        && run.target_content_ids == package.content.target_content_ids
        && run.required_information_points
            == package
                .content
                .required_information_points
                .iter()
                .map(|point| point.label.clone())
                .collect::<Vec<_>>()
}

pub async fn post_adopt_candidate(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path((item_id, run_id, candidate_id)): Path<(String, String, String)>,
    Json(body): Json<AdoptCandidateBody>,
) -> Result<Json<LanguageItem>, Error> {
    let mut run = state
        .workbench_database
        .ai_generation_runs
        .find_one(doc! { "id": &run_id, "itemId": &item_id })
        .await?
        .ok_or_else(|| not_found("AI run", &run_id))?;
    let candidate = run
        .candidates
        .iter()
        .find(|candidate| candidate.id == candidate_id)
        .cloned()
        .ok_or_else(|| not_found("AI candidate", &candidate_id))?;
    if !candidate.validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "cannot adopt an invalid candidate".to_string(),
        ));
    }
    let mut item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    require_mutable_draft(&item)?;
    if item.revision != body.expected_revision {
        return Err(conflict("draft revision changed before candidate adoption"));
    }
    if !generation_setup_matches(&run, &item.draft) {
        return Err(conflict(
            "the item setup changed after this AI run; generate new drafts before adopting a candidate",
        ));
    }
    let mut proposed = item.draft.clone();
    proposed.candidate_payload = candidate.candidate_payload.clone();
    proposed.authoring_package.english_translations = candidate.english_translations.clone();
    if let Some(scoring_package) = &candidate.proposed_scoring_package {
        proposed.scoring_package = scoring_package.clone();
    } else {
        proposed.scoring_package.correct_option_id = candidate.proposed_correct_option_id.clone();
    }
    apply_locked_capability_contract(&mut proposed)?;
    let validation = validate_task_package(&proposed);
    if !validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&validation)
                .unwrap_or_else(|_| "adopted draft would be invalid".to_string()),
        ));
    }
    item.draft = proposed;
    item.revision += 1;
    item.status = LanguageItemStatus::Draft;
    item.latest_version_id = None;
    item.updated_at = now();
    let result = state
        .workbench_database
        .language_items
        .replace_one(
            doc! { "id": &item_id, "revision": body.expected_revision as i64 },
            &item,
        )
        .await?;
    if result.matched_count != 1 {
        return Err(conflict("draft was updated concurrently"));
    }
    for stored_candidate in &mut run.candidates {
        if stored_candidate.id == candidate_id {
            stored_candidate.status = "adopted".to_string();
        } else if stored_candidate.status == "valid" {
            stored_candidate.status = "discarded".to_string();
        }
    }
    run.adopted_candidate_id = Some(candidate_id.clone());
    state
        .workbench_database
        .ai_generation_runs
        .replace_one(doc! { "id": &run_id }, &run)
        .await?;
    write_audit(
        &state,
        &item_id,
        None,
        "ai.candidate.adopted",
        &user.email,
        json!({ "runId": run_id, "candidateId": candidate_id }),
    )
    .await?;
    Ok(Json(item))
}

pub async fn post_ai_review(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    Path(version_id): Path<String>,
) -> Result<Json<AiReviewRun>, Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &version.item_id))?;
    require_active_item(&item)?;
    let run = build_ai_review_run(
        &state,
        &http_client,
        &version.item_id,
        Some(version_id.clone()),
        None,
        &version.package,
        &user.email,
    )
    .await;
    state
        .workbench_database
        .ai_review_runs
        .insert_one(&run)
        .await?;
    write_audit(
        &state,
        &version.item_id,
        Some(&version_id),
        if run.status == "completed" {
            "ai.review.completed"
        } else {
            "ai.review.failed"
        },
        &user.email,
        json!({ "runId": run.id }),
    )
    .await?;
    Ok(Json(run))
}

async fn build_ai_review_run(
    state: &ServerState,
    http_client: &reqwest::Client,
    item_id: &str,
    version_id: Option<String>,
    draft_revision: Option<u64>,
    package: &TaskPackage,
    actor_email: &str,
) -> AiReviewRun {
    let metadata = ai::provider_metadata(&state.env_vars.language_item_ai);
    let review = ai::review(&state.env_vars.language_item_ai, http_client, package).await;
    let (findings, status, review_error) = match review {
        Ok(findings) => (findings, "completed".to_string(), None),
        Err(error) => (Vec::new(), "failed".to_string(), Some(error.to_string())),
    };
    AiReviewRun {
        id: format!("AIREV-{}", Uuid::new_v4()),
        version_id,
        item_id: item_id.to_string(),
        draft_revision,
        provider: metadata.provider.to_string(),
        model: metadata.model.to_string(),
        model_version: metadata.model_version.to_string(),
        prompt_id: ai::REVIEW_PROMPT_ID.to_string(),
        prompt_version: ai::REVIEW_PROMPT_VERSION.to_string(),
        schema_version: ai::REVIEW_SCHEMA_VERSION.to_string(),
        spec_versions: package.spec_versions.clone(),
        findings,
        status,
        error: review_error,
        created_by: actor_email.to_string(),
        created_at: now(),
    }
}

pub async fn post_draft_ai_review(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(http_client): Extension<reqwest::Client>,
    Path(item_id): Path<String>,
) -> Result<Json<AiReviewRun>, Error> {
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    require_active_item(&item)?;
    require_mutable_draft(&item)?;
    let run = build_ai_review_run(
        &state,
        &http_client,
        &item_id,
        None,
        Some(item.revision),
        &item.draft,
        &user.email,
    )
    .await;
    state
        .workbench_database
        .ai_review_runs
        .insert_one(&run)
        .await?;
    write_audit(
        &state,
        &item_id,
        None,
        if run.status == "completed" {
            "ai.review.draft.completed"
        } else {
            "ai.review.draft.failed"
        },
        &user.email,
        json!({ "runId": run.id, "draftRevision": item.revision }),
    )
    .await?;
    Ok(Json(run))
}

pub async fn get_draft_ai_reviews(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<AiReviewRun>>, Error> {
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| not_found("language item", &item_id))?;
    require_owner(&item, &user)?;
    let runs = state
        .workbench_database
        .ai_review_runs
        .find(doc! { "itemId": &item_id, "draftRevision": { "$ne": null } })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(runs))
}

pub async fn get_ai_reviews(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
) -> Result<Json<Vec<AiReviewRun>>, Error> {
    let runs = state
        .workbench_database
        .ai_review_runs
        .find(doc! { "versionId": &version_id })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(runs))
}

pub async fn get_review_discussions(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<Vec<LanguageItemReviewDiscussionView>>, Error> {
    if state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .is_none()
    {
        return Err(not_found("language item", &item_id));
    }
    Ok(Json(review_discussion_views(&state, &item_id).await?))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewDiscussionBody {
    gate_id: String,
    kind: ReviewDiscussionKind,
    subject: String,
    message: String,
    field_path: Option<String>,
    rule_ref: Option<String>,
}

fn trimmed_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn require_discussion_text(value: &str, label: &str, max_chars: usize) -> Result<String, Error> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max_chars {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            format!("{label} must contain 1 to {max_chars} characters"),
        ));
    }
    Ok(value.to_string())
}

pub async fn post_review_discussion(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
    Json(body): Json<CreateReviewDiscussionBody>,
) -> Result<Json<LanguageItemReviewDiscussionView>, Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &version.item_id))?;
    require_active_item(&item)?;
    if item.latest_version_id.as_deref() != Some(&version_id) {
        return Err(conflict(
            "new discussions can only target the latest frozen version",
        ));
    }
    if item.status == LanguageItemStatus::ExportedToStaging {
        return Err(conflict("an exported item can no longer be discussed"));
    }
    let registry = pinned_registry(&version.package.spec_versions.registry_bundle_version)?;
    if !registry.required_review_gate_ids.contains(&body.gate_id) {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            format!("unsupported review gate: {}", body.gate_id),
        ));
    }
    let subject = require_discussion_text(&body.subject, "discussion subject", 160)?;
    let message = require_discussion_text(&body.message, "discussion message", 4000)?;
    let timestamp = now();
    let discussion = LanguageItemReviewDiscussion {
        id: format!("LIDISC-{}", Uuid::new_v4()),
        item_id: version.item_id.clone(),
        version_id: version.id.clone(),
        version_number: version.version_number,
        gate_id: body.gate_id,
        kind: body.kind,
        subject,
        field_path: trimmed_optional(body.field_path),
        rule_ref: trimmed_optional(body.rule_ref),
        created_by: user.email.clone(),
        created_at: timestamp.clone(),
    };
    let event = LanguageItemReviewDiscussionEvent {
        id: format!("LIDISCEV-{}", Uuid::new_v4()),
        discussion_id: discussion.id.clone(),
        kind: ReviewDiscussionEventKind::Comment,
        message,
        actor_email: user.email.clone(),
        created_at: timestamp,
    };
    state
        .workbench_database
        .review_discussions
        .insert_one(&discussion)
        .await?;
    if let Err(error) = state
        .workbench_database
        .review_discussion_events
        .insert_one(&event)
        .await
    {
        let _ = state
            .workbench_database
            .review_discussions
            .delete_one(doc! { "id": &discussion.id })
            .await;
        return Err(error.into());
    }
    refresh_item_review_status(&state, &version.item_id, &version.id).await?;
    write_audit(
        &state,
        &version.item_id,
        Some(&version.id),
        "review.discussion.created",
        &user.email,
        json!({
            "discussionId": discussion.id,
            "gateId": discussion.gate_id,
            "kind": discussion.kind,
        }),
    )
    .await?;
    Ok(Json(LanguageItemReviewDiscussionView {
        discussion,
        status: ReviewDiscussionStatus::Open,
        events: vec![event],
    }))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReviewDiscussionEventBody {
    kind: ReviewDiscussionEventKind,
    message: Option<String>,
}

pub async fn post_review_discussion_event(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(discussion_id): Path<String>,
    Json(body): Json<CreateReviewDiscussionEventBody>,
) -> Result<Json<LanguageItemReviewDiscussionView>, Error> {
    let discussion = state
        .workbench_database
        .review_discussions
        .find_one(doc! { "id": &discussion_id })
        .await?
        .ok_or_else(|| not_found("review discussion", &discussion_id))?;
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &discussion.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &discussion.item_id))?;
    require_active_item(&item)?;
    if item.status == LanguageItemStatus::ExportedToStaging {
        return Err(conflict("an exported item can no longer be discussed"));
    }
    let current_events: Vec<LanguageItemReviewDiscussionEvent> = state
        .workbench_database
        .review_discussion_events
        .find(doc! { "discussionId": &discussion_id })
        .sort(doc! { "createdAt": 1 })
        .await?
        .try_collect()
        .await?;
    let current_status = discussion_status(&current_events);
    match body.kind {
        ReviewDiscussionEventKind::Comment => {}
        ReviewDiscussionEventKind::Addressed => {
            if discussion.kind != ReviewDiscussionKind::ChangeRequest {
                return Err(Error::Server(
                    StatusCode::BAD_REQUEST,
                    "only a change request can be marked as addressed".to_string(),
                ));
            }
            if current_status == ReviewDiscussionStatus::Resolved {
                return Err(conflict("a resolved discussion must be reopened first"));
            }
        }
        ReviewDiscussionEventKind::Resolved => {
            if current_status == ReviewDiscussionStatus::Resolved {
                return Err(conflict("discussion is already resolved"));
            }
        }
        ReviewDiscussionEventKind::Reopened => {
            if current_status == ReviewDiscussionStatus::Open {
                return Err(conflict("discussion is already open"));
            }
        }
    }
    let message = trimmed_optional(body.message);
    if matches!(
        body.kind,
        ReviewDiscussionEventKind::Comment
            | ReviewDiscussionEventKind::Addressed
            | ReviewDiscussionEventKind::Reopened
    ) && message.is_none()
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "this discussion action requires a message".to_string(),
        ));
    }
    if message
        .as_deref()
        .map(str::chars)
        .map(Iterator::count)
        .unwrap_or(0)
        > 4000
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "discussion message must not exceed 4000 characters".to_string(),
        ));
    }
    let event = LanguageItemReviewDiscussionEvent {
        id: format!("LIDISCEV-{}", Uuid::new_v4()),
        discussion_id: discussion_id.clone(),
        kind: body.kind,
        message: message.unwrap_or_default(),
        actor_email: user.email.clone(),
        created_at: now(),
    };
    state
        .workbench_database
        .review_discussion_events
        .insert_one(&event)
        .await?;
    refresh_item_review_status(&state, &discussion.item_id, &discussion.version_id).await?;
    write_audit(
        &state,
        &discussion.item_id,
        Some(&discussion.version_id),
        "review.discussion.updated",
        &user.email,
        json!({ "discussionId": discussion.id, "eventKind": event.kind }),
    )
    .await?;
    let view = review_discussion_views(&state, &discussion.item_id)
        .await?
        .into_iter()
        .find(|view| view.discussion.id == discussion_id)
        .ok_or_else(|| not_found("review discussion", &discussion_id))?;
    Ok(Json(view))
}

pub async fn get_reviews(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
) -> Result<Json<Vec<LanguageItemReview>>, Error> {
    let reviews = state
        .workbench_database
        .reviews
        .find(doc! { "versionId": &version_id })
        .sort(doc! { "createdAt": 1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(reviews))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewBody {
    gate_id: String,
    decision: ReviewDecision,
    field_path: Option<String>,
    rule_ref: Option<String>,
    comment: Option<String>,
}

async fn latest_gate_decisions(
    state: &ServerState,
    version_id: &str,
) -> Result<HashMap<String, ReviewDecision>, Error> {
    let reviews: Vec<LanguageItemReview> = state
        .workbench_database
        .reviews
        .find(doc! { "versionId": version_id })
        .sort(doc! { "createdAt": 1 })
        .await?
        .try_collect()
        .await?;
    Ok(reviews
        .into_iter()
        .map(|review| (review.gate_id, review.decision))
        .collect())
}

async fn refresh_item_review_status(
    state: &ServerState,
    item_id: &str,
    version_id: &str,
) -> Result<(), Error> {
    let decisions = latest_gate_decisions(state, version_id).await?;
    let has_unresolved_change_requests = unresolved_change_request_count(state, item_id).await? > 0;
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": version_id })
        .await?
        .ok_or_else(|| not_found("language item version", version_id))?;
    let registry = pinned_registry(&version.package.spec_versions.registry_bundle_version)?;
    if let Some(mut item) = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": item_id })
        .await?
        && item.latest_version_id.as_deref() == Some(version_id)
        && item.status != LanguageItemStatus::ExportedToStaging
    {
        item.status = review_lifecycle_status(
            &decisions,
            has_unresolved_change_requests,
            &registry.required_review_gate_ids,
        );
        item.updated_at = now();
        state
            .workbench_database
            .language_items
            .replace_one(doc! { "id": item_id }, &item)
            .await?;
    }
    Ok(())
}

fn review_lifecycle_status(
    decisions: &HashMap<String, ReviewDecision>,
    has_unresolved_change_requests: bool,
    required_review_gate_ids: &[String],
) -> LanguageItemStatus {
    let all_approved = required_review_gate_ids
        .iter()
        .all(|gate| decisions.get(gate) == Some(&ReviewDecision::Approved));
    let has_revision_decision = decisions
        .values()
        .any(|decision| *decision == ReviewDecision::Revise);
    let has_rejection = decisions
        .values()
        .any(|decision| *decision == ReviewDecision::Rejected);
    let has_blocker = decisions
        .values()
        .any(|decision| *decision == ReviewDecision::Blocked);
    if all_approved && !has_unresolved_change_requests {
        LanguageItemStatus::ApprovedForExport
    } else if has_rejection {
        LanguageItemStatus::Rejected
    } else if has_blocker {
        LanguageItemStatus::ReviewBlocked
    } else if has_revision_decision || has_unresolved_change_requests {
        LanguageItemStatus::NeedsRevision
    } else {
        LanguageItemStatus::InReview
    }
}

pub async fn post_review(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
    Json(body): Json<ReviewBody>,
) -> Result<Json<LanguageItemReview>, Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    let current_item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &version.item_id))?;
    require_active_item(&current_item)?;
    if current_item.latest_version_id.as_deref() != Some(&version_id) {
        return Err(conflict("only the latest frozen version can be reviewed"));
    }
    if state
        .workbench_database
        .exports
        .find_one(doc! { "versionId": &version_id })
        .await?
        .is_some()
    {
        return Err(conflict("an exported version can no longer be reviewed"));
    }
    let registry = pinned_registry(&version.package.spec_versions.registry_bundle_version)?;
    if !registry.required_review_gate_ids.contains(&body.gate_id) {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            format!("unsupported review gate: {}", body.gate_id),
        ));
    }
    if body.decision != ReviewDecision::Approved
        && body
            .comment
            .as_deref()
            .is_none_or(|comment| comment.trim().is_empty())
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "revise, rejected and blocked decisions require a comment".to_string(),
        ));
    }
    let review = LanguageItemReview {
        id: format!("LIR-{}", Uuid::new_v4()),
        version_id: version_id.clone(),
        gate_id: body.gate_id,
        decision: body.decision,
        field_path: body.field_path.filter(|path| !path.trim().is_empty()),
        rule_ref: body.rule_ref.filter(|rule| !rule.trim().is_empty()),
        comment: body.comment.unwrap_or_default(),
        reviewer_email: user.email.clone(),
        created_at: now(),
    };
    state.workbench_database.reviews.insert_one(&review).await?;

    refresh_item_review_status(&state, &version.item_id, &version_id).await?;
    write_audit(
        &state,
        &version.item_id,
        Some(&version_id),
        "review.recorded",
        &user.email,
        json!({ "gateId": review.gate_id, "decision": review.decision }),
    )
    .await?;
    Ok(Json(review))
}

pub async fn post_staging_export(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
) -> Result<Json<LanguageItemExport>, Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    let export_id = format!("staging:{version_id}");
    if let Some(existing) = state
        .workbench_database
        .exports
        .find_one(doc! { "id": &export_id })
        .await?
    {
        return Ok(Json(existing));
    }
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
        .ok_or_else(|| not_found("language item", &version.item_id))?;
    require_active_item(&item)?;
    if item.latest_version_id.as_deref() != Some(&version_id) {
        return Err(conflict("only the latest frozen version can be exported"));
    }
    if item.status != LanguageItemStatus::ApprovedForExport {
        return Err(conflict(
            "only an ApprovedForExport version can be exported",
        ));
    }
    if state.env_vars.github_review.is_some() {
        let github_review = item
            .github_review
            .as_ref()
            .ok_or_else(|| conflict("the version must be approved through GitHub review"))?;
        if github_review.state != super::super::language_items::domain::GithubReviewState::Merged
            || github_review.approved_version_id.as_deref() != Some(&version_id)
        {
            return Err(conflict(
                "the latest version must match a merged GitHub review",
            ));
        }
    } else {
        let decisions = latest_gate_decisions(&state, &version_id).await?;
        let registry = pinned_registry(&version.package.spec_versions.registry_bundle_version)?;
        let missing: Vec<&String> = registry
            .required_review_gate_ids
            .iter()
            .filter(|gate| decisions.get(*gate) != Some(&ReviewDecision::Approved))
            .collect();
        if !missing.is_empty() {
            return Err(Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!("required review gates are not approved: {missing:?}"),
            ));
        }
        let unresolved_change_requests =
            unresolved_change_request_count(&state, &version.item_id).await?;
        if unresolved_change_requests > 0 {
            return Err(Error::Server(
                StatusCode::UNPROCESSABLE_ENTITY,
                format!(
                    "{unresolved_change_requests} review change request(s) must be resolved before export"
                ),
            ));
        }
    }
    let validation = validate_task_package(&version.package);
    if !validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&validation)
                .unwrap_or_else(|_| "export validation failed".to_string()),
        ));
    }
    if task_package_hash(&version.package) != version.content_hash {
        return Err(conflict(
            "frozen version content no longer matches its recorded hash",
        ));
    }
    // Every reviewed format is delivered to the Workbench staging collection. The
    // existing Exam Environment adapter only has a faithful representation for
    // single-select, so legacy records are additive rather than an export gate.
    let legacy = build_legacy_export(&version).ok();
    let timestamp = now();
    let artifact_id = format!("language-item:{version_id}");
    let artifact = StagingLanguageItem {
        id: artifact_id.clone(),
        source_version_id: version_id.clone(),
        source_item_id: version.item_id.clone(),
        package: version.package.clone(),
        exported_at: timestamp.clone(),
    };
    let environment_exam: Option<prisma::ExamEnvironmentExam> = legacy
        .as_ref()
        .map(|legacy| {
            serialize_to_document(&legacy.exam)
                .map_err(Error::from)
                .and_then(|document| bson::deserialize_from_document(document).map_err(Error::from))
        })
        .transpose()?;
    let export = LanguageItemExport {
        id: export_id.clone(),
        version_id: version_id.clone(),
        item_id: version.item_id.clone(),
        target: "staging".to_string(),
        artifact_id: artifact_id.clone(),
        legacy_exam_id: legacy.as_ref().map(|value| value.exam_id.to_hex()),
        legacy_question_set_id: legacy.as_ref().map(|value| value.question_set_id.to_hex()),
        legacy_question_id: legacy.as_ref().map(|value| value.question_id.to_hex()),
        option_answer_ids: legacy
            .as_ref()
            .map(|value| value.option_answer_ids.clone())
            .unwrap_or_default(),
        result: "completed".to_string(),
        exported_by: user.email.clone(),
        created_at: timestamp,
    };
    let persistence_result: Result<(), Error> = async {
        state
            .workbench_database
            .staging_items
            .update_one(
                doc! { "id": &artifact_id },
                doc! { "$setOnInsert": serialize_to_document(&artifact)? },
            )
            .upsert(true)
            .await?;
        if let (Some(legacy), Some(environment_exam)) = (&legacy, &environment_exam) {
            state
                .staging_database
                .exam_creator_exam
                .replace_one(doc! { "_id": legacy.exam_id }, &legacy.exam)
                .upsert(true)
                .await?;
            state
                .staging_database
                .exam
                .replace_one(doc! { "_id": legacy.exam_id }, environment_exam)
                .upsert(true)
                .await?;
        }
        state
            .workbench_database
            .exports
            .update_one(
                doc! { "id": &export_id },
                doc! { "$setOnInsert": serialize_to_document(&export)? },
            )
            .upsert(true)
            .await?;
        Ok(())
    }
    .await;
    if let Err(error) = persistence_result {
        compensate_failed_staging_export(
            &state,
            &artifact_id,
            legacy.as_ref().map(|value| value.exam_id),
            &export_id,
        )
        .await;
        let _ = write_audit(
            &state,
            &version.item_id,
            Some(&version_id),
            "export.staging.failed",
            &user.email,
            json!({ "exportId": export_id, "error": error.to_string() }),
        )
        .await;
        return Err(error);
    }
    if let Some(mut item) = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &version.item_id })
        .await?
    {
        item.status = LanguageItemStatus::ExportedToStaging;
        item.has_staging_export = true;
        item.updated_at = now();
        state
            .workbench_database
            .language_items
            .replace_one(doc! { "id": &version.item_id }, &item)
            .await?;
    }
    write_audit(
        &state,
        &version.item_id,
        Some(&version_id),
        "export.staging.completed",
        &user.email,
        json!({ "exportId": export_id }),
    )
    .await?;
    let stored = state
        .workbench_database
        .exports
        .find_one(doc! { "id": &export_id })
        .await?
        .ok_or_else(|| not_found("language item export", &export_id))?;
    Ok(Json(stored))
}

pub async fn post_production_export(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
) -> Result<(), Error> {
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| not_found("language item version", &version_id))?;
    write_audit(
        &state,
        &version.item_id,
        Some(&version_id),
        "export.production.rejected",
        &user.email,
        json!({ "reason": "production export is disabled in MVP" }),
    )
    .await?;
    Err(Error::Server(
        StatusCode::FORBIDDEN,
        "production language-item export is disabled in the MVP".to_string(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn single_item_generation_accepts_custom_positive_candidate_counts() {
        for count in [1, 4, 6, 256, 1_000] {
            let body: AiGenerationBody = serde_json::from_value(json!({ "count": count })).unwrap();
            assert_eq!(body.candidate_count().unwrap(), count);
        }
        let default: AiGenerationBody = serde_json::from_value(json!({})).unwrap();
        assert_eq!(default.candidate_count().unwrap(), 3);
        for count in [0, u64::MAX] {
            let body: AiGenerationBody = serde_json::from_value(json!({ "count": count })).unwrap();
            assert!(body.candidate_count().is_err());
        }
        for count in [json!(-1), json!(1.5), json!("6")] {
            assert!(serde_json::from_value::<AiGenerationBody>(json!({ "count": count })).is_err());
        }
    }

    fn event(kind: ReviewDiscussionEventKind) -> LanguageItemReviewDiscussionEvent {
        LanguageItemReviewDiscussionEvent {
            id: Uuid::new_v4().to_string(),
            discussion_id: "discussion".to_string(),
            kind,
            message: String::new(),
            actor_email: "reviewer@example.test".to_string(),
            created_at: now(),
        }
    }

    #[test]
    fn discussion_status_follows_append_only_events() {
        let events = vec![
            event(ReviewDiscussionEventKind::Comment),
            event(ReviewDiscussionEventKind::Addressed),
        ];
        assert_eq!(
            discussion_status(&events),
            ReviewDiscussionStatus::Addressed
        );

        let events = [
            events,
            vec![
                event(ReviewDiscussionEventKind::Resolved),
                event(ReviewDiscussionEventKind::Reopened),
            ],
        ]
        .concat();
        assert_eq!(discussion_status(&events), ReviewDiscussionStatus::Open);
    }

    #[test]
    fn review_lifecycle_separates_revision_from_approval() {
        let mut decisions = HashMap::new();
        let required_review_gate_ids = &snapshot().required_review_gate_ids;
        assert_eq!(
            review_lifecycle_status(&decisions, false, required_review_gate_ids),
            LanguageItemStatus::InReview
        );

        decisions.insert("editorial".to_string(), ReviewDecision::Revise);
        assert_eq!(
            review_lifecycle_status(&decisions, false, required_review_gate_ids),
            LanguageItemStatus::NeedsRevision
        );

        decisions.insert("editorial".to_string(), ReviewDecision::Blocked);
        assert_eq!(
            review_lifecycle_status(&decisions, false, required_review_gate_ids),
            LanguageItemStatus::ReviewBlocked
        );

        decisions.insert("editorial".to_string(), ReviewDecision::Rejected);
        assert_eq!(
            review_lifecycle_status(&decisions, false, required_review_gate_ids),
            LanguageItemStatus::Rejected
        );

        for gate in &snapshot().required_review_gate_ids {
            decisions.insert(gate.clone(), ReviewDecision::Approved);
        }
        assert_eq!(
            review_lifecycle_status(&decisions, false, required_review_gate_ids),
            LanguageItemStatus::ApprovedForExport
        );
        assert_eq!(
            review_lifecycle_status(&decisions, true, required_review_gate_ids),
            LanguageItemStatus::NeedsRevision
        );
    }

    #[test]
    fn blueprint_selection_locks_contract_and_selects_a_valid_context() {
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-2" && entry.item_format_id == "IF-MATCHING"
            })
            .expect("R-A1-2 matching capability");
        let package = draft_for_capability(
            "LI-test".to_string(),
            capability,
            registry,
            None,
            None,
            None,
        )
        .expect("valid package");

        assert_eq!(package.blueprint_slot_id, "R-A1-2");
        assert_eq!(package.task_family_id, "TF-SHORT-MESSAGE-COMPREHENSION");
        assert_eq!(package.renderer.renderer_id, "REN-MATCHING");
        assert_eq!(
            package.scoring_package.scoring_contract_template_id,
            "SCT-R-A1-2-MATCHING-v0.1"
        );
        assert_eq!(package.content.primary_can_do_id, "A1-R2");
        assert_eq!(package.content.primary_domain, "Personal");
        assert_eq!(package.content.context_id, "D03");
    }

    #[test]
    fn listening_selection_applies_delivery_contract() {
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "L-A1-3" && entry.item_format_id == "IF-RESTRICTED-INPUT"
            })
            .expect("L-A1-3 restricted input capability");
        let package = draft_for_capability(
            "LI-test".to_string(),
            capability,
            registry,
            None,
            None,
            None,
        )
        .expect("valid package");

        assert_eq!(package.content.primary_reported_skill, "Listening");
        assert_eq!(
            package.delivery_policy_refs.navigation_policy_id,
            "NAV-FORWARD-TASK-v0.1"
        );
        assert_eq!(
            package.delivery_policy_refs.input_policy_id,
            "INPUT-RESTRICTED-FIELD-v0.1"
        );
        assert_eq!(
            package.delivery_policy_refs.playback_policy_id,
            "PLAY-COMPLETE-TWICE-v0.1"
        );
    }

    #[test]
    fn every_registry_capability_creates_a_consistent_draft() {
        let registry = snapshot();
        for capability in &registry.capabilities {
            let package = draft_for_capability(
                format!(
                    "LI-{}-{}",
                    capability.blueprint_slot_id, capability.item_format_id
                ),
                capability,
                registry,
                None,
                None,
                None,
            )
            .expect("every exposed capability must be creatable");

            assert_eq!(package.blueprint_slot_id, capability.blueprint_slot_id);
            assert_eq!(package.task_family_id, capability.task_family_id);
            assert_eq!(package.item_format_id, capability.item_format_id);
            if !matches!(
                capability.item_format_id.as_str(),
                "IF-SINGLE-SELECT" | "IF-MATCHING"
            ) {
                assert_eq!(
                    package
                        .content
                        .difficulty
                        .as_ref()
                        .unwrap()
                        .drivers
                        .distractor_similarity,
                    "notApplicable",
                    "open-response items have no distractors"
                );
            }
            assert_eq!(package.renderer.renderer_id, capability.renderer_id);
            assert_eq!(
                package.scoring_package.scoring_contract_template_id,
                capability.scoring_contract_template_id
            );
            assert!(
                validate_task_package(&package)
                    .issues
                    .iter()
                    .all(|issue| issue.code != "registry.deliveryPolicy"),
                "{} + {} produced an inconsistent delivery contract",
                capability.blueprint_slot_id,
                capability.item_format_id
            );
            assert!(
                capability
                    .allowed_domains
                    .contains(&package.content.primary_domain),
                "{} selected an invalid domain",
                capability.blueprint_slot_id
            );
            assert!(
                capability
                    .allowed_context_ids
                    .contains(&package.content.context_id),
                "{} selected an invalid context",
                capability.blueprint_slot_id
            );
        }
    }

    #[test]
    fn preview_allows_incomplete_drafts_but_blocks_historical_nested_answers() {
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| entry.item_format_id == "IF-FORM-ENTRY")
            .unwrap();
        let mut package = draft_for_capability(
            "LI-preview".to_string(),
            capability,
            registry,
            None,
            None,
            None,
        )
        .unwrap();
        assert!(checked_candidate_preview(&package).is_ok());
        let mut payload = serde_json::to_value(&package.candidate_payload).unwrap();
        payload["sourceProfile"] = json!({"nested": [{"correctOptionId": "secret"}]});
        package.candidate_payload = serde_json::from_value(payload).unwrap();
        assert!(checked_candidate_preview(&package).is_err());
    }

    #[test]
    fn delivery_input_policy_depends_on_the_final_item_format() {
        let registry = snapshot();
        let matching = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-3" && entry.item_format_id == "IF-MATCHING"
            })
            .expect("R-A1-3 matching capability");
        let restricted_input = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-3" && entry.item_format_id == "IF-RESTRICTED-INPUT"
            })
            .expect("R-A1-3 restricted-input capability");

        assert_eq!(
            matching.delivery_policy_refs.input_policy_id,
            "notApplicable"
        );
        assert_eq!(
            restricted_input.delivery_policy_refs.input_policy_id,
            "INPUT-RESTRICTED-FIELD-v0.1"
        );
    }

    #[test]
    fn locked_contract_reapplication_repairs_legacy_delivery_refs() {
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-3" && entry.item_format_id == "IF-MATCHING"
            })
            .expect("R-A1-3 matching capability");
        let mut package = draft_for_capability(
            "LI-test".to_string(),
            capability,
            registry,
            None,
            None,
            None,
        )
        .expect("valid package");
        package.delivery_policy_refs.input_policy_id = "INPUT-RESTRICTED-FIELD-v0.1".to_string();
        package.task_family_id = "tampered".to_string();
        package.scoring_package.scoring_points[0].points = 99;
        package.scoring_package.rubric_id = Some("AUTHOR-RUBRIC".to_string());
        package.scoring_package.benchmark_set_version = Some("AUTHOR-BENCHMARK".to_string());

        apply_locked_capability_contract(&mut package).expect("registered pair");

        assert_eq!(package.task_family_id, "TF-STRUCTURED-INFORMATION");
        assert_eq!(
            package.delivery_policy_refs.input_policy_id,
            "notApplicable"
        );
        assert_eq!(package.scoring_package.max_raw_score, 2);
        assert!(
            package
                .scoring_package
                .scoring_points
                .iter()
                .all(|point| point.points == 1)
        );
        assert!(package.scoring_package.rubric_id.is_none());
        assert!(package.scoring_package.benchmark_set_version.is_none());
    }

    #[test]
    fn difficulty_selection_uses_all_pinned_defaults_for_every_format() {
        let mut registry = snapshot().clone();
        for profiles in &mut registry.capability_difficulty_profile_sets {
            for standard in &mut profiles.standards {
                standard.default_drivers.input_length = "wordOrPhrase".to_string();
                standard.default_drivers.information_points = 2;
                standard.default_drivers.support_level = "high".to_string();
                standard.default_drivers.distractor_similarity = "clear".to_string();
                standard.default_drivers.independence_level = "supported".to_string();
                standard.description = "The team's published complete profile".to_string();
            }
        }
        for capability in &registry.capabilities {
            for band in ["LowerA1", "TypicalA1", "UpperA1"] {
                let package = draft_for_capability(
                    "LI-complete-profile".to_string(),
                    capability,
                    &registry,
                    None,
                    None,
                    Some(band),
                )
                .unwrap();
                let profile = package.content.difficulty.unwrap();
                assert_eq!(profile.intended_band, band);
                assert_eq!(profile.drivers.input_length, "wordOrPhrase");
                assert_eq!(profile.drivers.information_points, 2);
                assert_eq!(profile.drivers.support_level, "high");
                assert_eq!(profile.drivers.independence_level, "supported");
                assert!(!profile.drivers.inference_required);
                assert_eq!(profile.rationale, ["The team's published complete profile"]);
                let template = TaskPackage::from_template(
                    String::new(),
                    template_for_format(&capability.item_format_id).unwrap(),
                )
                .unwrap();
                let template_driver = template.content.difficulty.unwrap().drivers;
                assert_eq!(profile.drivers.output_length, template_driver.output_length);
                assert_eq!(
                    profile.drivers.interaction_turns,
                    template_driver.interaction_turns
                );
                assert_eq!(
                    profile.drivers.preparation_time_seconds,
                    template_driver.preparation_time_seconds
                );
                assert_eq!(
                    profile.drivers.distractor_similarity,
                    if matches!(
                        capability.item_format_id.as_str(),
                        "IF-SINGLE-SELECT" | "IF-MATCHING"
                    ) {
                        "clear"
                    } else {
                        "notApplicable"
                    }
                );
            }
        }
    }

    #[test]
    fn ordinary_draft_edits_preserve_legacy_difficulty_but_reject_tuning() {
        let mut previous = TaskPackage::new("LI-legacy-profile".to_string());
        let profile = previous.content.difficulty.as_mut().unwrap();
        profile.drivers.information_points = 2;
        profile.rationale = vec!["Existing author's saved estimate".to_string()];
        let saved = json!(&previous.content.difficulty);
        let mut proposed = previous.clone();
        proposed.content.required_information_points.clear();
        apply_locked_draft_setup(&previous, &mut proposed).unwrap();
        assert_eq!(json!(&proposed.content.difficulty), saved);

        for field in ["drivers", "rationale", "profile"] {
            let mut proposed = previous.clone();
            match field {
                "drivers" => {
                    proposed
                        .content
                        .difficulty
                        .as_mut()
                        .unwrap()
                        .drivers
                        .information_points = 1
                }
                "rationale" => {
                    proposed.content.difficulty.as_mut().unwrap().rationale =
                        vec!["New rule".to_string()]
                }
                _ => proposed.content.difficulty = None,
            }
            assert!(
                apply_locked_draft_setup(&previous, &mut proposed).is_err(),
                "{field}"
            );
        }
        previous.content.difficulty = None;
        let mut proposed = previous.clone();
        apply_locked_draft_setup(&previous, &mut proposed).unwrap();
        assert!(
            proposed.content.difficulty.is_none(),
            "legacy reads must not create a new profile"
        );
    }

    #[test]
    fn changing_band_replaces_the_profile_without_removing_authored_content() {
        let mut previous = TaskPackage::new("LI-change-profile".to_string());
        previous.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        previous.content.supporting_content_refs = vec![
            snapshot()
                .content_id_options
                .iter()
                .find(|entry| entry.kind == "supported")
                .unwrap()
                .id
                .clone(),
        ];
        previous.content.required_information_points = vec![
            crate::language_items::domain::InformationPoint::new(0, "上午九点开门"),
            crate::language_items::domain::InformationPoint::new(1, "下午五点关门"),
        ];
        let mut proposed = previous.clone();
        proposed.content.difficulty_band = "LowerA1".to_string();
        proposed
            .content
            .difficulty
            .as_mut()
            .unwrap()
            .drivers
            .information_points = 99;
        apply_locked_draft_setup(&previous, &mut proposed).unwrap();
        let profile = proposed.content.difficulty.as_ref().unwrap();
        assert_eq!(profile.intended_band, "LowerA1");
        assert_eq!(profile.drivers.information_points, 1);
        assert_eq!(profile.empirical_difficulty.status, "NotPiloted");
        assert_eq!(
            proposed.content.target_content_ids,
            previous.content.target_content_ids
        );
        assert_eq!(
            proposed.content.supporting_content_refs,
            previous.content.supporting_content_refs
        );
        assert_eq!(
            json!(proposed.content.required_information_points),
            json!(previous.content.required_information_points)
        );
        assert_eq!(
            json!(proposed.candidate_payload),
            json!(previous.candidate_payload)
        );
        let checks = validate_task_package(&proposed);
        assert!(
            checks
                .issues
                .iter()
                .any(|issue| issue.code == "authoring.informationPoints")
        );
        assert!(
            !checks.issues.iter().any(blocks_draft_save),
            "temporary setup mismatches remain saveable"
        );
        assert!(!validate_generation_setup(&proposed).valid);
    }

    #[test]
    fn draft_cannot_rebind_settings_to_bypass_the_saved_profile() {
        let previous = TaskPackage::new("LI-pinned-profile".to_string());
        for field in ["version", "canDo"] {
            let mut proposed = previous.clone();
            if field == "version" {
                proposed.spec_versions.registry_bundle_version = "a-different-version".to_string();
            } else {
                proposed.content.primary_can_do_id = "A1-R2".to_string();
            }
            assert!(apply_locked_draft_setup(&previous, &mut proposed).is_err());
        }
    }

    fn generation_run_for(package: &TaskPackage) -> AiGenerationRun {
        serde_json::from_value(json!({
            "id": "AIR-test", "itemId": package.task_id,
            "provider": "deterministic-mock", "model": "test", "modelVersion": "1",
            "promptId": "test", "promptVersion": "1", "outputSchemaVersion": "1",
            "specVersions": package.spec_versions, "blueprintSlotId": package.blueprint_slot_id,
            "taskFamilyId": package.task_family_id, "itemFormatId": package.item_format_id,
            "rendererId": package.renderer.renderer_id, "primaryCanDoId": package.content.primary_can_do_id,
            "primaryDomain": package.content.primary_domain, "contextId": package.content.context_id,
            "difficultyBand": package.content.difficulty_band, "targetContentIds": package.content.target_content_ids,
            "requiredInformationPoints": package.content.required_information_points.iter()
                .map(|point| &point.label).collect::<Vec<_>>(),
            "generationSetupSnapshot": ai_generation_setup_snapshot(package),
            "requestedCount": 1, "candidates": [], "status": "completed", "createdBy": "author", "createdAt": "test"
        })).unwrap()
    }

    #[test]
    fn failed_candidate_result_persistence_retains_a_compact_terminal_run() {
        let package = TaskPackage::new("LI-large-generation".to_string());
        let mut run = generation_run_for(&package);
        run.requested_count = 1_000;
        run.attempt_count = 1_001;
        run.retry_count = 1;
        run.completed_at = Some("completed-time".to_string());
        run.candidates = ai::generate_mock_candidates(&package, 1);
        run.candidates[0]
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "x".repeat(17 * 1024 * 1024);
        run.candidate_errors = vec!["provider-detail".repeat(1_000)];
        assert!(bson::serialize_to_vec(&run).unwrap().len() > 16 * 1024 * 1024);

        discard_unsaved_ai_generation_results(&mut run);

        assert_eq!(run.status, "failed");
        assert!(
            run.error
                .as_deref()
                .unwrap()
                .contains("No candidates were saved")
        );
        assert!(run.candidates.is_empty());
        assert!(run.provider_calls.is_empty());
        assert_eq!(run.requested_count, 1_000);
        assert_eq!(run.attempt_count, 1_001);
        assert_eq!(run.retry_count, 1);
        assert_eq!(run.completed_at.as_deref(), Some("completed-time"));
        assert_eq!(run.item_id, package.task_id);
        assert!(bson::serialize_to_vec(&run).unwrap().len() < 50_000);
    }

    #[test]
    fn candidate_adoption_rejects_changed_generation_briefs_but_allows_wording_edits() {
        let mut package = TaskPackage::new("LI-generation-brief".to_string());
        package.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        package.content.required_information_points =
            vec![crate::language_items::domain::InformationPoint::new(
                0,
                "上午九点开门",
            )];
        let run = generation_run_for(&package);
        assert!(generation_setup_matches(&run, &package));
        for (path, value) in [
            ("/content/contextId", json!("another-context")),
            ("/content/difficultyBand", json!("UpperA1")),
            ("/content/difficulty/drivers/informationPoints", json!(2)),
            ("/content/targetContentIds", json!(["other-target"])),
            ("/content/supportingContentRefs", json!(["other-support"])),
            (
                "/content/requiredInformationPoints/0/pointType",
                json!("time"),
            ),
            (
                "/content/requiredInformationPoints/0/label",
                json!("下午五点关门"),
            ),
        ] {
            let mut changed = json!(&package);
            *changed.pointer_mut(path).unwrap() = value;
            let changed = serde_json::from_value(changed).unwrap();
            assert!(!generation_setup_matches(&run, &changed), "{path}");
        }
        let mut changed = package.clone();
        changed
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "新的问题措辞".to_string();
        assert!(generation_setup_matches(&run, &changed));

        let mut legacy = run;
        legacy.generation_setup_snapshot = None;
        assert!(generation_setup_matches(&legacy, &changed));
        changed.content.context_id = "another-context".to_string();
        assert!(!generation_setup_matches(&legacy, &changed));
        changed = package;
        changed.content.required_information_points[0].label = "Changed information".to_string();
        assert!(!generation_setup_matches(&legacy, &changed));
    }
}
