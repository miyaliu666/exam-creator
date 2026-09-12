use axum::{
    Json,
    extract::{Path, State},
};
use http::StatusCode;
use mongodb::bson::doc;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        assembly_manifest::{AssemblyManifest, build_assembly_manifest},
        registry::snapshot_for,
    },
    state::ServerState,
};

pub async fn get_assembly_manifest(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path((item_id, version_id)): Path<(String, String)>,
) -> Result<Json<AssemblyManifest>, Error> {
    let item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &item_id })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Language item not found.".into()))?;
    let version = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id, "itemId": &item_id })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Item version not found.".into()))?;
    let registry = snapshot_for(&version.package.spec_versions.registry_bundle_version)
        .ok_or_else(|| {
            Error::Server(
                StatusCode::CONFLICT,
                "The version's pinned Assessment Settings are unavailable.".into(),
            )
        })?;
    let usage = super::language_item_usage::version_usage_summary(&state, &version).await?;
    let manifest = build_assembly_manifest(
        &version,
        &registry,
        usage.approved,
        item.record_state,
        usage.state,
        usage.revision,
    )
    .map_err(|message| Error::Server(StatusCode::CONFLICT, message))?;
    Ok(Json(manifest))
}
