use std::collections::{HashMap, HashSet};

use axum::{
    Json,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::{doc, serialize_to_document};
use serde::Deserialize;
use serde_json::json;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        domain::{
            LanguageItemAssembly, LanguageItemAssemblySource, LanguageItemAuditEvent,
            LanguageItemRecordState, LanguageItemStatus, LanguageItemVersion, task_package_hash,
        },
        export::{assembly_id, assembly_source_content_hash, build_legacy_assembly},
        validation::validate_task_package,
    },
    state::ServerState,
};

const ASSEMBLY_SLOT_ID: &str = "R-A1-1";

fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn conflict(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

fn unprocessable(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message.into())
}

async fn write_assembly_audits(
    state: &ServerState,
    assembly: &LanguageItemAssembly,
    actor_email: &str,
) -> Result<(), Error> {
    for source in &assembly.sources {
        let event = LanguageItemAuditEvent {
            id: format!("assembly:{}:{}", assembly.id, source.item_id),
            item_id: source.item_id.clone(),
            version_id: Some(source.version_id.clone()),
            action: "assembly.staging.completed".to_string(),
            actor_email: actor_email.to_string(),
            details: json!({
                "assemblyId": assembly.id,
                "legacyExamId": assembly.legacy_exam_id,
            }),
            created_at: assembly.created_at.clone(),
        };
        state
            .workbench_database
            .audit_events
            .update_one(
                doc! { "id": &event.id },
                doc! { "$setOnInsert": serialize_to_document(&event)? },
            )
            .upsert(true)
            .await?;
    }
    Ok(())
}

pub async fn get_assemblies(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<LanguageItemAssembly>>, Error> {
    let assemblies = state
        .workbench_database
        .assemblies
        .find(doc! {})
        .sort(doc! { "createdAt": -1 })
        .await?
        .try_collect()
        .await?;
    Ok(Json(assemblies))
}

pub async fn get_assembly(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(assembly_id): Path<String>,
) -> Result<Json<LanguageItemAssembly>, Error> {
    let assembly = state
        .workbench_database
        .assemblies
        .find_one(doc! { "id": &assembly_id })
        .await?
        .ok_or_else(|| {
            Error::Server(
                StatusCode::NOT_FOUND,
                format!("language item assembly not found: {assembly_id}"),
            )
        })?;
    Ok(Json(assembly))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateAssemblyBody {
    title: String,
    version_ids: Vec<String>,
}

pub async fn post_staging_assembly(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Json(body): Json<CreateAssemblyBody>,
) -> Result<Json<LanguageItemAssembly>, Error> {
    let title = body.title.trim();
    if title.is_empty() {
        return Err(unprocessable("assembly title cannot be empty"));
    }
    if !(5..=6).contains(&body.version_ids.len()) {
        return Err(unprocessable(
            "R-A1-1 assembly requires exactly 5 or 6 exported versions",
        ));
    }
    let unique_ids: HashSet<&str> = body.version_ids.iter().map(String::as_str).collect();
    if unique_ids.len() != body.version_ids.len() {
        return Err(unprocessable("assembly version IDs must be unique"));
    }

    let mut versions = Vec::with_capacity(body.version_ids.len());
    let mut item_export_ids = HashMap::with_capacity(body.version_ids.len());
    for version_id in body.version_ids {
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
        if !version.frozen {
            return Err(conflict(format!("version is not frozen: {version_id}")));
        }
        if version.package.blueprint_slot_id != ASSEMBLY_SLOT_ID {
            return Err(unprocessable(format!(
                "version {version_id} is not an {ASSEMBLY_SLOT_ID} item"
            )));
        }
        let item = state
            .workbench_database
            .language_items
            .find_one(doc! { "id": &version.item_id })
            .await?
            .ok_or_else(|| {
                Error::Server(
                    StatusCode::NOT_FOUND,
                    format!("language item not found: {}", version.item_id),
                )
            })?;
        if item.latest_version_id.as_deref() != Some(version_id.as_str())
            || item.record_state != LanguageItemRecordState::Active
            || item.status != LanguageItemStatus::ExportedToStaging
        {
            return Err(conflict(format!(
                "version must be the latest exported Staging version: {version_id}"
            )));
        }
        let item_export_id = format!("staging:{version_id}");
        let item_export = state
            .workbench_database
            .exports
            .find_one(doc! {
                "id": &item_export_id,
                "versionId": &version_id,
                "target": "staging",
                "result": "completed",
            })
            .await?
            .ok_or_else(|| conflict(format!("missing completed Staging export: {version_id}")))?;
        let validation = validate_task_package(&version.package);
        if !validation.valid {
            return Err(unprocessable(
                serde_json::to_string(&validation)
                    .unwrap_or_else(|_| format!("version validation failed: {version_id}")),
            ));
        }
        if task_package_hash(&version.package) != version.content_hash {
            return Err(conflict(format!(
                "version content hash no longer matches: {version_id}"
            )));
        }
        item_export_ids.insert(version_id.clone(), item_export.id);
        versions.push(version);
    }

    versions.sort_by(|left, right| left.id.cmp(&right.id));
    let assembly_id = assembly_id(title, &versions);
    if let Some(existing) = state
        .workbench_database
        .assemblies
        .find_one(doc! { "id": &assembly_id })
        .await?
    {
        write_assembly_audits(&state, &existing, &existing.exported_by).await?;
        return Ok(Json(existing));
    }

    let legacy = build_legacy_assembly(&assembly_id, title, &versions).map_err(unprocessable)?;
    let source_content_hash = assembly_source_content_hash(&versions);
    let artifact_id = format!("language-item-assembly:{assembly_id}");
    let timestamp = now();
    let sources = legacy
        .sources
        .iter()
        .map(|source| LanguageItemAssemblySource {
            item_id: source.item_id.clone(),
            version_id: source.version_id.clone(),
            item_export_id: item_export_ids
                .get(&source.version_id)
                .expect("every assembled version has a staging export")
                .clone(),
            legacy_question_set_id: source.question_set_id.to_hex(),
            legacy_question_id: source.question_id.to_hex(),
            option_answer_ids: source.option_answer_ids.clone(),
        })
        .collect();
    let assembly = LanguageItemAssembly {
        id: assembly_id.clone(),
        title: title.to_string(),
        blueprint_slot_id: ASSEMBLY_SLOT_ID.to_string(),
        target: "staging".to_string(),
        artifact_id,
        legacy_exam_id: legacy.exam_id.to_hex(),
        source_content_hash,
        sources,
        result: "completed".to_string(),
        exported_by: user.email.clone(),
        created_at: timestamp,
    };
    let environment_exam: prisma::ExamEnvironmentExam =
        bson::deserialize_from_document(serialize_to_document(&legacy.exam)?)?;
    let persistence_result: Result<(), Error> = async {
        state
            .staging_database
            .exam_creator_exam
            .replace_one(doc! { "_id": legacy.exam_id }, &legacy.exam)
            .upsert(true)
            .await?;
        state
            .staging_database
            .exam
            .replace_one(doc! { "_id": legacy.exam_id }, &environment_exam)
            .upsert(true)
            .await?;
        state
            .workbench_database
            .assemblies
            .update_one(
                doc! { "id": &assembly_id },
                doc! { "$setOnInsert": serialize_to_document(&assembly)? },
            )
            .upsert(true)
            .await?;
        Ok(())
    }
    .await;
    if let Err(error) = persistence_result {
        if let Some(existing) = state
            .workbench_database
            .assemblies
            .find_one(doc! { "id": &assembly_id })
            .await?
        {
            write_assembly_audits(&state, &existing, &existing.exported_by).await?;
            return Ok(Json(existing));
        }
        let _ = state
            .staging_database
            .exam
            .delete_one(doc! { "_id": legacy.exam_id })
            .await;
        let _ = state
            .staging_database
            .exam_creator_exam
            .delete_one(doc! { "_id": legacy.exam_id })
            .await;
        return Err(error);
    }

    write_assembly_audits(&state, &assembly, &user.email).await?;
    let stored = state
        .workbench_database
        .assemblies
        .find_one(doc! { "id": &assembly_id })
        .await?
        .ok_or_else(|| conflict("assembly disappeared after persistence"))?;
    Ok(Json(stored))
}
