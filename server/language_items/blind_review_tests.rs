use super::*;
use crate::language_items::domain::{EnglishTranslation, InformationPoint};

const TEMPLATES: [&str; 7] = [
    "reading-single-select",
    "reading-matching",
    "reading-restricted-input",
    "writing-form-entry",
    "writing-typed-message",
    "speaking-single",
    "speaking-multiturn",
];

fn private_package(template: &str) -> TaskPackage {
    let mut package = TaskPackage::from_template("SECRET-TASK-ID".into(), template).unwrap();
    package.authoring_package.notes = vec!["SECRET-AUTHOR-NOTE".into()];
    package.authoring_package.english_translations = vec![EnglishTranslation {
        path: "/candidatePayload/prompt".into(),
        source_text: "SECRET-TRANSLATION-SOURCE".into(),
        english_text: "SECRET-ENGLISH-TRANSLATION".into(),
    }];
    package.scoring_package.answer_key_ref = Some("SECRET-ANSWER-KEY".into());
    package.scoring_package.task_specific_criteria = vec!["SECRET-SCORING-CRITERION".into()];
    package.content.target_content_ids = vec!["SECRET-LANGUAGE-TARGET".into()];
    package.content.required_information_points =
        vec![InformationPoint::new(0, "SECRET-INFORMATION-POINT")];
    package.variation = json!({"generationHistory": "SECRET-PRIOR-CONVERSATION"});
    package
}

fn single_select() -> TaskPackage {
    let mut package = private_package("reading-single-select");
    let payload = package.candidate_payload.as_single_select_mut().unwrap();
    payload.stimulus.text = Some("星期六下午三点关门。".into());
    payload.prompt = "星期六几点关门？".into();
    payload.options[0].text = Some("下午三点".into());
    payload.options[1].text = Some("上午九点".into());
    // Deliberately contradictory author answer: it must not influence the first call.
    package.scoring_package.correct_option_id = Some("B".into());
    package
}

fn answered(package: &TaskPackage) -> BlindAnswerAttempt {
    BlindAnswerAttempt {
        protocol_version: PROTOCOL_VERSION.into(),
        prompt_version: PROMPT_VERSION.into(),
        input_hash: input_hash(&candidate_input(package).unwrap()),
        simulated: false,
        status: BlindAnswerStatus::Answered,
        answer: "A".into(),
        alternatives: vec![],
        reasoning: "The notice explicitly gives the closing time.".into(),
        evidence: vec![ReviewEvidence {
            field_path: "/candidatePayload/stimulus/text".into(),
            quote: "下午三点关门".into(),
        }],
        limitations: vec![],
    }
}

#[test]
fn all_seven_formats_expose_only_the_rendered_candidate_fields() {
    for template in TEMPLATES {
        let package = private_package(template);
        let input = candidate_input(&package).unwrap();
        let fields = input.as_object().unwrap();
        assert_eq!(fields.len(), 2, "{template}");
        assert_eq!(input["itemFormatId"], package.item_format_id);
        assert!(input["candidatePayload"].is_object(), "{template}");
        assert!(
            input["candidatePayload"].get("prompt").is_some()
                || input["candidatePayload"].get("instructions").is_some(),
            "{template}"
        );
        assert!(!input.to_string().contains("SECRET"), "{template}");
        assert_eq!(input_hash(&input).len(), 64);
    }
}

#[test]
fn renderer_hidden_fields_are_never_exposed_or_accepted_as_evidence() {
    for template in TEMPLATES {
        let mut package = private_package(template);
        let hidden_pointer = match &mut package.candidate_payload {
            CandidatePayload::ExerciseTemplate(_) => {
                unreachable!("exercise templates have separate projection tests")
            }
            CandidatePayload::SingleSelect(payload) => {
                payload.options[0].image_ref = Some("SECRET-HIDDEN-IMAGE".into());
                "/candidatePayload/options/0/imageRef"
            }
            CandidatePayload::Matching(payload) => {
                payload.left_items[0].image_ref = Some("SECRET-HIDDEN-IMAGE".into());
                "/candidatePayload/leftItems/0/imageRef"
            }
            CandidatePayload::RestrictedInput(payload) => {
                payload.response_fields[0].input_type = "SECRET-HIDDEN-TYPE".into();
                "/candidatePayload/responseFields/0/inputType"
            }
            CandidatePayload::FormEntry(payload) => {
                payload.source_profile = Some(json!({"person": {"name": "SECRET-PROFILE"}}));
                "/candidatePayload/sourceProfile/person/name"
            }
            CandidatePayload::TypedMessage(payload) => {
                payload.length_guidance.count_by = "SECRET-HIDDEN-COUNT".into();
                "/candidatePayload/lengthGuidance/countBy"
            }
            CandidatePayload::SpokenSingle(payload) => {
                payload.required_content_points[0].description = "SECRET-EXPECTED-ACTION".into();
                payload.recipient = Some("SECRET-HIDDEN-RECIPIENT".into());
                payload.purpose = Some("SECRET-HIDDEN-PURPOSE".into());
                "/candidatePayload/requiredContentPoints/0/description"
            }
            CandidatePayload::SpokenMultiturn(payload) => {
                payload.paths[0].turns[1].required_function_ids =
                    vec!["SECRET-EXPECTED-ACTION".into()];
                payload.routing_rule_id = "SECRET-HIDDEN-ROUTING".into();
                let mut other = payload.paths[0].clone();
                other.path_id = "SECRET-UNSELECTED-PATH".into();
                other.turns[0].prompt_audio_ref = Some("SECRET-UNSELECTED-PROMPT".into());
                payload.paths.push(other);
                "/candidatePayload/paths/0/turns/1/requiredFunctionIds/0"
            }
        };
        let input = candidate_input(&package).unwrap();
        assert!(!input.to_string().contains("SECRET"), "{template}");
        assert!(input.pointer(hidden_pointer).is_none(), "{template}");
        let mut report = insufficient(&input, false, "Source is unavailable");
        report.evidence.push(ReviewEvidence {
            field_path: hidden_pointer.into(),
            quote: "SECRET".into(),
        });
        assert!(validate_attempt(&package, &report).is_err(), "{template}");
    }
}

#[test]
fn freeform_source_profile_rejects_nested_private_and_answer_hints() {
    for key in [
        "Correct_Option_ID",
        "acceptedResponses",
        "review-package",
        "authorNotes",
        "English_Translations",
        "rationale",
        "scoringPoints",
        "expectedAnswer",
        "requiredInformationPoints",
        "targetContentIds",
        "validationHints",
        "checkResults",
        "taskPackage",
        "englishGloss",
        "solution",
    ] {
        let mut package = private_package("writing-form-entry");
        let CandidatePayload::FormEntry(payload) = &mut package.candidate_payload else {
            unreachable!();
        };
        payload.source_profile = Some(json!({"public": [{"details": {key: "PRIVATE-VALUE"}}]}));
        let error = candidate_input(&package).unwrap_err();
        assert!(!error.to_string().contains("PRIVATE-VALUE"));
    }
    let mut package = private_package("writing-form-entry");
    let CandidatePayload::FormEntry(payload) = &mut package.candidate_payload else {
        unreachable!();
    };
    payload.source_profile = Some(json!({"person": {"name": "小林", "age": 18}}));
    assert!(candidate_input(&package).is_ok());
}

#[test]
fn answer_binding_ignores_private_changes_but_rejects_changed_candidate_content() {
    let mut package = single_select();
    let report = answered(&package);
    assert!(validate_attempt(&package, &report).is_ok());
    package.scoring_package.correct_option_id = Some("A".into());
    package
        .authoring_package
        .notes
        .push("Different author intent".into());
    package.content.target_content_ids.clear();
    assert!(validate_attempt(&package, &report).is_ok());
    package
        .candidate_payload
        .as_single_select_mut()
        .unwrap()
        .prompt
        .push('！');
    assert!(validate_attempt(&package, &report).is_err());
    package.item_format_id = "IF-MATCHING".into();
    assert!(candidate_input(&package).is_err());
}

#[test]
fn evidence_cannot_reveal_scoring_or_quote_fabricated_or_nontext_fields() {
    let package = single_select();
    for (path, quote) in [
        ("/scoringPackage/correctOptionId", "B"),
        ("/authoringPackage/notes/0", "SECRET-AUTHOR-NOTE"),
        ("candidatePayload.stimulus.text", "下午三点"),
        ("/candidatePayload/missing", "下午三点"),
        ("/candidatePayload/stimulus", "下午三点"),
        ("/candidatePayload/shuffleOptions", "false"),
        ("/candidatePayload/stimulus/text", "上午九点关门"),
        ("/candidatePayload/stimulus/text", " "),
    ] {
        let mut report = answered(&package);
        report.evidence[0] = ReviewEvidence {
            field_path: path.into(),
            quote: quote.into(),
        };
        assert!(
            validate_attempt(&package, &report).is_err(),
            "{path}: {quote}"
        );
    }
}

#[test]
fn selected_spoken_path_preserves_original_pointer_indices_without_hidden_turns() {
    let mut package = private_package("speaking-multiturn");
    let CandidatePayload::SpokenMultiturn(payload) = &mut package.candidate_payload else {
        unreachable!();
    };
    let mut selected = payload.paths[0].clone();
    selected.path_id = "PATH-2".into();
    selected.turns[0].prompt_audio_ref = Some("你叫什么名字？".into());
    payload.paths.push(selected);
    payload.start_path_id = "PATH-2".into();
    payload.paths[0].turns[0].prompt_audio_ref = Some("SECRET-HIDDEN-PATH".into());
    let input = candidate_input(&package).unwrap();
    assert_eq!(input["candidatePayload"]["paths"][0], Value::Null);
    assert_eq!(
        input
            .pointer("/candidatePayload/paths/1/turns/0/promptAudioRef")
            .unwrap(),
        "你叫什么名字？"
    );
    assert!(!input.to_string().contains("SECRET"));
    let mut report = insufficient(&input, false, "Audio reference is not actual audio");
    report.evidence.push(ReviewEvidence {
        field_path: "/candidatePayload/paths/1/turns/0/promptAudioRef".into(),
        quote: "你叫什么名字".into(),
    });
    assert!(validate_attempt(&package, &report).is_ok());
}

#[test]
fn statuses_require_consistent_supported_answers_and_server_versions() {
    let package = single_select();
    let base = answered(&package);
    for kind in 0..10 {
        let mut report = base.clone();
        match kind {
            0 => report.answer.clear(),
            1 => report.evidence.clear(),
            2 => report.reasoning = " ".into(),
            3 => report.alternatives = vec!["B".into()],
            4 => report.answer = "Z".into(),
            5 => report.protocol_version = "0".into(),
            6 => report.prompt_version = "0".into(),
            7 => report.input_hash = "forged".into(),
            8 => report.simulated = true,
            9 => report.limitations = vec![" ".into()],
            _ => unreachable!(),
        }
        assert!(validate_attempt(&package, &report).is_err(), "case {kind}");
    }
    let mut ambiguous = base.clone();
    ambiguous.status = BlindAnswerStatus::Ambiguous;
    assert!(validate_attempt(&package, &ambiguous).is_err());
    ambiguous.alternatives = vec!["B".into()];
    assert!(validate_attempt(&package, &ambiguous).is_ok());
    for alternatives in [vec!["A"], vec!["B", "B"], vec!["Z"], vec![" "]] {
        ambiguous.alternatives = alternatives.into_iter().map(str::to_string).collect();
        assert!(validate_attempt(&package, &ambiguous).is_err());
    }
    let mut incomplete = insufficient(&candidate_input(&package).unwrap(), false, "Missing source");
    assert!(validate_attempt(&package, &incomplete).is_ok());
    incomplete.answer = "A".into();
    assert!(validate_attempt(&package, &incomplete).is_err());
    incomplete.answer.clear();
    incomplete.limitations.clear();
    assert!(validate_attempt(&package, &incomplete).is_err());
}

#[test]
fn open_responses_can_be_answered_without_asserting_unique_correctness() {
    for template in [
        "writing-typed-message",
        "speaking-single",
        "speaking-multiturn",
    ] {
        let mut package = private_package(template);
        match &mut package.candidate_payload {
            CandidatePayload::TypedMessage(payload) => {
                payload.instructions = "请介绍你的爱好。".into()
            }
            CandidatePayload::SpokenSingle(payload) => {
                payload.instructions = "请介绍你的爱好。".into()
            }
            CandidatePayload::SpokenMultiturn(payload) => {
                payload.instructions = "请介绍你的爱好。".into()
            }
            _ => unreachable!(),
        }
        let mut report = answered(&package);
        report.answer = "我喜欢游泳。".into();
        report.reasoning =
            "One plausible response addresses the visible communicative task.".into();
        report.evidence = vec![ReviewEvidence {
            field_path: "/candidatePayload/instructions".into(),
            quote: "介绍你的爱好".into(),
        }];
        assert!(validate_attempt(&package, &report).is_ok(), "{template}");
    }
}

#[test]
fn provider_cannot_forge_metadata_or_unknown_statuses() {
    let output = json!({
        "status": "answered", "answer": "A", "alternatives": [],
        "reasoning": "The notice gives the time.",
        "evidence": [{"fieldPath": "/candidatePayload/stimulus/text", "quote": "下午三点"}],
        "limitations": []
    });
    assert!(serde_json::from_value::<BlindAnswerOutput>(output.clone()).is_ok());
    for key in [
        "inputHash",
        "protocolVersion",
        "promptVersion",
        "simulated",
        "approval",
    ] {
        let mut forged = output.clone();
        forged[key] = json!("provider-forged");
        assert!(serde_json::from_value::<BlindAnswerOutput>(forged).is_err());
    }
    let mut bad_status = output;
    bad_status["status"] = json!("approved");
    assert!(serde_json::from_value::<BlindAnswerOutput>(bad_status).is_err());
}

#[tokio::test]
async fn offline_attempt_is_explicitly_simulated_and_never_copies_authored_answers() {
    let package = single_select();
    let report = attempt(
        &LanguageItemAiProviderConfig::DeterministicMock,
        &Client::new(),
        &package,
    )
    .await
    .unwrap();
    assert!(report.simulated);
    assert_eq!(report.status, BlindAnswerStatus::InsufficientInformation);
    assert!(report.answer.is_empty());
    assert!(report.evidence.is_empty());
    assert!(!serde_json::to_string(&report).unwrap().contains("SECRET"));
    assert!(validate_attempt(&package, &report).is_ok());
}

#[tokio::test]
async fn media_and_external_sources_cannot_be_silently_treated_as_perceived_content() {
    for (template, pointer) in [
        ("reading-single-select", "/stimulus/imageRefs"),
        ("reading-single-select", "/stimulus/audioRef"),
        ("reading-single-select", "/options/0/imageRef"),
        ("reading-matching", "/leftItems/0/imageRef"),
        ("reading-matching", "/rightItems/0/imageRef"),
        ("reading-restricted-input", "/stimulus/audioRef"),
        ("writing-typed-message", "/sourceMaterialRefs"),
        ("speaking-single", "/promptAudioRef"),
        ("speaking-single", "/sourceMaterialRefs"),
        ("speaking-multiturn", "/paths/0/turns/0/promptAudioRef"),
        ("writing-form-entry", "/sourceProfile"),
    ] {
        let mut package = private_package(template);
        let mut payload = serde_json::to_value(&package.candidate_payload).unwrap();
        *payload.pointer_mut(pointer).unwrap() = if pointer.ends_with("Refs") {
            json!(["unavailable-material"])
        } else if pointer.ends_with("sourceProfile") {
            json!({"documents": [{"image_ref": "unavailable-material"}]})
        } else {
            json!("unavailable-material")
        };
        package.candidate_payload = serde_json::from_value(payload).unwrap();
        let config = LanguageItemAiProviderConfig::OpenAi {
            api_key: "fixture".into(),
            base_url: "http://127.0.0.1:9".into(),
            model: "fixture".into(),
        };
        let report = attempt(&config, &Client::new(), &package).await.unwrap();
        assert!(!report.simulated);
        assert_eq!(
            report.status,
            BlindAnswerStatus::InsufficientInformation,
            "{template} {pointer}"
        );
        assert!(report.limitations[0].contains("could not inspect"));
        assert!(validate_attempt(&package, &report).is_ok());
        let forged = answered(&package);
        assert!(validate_attempt(&package, &forged).is_err());
    }
}

#[tokio::test]
async fn actual_provider_requests_are_stateless_and_contain_only_permitted_item_data() {
    for use_deepseek in [true, false] {
        let package = single_select();
        let output = json!({
            "status": "answered", "answer": "A", "alternatives": [],
            "reasoning": "The notice explicitly gives the closing time.",
            "evidence": [{"fieldPath": "/candidatePayload/stimulus/text", "quote": "下午三点关门"}],
            "limitations": []
        })
        .to_string();
        let (sender, mut receiver) = tokio::sync::mpsc::channel(1);
        let path = if use_deepseek {
            "/chat/completions"
        } else {
            "/responses"
        };
        let app = axum::Router::new().route(path, axum::routing::post(
            move |axum::Json(body): axum::Json<Value>| {
                let sender = sender.clone();
                let output = output.clone();
                async move {
                    sender.send(body).await.unwrap();
                    axum::Json(if use_deepseek {
                        json!({"choices": [{"message": {"content": output}}]})
                    } else {
                        json!({"output": [{"type": "message", "content": [{"type": "output_text", "text": output}]}]})
                    })
                }
            }
        ));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let config = if use_deepseek {
            LanguageItemAiProviderConfig::DeepSeek {
                api_key: "fixture".into(),
                base_url,
                model: "fixture".into(),
            }
        } else {
            LanguageItemAiProviderConfig::OpenAi {
                api_key: "fixture".into(),
                base_url,
                model: "fixture".into(),
            }
        };
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let client = Client::builder()
            .no_proxy()
            .timeout(std::time::Duration::from_secs(5))
            .build()
            .unwrap();
        let result = attempt(&config, &client, &package).await;
        server.abort();
        let report = result.unwrap();
        assert_eq!(report.answer, "A");
        assert_eq!(
            package.scoring_package.correct_option_id.as_deref(),
            Some("B")
        );
        let request = receiver.try_recv().unwrap();
        assert!(!request.to_string().contains("SECRET"));
        assert!(request.get("previous_response_id").is_none());
        let sent_input = if use_deepseek {
            let messages = request["messages"].as_array().unwrap();
            assert_eq!(messages.len(), 2);
            assert_eq!(messages[0]["role"], "system");
            assert_eq!(messages[1]["role"], "user");
            let envelope: Value =
                serde_json::from_str(messages[1]["content"].as_str().unwrap()).unwrap();
            envelope["input"].clone()
        } else {
            assert_eq!(request["store"], false);
            serde_json::from_str(request["input"].as_str().unwrap()).unwrap()
        };
        assert_eq!(sent_input, candidate_input(&package).unwrap());
        assert_eq!(report.input_hash, input_hash(&sent_input));
    }
}
