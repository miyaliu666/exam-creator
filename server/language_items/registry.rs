use std::collections::HashMap;

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::domain::DeliveryPolicyRefs;

const MANIFEST: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/manifest.json"
));
const SINGLE_SELECT_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/single-select.schema.json"
));
const MATCHING_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/matching.schema.json"
));
const RESTRICTED_INPUT_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/restricted-input.schema.json"
));
const FORM_ENTRY_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/form-entry.schema.json"
));
const TYPED_MESSAGE_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/typed-message.schema.json"
));
const SPOKEN_SINGLE_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/spoken-single.schema.json"
));
const SPOKEN_MULTITURN_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/schemas/spoken-multiturn.schema.json"
));
const TASK_PACKAGE_SCHEMA: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/contracts/language-item-task-package-v0.1.schema.json"
));
const CHARACTER_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-character-registry-v0.2-provisional.yaml"
));
const LEXICON_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-lexicon-registry-v0.1-provisional.yaml"
));
const GRAMMAR_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-grammar-registry-v0.2-provisional.yaml"
));
const PRAGMATICS_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-pragmatics-registry-v0.2-provisional.yaml"
));
const SUPPORTED_CONTENT_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-supported-content-registry-v0.2-provisional.yaml"
));
const CONTEXT_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/construct/a1-context-registry-v0.2-provisional.yaml"
));
const CAN_DO_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/construct/a1-can-do-registry-v0.2-provisional.yaml"
));
const SLOT_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/blueprint/a1-slot-registry-v0.2-provisional.yaml"
));
const SCORING_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/scoring/a1-scoring-registry-v0.2-provisional.yaml"
));
const TASK_FAMILY_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/formats/a1-task-family-registry-v0.2-provisional.yaml"
));
const REFERENCE_TASK_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/references/a1-reference-task-registry-v0.2-provisional.yaml"
));
const RENDERER_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/formats/a1-renderer-registry-v0.2-provisional.yaml"
));

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    bundle_version: String,
    status: String,
    limitations: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchCapability {
    pub blueprint_slot_id: String,
    pub title: String,
    pub task_family_id: String,
    pub item_format_id: String,
    pub renderer_id: String,
    pub scoring_contract_template_id: String,
    pub primary_can_do_id: String,
    pub supporting_can_do_ids: Vec<String>,
    pub primary_reported_skill: String,
    pub communicative_activity: String,
    pub communicative_activities: Vec<String>,
    pub allowed_domains: Vec<String>,
    pub allowed_context_ids: Vec<String>,
    pub observable_evidence: String,
    pub a1_boundary: String,
    pub task_family_core_behavior: String,
    pub task_structure: String,
    pub prohibited_uses: Vec<String>,
    pub reference_task: String,
    pub invalid_reference_task: String,
    pub authoring_readiness: String,
    pub staging_readiness: String,
    pub renderer_implementation_status: String,
    pub renderer_required_work: Vec<String>,
    pub delivery_policy_refs: DeliveryPolicyRefs,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIdOption {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub can_do_ids: Vec<String>,
    pub context_ids: Vec<String>,
    pub mastery_scope: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryLabelOption {
    pub id: String,
    pub label: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringPolicySummary {
    pub policy_id: String,
    pub summary: String,
    pub details: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringContractSummary {
    pub scoring_contract_template_id: String,
    pub template_version: String,
    pub blueprint_slot_id: String,
    pub item_format_id: String,
    pub scoring_type: String,
    pub normalization: ScoringPolicySummary,
    pub partial_credit: ScoringPolicySummary,
    pub rubric_id: String,
    pub invalid_response: ScoringPolicySummary,
    pub technical_incident: ScoringPolicySummary,
    pub adjudication: ScoringPolicySummary,
    pub rater_qualification: ScoringPolicySummary,
    pub task_specific_requirements: Vec<String>,
    pub cap_or_exclusion: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextOption {
    pub id: String,
    pub label: String,
    pub primary_domains: Vec<String>,
    pub can_do_ids: Vec<String>,
    pub scope: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySnapshot {
    pub bundle_version: String,
    pub status: String,
    pub limitations: Vec<String>,
    pub source_fingerprint: String,
    pub capabilities: Vec<WorkbenchCapability>,
    pub candidate_schemas: Vec<Value>,
    pub task_package_schema: Value,
    pub allowed_domains: Vec<String>,
    pub difficulty_bands: Vec<String>,
    pub content_id_options: Vec<ContentIdOption>,
    pub context_options: Vec<ContextOption>,
    pub can_do_options: Vec<RegistryLabelOption>,
    pub scoring_contracts: Vec<ScoringContractSummary>,
    pub required_review_gate_ids: Vec<String>,
}

pub static REGISTRY: Lazy<RegistrySnapshot> = Lazy::new(|| {
    let manifest: Manifest = serde_json::from_str(MANIFEST).expect("valid A1 registry manifest");
    let candidate_schemas: Vec<Value> = [
        SINGLE_SELECT_SCHEMA,
        MATCHING_SCHEMA,
        RESTRICTED_INPUT_SCHEMA,
        FORM_ENTRY_SCHEMA,
        TYPED_MESSAGE_SCHEMA,
        SPOKEN_SINGLE_SCHEMA,
        SPOKEN_MULTITURN_SCHEMA,
    ]
    .into_iter()
    .map(|source| serde_json::from_str(source).expect("valid candidate JSON schema"))
    .collect();
    let task_package_schema: Value =
        serde_json::from_str(TASK_PACKAGE_SCHEMA).expect("valid TaskPackage JSON schema");
    assert_eq!(manifest.bundle_version, "0.2-provisional");
    assert_eq!(
        candidate_schemas[0].get("$id").and_then(Value::as_str),
        Some("urn:fcc:a1:single-select:0.2")
    );
    assert_eq!(
        task_package_schema.get("$id").and_then(Value::as_str),
        Some("urn:fcc:exam-creator:language-item-task-package:0.1")
    );

    let mut content_id_options = Vec::new();
    content_id_options.extend(content_ids(
        LEXICON_REGISTRY,
        "lexicalId",
        "lexical",
        &["form", "meaningInScope"],
    ));
    content_id_options.extend(content_ids(
        CHARACTER_REGISTRY,
        "characterId",
        "character",
        &["form"],
    ));
    content_id_options.extend(content_ids(
        GRAMMAR_REGISTRY,
        "grammarId",
        "grammar",
        &["function", "pattern"],
    ));
    content_id_options.extend(content_ids(
        PRAGMATICS_REGISTRY,
        "pragmaticFunctionId",
        "pragmatics",
        &["title", "function"],
    ));
    content_id_options.extend(content_ids(
        SUPPORTED_CONTENT_REGISTRY,
        "supportedContentTypeId",
        "supported",
        &["type", "rule"],
    ));
    let context_options = context_options(CONTEXT_REGISTRY);
    let can_do_options = label_options(CAN_DO_REGISTRY, "canDoId", &["title"]);

    RegistrySnapshot {
        bundle_version: manifest.bundle_version,
        status: manifest.status,
        limitations: manifest.limitations,
        source_fingerprint: "a1-registry:0.2-provisional:authoring-contracts-0.4".to_string(),
        capabilities: capabilities(),
        candidate_schemas,
        task_package_schema,
        allowed_domains: ["Personal", "Public", "Educational", "Occupational"]
            .into_iter()
            .map(str::to_string)
            .collect(),
        difficulty_bands: ["LowerA1", "TypicalA1", "UpperA1"]
            .into_iter()
            .map(str::to_string)
            .collect(),
        content_id_options,
        context_options,
        can_do_options,
        scoring_contracts: scoring_contracts(),
        required_review_gate_ids: [
            "editorial",
            "constructAndLevel",
            "content",
            "scoring",
            "fairnessAccessibility",
            "technicalSecurity",
        ]
        .into_iter()
        .map(str::to_string)
        .collect(),
    }
});

fn capabilities() -> Vec<WorkbenchCapability> {
    let slot_anchors = list_anchors(SLOT_REGISTRY);
    let can_do_details: HashMap<_, _> = entry_blocks(CAN_DO_REGISTRY, "canDoId")
        .into_iter()
        .map(|(id, block)| {
            let evidence = block_scalar(&block, &["observableEvidence"]).unwrap_or_default();
            let boundary = block_scalar(&block, &["boundary"]).unwrap_or_default();
            (id, (evidence, boundary))
        })
        .collect();
    let task_family_details: HashMap<_, _> = entry_blocks(TASK_FAMILY_REGISTRY, "taskFamilyId")
        .into_iter()
        .map(|(id, block)| {
            (
                id,
                (
                    block_scalar(&block, &["coreBehavior"]).unwrap_or_default(),
                    block_list(&block, "prohibitedUses", &HashMap::new()),
                ),
            )
        })
        .collect();
    let reference_tasks: HashMap<_, _> = entry_blocks(REFERENCE_TASK_REGISTRY, "slot")
        .into_iter()
        .map(|(slot_id, block)| {
            (
                slot_id,
                (
                    block_scalar(&block, &["valid"]).unwrap_or_default(),
                    block_scalar(&block, &["invalid"]).unwrap_or_default(),
                ),
            )
        })
        .collect();
    let scoring_by_slot_and_format: HashMap<_, _> =
        entry_blocks(SCORING_REGISTRY, "scoringContractTemplateId")
            .into_iter()
            .filter_map(|(id, block)| {
                Some((
                    (
                        block_scalar(&block, &["blueprintSlotId"])?,
                        block_scalar(&block, &["itemFormatId"])?,
                    ),
                    id,
                ))
            })
            .collect();
    let renderer_details: HashMap<_, _> = entry_blocks(RENDERER_REGISTRY, "rendererId")
        .into_iter()
        .map(|(renderer_id, block)| {
            (
                renderer_id,
                (
                    block_scalar(&block, &["status"]).unwrap_or_default(),
                    block_list(&block, "requiredWork", &HashMap::new()),
                ),
            )
        })
        .collect();

    let mut result = Vec::new();
    for (slot_id, block) in entry_blocks(SLOT_REGISTRY, "blueprintSlotId") {
        let title = block_scalar(&block, &["title"]).unwrap_or_else(|| slot_id.clone());
        let task_family_id = block_scalar(&block, &["taskFamilyId"]).unwrap_or_default();
        let primary_can_do_id = block_scalar(&block, &["primaryCanDoId"]).unwrap_or_default();
        let supporting_can_do_ids = block_list(&block, "supportingCanDoIds", &slot_anchors);
        let primary_reported_skill =
            block_scalar(&block, &["primaryReportedSkill"]).unwrap_or_default();
        let communicative_activities = block_list(&block, "communicativeActivities", &slot_anchors);
        let communicative_activity = communicative_activities
            .first()
            .cloned()
            .unwrap_or_default();
        let allowed_domains = block_list(&block, "allowedDomains", &slot_anchors);
        let allowed_context_ids = block_list(&block, "allowedContextIds", &slot_anchors);
        let (observable_evidence, a1_boundary) = can_do_details
            .get(&primary_can_do_id)
            .cloned()
            .unwrap_or_default();
        let (task_family_core_behavior, prohibited_uses) = task_family_details
            .get(&task_family_id)
            .cloned()
            .unwrap_or_default();
        let (reference_task, invalid_reference_task) =
            reference_tasks.get(&slot_id).cloned().unwrap_or_default();

        for item_format_id in block_list(&block, "allowedItemFormatIds", &slot_anchors) {
            let Some((renderer_id, task_structure)) = implementation_for(&item_format_id) else {
                continue;
            };
            let Some(scoring_contract_template_id) = scoring_by_slot_and_format
                .get(&(slot_id.clone(), item_format_id.clone()))
                .cloned()
            else {
                continue;
            };
            let delivery_policy_refs = delivery_policy_for(&slot_id, &item_format_id);
            let (renderer_implementation_status, renderer_required_work) = renderer_details
                .get(renderer_id)
                .cloned()
                .unwrap_or_default();
            result.push(WorkbenchCapability {
                blueprint_slot_id: slot_id.clone(),
                title: title.clone(),
                task_family_id: task_family_id.clone(),
                item_format_id,
                renderer_id: renderer_id.to_string(),
                scoring_contract_template_id,
                primary_can_do_id: primary_can_do_id.clone(),
                supporting_can_do_ids: supporting_can_do_ids.clone(),
                primary_reported_skill: primary_reported_skill.clone(),
                communicative_activity: communicative_activity.clone(),
                communicative_activities: communicative_activities.clone(),
                allowed_domains: allowed_domains.clone(),
                allowed_context_ids: allowed_context_ids.clone(),
                observable_evidence: observable_evidence.clone(),
                a1_boundary: a1_boundary.clone(),
                task_family_core_behavior: task_family_core_behavior.clone(),
                task_structure: task_structure.to_string(),
                prohibited_uses: prohibited_uses.clone(),
                reference_task: reference_task.clone(),
                invalid_reference_task: invalid_reference_task.clone(),
                authoring_readiness: "Available".to_string(),
                staging_readiness: "CanonicalPackageAvailable".to_string(),
                renderer_implementation_status,
                renderer_required_work,
                delivery_policy_refs,
            });
        }
    }
    result
}

fn delivery_policy_for(slot_id: &str, item_format_id: &str) -> DeliveryPolicyRefs {
    DeliveryPolicyRefs {
        navigation_policy_id: if slot_id.starts_with("L-") {
            "NAV-FORWARD-TASK-v0.1"
        } else if slot_id.starts_with("S-") {
            "NAV-FORWARD-RECORDING-v0.1"
        } else {
            "NAV-REVIEW-WITHIN-MODULE-v0.1"
        }
        .to_string(),
        input_policy_id: if item_format_id == "IF-RESTRICTED-INPUT" {
            "INPUT-RESTRICTED-FIELD-v0.1"
        } else if slot_id.starts_with("W-") {
            "INPUT-EXAM-STANDARDIZED-PINYIN-v0.1"
        } else {
            "notApplicable"
        }
        .to_string(),
        playback_policy_id: if slot_id.starts_with("L-") {
            "PLAY-COMPLETE-TWICE-v0.1"
        } else {
            "notApplicable"
        }
        .to_string(),
        recording_policy_id: if matches!(slot_id, "S-A1-1" | "S-A1-3") {
            "REC-MULTITURN-A1-v0.1"
        } else if slot_id.starts_with("S-") {
            "REC-SINGLE-A1-v0.1"
        } else {
            "notApplicable"
        }
        .to_string(),
        speaking_rate_profile_id: if slot_id.starts_with('L') || slot_id.starts_with('S') {
            "RATE-A1-CLEAR-SLOW-v0.1"
        } else {
            "notApplicable"
        }
        .to_string(),
        pause_profile_id: if matches!(slot_id, "L-A1-2" | "S-A1-1" | "S-A1-3") {
            "PAUSE-A1-DIALOGUE-v0.1"
        } else if slot_id.starts_with('L') || slot_id.starts_with('S') {
            "PAUSE-A1-SENTENCE-v0.1"
        } else {
            "notApplicable"
        }
        .to_string(),
    }
}

fn implementation_for(item_format_id: &str) -> Option<(&'static str, &'static str)> {
    match item_format_id {
        "IF-SINGLE-SELECT" => Some(("REN-SINGLE-SELECT", "一份材料、一个问题和至少两个选项。")),
        "IF-MATCHING" => Some(("REN-MATCHING", "至少两项左侧材料与右侧答案进行匹配。")),
        "IF-RESTRICTED-INPUT" => {
            Some(("REN-RESTRICTED-INPUT", "读取或听取短材料，并填写直接信息。"))
        }
        "IF-FORM-ENTRY" => Some(("REN-FORM-ENTRY", "填写 4–6 个简短表单字段。")),
        "IF-TYPED-MESSAGE" => Some((
            "REN-TYPED-MESSAGE",
            "按收件人、目的和内容点写一条简短消息。",
        )),
        "IF-SPOKEN-SINGLE" => Some((
            "REN-SPOKEN-SINGLE",
            "按可见提示或音频提示完成一段简短口语表达。",
        )),
        "IF-SPOKEN-MULTITURN" => Some((
            "REN-SPOKEN-MULTITURN",
            "考官与考生按固定路径完成至少一问一答。",
        )),
        _ => None,
    }
}

fn scoring_contracts() -> Vec<ScoringContractSummary> {
    let normalization_rules = section_entry_blocks(
        SCORING_REGISTRY,
        "normalizationRules",
        "normalizationRuleId",
    )
    .into_iter()
    .map(|(id, block)| {
        let mut details = block_list(&block, "allowedProcessing", &HashMap::new())
            .into_iter()
            .map(|rule| format!("允许：{rule}"))
            .collect::<Vec<_>>();
        details.extend(
            block_list(&block, "prohibitedProcessing", &HashMap::new())
                .into_iter()
                .map(|rule| format!("禁止：{rule}")),
        );
        (
            id.clone(),
            ScoringPolicySummary {
                policy_id: id,
                summary: block_scalar(&block, &["scope"]).unwrap_or_default(),
                details,
            },
        )
    })
    .collect::<HashMap<_, _>>();
    let partial_credit_policies = section_entry_blocks(
        SCORING_REGISTRY,
        "partialCreditPolicies",
        "partialCreditPolicyId",
    )
    .into_iter()
    .map(|(id, block)| {
        (
            id.clone(),
            ScoringPolicySummary {
                policy_id: id,
                summary: block_scalar(&block, &["rule"]).unwrap_or_default(),
                details: Vec::new(),
            },
        )
    })
    .collect::<HashMap<_, _>>();
    let invalid_response_policies = section_entry_blocks(
        SCORING_REGISTRY,
        "invalidResponsePolicies",
        "invalidResponsePolicyId",
    )
    .into_iter()
    .map(|(id, block)| {
        (
            id.clone(),
            ScoringPolicySummary {
                policy_id: id,
                summary: "无效作答按合同统一处理".to_string(),
                details: block_map(&block, "rules")
                    .into_iter()
                    .map(|(condition, result)| format!("{condition}: {result}"))
                    .collect(),
            },
        )
    })
    .collect::<HashMap<_, _>>();
    let technical_block = section_block(SCORING_REGISTRY, "technicalIncidentPolicy");
    let technical_policy = ScoringPolicySummary {
        policy_id: block_scalar(&technical_block, &["technicalIncidentPolicyId"])
            .unwrap_or_default(),
        summary: block_scalar(&technical_block, &["rule"]).unwrap_or_default(),
        details: block_list(&technical_block, "statuses", &HashMap::new()),
    };
    let adjudication_policies = section_entry_blocks(
        SCORING_REGISTRY,
        "adjudicationPolicies",
        "adjudicationPolicyId",
    )
    .into_iter()
    .map(|(id, block)| {
        (
            id.clone(),
            ScoringPolicySummary {
                policy_id: id,
                summary: block_scalar(&block, &["scope"]).unwrap_or_default(),
                details: block_list(&block, "triggers", &HashMap::new()),
            },
        )
    })
    .collect::<HashMap<_, _>>();
    let rater_block = section_block(SCORING_REGISTRY, "raterQualificationPolicy");
    let rater_policy = ScoringPolicySummary {
        policy_id: block_scalar(&rater_block, &["raterQualificationPolicyId"]).unwrap_or_default(),
        summary: block_scalar(&rater_block, &["status"]).unwrap_or_default(),
        details: block_scalar(&rater_block, &["benchmarkSetVersion"])
            .map(|version| vec![format!("benchmarkSetVersion: {version}")])
            .unwrap_or_default(),
    };
    let task_specific_criteria =
        section_entry_blocks(SCORING_REGISTRY, "taskSpecificCriteria", "blueprintSlotId")
            .into_iter()
            .map(|(slot_id, block)| {
                (
                    slot_id,
                    (
                        block_list(&block, "requirements", &HashMap::new()),
                        block_scalar(&block, &["capOrExclusion"]),
                    ),
                )
            })
            .collect::<HashMap<_, _>>();

    section_entry_blocks(
        SCORING_REGISTRY,
        "scoringContractTemplates",
        "scoringContractTemplateId",
    )
    .into_iter()
    .map(|(id, block)| {
        let blueprint_slot_id = block_scalar(&block, &["blueprintSlotId"]).unwrap_or_default();
        let normalization_rule_id =
            block_scalar(&block, &["normalizationRuleId"]).unwrap_or_default();
        let partial_credit_policy_id =
            block_scalar(&block, &["partialCreditPolicyId"]).unwrap_or_default();
        let invalid_response_policy_id =
            block_scalar(&block, &["invalidResponsePolicyId"]).unwrap_or_default();
        let adjudication_policy_id =
            block_scalar(&block, &["adjudicationPolicyId"]).unwrap_or_default();
        let rater_qualification_policy_id =
            block_scalar(&block, &["raterQualificationPolicyId"]).unwrap_or_default();
        let (task_specific_requirements, cap_or_exclusion) = task_specific_criteria
            .get(&blueprint_slot_id)
            .cloned()
            .unwrap_or_default();

        ScoringContractSummary {
            scoring_contract_template_id: id,
            template_version: block_scalar(&block, &["templateVersion"]).unwrap_or_default(),
            blueprint_slot_id,
            item_format_id: block_scalar(&block, &["itemFormatId"]).unwrap_or_default(),
            scoring_type: block_scalar(&block, &["scoringType"]).unwrap_or_default(),
            normalization: policy_or_not_applicable(&normalization_rule_id, &normalization_rules),
            partial_credit: policy_or_not_applicable(
                &partial_credit_policy_id,
                &partial_credit_policies,
            ),
            rubric_id: block_scalar(&block, &["rubricId"]).unwrap_or_default(),
            invalid_response: policy_or_not_applicable(
                &invalid_response_policy_id,
                &invalid_response_policies,
            ),
            technical_incident: technical_policy.clone(),
            adjudication: policy_or_not_applicable(&adjudication_policy_id, &adjudication_policies),
            rater_qualification: if rater_qualification_policy_id == "notApplicable" {
                not_applicable_policy()
            } else {
                rater_policy.clone()
            },
            task_specific_requirements,
            cap_or_exclusion,
            status: block_scalar(&block, &["status"]).unwrap_or_default(),
        }
    })
    .collect()
}

fn policy_or_not_applicable(
    policy_id: &str,
    policies: &HashMap<String, ScoringPolicySummary>,
) -> ScoringPolicySummary {
    if policy_id == "notApplicable" {
        return not_applicable_policy();
    }
    policies
        .get(policy_id)
        .cloned()
        .unwrap_or_else(|| ScoringPolicySummary {
            policy_id: policy_id.to_string(),
            summary: "评分策略详情缺失".to_string(),
            details: Vec::new(),
        })
}

fn not_applicable_policy() -> ScoringPolicySummary {
    ScoringPolicySummary {
        policy_id: "notApplicable".to_string(),
        summary: "不适用".to_string(),
        details: Vec::new(),
    }
}

fn content_ids(source: &str, key: &str, kind: &str, label_keys: &[&str]) -> Vec<ContentIdOption> {
    let anchors = list_anchors(source);
    entry_blocks(source, key)
        .into_iter()
        .map(|(id, block)| ContentIdOption {
            label: block_scalar(&block, label_keys).unwrap_or_else(|| id.clone()),
            can_do_ids: block_list(&block, "canDoIds", &anchors),
            context_ids: block_list(&block, "contextIds", &anchors),
            mastery_scope: block_scalar(&block, &["masteryScope"]),
            id,
            kind: kind.to_string(),
        })
        .collect()
}

fn context_options(source: &str) -> Vec<ContextOption> {
    let anchors = list_anchors(source);
    entry_blocks(source, "contextId")
        .into_iter()
        .map(|(id, block)| ContextOption {
            label: block_scalar(&block, &["title"]).unwrap_or_else(|| id.clone()),
            primary_domains: block_scalar(&block, &["primaryDomain"])
                .unwrap_or_default()
                .split('/')
                .map(str::trim)
                .filter(|entry| !entry.is_empty())
                .map(str::to_string)
                .collect(),
            can_do_ids: block_list(&block, "canDoIds", &anchors),
            scope: block_scalar(&block, &["scope"]).unwrap_or_default(),
            id,
        })
        .collect()
}

fn label_options(source: &str, key: &str, label_keys: &[&str]) -> Vec<RegistryLabelOption> {
    entry_blocks(source, key)
        .into_iter()
        .map(|(id, block)| RegistryLabelOption {
            label: block_scalar(&block, label_keys).unwrap_or_else(|| id.clone()),
            id,
        })
        .collect()
}

fn entry_blocks<'a>(source: &'a str, key: &str) -> Vec<(String, Vec<&'a str>)> {
    let entry_prefix = format!("- {key}: ");
    let lines: Vec<&str> = source.lines().collect();
    let mut result = Vec::new();
    let mut index = 0;
    while index < lines.len() {
        let Some(id) = lines[index].trim().strip_prefix(&entry_prefix) else {
            index += 1;
            continue;
        };
        let start = index + 1;
        index = start;
        while index < lines.len() && !lines[index].trim().starts_with(&entry_prefix) {
            index += 1;
        }
        result.push((yaml_scalar(id), lines[start..index].to_vec()));
    }
    result
}

fn section_block<'a>(source: &'a str, section_key: &str) -> Vec<&'a str> {
    let section_header = format!("{section_key}:");
    let mut lines = source.lines();
    let Some(_) = lines.find(|line| line.trim() == section_header) else {
        return Vec::new();
    };
    lines
        .take_while(|line| line.trim().is_empty() || line.starts_with(' ') || line.starts_with('-'))
        .collect()
}

fn section_entry_blocks<'a>(
    source: &'a str,
    section_key: &str,
    entry_key: &str,
) -> Vec<(String, Vec<&'a str>)> {
    let section = section_block(source, section_key);
    let entry_prefix = format!("- {entry_key}: ");
    let mut result = Vec::new();
    let mut index = 0;
    while index < section.len() {
        let Some(id) = section[index].trim().strip_prefix(&entry_prefix) else {
            index += 1;
            continue;
        };
        let start = index + 1;
        index = start;
        while index < section.len() && !section[index].trim().starts_with(&entry_prefix) {
            index += 1;
        }
        result.push((yaml_scalar(id), section[start..index].to_vec()));
    }
    result
}

fn block_map(block: &[&str], key: &str) -> Vec<(String, String)> {
    let Some(start) = block
        .iter()
        .position(|line| line.trim() == format!("{key}:"))
    else {
        return Vec::new();
    };
    let parent_indent = block[start].len() - block[start].trim_start().len();
    block
        .iter()
        .skip(start + 1)
        .take_while(|line| {
            line.trim().is_empty() || line.len() - line.trim_start().len() > parent_indent
        })
        .filter_map(|line| line.trim().split_once(": "))
        .map(|(map_key, value)| (map_key.to_string(), yaml_scalar(value)))
        .collect()
}

fn block_scalar(block: &[&str], keys: &[&str]) -> Option<String> {
    for line in block {
        for key in keys {
            let prefix = format!("{key}: ");
            if let Some(value) = line.trim().strip_prefix(&prefix) {
                let value = yaml_scalar(value);
                if !value.is_empty() {
                    return Some(value);
                }
            }
        }
    }
    None
}

fn block_list(block: &[&str], key: &str, anchors: &HashMap<String, Vec<String>>) -> Vec<String> {
    let Some(start) = block.iter().position(|line| {
        let line = line.trim();
        line == format!("{key}:")
            || line.starts_with(&format!("{key}: &"))
            || line.starts_with(&format!("{key}: *"))
    }) else {
        return Vec::new();
    };
    if let Some(alias) = block[start].trim().strip_prefix(&format!("{key}: *")) {
        return anchors.get(alias.trim()).cloned().unwrap_or_default();
    }
    block
        .iter()
        .skip(start + 1)
        .take_while(|line| line.starts_with("  - "))
        .filter_map(|line| line.trim().strip_prefix("- "))
        .map(yaml_scalar)
        .collect()
}

fn list_anchors(source: &str) -> HashMap<String, Vec<String>> {
    let lines: Vec<&str> = source.lines().collect();
    let mut anchors = HashMap::new();
    for (index, line) in lines.iter().enumerate() {
        let Some((_, anchor)) = line.trim().split_once(": &") else {
            continue;
        };
        let values = lines
            .iter()
            .skip(index + 1)
            .take_while(|line| line.starts_with("  - "))
            .filter_map(|line| line.trim().strip_prefix("- "))
            .map(yaml_scalar)
            .collect();
        anchors.insert(anchor.trim().to_string(), values);
    }
    anchors
}

fn yaml_scalar(value: &str) -> String {
    value
        .trim()
        .trim_matches('"')
        .trim_matches('\'')
        .to_string()
}

pub fn snapshot() -> &'static RegistrySnapshot {
    &REGISTRY
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn registry_snapshot_exposes_all_supported_formats() {
        let registry = snapshot();
        let capability = &registry.capabilities[0];
        let unique_ids: HashSet<&str> = registry
            .content_id_options
            .iter()
            .map(|entry| entry.id.as_str())
            .collect();

        assert_eq!(registry.bundle_version, "0.2-provisional");
        assert_eq!(capability.blueprint_slot_id, "R-A1-1");
        assert_eq!(capability.item_format_id, "IF-SINGLE-SELECT");
        assert_eq!(registry.capabilities.len(), 21);
        assert_eq!(
            registry.scoring_contracts.len(),
            registry.capabilities.len()
        );
        assert_eq!(registry.candidate_schemas.len(), 7);
        assert_eq!(unique_ids.len(), registry.content_id_options.len());
        assert!(registry.content_id_options.len() > 840);
        assert_eq!(registry.allowed_domains.len(), 4);
        assert_eq!(capability.allowed_domains.len(), 3);
        assert!(!capability.allowed_domains.contains(&"Personal".to_string()));
        let personal_reading = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-2" && entry.item_format_id == "IF-SINGLE-SELECT"
            })
            .expect("R-A1-2 single-select capability");
        assert!(
            personal_reading
                .allowed_domains
                .contains(&"Personal".to_string())
        );
        assert_eq!(
            registry
                .capabilities
                .iter()
                .map(|entry| entry.blueprint_slot_id.as_str())
                .collect::<HashSet<_>>()
                .len(),
            15
        );
        assert_eq!(
            registry
                .content_id_options
                .iter()
                .find(|entry| entry.id == "LEX-A1-0007")
                .map(|entry| entry.label.as_str()),
            Some("不客气")
        );
        assert_eq!(
            registry
                .context_options
                .iter()
                .find(|entry| entry.id == "D09")
                .map(|entry| entry.label.as_str()),
            Some("完成简单购买")
        );
        let context = registry
            .context_options
            .iter()
            .find(|entry| entry.id == "D09")
            .expect("D09 context");
        assert_eq!(context.primary_domains, vec!["Public"]);
        let cross_domain_context = registry
            .context_options
            .iter()
            .find(|entry| entry.id == "D19")
            .expect("D19 context");
        assert_eq!(cross_domain_context.primary_domains.len(), 4);
        let lexical = registry
            .content_id_options
            .iter()
            .find(|entry| entry.id == "LEX-A1-0007")
            .expect("LEX-A1-0007 content");
        assert!(lexical.context_ids.contains(&"D09".to_string()));
        assert!(!lexical.can_do_ids.is_empty());
        assert_eq!(
            registry
                .content_id_options
                .iter()
                .filter(|entry| entry.kind == "grammar"
                    && entry.context_ids.contains(&"D14".to_string()))
                .count(),
            45
        );
        assert!(!registry.limitations.is_empty());
        assert_eq!(capability.authoring_readiness, "Available");
        assert_eq!(capability.staging_readiness, "CanonicalPackageAvailable");
        assert!(!capability.renderer_implementation_status.is_empty());
        assert!(!capability.renderer_required_work.is_empty());
    }

    #[test]
    fn registry_snapshot_exposes_author_readable_scoring_contracts() {
        let registry = snapshot();
        let matching = registry
            .scoring_contracts
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == "R-A1-3" && entry.item_format_id == "IF-MATCHING"
            })
            .expect("R-A1-3 matching scoring contract");

        assert_eq!(matching.scoring_type, "objective");
        assert_eq!(matching.template_version, "0.1-provisional");
        assert_eq!(matching.normalization.policy_id, "NORM-NONE-v0.1");
        assert_eq!(matching.partial_credit.policy_id, "PC-PER-MATCH-v0.1");
        assert!(matching.partial_credit.summary.contains("correct match"));
        assert!(
            matching
                .invalid_response
                .details
                .iter()
                .any(|rule| rule == "blank: 0")
        );

        let writing = registry
            .scoring_contracts
            .iter()
            .find(|entry| entry.blueprint_slot_id == "W-A1-2")
            .expect("W-A1-2 scoring contract");
        assert_eq!(writing.scoring_type, "analyticRubric");
        assert_eq!(writing.rubric_id, "RUB-W-A1-v0.1");
        assert_eq!(writing.task_specific_requirements.len(), 3);
        assert!(writing.cap_or_exclusion.is_some());
    }
}
