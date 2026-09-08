use std::sync::Arc;

use futures_util::future::join_all;
use http::StatusCode;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{config::LanguageItemAiProviderConfig, errors::Error};

use super::{
    domain::{
        AiCandidate, AiFinding, CandidatePayload, ScoringPackage, SingleSelectCandidatePayload,
        SingleSelectOption, Stimulus, TaskPackage,
    },
    registry::{
        RegistrySnapshot, capability_for, difficulty_standards_for_capability, snapshot_for,
    },
    validation::validate_task_package,
};

#[cfg(test)]
use super::registry::snapshot;

pub const PROVIDER: &str = "deterministic-mock";
pub const MODEL: &str = "workbench-fixture-v1";
pub const MODEL_VERSION: &str = "1";
pub const GENERATION_PROMPT_ID: &str = "a1-item-generation";
pub const GENERATION_PROMPT_VERSION: &str = "0.5";
pub const REVIEW_PROMPT_ID: &str = "a1-item-independent-review";
pub const REVIEW_PROMPT_VERSION: &str = "0.3";
pub const REVIEW_SCHEMA_VERSION: &str = "0.1";
pub const GENERATION_OUTPUT_SCHEMA_VERSION: &str = "0.2";
pub const GENERATION_PROMPT: &str = include_str!("prompts/generation-v0.5.md");
pub const GENERATION_OUTPUT_SCHEMA: &str =
    include_str!("prompts/generation-output-v0.2.schema.json");
pub const REVIEW_PROMPT: &str = include_str!("prompts/review-v0.3.md");
pub const REVIEW_OUTPUT_SCHEMA: &str = include_str!("prompts/review-output-v0.1.schema.json");

fn pinned_registry(package: &TaskPackage) -> Result<Arc<RegistrySnapshot>, Error> {
    snapshot_for(&package.spec_versions.registry_bundle_version).ok_or_else(|| {
        Error::Server(
            StatusCode::CONFLICT,
            format!(
                "Registry version {} is unavailable; the item cannot use a different rule version",
                package.spec_versions.registry_bundle_version
            ),
        )
    })
}

pub struct ProviderMetadata<'a> {
    pub provider: &'a str,
    pub model: &'a str,
    pub model_version: &'a str,
}

pub fn provider_metadata(config: &LanguageItemAiProviderConfig) -> ProviderMetadata<'_> {
    match config {
        LanguageItemAiProviderConfig::DeterministicMock => ProviderMetadata {
            provider: PROVIDER,
            model: MODEL,
            model_version: MODEL_VERSION,
        },
        LanguageItemAiProviderConfig::DeepSeek { model, .. } => ProviderMetadata {
            provider: "deepseek",
            model,
            model_version: model,
        },
        LanguageItemAiProviderConfig::OpenAi { model, .. } => ProviderMetadata {
            provider: "openai",
            model,
            model_version: model,
        },
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GeneratedCandidate {
    candidate_payload: CandidatePayload,
    proposed_scoring_package: ScoringPackage,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct GenerationOutput {
    candidates: Vec<GeneratedCandidate>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ReviewOutput {
    findings: Vec<AiFinding>,
}

pub struct CandidateGenerationReport {
    pub candidates: Vec<AiCandidate>,
    pub errors: Vec<String>,
    pub attempt_count: u32,
    pub retry_count: u32,
}

pub async fn generate_candidates_independently(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    count: u8,
) -> CandidateGenerationReport {
    match config {
        LanguageItemAiProviderConfig::DeterministicMock => CandidateGenerationReport {
            candidates: generate_mock_candidates(package, count),
            errors: Vec::new(),
            attempt_count: u32::from(count),
            retry_count: 0,
        },
        LanguageItemAiProviderConfig::DeepSeek { .. }
        | LanguageItemAiProviderConfig::OpenAi { .. } => {
            let initial_results = join_all((1..=count).map(|ordinal| {
                generate_provider_candidate(config, http_client, package, ordinal, None)
            }))
            .await;
            let mut candidates = Vec::with_capacity(usize::from(count));
            let mut errors = Vec::new();
            let mut retry_count = 0_u32;

            for (index, result) in initial_results.into_iter().enumerate() {
                let ordinal = index as u8 + 1;
                match result {
                    Ok(candidate) if candidate.validation.valid => candidates.push(candidate),
                    Ok(candidate) => {
                        retry_count += 1;
                        match generate_provider_candidate(
                            config,
                            http_client,
                            package,
                            ordinal,
                            Some(&candidate),
                        )
                        .await
                        {
                            Ok(repaired) => candidates.push(repaired),
                            Err(error) => {
                                errors.push(format!("Candidate {ordinal} repair failed: {error}"));
                                candidates.push(candidate);
                            }
                        }
                    }
                    Err(error) => {
                        errors.push(format!("Candidate {ordinal} generation failed: {error}"));
                    }
                }
            }
            candidates.sort_by_key(|candidate| candidate.ordinal);
            CandidateGenerationReport {
                candidates,
                errors,
                attempt_count: u32::from(count) + retry_count,
                retry_count,
            }
        }
    }
}

async fn generate_provider_candidate(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    ordinal: u8,
    repair_candidate: Option<&AiCandidate>,
) -> Result<AiCandidate, Error> {
    let (api_key, base_url, model) = match config {
        LanguageItemAiProviderConfig::DeepSeek {
            api_key,
            base_url,
            model,
        }
        | LanguageItemAiProviderConfig::OpenAi {
            api_key,
            base_url,
            model,
        } => (api_key, base_url, model),
        LanguageItemAiProviderConfig::DeterministicMock => unreachable!(),
    };
    let registry = pinned_registry(package)?;
    let mut output_schema: Value = serde_json::from_str(GENERATION_OUTPUT_SCHEMA)
        .expect("generation output schema is valid JSON");
    let schema_index = match package.item_format_id.as_str() {
        "IF-SINGLE-SELECT" => 0,
        "IF-MATCHING" => 1,
        "IF-RESTRICTED-INPUT" => 2,
        "IF-FORM-ENTRY" => 3,
        "IF-TYPED-MESSAGE" => 4,
        "IF-SPOKEN-SINGLE" => 5,
        "IF-SPOKEN-MULTITURN" => 6,
        _ => 0,
    };
    output_schema["properties"]["candidates"]["minItems"] = json!(1);
    output_schema["properties"]["candidates"]["maxItems"] = json!(1);
    output_schema["properties"]["candidates"]["items"]["properties"]["candidatePayload"] =
        registry.candidate_schemas[schema_index].clone();
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
        .collect::<Vec<_>>();
    let context = registry
        .context_options
        .iter()
        .find(|entry| entry.id == package.content.context_id);
    let capability = capability_for(
        &registry,
        &package.blueprint_slot_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    );
    let scoring_contract = registry.scoring_contracts.iter().find(|entry| {
        entry.scoring_contract_template_id == package.scoring_package.scoring_contract_template_id
    });
    let variation_focus = [
        "Use a distinct everyday setting and wording while preserving the locked context.",
        "Vary names, times, or concrete details without changing difficulty or construct.",
        "Use a different communicative micro-situation within the locked context.",
        "Prefer a concise alternative structure and avoid overlap with earlier candidates.",
        "Use fresh surface details while keeping all information points directly observable.",
    ][usize::from(ordinal.saturating_sub(1)) % 5];
    let current_payload = repair_candidate
        .map(|candidate| &candidate.candidate_payload)
        .unwrap_or(&package.candidate_payload);
    let current_scoring = repair_candidate
        .and_then(|candidate| candidate.proposed_scoring_package.as_ref())
        .unwrap_or(&package.scoring_package);
    let repair_issues = repair_candidate.map(|candidate| &candidate.validation.issues);
    let input = json!({
        "requestedCandidateCount": 1,
        "candidateOrdinal": ordinal,
        "variationFocus": variation_focus,
        "lockedConstraints": {
            "blueprintSlotId": package.blueprint_slot_id,
            "taskFamilyId": package.task_family_id,
            "itemFormatId": package.item_format_id,
            "rendererId": package.renderer.renderer_id,
            "primaryCanDoId": package.content.primary_can_do_id,
            "primaryDomain": package.content.primary_domain,
            "contextId": package.content.context_id,
            "context": context,
            "difficultyBand": package.content.difficulty_band,
            "difficulty": package.content.difficulty,
            "targetContentIds": package.content.target_content_ids,
            "targetContent": selected_content,
            "requiredInformationPoints": package.content.required_information_points,
            "supportingContentRefs": package.content.supporting_content_refs,
        },
        "taskBrief": {
            "capability": capability,
            "scoringContract": scoring_contract,
        },
        "currentCandidatePayload": current_payload,
        "currentScoringPackage": current_scoring,
        "repairValidationIssues": repair_issues,
        "instruction": if repair_candidate.is_some() {
            "Repair this candidate once so every supplied deterministic validation issue is resolved. Return exactly one candidate."
        } else {
            "Generate exactly one independent candidate."
        },
    });
    let request = StructuredOutputRequest {
        api_key,
        base_url,
        model,
        instructions: GENERATION_PROMPT,
        input,
        format_name: "language_item_generation",
        schema: output_schema,
        example: json!({
            "candidates": [{
                "candidatePayload": current_payload,
                "proposedScoringPackage": current_scoring,
            }],
        }),
    };
    let value = match config {
        LanguageItemAiProviderConfig::DeepSeek { .. } => {
            deepseek_chat_structured_output(http_client, request).await?
        }
        LanguageItemAiProviderConfig::OpenAi { .. } => {
            responses_structured_output(http_client, request).await?
        }
        LanguageItemAiProviderConfig::DeterministicMock => unreachable!(),
    };
    let mut output: GenerationOutput = serde_json::from_value(value).map_err(|error| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("AI generation output did not match the application contract: {error}"),
        )
    })?;
    if output.candidates.len() != 1 {
        return Err(Error::Server(
            StatusCode::BAD_GATEWAY,
            format!(
                "AI returned {} candidates; exactly one was requested for candidate {ordinal}",
                output.candidates.len()
            ),
        ));
    }
    Ok(candidate_from_provider(
        package,
        output.candidates.remove(0),
        ordinal,
    ))
}

pub async fn review(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
) -> Result<Vec<AiFinding>, Error> {
    match config {
        LanguageItemAiProviderConfig::DeterministicMock => Ok(review_mock(package)),
        LanguageItemAiProviderConfig::DeepSeek {
            api_key,
            base_url,
            model,
        }
        | LanguageItemAiProviderConfig::OpenAi {
            api_key,
            base_url,
            model,
        } => {
            let registry = pinned_registry(package)?;
            let validation = validate_task_package(package);
            let context = registry
                .context_options
                .iter()
                .find(|entry| entry.id == package.content.context_id);
            let capability = capability_for(
                &registry,
                &package.blueprint_slot_id,
                &package.item_format_id,
                Some(&package.content.primary_can_do_id),
            );
            let scoring_contract = registry.scoring_contracts.iter().find(|entry| {
                entry.scoring_contract_template_id
                    == package.scoring_package.scoring_contract_template_id
            });
            let difficulty_standard = capability
                .and_then(|capability| {
                    difficulty_standards_for_capability(&registry, capability)
                        .iter()
                        .find(|entry| entry.id == package.content.difficulty_band)
                })
                .or_else(|| {
                    registry
                        .difficulty_standards
                        .iter()
                        .find(|entry| entry.id == package.content.difficulty_band)
                });
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
                .collect::<Vec<_>>();
            let mut allowed_rule_refs = vec![
                format!("slot.{}", package.blueprint_slot_id),
                format!("canDo.{}", package.content.primary_can_do_id),
                format!("context.{}", package.content.context_id),
                format!("difficulty.{}", package.content.difficulty_band),
                format!(
                    "scoring.{}",
                    package.scoring_package.scoring_contract_template_id
                ),
                "review.automatedPrecheck".to_string(),
            ];
            allowed_rule_refs.extend(
                registry
                    .required_review_gate_ids
                    .iter()
                    .map(|gate| format!("review.{gate}")),
            );
            allowed_rule_refs.extend(validation.issues.iter().map(|issue| issue.rule_ref.clone()));
            allowed_rule_refs.sort();
            allowed_rule_refs.dedup();

            let mut output_schema: Value = serde_json::from_str(REVIEW_OUTPUT_SCHEMA)
                .expect("review output schema is valid JSON");
            output_schema["properties"]["findings"]["items"]["properties"]["ruleRef"]["enum"] =
                json!(allowed_rule_refs);
            output_schema["properties"]["findings"]["items"]["properties"]["category"]["enum"] =
                json!([
                    "validation",
                    "constructAndLevel",
                    "content",
                    "scoring",
                    "fairnessAccessibility",
                    "technicalSecurity",
                    "automatedPrecheck"
                ]);
            let input = json!({
                "taskPackage": package,
                "registryRules": {
                    "bundleVersion": registry.bundle_version,
                    "capability": capability,
                    "context": context,
                    "difficultyStandard": difficulty_standard,
                    "targetContent": selected_content,
                    "scoringContract": scoring_contract,
                    "requiredReviewGateIds": registry.required_review_gate_ids,
                },
                "allowedRuleRefs": allowed_rule_refs,
                "deterministicValidation": validation,
            });
            let request = StructuredOutputRequest {
                api_key,
                base_url,
                model,
                instructions: REVIEW_PROMPT,
                input,
                format_name: "language_item_review",
                schema: output_schema,
                example: json!({ "findings": [] }),
            };
            let value = match config {
                LanguageItemAiProviderConfig::DeepSeek { .. } => {
                    deepseek_chat_structured_output(http_client, request).await?
                }
                LanguageItemAiProviderConfig::OpenAi { .. } => {
                    responses_structured_output(http_client, request).await?
                }
                LanguageItemAiProviderConfig::DeterministicMock => unreachable!(),
            };
            let output: ReviewOutput = serde_json::from_value(value).map_err(|error| {
                Error::Server(
                    StatusCode::BAD_GATEWAY,
                    format!("AI review output did not match the application contract: {error}"),
                )
            })?;
            if let Some(finding) = output
                .findings
                .iter()
                .find(|finding| !allowed_rule_refs.contains(&finding.rule_ref))
            {
                return Err(Error::Server(
                    StatusCode::BAD_GATEWAY,
                    format!(
                        "AI review referenced a rule that was not supplied: {}",
                        finding.rule_ref
                    ),
                ));
            }
            Ok(output.findings)
        }
    }
}

struct StructuredOutputRequest<'a> {
    api_key: &'a str,
    base_url: &'a str,
    model: &'a str,
    instructions: &'a str,
    input: Value,
    format_name: &'a str,
    schema: Value,
    example: Value,
}

const DEEPSEEK_JSON_ATTEMPTS: usize = 2;

async fn deepseek_chat_structured_output(
    http_client: &Client,
    request: StructuredOutputRequest<'_>,
) -> Result<Value, Error> {
    let user_content = json!({
        "input": &request.input,
        "outputSchema": &request.schema,
        "jsonOutputShapeExample": &request.example,
        "instruction": format!(
            "Return only valid JSON matching the outputSchema named {}. Use the example only as a structural guide and obey the input requirements.",
            request.format_name
        ),
    });
    let user_content =
        serde_json::to_string(&user_content).expect("DeepSeek input is serializable");
    let mut last_empty_detail =
        "The response did not contain usable completion content".to_string();

    for attempt in 0..DEEPSEEK_JSON_ATTEMPTS {
        let retry_instruction = if attempt == 0 {
            ""
        } else {
            "\nThe previous JSON-mode response was empty. Respond immediately with one complete JSON object; the first non-whitespace character must be { and the last must be }."
        };
        let response = http_client
            .post(format!("{}/chat/completions", request.base_url))
            .bearer_auth(request.api_key)
            .json(&json!({
                "model": request.model,
                "messages": [
                    {
                        "role": "system",
                        "content": format!(
                            "{}\nReturn only valid JSON. Do not wrap the JSON in Markdown.{}",
                            request.instructions,
                            retry_instruction
                        )
                    },
                    {
                        "role": "user",
                        "content": &user_content
                    }
                ],
                "response_format": { "type": "json_object" },
                "thinking": { "type": "disabled" },
                "max_tokens": 8000,
                "stream": false
            }))
            .send()
            .await
            .map_err(|error| provider_request_error("DeepSeek", &error))?;
        let response_value = read_provider_response(response, "DeepSeek").await?;
        if let Some(output_text) = deepseek_chat_output_text(&response_value) {
            return parse_structured_output(output_text, "DeepSeek");
        }
        last_empty_detail = deepseek_empty_response_detail(&response_value);
    }

    Err(Error::Server(
        StatusCode::BAD_GATEWAY,
        format!(
            "DeepSeek returned empty content on all {DEEPSEEK_JSON_ATTEMPTS} attempts ({last_empty_detail}); try again"
        ),
    ))
}

fn deepseek_chat_output_text(response: &Value) -> Option<&str> {
    response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .and_then(|message| message.get("content"))
        .and_then(Value::as_str)
        .filter(|content| !content.trim().is_empty())
}

fn deepseek_empty_response_detail(response: &Value) -> String {
    let Some(choice) = response
        .get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
    else {
        return "The response did not contain choices".to_string();
    };

    match choice.get("finish_reason").and_then(Value::as_str) {
        Some("length") => "The output reached the maximum length".to_string(),
        Some(reason) => {
            let returned_reasoning = choice
                .get("message")
                .and_then(|message| message.get("reasoning_content"))
                .and_then(Value::as_str)
                .is_some_and(|content| !content.trim().is_empty());
            if returned_reasoning {
                format!("The model returned reasoning content only; finish_reason={reason}")
            } else {
                format!("finish_reason={reason}")
            }
        }
        None => "The response did not provide finish_reason".to_string(),
    }
}

async fn responses_structured_output(
    http_client: &Client,
    request: StructuredOutputRequest<'_>,
) -> Result<Value, Error> {
    let response = http_client
        .post(format!("{}/responses", request.base_url))
        .bearer_auth(request.api_key)
        .json(&json!({
            "model": request.model,
            "store": false,
            "instructions": request.instructions,
            "input": serde_json::to_string(&request.input).expect("AI input is serializable"),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": request.format_name,
                    "schema": request.schema,
                }
            }
        }))
        .send()
        .await
        .map_err(|error| provider_request_error("OpenAI", &error))?;
    let response_value = read_provider_response(response, "OpenAI").await?;
    let output_text = response_output_text(&response_value).ok_or_else(|| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            "AI provider response did not contain structured output text".to_string(),
        )
    })?;
    parse_structured_output(output_text, "OpenAI")
}

async fn read_provider_response(
    response: reqwest::Response,
    provider: &str,
) -> Result<Value, Error> {
    let status = response.status();
    if !status.is_success() {
        let detail: String = response
            .text()
            .await
            .unwrap_or_default()
            .chars()
            .take(500)
            .collect();
        return Err(Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("{provider} returned {status}: {detail}"),
        ));
    }
    response.json().await.map_err(|error| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("{provider} returned unreadable data: {error}"),
        )
    })
}

fn parse_structured_output(output_text: &str, provider: &str) -> Result<Value, Error> {
    serde_json::from_str(output_text).map_err(|error| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            format!("{provider} returned content that is not valid JSON: {error}"),
        )
    })
}

fn provider_request_error(provider: &str, error: &reqwest::Error) -> Error {
    let reason = if error.is_timeout() {
        "The request timed out; try again, or increase REQUEST_TIMEOUT_IN_MS if the problem persists"
    } else if error.is_connect() {
        "The network connection could not be established; check the proxy, firewall, and API host access"
    } else if error.is_request() {
        "The request could not be sent; check the API base URL"
    } else {
        "The request failed; check the network and service status"
    };
    Error::Server(StatusCode::BAD_GATEWAY, format!("{provider} {reason}"))
}

fn response_output_text(response: &Value) -> Option<&str> {
    response
        .get("output_text")
        .and_then(Value::as_str)
        .or_else(|| {
            response
                .get("output")?
                .as_array()?
                .iter()
                .filter(|item| item.get("type").and_then(Value::as_str) == Some("message"))
                .flat_map(|item| {
                    item.get("content")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                })
                .find(|content| content.get("type").and_then(Value::as_str) == Some("output_text"))
                .and_then(|content| content.get("text"))
                .and_then(Value::as_str)
        })
}

fn candidate_from_provider(
    package: &TaskPackage,
    generated: GeneratedCandidate,
    ordinal: u8,
) -> AiCandidate {
    let GeneratedCandidate {
        candidate_payload,
        proposed_scoring_package,
    } = generated;
    let mut proposed = package.clone();
    proposed.candidate_payload = candidate_payload.clone();
    merge_provider_answer_proposal(&mut proposed, proposed_scoring_package);
    proposed.ensure_item_scoring_spec();
    let validation = validate_task_package(&proposed);
    AiCandidate {
        id: Uuid::new_v4().to_string(),
        ordinal,
        status: if validation.valid { "valid" } else { "invalid" }.to_string(),
        candidate_payload,
        proposed_correct_option_id: proposed.scoring_package.correct_option_id.clone(),
        proposed_scoring_package: Some(proposed.scoring_package),
        validation,
    }
}

fn merge_provider_answer_proposal(package: &mut TaskPackage, proposal: ScoringPackage) {
    // Registry- and author-owned scoring configuration is immutable at the provider boundary.
    // The model may propose only the answer data that belongs to the generated task content.
    match package.item_format_id.as_str() {
        "IF-SINGLE-SELECT" => {
            package.scoring_package.correct_option_id = proposal.correct_option_id;
        }
        "IF-MATCHING" => {
            package.scoring_package.correct_matches = proposal.correct_matches;
        }
        "IF-RESTRICTED-INPUT" | "IF-FORM-ENTRY" => {
            package.scoring_package.accepted_responses = proposal.accepted_responses;
        }
        "IF-TYPED-MESSAGE" | "IF-SPOKEN-SINGLE" | "IF-SPOKEN-MULTITURN" => {}
        _ => {}
    }
}

pub fn generate_mock_candidates(package: &TaskPackage, count: u8) -> Vec<AiCandidate> {
    debug_assert!(!GENERATION_PROMPT.is_empty() && !GENERATION_OUTPUT_SCHEMA.is_empty());
    (0..count)
        .map(|index| {
            let mut proposed = package.clone();
            populate_mock_candidate(&mut proposed, index);
            let validation = validate_task_package(&proposed);
            AiCandidate {
                id: Uuid::new_v4().to_string(),
                ordinal: index + 1,
                status: if validation.valid {
                    "valid".to_string()
                } else {
                    "invalid".to_string()
                },
                candidate_payload: proposed.candidate_payload.clone(),
                proposed_correct_option_id: proposed.scoring_package.correct_option_id.clone(),
                proposed_scoring_package: Some(proposed.scoring_package.clone()),
                validation,
            }
        })
        .collect()
}

fn populate_mock_candidate(package: &mut TaskPackage, index: u8) {
    let suffix = usize::from(index) + 1;
    match &mut package.candidate_payload {
        CandidatePayload::SingleSelect(payload) => {
            *payload = SingleSelectCandidatePayload {
                stimulus: Stimulus {
                    text: Some(format!("今天下午{suffix}点关门")),
                    image_refs: vec![],
                    audio_ref: None,
                },
                prompt: "什么时候关门？".to_string(),
                options: vec![
                    SingleSelectOption {
                        option_id: "A".to_string(),
                        text: Some(format!("下午{suffix}点")),
                        image_ref: None,
                    },
                    SingleSelectOption {
                        option_id: "B".to_string(),
                        text: Some("上午九点".to_string()),
                        image_ref: None,
                    },
                ],
                shuffle_options: false,
            };
            package.scoring_package.correct_option_id = Some("A".to_string());
        }
        CandidatePayload::Matching(payload) => {
            payload.stimulus.text = Some("请把地点和活动连起来。".to_string());
            payload.prompt = "请选择正确的地点。".to_string();
            payload.left_items[0].text = Some("买水果".to_string());
            payload.left_items[1].text = Some("看书".to_string());
            payload.right_items[0].text = Some("商店".to_string());
            payload.right_items[1].text = Some("图书馆".to_string());
            payload.shuffle_right_items = false;
        }
        CandidatePayload::RestrictedInput(payload) => {
            payload.stimulus.text = Some(format!("商店下午{suffix}点关门。"));
            payload.prompt = "商店几点关门？".to_string();
            for field in &mut payload.response_fields {
                field.label = Some("关门时间".to_string());
                package.scoring_package.accepted_responses.insert(
                    field.response_id.clone(),
                    vec![format!("下午{suffix}点"), format!("{suffix}点")],
                );
            }
        }
        CandidatePayload::FormEntry(payload) => {
            payload.situation = "你要报名参加中文活动。".to_string();
            payload.instructions = "请填写报名表。".to_string();
            for (field_index, field) in payload.fields.iter_mut().enumerate() {
                field.label = ["姓名", "年龄", "电话号码", "参加日期", "班级", "备注"][field_index]
                    .to_string();
            }
        }
        CandidatePayload::TypedMessage(payload) => {
            payload.situation = "你今天不能参加学习活动。".to_string();
            payload.instructions = "请给老师写一条短消息。".to_string();
            payload.recipient = "王老师".to_string();
            payload.purpose = "请假".to_string();
            payload.required_content_points[0].description = "说明今天不能来".to_string();
        }
        CandidatePayload::SpokenSingle(payload) => {
            payload.situation = "你在中文课上介绍自己。".to_string();
            payload.instructions = "请根据提示说一段话。".to_string();
            payload.visible_prompt_text = Some("请说你的名字、国家和喜欢的活动。".to_string());
            payload.required_content_points[0].description = "介绍姓名和一项喜好".to_string();
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            payload.situation = "老师第一次见到你。".to_string();
            payload.instructions = "请听问题并回答。".to_string();
            if let Some(path) = payload.paths.first_mut() {
                for turn in &mut path.turns {
                    if turn.speaker == "system" {
                        turn.prompt_audio_ref = Some("你叫什么名字？".to_string());
                    } else {
                        turn.required_function_ids = vec!["说出自己的名字".to_string()];
                    }
                }
            }
        }
    }
}

pub fn review_mock(package: &TaskPackage) -> Vec<AiFinding> {
    debug_assert!(!REVIEW_PROMPT.is_empty() && !REVIEW_OUTPUT_SCHEMA.is_empty());
    let validation = validate_task_package(package);
    let mut findings: Vec<AiFinding> = validation
        .issues
        .into_iter()
        .map(|issue| AiFinding {
            category: "validation".to_string(),
            severity: issue.severity,
            code: issue.code,
            field_path: issue.path,
            rule_ref: issue.rule_ref,
            message: issue.message,
        })
        .collect();

    let stimulus_len = package
        .candidate_payload
        .as_single_select()
        .and_then(|payload| {
            payload
                .stimulus
                .text
                .as_deref()
                .map(str::chars)
                .map(Iterator::count)
        })
        .unwrap_or_default();
    if stimulus_len > 24 {
        findings.push(AiFinding {
            category: "constructAndLevel".to_string(),
            severity: "warning".to_string(),
            code: "a1.longStimulus".to_string(),
            field_path: "candidatePayload.stimulus.text".to_string(),
            rule_ref: "R-A1-1.materialLength".to_string(),
            message:
                "The stimulus is long; confirm that it still qualifies as a short sign or notice."
                    .to_string(),
        });
    }
    if findings.is_empty() {
        findings.push(AiFinding {
            category: "automatedPrecheck".to_string(),
            severity: "info".to_string(),
            code: "precheck.noMechanicalIssues".to_string(),
            field_path: "candidatePayload".to_string(),
            rule_ref: "review.automatedPrecheck".to_string(),
            message: "No mechanical issues were found; all human review gates are still required."
                .to_string(),
        });
    }
    findings
}

#[cfg(test)]
mod tests {
    use super::*;

    fn generation_ready_package(template: &str) -> TaskPackage {
        let mut package = TaskPackage::from_template(format!("LI-{template}"), template)
            .expect("registered template");
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.blueprint_slot_id == package.blueprint_slot_id
                    && entry.item_format_id == package.item_format_id
            })
            .expect("registered capability");
        package.delivery_policy_refs = capability.delivery_policy_refs.clone();
        let (context_id, domain) = capability
            .allowed_context_ids
            .iter()
            .find_map(|context_id| {
                registry
                    .context_options
                    .iter()
                    .find(|entry| &entry.id == context_id)
                    .and_then(|entry| {
                        entry
                            .primary_domains
                            .iter()
                            .find(|domain| capability.allowed_domains.contains(domain))
                            .map(|domain| (context_id.clone(), domain.clone()))
                    })
            })
            .expect("capability has a compatible domain and context");
        package.content.context_id = context_id.clone();
        package.content.primary_domain = domain;
        package.content.target_content_ids = vec![
            registry
                .content_id_options
                .iter()
                .find(|entry| {
                    let context_matches =
                        entry.context_ids.is_empty() || entry.context_ids.contains(&context_id);
                    let can_do_matches = entry.can_do_ids.is_empty()
                        || entry.can_do_ids.contains(&capability.primary_can_do_id)
                        || entry
                            .can_do_ids
                            .iter()
                            .any(|id| capability.supporting_can_do_ids.contains(id));
                    let receptive_skill = matches!(
                        capability.primary_reported_skill.as_str(),
                        "Reading" | "Listening"
                    );
                    let mastery_matches = entry.mastery_scope.as_deref().is_none_or(|scope| {
                        scope == "receptiveProductive" || (receptive_skill && scope == "receptive")
                    });
                    context_matches && can_do_matches && mastery_matches
                })
                .expect("capability and context have compatible target content")
                .id
                .clone(),
        ];
        let point_count = package
            .content
            .difficulty
            .as_ref()
            .map(|value| value.drivers.information_points)
            .unwrap_or(1);
        package.content.required_information_points = (1..=point_count)
            .enumerate()
            .map(|(index, point)| {
                crate::language_items::domain::InformationPoint::new(
                    index,
                    format!("Information point {point}"),
                )
            })
            .collect();
        package
    }

    #[test]
    fn prompts_and_output_schemas_are_versioned_and_parseable() {
        assert_eq!(GENERATION_PROMPT_VERSION, "0.5");
        assert_eq!(REVIEW_PROMPT_VERSION, "0.3");
        assert!(GENERATION_PROMPT.starts_with("# Chinese A1 Item Generation Prompt v0.5"));
        assert!(REVIEW_PROMPT.starts_with("# A1 Independent Review Prompt v0.3"));
        let generation: serde_json::Value =
            serde_json::from_str(GENERATION_OUTPUT_SCHEMA).expect("generation schema is JSON");
        let review: serde_json::Value =
            serde_json::from_str(REVIEW_OUTPUT_SCHEMA).expect("review schema is JSON");
        assert_eq!(
            generation.get("$id").and_then(serde_json::Value::as_str),
            Some("urn:fcc:language-item-generation-output:0.2")
        );
        assert_eq!(
            review.get("$id").and_then(serde_json::Value::as_str),
            Some("urn:fcc:language-item-review-output:0.1")
        );
    }

    #[test]
    fn generated_candidates_do_not_mutate_locked_input() {
        let mut package = TaskPackage::new("LI-AI-LOCK".to_string());
        package.content.difficulty_band = "UpperA1".to_string();
        package.content.difficulty = Some(crate::language_items::domain::DifficultyProfile {
            intended_band: "UpperA1".to_string(),
            drivers: crate::language_items::domain::DifficultyDrivers {
                input_length: "twoRelatedPhrases".to_string(),
                information_points: 2,
                support_level: "limited".to_string(),
                distractor_similarity: "close".to_string(),
                ..crate::language_items::domain::DifficultyProfile::r_a1_1_typical().drivers
            },
            ..crate::language_items::domain::DifficultyProfile::r_a1_1_typical()
        });
        package.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        package.content.required_information_points = vec![
            crate::language_items::domain::InformationPoint::new(0, "开放日期"),
            crate::language_items::domain::InformationPoint::new(1, "开放时间"),
        ];
        let original = package.clone();

        let candidates = generate_mock_candidates(&package, 5);

        assert_eq!(candidates.len(), 5);
        assert!(
            candidates
                .iter()
                .all(|candidate| candidate.validation.valid)
        );
        assert_eq!(package.blueprint_slot_id, original.blueprint_slot_id);
        assert_eq!(package.content.difficulty_band, "UpperA1");
        assert_eq!(package.task_family_id, original.task_family_id);
    }

    #[tokio::test]
    async fn independent_mock_generation_reports_attempts() {
        let package = generation_ready_package("reading-single-select");
        let report = generate_candidates_independently(
            &LanguageItemAiProviderConfig::DeterministicMock,
            &Client::new(),
            &package,
            3,
        )
        .await;

        assert_eq!(report.candidates.len(), 3);
        assert_eq!(report.attempt_count, 3);
        assert_eq!(report.retry_count, 0);
        assert!(report.errors.is_empty());
    }

    #[test]
    fn provider_candidate_preserves_locked_item_scoring_metadata_before_validation() {
        let mut package = TaskPackage::new("LI-AI-SCORING".to_string());
        package.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        package.content.required_information_points =
            vec![crate::language_items::domain::InformationPoint::new(
                0,
                "开放时间",
            )];
        populate_mock_candidate(&mut package, 0);
        let mut incomplete_scoring = package.scoring_package.clone();
        incomplete_scoring.answer_key_ref = None;
        incomplete_scoring.scoring_points.clear();
        incomplete_scoring.max_raw_score = 0;

        let candidate = candidate_from_provider(
            &package,
            GeneratedCandidate {
                candidate_payload: package.candidate_payload.clone(),
                proposed_scoring_package: incomplete_scoring,
            },
            1,
        );

        assert!(
            candidate.validation.valid,
            "{:?}",
            candidate.validation.issues
        );
        let scoring = candidate
            .proposed_scoring_package
            .expect("candidate scoring package");
        assert_eq!(
            scoring.answer_key_ref.as_deref(),
            Some("scoringPackage.correctOptionId")
        );
        assert_eq!(scoring.scoring_points.len(), 1);
        assert_eq!(scoring.max_raw_score, 1);
    }

    #[test]
    fn provider_candidate_preserves_rubric_and_benchmark_for_analytic_scoring() {
        let mut package = generation_ready_package("writing-typed-message");
        populate_mock_candidate(&mut package, 0);
        package.scoring_package.task_specific_criteria =
            vec!["Author requirement: cover both time and location".to_string()];
        let expected = package.scoring_package.clone();
        let mut sparse_provider_scoring = expected.clone();
        sparse_provider_scoring.item_scoring_version.clear();
        sparse_provider_scoring.scoring_contract_template_id = "MODEL-OVERRIDE".to_string();
        sparse_provider_scoring
            .scoring_contract_template_version
            .clear();
        sparse_provider_scoring.max_raw_score = 0;
        sparse_provider_scoring.scoring_points.clear();
        sparse_provider_scoring.answer_key_ref = None;
        sparse_provider_scoring.task_specific_criteria.clear();
        sparse_provider_scoring.benchmark_set_version = None;
        sparse_provider_scoring.rubric_id = Some("MODEL-RUBRIC".to_string());

        let candidate = candidate_from_provider(
            &package,
            GeneratedCandidate {
                candidate_payload: package.candidate_payload.clone(),
                proposed_scoring_package: sparse_provider_scoring,
            },
            1,
        );

        assert!(
            candidate.validation.valid,
            "{:?}",
            candidate.validation.issues
        );
        let scoring = candidate
            .proposed_scoring_package
            .expect("candidate scoring package");
        assert_eq!(
            scoring.scoring_contract_template_id,
            expected.scoring_contract_template_id
        );
        assert_eq!(scoring.rubric_id, expected.rubric_id);
        assert_eq!(
            scoring.benchmark_set_version,
            expected.benchmark_set_version
        );
        assert_eq!(
            serde_json::to_value(&scoring.scoring_points).expect("serialize scoring points"),
            serde_json::to_value(&expected.scoring_points).expect("serialize expected points")
        );
        assert_eq!(scoring.answer_key_ref, expected.answer_key_ref);
        assert_eq!(
            scoring.task_specific_criteria,
            expected.task_specific_criteria
        );
    }

    #[test]
    fn mock_generation_supports_every_registered_item_format() {
        let templates = [
            "reading-single-select",
            "reading-matching",
            "reading-restricted-input",
            "writing-form-entry",
            "writing-typed-message",
            "speaking-single",
            "speaking-multiturn",
        ];
        for template in templates {
            let package = generation_ready_package(template);

            let candidates = generate_mock_candidates(&package, 1);
            assert_eq!(candidates.len(), 1, "{template}");
            assert!(
                candidates[0].validation.valid,
                "{template}: {:?}",
                candidates[0].validation.issues
            );
        }
    }

    #[test]
    fn extracts_structured_output_from_responses_api_shape() {
        let response = json!({
            "output": [{
                "type": "message",
                "content": [{
                    "type": "output_text",
                    "text": "{\"candidates\":[]}"
                }]
            }]
        });
        assert_eq!(response_output_text(&response), Some("{\"candidates\":[]}"));
    }

    #[test]
    fn extracts_non_empty_deepseek_chat_content() {
        let response = json!({
            "choices": [{
                "finish_reason": "stop",
                "message": {
                    "content": "  {\"candidates\":[]}  ",
                    "reasoning_content": null
                }
            }]
        });

        assert_eq!(
            deepseek_chat_output_text(&response),
            Some("  {\"candidates\":[]}  ")
        );
    }

    #[test]
    fn explains_empty_deepseek_responses_without_exposing_reasoning() {
        let response = json!({
            "choices": [{
                "finish_reason": "stop",
                "message": {
                    "content": "  ",
                    "reasoning_content": "private reasoning must not be copied"
                }
            }]
        });

        assert_eq!(deepseek_chat_output_text(&response), None);
        let detail = deepseek_empty_response_detail(&response);
        assert_eq!(
            detail,
            "The model returned reasoning content only; finish_reason=stop"
        );
        assert!(!detail.contains("private reasoning"));
    }

    #[test]
    fn identifies_deepseek_output_length_exhaustion() {
        let response = json!({
            "choices": [{
                "finish_reason": "length",
                "message": { "content": null }
            }]
        });

        assert_eq!(deepseek_chat_output_text(&response), None);
        assert_eq!(
            deepseek_empty_response_detail(&response),
            "The output reached the maximum length"
        );
    }

    #[test]
    fn exposes_deepseek_without_exposing_its_key() {
        let config = LanguageItemAiProviderConfig::DeepSeek {
            api_key: "do-not-log-this".to_string(),
            base_url: "https://api.deepseek.com".to_string(),
            model: "configured-model".to_string(),
        };
        let metadata = provider_metadata(&config);

        assert_eq!(metadata.provider, "deepseek");
        assert_eq!(metadata.model, "configured-model");
        let debug = format!("{config:?}");
        assert!(debug.contains("[REDACTED]"));
        assert!(!debug.contains("do-not-log-this"));
    }
}
