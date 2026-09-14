use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Instant,
};

use futures_util::{StreamExt, stream::FuturesOrdered};
use http::StatusCode;
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{config::LanguageItemAiProviderConfig, errors::Error};

use super::{
    content_assessment::content_for_assessment,
    domain::{
        AiCandidate, AiFinding, AiGenerationPromptPreview, AiProviderCall, CandidatePayload,
        EnglishTranslation, ScoringPackage, SingleSelectCandidatePayload, SingleSelectOption,
        Stimulus, TaskPackage,
    },
    english_translations::{translation_source_fields, validate_english_translations},
    registry::{
        DifficultyBandStandard, RegistrySnapshot, capability_for,
        difficulty_standards_for_capability, snapshot_for,
    },
    validation::validate_task_package,
};

#[cfg(test)]
use super::registry::snapshot;

pub const PROVIDER: &str = "deterministic-mock";
pub const MODEL: &str = "workbench-fixture-v1";
pub const MODEL_VERSION: &str = "1";
pub const GENERATION_PROMPT_ID: &str = "a1-item-generation";
pub const GENERATION_PROMPT_VERSION: &str = "0.9";
pub const REVIEW_PROMPT_ID: &str = "a1-item-independent-review";
pub const REVIEW_PROMPT_VERSION: &str = "0.7";
pub const REVIEW_SCHEMA_VERSION: &str = "0.2";
pub const GENERATION_OUTPUT_SCHEMA_VERSION: &str = "0.3";
const MAX_CONCURRENT_CANDIDATE_REQUESTS: usize = 5;
pub const GENERATION_PROMPT: &str = include_str!("prompts/generation-v0.9.md");
pub const GENERATION_OUTPUT_SCHEMA: &str =
    include_str!("prompts/generation-output-v0.3.schema.json");
pub const REVIEW_PROMPT: &str = include_str!("prompts/review-v0.7.md");
pub const REVIEW_OUTPUT_SCHEMA: &str = include_str!("prompts/review-output-v0.2.schema.json");

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

fn pinned_difficulty_standard<'a>(
    registry: &'a RegistrySnapshot,
    package: &TaskPackage,
) -> Result<&'a DifficultyBandStandard, Error> {
    capability_for(
        registry,
        &package.item_rule_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    )
    .and_then(|capability| {
        difficulty_standards_for_capability(registry, capability)
            .iter()
            .find(|entry| entry.id == package.content.difficulty_band)
    })
    .ok_or_else(|| {
        Error::Server(
            StatusCode::UNPROCESSABLE_ENTITY,
            "The selected difficulty is unavailable in the item's saved assessment settings"
                .to_string(),
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
    #[serde(default)]
    exercise_template: Option<super::exercise_templates::ExerciseTemplateContent>,
    proposed_scoring_package: ScoringPackage,
    // Missing provider metadata is a repairable validation issue; legacy saved candidates also omit it.
    #[serde(default)]
    english_translations: Vec<EnglishTranslation>,
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
    pub attempt_count: u64,
    pub retry_count: u64,
    pub elapsed_milliseconds: u64,
    pub provider_calls: Vec<AiProviderCall>,
}

struct CandidateAttempt {
    result: Result<AiCandidate, Error>,
    provider_calls: Vec<AiProviderCall>,
}

pub fn validate_candidate_count(count: u64) -> Result<(), &'static str> {
    if count == 0 {
        return Err("AI candidate count must be a positive whole number");
    }
    // MongoDB stores whole numbers as signed 64-bit integers.
    if i64::try_from(count).is_err() {
        return Err("AI candidate count is too large to store");
    }
    Ok(())
}

pub async fn generate_candidates_independently<C, CFut>(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    count: u64,
    should_continue: C,
) -> CandidateGenerationReport
where
    C: Fn() -> CFut,
    CFut: Future<Output = bool>,
{
    let started = Instant::now();
    match config {
        LanguageItemAiProviderConfig::DeterministicMock => {
            let mut candidates = Vec::new();
            for index in 0..count {
                if !should_continue().await {
                    break;
                }
                candidates.push(generate_mock_candidate(package, index));
            }
            let attempt_count = candidates.len() as u64;
            CandidateGenerationReport {
                candidates,
                errors: if attempt_count < count {
                    vec![interrupted_generation_message(attempt_count, count)]
                } else {
                    Vec::new()
                },
                attempt_count,
                retry_count: 0,
                elapsed_milliseconds: elapsed_milliseconds(started),
                provider_calls: Vec::new(),
            }
        }
        LanguageItemAiProviderConfig::DeepSeek { .. }
        | LanguageItemAiProviderConfig::OpenAi { .. } => {
            collect_provider_candidates_while(
                count,
                |ordinal, repair_candidate| async move {
                    generate_provider_candidate(
                        config,
                        http_client,
                        package,
                        ordinal,
                        repair_candidate.as_ref(),
                    )
                    .await
                },
                should_continue,
            )
            .await
        }
    }
}

fn elapsed_milliseconds(started: Instant) -> u64 {
    u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX)
}

#[cfg(test)]
async fn collect_provider_candidates<F, Fut>(count: u64, generate: F) -> CandidateGenerationReport
where
    F: Fn(u64, Option<AiCandidate>) -> Fut,
    Fut: Future<Output = CandidateAttempt>,
{
    collect_provider_candidates_while(count, generate, || std::future::ready(true)).await
}

fn interrupted_generation_message(started: u64, requested: u64) -> String {
    format!(
        "Generation stopped after the batch was paused or could no longer continue. {started} of {requested} candidate requests started; finished responses were saved. Generate any remaining candidates manually from this item. Resume continues pending items only."
    )
}

async fn collect_provider_candidates_while<F, Fut, C, CFut>(
    count: u64,
    generate: F,
    should_continue: C,
) -> CandidateGenerationReport
where
    F: Fn(u64, Option<AiCandidate>) -> Fut,
    Fut: Future<Output = CandidateAttempt>,
    C: Fn() -> CFut,
    CFut: Future<Output = bool>,
{
    let started = Instant::now();
    let stopped = AtomicBool::new(false);
    // Queue the requested work lazily so a larger count does not launch every API call at once.
    let mut initial_results = FuturesOrdered::new();
    let mut next_ordinal = 1;
    let mut candidates = Vec::new();
    let mut errors = Vec::new();
    let mut retry_count = 0_u64;
    let mut initial_count = 0_u64;
    let mut provider_calls = Vec::new();

    loop {
        while initial_results.len() < MAX_CONCURRENT_CANDIDATE_REQUESTS
            && next_ordinal <= count
            && !stopped.load(Ordering::Relaxed)
        {
            let ordinal = next_ordinal;
            next_ordinal += 1;
            let generate = &generate;
            let should_continue = &should_continue;
            let stopped = &stopped;
            initial_results.push_back(async move {
                if !generation_may_continue(should_continue, stopped).await {
                    return None;
                }
                Some((ordinal, generate(ordinal, None).await))
            });
        }
        let Some(result) = initial_results.next().await else {
            break;
        };
        let Some((ordinal, attempt)) = result else {
            continue;
        };
        initial_count += 1;
        provider_calls.extend(attempt.provider_calls);
        match attempt.result {
            Ok(candidate) if candidate.validation.valid => candidates.push(candidate),
            Ok(candidate) => {
                if !generation_may_continue(&should_continue, &stopped).await {
                    candidates.push(candidate);
                    continue;
                }
                retry_count += 1;
                let repaired = generate(ordinal, Some(candidate.clone())).await;
                provider_calls.extend(repaired.provider_calls);
                match repaired.result {
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
    if stopped.load(Ordering::Relaxed) {
        errors.push(interrupted_generation_message(initial_count, count));
    }
    candidates.sort_by_key(|candidate| candidate.ordinal);
    CandidateGenerationReport {
        candidates,
        errors,
        attempt_count: initial_count + retry_count,
        retry_count,
        elapsed_milliseconds: elapsed_milliseconds(started),
        provider_calls,
    }
}

async fn generation_may_continue<C, CFut>(should_continue: &C, stopped: &AtomicBool) -> bool
where
    C: Fn() -> CFut,
    CFut: Future<Output = bool>,
{
    if stopped.load(Ordering::Relaxed) {
        return false;
    }
    let allowed = should_continue().await;
    if !allowed {
        stopped.store(true, Ordering::Relaxed);
    }
    allowed && !stopped.load(Ordering::Relaxed)
}

async fn generate_provider_candidate(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    ordinal: u64,
    repair_candidate: Option<&AiCandidate>,
) -> CandidateAttempt {
    let mut provider_calls = Vec::new();
    let result = generate_provider_candidate_inner(
        config,
        http_client,
        package,
        ordinal,
        repair_candidate,
        &mut provider_calls,
    )
    .await;
    for call in &mut provider_calls {
        call.candidate_ordinal = ordinal;
        call.phase = if repair_candidate.is_some() {
            "repair"
        } else {
            "initial"
        }
        .to_string();
    }
    CandidateAttempt {
        result,
        provider_calls,
    }
}

async fn generate_provider_candidate_inner(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    ordinal: u64,
    repair_candidate: Option<&AiCandidate>,
    provider_calls: &mut Vec<AiProviderCall>,
) -> Result<AiCandidate, Error> {
    let request = generation_structured_request(config, package, ordinal, repair_candidate)?;
    let value = match config {
        LanguageItemAiProviderConfig::DeepSeek { .. } => {
            deepseek_chat_structured_output(http_client, request, provider_calls).await?
        }
        LanguageItemAiProviderConfig::OpenAi { .. } => {
            responses_structured_output(http_client, request, provider_calls).await?
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

pub fn generation_prompt_preview(
    config: &LanguageItemAiProviderConfig,
    package: &TaskPackage,
    ordinal: u64,
) -> Result<AiGenerationPromptPreview, Error> {
    validate_candidate_count(ordinal)
        .map_err(|message| Error::Server(StatusCode::BAD_REQUEST, message.to_string()))?;
    let metadata = provider_metadata(config);
    let request_body = match config {
        LanguageItemAiProviderConfig::DeterministicMock => Value::Null,
        LanguageItemAiProviderConfig::DeepSeek { .. } => deepseek_request_body(
            &generation_structured_request(config, package, ordinal, None)?,
            0,
        ),
        LanguageItemAiProviderConfig::OpenAi { .. } => responses_request_body(
            &generation_structured_request(config, package, ordinal, None)?,
        ),
    };
    Ok(AiGenerationPromptPreview {
        provider: metadata.provider.to_string(),
        model: metadata.model.to_string(),
        prompt_version: GENERATION_PROMPT_VERSION.to_string(),
        sends_to_provider: !matches!(config, LanguageItemAiProviderConfig::DeterministicMock),
        request_body,
    })
}

fn generation_structured_request<'a>(
    config: &'a LanguageItemAiProviderConfig,
    package: &TaskPackage,
    ordinal: u64,
    repair_candidate: Option<&AiCandidate>,
) -> Result<StructuredOutputRequest<'a>, Error> {
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
    let difficulty_standard = pinned_difficulty_standard(&registry, package)?;
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
    if let Some(kind) = super::exercise_templates::exercise_type(&package.item_format_id) {
        let mut source_schema = registry
            .exercise_template_schemas
            .get(kind)
            .cloned()
            .ok_or_else(|| {
                Error::Server(
                    StatusCode::UNPROCESSABLE_ENTITY,
                    "The pinned exercise template schema is unavailable.".into(),
                )
            })?;
        if let Some(object) = source_schema.as_object_mut() {
            object.remove("x-exercise-template");
            object.remove("$schema");
        }
        let item_schema = &mut output_schema["properties"]["candidates"]["items"];
        item_schema["properties"]["candidatePayload"] = json!({"type":"object","required":["exerciseType","body","data"],
            "properties":{"exerciseType":{"const":kind},"body":{"type":"string"},"data":{"type":"object"}},"additionalProperties":false});
        item_schema["properties"]["exerciseTemplate"] = json!({"type":"object","required":["exerciseType","body","data"],
            "properties":{"exerciseType":{"const":kind},"body":{"type":"string"},"data":source_schema},"additionalProperties":false});
        item_schema["required"]
            .as_array_mut()
            .expect("candidate required fields")
            .push(json!("exerciseTemplate"));
        item_schema["properties"]["englishTranslations"]["minItems"] = json!(0);
    }
    if package.content.effective_language() == "en" {
        output_schema["properties"]["candidates"]["items"]["properties"]["englishTranslations"]["minItems"] =
            json!(0);
    }
    let selected_content = package
        .content
        .target_content_ids
        .iter()
        .filter_map(|id| {
            registry.content_id_options.iter().find(|entry| {
                &entry.id == id
                    && super::registry_content::content_matches_language(
                        entry,
                        package.content.effective_language(),
                    )
            })
        })
        .map(|content| {
            content_for_assessment(
                content,
                &package.item_rule_id,
                &package.item_format_id,
                &package.content.primary_can_do_id,
                &package.content.context_id,
            )
        })
        .collect::<Vec<_>>();
    let context = registry
        .context_options
        .iter()
        .find(|entry| entry.id == package.content.context_id);
    let capability = capability_for(
        &registry,
        &package.item_rule_id,
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
    ][(ordinal.saturating_sub(1) % 5) as usize];
    let current_payload = repair_candidate
        .map(|candidate| &candidate.candidate_payload)
        .unwrap_or(&package.candidate_payload);
    let current_scoring = repair_candidate
        .and_then(|candidate| candidate.proposed_scoring_package.as_ref())
        .unwrap_or(&package.scoring_package);
    let repair_issues = repair_candidate.map(|candidate| &candidate.validation.issues);
    let mut input = json!({
        "requestedCandidateCount": 1,
        "candidateOrdinal": ordinal,
        "variationFocus": variation_focus,
        "lockedConstraints": {
            "language": package.content.effective_language(),
            "languageName": super::multilingual::language_name(package.content.effective_language()),
            "itemRuleId": package.item_rule_id,
            "taskFamilyId": package.task_family_id,
            "itemFormatId": package.item_format_id,
            "rendererId": package.renderer.renderer_id,
            "primaryCanDoId": package.content.primary_can_do_id,
            "primaryDomain": package.content.primary_domain,
            "contextId": package.content.context_id,
            "context": context,
            "difficultyBand": package.content.difficulty_band,
            "difficultyStandard": difficulty_standard,
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
        "currentEnglishTranslations": repair_candidate.map(|candidate| &candidate.english_translations),
        "currentTranslationSourceFields": super::english_translations::translation_source_fields_for_registry(current_payload, &registry),
        "repairValidationIssues": repair_issues,
        "instruction": if repair_candidate.is_some() {
            "Repair this candidate once so every supplied deterministic validation issue is resolved. Return exactly one candidate."
        } else {
            "Generate exactly one independent candidate."
        },
    });
    if let Some(plan) = super::review_rules::plan_for_package(package)? {
        input["taskBrief"]["reviewPlan"] = json!(plan);
    }
    if super::exercise_templates::exercise_type(&package.item_format_id).is_some() {
        input["exerciseTemplate"] = json!(
            repair_candidate
                .and_then(|candidate| candidate.proposed_exercise_template.as_ref())
                .or(package.authoring_package.exercise_template.as_ref())
        );
        input["taskBrief"]["exerciseTemplateRule"] =
            json!(super::exercise_templates::rule_for(&registry, package));
        input["exerciseTemplateInstructions"] = json!(
            "Return complete authored source data, including answers, only in exerciseTemplate.data. Keep its exact exerciseType and source schema. candidatePayload must contain exerciseType, body and an empty data object; the server derives the candidate-visible projection. Preserve configured defaults and the pinned scoring criteria. Do not place answers, transcripts, teacher notes, examples or grading data in candidatePayload. A missing Context means no predefined Context; follow the selected Domain and task requirements."
        );
    }
    Ok(StructuredOutputRequest {
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
                "englishTranslations": repair_candidate.map(|candidate| candidate.english_translations.as_slice()).unwrap_or(&[]),
            }],
        }),
    })
}

#[cfg(test)]
pub async fn review(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
) -> Result<Vec<AiFinding>, Error> {
    review_after_independent_answer(config, http_client, package, None).await
}

pub(super) async fn review_after_independent_answer(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    package: &TaskPackage,
    blind_answer: Option<&super::blind_review::BlindAnswerAttempt>,
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
                &package.item_rule_id,
                &package.item_format_id,
                Some(&package.content.primary_can_do_id),
            );
            let scoring_contract = registry.scoring_contracts.iter().find(|entry| {
                entry.scoring_contract_template_id
                    == package.scoring_package.scoring_contract_template_id
            });
            let difficulty_standard = pinned_difficulty_standard(&registry, package)?;
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
                .map(|content| {
                    content_for_assessment(
                        content,
                        &package.item_rule_id,
                        &package.item_format_id,
                        &package.content.primary_can_do_id,
                        &package.content.context_id,
                    )
                })
                .collect::<Vec<_>>();
            let mut allowed_rule_refs = vec![
                format!("itemRule.{}", package.item_rule_id),
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
            allowed_rule_refs.extend(
                selected_content
                    .iter()
                    .filter(|content| !content.assessment_rules.is_empty())
                    .map(|content| format!("content.{}.assessmentRules", content.id)),
            );
            allowed_rule_refs.sort();
            allowed_rule_refs.dedup();

            let mut output_schema: Value = serde_json::from_str(REVIEW_OUTPUT_SCHEMA)
                .expect("review output schema is valid JSON");
            output_schema["properties"]
                .as_object_mut()
                .expect("review properties")
                .remove("checkResults");
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
                "language": package.content.effective_language(),
                "taskPackage": package,
                "independentAnswer": blind_answer,
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
            let mut review_calls = Vec::new();
            let value = match config {
                LanguageItemAiProviderConfig::DeepSeek { .. } => {
                    deepseek_chat_structured_output(http_client, request, &mut review_calls).await?
                }
                LanguageItemAiProviderConfig::OpenAi { .. } => {
                    responses_structured_output(http_client, request, &mut review_calls).await?
                }
                LanguageItemAiProviderConfig::DeterministicMock => unreachable!(),
            };
            let output: ReviewOutput = serde_json::from_value(value).map_err(|error| {
                Error::Server(
                    StatusCode::BAD_GATEWAY,
                    format!("AI review output did not match the application contract: {error}"),
                )
            })?;
            validate_review_findings(&output.findings, &allowed_rule_refs)?;
            Ok(output.findings)
        }
    }
}

pub(super) fn validate_review_findings(
    findings: &[AiFinding],
    allowed_rule_refs: &[String],
) -> Result<(), Error> {
    for finding in findings {
        if !allowed_rule_refs.contains(&finding.rule_ref) {
            return Err(Error::Server(
                StatusCode::BAD_GATEWAY,
                format!(
                    "AI review referenced a rule that was not supplied: {}",
                    finding.rule_ref
                ),
            ));
        }
        // Unrecognized severity must not silently turn a blocking finding into a passing report.
        if !matches!(finding.severity.as_str(), "info" | "warning" | "error")
            || finding.category.trim().is_empty()
            || finding.code.trim().is_empty()
            || finding.field_path.trim().is_empty()
            || finding.message.trim().is_empty()
        {
            return Err(Error::Server(
                StatusCode::BAD_GATEWAY,
                "AI review findings must contain a valid severity, category, code, field path, and explanation"
                    .to_string(),
            ));
        }
    }
    Ok(())
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

pub(super) async fn request_rule_output(
    config: &LanguageItemAiProviderConfig,
    http_client: &Client,
    instructions: &str,
    input: Value,
    format_name: &str,
    schema: Value,
    example: Value,
) -> Result<Value, Error> {
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
        LanguageItemAiProviderConfig::DeterministicMock => {
            return Err(Error::Server(
                StatusCode::BAD_REQUEST,
                "Offline simulation does not send AI requests".into(),
            ));
        }
    };
    let request = StructuredOutputRequest {
        api_key,
        base_url,
        model,
        instructions,
        input,
        format_name,
        schema,
        example,
    };
    let mut calls = Vec::new();
    match config {
        LanguageItemAiProviderConfig::DeepSeek { .. } => {
            deepseek_chat_structured_output(http_client, request, &mut calls).await
        }
        LanguageItemAiProviderConfig::OpenAi { .. } => {
            responses_structured_output(http_client, request, &mut calls).await
        }
        LanguageItemAiProviderConfig::DeterministicMock => unreachable!(),
    }
}

fn deepseek_request_body(request: &StructuredOutputRequest<'_>, attempt: usize) -> Value {
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
    let retry_instruction = if attempt == 0 {
        ""
    } else {
        "\nThe previous JSON-mode response was empty. Respond immediately with one complete JSON object; the first non-whitespace character must be { and the last must be }."
    };
    json!({
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
    })
}

async fn deepseek_chat_structured_output(
    http_client: &Client,
    request: StructuredOutputRequest<'_>,
    provider_calls: &mut Vec<AiProviderCall>,
) -> Result<Value, Error> {
    let mut last_empty_detail =
        "The response did not contain usable completion content".to_string();

    for attempt in 0..DEEPSEEK_JSON_ATTEMPTS {
        let body = deepseek_request_body(&request, attempt);
        let outgoing = http_client
            .post(format!("{}/chat/completions", request.base_url))
            .bearer_auth(request.api_key)
            .json(&body);
        let request_body = (request.format_name == "language_item_generation").then_some(body);
        let (result, call) = recorded_provider_request(outgoing, "DeepSeek", request_body).await;
        provider_calls.push(call);
        let response_value = result?;
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

fn responses_request_body(request: &StructuredOutputRequest<'_>) -> Value {
    // Pinned schemas allow optional fields and answer maps outside OpenAI's strict subset.
    // Keep their semantics; application parsing and validation still gate each candidate.
    json!({
            "model": request.model,
            "store": false,
            "instructions": request.instructions,
            "input": serde_json::to_string(&request.input).expect("AI input is serializable"),
            "text": {
                "format": {
                    "type": "json_schema",
                    "strict": false,
                    "name": request.format_name,
                    "schema": request.schema,
                }
            }
    })
}

async fn responses_structured_output(
    http_client: &Client,
    request: StructuredOutputRequest<'_>,
    provider_calls: &mut Vec<AiProviderCall>,
) -> Result<Value, Error> {
    let body = responses_request_body(&request);
    let outgoing = http_client
        .post(format!("{}/responses", request.base_url))
        .bearer_auth(request.api_key)
        .json(&body);
    let request_body = (request.format_name == "language_item_generation").then_some(body);
    let (result, call) = recorded_provider_request(outgoing, "OpenAI", request_body).await;
    provider_calls.push(call);
    let response_value = result?;
    let output_text = response_output_text(&response_value).ok_or_else(|| {
        Error::Server(
            StatusCode::BAD_GATEWAY,
            "AI provider response did not contain structured output text".to_string(),
        )
    })?;
    parse_structured_output(output_text, "OpenAI")
}

fn apply_observed_usage(call: &mut AiProviderCall, response: &Value) {
    call.provider_response_id = response
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string);
    let Some(usage) = response.get("usage") else {
        return;
    };
    call.input_tokens = usage
        .get("input_tokens")
        .or_else(|| usage.get("prompt_tokens"))
        .and_then(Value::as_u64);
    call.output_tokens = usage
        .get("output_tokens")
        .or_else(|| usage.get("completion_tokens"))
        .and_then(Value::as_u64);
    call.total_tokens = usage.get("total_tokens").and_then(Value::as_u64);
}

async fn recorded_provider_request(
    outgoing: reqwest::RequestBuilder,
    provider: &str,
    request_body: Option<Value>,
) -> (Result<Value, Error>, AiProviderCall) {
    let started = Instant::now();
    let mut call = AiProviderCall {
        candidate_ordinal: 0,
        phase: String::new(),
        elapsed_milliseconds: 0,
        outcome: "networkError".to_string(),
        http_status: None,
        provider_request_id: None,
        provider_response_id: None,
        input_tokens: None,
        output_tokens: None,
        total_tokens: None,
        request_body,
        request_body_unavailable_reason: None,
    };
    let result = match outgoing.send().await {
        Ok(response) => {
            call.http_status = Some(response.status().as_u16());
            call.provider_request_id = response
                .headers()
                .get("x-request-id")
                .and_then(|value| value.to_str().ok())
                .map(str::to_string);
            let http_success = response.status().is_success();
            let result = read_provider_response(response, provider).await;
            call.outcome = if result.is_ok() {
                "responseReceived"
            } else if http_success {
                "unreadableResponse"
            } else {
                "httpError"
            }
            .to_string();
            if let Ok(value) = &result {
                apply_observed_usage(&mut call, value);
            }
            result
        }
        Err(error) => Err(provider_request_error(provider, &error)),
    };
    call.elapsed_milliseconds = elapsed_milliseconds(started);
    (result, call)
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
    ordinal: u64,
) -> AiCandidate {
    let GeneratedCandidate {
        candidate_payload,
        exercise_template,
        proposed_scoring_package,
        english_translations,
    } = generated;
    let mut proposed = package.clone();
    proposed.candidate_payload = candidate_payload.clone();
    if super::exercise_templates::exercise_type(&package.item_format_id).is_some() {
        proposed.authoring_package.exercise_template = exercise_template;
    }
    proposed.authoring_package.english_translations.clear();
    merge_provider_answer_proposal(&mut proposed, proposed_scoring_package);
    proposed.ensure_item_scoring_spec();
    let projection_error =
        if super::exercise_templates::exercise_type(&package.item_format_id).is_some() {
            pinned_registry(package).ok().and_then(|registry| {
                super::exercise_templates::refresh_package(&mut proposed, &registry).err()
            })
        } else {
            None
        };
    let mut validation = validate_task_package(&proposed);
    if let Some(message) = projection_error {
        validation.issues.push(super::domain::ValidationIssue {
            severity: "error".into(),
            code: "exerciseTemplate.projection".into(),
            path: "authoringPackage.exerciseTemplate".into(),
            rule_ref: "exerciseTemplate.schema".into(),
            message,
        });
    }
    if let Ok(registry) = pinned_registry(&proposed) {
        validation.issues.extend(
            super::english_translations::validate_english_translations_for_registry(
                &proposed.candidate_payload,
                &english_translations,
                proposed.content.effective_language() != "en",
                &registry,
            ),
        );
    }
    validation.valid = !validation
        .issues
        .iter()
        .any(|issue| issue.severity == "error");
    AiCandidate {
        id: Uuid::new_v4().to_string(),
        ordinal,
        status: if validation.valid { "valid" } else { "invalid" }.to_string(),
        candidate_payload: proposed.candidate_payload.clone(),
        proposed_exercise_template: proposed.authoring_package.exercise_template.clone(),
        english_translations,
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

#[cfg(test)]
pub fn generate_mock_candidates(package: &TaskPackage, count: u64) -> Vec<AiCandidate> {
    (0..count)
        .map(|index| generate_mock_candidate(package, index))
        .collect()
}

fn generate_mock_candidate(package: &TaskPackage, index: u64) -> AiCandidate {
    debug_assert!(!GENERATION_PROMPT.is_empty() && !GENERATION_OUTPUT_SCHEMA.is_empty());
    let mut proposed = package.clone();
    populate_mock_candidate(&mut proposed, index);
    let english_translations = match proposed.content.effective_language() {
        "en" => vec![],
        "es" => {
            let mut english = proposed.clone();
            english.content.language = Some("en".into());
            super::multilingual::populate_mock(&mut english, index);
            let fields = translation_source_fields(&english.candidate_payload);
            translation_source_fields(&proposed.candidate_payload)
                .into_iter()
                .filter_map(|(path, source_text)| {
                    fields.get(&path).map(|english_text| EnglishTranslation {
                        path,
                        source_text,
                        english_text: english_text.clone(),
                    })
                })
                .collect()
        }
        _ => mock_english_translations(&proposed.candidate_payload),
    };
    proposed.authoring_package.english_translations.clear();
    let mut validation = validate_task_package(&proposed);
    validation.issues.extend(validate_english_translations(
        &proposed.candidate_payload,
        &english_translations,
        proposed.content.effective_language() != "en",
    ));
    validation.valid = !validation
        .issues
        .iter()
        .any(|issue| issue.severity == "error");
    AiCandidate {
        id: Uuid::new_v4().to_string(),
        ordinal: index + 1,
        status: if validation.valid {
            "valid".to_string()
        } else {
            "invalid".to_string()
        },
        candidate_payload: proposed.candidate_payload.clone(),
        proposed_exercise_template: proposed.authoring_package.exercise_template.clone(),
        english_translations,
        proposed_correct_option_id: proposed.scoring_package.correct_option_id.clone(),
        proposed_scoring_package: Some(proposed.scoring_package.clone()),
        validation,
    }
}

fn populate_mock_candidate(package: &mut TaskPackage, index: u64) {
    let suffix = index + 1;
    match &mut package.candidate_payload {
        CandidatePayload::ExerciseTemplate(_) => {}
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
            let [first_action, second_action, first_place, second_place] = [
                ["买水果", "看书", "商店", "图书馆"],
                ["买书", "吃饭", "书店", "饭店"],
                ["看医生", "上课", "医院", "学校"],
            ][(index % 3) as usize];
            payload.left_items[0].text = Some(first_action.to_string());
            payload.left_items[1].text = Some(second_action.to_string());
            payload.right_items[0].text = Some(first_place.to_string());
            payload.right_items[1].text = Some(second_place.to_string());
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
            let activity = ["中文活动", "中文课", "学校活动"][(index % 3) as usize];
            payload.situation = format!("你要报名参加{activity}。");
            payload.instructions = "请填写报名表。".to_string();
            for (field_index, field) in payload.fields.iter_mut().enumerate() {
                field.label = ["姓名", "年龄", "电话号码", "参加日期", "班级", "备注"][field_index]
                    .to_string();
            }
        }
        CandidatePayload::TypedMessage(payload) => {
            let day = ["今天", "明天", "星期一"][(index % 3) as usize];
            payload.situation = format!("你{day}不能参加学习活动。");
            payload.instructions = "请给老师写一条短消息。".to_string();
            payload.recipient = ["王老师", "李老师", "张老师"][(index % 3) as usize].to_string();
            payload.purpose = "请假".to_string();
            payload.required_content_points[0].description = format!("说明{day}不能来");
        }
        CandidatePayload::SpokenSingle(payload) => {
            payload.situation = "你在中文课上介绍自己。".to_string();
            payload.instructions = "请根据提示说一段话。".to_string();
            payload.visible_prompt_text = Some(
                [
                    "请说你的名字、国家和喜欢的活动。",
                    "请介绍你的名字、国家和一个爱好。",
                    "你叫什么名字？你是哪国人？你喜欢什么活动？",
                ][(index % 3) as usize]
                    .to_string(),
            );
            payload.required_content_points[0].description = "介绍姓名和一项喜好".to_string();
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            payload.roles.system_role = "考官".to_string();
            payload.roles.candidate_role = "考生".to_string();
            payload.situation = [
                "老师第一次见到你。",
                "新同学第一次见到你。",
                "你第一次参加中文活动。",
            ][(index % 3) as usize]
                .to_string();
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
    if package.content.effective_language() != "zh" {
        super::multilingual::populate_mock(package, index);
    }
}

fn mock_english_translations(payload: &CandidatePayload) -> Vec<EnglishTranslation> {
    translation_source_fields(payload)
        .into_iter()
        .filter_map(|(path, source_text)| {
            mock_english_text(&source_text).map(|english_text| EnglishTranslation {
                path,
                source_text,
                english_text,
            })
        })
        .collect()
}

fn mock_english_text(text: &str) -> Option<String> {
    let english = match text {
        "什么时候关门？" => "When does it close?",
        "上午九点" => "9 a.m.",
        "请把地点和活动连起来。" => "Match the places with the activities.",
        "请选择正确的地点。" => "Choose the correct place.",
        "买水果" => "Buy fruit",
        "看书" => "Read",
        "商店" => "Shop",
        "图书馆" => "Library",
        "买书" => "Buy books",
        "吃饭" => "Have a meal",
        "书店" => "Bookshop",
        "饭店" => "Restaurant",
        "看医生" => "See a doctor",
        "上课" => "Attend class",
        "医院" => "Hospital",
        "学校" => "School",
        "商店几点关门？" => "What time does the shop close?",
        "关门时间" => "Closing time",
        "你要报名参加中文活动。" => {
            "You want to sign up for a Chinese-language activity."
        }
        "你要报名参加中文课。" => "You want to sign up for a Chinese class.",
        "你要报名参加学校活动。" => "You want to sign up for a school activity.",
        "请填写报名表。" => "Complete the registration form.",
        "姓名" => "Name",
        "年龄" => "Age",
        "电话号码" => "Telephone number",
        "参加日期" => "Date of attendance",
        "班级" => "Class",
        "备注" => "Notes",
        "你今天不能参加学习活动。" => "You cannot attend the learning activity today.",
        "你明天不能参加学习活动。" => {
            "You cannot attend the learning activity tomorrow."
        }
        "你星期一不能参加学习活动。" => {
            "You cannot attend the learning activity on Monday."
        }
        "请给老师写一条短消息。" => "Write a short message to your teacher.",
        "王老师" => "Teacher Wang",
        "李老师" => "Teacher Li",
        "张老师" => "Teacher Zhang",
        "请假" => "Ask for leave",
        "说明今天不能来" => "Explain that you cannot come today",
        "说明明天不能来" => "Explain that you cannot come tomorrow",
        "说明星期一不能来" => "Explain that you cannot come on Monday",
        "你在中文课上介绍自己。" => "You are introducing yourself in Chinese class.",
        "请根据提示说一段话。" => "Give a short talk using the prompts.",
        "请说你的名字、国家和喜欢的活动。" => {
            "Say your name, your country, and an activity you enjoy."
        }
        "请介绍你的名字、国家和一个爱好。" => {
            "Introduce yourself with your name, your country, and a hobby."
        }
        "你叫什么名字？你是哪国人？你喜欢什么活动？" => {
            "What is your name? Which country are you from? What activities do you enjoy?"
        }
        "介绍姓名和一项喜好" => "Give your name and mention one thing you enjoy",
        "老师第一次见到你。" => "Your teacher is meeting you for the first time.",
        "新同学第一次见到你。" => "A new classmate is meeting you for the first time.",
        "你第一次参加中文活动。" => {
            "You are attending a Chinese-language activity for the first time."
        }
        "请听问题并回答。" => "Listen to the questions and answer them.",
        "你叫什么名字？" => "What is your name?",
        "说出自己的名字" => "Say your name",
        "考官" => "Examiner",
        "考生" => "Candidate",
        _ => {
            for (prefix, suffix, before, after) in [
                ("今天下午", "点关门", "It closes at ", " p.m. today."),
                ("商店下午", "点关门。", "The shop closes at ", " p.m."),
                ("下午", "点", "", " p.m."),
            ] {
                if let Some(number) = text
                    .strip_prefix(prefix)
                    .and_then(|value| value.strip_suffix(suffix))
                    .filter(|value| {
                        !value.is_empty()
                            && value.chars().all(|character| character.is_ascii_digit())
                    })
                {
                    return Some(format!("{before}{number}{after}"));
                }
            }
            // Optional author text outside this synthetic fixture is intentionally not guessed.
            return if !super::english_translations::has_chinese(text)
                && text
                    .chars()
                    .any(|character| character.is_ascii_alphabetic())
            {
                Some(text.to_string())
            } else {
                None
            };
        }
    };
    Some(english.to_string())
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

    #[test]
    fn candidate_count_requires_a_positive_storable_integer() {
        assert!(validate_candidate_count(0).is_err());
        for count in [1, 4, 6, 256, 1_000, i64::MAX as u64] {
            assert!(validate_candidate_count(count).is_ok());
        }
        assert!(validate_candidate_count(i64::MAX as u64 + 1).is_err());
    }

    #[test]
    fn mock_candidate_ordinals_continue_past_the_old_byte_limit() {
        let package = generation_ready_package("reading-single-select");
        let candidates = generate_mock_candidates(&package, 256);
        assert_eq!(candidates.len(), 256);
        assert_eq!(candidates.first().unwrap().ordinal, 1);
        assert_eq!(candidates.last().unwrap().ordinal, 256);
        let stored = bson::serialize_to_document(candidates.last().unwrap()).unwrap();
        let restored: AiCandidate = bson::deserialize_from_document(stored).unwrap();
        assert_eq!(restored.ordinal, 256);
    }

    #[tokio::test]
    async fn larger_candidate_counts_preserve_ordinals_and_bound_provider_concurrency() {
        use std::sync::atomic::{AtomicUsize, Ordering};

        let package = generation_ready_package("reading-single-select");
        let fixture = generate_mock_candidates(&package, 1).remove(0);
        let active = AtomicUsize::new(0);
        let peak = AtomicUsize::new(0);
        let report = collect_provider_candidates(256, |ordinal, previous| {
            let mut candidate = fixture.clone();
            candidate.ordinal = ordinal;
            candidate.id = format!("candidate-{ordinal}");
            let active = &active;
            let peak = &peak;
            async move {
                let current = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(current, Ordering::SeqCst);
                tokio::task::yield_now().await;
                active.fetch_sub(1, Ordering::SeqCst);
                simulated_attempt(candidate, ordinal != 256 || previous.is_some())
            }
        })
        .await;
        assert_eq!(report.candidates.len(), 256);
        assert_eq!(report.attempt_count, 257);
        assert_eq!(report.retry_count, 1);
        assert!(report.errors.is_empty());
        assert!(
            report
                .candidates
                .iter()
                .all(|candidate| candidate.validation.valid)
        );
        assert_eq!(
            report
                .candidates
                .iter()
                .map(|candidate| candidate.ordinal)
                .collect::<Vec<_>>(),
            (1..=256).collect::<Vec<_>>()
        );
        assert_eq!(active.load(Ordering::SeqCst), 0);
        assert_eq!(
            peak.load(Ordering::SeqCst),
            MAX_CONCURRENT_CANDIDATE_REQUESTS
        );
    }

    #[tokio::test]
    async fn pausing_candidate_generation_drains_inflight_calls_without_dispatching_more() {
        use std::sync::atomic::AtomicUsize;

        let package = generation_ready_package("reading-single-select");
        let fixture = generate_mock_candidate(&package, 0);
        let started = AtomicUsize::new(0);
        let finished = AtomicUsize::new(0);
        let report = collect_provider_candidates_while(
            100,
            |ordinal, previous| {
                assert!(previous.is_none());
                let mut candidate = fixture.clone();
                candidate.ordinal = ordinal;
                let started = &started;
                let finished = &finished;
                async move {
                    started.fetch_add(1, Ordering::SeqCst);
                    tokio::task::yield_now().await;
                    finished.fetch_add(1, Ordering::SeqCst);
                    simulated_attempt(candidate, true)
                }
            },
            || {
                std::future::ready(
                    started.load(Ordering::SeqCst) < MAX_CONCURRENT_CANDIDATE_REQUESTS,
                )
            },
        )
        .await;

        assert_eq!(
            started.load(Ordering::SeqCst),
            MAX_CONCURRENT_CANDIDATE_REQUESTS
        );
        assert_eq!(
            finished.load(Ordering::SeqCst),
            MAX_CONCURRENT_CANDIDATE_REQUESTS
        );
        assert_eq!(report.candidates.len(), MAX_CONCURRENT_CANDIDATE_REQUESTS);
        assert_eq!(
            report.attempt_count,
            MAX_CONCURRENT_CANDIDATE_REQUESTS as u64
        );
        assert_eq!(report.retry_count, 0);
        assert!(report.errors[0].contains("5 of 100"));
        assert!(report.errors[0].contains("Resume continues pending items only"));
    }

    #[tokio::test]
    async fn pause_before_candidate_repair_preserves_response_without_another_call() {
        use std::sync::atomic::AtomicUsize;

        let package = generation_ready_package("reading-single-select");
        let fixture = generate_mock_candidate(&package, 0);
        let checks = AtomicUsize::new(0);
        let report = collect_provider_candidates_while(
            100,
            |_, previous| {
                assert!(previous.is_none());
                let candidate = fixture.clone();
                async move {
                    tokio::task::yield_now().await;
                    simulated_attempt(candidate, false)
                }
            },
            || std::future::ready(checks.fetch_add(1, Ordering::SeqCst) != 5),
        )
        .await;

        assert_eq!(
            checks.load(Ordering::SeqCst),
            6,
            "a pause stays latched for this run"
        );
        assert_eq!(report.candidates.len(), 5);
        assert_eq!(report.attempt_count, 5);
        assert_eq!(report.retry_count, 0);
        assert!(
            report
                .candidates
                .iter()
                .all(|candidate| !candidate.validation.valid)
        );
        assert!(!report.errors.is_empty());
    }

    fn generation_ready_package(template: &str) -> TaskPackage {
        let mut package = TaskPackage::from_template(format!("LI-{template}"), template)
            .expect("registered template");
        let registry = snapshot();
        let capability = registry
            .capabilities
            .iter()
            .find(|entry| {
                entry.item_rule_id == package.item_rule_id
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
                        crate::language_items::content_context::content_context_matches(
                            entry,
                            &context_id,
                        );
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
                    let productive_skill = matches!(
                        capability.primary_reported_skill.as_str(),
                        "Writing" | "Speaking"
                    );
                    let mastery_matches = entry.mastery_scope.as_deref().is_none_or(|scope| {
                        scope == "receptiveProductive"
                            || (receptive_skill && scope == "receptive")
                            || (productive_skill && scope == "productive")
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
    fn multilingual_mock_candidates_and_prompts_follow_locked_language() {
        for language in ["en", "es"] {
            for template in [
                "reading-single-select",
                "reading-matching",
                "reading-restricted-input",
                "writing-form-entry",
                "writing-typed-message",
                "speaking-single",
                "speaking-multiturn",
            ] {
                let mut package = generation_ready_package(template);
                let mut registry = snapshot().clone();
                registry.bundle_version = format!("multilingual-{language}-{template}");
                for entry in &mut registry.content_id_options {
                    if package.content.target_content_ids.contains(&entry.id) {
                        entry.metadata.insert("language".into(), json!(language));
                    }
                }
                super::super::registry::install_published_snapshot(registry.clone(), false);
                package.spec_versions.registry_bundle_version = registry.bundle_version.clone();
                crate::routes::language_items::set_draft_language(
                    &mut package,
                    language,
                    &registry,
                )
                .unwrap();
                let candidate = generate_mock_candidate(&package, 0);
                assert!(
                    candidate.validation.valid,
                    "{language} {template}: {:?}",
                    candidate.validation.issues
                );
                assert!(
                    !super::super::english_translations::has_chinese(
                        &serde_json::to_string(&candidate.candidate_payload).unwrap()
                    ),
                    "{language} {template}"
                );
                if language == "en" {
                    assert!(candidate.english_translations.is_empty());
                } else {
                    assert!(!candidate.english_translations.is_empty());
                }
                let config = LanguageItemAiProviderConfig::DeepSeek {
                    api_key: "test".into(),
                    base_url: "http://localhost".into(),
                    model: "test".into(),
                };
                let request = generation_structured_request(&config, &package, 1, None).unwrap();
                assert_eq!(request.input["lockedConstraints"]["language"], language);
            }
        }
    }

    #[test]
    fn review_findings_reject_unknown_severity_and_unsupported_rules() {
        let rules = vec!["review.automatedPrecheck".to_string()];
        let mut finding = AiFinding {
            category: "content".into(),
            severity: "error".into(),
            code: "answer.ambiguous".into(),
            field_path: "candidatePayload.options".into(),
            rule_ref: rules[0].clone(),
            message: "两个选项都正确，请修改其中一个。".into(),
        };
        assert!(validate_review_findings(std::slice::from_ref(&finding), &rules).is_ok());
        finding.severity = "critical".into();
        assert!(validate_review_findings(std::slice::from_ref(&finding), &rules).is_err());
        finding.severity = "warning".into();
        finding.rule_ref = "invented.rule".into();
        assert!(validate_review_findings(std::slice::from_ref(&finding), &rules).is_err());
        finding.rule_ref = rules[0].clone();
        finding.message = " ".into();
        assert!(validate_review_findings(std::slice::from_ref(&finding), &rules).is_err());
        assert!(validate_review_findings(&[], &rules).is_ok());
    }

    #[test]
    fn prompts_and_output_schemas_are_versioned_and_parseable() {
        assert_eq!(GENERATION_PROMPT_VERSION, "0.9");
        assert_eq!(REVIEW_PROMPT_VERSION, "0.7");
        assert!(GENERATION_PROMPT.starts_with("# Multilingual A1 Item Generation Prompt v0.9"));
        assert!(REVIEW_PROMPT.starts_with("# A1 Independent Review Prompt v0.7"));
        let generation: serde_json::Value =
            serde_json::from_str(GENERATION_OUTPUT_SCHEMA).expect("generation schema is JSON");
        let review: serde_json::Value =
            serde_json::from_str(REVIEW_OUTPUT_SCHEMA).expect("review schema is JSON");
        assert_eq!(
            generation.get("$id").and_then(serde_json::Value::as_str),
            Some("urn:fcc:language-item-generation-output:0.3")
        );
        assert_eq!(
            review.get("$id").and_then(serde_json::Value::as_str),
            Some("urn:fcc:language-item-review-output:0.2")
        );
    }

    #[test]
    fn ai_difficulty_uses_the_pinned_task_profile_and_rejects_missing_bands() {
        let package = TaskPackage::new("LI-AI-DIFFICULTY".to_string());
        let mut registry = snapshot().clone();
        registry.settings_schema_version = 1;
        let profile = registry
            .capability_difficulty_profile_sets
            .iter_mut()
            .find(|profile| {
                profile.item_rule_id == package.item_rule_id
                    && profile.item_format_id == package.item_format_id
                    && profile.primary_can_do_id == package.content.primary_can_do_id
            })
            .expect("configured task difficulty");
        let standard = profile
            .standards
            .iter_mut()
            .find(|standard| standard.id == package.content.difficulty_band)
            .expect("selected difficulty");
        standard.description = "Task-specific difficulty constraint".to_string();

        assert_eq!(
            pinned_difficulty_standard(&registry, &package)
                .unwrap()
                .description,
            "Task-specific difficulty constraint"
        );
        for profile in &mut registry.capability_difficulty_profile_sets {
            profile
                .standards
                .retain(|standard| standard.id != package.content.difficulty_band);
        }
        assert!(pinned_difficulty_standard(&registry, &package).is_err());
        registry.settings_schema_version = 0;
        registry.capability_difficulty_profile_sets.clear();
        assert!(pinned_difficulty_standard(&registry, &package).is_ok());
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
        assert_eq!(package.item_rule_id, original.item_rule_id);
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
            || std::future::ready(true),
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
                exercise_template: None,
                candidate_payload: package.candidate_payload.clone(),
                english_translations: mock_english_translations(&package.candidate_payload),
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
                exercise_template: None,
                candidate_payload: package.candidate_payload.clone(),
                english_translations: mock_english_translations(&package.candidate_payload),
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
            let translations = &candidates[0].english_translations;
            let sources = translation_source_fields(&candidates[0].candidate_payload);
            assert!(!translations.is_empty(), "{template}");
            assert_eq!(
                translations.len(),
                sources.len(),
                "{template}: every human-text field is translated"
            );
            assert!(
                validate_english_translations(&candidates[0].candidate_payload, translations, true)
                    .is_empty(),
                "{template}"
            );
            let payload_json = serde_json::to_string(&candidates[0].candidate_payload).unwrap();
            assert!(!payload_json.contains("englishTranslations"), "{template}");
        }
    }

    #[tokio::test]
    async fn missing_provider_translations_use_the_existing_single_focused_repair() {
        let mut package = generation_ready_package("reading-single-select");
        populate_mock_candidate(&mut package, 0);
        let missing: GeneratedCandidate = serde_json::from_value(json!({
            "candidatePayload": package.candidate_payload,
            "proposedScoringPackage": package.scoring_package,
        }))
        .unwrap();
        let invalid = candidate_from_provider(&package, missing, 1);
        assert!(!invalid.validation.valid);
        assert!(
            invalid
                .validation
                .issues
                .iter()
                .any(|issue| issue.code.ends_with("englishTranslation.missing"))
        );
        let fixed = candidate_from_provider(
            &package,
            GeneratedCandidate {
                exercise_template: None,
                candidate_payload: package.candidate_payload.clone(),
                proposed_scoring_package: package.scoring_package.clone(),
                english_translations: mock_english_translations(&package.candidate_payload),
            },
            1,
        );
        let report = collect_provider_candidates(1, |_, previous| {
            let candidate = if previous.is_some() {
                fixed.clone()
            } else {
                invalid.clone()
            };
            async move {
                CandidateAttempt {
                    result: Ok(candidate),
                    provider_calls: Vec::new(),
                }
            }
        })
        .await;
        assert_eq!(report.retry_count, 1);
        assert!(report.candidates[0].validation.valid);
        assert!(!report.candidates[0].english_translations.is_empty());
    }

    #[test]
    fn legacy_candidates_without_translation_metadata_remain_readable() {
        let candidate =
            generate_mock_candidates(&generation_ready_package("reading-single-select"), 1)
                .remove(0);
        let mut legacy = serde_json::to_value(candidate).unwrap();
        legacy
            .as_object_mut()
            .unwrap()
            .remove("englishTranslations");
        let read: AiCandidate = serde_json::from_value(legacy.clone()).unwrap();
        assert!(read.english_translations.is_empty());
        assert_eq!(serde_json::to_value(read).unwrap(), legacy);
    }

    #[tokio::test]
    async fn offline_evaluation_matches_the_seven_format_baseline_reproducibly() {
        let baseline: Value =
            serde_json::from_str(include_str!("evals/offline-baseline.v2.json")).unwrap();
        assert_eq!(baseline["promptVersion"], GENERATION_PROMPT_VERSION);
        assert_eq!(
            baseline["outputSchemaVersion"],
            GENERATION_OUTPUT_SCHEMA_VERSION
        );
        let cases = baseline["cases"].as_array().unwrap();
        assert_eq!(cases.len(), 7);
        let count = baseline["candidatesPerFormat"].as_u64().unwrap();
        for case in cases {
            let template = case["template"].as_str().unwrap();
            let package = generation_ready_package(template);
            let report = generate_candidates_independently(
                &LanguageItemAiProviderConfig::DeterministicMock,
                &Client::new(),
                &package,
                count,
                || std::future::ready(true),
            )
            .await;
            let valid = report
                .candidates
                .iter()
                .filter(|candidate| candidate.validation.valid)
                .count();
            let payloads: Vec<String> = report
                .candidates
                .iter()
                .map(|candidate| serde_json::to_string(&candidate.candidate_payload).unwrap())
                .collect();
            let distinct = payloads
                .iter()
                .collect::<std::collections::HashSet<_>>()
                .len();
            let repeated: Vec<String> = generate_mock_candidates(&package, count)
                .iter()
                .map(|candidate| serde_json::to_string(&candidate.candidate_payload).unwrap())
                .collect();
            assert_eq!(
                valid as u64,
                case["validCount"].as_u64().unwrap(),
                "{template}: invalid candidates"
            );
            assert_eq!(
                distinct as u64,
                case["distinctVisibleContentCount"].as_u64().unwrap(),
                "{template}: repeated visible content"
            );
            assert_eq!(
                payloads, repeated,
                "{template}: offline fixtures must be reproducible"
            );
            assert!(
                report.provider_calls.is_empty(),
                "offline evaluation must not call providers"
            );
            assert_eq!(report.attempt_count, count);
            assert_eq!(report.retry_count, 0);
            println!(
                "{template}: valid={valid}/{count}, distinct={distinct}/{count}, providerCalls=0"
            );
        }
    }

    fn simulated_attempt(candidate: AiCandidate, valid: bool) -> CandidateAttempt {
        let mut candidate = candidate;
        candidate.validation.valid = valid;
        candidate.status = if valid { "valid" } else { "invalid" }.to_string();
        CandidateAttempt {
            result: Ok(candidate),
            provider_calls: Vec::new(),
        }
    }

    #[tokio::test]
    async fn offline_provider_repair_is_attempted_once_and_can_recover() {
        let package = generation_ready_package("reading-single-select");
        let candidate = generate_mock_candidates(&package, 1).remove(0);
        let report = collect_provider_candidates(1, |_, previous| {
            let candidate = candidate.clone();
            async move { simulated_attempt(candidate, previous.is_some()) }
        })
        .await;
        assert_eq!(report.attempt_count, 2);
        assert_eq!(report.retry_count, 1);
        assert!(report.candidates[0].validation.valid);
        assert!(report.errors.is_empty());

        let still_invalid = collect_provider_candidates(1, |_, _| {
            let candidate = candidate.clone();
            async move { simulated_attempt(candidate, false) }
        })
        .await;
        assert_eq!(still_invalid.attempt_count, 2);
        assert_eq!(still_invalid.retry_count, 1);
        assert!(!still_invalid.candidates[0].validation.valid);
    }

    #[tokio::test]
    async fn offline_provider_failures_preserve_available_candidates_and_original_ids() {
        let package = generation_ready_package("reading-single-select");
        let fixture = generate_mock_candidates(&package, 3);
        let partial = collect_provider_candidates(3, |ordinal, _| {
            let candidate = fixture[usize::try_from(ordinal - 1).unwrap()].clone();
            async move {
                if ordinal == 2 {
                    CandidateAttempt {
                        result: Err(Error::Server(
                            StatusCode::BAD_GATEWAY,
                            "Offline provider error fixture".to_string(),
                        )),
                        provider_calls: Vec::new(),
                    }
                } else {
                    simulated_attempt(candidate, true)
                }
            }
        })
        .await;
        assert_eq!(partial.attempt_count, 3);
        assert_eq!(partial.retry_count, 0);
        assert_eq!(
            partial
                .candidates
                .iter()
                .map(|candidate| &candidate.id)
                .collect::<Vec<_>>(),
            vec![&fixture[0].id, &fixture[2].id]
        );
        assert_eq!(partial.errors.len(), 1);

        let failed_repair = collect_provider_candidates(1, |_, previous| {
            let candidate = fixture[0].clone();
            async move {
                if previous.is_some() {
                    CandidateAttempt {
                        result: Err(Error::Server(
                            StatusCode::BAD_GATEWAY,
                            "Offline repair error fixture".to_string(),
                        )),
                        provider_calls: Vec::new(),
                    }
                } else {
                    simulated_attempt(candidate, false)
                }
            }
        })
        .await;
        assert_eq!(failed_repair.candidates[0].id, fixture[0].id);
        assert_eq!(failed_repair.retry_count, 1);
        assert_eq!(failed_repair.errors.len(), 1);
        assert!(!failed_repair.candidates[0].validation.valid);
    }

    #[test]
    fn telemetry_keeps_missing_usage_unknown_and_reads_both_provider_shapes() {
        let mut call = AiProviderCall {
            candidate_ordinal: 1,
            phase: "initial".to_string(),
            elapsed_milliseconds: 7,
            outcome: "responseReceived".to_string(),
            http_status: Some(200),
            provider_request_id: Some("request-fixture".to_string()),
            provider_response_id: None,
            input_tokens: None,
            output_tokens: None,
            total_tokens: None,
            request_body: None,
            request_body_unavailable_reason: None,
        };
        apply_observed_usage(&mut call, &json!({"id":"response-fixture"}));
        assert_eq!(call.input_tokens, None);
        assert_eq!(call.total_tokens, None);
        assert_eq!(
            call.provider_response_id.as_deref(),
            Some("response-fixture")
        );
        apply_observed_usage(
            &mut call,
            &json!({"usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}),
        );
        assert_eq!(
            (call.input_tokens, call.output_tokens, call.total_tokens),
            (Some(10), Some(5), Some(15))
        );
        apply_observed_usage(
            &mut call,
            &json!({"usage":{"input_tokens":4,"output_tokens":2}}),
        );
        assert_eq!(
            (call.input_tokens, call.output_tokens, call.total_tokens),
            (Some(4), Some(2), None)
        );
        assert_eq!(call.provider_request_id.as_deref(), Some("request-fixture"));
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

    #[tokio::test]
    async fn language_content_metadata_reaches_the_pinned_generation_request() {
        let mut registry = snapshot().clone();
        super::super::registry::prepare_registry_draft(&mut registry);
        registry.bundle_version = format!("content-generation-test-{}", Uuid::new_v4());
        let mut package = generation_ready_package("reading-single-select");
        package.spec_versions.registry_bundle_version = registry.bundle_version.clone();
        package.content.target_content_ids =
            vec!["LEX-A1-0001".to_string(), "GR-A1-001".to_string()];
        let expected = package
            .content
            .target_content_ids
            .iter()
            .map(|id| {
                serde_json::to_value(
                    registry
                        .content_id_options
                        .iter()
                        .find(|entry| &entry.id == id)
                        .unwrap(),
                )
                .unwrap()
            })
            .collect::<Vec<_>>();
        super::super::registry::install_published_snapshot(registry, false);
        let provider_output = json!({"candidates": [{
            "candidatePayload": package.candidate_payload,
            "proposedScoringPackage": package.scoring_package,
            "englishTranslations": []
        }]});
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let app = axum::Router::new().route(
            "/chat/completions",
            axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
                let sender = sender.clone();
                let output = provider_output.to_string();
                async move {
                    sender.send(body).await.unwrap();
                    axum::Json(json!({"choices": [{"message": {"content": output}}]}))
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let config = LanguageItemAiProviderConfig::DeepSeek {
            api_key: "local-fixture-key".to_string(),
            base_url: format!("http://{}", listener.local_addr().unwrap()),
            model: "fixture-model".to_string(),
        };
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap();
        let preview = generation_prompt_preview(&config, &package, 1).unwrap();
        let mut calls = Vec::new();
        let result =
            generate_provider_candidate_inner(&config, &client, &package, 1, None, &mut calls)
                .await;
        server.abort();
        assert!(result.is_ok(), "{result:?}");
        let request = receiver.try_recv().unwrap();
        assert_eq!(preview.request_body, request);
        assert_eq!(calls[0].request_body.as_ref(), Some(&request));
        let input: Value =
            serde_json::from_str(request["messages"][1]["content"].as_str().unwrap()).unwrap();
        assert_eq!(
            input["input"]["lockedConstraints"]["targetContent"],
            json!(expected)
        );
        assert!(input["input"]["lockedConstraints"]["targetContent"][0]["meaning"].is_string());
        assert_eq!(
            input["input"]["lockedConstraints"]["targetContent"][1]["pattern"],
            "A 是 B"
        );
        assert!(
            input["input"]["lockedConstraints"]["targetContent"][1]["restrictions"].is_string()
        );
    }

    #[tokio::test]
    async fn prompt_preview_and_snapshots_match_sent_initial_retry_and_failed_repair_requests() {
        for use_deepseek in [false, true] {
            let package = generation_ready_package("reading-single-select");
            let mut repair_candidate = generate_mock_candidate(&package, 4);
            repair_candidate
                .validation
                .issues
                .push(super::super::domain::ValidationIssue {
                    severity: "error".to_string(),
                    code: "fixture.repair".to_string(),
                    path: "candidatePayload".to_string(),
                    rule_ref: "fixture.repair".to_string(),
                    message: "Repair the fixture issue".to_string(),
                });
            let output = json!({ "candidates": [{
                "candidatePayload": repair_candidate.candidate_payload,
                "proposedScoringPackage": repair_candidate.proposed_scoring_package,
                "englishTranslations": repair_candidate.english_translations,
            }] })
            .to_string();
            let sequence = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let (sender, mut receiver) = tokio::sync::mpsc::channel(4);
            let path = if use_deepseek {
                "/chat/completions"
            } else {
                "/responses"
            };
            let app = axum::Router::new().route(path, axum::routing::post(
                move |axum::Json(body): axum::Json<Value>| {
                    let sequence = sequence.clone();
                    let sender = sender.clone();
                    let output = output.clone();
                    async move {
                        sender.send(body).await.unwrap();
                        let index = sequence.fetch_add(1, Ordering::SeqCst);
                        let success_index = usize::from(use_deepseek);
                        if index > success_index {
                            return (StatusCode::BAD_REQUEST, axum::Json(json!({ "error": "fixture repair rejected" })));
                        }
                        let response = if use_deepseek {
                            json!({ "choices": [{ "message": { "content": if index == 0 { "" } else { &output } } }] })
                        } else {
                            json!({ "output": [{ "type": "message", "content": [{ "type": "output_text", "text": output }] }] })
                        };
                        (StatusCode::OK, axum::Json(response))
                    }
                },
            ));
            let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
            let base_url = format!("http://{}", listener.local_addr().unwrap());
            let config = if use_deepseek {
                LanguageItemAiProviderConfig::DeepSeek {
                    api_key: "private-fixture-key".to_string(),
                    base_url,
                    model: "fixture-deepseek".to_string(),
                }
            } else {
                LanguageItemAiProviderConfig::OpenAi {
                    api_key: "private-fixture-key".to_string(),
                    base_url,
                    model: "fixture-openai".to_string(),
                }
            };
            let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
            let client = Client::builder()
                .no_proxy()
                .timeout(std::time::Duration::from_secs(5))
                .build()
                .unwrap();
            let preview = generation_prompt_preview(&config, &package, 2).unwrap();
            let initial = generate_provider_candidate(&config, &client, &package, 2, None).await;
            let repair =
                generate_provider_candidate(&config, &client, &package, 2, Some(&repair_candidate))
                    .await;
            server.abort();
            assert!(initial.result.is_ok());
            assert!(repair.result.is_err());
            assert!(preview.sends_to_provider);
            assert!(
                !serde_json::to_string(&preview)
                    .unwrap()
                    .contains("private-fixture-key")
            );
            assert_eq!(
                preview.request_body,
                initial.provider_calls[0].request_body.clone().unwrap()
            );
            assert_eq!(
                initial.provider_calls.len(),
                if use_deepseek { 2 } else { 1 }
            );
            for call in initial.provider_calls.iter().chain(&repair.provider_calls) {
                assert_eq!(
                    call.request_body.as_ref(),
                    Some(&receiver.try_recv().unwrap())
                );
                assert_eq!(call.candidate_ordinal, 2);
            }
            if use_deepseek {
                let retry = initial.provider_calls[1].request_body.as_ref().unwrap();
                assert!(
                    retry["messages"][0]["content"]
                        .as_str()
                        .unwrap()
                        .contains("previous JSON-mode response was empty")
                );
            }
            let failed = &repair.provider_calls[0];
            assert_eq!(failed.phase, "repair");
            assert_eq!(failed.outcome, "httpError");
            let body = failed.request_body.as_ref().unwrap();
            let input: Value = if use_deepseek {
                serde_json::from_str::<Value>(body["messages"][1]["content"].as_str().unwrap())
                    .unwrap()["input"]
                    .clone()
            } else {
                serde_json::from_str(body["input"].as_str().unwrap()).unwrap()
            };
            assert_eq!(input["candidateOrdinal"], 2);
            assert_eq!(
                input["repairValidationIssues"],
                json!(repair_candidate.validation.issues)
            );
            assert_eq!(
                input["currentCandidatePayload"],
                json!(repair_candidate.candidate_payload)
            );
            assert_eq!(
                input["lockedConstraints"]["difficultyBand"],
                package.content.difficulty_band
            );
            assert_eq!(
                input["lockedConstraints"]["contextId"],
                package.content.context_id
            );
        }
    }

    #[test]
    fn mock_and_legacy_runs_do_not_claim_a_sent_prompt() {
        let package = generation_ready_package("reading-single-select");
        let preview = generation_prompt_preview(
            &LanguageItemAiProviderConfig::DeterministicMock,
            &package,
            1,
        )
        .unwrap();
        assert!(!preview.sends_to_provider);
        assert!(preview.request_body.is_null());
        assert!(
            generation_prompt_preview(
                &LanguageItemAiProviderConfig::DeterministicMock,
                &package,
                0
            )
            .is_err()
        );
        let legacy: AiProviderCall = serde_json::from_value(json!({
            "candidateOrdinal": 1, "phase": "initial", "elapsedMilliseconds": 4,
            "outcome": "responseReceived", "httpStatus": 200,
        }))
        .unwrap();
        assert!(legacy.request_body.is_none());
        assert!(
            serde_json::to_value(legacy)
                .unwrap()
                .get("requestBody")
                .is_none()
        );
    }

    #[tokio::test]
    async fn responses_transport_preserves_optional_fields_and_answer_maps() {
        let generation_schema: Value = serde_json::from_str(GENERATION_OUTPUT_SCHEMA).unwrap();
        let schema = json!({
            "type": "object",
            "required": ["proposedScoringPackage"],
            "properties": {
                "proposedScoringPackage": generation_schema["properties"]["candidates"]
                    ["items"]["properties"]["proposedScoringPackage"].clone()
            },
            "additionalProperties": false
        });
        let expected_output = json!({
            "proposedScoringPackage": {
                "scoringContractTemplateId": "SC-A1-MATCHING",
                "correctMatches": { "left-1": "right-2" }
            }
        });
        let provider_response = json!({
            "id": "response-local-fixture",
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": expected_output.to_string() }]
            }],
            "usage": { "input_tokens": 20, "output_tokens": 10, "total_tokens": 30 }
        });
        let (sent_request_tx, mut sent_request_rx) = tokio::sync::mpsc::channel(1);
        let app = axum::Router::new().route(
            "/responses",
            axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
                let sender = sent_request_tx.clone();
                let response = provider_response.clone();
                async move {
                    sender.send(body.clone()).await.unwrap();
                    let (status, response) = if body["text"]["format"]["strict"] == json!(false) {
                        (StatusCode::OK, response)
                    } else {
                        (
                            StatusCode::BAD_REQUEST,
                            json!({ "error": { "code": "invalid_json_schema" } }),
                        )
                    };
                    (
                        status,
                        [("x-request-id", "request-local-fixture")],
                        axum::Json(response),
                    )
                }
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap();
        let mut calls = Vec::new();
        let result = responses_structured_output(
            &client,
            StructuredOutputRequest {
                api_key: "local-test-key",
                base_url: &base_url,
                model: "local-test-model",
                instructions: "Return the answer map as JSON; omit unused scoring fields.",
                input: json!({ "task": "matching" }),
                format_name: "language_item_generation",
                schema: schema.clone(),
                example: expected_output.clone(),
            },
            &mut calls,
        )
        .await;
        server.abort();

        assert_eq!(result.unwrap(), expected_output);
        let sent = sent_request_rx.try_recv().unwrap();
        assert_eq!(calls[0].request_body.as_ref(), Some(&sent));
        assert_eq!(sent["store"], false);
        assert_eq!(sent["text"]["format"]["schema"], schema);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].http_status, Some(200));
        assert_eq!(calls[0].outcome, "responseReceived");
        assert_eq!(
            calls[0].provider_request_id.as_deref(),
            Some("request-local-fixture")
        );
        assert_eq!(
            calls[0].provider_response_id.as_deref(),
            Some("response-local-fixture")
        );
        assert_eq!(
            (
                calls[0].input_tokens,
                calls[0].output_tokens,
                calls[0].total_tokens
            ),
            (Some(20), Some(10), Some(30))
        );
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
