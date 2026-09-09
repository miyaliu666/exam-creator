use std::collections::HashSet;

use http::StatusCode;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{errors::Error, routes::language_items::draft_for_capability};

use super::{
    domain::{InformationPoint, TaskPackage},
    registry::{RegistrySnapshot, capability_for},
    validation::validate_generation_setup,
};

pub const MAX_BATCH_ITEMS: usize = 50;
pub const MAX_BATCH_GROUPS: usize = 20;

fn default_candidates() -> u64 {
    1
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BatchGroup {
    pub blueprint_slot_id: String,
    pub item_format_id: String,
    pub primary_can_do_id: String,
    pub primary_domain: String,
    pub context_id: String,
    pub difficulty_band: String,
    pub item_count: u8,
    #[serde(default)]
    pub required_target_content_ids: Vec<String>,
    #[serde(default)]
    pub rotating_target_content_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateBatchBody {
    pub title: String,
    pub idempotency_key: String,
    pub registry_version: Option<String>,
    pub groups: Vec<BatchGroup>,
    #[serde(default = "default_candidates")]
    pub candidates_per_item: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchChild {
    pub index: usize,
    pub group_index: usize,
    pub item_id: String,
    pub run_id: String,
    pub target_content_ids: Vec<String>,
    pub status: String,
    pub item_created: bool,
    pub error: Option<String>,
    // Persist the actual brief so a restart or later software update cannot reinterpret it.
    pub setup_snapshot: TaskPackage,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchGenerationJob {
    pub id: String,
    pub title: String,
    pub owner_email: String,
    pub idempotency_key: String,
    pub request_fingerprint: String,
    pub registry_version: String,
    pub groups: Vec<BatchGroup>,
    pub candidates_per_item: u64,
    pub status: String,
    pub children: Vec<BatchChild>,
    pub error: Option<String>,
    pub worker_token: Option<String>,
    pub lease_expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchChildView {
    pub index: usize,
    pub group_index: usize,
    pub item_id: String,
    pub run_id: String,
    pub target_content_ids: Vec<String>,
    pub status: String,
    pub item_created: bool,
    pub error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchGenerationView {
    pub id: String,
    pub title: String,
    pub owner_email: String,
    pub idempotency_key: String,
    pub registry_version: String,
    pub groups: Vec<BatchGroup>,
    pub candidates_per_item: u64,
    pub status: String,
    pub children: Vec<BatchChildView>,
    pub error: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<BatchGenerationJob> for BatchGenerationView {
    fn from(job: BatchGenerationJob) -> Self {
        Self {
            id: job.id,
            title: job.title,
            owner_email: job.owner_email,
            idempotency_key: job.idempotency_key,
            registry_version: job.registry_version,
            groups: job.groups,
            candidates_per_item: job.candidates_per_item,
            status: job.status,
            children: job
                .children
                .into_iter()
                .map(|child| BatchChildView {
                    index: child.index,
                    group_index: child.group_index,
                    item_id: child.item_id,
                    run_id: child.run_id,
                    target_content_ids: child.target_content_ids,
                    status: child.status,
                    item_created: child.item_created,
                    error: child.error,
                })
                .collect(),
            error: job.error,
            created_at: job.created_at,
            updated_at: job.updated_at,
        }
    }
}

pub fn now() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn invalid(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message.into())
}

pub fn batch_identity(owner: &str, key: &str) -> String {
    let value = serde_json::to_vec(&(owner, key)).expect("strings serialize");
    format!("BATCH-{:x}", Sha256::digest(value))
}

pub fn request_fingerprint(body: &CreateBatchBody) -> String {
    let value = serde_json::to_vec(body).expect("batch request serializes");
    format!("{:x}", Sha256::digest(value))
}

pub fn validate_request(body: &CreateBatchBody) -> Result<(), Error> {
    if body.title.trim().is_empty() || body.title.chars().count() > 160 {
        return Err(invalid("Enter a batch title of 1–160 characters"));
    }
    if body.idempotency_key.trim().is_empty()
        || body.idempotency_key.chars().count() > 128
        || body.idempotency_key != body.idempotency_key.trim()
    {
        return Err(invalid(
            "A batch idempotency key of 1–128 characters is required",
        ));
    }
    super::ai::validate_candidate_count(body.candidates_per_item).map_err(invalid)?;
    if body.groups.is_empty() || body.groups.len() > MAX_BATCH_GROUPS {
        return Err(invalid("A batch must contain 1–20 task groups"));
    }
    let total: usize = body
        .groups
        .iter()
        .map(|group| usize::from(group.item_count))
        .sum();
    if total > MAX_BATCH_ITEMS || body.groups.iter().any(|group| group.item_count == 0) {
        return Err(invalid(
            "Each group needs at least one item; a batch supports at most 50 items",
        ));
    }
    for (index, group) in body.groups.iter().enumerate() {
        if [
            &group.blueprint_slot_id,
            &group.item_format_id,
            &group.primary_can_do_id,
            &group.primary_domain,
            &group.context_id,
            &group.difficulty_band,
        ]
        .iter()
        .any(|value| value.trim().is_empty())
        {
            return Err(invalid(format!(
                "Group {} must select all six setup criteria",
                index + 1
            )));
        }
        if group.required_target_content_ids.is_empty()
            && group.rotating_target_content_ids.is_empty()
        {
            return Err(invalid(format!(
                "Group {} needs at least one language target",
                index + 1
            )));
        }
        for targets in [
            &group.required_target_content_ids,
            &group.rotating_target_content_ids,
        ] {
            if targets.len() > 100
                || targets.iter().any(|id| id.trim().is_empty())
                || targets.iter().collect::<HashSet<_>>().len() != targets.len()
            {
                return Err(invalid(format!(
                    "Group {} has duplicate, empty, or excessive language targets",
                    index + 1
                )));
            }
        }
    }
    Ok(())
}

/// Every required target is retained, and every pool target occurs in at least one brief.
/// Pool distribution is a coverage allocation, never a claim that a combination is natural.
pub fn allocate_targets(group: &BatchGroup, ordinal: usize) -> Vec<String> {
    let mut targets = group.required_target_content_ids.clone();
    let pool = &group.rotating_target_content_ids;
    if !pool.is_empty() {
        let assigned: Vec<_> = pool
            .iter()
            .enumerate()
            .filter(|(index, _)| index % usize::from(group.item_count) == ordinal)
            .map(|(_, id)| id)
            .collect();
        if assigned.is_empty() {
            targets.push(pool[ordinal % pool.len()].clone());
        } else {
            targets.extend(assigned.into_iter().cloned());
        }
    }
    let mut seen = HashSet::new();
    targets.retain(|target| seen.insert(target.clone()));
    targets
}

fn information_point_guidance(
    context: &str,
    evidence: &str,
    item_ordinal: usize,
    point: usize,
) -> String {
    // Guidance follows the pinned Can-do rather than a hardcoded interpretation of a slot.
    // It proposes variation; only review can establish that generated items are distinct.
    let variation = [
        "选择一个具体、熟悉的日常微情境",
        "在相同情境范围内改变交际安排，保持原有交际目的",
        "在适用时变化人物、时间、地点或数量，保持相同信息负荷",
        "在适用时变化信息呈现顺序，保持信息直接、明确",
    ][item_ordinal % 4];
    format!(
        "{context}：{evidence}。为第{}道独立题准备第{}个可直接观察的信息点；{variation}。所有变化须服从已选 Can-do、Context、语言目标和难度。",
        item_ordinal + 1,
        point + 1,
    )
}

pub fn prepare_job(
    body: CreateBatchBody,
    owner: &str,
    registry: &RegistrySnapshot,
) -> Result<BatchGenerationJob, Error> {
    validate_request(&body)?;
    if body
        .registry_version
        .as_ref()
        .is_some_and(|version| version != &registry.bundle_version)
    {
        return Err(Error::Server(
            StatusCode::CONFLICT,
            "Assessment Settings changed; review the task groups before creating this batch"
                .to_string(),
        ));
    }
    let id = batch_identity(owner, &body.idempotency_key);
    let fingerprint = request_fingerprint(&body);
    let mut children = Vec::new();
    for (group_index, group) in body.groups.iter().enumerate() {
        let capability = capability_for(
            registry,
            &group.blueprint_slot_id,
            &group.item_format_id,
            Some(&group.primary_can_do_id),
        )
        .ok_or_else(|| {
            invalid(format!(
                "Group {} has an unavailable task configuration",
                group_index + 1
            ))
        })?;
        let context = registry
            .context_options
            .iter()
            .find(|entry| entry.id == group.context_id)
            .ok_or_else(|| {
                invalid(format!(
                    "Group {} has an unavailable Context",
                    group_index + 1
                ))
            })?;
        for ordinal in 0..usize::from(group.item_count) {
            let index = children.len();
            let item_id = format!("LI-{}-{}", &id[6..], index + 1);
            let mut draft = draft_for_capability(
                item_id.clone(),
                capability,
                registry,
                Some(&group.primary_domain),
                Some(&group.context_id),
                Some(&group.difficulty_band),
            )?;
            draft.spec_versions.registry_bundle_version = registry.bundle_version.clone();
            draft.content.target_content_ids = allocate_targets(group, ordinal);
            let expected = draft
                .content
                .difficulty
                .as_ref()
                .map(|profile| usize::from(profile.drivers.information_points))
                .unwrap_or(1);
            let evidence = if capability.observable_evidence.trim().is_empty() {
                &capability.task_family_core_behavior
            } else {
                &capability.observable_evidence
            };
            if evidence.trim().is_empty() {
                return Err(invalid(
                    "This task configuration needs observable Can-do evidence before its brief can be prepared",
                ));
            }
            draft.content.required_information_points = (0..expected)
                .map(|point| {
                    InformationPoint::new(
                        point,
                        information_point_guidance(&context.label, evidence, index, point),
                    )
                })
                .collect();
            let validation = validate_generation_setup(&draft);
            if !validation.valid {
                let messages: Vec<_> = validation
                    .issues
                    .iter()
                    .filter(|issue| issue.severity == "error")
                    .map(|issue| issue.message.as_str())
                    .collect();
                return Err(invalid(format!(
                    "Group {} cannot generate: {}",
                    group_index + 1,
                    messages.join("; ")
                )));
            }
            children.push(BatchChild {
                index,
                group_index,
                item_id,
                run_id: format!("AIR-{}-{}", &id[6..], index + 1),
                target_content_ids: draft.content.target_content_ids.clone(),
                status: "pending".to_string(),
                item_created: false,
                error: None,
                setup_snapshot: draft,
            });
        }
    }
    let timestamp = now();
    Ok(BatchGenerationJob {
        id,
        title: body.title.trim().to_string(),
        owner_email: owner.to_string(),
        idempotency_key: body.idempotency_key,
        request_fingerprint: fingerprint,
        registry_version: registry.bundle_version.clone(),
        groups: body.groups,
        candidates_per_item: body.candidates_per_item,
        status: "queued".to_string(),
        children,
        error: None,
        worker_token: None,
        lease_expires_at: None,
        created_at: timestamp.clone(),
        updated_at: timestamp,
    })
}

pub fn terminal_status(children: &[BatchChild]) -> Option<&'static str> {
    if children
        .iter()
        .any(|child| matches!(child.status.as_str(), "pending" | "running"))
    {
        None
    } else if children.iter().all(|child| child.status == "completed") {
        Some("completed")
    } else {
        Some("partial")
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum UncreatedChildRecovery {
    None,
    RetryCreation,
    OpenExistingItem,
}

pub fn uncreated_child_recovery(
    child: &BatchChild,
    item_exists: bool,
    run_exists: bool,
) -> UncreatedChildRecovery {
    if child.status != "failed" || child.item_created {
        UncreatedChildRecovery::None
    } else if item_exists {
        UncreatedChildRecovery::OpenExistingItem
    } else if !run_exists {
        UncreatedChildRecovery::RetryCreation
    } else {
        // A missing item does not prove that its provider request was never sent.
        UncreatedChildRecovery::None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn group() -> BatchGroup {
        BatchGroup {
            blueprint_slot_id: "R-A1-1".into(),
            item_format_id: "IF-SINGLE-SELECT".into(),
            primary_can_do_id: "test".into(),
            primary_domain: "Public".into(),
            context_id: "test".into(),
            difficulty_band: "TypicalA1".into(),
            item_count: 2,
            required_target_content_ids: vec!["required".into()],
            rotating_target_content_ids: vec![
                "a".into(),
                "b".into(),
                "c".into(),
                "d".into(),
                "e".into(),
            ],
        }
    }

    fn request() -> CreateBatchBody {
        CreateBatchBody {
            title: "Coverage plan".into(),
            idempotency_key: "request-1".into(),
            registry_version: None,
            groups: vec![group()],
            candidates_per_item: 1,
        }
    }

    #[test]
    fn last_running_child_finishes_a_paused_batch_without_resume() {
        let mut child = BatchChild {
            index: 0,
            group_index: 0,
            item_id: "LI-paused-last-child".to_string(),
            run_id: "AIR-paused-last-child".to_string(),
            target_content_ids: vec![],
            status: "running".to_string(),
            item_created: true,
            error: None,
            setup_snapshot: TaskPackage::from_template(
                "LI-paused-last-child".to_string(),
                "reading-matching",
            )
            .unwrap(),
        };
        assert_eq!(terminal_status(std::slice::from_ref(&child)), None);
        child.status = "completed".to_string();
        assert_eq!(
            terminal_status(std::slice::from_ref(&child)),
            Some("completed")
        );
        child.status = "failed".to_string();
        assert_eq!(
            terminal_status(std::slice::from_ref(&child)),
            Some("partial")
        );
        let mut pending = child.clone();
        pending.status = "pending".to_string();
        assert_eq!(terminal_status(&[child, pending]), None);
    }

    #[test]
    fn explicit_resume_only_retries_uncreated_items_without_generation_history() {
        let mut child = BatchChild {
            index: 0,
            group_index: 0,
            item_id: "LI-interrupted-creation".into(),
            run_id: "AIR-interrupted-creation".into(),
            target_content_ids: vec![],
            status: "failed".into(),
            item_created: false,
            error: Some("Item creation interrupted".into()),
            setup_snapshot: TaskPackage::from_template(
                "LI-interrupted-creation".into(),
                "reading-matching",
            )
            .unwrap(),
        };
        assert_eq!(
            uncreated_child_recovery(&child, false, false),
            UncreatedChildRecovery::RetryCreation
        );
        assert_eq!(
            uncreated_child_recovery(&child, false, true),
            UncreatedChildRecovery::None,
            "An existing run may have incurred a provider call even if its item is missing"
        );
        for run_exists in [false, true] {
            assert_eq!(
                uncreated_child_recovery(&child, true, run_exists),
                UncreatedChildRecovery::OpenExistingItem,
                "An uncertain insert is recovered by exposing its existing draft, without replaying generation"
            );
        }
        child.item_created = true;
        assert_eq!(
            uncreated_child_recovery(&child, false, false),
            UncreatedChildRecovery::None
        );
        child.item_created = false;
        for status in ["pending", "running", "completed", "partial"] {
            child.status = status.into();
            assert_eq!(
                uncreated_child_recovery(&child, false, false),
                UncreatedChildRecovery::None
            );
        }
    }

    #[test]
    fn independent_item_identity_is_stable_and_owner_scoped() {
        assert_eq!(batch_identity("a", "b"), batch_identity("a", "b"));
        assert_ne!(batch_identity("a", "b"), batch_identity("another", "b"));
        assert_ne!(batch_identity("a:b", "c"), batch_identity("a", "b:c"));
        let mut changed = request();
        changed.groups[0].item_count += 1;
        assert_ne!(
            request_fingerprint(&request()),
            request_fingerprint(&changed)
        );
    }

    #[test]
    fn pool_is_covered_even_when_it_is_larger_than_the_item_count() {
        let group = group();
        let allocations: Vec<_> = (0..usize::from(group.item_count))
            .map(|index| allocate_targets(&group, index))
            .collect();
        assert!(
            allocations
                .iter()
                .all(|targets| targets.contains(&"required".to_string()))
        );
        let union: HashSet<_> = allocations.iter().flatten().collect();
        assert!(
            group
                .rotating_target_content_ids
                .iter()
                .all(|target| union.contains(target))
        );
        assert_eq!(allocations[0], vec!["required", "a", "c", "e"]);
        assert_eq!(allocations[1], vec!["required", "b", "d"]);
    }

    #[test]
    fn small_pool_rotates_without_duplicate_targets() {
        let mut group = group();
        group.item_count = 5;
        group.rotating_target_content_ids = vec!["required".into(), "b".into()];
        assert_eq!(allocate_targets(&group, 2), vec!["required"]);
        assert_eq!(allocate_targets(&group, 3), vec!["required", "b"]);
    }

    #[test]
    fn rejects_workload_and_missing_targets_before_creating_any_items() {
        let mut body = request();
        body.groups[0].item_count = 51;
        assert!(validate_request(&body).is_err());
        body.groups[0].item_count = 0;
        assert!(validate_request(&body).is_err());
        body.groups[0].item_count = 2;
        body.groups[0].required_target_content_ids.clear();
        body.groups[0].rotating_target_content_ids.clear();
        assert!(validate_request(&body).is_err());
        body = request();
        body.candidates_per_item = 0;
        assert!(validate_request(&body).is_err());
    }

    #[test]
    fn candidate_counts_above_the_old_limits_are_preserved() {
        for count in [4, 6, 256, 1_000] {
            let mut body = request();
            body.candidates_per_item = count;
            let serialized = serde_json::to_value(&body).unwrap();
            let decoded: CreateBatchBody = serde_json::from_value(serialized).unwrap();
            assert_eq!(decoded.candidates_per_item, count);
            assert!(validate_request(&decoded).is_ok());
            let bson = bson::serialize_to_document(&decoded).unwrap();
            let persisted: CreateBatchBody = bson::deserialize_from_document(bson).unwrap();
            assert_eq!(persisted.candidates_per_item, count);
        }
        let mut body = request();
        body.candidates_per_item = u64::MAX;
        assert!(validate_request(&body).is_err());
    }

    #[test]
    fn incompatible_targets_reject_the_entire_prepared_batch() {
        let registry = super::super::registry::snapshot();
        let capability = &registry.capabilities[0];
        let context = registry
            .context_options
            .iter()
            .find(|context| {
                capability.allowed_context_ids.contains(&context.id)
                    && super::super::registry::context_supports_capability(context, capability)
            })
            .unwrap();
        let mut body = request();
        body.groups[0] = BatchGroup {
            blueprint_slot_id: capability.blueprint_slot_id.clone(),
            item_format_id: capability.item_format_id.clone(),
            primary_can_do_id: capability.primary_can_do_id.clone(),
            primary_domain: context.primary_domains[0].clone(),
            context_id: context.id.clone(),
            difficulty_band: "TypicalA1".into(),
            item_count: 3,
            required_target_content_ids: vec!["does-not-exist".into()],
            rotating_target_content_ids: vec![],
        };
        assert!(prepare_job(body, "author@example.test", registry).is_err());
    }

    #[test]
    fn briefs_follow_current_can_do_and_are_distinct_beyond_the_variation_cycle() {
        let evidence = "理解通知中明确给出的开放时间";
        let first = information_point_guidance("公共服务", evidence, 0, 0);
        let fifth = information_point_guidance("公共服务", evidence, 4, 0);
        assert!(first.contains(evidence));
        assert!(fifth.contains(evidence));
        assert_ne!(first, fifth);
        assert_ne!(
            first,
            information_point_guidance("公共服务", evidence, 0, 1)
        );
    }

    #[test]
    fn batch_preparation_supports_every_registered_format_and_difficulty_band() {
        let registry = super::super::registry::snapshot();
        let mut formats = HashSet::new();
        let mut skills = HashSet::new();
        for capability in &registry.capabilities {
            let context = registry
                .context_options
                .iter()
                .find(|context| {
                    capability.allowed_context_ids.contains(&context.id)
                        && super::super::registry::context_supports_capability(context, capability)
                        && context
                            .primary_domains
                            .iter()
                            .any(|domain| capability.allowed_domains.contains(domain))
                })
                .expect("registered capability has a compatible Context");
            let domain = context
                .primary_domains
                .iter()
                .find(|domain| capability.allowed_domains.contains(domain))
                .unwrap();
            let target = registry
                .content_id_options
                .iter()
                .find(|target| {
                    target.kind != "supported"
                        && (target.context_ids.is_empty()
                            || target.context_ids.contains(&context.id))
                        && (target.can_do_ids.is_empty()
                            || target.can_do_ids.contains(&capability.primary_can_do_id)
                            || target
                                .can_do_ids
                                .iter()
                                .any(|id| capability.supporting_can_do_ids.contains(id)))
                        && match target.mastery_scope.as_deref() {
                            None | Some("receptiveProductive") => true,
                            Some("receptive") => matches!(
                                capability.primary_reported_skill.as_str(),
                                "Reading" | "Listening"
                            ),
                            Some("productive") => matches!(
                                capability.primary_reported_skill.as_str(),
                                "Writing" | "Speaking"
                            ),
                            _ => false,
                        }
                })
                .expect("registered capability has compatible language content");
            for band in ["LowerA1", "TypicalA1", "UpperA1"] {
                let mut body = request();
                body.registry_version = Some(registry.bundle_version.clone());
                body.groups[0] = BatchGroup {
                    blueprint_slot_id: capability.blueprint_slot_id.clone(),
                    item_format_id: capability.item_format_id.clone(),
                    primary_can_do_id: capability.primary_can_do_id.clone(),
                    primary_domain: domain.clone(),
                    context_id: context.id.clone(),
                    difficulty_band: band.to_string(),
                    item_count: 2,
                    required_target_content_ids: vec![target.id.clone()],
                    rotating_target_content_ids: vec![],
                };
                let first = prepare_job(body.clone(), "author@example.test", registry)
                    .expect("all registered authoring formats support batch preparation");
                let repeated = prepare_job(body, "author@example.test", registry).unwrap();
                assert_eq!(first.children.len(), 2);
                assert_eq!(first.children[0].item_id, repeated.children[0].item_id);
                assert_eq!(first.children[0].run_id, repeated.children[0].run_id);
                assert_ne!(first.children[0].item_id, first.children[1].item_id);
                assert_ne!(first.children[0].run_id, first.children[1].run_id);
                for child in &first.children {
                    assert!(validate_generation_setup(&child.setup_snapshot).valid);
                    assert_eq!(
                        child.setup_snapshot.spec_versions.registry_bundle_version,
                        registry.bundle_version
                    );
                    assert_eq!(child.setup_snapshot.content.difficulty_band, band);
                    assert_eq!(
                        child.setup_snapshot.content.target_content_ids,
                        vec![target.id.clone()]
                    );
                    assert_eq!(child.status, "pending");
                    assert!(!child.item_created);
                }
                assert_ne!(
                    first.children[0]
                        .setup_snapshot
                        .content
                        .required_information_points[0]
                        .label,
                    first.children[1]
                        .setup_snapshot
                        .content
                        .required_information_points[0]
                        .label
                );
            }
            formats.insert(capability.item_format_id.clone());
            skills.insert(capability.primary_reported_skill.clone());
        }
        assert_eq!(formats.len(), 7);
        assert_eq!(skills.len(), 4);
    }
}
