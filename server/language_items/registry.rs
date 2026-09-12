use std::{
    collections::HashMap,
    sync::{Arc, RwLock},
};

use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::content_assessment::ContentAssessmentRule;
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
pub(super) const LEXICON_REGISTRY: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/a1-lexicon-registry-v0.1-provisional.yaml"
));
pub(super) const GRAMMAR_REGISTRY: &str = include_str!(concat!(
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

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentIdOption {
    pub id: String,
    pub kind: String,
    pub label: String,
    pub can_do_ids: Vec<String>,
    pub context_ids: Vec<String>,
    pub mastery_scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub meaning: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pattern: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pinyin: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub english_gloss: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub examples: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restrictions: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub assessment_rules: Vec<ContentAssessmentRule>,
    #[serde(flatten)]
    pub metadata: serde_json::Map<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistryLabelOption {
    pub id: String,
    pub label: String,
    #[serde(default)]
    pub primary_skill: Option<String>,
    #[serde(default)]
    pub activity: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringPolicySummary {
    pub policy_id: String,
    pub summary: String,
    pub details: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoringContractSummary {
    pub scoring_contract_template_id: String,
    #[serde(default)]
    pub display_name: String,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextOption {
    pub id: String,
    pub label: String,
    pub primary_domains: Vec<String>,
    pub can_do_ids: Vec<String>,
    pub scope: String,
    #[serde(default)]
    pub exclusions: Vec<String>,
    #[serde(default)]
    pub retired: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyDriverDefaults {
    pub input_length: String,
    pub information_points: u8,
    pub support_level: String,
    pub distractor_similarity: String,
    pub independence_level: String,
    pub inference_required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyBandStandard {
    pub id: String,
    pub label: String,
    pub description: String,
    pub default_drivers: DifficultyDriverDefaults,
    pub allowed_input_lengths: Vec<String>,
    pub information_points_min: u8,
    pub information_points_max: u8,
    pub allowed_support_levels: Vec<String>,
    pub allowed_distractor_similarities: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDifficultyProfileSet {
    pub id: String,
    pub blueprint_slot_id: String,
    pub item_format_id: String,
    pub primary_can_do_id: String,
    pub standards: Vec<DifficultyBandStandard>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlueprintSlot {
    pub id: String,
    pub display_name: String,
    pub description: String,
    pub allowed_item_format_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedRegistryReference {
    pub id: String,
    pub display_name: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub blueprint_slot_ids: Vec<String>,
    #[serde(default)]
    pub allowed_item_format_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrySnapshot {
    #[serde(default)]
    pub settings_schema_version: u32,
    pub bundle_version: String,
    pub status: String,
    pub limitations: Vec<String>,
    pub source_fingerprint: String,
    pub capabilities: Vec<WorkbenchCapability>,
    #[serde(default)]
    pub blueprint_slots: Vec<BlueprintSlot>,
    #[serde(default)]
    pub task_family_options: Vec<NamedRegistryReference>,
    #[serde(default)]
    pub reference_labels: Vec<NamedRegistryReference>,
    pub candidate_schemas: Vec<Value>,
    pub task_package_schema: Value,
    pub allowed_domains: Vec<String>,
    pub difficulty_bands: Vec<String>,
    #[serde(default)]
    pub difficulty_standards: Vec<DifficultyBandStandard>,
    #[serde(default)]
    pub capability_difficulty_profile_sets: Vec<CapabilityDifficultyProfileSet>,
    pub content_id_options: Vec<ContentIdOption>,
    pub context_options: Vec<ContextOption>,
    pub can_do_options: Vec<RegistryLabelOption>,
    pub scoring_contracts: Vec<ScoringContractSummary>,
    pub required_review_gate_ids: Vec<String>,
}

fn default_difficulty_standards() -> Vec<DifficultyBandStandard> {
    vec![
        DifficultyBandStandard {
            id: "LowerA1".to_string(),
            label: "Lower A1".to_string(),
            description:
                "One explicit information point, word or phrase input, and strong contextual support."
                    .to_string(),
            default_drivers: DifficultyDriverDefaults {
                input_length: "wordOrPhrase".to_string(),
                information_points: 1,
                support_level: "high".to_string(),
                distractor_similarity: "clear".to_string(),
                independence_level: "highlySupported".to_string(),
                inference_required: false,
            },
            allowed_input_lengths: vec!["wordOrPhrase".to_string()],
            information_points_min: 1,
            information_points_max: 1,
            allowed_support_levels: vec!["high".to_string()],
            allowed_distractor_similarities: vec![
                "clear".to_string(),
                "notApplicable".to_string(),
            ],
        },
        DifficultyBandStandard {
            id: "TypicalA1".to_string(),
            label: "Typical A1".to_string(),
            description:
                "One or two explicit information points, short-sentence input, and moderate contextual support."
                    .to_string(),
            default_drivers: DifficultyDriverDefaults {
                input_length: "shortSentence".to_string(),
                information_points: 1,
                support_level: "moderate".to_string(),
                distractor_similarity: "moderate".to_string(),
                independence_level: "partlySupported".to_string(),
                inference_required: false,
            },
            allowed_input_lengths: vec!["shortSentence".to_string()],
            information_points_min: 1,
            information_points_max: 2,
            allowed_support_levels: vec!["high".to_string(), "moderate".to_string()],
            allowed_distractor_similarities: vec![
                "clear".to_string(),
                "moderate".to_string(),
                "notApplicable".to_string(),
            ],
        },
        DifficultyBandStandard {
            id: "UpperA1".to_string(),
            label: "Upper A1".to_string(),
            description:
                "Two explicit information points, related phrases, and limited contextual support while remaining within A1."
                    .to_string(),
            default_drivers: DifficultyDriverDefaults {
                input_length: "twoRelatedPhrases".to_string(),
                information_points: 2,
                support_level: "limited".to_string(),
                distractor_similarity: "close".to_string(),
                independence_level: "independent".to_string(),
                inference_required: false,
            },
            allowed_input_lengths: vec![
                "shortSentence".to_string(),
                "twoRelatedPhrases".to_string(),
            ],
            information_points_min: 2,
            information_points_max: 2,
            allowed_support_levels: vec!["moderate".to_string(), "limited".to_string()],
            allowed_distractor_similarities: vec![
                "moderate".to_string(),
                "close".to_string(),
                "notApplicable".to_string(),
            ],
        },
    ]
}

fn difficulty_profile_set_id(capability: &WorkbenchCapability) -> String {
    format!(
        "DPS-{}-{}-{}",
        capability.blueprint_slot_id, capability.item_format_id, capability.primary_can_do_id
    )
}

pub fn item_format_name(id: &str) -> &str {
    match id {
        "IF-SINGLE-SELECT" => "Single select",
        "IF-MATCHING" => "Matching",
        "IF-RESTRICTED-INPUT" => "Restricted input",
        "IF-FORM-ENTRY" => "Form entry",
        "IF-TYPED-MESSAGE" => "Typed message",
        "IF-SPOKEN-SINGLE" => "Spoken response",
        "IF-SPOKEN-MULTITURN" => "Spoken exchange",
        _ => "Item format",
    }
}

fn populate_readable_metadata(snapshot: &mut RegistrySnapshot) {
    // Old snapshots only stored the slot title on each capability. Materialize one
    // slot record on read; subsequent edits use that record as the title authority.
    if snapshot.blueprint_slots.is_empty() {
        for capability in &snapshot.capabilities {
            if let Some(slot) = snapshot
                .blueprint_slots
                .iter_mut()
                .find(|slot| slot.id == capability.blueprint_slot_id)
            {
                if !slot
                    .allowed_item_format_ids
                    .contains(&capability.item_format_id)
                {
                    slot.allowed_item_format_ids
                        .push(capability.item_format_id.clone());
                }
            } else {
                snapshot.blueprint_slots.push(BlueprintSlot {
                    id: capability.blueprint_slot_id.clone(),
                    display_name: capability.title.clone(),
                    description: capability.task_family_core_behavior.clone(),
                    allowed_item_format_ids: vec![capability.item_format_id.clone()],
                });
            }
        }
    }
    for capability in &snapshot.capabilities {
        if !snapshot
            .task_family_options
            .iter()
            .any(|family| family.id == capability.task_family_id)
        {
            snapshot.task_family_options.push(NamedRegistryReference {
                id: capability.task_family_id.clone(),
                display_name: capability.task_family_core_behavior.clone(),
                kind: "taskFamily".to_string(),
                blueprint_slot_ids: Vec::new(),
                allowed_item_format_ids: Vec::new(),
            });
        }
    }
    for (id, block) in entry_blocks(TASK_FAMILY_REGISTRY, "taskFamilyId") {
        if let Some(family) = snapshot
            .task_family_options
            .iter_mut()
            .find(|family| family.id == id)
        {
            if family.blueprint_slot_ids.is_empty() {
                family.blueprint_slot_ids = block_list(&block, "blueprintSlotIds", &HashMap::new());
            }
            if family.allowed_item_format_ids.is_empty() {
                family.allowed_item_format_ids =
                    block_list(&block, "allowedItemFormatIds", &HashMap::new());
            }
        } else {
            snapshot.task_family_options.push(NamedRegistryReference {
                id,
                display_name: block_scalar(&block, &["coreBehavior"]).unwrap_or_default(),
                kind: "taskFamily".to_string(),
                blueprint_slot_ids: block_list(&block, "blueprintSlotIds", &HashMap::new()),
                allowed_item_format_ids: block_list(
                    &block,
                    "allowedItemFormatIds",
                    &HashMap::new(),
                ),
            });
        }
    }
    for contract in &mut snapshot.scoring_contracts {
        if contract.display_name.trim().is_empty() {
            let slot_name = snapshot
                .blueprint_slots
                .iter()
                .find(|slot| slot.id == contract.blueprint_slot_id)
                .map(|slot| slot.display_name.as_str())
                .unwrap_or("Assessment task");
            contract.display_name = format!(
                "{slot_name} · {} scoring",
                item_format_name(&contract.item_format_id)
            );
        }
    }
    for (id, display_name, kind) in [
        ("REN-SINGLE-SELECT", "Single-select preview", "renderer"),
        ("REN-MATCHING", "Matching preview", "renderer"),
        (
            "REN-RESTRICTED-INPUT",
            "Restricted-input preview",
            "renderer",
        ),
        ("REN-FORM-ENTRY", "Form-entry preview", "renderer"),
        ("REN-TYPED-MESSAGE", "Typed-message preview", "renderer"),
        ("REN-SPOKEN-SINGLE", "Spoken-response preview", "renderer"),
        (
            "REN-SPOKEN-MULTITURN",
            "Spoken-exchange preview",
            "renderer",
        ),
        (
            "NAV-FORWARD-TASK-v0.1",
            "Forward through listening tasks",
            "deliveryPolicy",
        ),
        (
            "NAV-FORWARD-RECORDING-v0.1",
            "Forward through recordings",
            "deliveryPolicy",
        ),
        (
            "NAV-REVIEW-WITHIN-MODULE-v0.1",
            "Review within the module",
            "deliveryPolicy",
        ),
        (
            "INPUT-RESTRICTED-FIELD-v0.1",
            "Restricted text fields",
            "deliveryPolicy",
        ),
        (
            "INPUT-EXAM-STANDARDIZED-PINYIN-v0.1",
            "Standardized Pinyin input",
            "deliveryPolicy",
        ),
        (
            "PLAY-COMPLETE-TWICE-v0.1",
            "Play the complete audio twice",
            "deliveryPolicy",
        ),
        (
            "REC-MULTITURN-A1-v0.1",
            "Record each turn of the exchange",
            "deliveryPolicy",
        ),
        (
            "REC-SINGLE-A1-v0.1",
            "Record one spoken response",
            "deliveryPolicy",
        ),
        (
            "RATE-A1-CLEAR-SLOW-v0.1",
            "Clear, slow A1 speech",
            "deliveryPolicy",
        ),
        (
            "PAUSE-A1-DIALOGUE-v0.1",
            "A1 dialogue pauses",
            "deliveryPolicy",
        ),
        (
            "PAUSE-A1-SENTENCE-v0.1",
            "A1 sentence pauses",
            "deliveryPolicy",
        ),
        ("notApplicable", "Not applicable", "policy"),
        ("editorial", "Editorial review", "reviewGate"),
        ("constructAndLevel", "Can-do and level review", "reviewGate"),
        ("content", "Language content review", "reviewGate"),
        ("scoring", "Scoring review", "reviewGate"),
        (
            "fairnessAccessibility",
            "Fairness and accessibility review",
            "reviewGate",
        ),
        ("technicalSecurity", "Technical review", "reviewGate"),
    ] {
        if !snapshot.reference_labels.iter().any(|entry| entry.id == id) {
            snapshot.reference_labels.push(NamedRegistryReference {
                id: id.to_string(),
                display_name: display_name.to_string(),
                kind: kind.to_string(),
                blueprint_slot_ids: Vec::new(),
                allowed_item_format_ids: Vec::new(),
            });
        }
    }
    for contract in &snapshot.scoring_contracts {
        for policy in [
            &contract.normalization,
            &contract.partial_credit,
            &contract.invalid_response,
            &contract.technical_incident,
            &contract.adjudication,
            &contract.rater_qualification,
        ] {
            if !snapshot
                .reference_labels
                .iter()
                .any(|entry| entry.id == policy.policy_id)
            {
                snapshot.reference_labels.push(NamedRegistryReference {
                    id: policy.policy_id.clone(),
                    display_name: policy.summary.clone(),
                    kind: "scoringPolicy".to_string(),
                    blueprint_slot_ids: Vec::new(),
                    allowed_item_format_ids: Vec::new(),
                });
            }
        }
    }
}

pub fn normalize_registry_snapshot(snapshot: &mut RegistrySnapshot) {
    // Compatibility upgrades only apply to records written before the structured
    // settings schema. Authored values, including invalid ones, must survive reads.
    if snapshot.settings_schema_version >= 1 {
        return;
    }
    let canonical = &*REGISTRY;
    for can_do in &mut snapshot.can_do_options {
        if let Some(source) = canonical
            .can_do_options
            .iter()
            .find(|entry| entry.id == can_do.id)
        {
            if can_do.primary_skill.is_none() {
                can_do.primary_skill.clone_from(&source.primary_skill);
            }
            if can_do.activity.is_none() {
                can_do.activity.clone_from(&source.activity);
            }
        }
    }
    if snapshot.capability_difficulty_profile_sets.is_empty() {
        snapshot.capability_difficulty_profile_sets = snapshot
            .capabilities
            .iter()
            .map(|capability| CapabilityDifficultyProfileSet {
                id: difficulty_profile_set_id(capability),
                blueprint_slot_id: capability.blueprint_slot_id.clone(),
                item_format_id: capability.item_format_id.clone(),
                primary_can_do_id: capability.primary_can_do_id.clone(),
                standards: snapshot.difficulty_standards.clone(),
            })
            .collect();
    }
    populate_readable_metadata(snapshot);
    snapshot.settings_schema_version = 1;
}

pub fn prepare_registry_draft(snapshot: &mut RegistrySnapshot) {
    migrate_legacy_context_domains(snapshot);
    normalize_registry_snapshot(snapshot);
    upgrade_draft_context_schema(snapshot);
    super::registry_content::hydrate_draft_content_metadata(snapshot);
    // Historical slot lists described broad candidates. A newly authored draft
    // starts with exactly the contexts item creation can actually select.
    for capability in &mut snapshot.capabilities {
        let primary_can_do_id = &capability.primary_can_do_id;
        capability.allowed_context_ids.retain(|id| {
            snapshot.context_options.iter().any(|context| {
                context.id == *id
                    && !context.retired
                    && context.can_do_ids.contains(primary_can_do_id)
                    && context.primary_domains.len() == 1
                    && snapshot
                        .allowed_domains
                        .contains(&context.primary_domains[0])
            })
        });
        capability.allowed_domains = snapshot
            .allowed_domains
            .iter()
            .filter(|domain| {
                snapshot.context_options.iter().any(|context| {
                    capability.allowed_context_ids.contains(&context.id)
                        && context.primary_domains.contains(domain)
                })
            })
            .cloned()
            .collect();
    }
}

fn migrate_legacy_context_domains(snapshot: &mut RegistrySnapshot) {
    if snapshot.settings_schema_version != 0 {
        return;
    }
    // These two original contexts used a cross-domain list. New drafts require
    // their canonical primary domain before filtering selectable context refs.
    // Match the original metadata as well as IDs so authored changes stay visible.
    for (id, original_label, original_scope) in [
        (
            "D19",
            "阅读和回复非常短的在线消息",
            "确认时间、告知地点、接受拒绝邀请、说明参加和简单提问。",
        ),
        (
            "D20",
            "填写表格并转告关键信息",
            "填写基本资料并从短材料找到和转告显性实用信息。",
        ),
    ] {
        let Some(canonical) = REGISTRY.context_options.iter().find(|entry| entry.id == id) else {
            continue;
        };
        let Some(context) = snapshot
            .context_options
            .iter_mut()
            .find(|entry| entry.id == id)
        else {
            continue;
        };
        if context.primary_domains == ["Personal", "Public", "Educational", "Occupational"]
            && (context.label == canonical.label || context.label == original_label)
            && (context.scope == canonical.scope || context.scope == original_scope)
            && context.can_do_ids == canonical.can_do_ids
            && context.exclusions.is_empty()
            && !context.retired
        {
            context
                .primary_domains
                .clone_from(&canonical.primary_domains);
        }
    }
}

pub fn upgrade_draft_context_schema(snapshot: &mut RegistrySnapshot) {
    // Technical contracts are read-only in Settings. Upgrade only the known
    // obsolete built-in-ID restriction, never a published snapshot or other rules.
    let Some(context) = snapshot
        .task_package_schema
        .pointer_mut("/properties/content/properties/contextId")
        .and_then(Value::as_object_mut)
    else {
        return;
    };
    if context.get("pattern").and_then(Value::as_str) != Some("^D(0[1-9]|1[0-9]|20)$") {
        return;
    }
    context.remove("pattern");
    context.insert("minLength".to_string(), Value::from(1));
    context.insert("description".to_string(), Value::from(
        "Context identifier in the pinned Assessment Settings registry; includes built-in and user-created contexts.",
    ));
}

pub fn hydrate_published_registry_snapshot(snapshot: &mut RegistrySnapshot) {
    let published_schema_version = snapshot.settings_schema_version;
    normalize_registry_snapshot(snapshot);
    snapshot.settings_schema_version = published_schema_version;
}

pub fn capability_for<'a>(
    snapshot: &'a RegistrySnapshot,
    blueprint_slot_id: &str,
    item_format_id: &str,
    primary_can_do_id: Option<&str>,
) -> Option<&'a WorkbenchCapability> {
    if let Some(primary_can_do_id) = primary_can_do_id {
        return snapshot.capabilities.iter().find(|capability| {
            capability.blueprint_slot_id == blueprint_slot_id
                && capability.item_format_id == item_format_id
                && capability.primary_can_do_id == primary_can_do_id
        });
    }

    let mut matches = snapshot.capabilities.iter().filter(|capability| {
        capability.blueprint_slot_id == blueprint_slot_id
            && capability.item_format_id == item_format_id
    });
    let capability = matches.next()?;
    matches.next().is_none().then_some(capability)
}

pub fn context_supports_capability(
    context: &ContextOption,
    capability: &WorkbenchCapability,
) -> bool {
    !context.retired && context.can_do_ids.contains(&capability.primary_can_do_id)
}

pub fn difficulty_standards_for_capability<'a>(
    snapshot: &'a RegistrySnapshot,
    capability: &WorkbenchCapability,
) -> &'a [DifficultyBandStandard] {
    snapshot
        .capability_difficulty_profile_sets
        .iter()
        .find(|profile| {
            profile.blueprint_slot_id == capability.blueprint_slot_id
                && profile.item_format_id == capability.item_format_id
                && profile.primary_can_do_id == capability.primary_can_do_id
        })
        .map(|profile| profile.standards.as_slice())
        .unwrap_or_else(|| {
            if snapshot.settings_schema_version == 0
                && snapshot.capability_difficulty_profile_sets.is_empty()
            {
                snapshot.difficulty_standards.as_slice()
            } else {
                &[]
            }
        })
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
    let capabilities = capabilities();
    let difficulty_standards = default_difficulty_standards();
    let capability_difficulty_profile_sets = capabilities
        .iter()
        .map(|capability| CapabilityDifficultyProfileSet {
            id: difficulty_profile_set_id(capability),
            blueprint_slot_id: capability.blueprint_slot_id.clone(),
            item_format_id: capability.item_format_id.clone(),
            primary_can_do_id: capability.primary_can_do_id.clone(),
            standards: difficulty_standards.clone(),
        })
        .collect();

    let mut registry = RegistrySnapshot {
        settings_schema_version: 0,
        bundle_version: manifest.bundle_version,
        status: manifest.status,
        limitations: manifest.limitations,
        source_fingerprint: "a1-registry:0.2-provisional:authoring-contracts-0.5".to_string(),
        capabilities,
        blueprint_slots: Vec::new(),
        task_family_options: Vec::new(),
        reference_labels: Vec::new(),
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
        difficulty_standards,
        capability_difficulty_profile_sets,
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
    };
    populate_readable_metadata(&mut registry);
    registry
});

#[derive(Default)]
struct RegistryCatalog {
    active_version: String,
    versions: HashMap<String, Arc<RegistrySnapshot>>,
}

static REGISTRY_CATALOG: Lazy<RwLock<RegistryCatalog>> = Lazy::new(|| {
    let baseline = Arc::new(REGISTRY.clone());
    let mut versions = HashMap::new();
    versions.insert(baseline.bundle_version.clone(), Arc::clone(&baseline));
    RwLock::new(RegistryCatalog {
        active_version: baseline.bundle_version.clone(),
        versions,
    })
});

pub fn active_snapshot() -> Arc<RegistrySnapshot> {
    let catalog = REGISTRY_CATALOG.read().expect("registry catalog read lock");
    catalog
        .versions
        .get(&catalog.active_version)
        .cloned()
        .unwrap_or_else(|| Arc::new(REGISTRY.clone()))
}

pub fn snapshot_for(version: &str) -> Option<Arc<RegistrySnapshot>> {
    REGISTRY_CATALOG
        .read()
        .expect("registry catalog read lock")
        .versions
        .get(version)
        .cloned()
}

pub fn install_published_snapshot(snapshot: RegistrySnapshot, make_active: bool) {
    let version = snapshot.bundle_version.clone();
    let mut catalog = REGISTRY_CATALOG
        .write()
        .expect("registry catalog write lock");
    catalog.versions.insert(version.clone(), Arc::new(snapshot));
    if make_active {
        catalog.active_version = version;
    }
}

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
        "IF-SINGLE-SELECT" => Some((
            "REN-SINGLE-SELECT",
            "One stimulus, one question, and at least two options.",
        )),
        "IF-MATCHING" => Some((
            "REN-MATCHING",
            "Match at least two prompts with the available answers.",
        )),
        "IF-RESTRICTED-INPUT" => Some((
            "REN-RESTRICTED-INPUT",
            "Read or listen to a short stimulus and enter explicit information.",
        )),
        "IF-FORM-ENTRY" => Some(("REN-FORM-ENTRY", "Complete four to six short form fields.")),
        "IF-TYPED-MESSAGE" => Some((
            "REN-TYPED-MESSAGE",
            "Write a short message for the specified recipient, purpose, and content points.",
        )),
        "IF-SPOKEN-SINGLE" => Some((
            "REN-SPOKEN-SINGLE",
            "Give one short spoken response to a visible or audio prompt.",
        )),
        "IF-SPOKEN-MULTITURN" => Some((
            "REN-SPOKEN-MULTITURN",
            "Complete a fixed-path exchange with at least one prompt and response.",
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
            .map(|rule| format!("Allowed: {rule}"))
            .collect::<Vec<_>>();
        details.extend(
            block_list(&block, "prohibitedProcessing", &HashMap::new())
                .into_iter()
                .map(|rule| format!("Prohibited: {rule}")),
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
                summary: "Invalid responses are handled consistently under the contract"
                    .to_string(),
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
            display_name: String::new(),
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
            summary: "Scoring policy details are unavailable".to_string(),
            details: Vec::new(),
        })
}

fn not_applicable_policy() -> ScoringPolicySummary {
    ScoringPolicySummary {
        policy_id: "notApplicable".to_string(),
        summary: "Not applicable".to_string(),
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
            meaning: None,
            pattern: None,
            pinyin: None,
            english_gloss: None,
            examples: None,
            restrictions: None,
            sources: None,
            notes: None,
            assessment_rules: Vec::new(),
            metadata: serde_json::Map::new(),
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
            exclusions: block_list(&block, "exclusions", &anchors),
            retired: false,
            id,
        })
        .collect()
}

fn label_options(source: &str, key: &str, label_keys: &[&str]) -> Vec<RegistryLabelOption> {
    entry_blocks(source, key)
        .into_iter()
        .map(|(id, block)| RegistryLabelOption {
            label: block_scalar(&block, label_keys).unwrap_or_else(|| id.clone()),
            primary_skill: block_scalar(&block, &["primarySkill"]),
            activity: block_scalar(&block, &["activity"]),
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
    fn explicit_primary_can_do_never_falls_back_to_a_different_capability() {
        let mut registry = snapshot().clone();
        let first = registry.capabilities[0].clone();
        assert!(
            capability_for(
                &registry,
                &first.blueprint_slot_id,
                &first.item_format_id,
                Some("unknown")
            )
            .is_none()
        );
        assert!(
            capability_for(
                &registry,
                &first.blueprint_slot_id,
                &first.item_format_id,
                None
            )
            .is_some()
        );
        let mut second = first.clone();
        second.primary_can_do_id = "A1-R2".to_string();
        registry.capabilities.push(second);
        assert!(
            capability_for(
                &registry,
                &first.blueprint_slot_id,
                &first.item_format_id,
                None
            )
            .is_none()
        );
        assert_eq!(
            capability_for(
                &registry,
                &first.blueprint_slot_id,
                &first.item_format_id,
                Some("A1-R2")
            )
            .unwrap()
            .primary_can_do_id,
            "A1-R2"
        );
    }

    #[test]
    fn legacy_snapshot_adds_readable_metadata_without_changing_identifiers() {
        let mut serialized = serde_json::to_value(snapshot()).unwrap();
        for field in [
            "settingsSchemaVersion",
            "blueprintSlots",
            "taskFamilyOptions",
            "referenceLabels",
            "capabilityDifficultyProfileSets",
        ] {
            serialized.as_object_mut().unwrap().remove(field);
        }
        for context in serialized["contextOptions"].as_array_mut().unwrap() {
            context.as_object_mut().unwrap().remove("retired");
            context.as_object_mut().unwrap().remove("exclusions");
        }
        for contract in serialized["scoringContracts"].as_array_mut().unwrap() {
            contract.as_object_mut().unwrap().remove("displayName");
        }
        let mut restored: RegistrySnapshot = serde_json::from_value(serialized).unwrap();
        normalize_registry_snapshot(&mut restored);
        assert_eq!(restored.bundle_version, snapshot().bundle_version);
        assert_eq!(restored.blueprint_slots.len(), 15);
        assert_eq!(
            restored.capabilities.len(),
            restored.capability_difficulty_profile_sets.len()
        );
        assert_eq!(
            restored.capabilities[0].blueprint_slot_id,
            snapshot().capabilities[0].blueprint_slot_id
        );
        assert!(
            restored
                .scoring_contracts
                .iter()
                .all(|contract| !contract.display_name.is_empty())
        );
        let before = serde_json::to_value(&restored).unwrap();
        normalize_registry_snapshot(&mut restored);
        assert_eq!(before, serde_json::to_value(&restored).unwrap());
    }

    #[test]
    fn retired_context_is_unavailable_in_new_configuration_only() {
        let registry = snapshot();
        let capability = &registry.capabilities[0];
        let mut context = registry
            .context_options
            .iter()
            .find(|context| context_supports_capability(context, capability))
            .unwrap()
            .clone();
        let original = serde_json::to_value(&context).unwrap();
        context.retired = true;
        assert!(!context_supports_capability(&context, capability));
        assert!(context_supports_capability(
            &serde_json::from_value(original).unwrap(),
            capability
        ));
    }

    #[test]
    fn authored_snapshot_reads_preserve_invalid_and_non_english_values() {
        let mut registry = snapshot().clone();
        registry.settings_schema_version = 1;
        registry.can_do_options[0].label = "自定义能力描述".to_string();
        registry.can_do_options[0].primary_skill = None;
        registry.capability_difficulty_profile_sets.pop();
        registry.scoring_contracts[0].normalization.summary = "自定义评分规则".to_string();
        let before = serde_json::to_value(&registry).unwrap();
        normalize_registry_snapshot(&mut registry);
        assert_eq!(before, serde_json::to_value(&registry).unwrap());
        let missing = registry.capabilities.last().unwrap();
        assert!(difficulty_standards_for_capability(&registry, missing).is_empty());
    }

    #[test]
    fn published_legacy_hydration_preserves_pinned_validation_semantics() {
        let mut published = snapshot().clone();
        published.settings_schema_version = 0;
        published.blueprint_slots.clear();
        published.capability_difficulty_profile_sets.clear();
        let contexts = published.capabilities[0].allowed_context_ids.clone();
        hydrate_published_registry_snapshot(&mut published);
        assert_eq!(published.settings_schema_version, 0);
        assert!(!published.blueprint_slots.is_empty());
        assert_eq!(published.capabilities[0].allowed_context_ids, contexts);
        let mut draft = published.clone();
        prepare_registry_draft(&mut draft);
        assert_eq!(draft.settings_schema_version, 1);
        assert_eq!(published.settings_schema_version, 0);
    }

    #[test]
    fn custom_context_contract_upgrade_is_draft_only_and_narrow() {
        let pointer = "/properties/content/properties/contextId";
        let mut published = snapshot().clone();
        *published.task_package_schema.pointer_mut(pointer).unwrap() = serde_json::json!({
            "type": "string", "pattern": "^D(0[1-9]|1[0-9]|20)$"
        });
        let original_schema = published.task_package_schema.clone();
        hydrate_published_registry_snapshot(&mut published);
        assert_eq!(published.task_package_schema, original_schema);
        let mut draft = published.clone();
        prepare_registry_draft(&mut draft);
        let context = draft.task_package_schema.pointer(pointer).unwrap();
        assert!(context.get("pattern").is_none());
        assert_eq!(context["minLength"], 1);
        let upgraded = draft.task_package_schema.clone();
        upgrade_draft_context_schema(&mut draft);
        assert_eq!(draft.task_package_schema, upgraded);
        draft.task_package_schema.pointer_mut(pointer).unwrap()["pattern"] =
            Value::from("^CUSTOM-");
        upgrade_draft_context_schema(&mut draft);
        assert_eq!(
            draft.task_package_schema.pointer(pointer).unwrap()["pattern"],
            "^CUSTOM-"
        );
    }

    #[test]
    fn new_draft_initializes_usable_contexts_without_changing_published_snapshot() {
        let original = snapshot();
        let before = serde_json::to_value(original).unwrap();
        let mut draft = original.clone();
        prepare_registry_draft(&mut draft);
        for capability in &draft.capabilities {
            assert!(!capability.allowed_context_ids.is_empty());
            for id in &capability.allowed_context_ids {
                let context = draft
                    .context_options
                    .iter()
                    .find(|context| context.id == *id)
                    .unwrap();
                assert!(context_supports_capability(context, capability));
                assert!(
                    context
                        .primary_domains
                        .iter()
                        .all(|domain| capability.allowed_domains.contains(domain))
                );
            }
        }
        assert_eq!(before, serde_json::to_value(original).unwrap());
    }

    #[test]
    fn legacy_cross_domain_contexts_are_migrated_before_draft_reference_filtering() {
        for chinese_metadata in [false, true] {
            let mut published = snapshot().clone();
            for (id, label, scope) in [
                (
                    "D19",
                    "阅读和回复非常短的在线消息",
                    "确认时间、告知地点、接受拒绝邀请、说明参加和简单提问。",
                ),
                (
                    "D20",
                    "填写表格并转告关键信息",
                    "填写基本资料并从短材料找到和转告显性实用信息。",
                ),
            ] {
                let context = published
                    .context_options
                    .iter_mut()
                    .find(|entry| entry.id == id)
                    .unwrap();
                context.primary_domains = ["Personal", "Public", "Educational", "Occupational"]
                    .into_iter()
                    .map(str::to_string)
                    .collect();
                if chinese_metadata {
                    context.label = label.to_string();
                    context.scope = scope.to_string();
                }
            }
            hydrate_published_registry_snapshot(&mut published);
            let original = serde_json::to_value(&published).unwrap();
            assert!(
                published
                    .context_options
                    .iter()
                    .filter(|entry| ["D19", "D20"].contains(&entry.id.as_str()))
                    .all(|entry| entry.primary_domains.len() == 4)
            );
            let mut draft = published.clone();
            prepare_registry_draft(&mut draft);
            for (slot, context_id) in [("W-A1-2", "D19"), ("W-A1-3", "D20"), ("S-A1-4", "D20")] {
                let context = draft
                    .context_options
                    .iter()
                    .find(|entry| entry.id == context_id)
                    .unwrap();
                assert_eq!(context.primary_domains, ["Personal"]);
                assert!(
                    draft
                        .capabilities
                        .iter()
                        .filter(|entry| entry.blueprint_slot_id == slot)
                        .all(|entry| entry.allowed_context_ids.contains(&context_id.to_string()))
                );
            }
            let validation = super::super::registry_store::validate_registry(&draft);
            assert!(validation.valid, "{:?}", validation.issues);
            assert_eq!(serde_json::to_value(&published).unwrap(), original);
        }
    }

    #[test]
    fn legacy_context_migration_preserves_modern_and_user_authored_domains() {
        for variant in 0..6 {
            let mut draft = snapshot().clone();
            let context = draft
                .context_options
                .iter_mut()
                .find(|entry| entry.id == "D19")
                .unwrap();
            context.primary_domains = ["Personal", "Public", "Educational", "Occupational"]
                .into_iter()
                .map(str::to_string)
                .collect();
            match variant {
                0 => draft.settings_schema_version = 1,
                1 => context.label = "My messaging context".to_string(),
                2 => context.scope = "A custom scope".to_string(),
                3 => {
                    context.can_do_ids.pop();
                }
                4 => context.primary_domains = vec!["Personal".to_string(), "Public".to_string()],
                _ => context.retired = true,
            }
            let original = serde_json::to_value(
                draft
                    .context_options
                    .iter()
                    .find(|entry| entry.id == "D19")
                    .unwrap(),
            )
            .unwrap();
            prepare_registry_draft(&mut draft);
            assert_eq!(
                serde_json::to_value(
                    draft
                        .context_options
                        .iter()
                        .find(|entry| entry.id == "D19")
                        .unwrap()
                )
                .unwrap(),
                original,
                "variant {variant}"
            );
        }
    }

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
            Some("Complete a simple purchase")
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
        assert_eq!(cross_domain_context.primary_domains, vec!["Personal"]);
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
