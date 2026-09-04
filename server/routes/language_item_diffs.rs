use axum::{
    Json,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::doc;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        diff::diff_versions,
        domain::{LanguageItemVersion, LanguageItemVersionDiff},
    },
    state::ServerState,
};

pub async fn get_version_diff(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(version_id): Path<String>,
) -> Result<Json<LanguageItemVersionDiff>, Error> {
    let version: LanguageItemVersion = state
        .workbench_database
        .versions
        .find_one(doc! { "id": &version_id })
        .await?
        .ok_or_else(|| {
            Error::Server(
                StatusCode::NOT_FOUND,
                format!("language item version not found: {version_id}"),
            )
        })?;
    let base = state
        .workbench_database
        .versions
        .find(doc! {
            "itemId": &version.item_id,
            "versionNumber": { "$lt": version.version_number as i64 },
        })
        .sort(doc! { "versionNumber": -1 })
        .limit(1)
        .await?
        .try_next()
        .await?;

    Ok(Json(diff_versions(&version, base.as_ref())))
}
