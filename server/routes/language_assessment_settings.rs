use std::collections::{HashMap, HashSet};

use axum::{
    Json,
    extract::{Path, Query, State},
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
            RegistrySnapshot, active_snapshot, hydrate_published_registry_snapshot,
            install_published_snapshot, item_format_name, normalize_registry_snapshot,
            prepare_registry_draft, upgrade_draft_context_schema,
        },
        registry_content::validate_language_content,
        registry_store::{
            REGISTRY_STATUS_DRAFT, REGISTRY_STATUS_PUBLISHED, RegistryAuditEvent, RegistryImpact,
            RegistrySectionChange, RegistryValidationResult, RegistryVersionRecord,
            validate_registry, write_audit,
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

fn check_revision(record: &RegistryVersionRecord, expected_revision: u64) -> Result<(), Error> {
    if record.revision != expected_revision {
        return Err(conflict(
            "Assessment Settings changed. Reload the saved draft before continuing.",
        ));
    }
    Ok(())
}

fn check_draft_owner(record: &RegistryVersionRecord, actor: &str) -> Result<(), Error> {
    if record.created_by != actor {
        return Err(Error::Server(
            StatusCode::FORBIDDEN,
            "Only the owner may change this Assessment Settings draft".to_string(),
        ));
    }
    Ok(())
}

fn check_publish_base(
    record: &RegistryVersionRecord,
    active_version: &str,
    expected_active_version: &str,
) -> Result<(), Error> {
    if active_version != expected_active_version
        || record.base_version.as_deref() != Some(active_version)
    {
        return Err(conflict(
            "Published Assessment Settings changed. Start a draft from the latest published settings before publishing.",
        ));
    }
    Ok(())
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
    if record.status == REGISTRY_STATUS_PUBLISHED {
        hydrate_published_registry_snapshot(&mut record.snapshot);
    } else {
        normalize_registry_snapshot(&mut record.snapshot);
    }
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
    let version = body
        .version
        .map(|value| value.trim().to_string())
        .unwrap_or_else(|| {
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
    prepare_registry_draft(&mut draft_snapshot);
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
    let version = body.version.trim();
    validate_version_label(version)?;
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    if record.status != REGISTRY_STATUS_DRAFT {
        return Err(conflict("Published Registry versions are immutable"));
    }
    check_draft_owner(&record, &user.email)?;
    check_revision(&record, body.expected_revision)?;
    if version != record.version
        && state
            .workbench_database
            .registry_versions
            .count_documents(doc! { "version": version })
            .await?
            > 0
    {
        return Err(conflict(format!(
            "Registry version {} already exists",
            version
        )));
    }
    let content_validation = validate_language_content(&body.snapshot, Some(&record.snapshot));
    if !content_validation.valid {
        return Err(Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            serde_json::to_string(&content_validation)
                .expect("Language content validation serializes"),
        ));
    }
    record.version = version.to_string();
    record.snapshot = body.snapshot;
    upgrade_draft_context_schema(&mut record.snapshot);
    record.snapshot.settings_schema_version = 1;
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedRevisionBody {
    expected_revision: u64,
}

pub async fn post_validate(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
    Json(body): Json<ExpectedRevisionBody>,
) -> Result<Json<RegistryValidationResult>, Error> {
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    check_revision(&record, body.expected_revision)?;
    normalize_registry_snapshot(&mut record.snapshot);
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

fn additional_changes(
    left: &RegistrySnapshot,
    right: &RegistrySnapshot,
) -> Vec<RegistrySectionChange> {
    let left_value = serde_json::to_value(left).expect("RegistrySnapshot serializes");
    let right_value = serde_json::to_value(right).expect("RegistrySnapshot serializes");
    let mut changes = Vec::new();
    for (label, fields) in [
        ("Slots", &["blueprintSlots"][..]),
        ("Language content", &["contentIdOptions"][..]),
        ("Schemas", &["candidateSchemas", "taskPackageSchema"][..]),
        ("Review gates", &["requiredReviewGateIds"][..]),
        (
            "Domain and difficulty options",
            &["allowedDomains", "difficultyBands"][..],
        ),
        (
            "Named references",
            &["taskFamilyOptions", "referenceLabels"][..],
        ),
        ("Registry rules", &["limitations", "sourceFingerprint"][..]),
    ] {
        let count = fields
            .iter()
            .map(|field| {
                match (
                    left_value.get(*field).and_then(serde_json::Value::as_array),
                    right_value
                        .get(*field)
                        .and_then(serde_json::Value::as_array),
                ) {
                    (Some(before), Some(after)) => changed_count(
                        before.iter().enumerate().map(|(index, value)| {
                            (
                                value
                                    .get("id")
                                    .or_else(|| value.get("$id"))
                                    .and_then(serde_json::Value::as_str)
                                    .or_else(|| value.as_str())
                                    .map(str::to_string)
                                    .unwrap_or_else(|| index.to_string()),
                                value.to_string(),
                            )
                        }),
                        after.iter().enumerate().map(|(index, value)| {
                            (
                                value
                                    .get("id")
                                    .or_else(|| value.get("$id"))
                                    .and_then(serde_json::Value::as_str)
                                    .or_else(|| value.as_str())
                                    .map(str::to_string)
                                    .unwrap_or_else(|| index.to_string()),
                                value.to_string(),
                            )
                        }),
                    ),
                    _ => usize::from(left_value.get(*field) != right_value.get(*field)),
                }
            })
            .sum();
        if count > 0 {
            changes.push(RegistrySectionChange {
                label: label.to_string(),
                count,
            });
        }
    }
    changes
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImpactQuery {
    expected_revision: Option<u64>,
}

pub async fn get_impact(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
    Query(query): Query<ImpactQuery>,
) -> Result<Json<RegistryImpact>, Error> {
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    if let Some(expected_revision) = query.expected_revision {
        check_revision(&record, expected_revision)?;
    }
    normalize_registry_snapshot(&mut record.snapshot);
    let active = active_snapshot();
    let items_pinned_to_active_version = state
        .workbench_database
        .language_items
        .count_documents(doc! {
            "draft.specVersions.registryBundleVersion": &active.bundle_version
        })
        .await?;
    Ok(Json(RegistryImpact {
        draft_revision: record.revision,
        base_version: record.base_version.clone(),
        stale_base: record.base_version.as_deref() != Some(active.bundle_version.as_str()),
        additional_changes: additional_changes(&active, &record.snapshot),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishBody {
    expected_revision: u64,
    expected_active_version: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishResponse {
    #[serde(flatten)]
    record: RegistryVersionRecord,
    publication_warnings: Vec<String>,
}

fn is_same_publication(record: &RegistryVersionRecord, body: &PublishBody) -> bool {
    record.status == REGISTRY_STATUS_PUBLISHED
        && body.expected_revision.checked_add(1) == Some(record.revision)
        && record.base_version.as_deref() == Some(body.expected_active_version.as_str())
}

async fn finish_committed_publication(
    state: &ServerState,
    mut record: RegistryVersionRecord,
) -> PublishResponse {
    let mut warnings = Vec::new();
    match state.workbench_database.registry_versions.find_one(doc! { "status": REGISTRY_STATUS_PUBLISHED, "active": true })
        .sort(doc! { "publishedAt": -1, "updatedAt": -1, "id": -1 }).await {
        Ok(Some(mut active)) => {
            hydrate_published_registry_snapshot(&mut active.snapshot);
            install_published_snapshot(active.snapshot, true);
            record.active = active.id == record.id;
            if state.workbench_database.registry_versions.update_many(
                doc! { "active": true, "id": { "$ne": &active.id } },
                doc! { "$set": { "active": false } },
            ).await.is_err() {
                warnings.push("Settings are published. Previous active-version flags still need cleanup; retry Publish to complete it.".to_string());
            }
        }
        _ => warnings.push("Settings are published, but the active-version status could not be reconciled. Retry Publish to complete it.".to_string()),
    }
    if write_audit(
        &state.workbench_database,
        &record,
        "registry.version.published",
        &record.updated_by,
    )
    .await
    .is_err()
    {
        warnings.push("Settings are published, but the publication audit event has not been confirmed. Retry Publish to record it.".to_string());
    }
    PublishResponse {
        record,
        publication_warnings: warnings,
    }
}

pub async fn post_publish(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
    Json(body): Json<PublishBody>,
) -> Result<Json<PublishResponse>, Error> {
    let _publish_guard = REGISTRY_PUBLISH_LOCK.lock().await;
    let mut record = state
        .workbench_database
        .registry_versions
        .find_one(doc! { "id": &id })
        .await?
        .ok_or_else(|| not_found(&id))?;
    check_draft_owner(&record, &user.email)?;
    if is_same_publication(&record, &body) {
        return Ok(Json(finish_committed_publication(&state, record).await));
    }
    if record.status != REGISTRY_STATUS_DRAFT {
        return Err(conflict("Only a Registry draft can be published"));
    }
    check_revision(&record, body.expected_revision)?;
    check_publish_base(
        &record,
        &active_snapshot().bundle_version,
        &body.expected_active_version,
    )?;
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
    // The replacement is the durable commit. Runtime visibility must not depend
    // on the recoverable cleanup and audit operations that follow it.
    install_published_snapshot(record.snapshot.clone(), true);
    Ok(Json(finish_committed_publication(&state, record).await))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::registry::snapshot;

    fn draft_record() -> RegistryVersionRecord {
        RegistryVersionRecord {
            id: "draft-record".to_string(),
            version: "draft-version".to_string(),
            status: REGISTRY_STATUS_DRAFT.to_string(),
            active: false,
            revision: 7,
            base_version: Some("published-version".to_string()),
            snapshot: snapshot().clone(),
            created_by: "owner@example.test".to_string(),
            updated_by: "owner@example.test".to_string(),
            created_at: "2026-09-08T00:00:00Z".to_string(),
            updated_at: "2026-09-08T00:00:00Z".to_string(),
            published_at: None,
        }
    }

    #[test]
    fn publication_rejects_a_stale_browser_revision_or_published_base() {
        let record = draft_record();
        assert!(check_revision(&record, 7).is_ok());
        assert!(check_revision(&record, 6).is_err());
        assert!(check_publish_base(&record, "published-version", "published-version").is_ok());
        assert!(check_publish_base(&record, "new-publication", "published-version").is_err());
        assert!(check_publish_base(&record, "new-publication", "new-publication").is_err());
    }

    #[test]
    fn mutable_settings_are_owned_by_the_draft_creator() {
        let record = draft_record();
        assert!(check_draft_owner(&record, "owner@example.test").is_ok());
        assert!(check_draft_owner(&record, "different@example.test").is_err());
    }

    #[test]
    fn publication_retry_matches_the_committed_revision_and_original_base() {
        let mut record = draft_record();
        let request = PublishBody {
            expected_revision: 7,
            expected_active_version: "published-version".to_string(),
        };
        assert!(!is_same_publication(&record, &request));
        record.status = REGISTRY_STATUS_PUBLISHED.to_string();
        record.revision = 8;
        assert!(is_same_publication(&record, &request));
        record.active = false;
        assert!(is_same_publication(&record, &request));
        record.revision = 9;
        assert!(!is_same_publication(&record, &request));
        record.revision = 8;
        record.base_version = Some("different-base".to_string());
        assert!(!is_same_publication(&record, &request));
    }

    #[test]
    fn interrupted_publication_selects_latest_active_record_deterministically() {
        let mut previous = draft_record();
        previous.status = REGISTRY_STATUS_PUBLISHED.to_string();
        previous.active = true;
        previous.id = "previous".to_string();
        previous.published_at = Some("2026-09-08T00:00:00Z".to_string());
        let mut committed = previous.clone();
        committed.id = "committed".to_string();
        committed.published_at = Some("2026-09-08T00:01:00Z".to_string());
        let records = vec![committed.clone(), previous.clone()];
        assert_eq!(
            crate::language_items::registry_store::preferred_published_record(&records)
                .unwrap()
                .id,
            "committed"
        );
        let reversed = vec![previous, committed];
        assert_eq!(
            crate::language_items::registry_store::preferred_published_record(&reversed)
                .unwrap()
                .id,
            "committed"
        );
    }

    #[test]
    fn committed_publication_can_report_unconfirmed_audit_without_a_false_failure() {
        let mut record = draft_record();
        record.status = REGISTRY_STATUS_PUBLISHED.to_string();
        let response = serde_json::to_value(PublishResponse {
            record,
            publication_warnings: vec!["Audit event not confirmed".to_string()],
        })
        .unwrap();
        assert_eq!(response["status"], "published");
        assert_eq!(
            response["publicationWarnings"][0],
            "Audit event not confirmed"
        );
    }

    #[test]
    fn impact_covers_content_schema_and_review_rules() {
        let active = snapshot().clone();
        let mut draft = active.clone();
        draft.content_id_options[0].label.push_str(" changed");
        draft.content_id_options[1].label.push_str(" changed");
        draft.task_package_schema["title"] = serde_json::json!("Changed schema title");
        draft.required_review_gate_ids.pop();
        let changes = additional_changes(&active, &draft);
        assert_eq!(
            changes
                .iter()
                .find(|change| change.label == "Language content")
                .unwrap()
                .count,
            2
        );
        assert_eq!(
            changes
                .iter()
                .find(|change| change.label == "Schemas")
                .unwrap()
                .count,
            1
        );
        assert_eq!(
            changes
                .iter()
                .find(|change| change.label == "Review gates")
                .unwrap()
                .count,
            1
        );
        assert!(additional_changes(&active, &active).is_empty());
    }

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
