use std::{sync::LazyLock, time::Duration};

use axum::{
    Extension, Json,
    extract::{Path, State},
};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::{
    bson::{doc, serialize_to_document},
    options::ReturnDocument,
};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::Semaphore;
use uuid::Uuid;

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        ai,
        batch::{
            BatchChild, BatchGenerationJob, BatchGenerationView, CreateBatchBody,
            UncreatedChildRecovery, batch_identity, now, prepare_job, request_fingerprint,
            terminal_status, uncreated_child_recovery, validate_request,
        },
        domain::{
            AiGenerationRun, LanguageItem, LanguageItemAuditEvent, LanguageItemRecordState,
            LanguageItemStatus, ai_generation_setup_snapshot,
        },
        registry::active_snapshot,
    },
    state::ServerState,
};

use super::language_items::execute_ai_generation;

static WORKER_SLOTS: LazyLock<Semaphore> = LazyLock::new(|| Semaphore::new(2));
const LEASE_SECONDS: i64 = 45;

fn conflict(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::CONFLICT, message.into())
}

fn lease_expiration() -> String {
    (chrono::Utc::now() + chrono::Duration::seconds(LEASE_SECONDS))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

async fn owned_job(
    state: &ServerState,
    id: &str,
    owner: &str,
) -> Result<BatchGenerationJob, Error> {
    state
        .workbench_database
        .batch_generation_jobs
        .find_one(doc! { "id": id, "ownerEmail": owner })
        .await?
        .ok_or_else(|| Error::Server(StatusCode::NOT_FOUND, "Batch not found".to_string()))
}

pub async fn get_batches(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
) -> Result<Json<Vec<BatchGenerationView>>, Error> {
    let jobs: Vec<BatchGenerationJob> = state
        .workbench_database
        .batch_generation_jobs
        .find(doc! { "ownerEmail": &user.email })
        .sort(doc! { "createdAt": -1 })
        .limit(100)
        .await?
        .try_collect()
        .await?;
    Ok(Json(jobs.into_iter().map(Into::into).collect()))
}

pub async fn get_batch(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Path(id): Path<String>,
) -> Result<Json<BatchGenerationView>, Error> {
    Ok(Json(owned_job(&state, &id, &user.email).await?.into()))
}

pub async fn post_batch(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(client): Extension<reqwest::Client>,
    Json(body): Json<CreateBatchBody>,
) -> Result<Json<BatchGenerationView>, Error> {
    validate_request(&body)?;
    let id = batch_identity(&user.email, &body.idempotency_key);
    let fingerprint = request_fingerprint(&body);
    if let Some(existing) = state
        .workbench_database
        .batch_generation_jobs
        .find_one(doc! { "id": &id, "ownerEmail": &user.email })
        .await?
    {
        if existing.request_fingerprint != fingerprint {
            return Err(conflict(
                "This batch request key was already used for different requirements",
            ));
        }
        return Ok(Json(existing.into()));
    }
    let registry = active_snapshot();
    // All groups and allocated targets validate before the first durable item is created.
    let job = prepare_job(body, &user.email, &registry)?;
    let result = state
        .workbench_database
        .batch_generation_jobs
        .update_one(
            doc! { "id": &job.id, "ownerEmail": &user.email },
            doc! { "$setOnInsert": serialize_to_document(&job)? },
        )
        .upsert(true)
        .await;
    if let Err(error) = result {
        // A concurrent identical request can win the unique-key insert.
        if state
            .workbench_database
            .batch_generation_jobs
            .find_one(doc! { "id": &id, "ownerEmail": &user.email })
            .await?
            .is_none()
        {
            return Err(error.into());
        }
    }
    let stored = owned_job(&state, &id, &user.email).await?;
    if stored.request_fingerprint != fingerprint {
        return Err(conflict(
            "This batch request key was already used for different requirements",
        ));
    }
    launch_worker(state, client, id);
    Ok(Json(stored.into()))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ControlBody {
    action: String,
}

pub async fn control_batch(
    user: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Extension(client): Extension<reqwest::Client>,
    Path(id): Path<String>,
    Json(body): Json<ControlBody>,
) -> Result<Json<BatchGenerationView>, Error> {
    if !matches!(body.action.as_str(), "pause" | "resume") {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "Action must be pause or resume".to_string(),
        ));
    }
    let job = owned_job(&state, &id, &user.email).await?;
    if body.action == "resume" {
        recover_uncreated_children(&state, &job).await?;
    }
    let status = if body.action == "pause" {
        "paused"
    } else {
        "queued"
    };
    state.workbench_database.batch_generation_jobs.update_one(
        doc! { "id": &id, "ownerEmail": &user.email,
            "children": { "$elemMatch": { "status": { "$in": ["pending", "running"] } } } },
        doc! { "$set": { "status": status, "updatedAt": now(), "error": mongodb::bson::Bson::Null } },
    ).await?;
    let mut updated = owned_job(&state, &id, &user.email).await?;
    if let Some(status) = terminal_status(&updated.children) {
        // The final in-flight call may finish while pause/resume is being handled.
        state.workbench_database.batch_generation_jobs.update_one(
            doc! { "id": &id, "ownerEmail": &user.email,
                "children": { "$not": { "$elemMatch": { "status": { "$in": ["pending", "running"] } } } } },
            doc! { "$set": { "status": status, "updatedAt": now() } },
        ).await?;
        updated = owned_job(&state, &id, &user.email).await?;
    } else if body.action == "resume" {
        launch_worker(state, client, id);
    }
    Ok(Json(updated.into()))
}

async fn recover_uncreated_children(
    state: &ServerState,
    job: &BatchGenerationJob,
) -> Result<(), Error> {
    for child in job
        .children
        .iter()
        .filter(|child| child.status == "failed" && !child.item_created)
    {
        let item = state
            .workbench_database
            .language_items
            .find_one(doc! {
                "id": &child.item_id, "ownerEmail": &job.owner_email,
            })
            .await?;
        let run_exists = state
            .workbench_database
            .ai_generation_runs
            .find_one(doc! {
                "$or": [{ "id": &child.run_id }, { "itemId": &child.item_id }],
            })
            .await?
            .is_some();
        let mut recovered = child.clone();
        match uncreated_child_recovery(child, item.is_some(), run_exists) {
            UncreatedChildRecovery::RetryCreation => {
                recovered.status = "pending".to_string();
                recovered.error = None;
            }
            UncreatedChildRecovery::OpenExistingItem => {
                recovered.item_created = true;
            }
            UncreatedChildRecovery::None => continue,
        }
        let mut filter = doc! { "id": &job.id, "ownerEmail": &job.owner_email };
        filter.insert(format!("children.{}.status", child.index), "failed");
        filter.insert(format!("children.{}.itemCreated", child.index), false);
        let mut fields = doc! { "updatedAt": now() };
        fields.insert(
            format!("children.{}", child.index),
            serialize_to_document(&recovered)?,
        );
        // Concurrent resumes can only promote the same failed child once.
        state
            .workbench_database
            .batch_generation_jobs
            .update_one(filter, doc! { "$set": fields })
            .await?;
    }
    Ok(())
}

fn launch_worker(state: ServerState, client: reqwest::Client, id: String) {
    // Work remains durable in MongoDB when both slots are occupied; do not accumulate tasks.
    let Ok(permit) = WORKER_SLOTS.try_acquire() else {
        return;
    };
    tokio::spawn(async move {
        let _permit = permit;
        if let Err(error) = run_batch(&state, &client, &id).await {
            tracing::error!(batch_id = %id, error = %error, "language-item batch paused after worker failure");
        }
    });
}

/// Recover durable queued work after restarts. Paused batches require an author's resume action.
pub fn start_recovery_worker(state: ServerState, client: reqwest::Client) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(20));
        loop {
            interval.tick().await;
            let result = state.workbench_database.batch_generation_jobs.find(doc! {
                "status": { "$in": ["queued", "running"] },
                "$or": [ { "leaseExpiresAt": mongodb::bson::Bson::Null }, { "leaseExpiresAt": { "$lte": now() } } ],
            }).sort(doc! { "createdAt": 1 }).limit(20).await;
            match result {
                Ok(cursor) => match cursor.try_collect::<Vec<_>>().await {
                    Ok(jobs) => {
                        for job in jobs {
                            launch_worker(state.clone(), client.clone(), job.id);
                        }
                    }
                    Err(error) => {
                        tracing::error!(error = %error, "cannot read pending language-item batches")
                    }
                },
                Err(error) => {
                    tracing::error!(error = %error, "cannot recover language-item batches")
                }
            }
        }
    });
}

async fn run_batch(state: &ServerState, client: &reqwest::Client, id: &str) -> Result<(), Error> {
    let token = Uuid::new_v4().to_string();
    let claimed = state.workbench_database.batch_generation_jobs.find_one_and_update(
        doc! { "id": id, "status": { "$in": ["queued", "running"] },
            "$or": [ { "leaseExpiresAt": mongodb::bson::Bson::Null }, { "leaseExpiresAt": { "$lte": now() } } ] },
        doc! { "$set": { "status": "running", "workerToken": &token,
            "leaseExpiresAt": lease_expiration(), "updatedAt": now() } },
    ).return_document(ReturnDocument::After).await?;
    if claimed.is_none() {
        return Ok(());
    }
    let outcome = tokio::select! {
        result = process_children(state, client, id, &token) => result,
        result = heartbeat(state, id, &token) => result,
    };
    if let Err(error) = &outcome {
        // Persist an actionable interruption instead of leaving the job permanently running.
        state.workbench_database.batch_generation_jobs.update_one(
            doc! { "id": id, "workerToken": &token, "status": { "$ne": "paused" } },
            doc! { "$set": { "status": "partial", "error": error.to_string(), "updatedAt": now() } },
        ).await?;
    }
    state
        .workbench_database
        .batch_generation_jobs
        .update_one(
            doc! { "id": id, "workerToken": &token },
            doc! { "$set": { "workerToken": mongodb::bson::Bson::Null,
            "leaseExpiresAt": mongodb::bson::Bson::Null, "updatedAt": now() } },
        )
        .await?;
    outcome
}

async fn heartbeat(state: &ServerState, id: &str, token: &str) -> Result<(), Error> {
    loop {
        tokio::time::sleep(Duration::from_secs(10)).await;
        let result = state
            .workbench_database
            .batch_generation_jobs
            .update_one(
                doc! { "id": id, "workerToken": token, "leaseExpiresAt": { "$gt": now() } },
                doc! { "$set": { "leaseExpiresAt": lease_expiration() } },
            )
            .await?;
        if result.matched_count != 1 {
            return Err(conflict("Batch worker lease changed"));
        }
    }
}

async fn save_child(
    state: &ServerState,
    id: &str,
    token: &str,
    child: &BatchChild,
) -> Result<(), Error> {
    let mut fields = doc! { "updatedAt": now() };
    fields.insert(
        format!("children.{}", child.index),
        serialize_to_document(child)?,
    );
    let updated = state
        .workbench_database
        .batch_generation_jobs
        .update_one(
            doc! { "id": id, "workerToken": token, "leaseExpiresAt": { "$gt": now() } },
            doc! { "$set": fields },
        )
        .await?;
    if updated.matched_count != 1 {
        return Err(conflict("Batch worker lease changed"));
    }
    Ok(())
}

async fn process_children(
    state: &ServerState,
    client: &reqwest::Client,
    id: &str,
    token: &str,
) -> Result<(), Error> {
    loop {
        let Some(job) = state
            .workbench_database
            .batch_generation_jobs
            .find_one(doc! { "id": id, "workerToken": token, "leaseExpiresAt": { "$gt": now() } })
            .await?
        else {
            return Ok(());
        };
        if let Some(status) = terminal_status(&job.children) {
            state
                .workbench_database
                .batch_generation_jobs
                .update_one(
                    doc! { "id": id, "workerToken": token,
                    "leaseExpiresAt": { "$gt": now() } },
                    doc! { "$set": { "status": status, "updatedAt": now() } },
                )
                .await?;
            return Ok(());
        }
        if job.status == "paused" {
            return Ok(());
        }
        let Some(mut child) = job
            .children
            .iter()
            .find(|child| matches!(child.status.as_str(), "pending" | "running"))
            .cloned()
        else {
            return Ok(());
        };
        child.status = "running".to_string();
        child.error = None;
        let mut fields = doc! { "updatedAt": now() };
        fields.insert(
            format!("children.{}", child.index),
            serialize_to_document(&child)?,
        );
        let claimed = state
            .workbench_database
            .batch_generation_jobs
            .update_one(
                doc! { "id": id, "workerToken": token, "status": { "$ne": "paused" },
                "leaseExpiresAt": { "$gt": now() } },
                doc! { "$set": fields },
            )
            .await?;
        if claimed.matched_count != 1 {
            return Ok(());
        }
        if let Err(error) = generate_child(state, client, &job, token, &mut child).await {
            if state
                .workbench_database
                .batch_generation_jobs
                .find_one(doc! { "id": id, "workerToken": token,
                "leaseExpiresAt": { "$gt": now() } })
                .await?
                .is_none()
            {
                return Err(error);
            }
            child.status = "failed".to_string();
            child.error = Some(error.to_string());
            state
                .workbench_database
                .ai_generation_runs
                .update_one(
                    doc! { "id": &child.run_id, "status": { "$in": ["queued", "running"] } },
                    doc! { "$set": { "status": "failed", "error": error.to_string(),
                    "updatedAt": now(), "completedAt": now() } },
                )
                .await?;
        }
        save_child(state, id, token, &child).await?;
    }
}

fn queued_run(
    state: &ServerState,
    job: &BatchGenerationJob,
    child: &BatchChild,
) -> AiGenerationRun {
    let package = &child.setup_snapshot;
    let metadata = ai::provider_metadata(&state.env_vars.language_item_ai);
    let timestamp = now();
    AiGenerationRun {
        id: child.run_id.clone(),
        item_id: child.item_id.clone(),
        provider: metadata.provider.to_string(),
        model: metadata.model.to_string(),
        model_version: metadata.model_version.to_string(),
        prompt_id: ai::GENERATION_PROMPT_ID.to_string(),
        prompt_version: ai::GENERATION_PROMPT_VERSION.to_string(),
        output_schema_version: ai::GENERATION_OUTPUT_SCHEMA_VERSION.to_string(),
        spec_versions: package.spec_versions.clone(),
        blueprint_slot_id: package.blueprint_slot_id.clone(),
        task_family_id: package.task_family_id.clone(),
        item_format_id: package.item_format_id.clone(),
        renderer_id: package.renderer.renderer_id.clone(),
        primary_can_do_id: package.content.primary_can_do_id.clone(),
        primary_domain: package.content.primary_domain.clone(),
        context_id: package.content.context_id.clone(),
        difficulty_band: package.content.difficulty_band.clone(),
        target_content_ids: package.content.target_content_ids.clone(),
        required_information_points: package
            .content
            .required_information_points
            .iter()
            .map(|point| point.label.clone())
            .collect(),
        generation_setup_snapshot: Some(ai_generation_setup_snapshot(package)),
        requested_count: job.candidates_per_item,
        candidates: vec![],
        adopted_candidate_id: None,
        status: "queued".to_string(),
        error: None,
        idempotency_key: Some(format!("batch:{}", child.index)),
        attempt_count: 0,
        retry_count: 0,
        candidate_errors: vec![],
        elapsed_milliseconds: None,
        provider_calls: vec![],
        created_by: job.owner_email.clone(),
        created_at: timestamp.clone(),
        updated_at: timestamp,
        completed_at: None,
    }
}

async fn generate_child(
    state: &ServerState,
    client: &reqwest::Client,
    job: &BatchGenerationJob,
    token: &str,
    child: &mut BatchChild,
) -> Result<(), Error> {
    let timestamp = now();
    let item = LanguageItem {
        id: child.item_id.clone(),
        title: format!("{} · {}", job.title, child.index + 1),
        owner_email: job.owner_email.clone(),
        status: LanguageItemStatus::Draft,
        record_state: LanguageItemRecordState::Active,
        record_state_updated_at: None,
        record_state_updated_by: None,
        has_staging_export: false,
        github_review: None,
        revision: 1,
        draft: child.setup_snapshot.clone(),
        latest_version_id: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    };
    state
        .workbench_database
        .language_items
        .update_one(
            doc! { "id": &child.item_id },
            doc! { "$setOnInsert": serialize_to_document(&item)? },
        )
        .upsert(true)
        .await?;
    child.item_created = true;
    let stored_item = state
        .workbench_database
        .language_items
        .find_one(doc! { "id": &child.item_id })
        .await?
        .ok_or_else(|| conflict("The reserved item is unavailable"))?;
    if stored_item.owner_email != job.owner_email
        || stored_item.status != LanguageItemStatus::Draft
        || stored_item.record_state != LanguageItemRecordState::Active
        || ai_generation_setup_snapshot(&stored_item.draft)
            != ai_generation_setup_snapshot(&child.setup_snapshot)
    {
        return Err(conflict(
            "This item's setup or lifecycle changed; open the item to generate against its current requirements",
        ));
    }
    let run = queued_run(state, job, child);
    state
        .workbench_database
        .ai_generation_runs
        .update_one(
            doc! { "id": &child.run_id },
            doc! { "$setOnInsert": serialize_to_document(&run)? },
        )
        .upsert(true)
        .await?;
    // Opening a draft must already expose its queued run so the editor keeps polling.
    save_child(state, &job.id, token, child).await?;
    write_batch_audit(state, job, child).await?;
    let existing = state
        .workbench_database
        .ai_generation_runs
        .find_one(doc! { "id": &child.run_id })
        .await?
        .ok_or_else(|| conflict("The reserved AI generation run is unavailable"))?;
    let mut execution_error = None;
    if existing.status == "running" {
        // A prior process may have sent the provider request. Never bill for an automatic replay.
        let message = "Generation was interrupted before its result was saved. Open this item to explicitly request new candidates.";
        state.workbench_database.ai_generation_runs.update_one(
            doc! { "id": &child.run_id, "status": "running" },
            doc! { "$set": { "status": "failed", "error": message, "updatedAt": now(), "completedAt": now() } },
        ).await?;
    } else if existing.status == "queued" {
        let provider = ai::provider_metadata(&state.env_vars.language_item_ai);
        if existing.provider != provider.provider
            || existing.model != provider.model
            || existing.model_version != provider.model_version
            || existing.prompt_id != ai::GENERATION_PROMPT_ID
            || existing.prompt_version != ai::GENERATION_PROMPT_VERSION
            || existing.output_schema_version != ai::GENERATION_OUTPUT_SCHEMA_VERSION
        {
            let message = "The AI generation configuration changed since this run was queued. Open this item to explicitly request new candidates.";
            state.workbench_database.ai_generation_runs.update_one(
                doc! { "id": &child.run_id, "status": "queued" },
                doc! { "$set": { "status": "failed", "error": message, "updatedAt": now(), "completedAt": now() } },
            ).await?;
        } else {
            execution_error = execute_ai_generation(
                state.clone(),
                client.clone(),
                child.run_id.clone(),
                child.setup_snapshot.clone(),
                job.owner_email.clone(),
                job.candidates_per_item,
                Some((&job.id, token)),
            )
            .await
            .err();
        }
    }
    let completed = state
        .workbench_database
        .ai_generation_runs
        .find_one(doc! { "id": &child.run_id })
        .await?
        .ok_or_else(|| conflict("The AI generation result is unavailable"))?;
    if let Some(error) = execution_error {
        if !matches!(
            completed.status.as_str(),
            "completed" | "partial" | "failed"
        ) {
            return Err(error);
        }
        // A later audit write can fail after the generation result is durable.
        // Preserve that result instead of falsely reporting its candidates as failed.
        tracing::error!(run_id = %child.run_id, error = %error, "AI result saved but completion bookkeeping failed");
    }
    child.status = match completed.status.as_str() {
        "completed" => "completed",
        "partial" => "partial",
        _ => "failed",
    }
    .to_string();
    child.error = completed.error;
    Ok(())
}

async fn write_batch_audit(
    state: &ServerState,
    job: &BatchGenerationJob,
    child: &BatchChild,
) -> Result<(), Error> {
    let audit = LanguageItemAuditEvent {
        id: format!("{}-item-{}", job.id, child.index),
        item_id: child.item_id.clone(),
        version_id: None,
        action: "batch.item.prepared".to_string(),
        actor_email: job.owner_email.clone(),
        details: json!({ "batchId": job.id, "groupIndex": child.group_index, "runId": child.run_id,
            "registryVersion": job.registry_version, "informationPointsSource": "pinned-task-guidance",
            "requiresAuthorReview": true }),
        created_at: now(),
    };
    state
        .workbench_database
        .audit_events
        .update_one(
            doc! { "id": &audit.id },
            doc! { "$setOnInsert": serialize_to_document(&audit)? },
        )
        .upsert(true)
        .await?;
    Ok(())
}
