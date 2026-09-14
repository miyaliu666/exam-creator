use super::*;
use crate::language_items::{
    domain::{InformationPoint, task_package_hash},
    registry::{
        hydrate_published_registry_snapshot, install_published_snapshot, prepare_registry_draft,
        snapshot,
    },
    registry_store::validate_registry,
};

async fn run_two_stage_case(
    modern: bool,
    failing_stage: u8,
) -> (PreliminaryReviewOutcome, Vec<Value>, TaskPackage) {
    let (mut registry, mut package) = fixture();
    if !modern {
        registry.settings_schema_version = 1;
        registry.review_rule_sets.clear();
    }
    package.authoring_package.notes = vec!["AUTHOR_SECRET_EXPECT_A".into()];
    package.content.required_information_points[0].label = "TARGET_SECRET".into();
    install_published_snapshot(registry, false);
    let (send, mut receive) = tokio::sync::mpsc::unbounded_channel();
    let app = axum::Router::new().route("/responses", axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
        let send = send.clone();
        async move {
            let input: Value = serde_json::from_str(body["input"].as_str().unwrap()).unwrap();
            let is_blind = input.get("candidatePayload").is_some();
            send.send(body).unwrap();
            let output = if (is_blind && failing_stage == 1) || (!is_blind && failing_stage == 2) {
                json!({"invalidResult": true})
            } else if is_blind {
                json!({"status":"answered","answer":"B","alternatives":[],"reasoning":"独立作答观察，交给后续核对。","evidence":[{"fieldPath":"/candidatePayload/stimulus/text","quote":"星期一不开门"}],"limitations":[]})
            } else {
                let mut result = json!({"findings":[{"category":"scoring","severity":"warning","code":"answer.independentDisagreement","fieldPath":"candidatePayload","ruleRef":input["allowedRuleRefs"][0],"message":"独立答案与作者答案不同，需要人工判断；不能仅据此认定作者错误。"}]});
                if let Some(checks) = input["checksToEvaluate"].as_array() {
                    result["checkResults"] = json!(checks.iter().map(|check| json!({"checkId":check["id"],"status":"pass","message":"测试检查已覆盖。","evidence":[{"fieldPath":"/candidatePayload/prompt","quote":"哪一天不能来？"}],"sourceRefs":check["sourceRefs"]})).collect::<Vec<_>>());
                }
                result
            };
            axum::Json(json!({"output_text":output.to_string()}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let config = LanguageItemAiProviderConfig::OpenAi {
        api_key: "test-only".into(),
        base_url: format!("http://{}", listener.local_addr().unwrap()),
        model: "test-only".into(),
    };
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let original = serde_json::to_value(&package).unwrap();
    let outcome = preliminary_review(&config, &reqwest::Client::new(), &package).await;
    server.abort();
    assert_eq!(
        serde_json::to_value(&package).unwrap(),
        original,
        "Review must never change authored content"
    );
    let mut requests = Vec::new();
    while let Ok(request) = receive.try_recv() {
        requests.push(request);
    }
    (outcome, requests, package)
}

#[tokio::test]
async fn two_stage_review_withholds_answers_then_reveals_them_without_changing_the_observation() {
    for modern in [false, true] {
        let (outcome, requests, package) = run_two_stage_case(modern, 0).await;
        assert_eq!(requests.len(), 2);
        let first: Value = serde_json::from_str(requests[0]["input"].as_str().unwrap()).unwrap();
        assert_eq!(first.as_object().unwrap().len(), 2);
        assert!(first.get("candidatePayload").is_some());
        assert!(first.get("itemFormatId").is_some());
        for secret in [
            "AUTHOR_SECRET",
            "TARGET_SECRET",
            "correctOptionId",
            "scoringPackage",
            "reviewPlan",
            "taskPackage",
            "englishTranslations",
        ] {
            assert!(
                !requests[0].to_string().contains(secret),
                "First request leaked {secret}"
            );
        }
        assert!(requests[0].get("previous_response_id").is_none());
        assert!(requests[1].get("previous_response_id").is_none());
        let revealed: Value = serde_json::from_str(requests[1]["input"].as_str().unwrap()).unwrap();
        assert_eq!(
            revealed["taskPackage"]["scoringPackage"]["correctOptionId"],
            "A"
        );
        let answer = outcome.blind_answer.unwrap();
        assert_eq!(answer.answer, "B");
        assert_eq!(
            revealed["independentAnswer"],
            serde_json::to_value(&answer).unwrap()
        );
        assert!(super::super::blind_review::validate_attempt(&package, &answer).is_ok());
        let assessment = outcome.assessment.unwrap();
        assert_eq!(assessment.review_plan.is_some(), modern);
        assert!(
            assessment
                .findings
                .iter()
                .any(|finding| finding.code == "answer.independentDisagreement"
                    && finding.severity == "warning")
        );
    }
}

#[tokio::test]
async fn two_stage_review_stops_before_reveal_when_the_independent_output_is_invalid() {
    let (outcome, requests, _) = run_two_stage_case(true, 1).await;
    assert!(outcome.assessment.is_err());
    assert!(outcome.blind_answer.is_none());
    assert_eq!(
        requests.len(),
        1,
        "Failed independent solving must not proceed to an answer-revealed review"
    );
}

#[tokio::test]
async fn two_stage_review_retains_the_independent_answer_when_reveal_review_fails() {
    for modern in [false, true] {
        let (outcome, requests, package) = run_two_stage_case(modern, 2).await;
        assert!(outcome.assessment.is_err());
        assert_eq!(requests.len(), 2);
        let answer = outcome.blind_answer.unwrap();
        assert_eq!(answer.answer, "B");
        assert!(super::super::blind_review::validate_attempt(&package, &answer).is_ok());
    }
}

fn fixture() -> (RegistrySnapshot, TaskPackage) {
    let mut registry = snapshot().clone();
    prepare_registry_draft(&mut registry);
    registry.bundle_version = format!("review-plan-test-{}", uuid::Uuid::new_v4());
    let mut package = TaskPackage::new("LI-REVIEW-PLAN-TEST".into());
    package.spec_versions.registry_bundle_version = registry.bundle_version.clone();
    package.content.target_content_ids = vec!["LEX-A1-0208".into()];
    package.content.required_information_points = vec![InformationPoint::new(0, "营业日期")];
    let payload = package.candidate_payload.as_single_select_mut().unwrap();
    payload.stimulus.text = Some("星期一不开门".into());
    payload.prompt = "哪一天不能来？".into();
    payload.options[0].text = Some("星期一".into());
    payload.options[1].text = Some("星期二".into());
    (registry, package)
}

fn preview_for(registry: &RegistrySnapshot, package: &TaskPackage) -> ReviewPlanPreview {
    preview(
        registry,
        &package.item_rule_id,
        &package.item_format_id,
        &package.content.primary_can_do_id,
    )
    .unwrap()
}

fn add_custom(registry: &mut RegistrySnapshot, package: &TaskPackage) {
    let preview = preview_for(registry, package);
    registry.review_rule_sets = vec![ReviewRuleSet {
        item_rule_id: package.item_rule_id.clone(),
        item_format_id: package.item_format_id.clone(),
        primary_can_do_id: package.content.primary_can_do_id.clone(),
        source_fingerprint: preview.source_fingerprint,
        source_fingerprints: preview.source_fingerprints,
        rules: vec![ReviewCustomRule {
            id: "custom.answer-dependence".into(),
            title: "回答需要理解时间".into(),
            criterion: "正确选项依赖通知中的时间信息。".into(),
            required_evidence: vec!["引用通知、问题与正确选项。".into()],
            source_refs: vec![preview.sources[0].id.clone()],
            required: false,
        }],
    }];
}

fn passing_results(package: &TaskPackage, plan: &ReviewPlan) -> Vec<ReviewCheckResult> {
    let mut results = vec![mechanical_result(package, plan)];
    results.extend(
        plan.checks
            .iter()
            .filter(|check| check.method == "ai")
            .map(|check| ReviewCheckResult {
                check_id: check.id.clone(),
                status: ReviewCheckStatus::Pass,
                message: "审核测试：原文证据与检查项对应。".into(),
                evidence: vec![ReviewEvidence {
                    field_path: "/candidatePayload/prompt".into(),
                    quote: "哪一天不能来？".into(),
                }],
                source_refs: check.source_refs.clone(),
            }),
    );
    results
}

fn report(package: &TaskPackage, plan: ReviewPlan, results: Vec<ReviewCheckResult>) -> AiReviewRun {
    AiReviewRun {
        id: "review-test".into(),
        version_id: None,
        item_id: package.task_id.clone(),
        draft_revision: Some(1),
        content_hash: Some(task_package_hash(package)),
        provider: "openai".into(),
        model: "local-test".into(),
        model_version: "local-test".into(),
        prompt_id: ai::REVIEW_PROMPT_ID.into(),
        prompt_version: ai::REVIEW_PROMPT_VERSION.into(),
        schema_version: ai::REVIEW_SCHEMA_VERSION.into(),
        spec_versions: package.spec_versions.clone(),
        findings: vec![],
        review_plan: Some(plan),
        check_results: Some(results),
        blind_answer: None,
        status: "completed".into(),
        error: None,
        created_by: "author@example.test".into(),
        created_at: "2026-09-13T00:00:00Z".into(),
    }
}

#[test]
fn legacy_publications_are_not_enriched_but_new_drafts_get_a_plan_without_custom_rules() {
    let mut legacy = snapshot().clone();
    let original = serde_json::to_value(&legacy).unwrap();
    assert!(original.get("reviewRuleSets").is_none());
    hydrate_published_registry_snapshot(&mut legacy);
    assert_eq!(serde_json::to_value(&legacy).unwrap(), original);
    assert!(
        plan_for_package(&TaskPackage::new("legacy".into()))
            .unwrap()
            .is_none()
    );
    let (registry, package) = fixture();
    assert_eq!(registry.settings_schema_version, 3);
    assert!(registry.review_rule_sets.is_empty());
    install_published_snapshot(registry, false);
    let plan = plan_for_package(&package).unwrap().unwrap();
    assert!(plan.checks.iter().all(|check| check.required));
    assert!(
        plan.checks
            .iter()
            .any(|check| check.id == "fixed.target.LEX-A1-0208")
    );
}

#[test]
fn plans_instantiate_context_difficulty_and_each_required_target() {
    let (mut registry, package) = fixture();
    let target = registry
        .content_id_options
        .iter_mut()
        .find(|entry| entry.id == package.content.target_content_ids[0])
        .unwrap();
    target.assessment_rules = serde_json::from_value(json!([{
        "itemRuleId":package.item_rule_id,"itemFormatId":package.item_format_id,"primaryCanDoId":package.content.primary_can_do_id,"contextId":package.content.context_id,"applicability":"allowed","assessmentMode":"understanding","communicativePurpose":"确认开放时间","requiredEvidence":["必须依据日期判断能否到访"]
    }])).unwrap();
    let context = registry
        .context_options
        .iter()
        .find(|context| context.id == package.content.context_id)
        .unwrap()
        .clone();
    install_published_snapshot(registry, false);
    let plan = plan_for_package(&package).unwrap().unwrap();
    let context_check = plan
        .checks
        .iter()
        .find(|check| check.id == "fixed.context")
        .unwrap();
    assert!(context_check.title.contains(&context.label));
    assert!(context_check.criterion.contains(&context.scope));
    let difficulty = plan
        .checks
        .iter()
        .find(|check| check.id == "fixed.difficulty")
        .unwrap();
    assert!(difficulty.criterion.contains("information points: 1"));
    assert!(!plan.checks.iter().any(|check| check.id == "fixed.targets"));
    assert_eq!(
        plan.checks
            .iter()
            .filter(|check| check.id.starts_with("fixed.target."))
            .count(),
        package.content.target_content_ids.len()
    );
    let target_check = plan
        .checks
        .iter()
        .find(|check| check.id == "fixed.target.LEX-A1-0208")
        .unwrap();
    assert!(
        target_check
            .criterion
            .contains("Assessment mode: Understanding")
    );
    assert!(target_check.criterion.contains("确认开放时间"));
    assert!(
        target_check
            .required_evidence
            .iter()
            .any(|evidence| evidence == "必须依据日期判断能否到访")
    );
    let mut frozen = package.clone();
    frozen.task_version = "1".into();
    frozen
        .review_package
        .gates
        .insert("editorial".into(), json!({"status":"pending"}));
    assert_eq!(
        plan_for_package(&frozen).unwrap().unwrap().plan_hash,
        plan.plan_hash
    );
}

#[test]
fn source_fingerprint_tracks_fixed_changes_while_custom_edits_change_only_the_plan() {
    let (mut registry, package) = fixture();
    add_custom(&mut registry, &package);
    let original = preview_for(&registry, &package);
    assert!(!original.stale);
    assert!(validate_registry(&registry).valid);
    registry.review_rule_sets[0].rules[0]
        .criterion
        .push_str("且不能猜测。");
    let custom_changed = preview_for(&registry, &package);
    assert_eq!(
        original.source_fingerprint,
        custom_changed.source_fingerprint
    );
    assert_ne!(original.plan.plan_hash, custom_changed.plan.plan_hash);
    assert!(!custom_changed.stale);
    registry
        .can_do_options
        .iter_mut()
        .find(|entry| entry.id == package.content.primary_can_do_id)
        .unwrap()
        .label
        .push_str(" changed");
    let fixed_changed = preview_for(&registry, &package);
    assert!(fixed_changed.stale);
    assert!(
        fixed_changed
            .source_changes
            .iter()
            .any(|change| change.source_ref.starts_with("itemRule.") && change.change == "changed")
    );
    assert!(
        validate_registry(&registry)
            .issues
            .iter()
            .any(|issue| issue.code == "registry.staleReviewRules")
    );
}

#[test]
fn publication_rejects_invalid_custom_rules_and_cannot_remove_required_human_gates() {
    let (mut registry, package) = fixture();
    add_custom(&mut registry, &package);
    registry.review_rule_sets[0].rules[0].id = "fixed.scoring".into();
    assert!(
        validate_rule_sets(&registry)
            .iter()
            .any(|issue| issue.code == "registry.invalidReviewRule")
    );
    registry.review_rule_sets[0].rules[0].id = "custom.test".into();
    registry.review_rule_sets[0].rules[0].source_refs = vec!["invented-rule".into()];
    assert!(
        validate_rule_sets(&registry)
            .iter()
            .any(|issue| issue.code == "registry.invalidReviewRule")
    );
    registry.review_rule_sets.clear();
    registry.required_review_gate_ids.pop();
    assert!(
        validate_rule_sets(&registry)
            .iter()
            .any(|issue| issue.code == "registry.requiredReviewGate")
    );
    registry.settings_schema_version = 1;
    assert!(
        validate_rule_sets(&registry).is_empty(),
        "legacy publication semantics remain unchanged"
    );
}

#[test]
fn review_results_require_coverage_correct_sources_and_verbatim_evidence() {
    let (registry, package) = fixture();
    install_published_snapshot(registry, false);
    let plan = plan_for_package(&package).unwrap().unwrap();
    let results = passing_results(&package, &plan);
    assert!(validate_check_results(&package, &plan, &results).is_ok());
    let mut invalid_results = results.clone();
    invalid_results.pop();
    assert!(validate_check_results(&package, &plan, &invalid_results).is_err());
    for defect in [
        "duplicate",
        "unknown",
        "source",
        "quote",
        "pointer",
        "missingEvidence",
        "mechanical",
    ] {
        let mut invalid_results = results.clone();
        match defect {
            "duplicate" => invalid_results[1].check_id = invalid_results[0].check_id.clone(),
            "unknown" => invalid_results[1].check_id = "invented".into(),
            "source" => invalid_results[1].source_refs = vec!["invented".into()],
            "quote" => invalid_results[1].evidence[0].quote = "编造的原文".into(),
            "pointer" => {
                invalid_results[1].evidence[0].field_path = "/content/primaryCanDoId".into()
            }
            "missingEvidence" => invalid_results[1].evidence.clear(),
            _ => invalid_results[0].status = ReviewCheckStatus::InsufficientEvidence,
        }
        assert!(
            validate_check_results(&package, &plan, &invalid_results).is_err(),
            "{defect}"
        );
    }
}

#[test]
fn required_failure_or_insufficient_evidence_blocks_submission_without_disabling_report_reuse() {
    let (mut registry, package) = fixture();
    add_custom(&mut registry, &package);
    install_published_snapshot(registry, false);
    let plan = plan_for_package(&package).unwrap().unwrap();
    let results = passing_results(&package, &plan);
    let mut report = report(&package, plan, results);
    assert!(require_current_plan_report(&package, &report).is_ok());
    let results = report.check_results.as_mut().unwrap();
    results
        .iter_mut()
        .find(|result| result.check_id.starts_with("custom."))
        .unwrap()
        .status = ReviewCheckStatus::InsufficientEvidence;
    assert!(require_current_plan_report(&package, &report).is_ok());
    for status in [
        ReviewCheckStatus::Fail,
        ReviewCheckStatus::InsufficientEvidence,
    ] {
        report.check_results.as_mut().unwrap()[1].status = status;
        assert!(require_current_plan_report(&package, &report).is_err());
        assert!(report_matches_plan(&package, &report));
    }
    report.review_plan.as_mut().unwrap().plan_hash = "old-plan".into();
    assert!(!report_matches_plan(&package, &report));
    assert!(require_current_plan_report(&package, &report).is_err());
}

#[tokio::test]
async fn mock_suggestions_and_reviews_are_explicitly_simulated_and_preserve_settings() {
    let (registry, package) = fixture();
    let before = serde_json::to_value(&registry).unwrap();
    let client = reqwest::Client::new();
    let suggestions = suggest(
        &LanguageItemAiProviderConfig::DeterministicMock,
        &client,
        preview_for(&registry, &package),
    )
    .await
    .unwrap();
    assert!(suggestions.simulated);
    assert_eq!(suggestions.provider, "deterministic-mock");
    assert_eq!(serde_json::to_value(&registry).unwrap(), before);
    install_published_snapshot(registry, false);
    let review = assess(
        &LanguageItemAiProviderConfig::DeterministicMock,
        &client,
        &package,
    )
    .await
    .unwrap();
    let report = report(
        &package,
        review.review_plan.unwrap(),
        review.check_results.unwrap(),
    );
    assert!(
        report
            .check_results
            .as_ref()
            .unwrap()
            .iter()
            .filter(|result| result.check_id != "fixed.mechanical")
            .all(|result| result.status == ReviewCheckStatus::InsufficientEvidence)
    );
    assert!(require_current_plan_report(&package, &report).is_err());
}

#[tokio::test]
async fn modern_provider_review_and_generation_share_saved_rules_and_validate_output() {
    let (mut registry, package) = fixture();
    registry
        .content_id_options
        .iter_mut()
        .find(|entry| entry.id == package.content.target_content_ids[0])
        .unwrap()
        .mastery_scope = Some("receptiveProductive".into());
    let standards = &mut registry
        .capability_difficulty_profile_sets
        .iter_mut()
        .find(|set| {
            set.item_rule_id == package.item_rule_id
                && set.item_format_id == package.item_format_id
                && set.primary_can_do_id == package.content.primary_can_do_id
        })
        .unwrap()
        .standards;
    standards[0].default_drivers.information_points = 1;
    standards[0].information_points_min = 1;
    standards[0].information_points_max = 2;
    add_custom(&mut registry, &package);
    let suggestion_preview = preview_for(&registry, &package);
    let saved_registry = serde_json::to_value(&registry).unwrap();
    install_published_snapshot(registry.clone(), false);
    let (send, mut receive) = tokio::sync::mpsc::unbounded_channel::<Value>();
    let app = axum::Router::new().route("/responses", axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
        let send = send.clone();
        async move {
            let input: Value = serde_json::from_str(body["input"].as_str().unwrap()).unwrap();
            send.send(json!({"input":input,"instructions":body["instructions"]})).unwrap();
            let output = if let Some(checks) = input["checksToEvaluate"].as_array() {
                let results = checks.iter().map(|check| json!({"checkId":check["id"],"status":"pass","message":"已检查原文证据。","evidence":[{"fieldPath":"/candidatePayload/prompt","quote":"哪一天不能来？"}],"sourceRefs":check["sourceRefs"]})).collect::<Vec<_>>();
                json!({"findings":[],"checkResults":results})
            } else {
                json!({"suggestions":[]})
            };
            axum::Json(json!({"output_text":output.to_string()}))
        }
    }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let config = LanguageItemAiProviderConfig::OpenAi {
        api_key: "local-test-only".into(),
        base_url: format!("http://{}", listener.local_addr().unwrap()),
        model: "local-test".into(),
    };
    let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    let review = assess(&config, &reqwest::Client::new(), &package)
        .await
        .unwrap();
    let review_request = receive.try_recv().unwrap();
    let input = &review_request["input"];
    let report = report(
        &package,
        review.review_plan.unwrap(),
        review.check_results.unwrap(),
    );
    assert!(require_current_plan_report(&package, &report).is_ok());
    assert!(
        input["checksToEvaluate"]
            .as_array()
            .unwrap()
            .iter()
            .any(|check| check["id"] == "custom.answer-dependence")
    );
    let generation = ai::generation_prompt_preview(&config, &package, 1).unwrap();
    let request: Value =
        serde_json::from_str(generation.request_body["input"].as_str().unwrap()).unwrap();
    assert_eq!(request["taskBrief"]["reviewPlan"], input["reviewPlan"]);
    assert!(
        receive.try_recv().is_err(),
        "generation prompt preview must not call the provider"
    );
    let suggestions = suggest(&config, &reqwest::Client::new(), suggestion_preview.clone())
        .await
        .unwrap();
    server.abort();
    assert!(suggestions.suggestions.is_empty());
    assert!(!suggestions.simulated);
    assert_eq!(suggestions.prompt_version, "0.1");
    assert_eq!(serde_json::to_value(&registry).unwrap(), saved_registry);
    assert_eq!(
        suggestions.preview.source_fingerprint,
        suggestion_preview.source_fingerprint
    );
    let suggestion_request = receive.try_recv().unwrap();
    assert_eq!(
        suggestion_request["input"]["reviewPlan"],
        json!(suggestion_preview.plan),
        "gap analysis must include existing fixed and custom checks"
    );
    assert_eq!(
        json!(suggestions.preview.sources),
        json!(suggestion_preview.sources)
    );
    assert_eq!(
        suggestions.preview.source_fingerprints,
        suggestion_preview.source_fingerprints
    );
    let sent_sources = suggestion_request["input"]["fixedSources"]
        .as_array()
        .unwrap();
    assert_eq!(sent_sources.len(), suggestion_preview.sources.len());
    for source in &suggestion_preview.sources {
        let sent = sent_sources
            .iter()
            .find(|sent| sent["id"] == source.id)
            .unwrap();
        assert_eq!(sent["label"], source.label);
        if source.id.starts_with("itemRule.") {
            assert!(source.value.get("candidateSchemas").is_some());
            assert!(source.value.get("taskPackageSchema").is_some());
            assert!(sent["value"].get("candidateSchemas").is_none());
            assert!(sent["value"].get("taskPackageSchema").is_none());
            assert_eq!(sent["value"].as_object().unwrap().len(), 2);
            for field in ["capability", "canDoStatements"] {
                assert_eq!(sent["value"][field], source.value[field]);
            }
        } else {
            assert_eq!(
                sent["value"], source.value,
                "all Contexts, complete difficulty ranges, scoring, semantic language metadata and assessment boundaries must survive projection"
            );
        }
    }
    let full_source_bytes = serde_json::to_vec(&suggestion_preview.sources)
        .unwrap()
        .len();
    let sent_source_bytes = serde_json::to_vec(sent_sources).unwrap().len();
    assert!(sent_source_bytes < full_source_bytes);
    println!("suggestion source projection: {full_source_bytes} -> {sent_source_bytes} bytes");
    let difficulty_source = suggestion_request["input"]["fixedSources"]
        .as_array()
        .unwrap()
        .iter()
        .find(|source| source["id"].as_str().unwrap().starts_with("difficulty."))
        .unwrap();
    assert_eq!(
        difficulty_source["value"][0]["defaultDrivers"]["informationPoints"],
        1
    );
    assert_eq!(difficulty_source["value"][0]["informationPointsMax"], 2);
    let response_demand = suggestion_request["input"]["responseDemand"]
        .as_str()
        .unwrap();
    assert_eq!(
        input["fixedSources"],
        suggestion_request["input"]["fixedSources"]
    );
    assert_eq!(input["responseDemand"], response_demand);
    assert!(response_demand.contains("assess reading comprehension"));
    assert!(response_demand.contains("selects an answer from supplied options"));
    assert!(response_demand.contains("does not establish productive use"));
    assert!(response_demand.contains(
        "Entries permitting both understanding and production still require only understanding"
    ));
    assert!(!response_demand.contains("receptiveProductive"));
    let listening = registry
        .capabilities
        .iter()
        .find(|capability| {
            capability.primary_reported_skill == "Listening"
                && capability.item_format_id == "IF-SINGLE-SELECT"
        })
        .unwrap();
    let listening_preview = preview(
        &registry,
        &listening.item_rule_id,
        &listening.item_format_id,
        &listening.primary_can_do_id,
    )
    .unwrap();
    let listening_demand = review_response_demand(&listening_preview).unwrap();
    assert!(listening_demand.contains("assess listening comprehension"));
    assert!(listening_demand.contains("does not establish productive use"));
    let instructions = suggestion_request["instructions"].as_str().unwrap();
    assert!(instructions.contains("zero to four"));
    assert!(instructions.contains("every saved custom check"));
    assert!(instructions.contains("empty suggestions array"));
    assert!(instructions.contains("Do not put internal identifiers"));
    assert!(instructions.contains("A default is a starting value, not the sole permitted value"));
    assert!(instructions.contains(
        "masteryScope describes its eligibility across skills, not an additional response demand"
    ));
    assert!(instructions.contains("selecting it is not the candidate producing that expression"));
}
