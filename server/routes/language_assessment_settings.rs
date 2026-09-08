use std::collections::{HashMap, HashSet};

use axum::{
    Json,
    extract::{Path, State},
};
use chrono::Utc;
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::doc;
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

static REGISTRY_PUBLISH_LOCK: Lazy<tokio::sync::Mutex<()>> =
    Lazy::new(|| tokio::sync::Mutex::new(()));

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        registry::{
            RegistrySnapshot, active_snapshot, install_published_snapshot, item_format_name,
            normalize_registry_snapshot,
        },
        registry_store::{
            REGISTRY_STATUS_DRAFT, REGISTRY_STATUS_PUBLISHED, RegistryAuditEvent, RegistryImpact,
            RegistryValidationResult, RegistryVersionRecord, validate_registry, write_audit,
        },
    },
    state::ServerState,
};

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn not_found(id: &str) -> Error {
    Error::Server(
        StatusCode::NOT_FOUND,
        format!("Registry version {id} was not found"),
    )
}

fn conflict(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

fn validate_version_label(version: &str) -> Result<(), Error> {
    let version = version.trim();
    if version.is_empty() {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Registry version is required".to_string(),
        ));
    }
    if version.len() > 80
        || !version
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-_".contains(character))
    {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "Registry version may contain only letters, numbers, dots, hyphens, and underscores"
                .to_string(),
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryVersionSummary {
    id: String,
    version: String,
    status: String,
    active: bool,
    revision: u64,
    base_version: Option<String>,
    created_by: String,
    updated_by: String,
    created_at: String,
    updated_at: String,
    published_at: Option<String>,
}

impl From<RegistryVersionRecord> for RegistryVersionSummary {
    fn from(record: RegistryVersionRecord) -> Self {
        Self {
            id: record.id,
            version: record.version,
            status: record.status,
            active: record.active,
            revision: record.revision,
            base_version: record.base_version,
            created_by: record.created_by,
            updated_by: record.updated_by,
            created_at: record.created_at,
            updated_at: record.updated_at,
            published_at: record.published_at,
        }
    }
}

pub async fn get_active(_: prisma::ExamCreatorUser) -> Json<RegistrySnapshot> {
    Json((*active_snapshot()).clone())
}

pub async fn get_versions(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<RegistryVersionSummary>>, Error> {
    let records: Vec<RegistryVersionRecord> = state
        .workbench_database
        .registry_versions
        .find(doc! {})
        .sort(doc! { "updatedAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(records.into_iter().map(Into::into).collect()))
}

pub async fn get_version(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<RegistryVersionRecord>, Error> {
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    normalize_registry_snapshot(&mut record.snapshot);
    Ok(Json(record))
}

pub async fn get_audit(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<Vec<RegistryAuditEvent>>, Error> {
    if state
        .workbench_database
        .registry_versions
        .count_documents(doc! { "id": &id })
        .await?
        == 0
    {
        return Err(not_found(&id));
    }
    let events = state
        .workbench_database
        .registry_audit_events
        .find(doc! { "registryVersionId": &id })
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(events))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDraftBody {
    version: Option<String>,
}

pub async fn post_draft(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Json(body): Json<CreateDraftBody>,
) -> Result<Json<RegistryVersionRecord>, Error> {
    let active = active_snapshot();
    let version = body.version.unwrap_or_else(|| {
        format!(
            "assessment-{}-{}",
            Utc::now().format("%Y%m%d%H%M%S"),
            &Uuid::new_v4().simple().to_string()[..8],
        )
    });
    validate_version_label(&version)?;
    if state
        .workbench_database
        .registry_versions
        .count_documents(doc! { "version": &version })
        .await?
        > 0
    {
        return Err(conflict(format!(
            "Registry version {version} already exists"
        )));
    }
    let timestamp = now();
    let mut draft_snapshot = (*active).clone();
    draft_snapshot.bundle_version = version.clone();
    draft_snapshot.status = REGISTRY_STATUS_DRAFT.to_string();
    normalize_registry_snapshot(&mut draft_snapshot);
    let record = RegistryVersionRecord {
        id: format!("LARV-{}", Uuid::new_v4()),
        version,
        status: REGISTRY_STATUS_DRAFT.to_string(),
        active: false,
        revision: 1,
        base_version: Some(active.bundle_version.clone()),
        snapshot: draft_snapshot,
        created_by: user.email.clone(),
        updated_by: user.email.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
        published_at: None,
    };
    state
        .workbench_database
        .registry_versions
        .insert_one(&record)
        .await?;
    write_audit(
        &state.workbench_database,
        &record,
        "registry.draft.created",
        &user.email,
    )
    .await?;
    Ok(Json(record))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateDraftBody {
    expected_revision: u64,
    version: String,
    snapshot: RegistrySnapshot,
}

pub async fn put_draft(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateDraftBody>,
) -> Result<Json<RegistryVersionRecord>, Error> {
    validate_version_label(&body.version)?;
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    if record.status != REGISTRY_STATUS_DRAFT {
        return Err(conflict("Published Registry versions are immutable"));
    }
    if record.revision != body.expected_revision {
        return Err(conflict(format!(
            "Registry draft revision changed; expected {}, found {}",
            body.expected_revision, record.revision
        )));
    }
    if body.version != record.version
        && state
            .workbench_database
            .registry_versions
            .count_documents(doc! { "version": &body.version })
            .await?
            > 0
    {
        return Err(conflict(format!(
            "Registry version {} already exists",
            body.version
        )));
    }
    record.version = body.version.trim().to_string();
    record.snapshot = body.snapshot;
    normalize_registry_snapshot(&mut record.snapshot);
    record.snapshot.bundle_version = record.version.clone();
    record.snapshot.status = REGISTRY_STATUS_DRAFT.to_string();
    record.revision += 1;
    record.updated_by = user.email.clone();
    record.updated_at = now();
    let result = state
        .workbench_database
        .registry_versions
        .replace_one(
            doc! {
                "id": &id,
                "status": REGISTRY_STATUS_DRAFT,
                "revision": body.expected_revision as i64,
            },
            &record,
        )
        .await?;
    if result.matched_count == 0 {
        return Err(conflict("Registry draft changed while it was being saved"));
    }
    write_audit(
        &state.workbench_database,
        &record,
        "registry.draft.updated",
        &user.email,
    )
    .await?;
    Ok(Json(record))
}

pub async fn post_validate(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<RegistryValidationResult>, Error> {
    let record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    Ok(Json(validate_registry(&record.snapshot)))
}

fn changed_count(
    left: impl IntoIterator<Item = (String, String)>,
    right: impl IntoIterator<Item = (String, String)>,
) -> usize {
    let left = left.into_iter().collect::<HashMap<_, _>>();
    let right = right.into_iter().collect::<HashMap<_, _>>();
    left.keys()
        .chain(right.keys())
        .collect::<HashSet<_>>()
        .into_iter()
        .filter(|key| left.get(*key) != right.get(*key))
        .count()
}

fn difficulty_configuration_changes(
    left: &RegistrySnapshot,
    right: &RegistrySnapshot,
) -> Vec<String> {
    let mut changes = Vec::new();
    let mut visited = HashSet::new();
    for (source, other) in [(right, left), (left, right)] {
        for profile in &source.capability_difficulty_profile_sets {
            let key = (
                &profile.blueprint_slot_id,
                &profile.item_format_id,
                &profile.primary_can_do_id,
            );
            if !visited.insert(key) {
                continue;
            }
            let counterpart = other
                .capability_difficulty_profile_sets
                .iter()
                .find(|candidate| {
                    candidate.blueprint_slot_id == profile.blueprint_slot_id
                        && candidate.item_format_id == profile.item_format_id
                        && candidate.primary_can_do_id == profile.primary_can_do_id
                });
            if counterpart.is_some_and(|counterpart| {
                format!("{:?}", counterpart.standards) == format!("{:?}", profile.standards)
            }) {
                continue;
            }
            let slot = source
                .capabilities
                .iter()
                .find(|capability| capability.blueprint_slot_id == profile.blueprint_slot_id)
                .map(|capability| capability.title.as_str())
                .unwrap_or("Assessment task");
            let can_do = source
                .can_do_options
                .iter()
                .find(|can_do| can_do.id == profile.primary_can_do_id)
                .map(|can_do| can_do.label.as_str())
                .unwrap_or("Primary Can-do");
            changes.push(format!(
                "{slot} · {} · {can_do}",
                item_format_name(&profile.item_format_id)
            ));
        }
    }
    changes
}

pub async fn get_impact(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<RegistryImpact>, Error> {
    let record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    let active = active_snapshot();
    let items_pinned_to_active_version = state
        .workbench_database
        .language_items
        .count_documents(doc! {
            "draft.specVersions.registryBundleVersion": &active.bundle_version
        })
        .await?;
    Ok(Json(RegistryImpact {
        difficulty_configuration_changes: difficulty_configuration_changes(
            &active,
            &record.snapshot,
        ),
        active_version: active.bundle_version.clone(),
        draft_version: record.version,
        items_pinned_to_active_version,
        capability_changes: changed_count(
            active.capabilities.iter().map(|entry| {
                (
                    format!(
                        "{}::{}::{}",
                        entry.blueprint_slot_id, entry.item_format_id, entry.primary_can_do_id
                    ),
                    format!("{entry:?}"),
                )
            }),
            record.snapshot.capabilities.iter().map(|entry| {
                (
                    format!(
                        "{}::{}::{}",
                        entry.blueprint_slot_id, entry.item_format_id, entry.primary_can_do_id
                    ),
                    format!("{entry:?}"),
                )
            }),
        ),
        can_do_changes: changed_count(
            active
                .can_do_options
                .iter()
                .map(|entry| (entry.id.clone(), format!("{entry:?}"))),
            record
                .snapshot
                .can_do_options
                .iter()
                .map(|entry| (entry.id.clone(), format!("{entry:?}"))),
        ),
        context_changes: changed_count(
            active
                .context_options
                .iter()
                .map(|entry| (entry.id.clone(), format!("{entry:?}"))),
            record
                .snapshot
                .context_options
                .iter()
                .map(|entry| (entry.id.clone(), format!("{entry:?}"))),
        ),
        scoring_contract_changes: changed_count(
            active.scoring_contracts.iter().map(|entry| {
                (
                    entry.scoring_contract_template_id.clone(),
                    format!("{entry:?}"),
                )
            }),
            record.snapshot.scoring_contracts.iter().map(|entry| {
                (
                    entry.scoring_contract_template_id.clone(),
                    format!("{entry:?}"),
                )
            }),
        ),
        difficulty_standard_changes: changed_count(
            active
                .difficulty_standards
                .iter()
                .map(|entry| (format!("global::{}", entry.id), format!("{entry:?}")))
                .chain(
                    active
                        .capability_difficulty_profile_sets
                        .iter()
                        .map(|entry| (format!("capability::{}", entry.id), format!("{entry:?}"))),
                ),
            record
                .snapshot
                .difficulty_standards
                .iter()
                .map(|entry| (format!("global::{}", entry.id), format!("{entry:?}")))
                .chain(
                    record
                        .snapshot
                        .capability_difficulty_profile_sets
                        .iter()
                        .map(|entry| (format!("capability::{}", entry.id), format!("{entry:?}"))),
                ),
        ),
    }))
}

pub async fn post_publish(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<RegistryVersionRecord>, Error> {
    let _publish_guard = REGISTRY_PUBLISH_LOCK.lock().await;
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    if record.status != REGISTRY_STATUS_DRAFT {
        return Err(conflict("Only a Registry draft can be published"));
    }
    normalize_registry_snapshot(&mut record.snapshot);
    validate_version_label(&record.version)?;
    let validation = validate_registry(&record.snapshot);
    if !validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&validation).unwrap_or_else(|_| {
                "Registry validation failed and could not be serialized".to_string()
            }),
        ));
    }

    let timestamp = now();
    record.status = REGISTRY_STATUS_PUBLISHED.to_string();
    record.active = true;
    record.revision += 1;
    record.snapshot.status = REGISTRY_STATUS_PUBLISHED.to_string();
    record.updated_by = user.email.clone();
    record.updated_at = timestamp.clone();
    record.published_at = Some(timestamp);

    let result = state
        .workbench_database
        .registry_versions
        .replace_one(
            doc! {
                "id": &record.id,
                "status": REGISTRY_STATUS_DRAFT,
                "revision": (record.revision - 1) as i64,
            },
            &record,
        )
        .await?;
    if result.matched_count == 0 {
        return Err(conflict(
            "Registry draft changed while it was being published",
        ));
    }
    state
        .workbench_database
        .registry_versions
        .update_many(
            doc! { "active": true, "id": { "$ne": &record.id } },
            doc! { "$set": { "active": false } },
        )
        .await?;
    install_published_snapshot(record.snapshot.clone(), true);
    write_audit(
        &state.workbench_database,
        &record,
        "registry.version.published",
        &user.email,
    )
    .await?;
    Ok(Json(record))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::registry::snapshot;

    #[test]
    fn difficulty_impact_names_the_changed_primary_can_do_configuration() {
        let active = snapshot().clone();
        let mut draft = active.clone();
        let mut added = draft.capability_difficulty_profile_sets[0].clone();
        added.id.push_str("-additional");
        added.primary_can_do_id = "A1-R2".to_string();
        draft.capability_difficulty_profile_sets.push(added);
        let changes = difficulty_configuration_changes(&active, &draft);
        assert_eq!(changes.len(), 1);
        let primary = draft
            .can_do_options
            .iter()
            .find(|can_do| can_do.id == "A1-R2")
            .unwrap();
        assert!(changes[0].contains(&primary.label));
        assert!(!changes[0].contains("A1-R2"));
        assert!(difficulty_configuration_changes(&active, &active).is_empty());
    }
}
