//! Versioned Can-do × exercise-template authoring rules. The source catalog is a
//! set of available implementations, never an assertion of assessment suitability.
use std::collections::{BTreeMap, HashSet};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{
    domain::{CandidatePayload, DeliveryPolicyRefs, ScoringPoint, TaskPackage, ValidationIssue},
    registry::{
        CapabilityDifficultyProfileSet, DifficultyBandStandard, NamedRegistryReference,
        RegistrySnapshot, ScoringContractSummary, ScoringPolicySummary, WorkbenchCapability,
    },
    registry_store::RegistryValidationIssue,
};

pub const FORMAT_PREFIX: &str = "EXERCISE:";

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExerciseTemplateContent {
    pub exercise_type: String,
    #[serde(default)]
    pub body: String,
    pub data: Value,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExerciseTemplateScoring {
    pub method: String,
    pub criteria: String,
    pub normalization_policy: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseTemplateRule {
    pub id: String,
    pub primary_can_do_id: String,
    pub exercise_type: String,
    pub enabled: bool,
    #[serde(default)]
    pub allowed_domains: Vec<String>,
    #[serde(default)]
    pub allowed_context_ids: Vec<String>,
    #[serde(default)]
    pub task_requirements: String,
    #[serde(default)]
    pub difficulty_standards: Vec<DifficultyBandStandard>,
    pub scoring: ExerciseTemplateScoring,
    #[serde(default)]
    pub review_criteria: Vec<String>,
    #[serde(default)]
    pub defaults: BTreeMap<String, Value>,
}

pub static CATALOG: Lazy<Value> = Lazy::new(|| {
    serde_json::from_str(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/language-item-workbench/exercise-templates/catalog.json"
    )))
    .expect("exercise template catalog must be valid JSON")
});

pub fn template(exercise_type: &str) -> Option<&'static Value> {
    CATALOG
        .get("templates")?
        .as_array()?
        .iter()
        .find(|entry| entry.get("id").and_then(Value::as_str) == Some(exercise_type))
}

pub fn exercise_type(item_format: &str) -> Option<&str> {
    item_format.strip_prefix(FORMAT_PREFIX)
}

/// Schemas exported with a review batch are derived only from its pinned snapshot.
pub fn review_schemas(registry: &RegistrySnapshot, kind: &str) -> Result<(Value, Value), String> {
    let mut source_schema = registry
        .exercise_template_schemas
        .get(kind)
        .cloned()
        .ok_or("The pinned exercise schema is unavailable.")?;
    if let Some(object) = source_schema.as_object_mut() {
        object.remove("x-exercise-template");
        object.remove("$schema");
    }
    let candidate = json!({"$schema":"https://json-schema.org/draft/2020-12/schema",
        "$id":format!("urn:exam-creator:exercise-candidate:{kind}:1"),"type":"object",
        "required":["exerciseType","body","data"],"properties":{
            "exerciseType":{"const":kind},"body":{"type":"string"},"data":{"type":"object"}},"additionalProperties":false});
    let mut task = registry.task_package_schema.clone();
    super::legacy_identity::upgrade_task_schema(&mut task)?;
    task["$id"] = json!(format!("urn:exam-creator:exercise-task:{kind}:1"));
    let capabilities: Vec<_> = registry
        .capabilities
        .iter()
        .filter(|row| exercise_type(&row.item_format_id) == Some(kind))
        .collect();
    task["properties"]["itemRuleId"] =
        json!({"enum":capabilities.iter().map(|row| &row.item_rule_id).collect::<Vec<_>>()});
    task["properties"]["taskFamilyId"] =
        json!({"enum":capabilities.iter().map(|row| &row.task_family_id).collect::<Vec<_>>()});
    task["properties"]["itemFormatId"] = json!({"const":format!("EXERCISE:{kind}")});
    task["properties"]["renderer"]["properties"]["rendererId"] =
        json!({"const":"REN-EXERCISE-TEMPLATE"});
    task["properties"]["content"]["properties"]["primaryCanDoId"] =
        json!({"enum":capabilities.iter().map(|row| &row.primary_can_do_id).collect::<Vec<_>>()});
    task["properties"]["content"]["properties"]["primaryDomain"] =
        json!({"enum":registry.allowed_domains});
    task["properties"]["content"]["properties"]["contextId"] = json!({"type":"string"});
    task["properties"]["authoringPackage"]["properties"]["exerciseTemplate"] = json!({"type":"object",
        "required":["exerciseType","body","data"],"properties":{"exerciseType":{"const":kind},"body":{"type":"string"},"data":source_schema},"additionalProperties":false});
    task["properties"]["authoringPackage"]["required"]
        .as_array_mut()
        .ok_or("The pinned authoring schema is invalid.")?
        .push(json!("exerciseTemplate"));
    Ok((task, candidate))
}

pub fn rule_for<'a>(
    registry: &'a RegistrySnapshot,
    package: &TaskPackage,
) -> Option<&'a ExerciseTemplateRule> {
    registry.exercise_template_rules.iter().find(|rule| {
        rule.id == package.item_rule_id
            && rule.primary_can_do_id == package.content.primary_can_do_id
            && exercise_type(&package.item_format_id) == Some(rule.exercise_type.as_str())
    })
}

fn policy(id: &str, summary: &str) -> ScoringPolicySummary {
    ScoringPolicySummary {
        policy_id: id.into(),
        summary: summary.into(),
        details: vec![],
    }
}

/// Derived compatibility records keep existing item, job and coverage identities
/// usable without treating legacy formats as author-facing template choices.
pub fn project_rules(registry: &mut RegistrySnapshot) {
    registry
        .capabilities
        .retain(|row| exercise_type(&row.item_format_id).is_none());
    registry
        .task_family_options
        .retain(|row| row.kind != "exerciseTemplate");
    registry
        .scoring_contracts
        .retain(|row| exercise_type(&row.item_format_id).is_none());
    registry
        .capability_difficulty_profile_sets
        .retain(|row| exercise_type(&row.item_format_id).is_none());
    for rule in registry
        .exercise_template_rules
        .iter()
        .filter(|rule| rule.enabled)
    {
        let Some(source) = template(&rule.exercise_type) else {
            continue;
        };
        let Some(can_do) = registry
            .can_do_options
            .iter()
            .find(|entry| entry.id == rule.primary_can_do_id)
        else {
            continue;
        };
        let definition = registry
            .exercise_template_schemas
            .get(&rule.exercise_type)
            .and_then(|schema| schema.get("x-exercise-template"))
            .unwrap_or(source);
        let name = definition
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or(&rule.exercise_type);
        let item_rule_id = rule.id.clone();
        let family_id = format!("exercise-template:{}", rule.exercise_type);
        let format = format!("{FORMAT_PREFIX}{}", rule.exercise_type);
        let scoring_id = format!("exercise:{}:scoring", rule.id);
        let skill = can_do.primary_skill.clone().unwrap_or_default();
        let activity = can_do.activity.clone().unwrap_or_default();
        let delivery = DeliveryPolicyRefs {
            navigation_policy_id: "EXERCISE-NAVIGATION-v1".into(),
            input_policy_id: "EXERCISE-INPUT-v1".into(),
            playback_policy_id: "EXERCISE-PLAYBACK-v1".into(),
            recording_policy_id: "EXERCISE-RECORDING-v1".into(),
            speaking_rate_profile_id: "EXERCISE-AUTHORED-AUDIO-v1".into(),
            pause_profile_id: "EXERCISE-AUTHORED-AUDIO-v1".into(),
        };
        registry.capabilities.push(WorkbenchCapability {
            item_rule_id: item_rule_id.clone(), title: name.into(), task_family_id: family_id.clone(),
            item_format_id: format.clone(), renderer_id: "REN-EXERCISE-TEMPLATE".into(),
            scoring_contract_template_id: scoring_id.clone(), primary_can_do_id: rule.primary_can_do_id.clone(),
            supporting_can_do_ids: vec![], primary_reported_skill: skill, communicative_activity: activity.clone(),
            communicative_activities: vec![activity], allowed_domains: rule.allowed_domains.clone(),
            allowed_context_ids: rule.allowed_context_ids.clone(), observable_evidence: rule.task_requirements.clone(),
            a1_boundary: rule.task_requirements.clone(), task_family_core_behavior: rule.task_requirements.clone(),
            task_structure: "Use the pinned exercise template schema and the authored task requirements.".into(),
            prohibited_uses: vec![], reference_task: String::new(), invalid_reference_task: String::new(),
            authoring_readiness: "Available".into(), staging_readiness: "CanonicalPackageAvailable".into(),
            renderer_implementation_status: "Available".into(), renderer_required_work: vec![], delivery_policy_refs: delivery,
        });
        if let Some(family) = registry
            .task_family_options
            .iter_mut()
            .find(|family| family.id == family_id)
        {
            family.item_rule_ids.push(item_rule_id.clone());
        } else {
            registry.task_family_options.push(NamedRegistryReference {
                id: family_id,
                display_name: name.into(),
                kind: "exerciseTemplate".into(),
                item_rule_ids: vec![item_rule_id.clone()],
                allowed_item_format_ids: vec![format.clone()],
            });
        }
        registry
            .capability_difficulty_profile_sets
            .push(CapabilityDifficultyProfileSet {
                id: format!("exercise:{}:difficulty", rule.id),
                item_rule_id: item_rule_id.clone(),
                item_format_id: format.clone(),
                primary_can_do_id: rule.primary_can_do_id.clone(),
                standards: rule.difficulty_standards.clone(),
            });
        registry.scoring_contracts.push(ScoringContractSummary {
            scoring_contract_template_id: scoring_id,
            display_name: name.into(),
            template_version: "1".into(),
            item_rule_ids: vec![item_rule_id],
            item_format_id: format,
            scoring_type: rule.scoring.method.clone(),
            normalization: policy(
                &format!("exercise:{}:normalization", rule.id),
                &rule.scoring.normalization_policy,
            ),
            partial_credit: policy(
                &format!("exercise:{}:scoring", rule.id),
                &rule.scoring.criteria,
            ),
            rubric_id: if rule.scoring.method == "analyticRubric" {
                format!("exercise:{}:rubric", rule.id)
            } else {
                "notApplicable".into()
            },
            invalid_response: policy(
                "EXERCISE-INVALID-v1",
                "Blank or unscorable responses receive no credit.",
            ),
            technical_incident: policy(
                "EXERCISE-TECHNICAL-v1",
                "Technical failure is not a scored response.",
            ),
            adjudication: policy("EXERCISE-ADJUDICATION-v1", "Human review remains required."),
            rater_qualification: policy(
                "EXERCISE-RATER-v1",
                "Qualification and calibration remain separate.",
            ),
            task_specific_requirements: vec![rule.scoring.criteria.clone()],
            cap_or_exclusion: None,
            status: "Configured".into(),
        });
    }
}

/// Pin only requested template schemas; never update an already saved schema.
pub fn prepare_draft(registry: &mut RegistrySnapshot) {
    for rule in &registry.exercise_template_rules {
        if let Some(source) = template(&rule.exercise_type)
            && let Some(schema) = source.get("schema")
        {
            registry
                .exercise_template_schemas
                .entry(rule.exercise_type.clone())
                .or_insert_with(|| {
                    let mut pinned = schema.clone();
                    pinned["x-exercise-template"] = json!({"name": source["name"], "fields": source["fields"], "projection":source["projection"], "responseUnits": response_unit_definition(&rule.exercise_type)});
                    pinned
                });
        }
    }
    project_rules(registry);
}

pub fn validate_rules(registry: &RegistrySnapshot) -> Vec<RegistryValidationIssue> {
    let mut issues = vec![];
    let mut ids = HashSet::new();
    let mut pairs = HashSet::new();
    for (index, rule) in registry.exercise_template_rules.iter().enumerate() {
        let path = format!("exerciseTemplateRules.{index}");
        let mut add = |field: &str, message: &str| {
            issues.push(RegistryValidationIssue {
                severity: "error".into(),
                code: "registry.exerciseTemplateRule".into(),
                path: format!("{path}.{field}"),
                message: message.into(),
            })
        };
        if rule.id.trim().is_empty() || rule.id.trim() != rule.id || !ids.insert(&rule.id) {
            add(
                "id",
                "Exercise template rule identifiers must be present and unique.",
            );
        }
        if !pairs.insert((&rule.primary_can_do_id, &rule.exercise_type)) {
            add(
                "exerciseType",
                "This Can-do and exercise template already have a configuration.",
            );
        }
        if template(&rule.exercise_type).is_none() {
            add(
                "exerciseType",
                "The selected exercise template is unavailable.",
            );
        }
        if !registry
            .can_do_options
            .iter()
            .any(|entry| entry.id == rule.primary_can_do_id)
        {
            add(
                "primaryCanDoId",
                "The selected Can-do does not exist. Remove its configuration before deleting the Can-do.",
            );
        }
        if !rule.enabled {
            continue;
        }
        if rule.allowed_domains.is_empty() {
            add("allowedDomains", "Select at least one Domain.");
        }
        if rule
            .allowed_domains
            .iter()
            .any(|id| !registry.allowed_domains.contains(id))
        {
            add("allowedDomains", "A selected Domain does not exist.");
        }
        if rule.allowed_domains.iter().collect::<HashSet<_>>().len() != rule.allowed_domains.len()
            || rule
                .allowed_context_ids
                .iter()
                .collect::<HashSet<_>>()
                .len()
                != rule.allowed_context_ids.len()
        {
            add(
                "allowedDomains",
                "Selected Domains and Contexts must be unique.",
            );
        }
        if rule.allowed_context_ids.iter().any(|id| {
            !registry.context_options.iter().any(|context| {
                context.id == *id
                    && !context.retired
                    && context.can_do_ids.contains(&rule.primary_can_do_id)
            })
        }) {
            add(
                "allowedContextIds",
                "An optional Context is unavailable or incompatible with this Can-do.",
            );
        }
        if rule.task_requirements.trim().is_empty() {
            add(
                "taskRequirements",
                "Describe what this exercise must assess.",
            );
        }
        if !["exactMatch", "perResponse", "analyticRubric"].contains(&rule.scoring.method.as_str())
        {
            add("scoring.method", "Select a supported scoring method.");
        }
        if rule.scoring.criteria.trim().is_empty() {
            add("scoring.criteria", "Describe the scoring criteria.");
        }
        if rule.scoring.normalization_policy.trim().is_empty() {
            add(
                "scoring.normalizationPolicy",
                "Describe accepted response normalization, or explicitly specify none.",
            );
        }
        if rule
            .review_criteria
            .iter()
            .any(|entry| entry.trim().is_empty())
        {
            add(
                "reviewCriteria",
                "Review criteria cannot contain blank entries.",
            );
        }
        for band in ["LowerA1", "TypicalA1", "UpperA1"] {
            if rule
                .difficulty_standards
                .iter()
                .filter(|entry| entry.id == band)
                .count()
                != 1
            {
                add(
                    "difficultyStandards",
                    "Configure exactly one Lower A1, Typical A1 and Upper A1 difficulty profile.",
                );
                break;
            }
        }
        if !registry
            .exercise_template_schemas
            .contains_key(&rule.exercise_type)
        {
            add(
                "exerciseType",
                "Save this draft to pin its exercise template schema before publication.",
            );
        }
        if let Some(schema) = registry.exercise_template_schemas.get(&rule.exercise_type) {
            if !schema.get("x-exercise-template").is_some_and(|definition| {
                definition.get("fields").is_some_and(Value::is_array)
                    && definition.get("projection").is_some_and(Value::is_object)
            }) {
                add(
                    "exerciseType",
                    "The pinned exercise definition must include its field schema and candidate projection policy.",
                );
            }
            let mut partial_schema = schema.clone();
            if let Some(object) = partial_schema.as_object_mut() {
                object.remove("required");
            }
            let mut default_issues = vec![];
            super::exercise_schema::validate(
                &partial_schema,
                &json!(rule.defaults),
                "defaults",
                &mut default_issues,
            );
            for (_, message) in default_issues {
                add("defaults", &message);
            }
        }
    }
    issues
}

pub fn default_data(registry: &RegistrySnapshot, rule: &ExerciseTemplateRule) -> Value {
    let mut value = registry
        .exercise_template_schemas
        .get(&rule.exercise_type)
        .map(super::exercise_schema::initial_value)
        .unwrap_or_else(|| json!({}));
    if let Some(object) = value.as_object_mut() {
        object.extend(rule.defaults.clone());
        object.insert("type".into(), json!(rule.exercise_type));
        if object
            .get("language")
            .and_then(Value::as_str)
            .is_none_or(|language| language.trim().is_empty())
        {
            object.insert("language".into(), json!("zh-CN"));
        }
        object.entry("level".to_string()).or_insert(json!("A1"));
    }
    value
}

pub fn refresh_package(
    package: &mut TaskPackage,
    registry: &RegistrySnapshot,
) -> Result<(), String> {
    let Some(kind) = exercise_type(&package.item_format_id) else {
        return Ok(());
    };
    let source = package
        .authoring_package
        .exercise_template
        .as_ref()
        .ok_or_else(|| "The complete exercise content is missing.".to_string())?;
    if source.exercise_type != kind {
        return Err("The authored exercise type does not match the fixed template.".into());
    }
    let projected = project_candidate_for_registry(source, registry)?;
    package.candidate_payload = CandidatePayload::ExerciseTemplate(projected);
    let rule = rule_for(registry, package)
        .ok_or_else(|| "The pinned exercise template rule is unavailable.".to_string())?;
    package.scoring_package.correct_option_id = None;
    package.scoring_package.correct_matches.clear();
    package.scoring_package.accepted_responses.clear();
    package.scoring_package.answer_key_ref = Some("authoringPackage.exerciseTemplate.data".into());
    let units = scoring_units(registry, rule, source);
    package.scoring_package.scoring_points = units
        .into_iter()
        .map(|(id, description)| ScoringPoint {
            scoring_point_id: id,
            description,
            points: 1,
            normalization_policy_id: Some(format!("exercise:{}:normalization", rule.id)),
        })
        .collect();
    package.scoring_package.max_raw_score =
        u16::try_from(package.scoring_package.scoring_points.len())
            .map_err(|_| "The exercise has too many scoring units.".to_string())?;
    package.scoring_package.task_specific_criteria = vec![rule.scoring.criteria.clone()];
    package.scoring_package.rubric_id =
        (rule.scoring.method == "analyticRubric").then(|| format!("exercise:{}:rubric", rule.id));
    package.scoring_package.benchmark_set_version = package
        .scoring_package
        .rubric_id
        .as_ref()
        .map(|_| "NotCalibrated".into());
    Ok(())
}

fn scoring_units(
    registry: &RegistrySnapshot,
    rule: &ExerciseTemplateRule,
    source: &ExerciseTemplateContent,
) -> Vec<(String, String)> {
    if rule.scoring.method == "perResponse" {
        let definition = registry
            .exercise_template_schemas
            .get(&source.exercise_type)
            .and_then(|schema| schema.get("x-exercise-template"))
            .and_then(|descriptor| descriptor.get("responseUnits"));
        let mode = definition
            .and_then(|value| value.get("mode"))
            .and_then(Value::as_str);
        let entries = definition
            .and_then(|value| value.get("path"))
            .and_then(Value::as_str)
            .and_then(|path| source.data.get(path))
            .and_then(Value::as_array);
        let count = match (mode, entries) {
            (Some("rows"), Some(rows)) => rows.len(),
            (Some("nestedAnswers"), Some(rows)) => rows
                .iter()
                .filter_map(|row| row.get("answers").and_then(Value::as_array))
                .map(Vec::len)
                .sum(),
            _ => 1,
        };
        if count > 0 {
            return (0..count)
                .map(|index| {
                    (
                        format!("SP-RESPONSE-{}", index + 1),
                        format!("Response {}: {}", index + 1, rule.scoring.criteria),
                    )
                })
                .collect();
        }
    }
    vec![("SP-TEMPLATE".into(), rule.scoring.criteria.clone())]
}

/// Response units follow each source task's response structure, not arbitrary arrays.
fn response_unit_definition(kind: &str) -> Value {
    let path = match kind {
        "fill-in-blanks" => return json!({"mode":"nestedAnswers","path":"items"}),
        "sentence-completion"
        | "image-label"
        | "reading-sentence-completion"
        | "listen-and-choose-picture"
        | "highlight-correct-summary"
        | "listening-matching"
        | "categorize" => "items",
        "multiple-choice"
        | "listening"
        | "short-answer-questions"
        | "listening-short-answer-questions"
        | "highlight-the-answer"
        | "multiple-choice-single-answer"
        | "respond-using-information" => "questions",
        "match-columns" => "pairs",
        "dictation" => "segments",
        "vocabulary-recognition" => "words",
        "choose-the-word" | "word-formation" | "listening-fill-in-blanks" => "blanks",
        "matching-headings" => "sections",
        "identify-information" => "statements",
        "matching-sentence-endings" => "starters",
        "listen-and-respond" => "turns",
        "diagram-label" | "listening-diagram-label" => "labels",
        "drag-to-complete" => "answers",
        _ => return json!({"mode":"whole"}),
    };
    json!({"mode":"rows","path":path})
}

pub fn package_issues(package: &TaskPackage, registry: &RegistrySnapshot) -> Vec<ValidationIssue> {
    let mut problems: Vec<(String, String)> = vec![];
    if let Some(source) = &package.authoring_package.exercise_template {
        if source
            .data
            .get("title")
            .and_then(Value::as_str)
            .is_none_or(|title| title.trim().is_empty())
        {
            problems.push((
                "authoringPackage.exerciseTemplate.data.title".into(),
                "An exercise title is required.".into(),
            ));
        }
        if exercise_type(&package.item_format_id) != Some(source.exercise_type.as_str()) {
            problems.push((
                "authoringPackage.exerciseTemplate.exerciseType".into(),
                "Exercise type does not match the fixed template.".into(),
            ));
        }
        match registry
            .exercise_template_schemas
            .get(&source.exercise_type)
        {
            Some(schema) => super::exercise_schema::validate(
                schema,
                &source.data,
                "authoringPackage.exerciseTemplate.data",
                &mut problems,
            ),
            None => problems.push((
                "authoringPackage.exerciseTemplate".into(),
                "The pinned exercise schema is unavailable.".into(),
            )),
        }
        validate_answer_references(
            &source.data,
            "authoringPackage.exerciseTemplate.data",
            &mut problems,
        );
        match project_candidate_for_registry(source, registry) {
            Ok(expected)
                if serde_json::to_value(&expected).ok()
                    == serde_json::to_value(&package.candidate_payload).ok() => {}
            Ok(_) => problems.push((
                "candidatePayload".into(),
                "Candidate content does not match the safe projection of the authored exercise."
                    .into(),
            )),
            Err(message) => problems.push(("candidatePayload".into(), message)),
        }
        let mut canonical = package.clone();
        if refresh_package(&mut canonical, registry).is_ok()
            && serde_json::to_value(&canonical.scoring_package).ok()
                != serde_json::to_value(&package.scoring_package).ok()
        {
            problems.push((
                "scoringPackage".into(),
                "Scoring must match the exercise's pinned configuration and response units.".into(),
            ));
        }
    } else {
        problems.push((
            "authoringPackage.exerciseTemplate".into(),
            "The complete authored exercise is required.".into(),
        ));
    }
    problems
        .into_iter()
        .map(|(path, message)| ValidationIssue {
            severity: "error".into(),
            code: "exerciseTemplate.content".into(),
            path,
            rule_ref: "exerciseTemplate.schema".into(),
            message,
        })
        .collect()
}

fn validate_answer_references(value: &Value, path: &str, problems: &mut Vec<(String, String)>) {
    match value {
        Value::Object(object) => {
            if let Some(options) = object.get("options").and_then(Value::as_array) {
                for key in ["correct", "correctIndex", "correctIndices"] {
                    if let Some(answer) = object.get(key) {
                        let indices = answer
                            .as_array()
                            .cloned()
                            .unwrap_or_else(|| vec![answer.clone()]);
                        // Some source schemas use textual answers rather than option indices.
                        if indices.iter().all(Value::is_number) {
                            let mut seen = HashSet::new();
                            if indices.iter().any(|index| {
                                index.as_u64().is_none_or(|index| {
                                    index >= options.len() as u64 || !seen.insert(index)
                                })
                            }) {
                                problems.push((
                                    format!("{path}.{key}"),
                                    "Each correct answer index must identify a distinct existing option."
                                        .into(),
                                ));
                            }
                        }
                    }
                }
            }
            for (key, child) in object {
                validate_answer_references(child, &format!("{path}.{key}"), problems);
            }
        }
        Value::Array(values) => {
            for (index, child) in values.iter().enumerate() {
                validate_answer_references(child, &format!("{path}[{index}]"), problems);
            }
        }
        _ => {}
    }
}

#[cfg(test)]
#[path = "exercise_templates_tests.rs"]
mod tests;

#[cfg(test)]
pub fn project_candidate(
    source: &ExerciseTemplateContent,
) -> Result<ExerciseTemplateContent, String> {
    let entry = template(&source.exercise_type).ok_or("Unknown exercise template.")?;
    project_with_definition(source, entry)
}

pub fn project_candidate_for_registry(
    source: &ExerciseTemplateContent,
    registry: &RegistrySnapshot,
) -> Result<ExerciseTemplateContent, String> {
    let definition = registry
        .exercise_template_schemas
        .get(&source.exercise_type)
        .and_then(|schema| schema.get("x-exercise-template"))
        .ok_or("The pinned candidate projection definition is unavailable.")?;
    project_with_definition(source, definition)
}

fn project_with_definition(
    source: &ExerciseTemplateContent,
    entry: &Value,
) -> Result<ExerciseTemplateContent, String> {
    let policy = entry
        .get("projection")
        .ok_or("The exercise has no candidate privacy policy.")?;
    let fields = entry
        .get("fields")
        .and_then(Value::as_array)
        .ok_or("The exercise fields are unavailable.")?;
    let mut data = serde_json::Map::new();
    for field in fields {
        if let Some(key) = field.get("key").and_then(Value::as_str)
            && let Some(value) = source.data.get(key)
            && let Some(projected) = project_field(field, value, key, policy)
        {
            data.insert(key.into(), projected);
        }
    }
    let strings = |values: Vec<Value>| {
        let mut values: Vec<String> = values
            .iter()
            .map(|value| value.as_str().unwrap_or_default().to_string())
            .collect();
        values.sort_by_cached_key(|value| value.encode_utf16().collect::<Vec<_>>());
        json!(values)
    };
    let list = |key: &str| {
        source
            .data
            .get(key)
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
    };
    match policy
        .get("transform")
        .and_then(Value::as_str)
        .unwrap_or("none")
    {
        "independent-columns" => {
            let pairs = list("pairs");
            data.insert(
                "leftItems".into(),
                json!(
                    pairs
                        .iter()
                        .map(|pair| pair.get("left").and_then(Value::as_str).unwrap_or_default())
                        .collect::<Vec<_>>()
                ),
            );
            let mut right: Vec<Value> = pairs
                .iter()
                .map(|pair| pair.get("right").cloned().unwrap_or(json!("")))
                .collect();
            right.extend(list("distractors"));
            data.insert("rightItems".into(), strings(right));
        }
        "unordered-items" => {
            data.insert("items".into(), strings(list("items")));
        }
        "unordered-words" => {
            data.insert("words".into(), strings(list("words")));
        }
        "unordered-categories" => {
            if let Some(Value::Array(items)) = data.get_mut("items") {
                items.sort_by_cached_key(|value| {
                    value
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .encode_utf16()
                        .collect::<Vec<_>>()
                });
            }
        }
        "masked-letters" => {
            let text = source
                .data
                .get("text")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let pattern = regex::Regex::new(r"\{([^|{}]+)\|(\d+)\}").expect("fixed pattern");
            let masked = pattern.replace_all(text, |captures: &regex::Captures<'_>| {
                let word: Vec<char> = captures[1].chars().collect();
                let given = captures[2]
                    .parse::<usize>()
                    .unwrap_or(usize::MAX)
                    .min(word.len());
                word[..given].iter().collect::<String>() + &"_".repeat(word.len() - given)
            });
            data.insert("text".into(), json!(masked));
        }
        "blank-count" => {
            data.insert("responseCount".into(), json!(list("blanks").len()));
        }
        "label-count" => {
            data.insert("responseCount".into(), json!(list("labels").len()));
        }
        "none" => {}
        _ => return Err("The exercise candidate privacy policy is unsupported.".into()),
    }
    Ok(ExerciseTemplateContent {
        exercise_type: source.exercise_type.clone(),
        body: source.body.clone(),
        data: Value::Object(data),
    })
}

fn project_field(field: &Value, value: &Value, path: &str, policy: &Value) -> Option<Value> {
    if policy
        .get("privatePaths")
        .and_then(Value::as_array)
        .is_some_and(|paths| paths.iter().any(|entry| entry.as_str() == Some(path)))
    {
        return None;
    }
    match field.get("type").and_then(Value::as_str) {
        Some("object") => {
            let mut result = serde_json::Map::new();
            if let Some(children) = field.get("properties").and_then(Value::as_array) {
                for child in children {
                    if let Some(key) = child.get("key").and_then(Value::as_str)
                        && let Some(value) = value.get(key)
                        && let Some(projected) =
                            project_field(child, value, &format!("{path}.{key}"), policy)
                    {
                        result.insert(key.into(), projected);
                    }
                }
            }
            if value.get("correct").is_some_and(Value::is_array) {
                result.insert("responseMode".into(), json!("multiple"));
            }
            Some(Value::Object(result))
        }
        Some("array") => Some(Value::Array(
            value
                .as_array()
                .map(|array| {
                    array
                        .iter()
                        .map(|value| {
                            field
                                .get("element")
                                .and_then(|element| {
                                    project_field(element, value, &format!("{path}.*"), policy)
                                })
                                .unwrap_or(Value::Null)
                        })
                        .collect()
                })
                .unwrap_or_default(),
        )),
        Some("union") => field
            .get("variants")
            .and_then(Value::as_array)
            .and_then(|variants| {
                variants.iter().find(
                    |variant| match variant.get("type").and_then(Value::as_str) {
                        Some("array") => value.is_array(),
                        Some("object") => value.is_object(),
                        Some("integer" | "number") => value.is_number(),
                        Some("boolean") => value.is_boolean(),
                        Some("string") => value.is_string(),
                        _ => false,
                    },
                )
            })
            .and_then(|variant| project_field(variant, value, path, policy)),
        _ => (!value.is_array() && !value.is_object()).then(|| value.clone()),
    }
}
