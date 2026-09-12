use std::collections::HashMap;

use axum::{
    Json,
    extract::{Path, Query, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::{Document, doc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        coverage::{CoverageVersion, version_is_approved},
        domain::{LanguageItem, LanguageItemRecordState, LanguageItemVersion, task_package_hash},
        registry::snapshot_for,
        version_usage::{
            SaveUsageEvent, UsageChange, UsageEvent, UsageState, request_matches, validate_change,
        },
    },
    state::ServerState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionUsageSummary {
    pub(super) version_id: String,
    pub(super) version_number: u64,
    pub(super) content_hash: String,
    pub(super) registry_version: String,
    pub(super) approved: bool,
    pub(super) approval_issue: Option<String>,
    pub(super) state: UsageState,
    pub(super) revision: u64,
    pub(super) last_suspension_revision: Option<u64>,
    pub(super) latest_pilot: Option<UsageEvent>,
}

#[derive(Serialize)]
pub struct ItemUsageView {
    versions: Vec<VersionUsageSummary>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionUsageView {
    version: VersionUsageSummary,
    events: Vec<UsageEvent>,
    next_before_revision: Option<u64>,
}

#[derive(Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct HistoryQuery {
    before_revision: Option<u64>,
}

fn conflict(message: &str) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

async fn item(state: &ServerState, item_id: &str) -> Result<LanguageItem, Error> {
    state
        .workbench_database
        .language_items
        .find_one(doc! { "id": item_id })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Item not found".into()))
}

async fn version(
    state: &ServerState,
    item_id: &str,
    version_id: &str,
) -> Result<LanguageItemVersion, Error> {
    state
        .workbench_database
        .versions
        .find_one(doc! { "id": version_id, "itemId": item_id })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Item version not found".into()))
}

async fn approval_records(
    state: &ServerState,
    filter: Document,
) -> Result<HashMap<String, CoverageVersion>, Error> {
    let database = &state.workbench_database;
    // The same version-scoped decisions used by Coverage remain authoritative even
    // after a newer draft clears the item's current review link.
    let pipeline = vec![
        doc! { "$match": filter },
        doc! { "$project": { "_id": 0, "id": 1, "versionNumber": 1, "lifecycleStatus": 1, "metadata": { "$literal": {} } } },
        doc! { "$lookup": {
            "from": database.reviews.name(), "let": { "versionId": "$id" },
            "pipeline": [
                { "$match": { "$expr": { "$eq": ["$versionId", "$$versionId"] } } },
                { "$sort": { "createdAt": 1, "_id": 1 } },
                { "$group": { "_id": "$gateId", "decision": { "$last": "$decision" } } },
                { "$project": { "_id": 0, "gateId": "$_id", "decision": 1 } }
            ], "as": "gateDecisions"
        } },
        doc! { "$lookup": {
            "from": database.review_discussions.name(), "let": { "versionId": "$id" },
            "pipeline": [
                { "$match": { "kind": "changeRequest", "$expr": { "$eq": ["$versionId", "$$versionId"] } } },
                { "$project": { "_id": 0, "id": 1 } },
                { "$lookup": {
                    "from": database.review_discussion_events.name(), "let": { "discussionId": "$id" },
                    "pipeline": [
                        { "$match": { "kind": { "$ne": "comment" }, "$expr": { "$eq": ["$discussionId", "$$discussionId"] } } },
                        { "$sort": { "createdAt": -1, "_id": -1 } }, { "$limit": 1 },
                        { "$project": { "_id": 0, "kind": 1 } }
                    ], "as": "latestEvent"
                } },
                { "$match": { "latestEvent.0.kind": { "$ne": "resolved" } } },
                { "$project": { "id": 1 } }
            ], "as": "unresolvedRequests"
        } },
        doc! { "$set": { "unresolvedRequests": { "$map": { "input": "$unresolvedRequests", "as": "request", "in": "$$request.id" } } } },
    ];
    let records: Vec<CoverageVersion> = database
        .versions
        .aggregate(pipeline)
        .with_type::<CoverageVersion>()
        .await?
        .try_collect()
        .await?;
    Ok(records
        .into_iter()
        .map(|record| (record.id.clone(), record))
        .collect())
}

fn approval_issue(
    version: &LanguageItemVersion,
    review: Option<&CoverageVersion>,
) -> Option<String> {
    if !version.frozen || task_package_hash(&version.package) != version.content_hash {
        return Some("This version is not an intact frozen content snapshot.".into());
    }
    let Some(registry) = snapshot_for(&version.package.spec_versions.registry_bundle_version)
    else {
        return Some("The pinned Assessment Settings version is unavailable.".into());
    };
    if !review
        .is_some_and(|record| version_is_approved(record, Some(&registry.required_review_gate_ids)))
    {
        return Some("This version needs approval with all change requests resolved.".into());
    }
    None
}

async fn latest_event(state: &ServerState, filter: Document) -> Result<Option<UsageEvent>, Error> {
    Ok(state
        .workbench_database
        .version_usage_events
        .find_one(filter)
        .sort(doc! { "revision": -1 })
        .await?)
}

async fn summary(
    state: &ServerState,
    version: &LanguageItemVersion,
    review: Option<&CoverageVersion>,
) -> Result<VersionUsageSummary, Error> {
    let latest = latest_event(state, doc! { "versionId": &version.id }).await?;
    let revision = latest.as_ref().map_or(0, |event| event.revision);
    let (latest_pilot, last_suspension) = tokio::try_join!(
        latest_event(
            state,
            doc! {
                "versionId": &version.id, "change.kind": "pilot", "revision": { "$lte": revision as i64 }
            }
        ),
        latest_event(
            state,
            doc! {
                "versionId": &version.id, "change.kind": "state", "change.state": "suspended", "revision": { "$lte": revision as i64 }
            }
        ),
    )?;
    let approval_issue = approval_issue(version, review);
    Ok(VersionUsageSummary {
        version_id: version.id.clone(),
        version_number: version.version_number,
        content_hash: version.content_hash.clone(),
        registry_version: version
            .package
            .spec_versions
            .registry_bundle_version
            .clone(),
        approved: approval_issue.is_none(),
        approval_issue,
        state: latest
            .as_ref()
            .map_or(UsageState::Unreleased, |event| event.state),
        revision,
        last_suspension_revision: last_suspension.map(|event| event.revision),
        latest_pilot,
    })
}

pub async fn get_item_usage(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(item_id): Path<String>,
) -> Result<Json<ItemUsageView>, Error> {
    item(&state, &item_id).await?;
    let (versions, approvals) = tokio::try_join!(
        async {
            let versions: Vec<LanguageItemVersion> = state
                .workbench_database
                .versions
                .find(doc! { "itemId": &item_id })
                .sort(doc! { "versionNumber": -1 })
                .await?
                .try_collect()
                .await?;
            Ok::<_, Error>(versions)
        },
        approval_records(&state, doc! { "itemId": &item_id }),
    )?;
    let mut summaries = Vec::with_capacity(versions.len());
    for version in &versions {
        summaries.push(summary(&state, version, approvals.get(&version.id)).await?);
    }
    Ok(Json(ItemUsageView {
        versions: summaries,
    }))
}

pub(super) async fn version_usage_summary(
    state: &ServerState,
    version: &LanguageItemVersion,
) -> Result<VersionUsageSummary, Error> {
    let approvals = approval_records(
        state,
        doc! { "id": &version.id, "itemId": &version.item_id },
    )
    .await?;
    summary(state, version, approvals.get(&version.id)).await
}

pub async fn get_version_usage(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path((item_id, version_id)): Path<(String, String)>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<VersionUsageView>, Error> {
    item(&state, &item_id).await?;
    let version = version(&state, &item_id, &version_id).await?;
    let approvals =
        approval_records(&state, doc! { "id": &version_id, "itemId": &item_id }).await?;
    let version_summary = summary(&state, &version, approvals.get(&version_id)).await?;
    let mut revision_filter = doc! { "$lte": version_summary.revision as i64 };
    if let Some(before) = query.before_revision {
        let before = i64::try_from(before).map_err(|_| {
            Error::Server(StatusCode::BAD_REQUEST, "Invalid history revision".into())
        })?;
        revision_filter.insert("$lt", before);
    }
    let filter = doc! { "versionId": &version_id, "revision": revision_filter };
    let mut events: Vec<UsageEvent> = state
        .workbench_database
        .version_usage_events
        .find(filter)
        .sort(doc! { "revision": -1 })
        .limit(51)
        .await?
        .try_collect()
        .await?;
    let has_more = events.len() > 50;
    events.truncate(50);
    let next_before_revision = if has_more {
        events.last().map(|event| event.revision)
    } else {
        None
    };
    Ok(Json(VersionUsageView {
        version: version_summary,
        events,
        next_before_revision,
    }))
}

fn replay(
    event: UsageEvent,
    body: &SaveUsageEvent,
    actor: &str,
) -> Result<Json<UsageEvent>, Error> {
    if request_matches(&event, body, actor) {
        Ok(Json(event))
    } else {
        Err(conflict(
            "This request ID was already used with different content. Reload and retry with a new request.",
        ))
    }
}

pub async fn post_version_usage(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path((item_id, version_id)): Path<(String, String)>,
    Json(body): Json<SaveUsageEvent>,
) -> Result<Json<UsageEvent>, Error> {
    let item = item(&state, &item_id).await?;
    if item.owner_email != user.email {
        return Err(Error::Server(
            StatusCode::FORBIDDEN,
            "Only the item owner can record version use or pilot results.".into(),
        ));
    }
    let version = version(&state, &item_id, &version_id).await?;
    let request_filter = doc! { "versionId": &version_id, "requestId": &body.request_id };
    if let Some(existing) = latest_event(&state, request_filter.clone()).await? {
        return replay(existing, &body, &user.email);
    }
    if item.record_state != LanguageItemRecordState::Active {
        return Err(conflict(
            "Restore this item before changing its version use or recording pilot results.",
        ));
    }
    let approvals =
        approval_records(&state, doc! { "id": &version_id, "itemId": &item_id }).await?;
    let current = summary(&state, &version, approvals.get(&version_id)).await?;
    let safe_withdrawal = current.revision > 0
        && version.frozen
        && task_package_hash(&version.package) == version.content_hash
        && matches!(
            &body.change,
            UsageChange::State {
                state: UsageState::Suspended | UsageState::Retired,
                ..
            }
        );
    if let Some(issue) = &current.approval_issue
        && !safe_withdrawal
    {
        return Err(conflict(issue));
    }
    if body.expected_revision != current.revision {
        return Err(conflict(
            "This version's use history changed. Reload before recording a new event.",
        ));
    }
    let next = validate_change(
        &body,
        current.state,
        current.last_suspension_revision.unwrap_or(0),
        current.latest_pilot.as_ref(),
    )
    .map_err(|message| Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message))?;
    let event = UsageEvent {
        id: format!("LVU-{}", Uuid::new_v4()),
        item_id,
        version_id: version_id.clone(),
        content_hash: version.content_hash,
        registry_version: current.registry_version,
        revision: body.expected_revision + 1,
        request_id: body.request_id.clone(),
        actor_email: user.email.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
        state: next,
        change: body.change.clone(),
    };
    // The unique version/revision index is the compare-and-swap boundary. A retry
    // must identify exactly the same payload, including after an uncertain response.
    if let Err(error) = state
        .workbench_database
        .version_usage_events
        .insert_one(&event)
        .await
    {
        if let Some(existing) = latest_event(&state, request_filter).await? {
            return replay(existing, &body, &user.email);
        }
        if latest_event(&state, doc! { "versionId": &version_id })
            .await?
            .is_some_and(|latest| latest.revision > body.expected_revision)
        {
            return Err(conflict(
                "Another use or pilot event was saved first. Reload before retrying.",
            ));
        }
        return Err(error.into());
    }
    Ok(Json(event))
}
