use std::collections::BTreeMap;

use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LanguageItemStatus {
    Draft,
    ReadyForReview,
    InReview,
    NeedsRevision,
    ReviewBlocked,
    Rejected,
    #[serde(alias = "approved")]
    ApprovedForExport,
    ExportedToStaging,
}

#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LanguageItemRecordState {
    #[default]
    Active,
    Archived,
    Deleted,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDecision {
    Approved,
    #[serde(alias = "changesRequested")]
    Revise,
    Rejected,
    Blocked,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDiscussionKind {
    Discussion,
    ChangeRequest,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDiscussionEventKind {
    Comment,
    Addressed,
    Resolved,
    Reopened,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReviewDiscussionStatus {
    Open,
    Addressed,
    Resolved,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpecVersions {
    pub planning_spec_version: String,
    pub registry_bundle_version: String,
    pub task_package_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RendererRef {
    pub renderer_id: String,
    pub renderer_version: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Stimulus {
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub image_refs: Vec<String>,
    #[serde(default)]
    pub audio_ref: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleSelectOption {
    pub option_id: String,
    pub text: Option<String>,
    pub image_ref: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SingleSelectCandidatePayload {
    pub stimulus: Stimulus,
    pub prompt: String,
    pub options: Vec<SingleSelectOption>,
    pub shuffle_options: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchingItem {
    pub item_id: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(default)]
    pub image_ref: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MatchingCandidatePayload {
    pub stimulus: Stimulus,
    pub prompt: String,
    pub left_items: Vec<MatchingItem>,
    pub right_items: Vec<MatchingItem>,
    pub shuffle_right_items: bool,
    pub allow_right_item_reuse: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ResponseField {
    pub response_id: String,
    #[serde(default)]
    pub label: Option<String>,
    pub input_type: String,
    #[serde(default)]
    pub max_length: Option<u16>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestrictedInputCandidatePayload {
    pub stimulus: Stimulus,
    pub prompt: String,
    pub response_fields: Vec<ResponseField>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormField {
    pub field_id: String,
    pub label: String,
    pub input_type: String,
    pub required: bool,
    #[serde(default)]
    pub max_length: Option<u16>,
    #[serde(default)]
    pub placeholder: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FormEntryCandidatePayload {
    pub situation: String,
    pub instructions: String,
    #[serde(default)]
    pub source_profile: Option<Value>,
    pub fields: Vec<FormField>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentPoint {
    pub content_point_id: String,
    pub description: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LengthGuidance {
    pub count_by: String,
    pub minimum: u16,
    pub maximum: u16,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TypedMessageCandidatePayload {
    pub situation: String,
    pub instructions: String,
    #[serde(default)]
    pub source_message: Option<String>,
    #[serde(default)]
    pub source_material_refs: Vec<String>,
    pub recipient: String,
    pub purpose: String,
    pub required_content_points: Vec<ContentPoint>,
    pub length_guidance: LengthGuidance,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenSingleCandidatePayload {
    pub situation: String,
    pub instructions: String,
    #[serde(default)]
    pub visible_prompt_text: Option<String>,
    #[serde(default)]
    pub prompt_audio_ref: Option<String>,
    #[serde(default)]
    pub source_material_refs: Vec<String>,
    #[serde(default)]
    pub recipient: Option<String>,
    #[serde(default)]
    pub purpose: Option<String>,
    pub preparation_time_seconds: u16,
    pub response_time_seconds: u16,
    pub required_content_points: Vec<ContentPoint>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenRoles {
    pub system_role: String,
    pub candidate_role: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenTurn {
    pub turn_id: String,
    pub speaker: String,
    #[serde(default)]
    pub prompt_audio_ref: Option<String>,
    #[serde(default)]
    pub response_id: Option<String>,
    #[serde(default)]
    pub response_time_seconds: Option<u16>,
    #[serde(default)]
    pub required_function_ids: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenPath {
    pub path_id: String,
    pub turns: Vec<SpokenTurn>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SpokenMultiturnCandidatePayload {
    pub situation: String,
    pub instructions: String,
    pub roles: SpokenRoles,
    pub interaction_mode: String,
    pub start_path_id: String,
    pub paths: Vec<SpokenPath>,
    pub routing_rule_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum CandidatePayload {
    SingleSelect(SingleSelectCandidatePayload),
    Matching(MatchingCandidatePayload),
    RestrictedInput(RestrictedInputCandidatePayload),
    FormEntry(FormEntryCandidatePayload),
    TypedMessage(TypedMessageCandidatePayload),
    SpokenSingle(SpokenSingleCandidatePayload),
    SpokenMultiturn(SpokenMultiturnCandidatePayload),
}

impl CandidatePayload {
    pub fn as_single_select(&self) -> Option<&SingleSelectCandidatePayload> {
        match self {
            Self::SingleSelect(payload) => Some(payload),
            _ => None,
        }
    }

    pub fn as_single_select_mut(&mut self) -> Option<&mut SingleSelectCandidatePayload> {
        match self {
            Self::SingleSelect(payload) => Some(payload),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AuthoringPackage {
    #[serde(default)]
    pub notes: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringPoint {
    pub scoring_point_id: String,
    pub description: String,
    pub points: u16,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub normalization_policy_id: Option<String>,
}

fn default_item_scoring_version() -> String {
    "0.1".to_string()
}

fn default_scoring_contract_template_version() -> String {
    "0.1-provisional".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoringPackage {
    #[serde(default = "default_item_scoring_version")]
    pub item_scoring_version: String,
    pub scoring_contract_template_id: String,
    #[serde(default = "default_scoring_contract_template_version")]
    pub scoring_contract_template_version: String,
    #[serde(default)]
    pub max_raw_score: u16,
    #[serde(default)]
    pub scoring_points: Vec<ScoringPoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub answer_key_ref: Option<String>,
    #[serde(default)]
    pub task_specific_criteria: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub benchmark_set_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub correct_option_id: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub correct_matches: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub accepted_responses: BTreeMap<String, Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rubric_id: Option<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReviewPackage {
    #[serde(default)]
    pub gates: BTreeMap<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeliveryPolicyRefs {
    pub navigation_policy_id: String,
    pub input_policy_id: String,
    pub playback_policy_id: String,
    pub recording_policy_id: String,
    pub speaking_rate_profile_id: String,
    pub pause_profile_id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DifficultyDrivers {
    pub input_length: String,
    pub information_points: u8,
    pub support_level: String,
    pub distractor_similarity: String,
    pub output_length: String,
    pub interaction_turns: u8,
    pub preparation_time_seconds: Option<u16>,
    pub independence_level: String,
    pub inference_required: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EmpiricalDifficulty {
    pub status: String,
    pub sample_id: Option<String>,
    pub observed_band: Option<String>,
    pub percent_correct: Option<f64>,
    pub discrimination: Option<f64>,
    pub omission_rate: Option<f64>,
    pub median_response_time_seconds: Option<f64>,
    pub decision: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DifficultyProfile {
    pub intended_band: String,
    pub status: String,
    pub drivers: DifficultyDrivers,
    #[serde(default)]
    pub rationale: Vec<String>,
    pub empirical_difficulty: EmpiricalDifficulty,
}

fn default_true() -> bool {
    true
}

fn default_information_point_type() -> String {
    "other".to_string()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InformationPoint {
    #[serde(default)]
    pub id: String,
    #[serde(default = "default_information_point_type")]
    pub point_type: String,
    pub label: String,
    #[serde(default = "default_true")]
    pub required: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scoring_point_id: Option<String>,
}

impl InformationPoint {
    pub fn new(index: usize, label: impl Into<String>) -> Self {
        Self {
            id: format!("IP{}", index + 1),
            point_type: "other".to_string(),
            label: label.into(),
            required: true,
            source_ref: None,
            scoring_point_id: None,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
enum InformationPointInput {
    Structured(InformationPoint),
    Legacy(String),
}

fn deserialize_information_points<'de, D>(
    deserializer: D,
) -> Result<Vec<InformationPoint>, D::Error>
where
    D: Deserializer<'de>,
{
    let values = Vec::<InformationPointInput>::deserialize(deserializer)?;
    Ok(values
        .into_iter()
        .enumerate()
        .map(|(index, value)| match value {
            InformationPointInput::Structured(mut point) => {
                if point.id.trim().is_empty() {
                    point.id = format!("IP{}", index + 1);
                }
                point
            }
            InformationPointInput::Legacy(label) => InformationPoint::new(index, label),
        })
        .collect())
}

impl DifficultyProfile {
    pub fn r_a1_1_typical() -> Self {
        Self {
            intended_band: "TypicalA1".to_string(),
            status: "AuthorEstimated".to_string(),
            drivers: DifficultyDrivers {
                input_length: "shortSentence".to_string(),
                information_points: 1,
                support_level: "moderate".to_string(),
                distractor_similarity: "moderate".to_string(),
                output_length: "selectedOption".to_string(),
                interaction_turns: 0,
                preparation_time_seconds: None,
                independence_level: "partlySupported".to_string(),
                inference_required: false,
            },
            rationale: vec!["一个直接信息点，使用同类且合理的干扰项".to_string()],
            empirical_difficulty: EmpiricalDifficulty {
                status: "NotPiloted".to_string(),
                sample_id: None,
                observed_band: None,
                percent_correct: None,
                discrimination: None,
                omission_rate: None,
                median_response_time_seconds: None,
                decision: None,
            },
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContentMetadata {
    pub primary_can_do_id: String,
    pub primary_reported_skill: String,
    pub communicative_activity: String,
    pub primary_domain: String,
    pub context_id: String,
    pub difficulty_band: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub difficulty: Option<DifficultyProfile>,
    #[serde(default)]
    pub target_content_ids: Vec<String>,
    #[serde(default)]
    pub supporting_content_refs: Vec<String>,
    #[serde(default, deserialize_with = "deserialize_information_points")]
    pub required_information_points: Vec<InformationPoint>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TaskPackage {
    pub task_id: String,
    pub task_version: String,
    pub spec_versions: SpecVersions,
    pub blueprint_slot_id: String,
    pub task_family_id: String,
    pub item_format_id: String,
    pub renderer: RendererRef,
    pub candidate_payload: CandidatePayload,
    pub authoring_package: AuthoringPackage,
    pub scoring_package: ScoringPackage,
    pub review_package: ReviewPackage,
    #[serde(default)]
    pub media_refs: Vec<String>,
    pub delivery_policy_refs: DeliveryPolicyRefs,
    pub content: ContentMetadata,
    #[serde(default)]
    pub variation: Value,
}

pub fn task_package_hash(package: &TaskPackage) -> String {
    let bytes = serde_json::to_vec(package).expect("TaskPackage is serializable");
    let hash = bytes.iter().fold(0xcbf29ce484222325_u64, |hash, byte| {
        (hash ^ u64::from(*byte)).wrapping_mul(0x100000001b3)
    });
    format!("fnv1a64:{hash:016x}")
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidatePreview {
    pub task_id: String,
    pub renderer: RendererRef,
    pub candidate_payload: CandidatePayload,
    pub delivery_policy_refs: DeliveryPolicyRefs,
}

impl From<&TaskPackage> for CandidatePreview {
    fn from(package: &TaskPackage) -> Self {
        Self {
            task_id: package.task_id.clone(),
            renderer: package.renderer.clone(),
            candidate_payload: package.candidate_payload.clone(),
            delivery_policy_refs: package.delivery_policy_refs.clone(),
        }
    }
}

impl TaskPackage {
    pub fn new(task_id: String) -> Self {
        let mut package = Self {
            task_id,
            task_version: "draft".to_string(),
            spec_versions: SpecVersions {
                planning_spec_version: "0.2-provisional".to_string(),
                registry_bundle_version: "0.2-provisional".to_string(),
                task_package_version: "0.1".to_string(),
            },
            blueprint_slot_id: "R-A1-1".to_string(),
            task_family_id: "TF-SIGNS-NOTICES".to_string(),
            item_format_id: "IF-SINGLE-SELECT".to_string(),
            renderer: RendererRef {
                renderer_id: "REN-SINGLE-SELECT".to_string(),
                renderer_version: "0.1".to_string(),
            },
            candidate_payload: CandidatePayload::SingleSelect(SingleSelectCandidatePayload {
                stimulus: Stimulus {
                    text: Some(String::new()),
                    image_refs: vec![],
                    audio_ref: None,
                },
                prompt: String::new(),
                options: vec![
                    SingleSelectOption {
                        option_id: "A".to_string(),
                        text: Some(String::new()),
                        image_ref: None,
                    },
                    SingleSelectOption {
                        option_id: "B".to_string(),
                        text: Some(String::new()),
                        image_ref: None,
                    },
                ],
                shuffle_options: false,
            }),
            authoring_package: AuthoringPackage::default(),
            scoring_package: ScoringPackage {
                item_scoring_version: default_item_scoring_version(),
                scoring_contract_template_id: "SCT-R-A1-1-SINGLE-SELECT-v0.1".to_string(),
                scoring_contract_template_version: default_scoring_contract_template_version(),
                max_raw_score: 0,
                scoring_points: vec![],
                answer_key_ref: None,
                task_specific_criteria: vec![],
                benchmark_set_version: None,
                correct_option_id: Some("A".to_string()),
                correct_matches: BTreeMap::new(),
                accepted_responses: BTreeMap::new(),
                rubric_id: None,
            },
            review_package: ReviewPackage::default(),
            media_refs: vec![],
            delivery_policy_refs: DeliveryPolicyRefs {
                navigation_policy_id: "NAV-REVIEW-WITHIN-MODULE-v0.1".to_string(),
                input_policy_id: "notApplicable".to_string(),
                playback_policy_id: "notApplicable".to_string(),
                recording_policy_id: "notApplicable".to_string(),
                speaking_rate_profile_id: "notApplicable".to_string(),
                pause_profile_id: "notApplicable".to_string(),
            },
            content: ContentMetadata {
                primary_can_do_id: "A1-R1".to_string(),
                primary_reported_skill: "Reading".to_string(),
                communicative_activity: "Reception".to_string(),
                primary_domain: "Public".to_string(),
                context_id: "D09".to_string(),
                difficulty_band: "TypicalA1".to_string(),
                difficulty: Some(DifficultyProfile::r_a1_1_typical()),
                target_content_ids: vec![],
                supporting_content_refs: vec![],
                required_information_points: vec![],
            },
            variation: Value::Object(Default::default()),
        };
        package.ensure_item_scoring_spec();
        package
    }

    pub fn from_template(task_id: String, template_id: &str) -> Option<Self> {
        let mut package = Self::new(task_id);
        match template_id {
            "reading-single-select" => {}
            "reading-matching" => {
                package.item_format_id = "IF-MATCHING".to_string();
                package.renderer.renderer_id = "REN-MATCHING".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-R-A1-1-MATCHING-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: None,
                    correct_option_id: None,
                    correct_matches: BTreeMap::from([
                        ("L1".to_string(), "R1".to_string()),
                        ("L2".to_string(), "R2".to_string()),
                    ]),
                    accepted_responses: BTreeMap::new(),
                    rubric_id: None,
                };
                package.candidate_payload = CandidatePayload::Matching(MatchingCandidatePayload {
                    stimulus: empty_stimulus(),
                    prompt: String::new(),
                    left_items: default_matching_items("L"),
                    right_items: default_matching_items("R"),
                    shuffle_right_items: true,
                    allow_right_item_reuse: false,
                });
                package.content.difficulty = Some(difficulty_for("matchedOptions", 0, None));
            }
            "reading-restricted-input" => {
                package.blueprint_slot_id = "R-A1-3".to_string();
                package.task_family_id = "TF-STRUCTURED-INFORMATION".to_string();
                package.item_format_id = "IF-RESTRICTED-INPUT".to_string();
                package.renderer.renderer_id = "REN-RESTRICTED-INPUT".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-R-A1-3-RESTRICTED-INPUT-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: None,
                    correct_option_id: None,
                    correct_matches: BTreeMap::new(),
                    accepted_responses: BTreeMap::from([("F1".to_string(), vec![])]),
                    rubric_id: None,
                };
                package.candidate_payload =
                    CandidatePayload::RestrictedInput(RestrictedInputCandidatePayload {
                        stimulus: empty_stimulus(),
                        prompt: String::new(),
                        response_fields: vec![ResponseField {
                            response_id: "F1".to_string(),
                            label: Some("答案".to_string()),
                            input_type: "shortText".to_string(),
                            max_length: Some(12),
                            placeholder: None,
                        }],
                    });
                set_content_contract(&mut package, "A1-R2", "Reading", "Reception", "D09");
                package.content.difficulty = Some(difficulty_for("shortFields", 0, None));
            }
            "writing-form-entry" => {
                package.blueprint_slot_id = "W-A1-1".to_string();
                package.task_family_id = "TF-FORM-COMPLETION".to_string();
                package.item_format_id = "IF-FORM-ENTRY".to_string();
                package.renderer.renderer_id = "REN-FORM-ENTRY".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-W-A1-1-FORM-ENTRY-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: None,
                    correct_option_id: None,
                    correct_matches: BTreeMap::new(),
                    accepted_responses: BTreeMap::new(),
                    rubric_id: None,
                };
                package.candidate_payload =
                    CandidatePayload::FormEntry(FormEntryCandidatePayload {
                        situation: String::new(),
                        instructions: String::new(),
                        source_profile: None,
                        fields: (1..=4)
                            .map(|index| FormField {
                                field_id: format!("F{index}"),
                                label: String::new(),
                                input_type: if index == 1 {
                                    "typedChinese".to_string()
                                } else {
                                    "shortText".to_string()
                                },
                                required: true,
                                max_length: Some(20),
                                placeholder: None,
                            })
                            .collect(),
                    });
                set_content_contract(&mut package, "A1-W1", "Writing", "Production", "D13");
                package.content.difficulty = Some(difficulty_for("formFields", 0, None));
            }
            "writing-typed-message" => {
                package.blueprint_slot_id = "W-A1-2".to_string();
                package.task_family_id = "TF-SHORT-MESSAGE-RESPONSE".to_string();
                package.item_format_id = "IF-TYPED-MESSAGE".to_string();
                package.renderer.renderer_id = "REN-TYPED-MESSAGE".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-W-A1-2-TYPED-MESSAGE-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: Some("PendingRealCandidateResponses".to_string()),
                    correct_option_id: None,
                    correct_matches: BTreeMap::new(),
                    accepted_responses: BTreeMap::new(),
                    rubric_id: Some("RUB-W-A1-v0.1".to_string()),
                };
                package.candidate_payload =
                    CandidatePayload::TypedMessage(TypedMessageCandidatePayload {
                        situation: String::new(),
                        instructions: String::new(),
                        source_message: None,
                        source_material_refs: vec![],
                        recipient: String::new(),
                        purpose: String::new(),
                        required_content_points: vec![ContentPoint {
                            content_point_id: "P1".to_string(),
                            description: String::new(),
                        }],
                        length_guidance: LengthGuidance {
                            count_by: "characters".to_string(),
                            minimum: 10,
                            maximum: 40,
                        },
                    });
                set_content_contract(&mut package, "A1-W2", "Writing", "Production", "D13");
                package.content.difficulty = Some(difficulty_for("shortMessage", 0, None));
            }
            "speaking-single" => {
                package.blueprint_slot_id = "S-A1-2".to_string();
                package.task_family_id = "TF-GUIDED-SPOKEN-PRODUCTION".to_string();
                package.item_format_id = "IF-SPOKEN-SINGLE".to_string();
                package.renderer.renderer_id = "REN-SPOKEN-SINGLE".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-S-A1-2-SPOKEN-SINGLE-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: Some("PendingRealCandidateResponses".to_string()),
                    correct_option_id: None,
                    correct_matches: BTreeMap::new(),
                    accepted_responses: BTreeMap::new(),
                    rubric_id: Some("RUB-S-A1-PRODUCTION-v0.1".to_string()),
                };
                package.candidate_payload =
                    CandidatePayload::SpokenSingle(SpokenSingleCandidatePayload {
                        situation: String::new(),
                        instructions: String::new(),
                        visible_prompt_text: Some(String::new()),
                        prompt_audio_ref: None,
                        source_material_refs: vec![],
                        recipient: None,
                        purpose: None,
                        preparation_time_seconds: 20,
                        response_time_seconds: 60,
                        required_content_points: vec![ContentPoint {
                            content_point_id: "P1".to_string(),
                            description: String::new(),
                        }],
                    });
                set_content_contract(&mut package, "A1-S2", "Speaking", "Production", "D04");
                package.content.difficulty = Some(difficulty_for("shortSpeech", 1, Some(20)));
            }
            "speaking-multiturn" => {
                package.blueprint_slot_id = "S-A1-1".to_string();
                package.task_family_id = "TF-PERSONAL-QA".to_string();
                package.item_format_id = "IF-SPOKEN-MULTITURN".to_string();
                package.renderer.renderer_id = "REN-SPOKEN-MULTITURN".to_string();
                package.scoring_package = ScoringPackage {
                    item_scoring_version: default_item_scoring_version(),
                    scoring_contract_template_id: "SCT-S-A1-1-SPOKEN-MULTITURN-v0.1".to_string(),
                    scoring_contract_template_version: default_scoring_contract_template_version(),
                    max_raw_score: 0,
                    scoring_points: vec![],
                    answer_key_ref: None,
                    task_specific_criteria: vec![],
                    benchmark_set_version: Some("PendingRealCandidateResponses".to_string()),
                    correct_option_id: None,
                    correct_matches: BTreeMap::new(),
                    accepted_responses: BTreeMap::new(),
                    rubric_id: Some("RUB-S-A1-INTERACTION-v0.1".to_string()),
                };
                package.candidate_payload =
                    CandidatePayload::SpokenMultiturn(SpokenMultiturnCandidatePayload {
                        situation: String::new(),
                        instructions: String::new(),
                        roles: SpokenRoles {
                            system_role: "考官".to_string(),
                            candidate_role: "考生".to_string(),
                        },
                        interaction_mode: "fixed".to_string(),
                        start_path_id: "PATH-1".to_string(),
                        paths: vec![SpokenPath {
                            path_id: "PATH-1".to_string(),
                            turns: vec![
                                SpokenTurn {
                                    turn_id: "T1".to_string(),
                                    speaker: "system".to_string(),
                                    prompt_audio_ref: Some(String::new()),
                                    response_id: None,
                                    response_time_seconds: None,
                                    required_function_ids: vec![],
                                },
                                SpokenTurn {
                                    turn_id: "T2".to_string(),
                                    speaker: "candidate".to_string(),
                                    prompt_audio_ref: None,
                                    response_id: Some("R1".to_string()),
                                    response_time_seconds: Some(45),
                                    required_function_ids: vec!["回答个人信息".to_string()],
                                },
                            ],
                        }],
                        routing_rule_id: "fixed".to_string(),
                    });
                set_content_contract(&mut package, "A1-I1", "Speaking", "Interaction", "D01");
                package.content.difficulty = Some(difficulty_for("spokenTurns", 2, None));
            }
            _ => return None,
        }
        package.ensure_item_scoring_spec();
        Some(package)
    }

    pub fn ensure_item_scoring_spec(&mut self) {
        if self.scoring_package.item_scoring_version.trim().is_empty() {
            self.scoring_package.item_scoring_version = default_item_scoring_version();
        }
        if self
            .scoring_package
            .scoring_contract_template_version
            .trim()
            .is_empty()
        {
            self.scoring_package.scoring_contract_template_version =
                default_scoring_contract_template_version();
        }
        self.scoring_package.answer_key_ref = Some(
            match self.item_format_id.as_str() {
                "IF-SINGLE-SELECT" => "scoringPackage.correctOptionId",
                "IF-MATCHING" => "scoringPackage.correctMatches",
                "IF-RESTRICTED-INPUT" | "IF-FORM-ENTRY" => "scoringPackage.acceptedResponses",
                _ => "scoringPackage.rubricId",
            }
            .to_string(),
        );
        if self.scoring_package.scoring_points.is_empty() {
            self.scoring_package.scoring_points = match &self.candidate_payload {
                CandidatePayload::SingleSelect(_) => vec![scoring_point(
                    "SP-ITEM",
                    "Correct response",
                    1,
                    Some("NORM-NONE-v0.1"),
                )],
                CandidatePayload::Matching(payload) => payload
                    .left_items
                    .iter()
                    .map(|item| {
                        scoring_point(
                            &format!("SP-{}", item.item_id),
                            "Correct match",
                            1,
                            Some("NORM-NONE-v0.1"),
                        )
                    })
                    .collect(),
                CandidatePayload::RestrictedInput(payload) => payload
                    .response_fields
                    .iter()
                    .map(|field| {
                        scoring_point(
                            &format!("SP-{}", field.response_id),
                            field.label.as_deref().unwrap_or(&field.response_id),
                            1,
                            Some("NORM-SHORT-CORE-TEXT-v0.1"),
                        )
                    })
                    .collect(),
                CandidatePayload::FormEntry(payload) => payload
                    .fields
                    .iter()
                    .map(|field| {
                        let description = if field.label.trim().is_empty() {
                            "Form field".to_string()
                        } else {
                            field.label.clone()
                        };
                        scoring_point(
                            &format!("SP-{}", field.field_id),
                            &description,
                            1,
                            Some(normalization_for_input_type(&field.input_type)),
                        )
                    })
                    .collect(),
                CandidatePayload::TypedMessage(_) => vec![
                    scoring_point("SP-TASK", "Task fulfilment and key information", 3, None),
                    scoring_point("SP-COMPREHENSIBILITY", "Comprehensibility", 3, None),
                    scoring_point("SP-LANGUAGE", "Basic language control", 3, None),
                    scoring_point(
                        "SP-CONVENTIONS",
                        "Simplified Chinese and basic writing conventions",
                        3,
                        None,
                    ),
                ],
                CandidatePayload::SpokenSingle(_) => vec![
                    scoring_point("SP-TASK", "Task fulfilment and information accuracy", 3, None),
                    scoring_point(
                        "SP-INTELLIGIBILITY",
                        "Intelligibility and pronunciation control",
                        3,
                        None,
                    ),
                    scoring_point("SP-LANGUAGE", "Basic language control and fluency", 3, None),
                ],
                CandidatePayload::SpokenMultiturn(_) => vec![
                    scoring_point("SP-TASK", "Task fulfilment and relevance", 3, None),
                    scoring_point("SP-INTERACTION", "Interaction and responsiveness", 3, None),
                    scoring_point(
                        "SP-INTELLIGIBILITY",
                        "Intelligibility and pronunciation control",
                        3,
                        None,
                    ),
                    scoring_point("SP-LANGUAGE", "Basic language control and fluency", 3, None),
                ],
            };
        }
        self.scoring_package.max_raw_score = self
            .scoring_package
            .scoring_points
            .iter()
            .map(|point| point.points)
            .sum();
        if self.scoring_package.task_specific_criteria.is_empty() {
            self.scoring_package.task_specific_criteria = match &self.candidate_payload {
                CandidatePayload::TypedMessage(payload) => payload
                    .required_content_points
                    .iter()
                    .map(|point| point.description.trim())
                    .filter(|description| !description.is_empty())
                    .map(str::to_string)
                    .collect(),
                CandidatePayload::SpokenSingle(payload) => payload
                    .required_content_points
                    .iter()
                    .map(|point| point.description.trim())
                    .filter(|description| !description.is_empty())
                    .map(str::to_string)
                    .collect(),
                CandidatePayload::SpokenMultiturn(payload) => payload
                    .paths
                    .iter()
                    .flat_map(|path| &path.turns)
                    .flat_map(|turn| &turn.required_function_ids)
                    .map(|requirement| requirement.trim())
                    .filter(|requirement| !requirement.is_empty())
                    .map(str::to_string)
                    .collect(),
                _ => vec![],
            };
        }
    }
}

fn scoring_point(
    id: &str,
    description: &str,
    points: u16,
    normalization_policy_id: Option<&str>,
) -> ScoringPoint {
    ScoringPoint {
        scoring_point_id: id.to_string(),
        description: description.to_string(),
        points,
        normalization_policy_id: normalization_policy_id.map(str::to_string),
    }
}

fn normalization_for_input_type(input_type: &str) -> &'static str {
    match input_type {
        "number" => "NORM-NUMBER-v0.1",
        "date" => "NORM-DATE-v0.1",
        "time" => "NORM-TIME-v0.1",
        "phone" => "NORM-PHONE-v0.1",
        _ => "NORM-SHORT-CORE-TEXT-v0.1",
    }
}

fn empty_stimulus() -> Stimulus {
    Stimulus {
        text: Some(String::new()),
        image_refs: vec![],
        audio_ref: None,
    }
}

fn default_matching_items(prefix: &str) -> Vec<MatchingItem> {
    (1..=2)
        .map(|index| MatchingItem {
            item_id: format!("{prefix}{index}"),
            text: Some(String::new()),
            image_ref: None,
        })
        .collect()
}

fn set_content_contract(
    package: &mut TaskPackage,
    can_do: &str,
    skill: &str,
    activity: &str,
    context: &str,
) {
    package.content.primary_can_do_id = can_do.to_string();
    package.content.primary_reported_skill = skill.to_string();
    package.content.communicative_activity = activity.to_string();
    package.content.primary_domain = if skill == "Speaking" {
        "Personal".to_string()
    } else {
        "Public".to_string()
    };
    package.content.context_id = context.to_string();
}

fn difficulty_for(
    output_length: &str,
    interaction_turns: u8,
    prep: Option<u16>,
) -> DifficultyProfile {
    let mut difficulty = DifficultyProfile::r_a1_1_typical();
    difficulty.drivers.output_length = output_length.to_string();
    difficulty.drivers.interaction_turns = interaction_turns;
    difficulty.drivers.preparation_time_seconds = prep;
    difficulty.drivers.distractor_similarity =
        if output_length == "selectedOption" || output_length == "matchedOptions" {
            "moderate".to_string()
        } else {
            "notApplicable".to_string()
        };
    difficulty.rationale = vec!["题面、支持程度与作答负荷符合所选 A1 内部难度".to_string()];
    difficulty
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItem {
    pub id: String,
    pub title: String,
    pub owner_email: String,
    pub status: LanguageItemStatus,
    #[serde(default)]
    pub record_state: LanguageItemRecordState,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_state_updated_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub record_state_updated_by: Option<String>,
    #[serde(default)]
    pub has_staging_export: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub github_review: Option<GithubReviewLink>,
    pub revision: u64,
    pub draft: TaskPackage,
    pub latest_version_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum GithubReviewState {
    Open,
    ChangesRequested,
    Approved,
    Merged,
    Closed,
    SyncFailed,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubReviewLink {
    pub batch_id: String,
    pub repository: String,
    pub pull_request_number: u64,
    pub pull_request_url: String,
    pub base_ref: String,
    pub head_ref: String,
    pub head_sha: String,
    pub repository_path: String,
    pub source_version_id: String,
    pub source_content_hash: String,
    pub state: GithubReviewState,
    pub approval_count: usize,
    pub changes_requested_count: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub merge_commit_sha: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub approved_version_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sync_error: Option<String>,
    pub last_synced_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubReviewBatch {
    pub batch_id: String,
    pub repository: String,
    pub pull_request_number: u64,
    pub pull_request_url: String,
    pub state: GithubReviewState,
    pub item_ids: Vec<String>,
    pub approval_count: usize,
    pub changes_requested_count: usize,
    pub last_synced_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemVersion {
    pub id: String,
    pub item_id: String,
    pub version_number: u64,
    pub created_from_draft_revision: u64,
    pub author_email: String,
    pub submitted_by: String,
    pub frozen: bool,
    pub content_hash: String,
    pub lifecycle_status: String,
    pub package: TaskPackage,
    pub validation: ValidationResult,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskPackageChange {
    pub path: String,
    pub partition: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemVersionDiff {
    pub version_id: String,
    pub base_version_id: Option<String>,
    pub changes: Vec<TaskPackageChange>,
    pub truncated: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub severity: String,
    pub code: String,
    pub path: String,
    pub rule_ref: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub registry_bundle_version: String,
    pub issues: Vec<ValidationIssue>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiCandidate {
    pub id: String,
    pub ordinal: u8,
    pub status: String,
    pub candidate_payload: CandidatePayload,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposed_correct_option_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proposed_scoring_package: Option<ScoringPackage>,
    pub validation: ValidationResult,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiGenerationRun {
    pub id: String,
    pub item_id: String,
    pub provider: String,
    pub model: String,
    pub model_version: String,
    pub prompt_id: String,
    pub prompt_version: String,
    pub output_schema_version: String,
    pub spec_versions: SpecVersions,
    pub blueprint_slot_id: String,
    pub task_family_id: String,
    pub item_format_id: String,
    pub renderer_id: String,
    pub primary_can_do_id: String,
    pub primary_domain: String,
    pub context_id: String,
    pub difficulty_band: String,
    pub target_content_ids: Vec<String>,
    pub required_information_points: Vec<String>,
    pub requested_count: u8,
    pub candidates: Vec<AiCandidate>,
    pub adopted_candidate_id: Option<String>,
    pub status: String,
    pub error: Option<String>,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiFinding {
    pub category: String,
    pub severity: String,
    pub code: String,
    pub field_path: String,
    pub rule_ref: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReviewRun {
    pub id: String,
    pub version_id: Option<String>,
    pub item_id: String,
    pub draft_revision: Option<u64>,
    pub provider: String,
    pub model: String,
    pub model_version: String,
    pub prompt_id: String,
    pub prompt_version: String,
    pub schema_version: String,
    pub spec_versions: SpecVersions,
    pub findings: Vec<AiFinding>,
    pub status: String,
    pub error: Option<String>,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemReview {
    pub id: String,
    pub version_id: String,
    pub gate_id: String,
    pub decision: ReviewDecision,
    pub field_path: Option<String>,
    pub rule_ref: Option<String>,
    pub comment: String,
    pub reviewer_email: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemReviewDiscussion {
    pub id: String,
    pub item_id: String,
    pub version_id: String,
    pub version_number: u64,
    pub gate_id: String,
    pub kind: ReviewDiscussionKind,
    pub subject: String,
    pub field_path: Option<String>,
    pub rule_ref: Option<String>,
    pub created_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemReviewDiscussionEvent {
    pub id: String,
    pub discussion_id: String,
    pub kind: ReviewDiscussionEventKind,
    pub message: String,
    pub actor_email: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemReviewDiscussionView {
    #[serde(flatten)]
    pub discussion: LanguageItemReviewDiscussion,
    pub status: ReviewDiscussionStatus,
    pub events: Vec<LanguageItemReviewDiscussionEvent>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemExport {
    pub id: String,
    pub version_id: String,
    pub item_id: String,
    pub target: String,
    pub artifact_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_exam_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_question_set_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub legacy_question_id: Option<String>,
    pub option_answer_ids: BTreeMap<String, String>,
    pub result: String,
    pub exported_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemAssemblySource {
    pub item_id: String,
    pub version_id: String,
    pub item_export_id: String,
    pub legacy_question_set_id: String,
    pub legacy_question_id: String,
    pub option_answer_ids: BTreeMap<String, String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemAssembly {
    pub id: String,
    pub title: String,
    pub blueprint_slot_id: String,
    pub target: String,
    pub artifact_id: String,
    pub legacy_exam_id: String,
    pub source_content_hash: String,
    pub sources: Vec<LanguageItemAssemblySource>,
    pub result: String,
    pub exported_by: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagingLanguageItem {
    pub id: String,
    pub source_version_id: String,
    pub source_item_id: String,
    pub package: TaskPackage,
    pub exported_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LanguageItemAuditEvent {
    pub id: String,
    pub item_id: String,
    pub version_id: Option<String>,
    pub action: String,
    pub actor_email: String,
    pub details: Value,
    pub created_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn legacy_items_default_to_active_record_state() {
        let item: LanguageItem = serde_json::from_value(serde_json::json!({
            "id": "LI-legacy",
            "title": "Legacy item",
            "ownerEmail": "author@example.test",
            "status": "draft",
            "hasStagingExport": false,
            "githubReview": null,
            "revision": 1,
            "draft": TaskPackage::new("LI-legacy".to_string()),
            "latestVersionId": null,
            "createdAt": "2026-09-04T00:00:00Z",
            "updatedAt": "2026-09-04T00:00:00Z"
        }))
        .expect("legacy item deserializes");

        assert_eq!(item.record_state, LanguageItemRecordState::Active);
        assert!(item.record_state_updated_at.is_none());
        assert!(item.record_state_updated_by.is_none());
    }

    #[test]
    fn record_states_use_stable_camel_case_values() {
        assert_eq!(
            serde_json::to_value(LanguageItemRecordState::Archived).expect("serialize state"),
            serde_json::json!("archived")
        );
        assert_eq!(
            serde_json::to_value(LanguageItemRecordState::Deleted).expect("serialize state"),
            serde_json::json!("deleted")
        );
    }

    #[test]
    fn candidate_preview_excludes_authoring_scoring_and_review_partitions() {
        let package = TaskPackage::new("LI-PREVIEW".to_string());
        let preview = serde_json::to_value(CandidatePreview::from(&package))
            .expect("candidate preview serializes");
        let object = preview.as_object().expect("preview is an object");

        assert_eq!(object.len(), 4);
        assert!(object.contains_key("candidatePayload"));
        assert!(!object.contains_key("authoringPackage"));
        assert!(!object.contains_key("scoringPackage"));
        assert!(!object.contains_key("reviewPackage"));
        assert!(!preview.to_string().contains("correctOptionId"));
    }

    #[test]
    fn task_package_hash_changes_with_candidate_content() {
        let original = TaskPackage::new("LI-HASH".to_string());
        let mut changed = original.clone();
        changed
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .prompt = "changed".to_string();

        assert_eq!(task_package_hash(&original), task_package_hash(&original));
        assert_ne!(task_package_hash(&original), task_package_hash(&changed));
    }

    #[test]
    fn candidate_payload_rejects_answer_leakage_fields() {
        let package = TaskPackage::new("LI-LEAK".to_string());
        let mut value = serde_json::to_value(package).expect("TaskPackage serializes");
        value["candidatePayload"]["correctOptionId"] = Value::String("A".to_string());

        let result = serde_json::from_value::<TaskPackage>(value);

        assert!(result.is_err());
    }

    #[test]
    fn item_scoring_spec_is_seeded_from_the_response_model() {
        let package = TaskPackage::from_template("LI-SCORING".to_string(), "reading-matching")
            .expect("matching template");

        assert_eq!(package.scoring_package.scoring_points.len(), 2);
        assert_eq!(package.scoring_package.max_raw_score, 2);
        assert_eq!(
            package.scoring_package.answer_key_ref.as_deref(),
            Some("scoringPackage.correctMatches")
        );
    }

    #[test]
    fn legacy_string_information_points_are_upgraded_when_read() {
        let package = TaskPackage::new("LI-LEGACY-POINT".to_string());
        let mut value = serde_json::to_value(package).expect("TaskPackage serializes");
        value["content"]["requiredInformationPoints"] = serde_json::json!(["营业时间"]);

        let restored = serde_json::from_value::<TaskPackage>(value)
            .expect("legacy information points remain readable");

        assert_eq!(restored.content.required_information_points[0].id, "IP1");
        assert_eq!(
            restored.content.required_information_points[0].label,
            "营业时间"
        );
    }
}
