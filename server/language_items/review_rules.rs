use std::collections::{BTreeMap, HashSet};

use http::StatusCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{config::LanguageItemAiProviderConfig, errors::Error};

use super::{
    ai,
    content_assessment::content_for_assessment,
    domain::{AiFinding, AiReviewRun, TaskPackage},
    registry::{
        RegistrySnapshot, WorkbenchCapability, capability_for, difficulty_standards_for_capability,
        snapshot_for,
    },
    registry_store::RegistryValidationIssue,
    validation::validate_task_package,
};

pub const PLAN_VERSION: &str = "1";
pub const SUGGESTION_PROMPT_VERSION: &str = "0.1";

#[cfg(test)]
#[path = "review_rules_tests.rs"]
mod tests;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewCustomRule {
    pub id: String,
    pub title: String,
    pub criterion: String,
    pub required_evidence: Vec<String>,
    pub source_refs: Vec<String>,
    pub required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewRuleSet {
    pub item_rule_id: String,
    pub item_format_id: String,
    pub primary_can_do_id: String,
    pub source_fingerprint: String,
    #[serde(default)]
    pub source_fingerprints: BTreeMap<String, String>,
    pub rules: Vec<ReviewCustomRule>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewCheck {
    pub id: String,
    pub title: String,
    pub criterion: String,
    pub required_evidence: Vec<String>,
    pub source_refs: Vec<String>,
    pub required: bool,
    pub origin: String,
    pub method: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewPlan {
    pub plan_version: String,
    pub plan_hash: String,
    pub source_fingerprint: String,
    pub item_rule_id: String,
    pub item_format_id: String,
    pub primary_can_do_id: String,
    pub checks: Vec<ReviewCheck>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewRuleSource {
    pub id: String,
    pub label: String,
    pub value: Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewSourceChange {
    pub source_ref: String,
    pub label: String,
    pub change: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewPlanPreview {
    pub plan: ReviewPlan,
    pub source_fingerprint: String,
    pub source_fingerprints: BTreeMap<String, String>,
    pub saved_source_fingerprint: Option<String>,
    pub stale: bool,
    pub source_changes: Vec<ReviewSourceChange>,
    pub sources: Vec<ReviewRuleSource>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReviewRuleSuggestions {
    #[serde(flatten)]
    pub preview: ReviewPlanPreview,
    pub provider: String,
    pub model: String,
    pub prompt_version: String,
    pub simulated: bool,
    pub suggestions: Vec<ReviewCustomRule>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewCheckStatus {
    Pass,
    Fail,
    InsufficientEvidence,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewEvidence {
    pub field_path: String,
    pub quote: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewCheckResult {
    pub check_id: String,
    pub status: ReviewCheckStatus,
    pub message: String,
    pub evidence: Vec<ReviewEvidence>,
    pub source_refs: Vec<String>,
}

pub struct ReviewAssessment {
    pub findings: Vec<AiFinding>,
    pub review_plan: Option<ReviewPlan>,
    pub check_results: Option<Vec<ReviewCheckResult>>,
}

fn invalid(message: impl Into<String>) -> Error {
    Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message.into())
}

fn hash(value: &impl Serialize) -> String {
    // Value maps serialize in sorted-key order, including metadata received from clients.
    let value = serde_json::to_value(value).expect("review rules serialize");
    format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&value).expect("review value serializes"))
    )
}

fn matching_set<'a>(
    registry: &'a RegistrySnapshot,
    capability: &WorkbenchCapability,
) -> Option<&'a ReviewRuleSet> {
    registry.review_rule_sets.iter().find(|set| {
        set.item_rule_id == capability.item_rule_id
            && set.item_format_id == capability.item_format_id
            && set.primary_can_do_id == capability.primary_can_do_id
    })
}

fn sources_for(
    registry: &RegistrySnapshot,
    capability: &WorkbenchCapability,
) -> Vec<ReviewRuleSource> {
    let key = &capability.item_rule_id;
    let contexts = registry
        .context_options
        .iter()
        .filter(|context| {
            (capability.allowed_context_ids.contains(&context.id)
                || (super::exercise_templates::exercise_type(&capability.item_format_id).is_some()
                    && capability.allowed_context_ids.is_empty()))
                && super::registry::context_supports_capability(context, capability)
                && context
                    .primary_domains
                    .iter()
                    .any(|domain| capability.allowed_domains.contains(domain))
        })
        .collect::<Vec<_>>();
    let content = registry
        .content_id_options
        .iter()
        .filter(|entry| {
            entry.kind != "supported"
                && match entry.mastery_scope.as_deref() {
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
                && (entry.can_do_ids.is_empty()
                    || entry.can_do_ids.iter().any(|id| {
                        id == &capability.primary_can_do_id
                            || capability.supporting_can_do_ids.contains(id)
                    }))
                && ((super::exercise_templates::exercise_type(&capability.item_format_id)
                    .is_some()
                    && capability.allowed_context_ids.is_empty()
                    && super::content_context::content_context_matches(entry, ""))
                    || contexts.iter().any(|context| {
                        super::content_context::content_context_matches(entry, &context.id)
                    }))
        })
        .map(|entry| {
            let mut entry = entry.clone();
            entry.assessment_rules.retain(|rule| {
                rule.item_rule_id == capability.item_rule_id
                    && rule.item_format_id == capability.item_format_id
                    && rule.primary_can_do_id == capability.primary_can_do_id
            });
            entry
        })
        .collect::<Vec<_>>();
    let mut sources = vec![
        ReviewRuleSource {
            id: format!("itemRule.{}", capability.item_rule_id),
            label: "Item rules, Can-do and structure".into(),
            value: json!({"capability":capability,"canDoStatements":registry.can_do_options.iter().filter(|can_do| can_do.id == capability.primary_can_do_id || capability.supporting_can_do_ids.contains(&can_do.id)).collect::<Vec<_>>(),"candidateSchemas":registry.candidate_schemas,"taskPackageSchema":registry.task_package_schema}),
        },
        ReviewRuleSource {
            id: format!("contexts.{key}"),
            label: "Allowed Contexts".into(),
            value: json!(contexts),
        },
        ReviewRuleSource {
            id: format!("difficulty.{key}"),
            label: "Difficulty profiles".into(),
            value: json!(difficulty_standards_for_capability(registry, capability)),
        },
        ReviewRuleSource {
            id: format!("scoring.{}", capability.scoring_contract_template_id),
            label: "Scoring contract".into(),
            value: json!(
                registry
                    .scoring_contracts
                    .iter()
                    .find(|contract| contract.scoring_contract_template_id
                        == capability.scoring_contract_template_id)
            ),
        },
        ReviewRuleSource {
            id: format!("content.{key}"),
            label: "Language content and assessment rules".into(),
            value: json!(content),
        },
        ReviewRuleSource {
            id: "review.gates".into(),
            label: "Required human reviews".into(),
            value: json!(registry.required_review_gate_ids),
        },
    ];
    if let Some(kind) = super::exercise_templates::exercise_type(&capability.item_format_id) {
        sources[0].value = json!({"capability":capability,
            "canDoStatement":registry.can_do_options.iter().find(|can_do| can_do.id == capability.primary_can_do_id),
            "exerciseTemplateRule":registry.exercise_template_rules.iter().find(|rule| rule.id == capability.item_rule_id),
            "exerciseTemplateSchema":registry.exercise_template_schemas.get(kind)});
    }
    sources
}

fn fixed_checks(sources: &[ReviewRuleSource]) -> Vec<ReviewCheck> {
    [
        ("mechanical", "Item structure and fixed settings", "The item passes the application's deterministic checks against its pinned Registry, including schema, target compatibility, fixed setup, answers and scoring consistency.", "The current deterministic validation result.", 0, "deterministic"),
        ("construct", "Can-do and communicative purpose", "The actual response assesses the selected Can-do and observable evidence, respects the task family and A1 boundary, and avoids the prohibited uses in Item rules.", "Quote the question or response requirements and the material that makes the stated communicative purpose necessary.", 0, "ai"),
        ("context", "Context and information sufficiency", "The stimulus, instructions and required information points form a complete, natural situation within the selected Context. The item supplies the information necessary to answer.", "Quote the instructions and the information supporting each required response; identify missing information explicitly.", 1, "ai"),
        ("difficulty", "Intended difficulty", "The saved item matches the selected pinned difficulty profile in input length, information load, contextual support, inference and distractor similarity when applicable. Do not infer empirical difficulty, success rates or calibration from text.", "Quote the material and response demand that demonstrate each applicable difficulty driver; explain uncertainty where the supplied profile cannot establish a judgment.", 2, "ai"),
        ("targets", "Required language target assessment", "Each selected core target is necessary for understanding or production in this item. Apply its current assessment mode, communicative purpose, required evidence, acceptable responses, failure patterns, prerequisites and examples. A target label or incidental appearance is not assessment evidence; supporting material is not a required core target.", "For every selected core target, quote the material and response requirement showing why the answer depends on it; check plausible bypasses or optional-use opportunities.", 4, "ai"),
        ("scoring", "Answer and scoring agreement", "The answer key, accepted responses or rubric agree with the item instructions and the pinned scoring contract; objective answers are unambiguous and subjective criteria can be applied to the required response.", "Quote the response requirement and the corresponding answer or criterion, checking plausible alternative answers.", 3, "ai"),
        ("fairness", "Fairness and candidate safety", "The candidate-facing material is understandable and appropriate to the selected familiar A1 situation, has no answer leakage or unfair extraneous demand, and preserves the required human review gates. Human approval remains pending.", "Quote relevant candidate-facing wording and response demands; do not invent a defect when the supplied material does not establish one.", 5, "ai"),
    ].into_iter().map(|(id, title, criterion, evidence, source, method)| ReviewCheck {
        id: format!("fixed.{id}"), title: title.into(), criterion: criterion.into(), required_evidence: vec![evidence.into()], source_refs: vec![sources[source].id.clone()], required: true, origin: "fixed".into(), method: method.into(),
    }).collect()
}

pub fn preview(
    registry: &RegistrySnapshot,
    item_rule: &str,
    format: &str,
    can_do: &str,
) -> Result<ReviewPlanPreview, Error> {
    let capability = capability_for(registry, item_rule, format, Some(can_do))
        .ok_or_else(|| invalid("Review rules require an existing Item rules combination"))?;
    let sources = sources_for(registry, capability);
    let source_fingerprints: BTreeMap<_, _> = sources
        .iter()
        .map(|source| (source.id.clone(), hash(&source.value)))
        .collect();
    let source_fingerprint = hash(&source_fingerprints);
    let saved = matching_set(registry, capability);
    let stale = saved.is_some_and(|saved| {
        saved.source_fingerprint != source_fingerprint
            || saved.source_fingerprints != source_fingerprints
    });
    let mut source_changes = Vec::new();
    if let Some(saved) = saved {
        for source in &sources {
            let current = &source_fingerprints[&source.id];
            if saved.source_fingerprints.get(&source.id) != Some(current) {
                source_changes.push(ReviewSourceChange {
                    source_ref: source.id.clone(),
                    label: source.label.clone(),
                    change: if saved.source_fingerprints.contains_key(&source.id) {
                        "changed"
                    } else {
                        "added"
                    }
                    .into(),
                });
            }
        }
        for source in saved
            .source_fingerprints
            .keys()
            .filter(|id| !source_fingerprints.contains_key(*id))
        {
            source_changes.push(ReviewSourceChange {
                source_ref: source.clone(),
                label: source.clone(),
                change: "removed".into(),
            });
        }
    }
    let mut checks = fixed_checks(&sources);
    if let Some(rule) = registry
        .exercise_template_rules
        .iter()
        .find(|rule| rule.id == item_rule)
    {
        for (index, criterion) in rule.review_criteria.iter().enumerate() {
            checks.push(ReviewCheck {
                id: format!("template.{}.{}", rule.id, index + 1),
                title: format!("Exercise review criterion {}", index + 1),
                criterion: criterion.clone(),
                required_evidence: vec![
                    "Cite the authored exercise content supporting this judgment.".into(),
                ],
                source_refs: vec![sources[0].id.clone()],
                required: true,
                origin: "custom".into(),
                method: "ai".into(),
            });
        }
    }
    if let Some(saved) = saved {
        checks.extend(saved.rules.iter().map(|rule| ReviewCheck {
            id: rule.id.clone(),
            title: rule.title.clone(),
            criterion: rule.criterion.clone(),
            required_evidence: rule.required_evidence.clone(),
            source_refs: rule.source_refs.clone(),
            required: rule.required,
            origin: "custom".into(),
            method: "ai".into(),
        }));
    }
    let mut plan = ReviewPlan {
        plan_version: PLAN_VERSION.into(),
        plan_hash: String::new(),
        source_fingerprint: source_fingerprint.clone(),
        item_rule_id: item_rule.into(),
        item_format_id: format.into(),
        primary_can_do_id: can_do.into(),
        checks,
    };
    plan.plan_hash = hash(&plan);
    Ok(ReviewPlanPreview {
        plan,
        source_fingerprint,
        source_fingerprints,
        saved_source_fingerprint: saved.map(|saved| saved.source_fingerprint.clone()),
        stale,
        source_changes,
        sources,
    })
}

pub fn plan_for_package(package: &TaskPackage) -> Result<Option<ReviewPlan>, Error> {
    let registry = snapshot_for(&package.spec_versions.registry_bundle_version)
        .ok_or_else(|| invalid("The item's pinned Registry is unavailable"))?;
    let Some(capability) = capability_for(
        &registry,
        &package.item_rule_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    ) else {
        return Ok(None);
    };
    if registry.settings_schema_version < 2 && matching_set(&registry, capability).is_none() {
        return Ok(None);
    }
    let mut result = preview(
        &registry,
        &package.item_rule_id,
        &package.item_format_id,
        &package.content.primary_can_do_id,
    )?;
    if result.stale {
        return Err(invalid(
            "The pinned review rules do not match their fixed sources",
        ));
    }
    instantiate_checks(&mut result.plan, package, &registry, capability)?;
    // Freeze/review bookkeeping and item wording do not change the rule identity.
    // The separate content hash already binds findings to the actual authored text.
    result.plan.plan_hash = hash(
        &json!({ "plan": result.plan, "registryVersion": registry.bundle_version, "contextId": package.content.context_id, "difficultyBand": package.content.difficulty_band, "difficulty": package.content.difficulty, "targetContentIds": package.content.target_content_ids, "requiredInformationPoints": package.content.required_information_points, "supportingContentRefs": package.content.supporting_content_refs }),
    );
    Ok(Some(result.plan))
}

fn instantiate_checks(
    plan: &mut ReviewPlan,
    package: &TaskPackage,
    registry: &RegistrySnapshot,
    capability: &WorkbenchCapability,
) -> Result<(), Error> {
    let context = registry
        .context_options
        .iter()
        .find(|context| context.id == package.content.context_id);
    if context.is_none()
        && !(super::exercise_templates::exercise_type(&package.item_format_id).is_some()
            && capability.allowed_context_ids.is_empty()
            && package.content.context_id.is_empty())
    {
        return Err(invalid(
            "The review plan requires the item's pinned Context",
        ));
    }
    let standard = difficulty_standards_for_capability(registry, capability)
        .iter()
        .find(|standard| standard.id == package.content.difficulty_band)
        .ok_or_else(|| invalid("The review plan requires the item's pinned difficulty profile"))?;
    for check in &mut plan.checks {
        match check.id.as_str() {
            "fixed.construct" => {
                if let Some(can_do) = registry
                    .can_do_options
                    .iter()
                    .find(|can_do| can_do.id == capability.primary_can_do_id)
                {
                    check.title = format!("Can-do: {}", can_do.label);
                }
                check.criterion.push_str(&format!("\nExpected evidence: {}\nA1 boundary: {}\nRequired task behavior: {}\nProhibited uses: {}", capability.observable_evidence, capability.a1_boundary, capability.task_family_core_behavior, capability.prohibited_uses.join("; ")));
            }
            "fixed.context" => {
                check.title = context
                    .map(|context| format!("Context: {}", context.label))
                    .unwrap_or_else(|| format!("Domain: {}", package.content.primary_domain));
                check.criterion.push_str(&format!(
                    "\nSelected Context: {}. Scope: {}. Domain: {}. Required information: {}.",
                    context.map(|context| context.label.as_str()).unwrap_or("No predefined Context"),
                    context.map(|context| context.scope.as_str()).unwrap_or("The authored situation must be sufficient for the task and consistent with its selected Domain"),
                    package.content.primary_domain,
                    package
                        .content
                        .required_information_points
                        .iter()
                        .map(|point| point.label.as_str())
                        .collect::<Vec<_>>()
                        .join("; ")
                ));
            }
            "fixed.difficulty" => {
                let drivers = &standard.default_drivers;
                check.title = format!("Difficulty: {}", standard.label);
                check.criterion.push_str(&format!("\nSelected profile: {}. {}\nInput length: {}; information points: {}; contextual support: {}; independence: {}; complex inference: {}.", standard.label, standard.description, drivers.input_length, drivers.information_points, drivers.support_level, drivers.independence_level, drivers.inference_required));
                if ["IF-SINGLE-SELECT", "IF-MATCHING"].contains(&package.item_format_id.as_str()) {
                    check.criterion.push_str(&format!(
                        " Distractor similarity: {}.",
                        drivers.distractor_similarity
                    ));
                }
            }
            _ => {}
        }
    }
    let target_template = plan
        .checks
        .iter()
        .find(|check| check.id == "fixed.targets")
        .expect("target template exists")
        .clone();
    plan.checks.retain(|check| check.id != "fixed.targets");
    for id in &package.content.target_content_ids {
        let content = registry
            .content_id_options
            .iter()
            .find(|entry| &entry.id == id && entry.kind != "supported")
            .ok_or_else(|| {
                invalid("The review plan references an unavailable core language target")
            })?;
        let content = content_for_assessment(
            content,
            &package.item_rule_id,
            &package.item_format_id,
            &package.content.primary_can_do_id,
            &package.content.context_id,
        );
        let mut check = target_template.clone();
        check.id = format!("fixed.target.{}", content.id);
        check.title = format!("Language target: {}", content.label);
        check.criterion = format!(
            "Assess this required target separately: {}. Meaning: {}. Structure: {}. The requested response must depend on this target, rather than its incidental appearance or an optional opportunity to use it.",
            content.label,
            content
                .meaning
                .as_deref()
                .unwrap_or("use the supplied entry metadata"),
            content
                .pattern
                .as_deref()
                .unwrap_or("use the supplied entry metadata")
        );
        for rule in &content.assessment_rules {
            let mode = match rule.assessment_mode {
                Some(super::content_assessment::AssessmentMode::Understanding) => "Understanding",
                Some(super::content_assessment::AssessmentMode::ControlledProduction) => {
                    "Controlled production"
                }
                Some(super::content_assessment::AssessmentMode::FreeProduction) => {
                    "Free production"
                }
                None => "not defined",
            };
            check.criterion.push_str(&format!("\nAssessment mode: {mode}. Communicative purpose: {}. Acceptable responses: {}. Failure patterns: {}. Prerequisites: {}. Valid examples: {}. Invalid examples: {}.", rule.communicative_purpose, rule.acceptable_responses.join("; "), rule.failure_patterns.join("; "), rule.prerequisites.join("; "), rule.valid_examples.join("; "), rule.invalid_examples.join("; ")));
            check
                .required_evidence
                .extend(rule.required_evidence.iter().cloned());
        }
        plan.checks.push(check);
    }
    Ok(())
}

fn custom_rule_problem(
    rule: &ReviewCustomRule,
    source_ids: &HashSet<&str>,
) -> Option<&'static str> {
    if rule.id.trim().is_empty() || rule.id.starts_with("fixed.") || rule.id.trim() != rule.id {
        return Some("Custom review rules need a stable nonblank ID outside the fixed. namespace");
    }
    if rule.title.trim().is_empty()
        || rule.criterion.trim().is_empty()
        || rule.required_evidence.is_empty()
        || rule
            .required_evidence
            .iter()
            .any(|text| text.trim().is_empty())
    {
        return Some("Describe the review rule, passing criterion and required evidence");
    }
    if rule.source_refs.is_empty()
        || rule
            .source_refs
            .iter()
            .any(|source| !source_ids.contains(source.as_str()))
    {
        return Some("Every custom review rule must reference its supplied fixed-rule sources");
    }
    if rule.source_refs.iter().collect::<HashSet<_>>().len() != rule.source_refs.len() {
        return Some("Review rule source references must be unique");
    }
    None
}

pub fn validate_rule_sets(registry: &RegistrySnapshot) -> Vec<RegistryValidationIssue> {
    let mut issues = Vec::new();
    let mut combinations = HashSet::new();
    for (index, set) in registry.review_rule_sets.iter().enumerate() {
        let path = format!("reviewRuleSets.{index}");
        let mut issue = |code: &str, suffix: &str, message: &str| {
            issues.push(RegistryValidationIssue {
                severity: "error".into(),
                code: code.into(),
                path: format!("{path}{suffix}"),
                message: message.into(),
            })
        };
        if !combinations.insert((
            &set.item_rule_id,
            &set.item_format_id,
            &set.primary_can_do_id,
        )) {
            issue(
                "registry.duplicateReviewRuleSet",
                "",
                "Only one review rule set may bind each Item rules combination",
            );
        }
        let result = match preview(
            registry,
            &set.item_rule_id,
            &set.item_format_id,
            &set.primary_can_do_id,
        ) {
            Ok(result) => result,
            Err(_) => {
                issue(
                    "registry.reviewRuleSetBinding",
                    "",
                    "The review rule set references unavailable Item rules",
                );
                continue;
            }
        };
        if result.stale || set.source_fingerprints != result.source_fingerprints {
            issue(
                "registry.staleReviewRules",
                ".sourceFingerprint",
                "Fixed settings changed. Review the source differences and refresh these review rules before publishing",
            );
        }
        let source_ids = result
            .sources
            .iter()
            .map(|source| source.id.as_str())
            .collect();
        let mut rule_ids = HashSet::new();
        for (rule_index, rule) in set.rules.iter().enumerate() {
            if !rule_ids.insert(&rule.id) {
                issue(
                    "registry.duplicateReviewRule",
                    &format!(".rules.{rule_index}.id"),
                    "Review rule IDs must be unique within this Item rules combination",
                );
            }
            if let Some(problem) = custom_rule_problem(rule, &source_ids) {
                issue(
                    "registry.invalidReviewRule",
                    &format!(".rules.{rule_index}"),
                    problem,
                );
            }
        }
    }
    if registry.settings_schema_version >= 2 || !registry.review_rule_sets.is_empty() {
        for gate in [
            "editorial",
            "constructAndLevel",
            "content",
            "scoring",
            "fairnessAccessibility",
            "technicalSecurity",
        ] {
            if !registry
                .required_review_gate_ids
                .iter()
                .any(|saved| saved == gate)
            {
                issues.push(RegistryValidationIssue {
                    severity: "error".into(),
                    code: "registry.requiredReviewGate".into(),
                    path: "requiredReviewGateIds".into(),
                    message: format!(
                        "Review rules cannot remove the required human review: {gate}"
                    ),
                });
            }
        }
    }
    issues
}

pub fn validate_check_results(
    package: &TaskPackage,
    plan: &ReviewPlan,
    results: &[ReviewCheckResult],
) -> Result<(), Error> {
    if results.len() != plan.checks.len() {
        return Err(invalid(
            "Review results must cover every planned check exactly once",
        ));
    }
    let package_value = serde_json::to_value(package).expect("package serializes");
    let mut seen = HashSet::new();
    for result in results {
        let check = plan
            .checks
            .iter()
            .find(|check| check.id == result.check_id)
            .ok_or_else(|| invalid("Review results include an unknown check ID"))?;
        if !seen.insert(&result.check_id) || result.message.trim().is_empty() {
            return Err(invalid(
                "Review results must have unique check IDs and explanations",
            ));
        }
        if result.source_refs.iter().collect::<HashSet<_>>()
            != check.source_refs.iter().collect::<HashSet<_>>()
            || result.source_refs.len() != check.source_refs.len()
        {
            return Err(invalid(
                "Review result sources must match the planned check sources",
            ));
        }
        if check.method == "deterministic" {
            let validation = validate_task_package(package);
            let expected = if validation.valid {
                ReviewCheckStatus::Pass
            } else {
                ReviewCheckStatus::Fail
            };
            if result.status != expected {
                return Err(invalid("AI results cannot override deterministic checks"));
            }
        } else if result.status != ReviewCheckStatus::InsufficientEvidence
            && result.evidence.is_empty()
        {
            return Err(invalid(
                "A passing or failing AI check requires concrete item evidence",
            ));
        }
        for evidence in &result.evidence {
            if evidence.quote.trim().is_empty()
                || !(evidence.field_path.starts_with("/candidatePayload/")
                    || evidence.field_path.starts_with("/scoringPackage/"))
            {
                return Err(invalid(
                    "Review evidence must quote candidate content or scoring, using an absolute JSON pointer",
                ));
            }
            let value = package_value
                .pointer(&evidence.field_path)
                .ok_or_else(|| invalid("Review evidence points to a missing item field"))?;
            let exact = match value {
                Value::String(text) => text.contains(&evidence.quote),
                Value::Number(_) | Value::Bool(_) => {
                    serde_json::to_string(value).is_ok_and(|rendered| rendered == evidence.quote)
                }
                _ => false,
            };
            if !exact {
                return Err(invalid(
                    "Review evidence does not match the original item text",
                ));
            }
        }
    }
    Ok(())
}

pub fn require_current_plan_report(
    package: &TaskPackage,
    report: &AiReviewRun,
) -> Result<(), Error> {
    let Some(plan) = plan_for_package(package)? else {
        return Ok(());
    };
    if report.review_plan.as_ref() != Some(&plan) {
        return Err(Error::Server(StatusCode::CONFLICT, "The AI review does not match this item's current review plan. Run AI pre-review again.".into()));
    }
    let results = report
        .check_results
        .as_ref()
        .ok_or_else(|| invalid("The AI review is missing its planned check results"))?;
    validate_check_results(package, &plan, results)?;
    if results.iter().any(|result| {
        result.status != ReviewCheckStatus::Pass
            && plan
                .checks
                .iter()
                .any(|check| check.id == result.check_id && check.required)
    }) {
        return Err(invalid(
            "Required review checks failed or have insufficient evidence. Correct the item and run AI pre-review again before submitting.",
        ));
    }
    Ok(())
}

pub fn report_matches_plan(package: &TaskPackage, report: &AiReviewRun) -> bool {
    match plan_for_package(package) {
        Ok(None) => report.review_plan.is_none() && report.check_results.is_none(),
        Ok(Some(plan)) => {
            report.review_plan.as_ref() == Some(&plan)
                && report
                    .check_results
                    .as_ref()
                    .is_some_and(|results| validate_check_results(package, &plan, results).is_ok())
        }
        Err(_) => false,
    }
}

pub fn mechanical_result(package: &TaskPackage, plan: &ReviewPlan) -> ReviewCheckResult {
    let validation = validate_task_package(package);
    ReviewCheckResult {
        check_id: "fixed.mechanical".into(),
        status: if validation.valid {
            ReviewCheckStatus::Pass
        } else {
            ReviewCheckStatus::Fail
        },
        message: if validation.valid {
            "The current content passes the fixed settings and structural checks.".into()
        } else {
            validation
                .issues
                .iter()
                .map(|issue| issue.message.as_str())
                .collect::<Vec<_>>()
                .join("; ")
        },
        evidence: vec![],
        source_refs: plan
            .checks
            .iter()
            .find(|check| check.id == "fixed.mechanical")
            .expect("mechanical check exists")
            .source_refs
            .clone(),
    }
}

fn review_response_demand(preview: &ReviewPlanPreview) -> Result<String, Error> {
    let capability = preview
        .sources
        .iter()
        .find_map(|source| source.value.get("capability"))
        .ok_or_else(|| invalid("AI review requires the selected Item rules definition"))?;
    let skill = match capability["primaryReportedSkill"].as_str() {
        Some("Reading") => {
            "These item rules assess reading comprehension. Assess language targets through understanding the material and response requirements; do not require independent production of the expression. "
        }
        Some("Listening") => {
            "These item rules assess listening comprehension. Assess language targets through understanding the audio and response requirements; do not require independent production of the expression. "
        }
        Some("Writing") => {
            "These item rules assess writing. The item format, communicative requirements and applicable language target rules define what the candidate must write. "
        }
        Some("Speaking") => {
            "These item rules assess speaking. The item format, communicative requirements and applicable language target rules define what the candidate must say. "
        }
        _ => {
            "Use the specified skill and response model to determine the requirements without assuming additional language production. "
        }
    };
    let response = match preview.plan.item_format_id.as_str() {
        "IF-SINGLE-SELECT" => {
            "The candidate selects an answer from supplied options. Author-provided wording in a correct option does not establish productive use of that expression. "
        }
        "IF-MATCHING" => {
            "The candidate matches supplied material. Matching does not itself establish independent production of the expressions. "
        }
        "IF-RESTRICTED-INPUT" => {
            "The candidate supplies a constrained answer. Extracting information in reading or listening demonstrates understanding; the act of typing alone does not make this a language production task. "
        }
        "IF-FORM-ENTRY" => {
            "The candidate fills in the specified fields. Assess only the expressions actually required, without expanding the task into free writing. "
        }
        "IF-TYPED-MESSAGE" => {
            "The candidate writes a message for the specified audience and communicative purpose within these item rules. "
        }
        "IF-SPOKEN-SINGLE" => {
            "The candidate gives the specified single spoken response within these item rules. "
        }
        "IF-SPOKEN-MULTITURN" => {
            "The candidate responds in the specified spoken exchange within these item rules. "
        }
        _ => "The item format and structure define the response action. ",
    };
    Ok(format!(
        "{skill}{response}A language entry's mastery scope controls eligible skills without adding response modes. Entries permitting both understanding and production still require only understanding in comprehension tasks."
    ))
}

fn review_provider_sources(preview: &ReviewPlanPreview) -> Vec<ReviewRuleSource> {
    let mut sources = preview.sources.clone();
    for source in &mut sources {
        if source.id.starts_with("itemRule.")
            && let Some(value) = source.value.as_object_mut()
        {
            // Deterministic validation owns structural schemas; keep the full originals in the bound preview.
            value.remove("candidateSchemas");
            value.remove("taskPackageSchema");
        }
    }
    sources
}

pub async fn suggest(
    config: &LanguageItemAiProviderConfig,
    client: &reqwest::Client,
    preview: ReviewPlanPreview,
) -> Result<ReviewRuleSuggestions, Error> {
    let metadata = ai::provider_metadata(config);
    let simulated = matches!(config, LanguageItemAiProviderConfig::DeterministicMock);
    let suggestions = if simulated {
        vec![ReviewCustomRule { id: "custom.mock-response-dependence".into(), title: "Offline example: response dependence".into(), criterion: "Check that the requested response depends on the selected Can-do evidence, rather than an incidental clue. This is an offline example, not an AI analysis.".into(), required_evidence: vec!["Quote the prompt and the material needed to answer it.".into()], source_refs: vec![preview.sources[0].id.clone()], required: false }]
    } else {
        let schema = json!({ "type":"object", "required":["suggestions"], "additionalProperties":false, "properties": { "suggestions": { "type":"array", "maxItems":8, "items": { "type":"object", "required":["id","title","criterion","requiredEvidence","sourceRefs","required"], "additionalProperties":false, "properties": { "id":{"type":"string"},"title":{"type":"string"},"criterion":{"type":"string"},"requiredEvidence":{"type":"array","items":{"type":"string"}},"sourceRefs":{"type":"array","minItems":1,"items":{"type":"string","enum":preview.sources.iter().map(|source| &source.id).collect::<Vec<_>>()}},"required":{"type":"boolean"} } } } } });
        let value = ai::request_rule_output(
            config,
            client,
            include_str!("prompts/review-rule-suggestions-v0.1.md"),
            json!({"reviewPlan":preview.plan,"fixedSources":review_provider_sources(&preview),"responseDemand":review_response_demand(&preview)?}),
            "language_review_rule_suggestions",
            schema,
            json!({"suggestions":[]}),
        )
        .await?;
        #[derive(Deserialize)]
        #[serde(deny_unknown_fields)]
        struct Output {
            suggestions: Vec<ReviewCustomRule>,
        }
        serde_json::from_value::<Output>(value)
            .map_err(|_| invalid("AI review rule suggestions did not match the required contract"))?
            .suggestions
    };
    let source_ids = preview
        .sources
        .iter()
        .map(|source| source.id.as_str())
        .collect();
    let mut ids = HashSet::new();
    for rule in &suggestions {
        if let Some(problem) = custom_rule_problem(rule, &source_ids) {
            return Err(invalid(problem));
        }
        if !ids.insert(&rule.id) {
            return Err(invalid("AI suggested duplicate review rule IDs"));
        }
    }
    Ok(ReviewRuleSuggestions {
        preview,
        provider: metadata.provider.into(),
        model: metadata.model.into(),
        prompt_version: SUGGESTION_PROMPT_VERSION.into(),
        simulated,
        suggestions,
    })
}

pub struct PreliminaryReviewOutcome {
    pub blind_answer: Option<super::blind_review::BlindAnswerAttempt>,
    pub assessment: Result<ReviewAssessment, Error>,
}

pub async fn preliminary_review(
    config: &LanguageItemAiProviderConfig,
    client: &reqwest::Client,
    package: &TaskPackage,
) -> PreliminaryReviewOutcome {
    let answer = match super::blind_review::attempt(config, client, package).await {
        Ok(answer) => answer,
        Err(error) => {
            return PreliminaryReviewOutcome {
                blind_answer: None,
                assessment: Err(error),
            };
        }
    };
    // Keep the first observation even when the answer-revealed review fails.
    let assessment = assess_after_answer(config, client, package, Some(&answer)).await;
    PreliminaryReviewOutcome {
        blind_answer: Some(answer),
        assessment,
    }
}

#[cfg(test)]
async fn assess(
    config: &LanguageItemAiProviderConfig,
    client: &reqwest::Client,
    package: &TaskPackage,
) -> Result<ReviewAssessment, Error> {
    assess_after_answer(config, client, package, None).await
}

async fn assess_after_answer(
    config: &LanguageItemAiProviderConfig,
    client: &reqwest::Client,
    package: &TaskPackage,
    blind_answer: Option<&super::blind_review::BlindAnswerAttempt>,
) -> Result<ReviewAssessment, Error> {
    let Some(plan) = plan_for_package(package)? else {
        return Ok(ReviewAssessment {
            findings: ai::review_after_independent_answer(config, client, package, blind_answer)
                .await?,
            review_plan: None,
            check_results: None,
        });
    };
    let registry = snapshot_for(&package.spec_versions.registry_bundle_version)
        .ok_or_else(|| invalid("Pinned Registry is unavailable"))?;
    let preview = preview(
        &registry,
        &package.item_rule_id,
        &package.item_format_id,
        &package.content.primary_can_do_id,
    )?;
    let selected_content = package
        .content
        .target_content_ids
        .iter()
        .filter_map(|id| {
            registry
                .content_id_options
                .iter()
                .find(|entry| &entry.id == id)
        })
        .map(|entry| {
            content_for_assessment(
                entry,
                &package.item_rule_id,
                &package.item_format_id,
                &package.content.primary_can_do_id,
                &package.content.context_id,
            )
        })
        .collect::<Vec<_>>();
    let mut results = vec![mechanical_result(package, &plan)];
    if matches!(config, LanguageItemAiProviderConfig::DeterministicMock) {
        results.extend(
            plan.checks
                .iter()
                .filter(|check| check.method == "ai")
                .map(|check| ReviewCheckResult {
                    check_id: check.id.clone(),
                    status: ReviewCheckStatus::InsufficientEvidence,
                    message: "The offline simulation did not perform a semantic review; a real AI preliminary review and human review are required.".into(),
                    evidence: vec![],
                    source_refs: check.source_refs.clone(),
                }),
        );
    } else {
        let checks = plan
            .checks
            .iter()
            .filter(|check| check.method == "ai")
            .collect::<Vec<_>>();
        let mut schema: Value =
            serde_json::from_str(ai::REVIEW_OUTPUT_SCHEMA).expect("review schema is valid");
        schema["required"] = json!(["findings", "checkResults"]);
        schema["properties"]["checkResults"]["minItems"] = json!(checks.len());
        schema["properties"]["checkResults"]["maxItems"] = json!(checks.len());
        schema["properties"]["checkResults"]["items"]["properties"]["checkId"]["enum"] =
            json!(checks.iter().map(|check| &check.id).collect::<Vec<_>>());
        let source_refs = preview
            .sources
            .iter()
            .map(|source| &source.id)
            .collect::<Vec<_>>();
        schema["properties"]["findings"]["items"]["properties"]["ruleRef"]["enum"] =
            json!(source_refs);
        let value = ai::request_rule_output(config, client, ai::REVIEW_PROMPT, json!({ "taskPackage":package,"independentAnswer":blind_answer,"reviewPlan":plan,"checksToEvaluate":checks,"fixedSources":review_provider_sources(&preview),"responseDemand":review_response_demand(&preview)?,"targetContent":selected_content,"deterministicValidation":validate_task_package(package),"allowedRuleRefs":source_refs }), "language_item_review", schema, json!({"findings":[],"checkResults":[]})).await?;
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase", deny_unknown_fields)]
        struct Output {
            findings: Vec<AiFinding>,
            check_results: Vec<ReviewCheckResult>,
        }
        let output: Output = serde_json::from_value(value)
            .map_err(|_| invalid("AI review did not return the required check-result contract"))?;
        ai::validate_review_findings(
            &output.findings,
            &source_refs
                .iter()
                .map(|source| (*source).clone())
                .collect::<Vec<_>>(),
        )?;
        results.extend(output.check_results);
        validate_check_results(package, &plan, &results)?;
        return Ok(ReviewAssessment {
            findings: combine_findings(output.findings, &plan, &results),
            review_plan: Some(plan),
            check_results: Some(results),
        });
    }
    validate_check_results(package, &plan, &results)?;
    Ok(ReviewAssessment {
        findings: combine_findings(vec![], &plan, &results),
        review_plan: Some(plan),
        check_results: Some(results),
    })
}

fn combine_findings(
    mut findings: Vec<AiFinding>,
    plan: &ReviewPlan,
    results: &[ReviewCheckResult],
) -> Vec<AiFinding> {
    for result in results
        .iter()
        .filter(|result| result.status != ReviewCheckStatus::Pass)
    {
        let check = plan
            .checks
            .iter()
            .find(|check| check.id == result.check_id)
            .expect("validated check result");
        findings.push(AiFinding {
            category: "validation".into(),
            severity: if check.required { "error" } else { "warning" }.into(),
            code: format!("reviewCheck.{}", check.id),
            field_path: result
                .evidence
                .first()
                .map(|evidence| evidence.field_path.clone())
                .unwrap_or_else(|| "candidatePayload".into()),
            rule_ref: check.source_refs[0].clone(),
            message: format!("{}: {}", check.title, result.message),
        });
    }
    findings
}
