use bson::{Document, doc};
use mongodb::{Collection, IndexModel, options::IndexOptions};

use crate::language_items::domain::{
    AiGenerationRun, AiReviewRun, GithubSyncDelivery, LanguageItem, LanguageItemAuditEvent,
    LanguageItemExport, LanguageItemReview, LanguageItemReviewDiscussion,
    LanguageItemReviewDiscussionEvent, LanguageItemVersion, StagingLanguageItem,
};
use crate::language_items::registry_store::{RegistryAuditEvent, RegistryVersionRecord};
use crate::state::{Activity, ServerState, User};

pub mod prisma;

#[derive(Clone, Debug)]
pub struct Database {
    pub user: Collection<Document>,
    pub exam_creator_exam: Collection<prisma::ExamCreatorExam>,
    pub exam: Collection<prisma::ExamEnvironmentExam>,
    pub exam_environment_challenge: Collection<prisma::ExamEnvironmentChallenge>,
    pub exam_attempt: Collection<prisma::ExamEnvironmentExamAttempt>,
    pub generated_exam: Collection<prisma::ExamEnvironmentGeneratedExam>,
    pub exam_creator_user: Collection<prisma::ExamCreatorUser>,
    pub exam_creator_session: Collection<prisma::ExamCreatorSession>,
    pub exam_environment_exam_moderation: Collection<prisma::ExamEnvironmentExamModeration>,
}

#[derive(Clone, Debug)]
pub struct WorkbenchDatabase {
    pub batch_generation_jobs: Collection<crate::language_items::batch::BatchGenerationJob>,
    pub item_evidence: Collection<crate::language_items::evidence::ItemEvidence>,
    pub version_usage_events: Collection<crate::language_items::version_usage::UsageEvent>,
    pub registry_versions: Collection<RegistryVersionRecord>,
    pub registry_audit_events: Collection<RegistryAuditEvent>,
    pub language_items: Collection<LanguageItem>,
    pub versions: Collection<LanguageItemVersion>,
    pub ai_generation_runs: Collection<AiGenerationRun>,
    pub ai_review_runs: Collection<AiReviewRun>,
    pub reviews: Collection<LanguageItemReview>,
    pub review_discussions: Collection<LanguageItemReviewDiscussion>,
    pub review_discussion_events: Collection<LanguageItemReviewDiscussionEvent>,
    pub exports: Collection<LanguageItemExport>,
    pub audit_events: Collection<LanguageItemAuditEvent>,
    pub github_sync_deliveries: Collection<GithubSyncDelivery>,
    pub staging_items: Collection<StagingLanguageItem>,
}

impl WorkbenchDatabase {
    pub async fn ensure_indexes(&self) -> Result<(), mongodb::error::Error> {
        let unique = |name: &str| {
            IndexOptions::builder()
                .name(name.to_string())
                .unique(true)
                .build()
        };
        self.version_usage_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_usage_id_unique"))
                    .build(),
            )
            .await?;
        self.version_usage_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "versionId": 1, "revision": 1 })
                    .options(unique("language_item_usage_revision_unique"))
                    .build(),
            )
            .await?;
        self.version_usage_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "versionId": 1, "requestId": 1 })
                    .options(unique("language_item_usage_request_unique"))
                    .build(),
            )
            .await?;
        self.version_usage_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "versionId": 1, "revision": -1 })
                    .build(),
            )
            .await?;
        self.registry_versions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_assessment_registry_ids_unique"))
                    .build(),
            )
            .await?;
        self.batch_generation_jobs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_batch_id_unique"))
                    .build(),
            )
            .await?;
        self.batch_generation_jobs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "ownerEmail": 1, "idempotencyKey": 1 })
                    .options(unique("language_item_batch_request_unique"))
                    .build(),
            )
            .await?;
        self.batch_generation_jobs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "ownerEmail": 1, "createdAt": -1 })
                    .build(),
            )
            .await?;
        self.batch_generation_jobs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "status": 1, "leaseExpiresAt": 1 })
                    .build(),
            )
            .await?;
        self.item_evidence
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_evidence_id_unique"))
                    .build(),
            )
            .await?;
        self.item_evidence
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "createdAt": -1 })
                    .build(),
            )
            .await?;
        self.item_evidence
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "contentHash": 1, "createdAt": -1 })
                    .build(),
            )
            .await?;
        self.registry_versions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "version": 1 })
                    .options(unique("language_assessment_registry_versions_unique"))
                    .build(),
            )
            .await?;
        self.registry_audit_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_assessment_registry_audit_ids_unique"))
                    .build(),
            )
            .await?;
        self.language_items
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_items_id_unique"))
                    .build(),
            )
            .await?;
        self.github_sync_deliveries
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_github_sync_delivery_ids_unique"))
                    .build(),
            )
            .await?;
        self.github_sync_deliveries
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "status": 1, "updatedAt": 1 })
                    .build(),
            )
            .await?;
        self.versions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_versions_id_unique"))
                    .build(),
            )
            .await?;
        self.versions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "versionNumber": 1 })
                    .options(unique("language_item_versions_number_unique"))
                    .build(),
            )
            .await?;
        self.ai_generation_runs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_ai_runs_id_unique"))
                    .build(),
            )
            .await?;
        self.ai_generation_runs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "createdBy": 1, "idempotencyKey": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_ai_runs_idempotency_unique".to_string())
                            .unique(true)
                            .partial_filter_expression(
                                doc! { "idempotencyKey": { "$type": "string" } },
                            )
                            .build(),
                    )
                    .build(),
            )
            .await?;
        self.ai_review_runs
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_ai_review_runs_id_unique"))
                    .build(),
            )
            .await?;
        self.reviews
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_reviews_id_unique"))
                    .build(),
            )
            .await?;
        self.review_discussions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_review_discussions_id_unique"))
                    .build(),
            )
            .await?;
        self.review_discussions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "createdAt": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_review_discussions_item_time".to_string())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        self.review_discussions
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "versionId": 1, "kind": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_review_discussions_version_kind".to_string())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        self.review_discussion_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_review_discussion_events_id_unique"))
                    .build(),
            )
            .await?;
        self.review_discussion_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "discussionId": 1, "createdAt": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_review_discussion_events_thread_time".to_string())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        self.reviews
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "versionId": 1, "createdAt": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_reviews_version_time".to_string())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        self.exports
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_exports_id_unique"))
                    .build(),
            )
            .await?;
        self.staging_items
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_staging_id_unique"))
                    .build(),
            )
            .await?;
        self.audit_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "id": 1 })
                    .options(unique("language_item_audit_id_unique"))
                    .build(),
            )
            .await?;
        self.audit_events
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "itemId": 1, "createdAt": 1 })
                    .options(
                        IndexOptions::builder()
                            .name("language_item_audit_item_time".to_string())
                            .build(),
                    )
                    .build(),
            )
            .await?;
        Ok(())
    }
}

impl prisma::ExamCreatorUser {
    pub fn to_session(&self, users: &Vec<User>) -> User {
        if let Some(user) = users.iter().find(|u| u.email == self.email) {
            user.to_owned()
        } else {
            User {
                name: self.name.clone(),
                email: self.email.clone(),
                picture: self.picture.clone().unwrap_or_default(),
                activity: Activity {
                    page: "/".to_string(),
                    last_active: chrono::Utc::now().timestamp_millis() as usize,
                },
                settings: self.settings.clone(),
            }
        }
    }
}

pub fn database_environment<'a>(
    state: &'a ServerState,
    user: &prisma::ExamCreatorUser,
) -> &'a Database {
    match user.settings.database_environment {
        prisma::ExamCreatorDatabaseEnvironment::Staging => &state.staging_database,
        prisma::ExamCreatorDatabaseEnvironment::Production => &state.production_database,
    }
}
