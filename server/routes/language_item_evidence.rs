use axum::{
    Json,
    extract::{Path, State},
};
use http::StatusCode;
use mongodb::bson::doc;
use serde::Serialize;
use uuid::Uuid;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        domain::{LanguageItem, LanguageItemRecordState, LanguageItemStatus},
        evidence::{
            ItemEvidence, SaveEvidence, evidence_content_hash, evidence_is_current,
            validate_evidence,
        },
    },
    state::ServerState,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceView {
    revision: u64,
    current: bool,
    record: Option<ItemEvidence>,
}

async fn item(state: &ServerState, id: &str) -> Result<LanguageItem, Error> {
    state
        .workbench_database
        .language_items
        .find_one(doc! { "id": id })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Item not found".into()))
}

pub async fn get_evidence(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<EvidenceView>, Error> {
    let item = item(&state, &id).await?;
    let record = state
        .workbench_database
        .item_evidence
        .find_one(doc! { "itemId": &id })
        .sort(doc! { "createdAt": -1, "_id": -1 })
        .await?;
    let current = record
        .as_ref()
        .is_some_and(|record| evidence_is_current(record, &item.draft));
    Ok(Json(EvidenceView {
        revision: item.revision,
        current,
        record,
    }))
}

pub async fn post_evidence(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
    Json(body): Json<SaveEvidence>,
) -> Result<Json<EvidenceView>, Error> {
    let item = item(&state, &id).await?;
    if item.owner_email != user.email {
        return Err(Error::Server(
            StatusCode::FORBIDDEN,
            "Only the item owner can record its author review.".into(),
        ));
    }
    if item.record_state != LanguageItemRecordState::Active
        || item.status != LanguageItemStatus::Draft
        || item.revision != body.expected_revision
    {
        return Err(Error::Server(
            StatusCode::CONFLICT,
            "Save and reload the current active draft before recording evidence.".into(),
        ));
    }
    validate_evidence(&body, &item.draft)
        .map_err(|message| Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message))?;
    let record = ItemEvidence {
        id: format!("LIE-{}", Uuid::new_v4()),
        item_id: id.clone(),
        content_hash: evidence_content_hash(&item.draft),
        registry_version: item.draft.spec_versions.registry_bundle_version.clone(),
        reviewed_by: user.email,
        created_at: chrono::Utc::now().to_rfc3339(),
        targets: body.targets,
        sources: body.sources,
        quality_notes: body.quality_notes,
        originality_notes: body.originality_notes,
    };
    // Evidence never updates the mutable package; a concurrent edit makes this
    // append-only observation stale rather than blessing content not reviewed.
    state
        .workbench_database
        .item_evidence
        .insert_one(&record)
        .await?;
    let latest = self::item(&state, &id).await?;
    Ok(Json(EvidenceView {
        revision: latest.revision,
        current: evidence_is_current(&record, &latest.draft),
        record: Some(record),
    }))
}
