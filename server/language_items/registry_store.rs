use std::collections::{HashMap, HashSet};

use chrono::Utc;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{database::WorkbenchDatabase, errors::Error};

use super::registry::{
    DifficultyBandStandard, RegistrySnapshot, context_supports_capability,
    hydrate_published_registry_snapshot, install_published_snapshot, snapshot,
};

pub const REGISTRY_STATUS_DRAFT: &str = "draft";
pub const REGISTRY_STATUS_PUBLISHED: &str = "published";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryVersionRecord {
    pub id: String,
    pub version: String,
    pub status: String,
    pub active: bool,
    pub revision: u64,
    pub base_version: Option<String>,
    pub snapshot: RegistrySnapshot,
    pub created_by: String,
    pub updated_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub published_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryAuditEvent {
    pub id: String,
    pub registry_version_id: String,
    pub action: String,
    pub actor_email: String,
    pub revision: u64,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryValidationIssue {
    pub severity: String,
    pub code: String,
    pub path: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryValidationResult {
    pub valid: bool,
    pub issues: Vec<RegistryValidationIssue>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryImpact {
    pub active_version: String,
    pub draft_version: String,
    pub items_pinned_to_active_version: u64,
    pub capability_changes: usize,
    pub can_do_changes: usize,
    pub context_changes: usize,
    pub scoring_contract_changes: usize,
    pub difficulty_standard_changes: usize,
    pub difficulty_configuration_changes: Vec<String>,
    pub draft_revision: u64,
    pub base_version: Option<String>,
    pub stale_base: bool,
    pub additional_changes: Vec<RegistrySectionChange>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySectionChange {
    pub label: String,
    pub count: usize,
}

fn now() -> String {
    Utc::now().to_rfc3339()
}

fn issue(
    issues: &mut Vec<RegistryValidationIssue>,
    code: &str,
    path: impl Into<String>,
    message: impl Into<String>,
) {
    issues.push(RegistryValidationIssue {
        severity: "error".to_string(),
        code: code.to_string(),
        path: path.into(),
        message: message.into(),
    });
}

fn validate_difficulty_standard(
    standard: &DifficultyBandStandard,
    path: &str,
    issues: &mut Vec<RegistryValidationIssue>,
) {
    if standard.label.trim().is_empty() {
        issue(
            issues,
            "registry.difficultyLabelRequired",
            format!("{path}.label"),
            "Difficulty level requires a display name",
        );
    }
    for (values, allowed, field) in [
        (
            &standard.allowed_input_lengths,
            &["wordOrPhrase", "shortSentence", "twoRelatedPhrases"][..],
            "allowedInputLengths",
        ),
        (
            &standard.allowed_support_levels,
            &["high", "moderate", "limited"][..],
            "allowedSupportLevels",
        ),
        (
            &standard.allowed_distractor_similarities,
            &["clear", "moderate", "close", "notApplicable"][..],
            "allowedDistractorSimilarities",
        ),
    ] {
        if values.is_empty()
            || values
                .iter()
                .any(|value| !allowed.contains(&value.as_str()))
        {
            issue(
                issues,
                "registry.invalidDifficultyDriver",
                format!("{path}.{field}"),
                "Choose at least one supported difficulty setting",
            );
        }
    }
    if !["highlySupported", "partlySupported", "independent"]
        .contains(&standard.default_drivers.independence_level.as_str())
    {
        issue(
            issues,
            "registry.invalidIndependenceLevel",
            format!("{path}.defaultDrivers.independenceLevel"),
            "Choose a supported independence level",
        );
    }
    if standard.information_points_min == 0
        || standard.information_points_min > standard.information_points_max
    {
        issue(
            issues,
            "registry.invalidDifficultyRange",
            path,
            "Difficulty information-point range is invalid",
        );
    }
    if standard.default_drivers.inference_required {
        issue(
            issues,
            "registry.a1InferenceBoundary",
            format!("{path}.defaultDrivers.inferenceRequired"),
            "A1 tasks must use explicit information without requiring complex inference",
        );
    }
    if standard.default_drivers.information_points < standard.information_points_min
        || standard.default_drivers.information_points > standard.information_points_max
    {
        issue(
            issues,
            "registry.difficultyDefaultRange",
            format!("{path}.defaultDrivers.informationPoints"),
            "Default information points must be within the published range",
        );
    }
    if !standard
        .allowed_input_lengths
        .contains(&standard.default_drivers.input_length)
    {
        issue(
            issues,
            "registry.difficultyDefaultInputLength",
            format!("{path}.defaultDrivers.inputLength"),
            "Default input length must be one of the allowed input lengths",
        );
    }
    if !standard
        .allowed_support_levels
        .contains(&standard.default_drivers.support_level)
    {
        issue(
            issues,
            "registry.difficultyDefaultSupport",
            format!("{path}.defaultDrivers.supportLevel"),
            "Default support level must be one of the allowed support levels",
        );
    }
    if !standard
        .allowed_distractor_similarities
        .contains(&standard.default_drivers.distractor_similarity)
    {
        issue(
            issues,
            "registry.difficultyDefaultDistractors",
            format!("{path}.defaultDrivers.distractorSimilarity"),
            "Default distractor similarity must be one of the allowed values",
        );
    }
}

fn check_unique<'a>(
    values: impl IntoIterator<Item = &'a str>,
    path: &str,
    label: &str,
    issues: &mut Vec<RegistryValidationIssue>,
) {
    let mut seen = HashSet::new();
    for (index, value) in values.into_iter().enumerate() {
        if value.trim().is_empty() {
            issue(
                issues,
                "registry.requiredId",
                format!("{path}.{index}"),
                format!("{label} ID cannot be empty"),
            );
        } else if !seen.insert(value) {
            issue(
                issues,
                "registry.duplicateId",
                format!("{path}.{index}"),
                format!("Duplicate {label} ID: {value}"),
            );
        }
    }
}

fn check_display_names<'a>(
    values: impl IntoIterator<Item = &'a str>,
    path: &str,
    label: &str,
    issues: &mut Vec<RegistryValidationIssue>,
) {
    let mut seen = HashSet::new();
    for (index, value) in values.into_iter().enumerate() {
        let normalized = value
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
            .to_lowercase();
        if normalized.is_empty() {
            issue(
                issues,
                "registry.displayNameRequired",
                format!("{path}.{index}.label"),
                format!("{label} requires a display name"),
            );
        } else if !seen.insert(normalized) {
            issue(
                issues,
                "registry.duplicateDisplayName",
                format!("{path}.{index}.label"),
                format!("{label} name “{}” is already used", value.trim()),
            );
        }
    }
}

pub fn validate_registry(snapshot: &RegistrySnapshot) -> RegistryValidationResult {
    let mut issues = Vec::new();
    if snapshot.bundle_version.trim().is_empty() {
        issue(
            &mut issues,
            "registry.versionRequired",
            "bundleVersion",
            "Registry version is required",
        );
    }
    for (is_empty, path, label) in [
        (
            snapshot.capabilities.is_empty(),
            "capabilities",
            "Blueprint capabilities",
        ),
        (
            snapshot.can_do_options.is_empty(),
            "canDoOptions",
            "Can-do rules",
        ),
        (
            snapshot.context_options.is_empty(),
            "contextOptions",
            "Domain and Context rules",
        ),
        (
            snapshot.difficulty_standards.is_empty(),
            "difficultyStandards",
            "Difficulty standards",
        ),
        (
            snapshot.content_id_options.is_empty(),
            "contentIdOptions",
            "Language content rules",
        ),
        (
            snapshot.scoring_contracts.is_empty(),
            "scoringContracts",
            "Scoring contracts",
        ),
        (
            snapshot.required_review_gate_ids.is_empty(),
            "requiredReviewGateIds",
            "Review gates",
        ),
    ] {
        if is_empty {
            issue(
                &mut issues,
                "registry.requiredSection",
                path,
                format!("{label} cannot be empty"),
            );
        }
    }

    check_unique(
        snapshot
            .can_do_options
            .iter()
            .map(|entry| entry.id.as_str()),
        "canDoOptions",
        "Can-do",
        &mut issues,
    );
    check_unique(
        snapshot.allowed_domains.iter().map(String::as_str),
        "allowedDomains",
        "Domain",
        &mut issues,
    );
    check_unique(
        snapshot.difficulty_bands.iter().map(String::as_str),
        "difficultyBands",
        "Difficulty band",
        &mut issues,
    );
    check_unique(
        snapshot
            .content_id_options
            .iter()
            .map(|entry| entry.id.as_str()),
        "contentIdOptions",
        "Language content",
        &mut issues,
    );
    check_unique(
        snapshot.required_review_gate_ids.iter().map(String::as_str),
        "requiredReviewGateIds",
        "Review gate",
        &mut issues,
    );
    check_unique(
        snapshot
            .context_options
            .iter()
            .map(|entry| entry.id.as_str()),
        "contextOptions",
        "Context",
        &mut issues,
    );
    check_unique(
        snapshot
            .difficulty_standards
            .iter()
            .map(|entry| entry.id.as_str()),
        "difficultyStandards",
        "Difficulty standard",
        &mut issues,
    );
    check_unique(
        snapshot
            .scoring_contracts
            .iter()
            .map(|entry| entry.scoring_contract_template_id.as_str()),
        "scoringContracts",
        "Scoring contract",
        &mut issues,
    );
    check_display_names(
        snapshot
            .context_options
            .iter()
            .map(|entry| entry.label.as_str()),
        "contextOptions",
        "Context",
        &mut issues,
    );
    check_display_names(
        snapshot
            .can_do_options
            .iter()
            .map(|entry| entry.label.as_str()),
        "canDoOptions",
        "Can-do",
        &mut issues,
    );
    for (index, can_do) in snapshot.can_do_options.iter().enumerate() {
        if !matches!(
            can_do.primary_skill.as_deref(),
            Some("Reading" | "Listening" | "Writing" | "Speaking")
        ) {
            issue(
                &mut issues,
                "registry.canDoSkillRequired",
                format!("canDoOptions.{index}.primarySkill"),
                format!("“{}” requires one primary skill", can_do.label),
            );
        }
        if !matches!(
            can_do.activity.as_deref(),
            Some("Reception" | "Production" | "Interaction" | "Mediation")
        ) {
            issue(
                &mut issues,
                "registry.canDoActivityRequired",
                format!("canDoOptions.{index}.activity"),
                format!("“{}” requires one communicative activity", can_do.label),
            );
        }
    }
    check_unique(
        snapshot.blueprint_slots.iter().map(|slot| slot.id.as_str()),
        "blueprintSlots",
        "Blueprint slot",
        &mut issues,
    );
    for (index, slot) in snapshot.blueprint_slots.iter().enumerate() {
        if slot.display_name.trim().is_empty() || slot.allowed_item_format_ids.is_empty() {
            issue(
                &mut issues,
                "registry.slotDetailsRequired",
                format!("blueprintSlots.{index}"),
                "Each blueprint slot requires a display name and at least one item format",
            );
        }
    }
    let mut scoring_policies = HashMap::new();
    for (index, contract) in snapshot.scoring_contracts.iter().enumerate() {
        for (field, policy) in [
            ("normalization", &contract.normalization),
            ("partialCredit", &contract.partial_credit),
            ("invalidResponse", &contract.invalid_response),
            ("technicalIncident", &contract.technical_incident),
            ("adjudication", &contract.adjudication),
            ("raterQualification", &contract.rater_qualification),
        ] {
            if policy.policy_id.trim().is_empty() || policy.summary.trim().is_empty() {
                issue(
                    &mut issues,
                    "registry.scoringPolicyRequired",
                    format!("scoringContracts.{index}.{field}"),
                    "Each scoring policy requires a reference and a readable rule",
                );
            }
            let content = format!("{policy:?}");
            if scoring_policies
                .insert(policy.policy_id.as_str(), content.clone())
                .is_some_and(|existing| existing != content)
            {
                issue(
                    &mut issues,
                    "registry.conflictingScoringPolicy",
                    format!("scoringContracts.{index}.{field}"),
                    format!(
                        "“{}” uses a shared scoring policy with different rules; update all contracts that share this policy together",
                        contract.display_name
                    ),
                );
            }
        }
    }

    let can_do_ids = snapshot
        .can_do_options
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<HashSet<_>>();
    let context_ids = snapshot
        .context_options
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<HashSet<_>>();
    let scoring_ids = snapshot
        .scoring_contracts
        .iter()
        .map(|entry| entry.scoring_contract_template_id.as_str())
        .collect::<HashSet<_>>();
    let difficulty_ids = snapshot
        .difficulty_standards
        .iter()
        .map(|entry| entry.id.as_str())
        .collect::<HashSet<_>>();
    let allowed_domains = snapshot
        .allowed_domains
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    let mut capability_keys = HashSet::new();

    for (index, context) in snapshot.context_options.iter().enumerate() {
        if context.label.trim().is_empty() {
            issue(
                &mut issues,
                "registry.contextLabelRequired",
                format!("contextOptions.{index}.label"),
                format!("Context {} requires a display name", context.id),
            );
        }
        if context.scope.trim().is_empty() {
            issue(
                &mut issues,
                "registry.contextScopeRequired",
                format!("contextOptions.{index}.scope"),
                format!("Context {} requires a scope and boundary", context.id),
            );
        }
        if context.primary_domains.len() != 1 {
            issue(
                &mut issues,
                "registry.contextDomainCount",
                format!("contextOptions.{index}.primaryDomains"),
                format!("Context {} must belong to exactly one Domain", context.id),
            );
        }
        if !context.retired && context.can_do_ids.is_empty() {
            issue(
                &mut issues,
                "registry.contextCanDoRequired",
                format!("contextOptions.{index}.canDoIds"),
                format!(
                    "Active Context {} must support at least one Can-do",
                    context.id
                ),
            );
        }
        if context
            .exclusions
            .iter()
            .any(|entry| entry.trim().is_empty())
        {
            issue(
                &mut issues,
                "registry.emptyContextExclusion",
                format!("contextOptions.{index}.exclusions"),
                format!("“{}” contains an empty exclusion", context.label),
            );
        }
        for domain in &context.primary_domains {
            if !allowed_domains.contains(domain.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownContextDomain",
                    format!("contextOptions.{index}.primaryDomains"),
                    format!("Context {} references unknown Domain: {domain}", context.id),
                );
            }
        }
        for can_do_id in &context.can_do_ids {
            if !can_do_ids.contains(can_do_id.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownContextCanDo",
                    format!("contextOptions.{index}.canDoIds"),
                    format!(
                        "Context {} references unknown Can-do: {can_do_id}",
                        context.id
                    ),
                );
            }
        }
    }

    for (index, capability) in snapshot.capabilities.iter().enumerate() {
        let path = format!("capabilities.{index}");
        let key = format!(
            "{}::{}::{}",
            capability.blueprint_slot_id, capability.item_format_id, capability.primary_can_do_id
        );
        if !capability_keys.insert(key.clone()) {
            issue(
                &mut issues,
                "registry.duplicateCapability",
                &path,
                format!(
                    "Duplicate Blueprint slot × Item format × Primary Can-do task configuration: {key}"
                ),
            );
        }
        if !snapshot.blueprint_slots.iter().any(|slot| {
            slot.id == capability.blueprint_slot_id
                && slot
                    .allowed_item_format_ids
                    .contains(&capability.item_format_id)
        }) {
            issue(
                &mut issues,
                "registry.slotFormatMismatch",
                format!("{path}.itemFormatId"),
                format!(
                    "“{}” does not allow the selected Item Format",
                    capability.title
                ),
            );
        }
        if !snapshot.task_family_options.iter().any(|family| {
            family.id == capability.task_family_id
                && family
                    .blueprint_slot_ids
                    .contains(&capability.blueprint_slot_id)
                && family
                    .allowed_item_format_ids
                    .contains(&capability.item_format_id)
        }) {
            issue(
                &mut issues,
                "registry.taskFamilyMismatch",
                format!("{path}.taskFamilyId"),
                format!(
                    "The task family selected for “{}” is not registered for this blueprint slot and item format",
                    capability.title
                ),
            );
        }
        if snapshot.capabilities.iter().any(|other| {
            other.blueprint_slot_id == capability.blueprint_slot_id
                && other.item_format_id == capability.item_format_id
                && (other.primary_reported_skill != capability.primary_reported_skill
                    || other.communicative_activity != capability.communicative_activity)
        }) {
            issue(
                &mut issues,
                "registry.slotConstructMismatch",
                format!("{path}.primaryCanDoId"),
                "Primary Can-do choices for the same blueprint slot and item format must retain the registered skill and activity",
            );
        }
        if capability.primary_reported_skill.trim().is_empty() {
            issue(
                &mut issues,
                "registry.primarySkillRequired",
                format!("{path}.primaryReportedSkill"),
                "A capability requires one locked primary reported Skill",
            );
        }
        if !can_do_ids.contains(capability.primary_can_do_id.as_str()) {
            issue(
                &mut issues,
                "registry.unknownCanDo",
                format!("{path}.primaryCanDoId"),
                format!("Unknown Can-do: {}", capability.primary_can_do_id),
            );
        } else if let Some(can_do) = snapshot
            .can_do_options
            .iter()
            .find(|can_do| can_do.id == capability.primary_can_do_id)
            && let Some(primary_skill) = &can_do.primary_skill
            && primary_skill != &capability.primary_reported_skill
        {
            issue(
                &mut issues,
                "registry.primarySkillMismatch",
                format!("{path}.primaryReportedSkill"),
                format!("Primary skill must be {primary_skill} for the selected Primary Can-do"),
            );
        }
        if let Some(activity) = snapshot
            .can_do_options
            .iter()
            .find(|can_do| can_do.id == capability.primary_can_do_id)
            .and_then(|can_do| can_do.activity.as_ref())
            && (capability.communicative_activity != *activity
                || !capability.communicative_activities.contains(activity))
        {
            issue(
                &mut issues,
                "registry.primaryActivityMismatch",
                format!("{path}.communicativeActivity"),
                format!(
                    "Communicative activity must be {activity} for the selected Primary Can-do"
                ),
            );
        }
        for can_do_id in &capability.supporting_can_do_ids {
            if can_do_id == &capability.primary_can_do_id {
                issue(
                    &mut issues,
                    "registry.primaryAlsoSupporting",
                    format!("{path}.supportingCanDoIds"),
                    "Primary Can-do cannot also be a supporting Can-do",
                );
            }
            if !can_do_ids.contains(can_do_id.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownSupportingCanDo",
                    format!("{path}.supportingCanDoIds"),
                    format!("Unknown supporting Can-do: {can_do_id}"),
                );
            }
        }
        let selectable_context_exists = snapshot.context_options.iter().any(|context| {
            context_supports_capability(context, capability)
                && context.primary_domains.len() == 1
                && capability.allowed_context_ids.contains(&context.id)
                && context.can_do_ids.contains(&capability.primary_can_do_id)
                && context
                    .primary_domains
                    .iter()
                    .any(|domain| capability.allowed_domains.contains(domain))
        });
        if !selectable_context_exists {
            issue(
                &mut issues,
                "registry.noSelectableContext",
                format!("{path}.allowedContextIds"),
                format!(
                    "“{}” requires an active Context supporting its Primary Can-do and allowed Domain",
                    capability.title
                ),
            );
        }
        if !scoring_ids.contains(capability.scoring_contract_template_id.as_str()) {
            issue(
                &mut issues,
                "registry.missingScoringContract",
                format!("{path}.scoringContractTemplateId"),
                format!(
                    "No scoring contract exists for {}",
                    capability.scoring_contract_template_id
                ),
            );
        } else if let Some(contract) = snapshot.scoring_contracts.iter().find(|contract| {
            contract.scoring_contract_template_id == capability.scoring_contract_template_id
        }) && (contract.blueprint_slot_id != capability.blueprint_slot_id
            || contract.item_format_id != capability.item_format_id)
        {
            issue(
                &mut issues,
                "registry.scoringContractMismatch",
                format!("{path}.scoringContractTemplateId"),
                format!(
                    "Scoring contract {} is registered for {} × {}, not {} × {}",
                    contract.scoring_contract_template_id,
                    contract.blueprint_slot_id,
                    contract.item_format_id,
                    capability.blueprint_slot_id,
                    capability.item_format_id
                ),
            );
        }
        for domain in &capability.allowed_domains {
            if !allowed_domains.contains(domain.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownDomain",
                    format!("{path}.allowedDomains"),
                    format!("Unknown domain: {domain}"),
                );
                continue;
            }
            let has_context = snapshot.context_options.iter().any(|context| {
                capability.allowed_context_ids.contains(&context.id)
                    && context_supports_capability(context, capability)
                    && context.primary_domains.len() == 1
                    && context.primary_domains.contains(domain)
            });
            if !has_context {
                issue(
                    &mut issues,
                    "registry.domainWithoutContext",
                    format!("{path}.allowedDomains"),
                    format!(
                        "{} allows {domain}, but no allowed Context belongs to that Domain",
                        capability.blueprint_slot_id
                    ),
                );
            }
        }
        for context_id in &capability.allowed_context_ids {
            let Some(context) = snapshot
                .context_options
                .iter()
                .find(|context| context.id == *context_id)
            else {
                issue(
                    &mut issues,
                    "registry.unknownContext",
                    format!("{path}.allowedContextIds"),
                    format!("Unknown Context: {context_id}"),
                );
                continue;
            };
            if context.retired {
                issue(
                    &mut issues,
                    "registry.retiredContext",
                    format!("{path}.allowedContextIds"),
                    format!("Capability references retired Context: {context_id}"),
                );
            }
            if !context.can_do_ids.contains(&capability.primary_can_do_id) {
                issue(
                    &mut issues,
                    "registry.contextCanDoMismatch",
                    format!("{path}.allowedContextIds"),
                    format!(
                        "“{}” does not support the Primary Can-do selected for “{}”; remove this Context or update its supported Can-do list",
                        context.label, capability.title
                    ),
                );
            }
            if context
                .primary_domains
                .iter()
                .any(|domain| !capability.allowed_domains.contains(domain))
            {
                issue(
                    &mut issues,
                    "registry.contextDomainMismatch",
                    format!("{path}.allowedDomains"),
                    format!(
                        "Allowed Domains must include the Domain of selected Context “{}”",
                        context.label
                    ),
                );
            }
        }
    }

    for (index, content) in snapshot.content_id_options.iter().enumerate() {
        for can_do_id in &content.can_do_ids {
            if !can_do_ids.contains(can_do_id.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownContentCanDo",
                    format!("contentIdOptions.{index}.canDoIds"),
                    format!(
                        "Language content {} references unknown Can-do: {can_do_id}",
                        content.id
                    ),
                );
            }
        }
        for context_id in &content.context_ids {
            if !context_ids.contains(context_id.as_str()) {
                issue(
                    &mut issues,
                    "registry.unknownContentContext",
                    format!("contentIdOptions.{index}.contextIds"),
                    format!(
                        "Language content {} references unknown Context: {context_id}",
                        content.id
                    ),
                );
            }
        }
    }

    let expected_schemas = [
        ("IF-SINGLE-SELECT", "urn:fcc:a1:single-select:0.2"),
        ("IF-MATCHING", "urn:fcc:a1:matching:0.2"),
        ("IF-RESTRICTED-INPUT", "urn:fcc:a1:restricted-input:0.2"),
        ("IF-FORM-ENTRY", "urn:fcc:a1:form-entry:0.2"),
        ("IF-TYPED-MESSAGE", "urn:fcc:a1:typed-message:0.2"),
        ("IF-SPOKEN-SINGLE", "urn:fcc:a1:spoken-single:0.2"),
        ("IF-SPOKEN-MULTITURN", "urn:fcc:a1:spoken-multiturn:0.2"),
    ];
    if snapshot.candidate_schemas.len() != expected_schemas.len() {
        issue(
            &mut issues,
            "registry.exerciseTemplateCount",
            "candidateSchemas",
            format!(
                "Exactly {} classified exercise-template schemas are required",
                expected_schemas.len()
            ),
        );
    }
    for (index, (item_format_id, schema_id)) in expected_schemas.iter().enumerate() {
        if !snapshot
            .capabilities
            .iter()
            .any(|capability| capability.item_format_id == *item_format_id)
        {
            issue(
                &mut issues,
                "registry.exerciseTemplateUnused",
                "capabilities",
                format!("No blueprint slot uses required item format {item_format_id}"),
            );
        }
        if snapshot
            .candidate_schemas
            .get(index)
            .and_then(|schema| schema.get("$id"))
            .and_then(serde_json::Value::as_str)
            != Some(*schema_id)
        {
            issue(
                &mut issues,
                "registry.exerciseTemplateOrder",
                format!("candidateSchemas.{index}"),
                format!("{item_format_id} must use schema {schema_id} at this classified position"),
            );
        }
    }

    for (index, band) in snapshot.difficulty_bands.iter().enumerate() {
        if !difficulty_ids.contains(band.as_str()) {
            issue(
                &mut issues,
                "registry.missingDifficultyStandard",
                format!("difficultyBands.{index}"),
                format!("No Difficulty Standard exists for {band}"),
            );
        }
    }
    for band in ["LowerA1", "TypicalA1", "UpperA1"] {
        if !snapshot.difficulty_bands.iter().any(|entry| entry == band) {
            issue(
                &mut issues,
                "registry.requiredDifficultyBand",
                "difficultyBands",
                "Lower, Typical, and Upper A1 levels are all required",
            );
        }
    }
    for (index, standard) in snapshot.difficulty_standards.iter().enumerate() {
        validate_difficulty_standard(
            standard,
            &format!("difficultyStandards.{index}"),
            &mut issues,
        );
    }

    let mut profile_ids = HashSet::new();
    let mut profile_keys = HashSet::new();
    for (profile_index, profile) in snapshot
        .capability_difficulty_profile_sets
        .iter()
        .enumerate()
    {
        let path = format!("capabilityDifficultyProfileSets.{profile_index}");
        if profile.id.trim().is_empty() || !profile_ids.insert(profile.id.as_str()) {
            issue(
                &mut issues,
                "registry.duplicateDifficultyProfileSet",
                format!("{path}.id"),
                "Difficulty Profile Set IDs must be non-empty and unique",
            );
        }
        let key = format!(
            "{}::{}::{}",
            profile.blueprint_slot_id, profile.item_format_id, profile.primary_can_do_id
        );
        if !profile_keys.insert(key.clone()) {
            issue(
                &mut issues,
                "registry.duplicateCapabilityDifficultyProfile",
                &path,
                format!("Duplicate Capability Difficulty Profile Set: {key}"),
            );
        }
        if !snapshot.capabilities.iter().any(|capability| {
            capability.blueprint_slot_id == profile.blueprint_slot_id
                && capability.item_format_id == profile.item_format_id
                && capability.primary_can_do_id == profile.primary_can_do_id
        }) {
            issue(
                &mut issues,
                "registry.orphanCapabilityDifficultyProfile",
                &path,
                format!("Difficulty Profile Set references unknown capability: {key}"),
            );
        }
        let mut standard_ids = HashSet::new();
        for (standard_index, standard) in profile.standards.iter().enumerate() {
            if !standard_ids.insert(standard.id.as_str()) {
                issue(
                    &mut issues,
                    "registry.duplicateCapabilityDifficultyBand",
                    format!("{path}.standards.{standard_index}.id"),
                    format!("Duplicate difficulty band {} in {key}", standard.id),
                );
            }
            if !snapshot.difficulty_bands.contains(&standard.id) {
                issue(
                    &mut issues,
                    "registry.unknownCapabilityDifficultyBand",
                    format!("{path}.standards.{standard_index}.id"),
                    format!("Unknown difficulty band {}", standard.id),
                );
            }
            validate_difficulty_standard(
                standard,
                &format!("{path}.standards.{standard_index}"),
                &mut issues,
            );
        }
        for band in ["LowerA1", "TypicalA1", "UpperA1"] {
            if !standard_ids.contains(band) {
                issue(
                    &mut issues,
                    "registry.missingCapabilityDifficultyBand",
                    format!("{path}.standards"),
                    "Each task configuration requires Lower, Typical, and Upper A1 settings",
                );
            }
        }
    }
    for (index, capability) in snapshot.capabilities.iter().enumerate() {
        let has_profile = snapshot
            .capability_difficulty_profile_sets
            .iter()
            .any(|profile| {
                profile.blueprint_slot_id == capability.blueprint_slot_id
                    && profile.item_format_id == capability.item_format_id
                    && profile.primary_can_do_id == capability.primary_can_do_id
            });
        if !has_profile {
            issue(
                &mut issues,
                "registry.missingCapabilityDifficultyProfile",
                format!("capabilities.{index}"),
                "Every capability requires a Difficulty Profile Set",
            );
        }
    }

    RegistryValidationResult {
        valid: !issues.iter().any(|issue| issue.severity == "error"),
        issues,
    }
}

pub fn preferred_published_record(
    records: &[RegistryVersionRecord],
) -> Option<&RegistryVersionRecord> {
    records
        .iter()
        .filter(|record| record.status == REGISTRY_STATUS_PUBLISHED)
        .max_by_key(|record| {
            (
                record.active,
                record.published_at.as_deref().unwrap_or(""),
                record.updated_at.as_str(),
                record.id.as_str(),
            )
        })
}

pub async fn initialize(db: &WorkbenchDatabase) -> Result<(), Error> {
    let baseline = snapshot().clone();
    let current_active = db
        .registry_versions
        .find_one(doc! { "active": true })
        .sort(doc! { "publishedAt": -1, "updatedAt": -1, "id": -1 })
        .await?;
    let promote_embedded_baseline = current_active
        .as_ref()
        .is_none_or(|record| record.created_by == "system");
    if db
        .registry_versions
        .count_documents(doc! { "version": &baseline.bundle_version })
        .await?
        == 0
    {
        let timestamp = now();
        db.registry_versions
            .insert_one(RegistryVersionRecord {
                id: format!("LARV-{}", Uuid::new_v4()),
                version: baseline.bundle_version.clone(),
                status: REGISTRY_STATUS_PUBLISHED.to_string(),
                active: promote_embedded_baseline,
                revision: 1,
                base_version: None,
                snapshot: baseline.clone(),
                created_by: "system".to_string(),
                updated_by: "system".to_string(),
                created_at: timestamp.clone(),
                updated_at: timestamp.clone(),
                published_at: Some(timestamp),
            })
            .await?;
    }
    if promote_embedded_baseline {
        db.registry_versions
            .update_many(
                doc! { "active": true, "version": { "$ne": &baseline.bundle_version } },
                doc! { "$set": { "active": false } },
            )
            .await?;
        db.registry_versions
            .update_one(
                doc! { "version": &baseline.bundle_version },
                doc! { "$set": { "active": true } },
            )
            .await?;
    }

    let records: Vec<RegistryVersionRecord> = db
        .registry_versions
        .find(doc! { "status": REGISTRY_STATUS_PUBLISHED })
        .sort(doc! { "publishedAt": 1 })
        .await?
        .try_collect()
        .await?;
    let active_record = preferred_published_record(&records);
    let active_version = active_record.map(|record| record.version.clone());
    if let Some(active_record) = active_record {
        db.registry_versions
            .update_one(
                doc! { "id": &active_record.id },
                doc! { "$set": { "active": true } },
            )
            .await?;
        db.registry_versions
            .update_many(
                doc! { "active": true, "id": { "$ne": &active_record.id } },
                doc! { "$set": { "active": false } },
            )
            .await?;
    }
    for mut record in records {
        hydrate_published_registry_snapshot(&mut record.snapshot);
        let make_active = active_version.as_deref() == Some(record.version.as_str());
        install_published_snapshot(record.snapshot, make_active);
    }
    Ok(())
}

pub async fn write_audit(
    db: &WorkbenchDatabase,
    record: &RegistryVersionRecord,
    action: &str,
    actor_email: &str,
) -> Result<(), Error> {
    if db
        .registry_audit_events
        .find_one(doc! {
            "registryVersionId": &record.id, "action": action, "revision": record.revision as i64,
        })
        .await?
        .is_some()
    {
        return Ok(());
    }
    let id = format!("LARA-{}-{}-{action}", record.id, record.revision);
    db.registry_audit_events
        .update_one(doc! { "id": &id }, doc! { "$setOnInsert": {
            "id": id, "registryVersionId": &record.id, "action": action,
            "actorEmail": actor_email, "revision": record.revision as i64,
            "createdAt": if action == "registry.version.published" { record.published_at.as_deref().unwrap_or(&record.updated_at) } else { &record.updated_at },
        } })
        .upsert(true)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn settings_reject_missing_can_do_metadata_and_ambiguous_names() {
        let mut registry = snapshot().clone();
        registry.can_do_options[0].primary_skill = None;
        registry.can_do_options[0].activity = None;
        registry.can_do_options[1].label =
            format!("  {}  ", registry.can_do_options[0].label.to_uppercase());
        registry.context_options[1].label = registry.context_options[0].label.clone();
        let result = validate_registry(&registry);
        assert!(!result.valid);
        for code in [
            "registry.canDoSkillRequired",
            "registry.canDoActivityRequired",
            "registry.duplicateDisplayName",
        ] {
            assert!(
                result.issues.iter().any(|issue| issue.code == code),
                "missing {code}"
            );
        }
    }

    #[test]
    fn difficulty_profiles_require_all_bands_and_valid_default_ranges() {
        let mut registry = snapshot().clone();
        registry.capability_difficulty_profile_sets[0]
            .standards
            .pop();
        registry.capability_difficulty_profile_sets[0].standards[0]
            .default_drivers
            .information_points = 0;
        registry.capability_difficulty_profile_sets[0].standards[1].allowed_support_levels =
            vec!["invalid".to_string()];
        let result = validate_registry(&registry);
        assert!(!result.valid);
        for code in [
            "registry.missingCapabilityDifficultyBand",
            "registry.difficultyDefaultRange",
            "registry.invalidDifficultyDriver",
        ] {
            assert!(
                result.issues.iter().any(|issue| issue.code == code),
                "missing {code}"
            );
        }
    }

    #[test]
    fn a1_difficulty_settings_cannot_require_complex_inference() {
        let mut standard = snapshot().difficulty_standards[0].clone();
        standard.default_drivers.inference_required = true;
        let mut issues = Vec::new();
        validate_difficulty_standard(&standard, "difficultyStandards.0", &mut issues);
        assert!(
            issues
                .iter()
                .any(|issue| issue.code == "registry.a1InferenceBoundary")
        );
    }

    #[test]
    fn context_requires_one_domain_and_an_available_compatible_configuration() {
        let mut registry = snapshot().clone();
        registry.context_options[0]
            .primary_domains
            .push("Public".to_string());
        registry.context_options[0].scope.clear();
        registry.capabilities[0].allowed_context_ids.clear();
        let result = validate_registry(&registry);
        assert!(!result.valid);
        for code in [
            "registry.contextDomainCount",
            "registry.contextScopeRequired",
            "registry.noSelectableContext",
        ] {
            assert!(
                result.issues.iter().any(|issue| issue.code == code),
                "missing {code}"
            );
        }
    }

    #[test]
    fn draft_from_embedded_registry_is_publishable() {
        let mut draft = snapshot().clone();
        super::super::registry::prepare_registry_draft(&mut draft);
        let validation = validate_registry(&draft);
        assert!(
            validation.valid,
            "embedded Registry must satisfy its own publication rules: {:?}",
            validation.issues
        );
    }

    #[test]
    fn selected_unavailable_contexts_block_publication() {
        let mut registry = snapshot().clone();
        super::super::registry::prepare_registry_draft(&mut registry);
        let first = &registry.capabilities[0];
        let incompatible_id = registry
            .context_options
            .iter()
            .find(|context| !context.can_do_ids.contains(&first.primary_can_do_id))
            .unwrap()
            .id
            .clone();
        registry.capabilities[0]
            .allowed_context_ids
            .push(incompatible_id);
        let result = validate_registry(&registry);
        assert!(!result.valid);
        assert!(result.issues.iter().any(
            |issue| issue.code == "registry.contextCanDoMismatch" && issue.severity == "error"
        ));
        let compatible_id = registry.capabilities[0].allowed_context_ids[0].clone();
        registry
            .context_options
            .iter_mut()
            .find(|context| context.id == compatible_id)
            .unwrap()
            .retired = true;
        assert!(
            validate_registry(&registry)
                .issues
                .iter()
                .any(|issue| issue.code == "registry.retiredContext")
        );
    }

    #[test]
    fn task_family_binding_and_shared_scoring_rules_must_be_consistent() {
        let mut registry = snapshot().clone();
        super::super::registry::prepare_registry_draft(&mut registry);
        registry.capabilities[0].task_family_id = "TF-SHORT-MESSAGE-COMPREHENSION".to_string();
        registry.scoring_contracts[0].technical_incident.summary =
            "A conflicting shared rule".to_string();
        let result = validate_registry(&registry);
        assert!(!result.valid);
        for code in [
            "registry.taskFamilyMismatch",
            "registry.conflictingScoringPolicy",
        ] {
            assert!(result.issues.iter().any(|issue| issue.code == code));
        }
    }

    #[test]
    fn every_slot_domain_has_an_allowed_context() {
        let registry = snapshot();
        for capability in &registry.capabilities {
            for domain in &capability.allowed_domains {
                assert!(
                    registry.context_options.iter().any(|context| {
                        capability.allowed_context_ids.contains(&context.id)
                            && context.primary_domains.contains(domain)
                    }),
                    "{} × {} has no concrete Context",
                    capability.blueprint_slot_id,
                    domain
                );
            }
        }
    }
}
