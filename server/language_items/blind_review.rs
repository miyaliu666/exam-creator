use std::collections::HashSet;

use http::StatusCode;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use crate::{config::LanguageItemAiProviderConfig, errors::Error};

use super::{
    ai,
    domain::{CandidatePayload, TaskPackage},
    review_rules::ReviewEvidence,
    validation::validate_candidate_privacy,
};

pub const PROTOCOL_VERSION: &str = "1";
pub const PROMPT_VERSION: &str = "0.2";
pub const PROMPT: &str = include_str!("prompts/blind-answer-v0.2.md");
pub const OUTPUT_SCHEMA: &str = include_str!("prompts/blind-answer-output-v0.1.schema.json");

#[cfg(test)]
#[path = "blind_review_tests.rs"]
mod tests;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum BlindAnswerStatus {
    Answered,
    Ambiguous,
    InsufficientInformation,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BlindAnswerAttempt {
    pub protocol_version: String,
    pub prompt_version: String,
    pub input_hash: String,
    pub simulated: bool,
    pub status: BlindAnswerStatus,
    pub answer: String,
    pub alternatives: Vec<String>,
    pub reasoning: String,
    pub evidence: Vec<ReviewEvidence>,
    pub limitations: Vec<String>,
}

// Provider responses cannot supply or replace the server-owned binding or simulation marker.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct BlindAnswerOutput {
    status: BlindAnswerStatus,
    answer: String,
    alternatives: Vec<String>,
    reasoning: String,
    evidence: Vec<ReviewEvidence>,
    limitations: Vec<String>,
}

fn invalid(message: &str) -> Error {
    Error::Server(StatusCode::UNPROCESSABLE_ENTITY, message.to_string())
}

fn normalized_key(key: &str) -> String {
    key.chars()
        .filter(char::is_ascii_alphanumeric)
        .map(|character| character.to_ascii_lowercase())
        .collect()
}

// sourceProfile is intentionally extensible. Apply the shared candidate privacy boundary,
// plus the author-only requirement fields that this independent solve must never receive.
fn has_blind_private_fields(value: &Value) -> bool {
    match value {
        Value::Object(fields) => fields.iter().any(|(key, child)| {
            matches!(
                normalized_key(key).as_str(),
                "taskpackage"
                    | "targetcontent"
                    | "targetcontentids"
                    | "supportingcontentrefs"
                    | "requiredinformationpoints"
                    | "informationpoints"
                    | "validation"
                    | "validationresult"
                    | "validationhints"
                    | "findings"
                    | "reviewplan"
                    | "checkresults"
                    | "expectedanswer"
                    | "expectedanswers"
                    | "correctresponse"
                    | "solution"
                    | "solutions"
                    | "translation"
                    | "translations"
                    | "englishtranslation"
                    | "englishgloss"
            ) || has_blind_private_fields(child)
        }),
        Value::Array(entries) => entries.iter().any(has_blind_private_fields),
        _ => false,
    }
}

// Keep this whitelist aligned with single-select-preview.tsx and candidate-previews.tsx.
// Being stored in candidatePayload does not by itself make a field visible in the renderer.
fn visible_payload(payload: &CandidatePayload) -> Value {
    match payload {
        CandidatePayload::ExerciseTemplate(payload) => json!(payload),
        CandidatePayload::SingleSelect(payload) => json!({
            "stimulus": {"text": payload.stimulus.text, "audioRef": payload.stimulus.audio_ref},
            "prompt": payload.prompt,
            "options": payload.options.iter().map(|option| json!({
                "optionId": option.option_id, "text": option.text,
            })).collect::<Vec<_>>(),
        }),
        CandidatePayload::Matching(payload) => json!({
            "stimulus": {"text": payload.stimulus.text, "audioRef": payload.stimulus.audio_ref},
            "prompt": payload.prompt,
            "leftItems": payload.left_items.iter().map(|item| json!({
                "itemId": item.item_id, "text": item.text,
            })).collect::<Vec<_>>(),
            "rightItems": payload.right_items.iter().map(|item| json!({
                "itemId": item.item_id, "text": item.text,
            })).collect::<Vec<_>>(),
        }),
        CandidatePayload::RestrictedInput(payload) => json!({
            "stimulus": {"text": payload.stimulus.text, "audioRef": payload.stimulus.audio_ref},
            "prompt": payload.prompt,
            "responseFields": payload.response_fields.iter().map(|field| json!({
                "responseId": field.response_id, "label": field.label,
                "maxLength": field.max_length, "placeholder": field.placeholder,
            })).collect::<Vec<_>>(),
        }),
        CandidatePayload::FormEntry(payload) => json!({
            "situation": payload.situation, "instructions": payload.instructions,
            "fields": payload.fields.iter().map(|field| json!({
                "fieldId": field.field_id, "label": field.label, "required": field.required,
                "maxLength": field.max_length, "placeholder": field.placeholder,
            })).collect::<Vec<_>>(),
        }),
        CandidatePayload::TypedMessage(payload) => json!({
            "situation": payload.situation, "instructions": payload.instructions,
            "sourceMessage": payload.source_message, "recipient": payload.recipient,
            "purpose": payload.purpose, "requiredContentPoints": payload.required_content_points,
            "lengthGuidance": {
                "minimum": payload.length_guidance.minimum, "maximum": payload.length_guidance.maximum,
            },
        }),
        CandidatePayload::SpokenSingle(payload) => {
            let mut visible = json!({
                "situation": payload.situation, "instructions": payload.instructions,
                "preparationTimeSeconds": payload.preparation_time_seconds,
                "responseTimeSeconds": payload.response_time_seconds,
            });
            if payload
                .visible_prompt_text
                .as_deref()
                .is_some_and(|text| !text.is_empty())
            {
                visible["visiblePromptText"] = json!(payload.visible_prompt_text);
            } else {
                visible["promptAudioRef"] = json!(payload.prompt_audio_ref);
            }
            visible
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            let selected = payload
                .paths
                .iter()
                .position(|path| path.path_id == payload.start_path_id)
                .unwrap_or(0);
            // Retain original indices for evidence pointers, without sending unseen paths.
            let paths = payload.paths.iter().enumerate().map(|(index, path)| {
                if index != selected { return Value::Null; }
                json!({
                    "pathId": path.path_id,
                    "turns": path.turns.iter().map(|turn| {
                        let mut visible = json!({"turnId": turn.turn_id, "speaker": turn.speaker});
                        if turn.speaker == "system" {
                            visible["promptAudioRef"] = json!(turn.prompt_audio_ref);
                        } else {
                            visible["responseId"] = json!(turn.response_id);
                        }
                        visible
                    }).collect::<Vec<_>>(),
                })
            }).collect::<Vec<_>>();
            json!({
                "situation": payload.situation, "instructions": payload.instructions,
                "roles": payload.roles, "paths": paths,
            })
        }
    }
}

/// The entire item-specific input to the first, stateless provider request.
/// Do not add registry constraints, scoring, authoring metadata or generation history here.
pub fn candidate_input(package: &TaskPackage) -> Result<Value, Error> {
    if !validate_candidate_privacy(package).is_empty() {
        return Err(invalid(
            "Independent answering cannot receive private metadata in candidate-visible content",
        ));
    }
    let generic_format = match &package.candidate_payload {
        CandidatePayload::ExerciseTemplate(payload) => {
            format!("EXERCISE:{}", payload.exercise_type)
        }
        _ => String::new(),
    };
    let expected_format = match &package.candidate_payload {
        CandidatePayload::ExerciseTemplate(_) => generic_format.as_str(),
        CandidatePayload::SingleSelect(_) => "IF-SINGLE-SELECT",
        CandidatePayload::Matching(_) => "IF-MATCHING",
        CandidatePayload::RestrictedInput(_) => "IF-RESTRICTED-INPUT",
        CandidatePayload::FormEntry(_) => "IF-FORM-ENTRY",
        CandidatePayload::TypedMessage(_) => "IF-TYPED-MESSAGE",
        CandidatePayload::SpokenSingle(_) => "IF-SPOKEN-SINGLE",
        CandidatePayload::SpokenMultiturn(_) => "IF-SPOKEN-MULTITURN",
    };
    if package.item_format_id != expected_format {
        return Err(invalid(
            "The item format does not match its candidate-visible content",
        ));
    }
    let candidate = serde_json::to_value(&package.candidate_payload).expect("candidate serializes");
    if has_blind_private_fields(&candidate) {
        return Err(invalid(
            "Independent answering cannot receive author requirements, translations or review hints in candidate-visible content",
        ));
    }
    Ok(json!({
        "itemFormatId": &package.item_format_id,
        "candidatePayload": visible_payload(&package.candidate_payload),
    }))
}

fn input_hash(input: &Value) -> String {
    hex::encode(Sha256::digest(
        serde_json::to_vec(input).expect("candidate input serializes"),
    ))
}

fn has_reference(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.trim().is_empty(),
        Value::Array(entries) => entries.iter().any(has_reference),
        Value::Object(fields) => fields.values().any(has_reference),
        _ => true,
    }
}

fn unavailable_material_fields(value: &Value, path: &str, fields: &mut Vec<String>) {
    match value {
        Value::Object(entries) => {
            for (key, child) in entries {
                let pointer_key = key.replace('~', "~0").replace('/', "~1");
                let child_path = format!("{path}/{pointer_key}");
                if matches!(
                    normalized_key(key).as_str(),
                    "imageref"
                        | "src"
                        | "imagerefs"
                        | "imageurl"
                        | "audioref"
                        | "audiorefs"
                        | "audiourl"
                        | "promptaudioref"
                        | "videoref"
                        | "videorefs"
                        | "videourl"
                        | "sourcematerialref"
                        | "sourcematerialrefs"
                ) && has_reference(child)
                {
                    fields.push(child_path);
                } else {
                    unavailable_material_fields(child, &child_path, fields);
                }
            }
        }
        Value::Array(entries) => {
            for (index, child) in entries.iter().enumerate() {
                unavailable_material_fields(child, &format!("{path}/{index}"), fields);
            }
        }
        _ => {}
    }
}

fn missing_material(package: &TaskPackage) -> Vec<String> {
    let mut fields = Vec::new();
    let candidate = serde_json::to_value(&package.candidate_payload).expect("candidate serializes");
    unavailable_material_fields(&candidate, "/candidatePayload", &mut fields);
    fields
}

fn insufficient(input: &Value, simulated: bool, reason: &str) -> BlindAnswerAttempt {
    BlindAnswerAttempt {
        protocol_version: PROTOCOL_VERSION.to_string(),
        prompt_version: PROMPT_VERSION.to_string(),
        input_hash: input_hash(input),
        simulated,
        status: BlindAnswerStatus::InsufficientInformation,
        answer: String::new(),
        alternatives: vec![],
        reasoning: reason.to_string(),
        evidence: vec![],
        limitations: vec![reason.to_string()],
    }
}

#[cfg(test)]
pub(crate) fn test_attempt(package: &TaskPackage) -> BlindAnswerAttempt {
    insufficient(
        &candidate_input(package).expect("test item has candidate-safe content"),
        false,
        "The test fixture records an incomplete independent attempt for human review.",
    )
}

pub async fn attempt(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
) -> Result<BlindAnswerAttempt, Error> {
    let input = candidate_input(package)?;
    if matches!(config, LanguageItemAiProviderConfig::DeterministicMock) {
        return Ok(insufficient(
            &input,
            true,
            "Offline simulation did not independently answer this item. A real AI review is required.",
        ));
    }
    let unavailable = missing_material(package);
    if !unavailable.is_empty() {
        // References are not fetched, rendered or sent as actual multimodal input. Conservatively
        // keep the check incomplete even when accompanying text might duplicate the material.
        return Ok(insufficient(
            &input,
            false,
            &format!(
                "Independent answering could not inspect referenced media or source material at {}. These references do not provide their contents to the reviewer.",
                unavailable.join(", ")
            ),
        ));
    }
    let binding = input_hash(&input);
    let output = ai::request_rule_output(
        config,
        http_client,
        PROMPT,
        input,
        "language_item_blind_answer",
        serde_json::from_str(OUTPUT_SCHEMA).expect("blind answer schema is valid"),
        json!({
            "status": "insufficientInformation",
            "answer": "",
            "alternatives": [],
            "reasoning": "Explain which candidate-visible information is missing.",
            "evidence": [],
            "limitations": ["Describe the missing information; this example is only a shape guide."],
        }),
    )
    .await?;
    let output: BlindAnswerOutput = serde_json::from_value(output).map_err(|_| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            "The AI returned an invalid independent answer report".to_string(),
        )
    })?;
    let result = BlindAnswerAttempt {
        protocol_version: PROTOCOL_VERSION.to_string(),
        prompt_version: PROMPT_VERSION.to_string(),
        input_hash: binding,
        simulated: false,
        status: output.status,
        answer: output.answer,
        alternatives: output.alternatives,
        reasoning: output.reasoning,
        evidence: output.evidence,
        limitations: output.limitations,
    };
    validate_attempt(package, &result)?;
    Ok(result)
}

/// Validate both a fresh response and a saved attempt against the permitted input.
/// Callers must additionally bind the overall review to the full authored content hash.
pub fn validate_attempt(package: &TaskPackage, attempt: &BlindAnswerAttempt) -> Result<(), Error> {
    let input = candidate_input(package)?;
    if attempt.protocol_version != PROTOCOL_VERSION
        || attempt.prompt_version != PROMPT_VERSION
        || attempt.input_hash != input_hash(&input)
    {
        return Err(invalid(
            "The independent answer report does not match this item's current candidate-visible content and protocol",
        ));
    }
    if attempt.reasoning.trim().is_empty()
        || attempt
            .limitations
            .iter()
            .any(|value| value.trim().is_empty())
        || attempt
            .alternatives
            .iter()
            .any(|value| value.trim().is_empty())
    {
        return Err(invalid(
            "Independent answer explanations, alternatives and limitations cannot be blank",
        ));
    }
    if (attempt.simulated || !missing_material(package).is_empty())
        && attempt.status != BlindAnswerStatus::InsufficientInformation
    {
        return Err(invalid(
            "Simulation or unavailable source material cannot establish an independently answered item",
        ));
    }
    match attempt.status {
        BlindAnswerStatus::Answered | BlindAnswerStatus::Ambiguous => {
            if attempt.answer.trim().is_empty() || attempt.evidence.is_empty() {
                return Err(invalid(
                    "An independent answer requires a response and exact candidate-visible evidence",
                ));
            }
            if attempt.status == BlindAnswerStatus::Answered && !attempt.alternatives.is_empty() {
                return Err(invalid(
                    "Competing defensible answers must be reported as ambiguous",
                ));
            }
            if attempt.status == BlindAnswerStatus::Ambiguous && attempt.alternatives.is_empty() {
                return Err(invalid(
                    "An ambiguous item must identify at least one competing answer or interpretation",
                ));
            }
            let mut answers = HashSet::from([attempt.answer.trim()]);
            for alternative in &attempt.alternatives {
                if !answers.insert(alternative.trim()) {
                    return Err(invalid("Independent alternative answers must be distinct"));
                }
            }
            if let CandidatePayload::SingleSelect(payload) = &package.candidate_payload {
                for answer in std::iter::once(&attempt.answer).chain(&attempt.alternatives) {
                    if !payload
                        .options
                        .iter()
                        .any(|option| &option.option_id == answer)
                    {
                        return Err(invalid(
                            "A single-select independent answer must identify an available option ID",
                        ));
                    }
                }
            }
        }
        BlindAnswerStatus::InsufficientInformation => {
            if !attempt.answer.is_empty()
                || !attempt.alternatives.is_empty()
                || attempt.limitations.is_empty()
            {
                return Err(invalid(
                    "An incomplete independent attempt must explain its limitation without asserting an answer",
                ));
            }
        }
    }
    for evidence in &attempt.evidence {
        if evidence.quote.trim().is_empty()
            || !evidence.field_path.starts_with("/candidatePayload/")
        {
            return Err(invalid(
                "Independent answer evidence must quote candidate-visible text using an absolute JSON pointer",
            ));
        }
        let exact = input
            .pointer(&evidence.field_path)
            .and_then(Value::as_str)
            .is_some_and(|original| original.contains(&evidence.quote));
        if !exact {
            return Err(invalid(
                "Independent answer evidence does not match the original candidate-visible text",
            ));
        }
    }
    Ok(())
}
