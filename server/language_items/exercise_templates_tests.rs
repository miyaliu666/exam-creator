use super::*;
use crate::language_items::{
    blind_review,
    content_context::content_context_matches,
    registry::{install_published_snapshot, snapshot},
    registry_store::validate_registry,
    validation::{validate_candidate_privacy, validate_task_package},
};

fn rule(registry: &RegistrySnapshot, id: &str, kind: &str, can_do: &str) -> ExerciseTemplateRule {
    ExerciseTemplateRule {
        id: id.into(),
        exercise_type: kind.into(),
        primary_can_do_id: can_do.into(),
        enabled: true,
        allowed_domains: vec!["Public".into()],
        allowed_context_ids: vec![],
        task_requirements: "Locate the explicit time in a short everyday message.".into(),
        difficulty_standards: registry.difficulty_standards.clone(),
        scoring: ExerciseTemplateScoring {
            method: "perResponse".into(),
            criteria: "One point for each correct response.".into(),
            normalization_policy: "Use only the authored accepted answers.".into(),
        },
        review_criteria: vec!["All answers must be supported by the source material.".into()],
        defaults: BTreeMap::new(),
    }
}

fn reading_package() -> (RegistrySnapshot, TaskPackage) {
    let mut registry = snapshot().clone();
    crate::language_items::registry::prepare_registry_draft(&mut registry);
    registry.bundle_version = "test-exercise-template-reading-v1".into();
    registry
        .exercise_template_rules
        .push(rule(&registry, "read-time", "multiple-choice", "A1-R2"));
    prepare_draft(&mut registry);
    let capability = registry
        .capabilities
        .iter()
        .find(|entry| entry.item_rule_id == "read-time")
        .unwrap();
    let mut package = crate::routes::language_items::draft_for_capability(
        "exercise-test-item".into(),
        capability,
        &registry,
        Some("Public"),
        None,
        Some("TypicalA1"),
    )
    .unwrap();
    package.authoring_package.exercise_template = Some(ExerciseTemplateContent {
        exercise_type: "multiple-choice".into(),
        body: "The course begins at nine.".into(),
        data: json!({"type":"multiple-choice","title":"Course time","level":"A1","language":"en",
            "questions":[{"prompt":"When does the course begin?","options":["Nine","Ten"],"correct":0,"explanation":"The message says nine."}]}),
    });
    let target = registry
        .content_id_options
        .iter_mut()
        .find(|entry| entry.kind != "supported")
        .unwrap();
    target.context_ids.clear();
    target.can_do_ids.clear();
    target.mastery_scope = Some("receptiveProductive".into());
    target
        .metadata
        .insert("contextScopeMode".into(), json!("all"));
    target
        .metadata
        .insert("excludedContextIds".into(), json!([]));
    target.assessment_rules.clear();
    package.content.target_content_ids = vec![target.id.clone()];
    package.content.required_information_points = (0..usize::from(
        package
            .content
            .difficulty
            .as_ref()
            .unwrap()
            .drivers
            .information_points,
    ))
        .map(|index| crate::language_items::domain::InformationPoint::new(index, "Course time"))
        .collect();
    refresh_package(&mut package, &registry).unwrap();
    install_published_snapshot(registry.clone(), false);
    (registry, package)
}

#[test]
fn explicit_item_language_sets_source_defaults_and_rejects_mismatched_source_metadata() {
    let (mut registry, mut package) = reading_package();
    registry.bundle_version = "source-template-selected-language-test".into();
    package.spec_versions.registry_bundle_version = registry.bundle_version.clone();
    for target in &mut registry.content_id_options {
        if package.content.target_content_ids.contains(&target.id) {
            target.metadata.insert("language".into(), json!("en"));
        }
    }
    install_published_snapshot(registry.clone(), false);
    crate::routes::language_items::set_draft_language(&mut package, "en", &registry).unwrap();
    assert_eq!(
        package
            .authoring_package
            .exercise_template
            .as_ref()
            .unwrap()
            .data["language"],
        "en"
    );
    assert!(
        !validate_task_package(&package)
            .issues
            .iter()
            .any(|issue| issue.code == "authoring.exerciseLanguage"
                || issue.code == "authoring.contentLanguage")
    );
    package
        .authoring_package
        .exercise_template
        .as_mut()
        .unwrap()
        .data["language"] = json!("es");
    assert!(
        validate_task_package(&package)
            .issues
            .iter()
            .any(|issue| issue.code == "authoring.exerciseLanguage")
    );
    assert!(
        crate::routes::language_items::set_draft_language(&mut package, "fr", &registry).is_err()
    );
}

#[test]
fn all_sixty_catalog_entries_have_known_field_only_candidate_projections() {
    let entries = CATALOG["templates"].as_array().unwrap();
    assert_eq!(entries.len(), 60);
    for entry in entries {
        let id = entry["id"].as_str().unwrap();
        let mut data = super::super::exercise_schema::initial_value(&entry["schema"]);
        data["roguePrivateAnswer"] = json!("DO-NOT-EXPOSE");
        let projected = project_candidate(&ExerciseTemplateContent {
            exercise_type: id.into(),
            body: String::new(),
            data,
        })
        .unwrap();
        assert!(
            !serde_json::to_string(&projected)
                .unwrap()
                .contains("DO-NOT-EXPOSE"),
            "{id}"
        );
    }
}

#[test]
fn listening_dictation_and_email_answers_never_cross_the_candidate_boundary() {
    for (kind, data, secrets) in [
        (
            "listening",
            json!({"type":"listening","audio":{"src":"/audio.mp3"},"transcript":"TRANSCRIPT-SECRET","questions":[{"prompt":"When?","options":["A","B"],"correct":[0],"explanation":"EXPLANATION-SECRET"}]}),
            vec!["TRANSCRIPT-SECRET", "EXPLANATION-SECRET"],
        ),
        (
            "dictation",
            json!({"type":"dictation","segments":[{"audio":{"src":"/audio.mp3"},"answer":"DICTATION-SECRET","hint":"HINT-SECRET"}]}),
            vec!["DICTATION-SECRET", "HINT-SECRET"],
        ),
        (
            "answer-an-email",
            json!({"type":"answer-an-email","email":{"from":"Teacher","subject":"Course","body":"What time?"},"sampleAnswer":"EMAIL-SECRET","rubric":[{"criterion":"RUBRIC-SECRET","points":2}]}),
            vec!["EMAIL-SECRET", "RUBRIC-SECRET"],
        ),
    ] {
        let projected = project_candidate(&ExerciseTemplateContent {
            exercise_type: kind.into(),
            body: String::new(),
            data,
        })
        .unwrap();
        let json = serde_json::to_string(&projected).unwrap();
        for secret in secrets {
            assert!(!json.contains(secret), "{kind}: {secret}");
        }
        if kind == "listening" {
            assert_eq!(projected.data["questions"][0]["responseMode"], "multiple");
        }
    }
}

#[test]
fn structural_answers_are_replaced_by_independent_public_material() {
    let pairs = project_candidate(&ExerciseTemplateContent { exercise_type: "match-columns".into(), body: String::new(),
        data: json!({"pairs":[{"left":"a","right":"z"},{"left":"b","right":"x"}],"distractors":["y"]}) }).unwrap();
    assert!(pairs.data.get("pairs").is_none());
    assert_eq!(pairs.data["rightItems"], json!(["x", "y", "z"]));
    let order = project_candidate(&ExerciseTemplateContent {
        exercise_type: "ordering".into(),
        body: String::new(),
        data: json!({"items":["z","a"]}),
    })
    .unwrap();
    assert_eq!(order.data["items"], json!(["a", "z"]));
    let letters = project_candidate(&ExerciseTemplateContent {
        exercise_type: "missing-letters".into(),
        body: String::new(),
        data: json!({"text":"A {secret|0} value"}),
    })
    .unwrap();
    assert_eq!(letters.data["text"], "A ______ value");
}

#[test]
fn explicit_rules_create_generic_drafts_without_changing_legacy_bindings_or_pins() {
    let (registry, package) = reading_package();
    assert_eq!(
        registry.capabilities.len(),
        snapshot().capabilities.len() + 1
    );
    assert!(package.content.context_id.is_empty());
    assert_eq!(package.content.primary_domain, "Public");
    assert_eq!(package.item_format_id, "EXERCISE:multiple-choice");
    assert!(validate_rules(&registry).is_empty());
    let result = validate_registry(&registry);
    assert!(result.valid, "{:?}", result.issues);
    assert!(package_issues(&package, &registry).is_empty());
    let schema = registry.exercise_template_schemas["multiple-choice"].clone();
    let mut next = registry.clone();
    next.exercise_template_rules[0].enabled = false;
    prepare_draft(&mut next);
    assert_eq!(next.capabilities.len(), snapshot().capabilities.len());
    assert_eq!(next.exercise_template_schemas["multiple-choice"], schema);
    assert!(package_issues(&package, &registry).is_empty());
    let validation = validate_task_package(&package);
    assert!(validation.valid, "{:?}", validation.issues);
    assert!(
        !validation
            .issues
            .iter()
            .any(|issue| issue.code == "registry.capability" || issue.code == "authoring.context")
    );
}

#[test]
fn tampered_candidate_or_score_is_rejected_and_blind_input_never_sees_answers() {
    let (registry, package) = reading_package();
    let blind = blind_review::candidate_input(&package).unwrap();
    let text = serde_json::to_string(&blind).unwrap();
    assert!(!text.contains("The message says nine"));
    assert!(!text.contains("correct"));
    let mut tampered = package.clone();
    if let CandidatePayload::ExerciseTemplate(payload) = &mut tampered.candidate_payload {
        payload.data["injected"] = json!("private answer");
    }
    assert!(!validate_candidate_privacy(&tampered).is_empty());
    assert!(blind_review::candidate_input(&tampered).is_err());
    let mut tampered = package.clone();
    tampered.scoring_package.max_raw_score = 500;
    assert!(
        package_issues(&tampered, &registry)
            .iter()
            .any(|issue| issue.path == "scoringPackage")
    );
}

#[test]
fn missing_context_never_widens_language_content_scopes() {
    let mut content = snapshot().content_id_options[0].clone();
    content.context_ids.clear();
    content
        .metadata
        .insert("contextScopeMode".into(), json!("all"));
    content
        .metadata
        .insert("excludedContextIds".into(), json!([]));
    assert!(content_context_matches(&content, ""));
    content
        .metadata
        .insert("excludedContextIds".into(), json!(["D09"]));
    assert!(!content_context_matches(&content, ""));
    content
        .metadata
        .insert("contextScopeMode".into(), json!("selected"));
    content
        .metadata
        .insert("excludedContextIds".into(), json!([]));
    assert!(!content_context_matches(&content, ""));
}

#[test]
fn schema_and_projection_definitions_stay_pinned_across_later_drafts() {
    let (registry, package) = reading_package();
    let mut future = registry.clone();
    future
        .exercise_template_schemas
        .get_mut("multiple-choice")
        .unwrap()["x-exercise-template"]["projection"]["privatePaths"] = json!(["questions"]);
    assert!(
        project_candidate_for_registry(
            package
                .authoring_package
                .exercise_template
                .as_ref()
                .unwrap(),
            &future
        )
        .unwrap()
        .data
        .get("questions")
        .is_none()
    );
    assert!(
        project_candidate_for_registry(
            package
                .authoring_package
                .exercise_template
                .as_ref()
                .unwrap(),
            &registry
        )
        .unwrap()
        .data
        .get("questions")
        .is_some()
    );
    crate::language_items::registry::prepare_registry_draft(&mut future);
    assert_eq!(
        future
            .capabilities
            .iter()
            .find(|row| row.item_rule_id == "read-time")
            .unwrap()
            .allowed_domains,
        vec!["Public"]
    );
    assert_eq!(
        future.exercise_template_schemas["multiple-choice"]["x-exercise-template"]["projection"]["privatePaths"],
        json!(["questions"])
    );
    let (task, candidate) = review_schemas(&registry, "multiple-choice").unwrap();
    assert_eq!(
        candidate["properties"]["exerciseType"]["const"],
        "multiple-choice"
    );
    assert!(task["properties"]["authoringPackage"]["properties"]["exerciseTemplate"]["properties"]["data"].is_object());
}

#[test]
fn deleting_a_referenced_cando_or_duplicating_a_pair_blocks_publication() {
    let (mut registry, _) = reading_package();
    registry.can_do_options.retain(|entry| entry.id != "A1-R2");
    assert!(
        validate_rules(&registry)
            .iter()
            .any(|issue| issue.path.ends_with("primaryCanDoId"))
    );
    let duplicate = registry.exercise_template_rules[0].clone();
    registry.exercise_template_rules.push(duplicate);
    assert!(
        validate_rules(&registry)
            .iter()
            .any(|issue| issue.message.contains("already have"))
    );
}

#[test]
fn source_answers_must_reference_existing_distinct_options() {
    let (registry, mut package) = reading_package();
    package
        .authoring_package
        .exercise_template
        .as_mut()
        .unwrap()
        .data["questions"][0]["correct"] = json!(2);
    refresh_package(&mut package, &registry).unwrap();
    assert!(
        package_issues(&package, &registry)
            .iter()
            .any(|issue| issue.message.contains("distinct existing option"))
    );
    let mut problems = vec![];
    validate_answer_references(
        &json!({"options":["A","B"],"correct":[0,0]}),
        "question",
        &mut problems,
    );
    assert_eq!(problems.len(), 1);
}

#[test]
fn optional_named_contexts_keep_their_cando_and_domain_restrictions() {
    let (mut registry, _) = reading_package();
    registry.bundle_version = "test-exercise-template-context-v1".into();
    registry.exercise_template_rules[0].allowed_domains = registry.allowed_domains.clone();
    prepare_draft(&mut registry);
    let capability = registry
        .capabilities
        .iter()
        .find(|row| row.item_rule_id == "read-time")
        .unwrap();
    let context = registry
        .context_options
        .iter()
        .find(|context| {
            crate::language_items::registry::context_supports_capability(context, capability)
        })
        .unwrap();
    let domain = &context.primary_domains[0];
    let package = crate::routes::language_items::draft_for_capability(
        "named-context".into(),
        capability,
        &registry,
        Some(domain),
        Some(&context.id),
        Some("TypicalA1"),
    )
    .unwrap();
    install_published_snapshot(registry.clone(), false);
    assert!(!validate_task_package(&package).issues.iter().any(|issue| {
        [
            "registry.context",
            "authoring.context",
            "authoring.domainContext",
        ]
        .contains(&issue.code.as_str())
    }));
    let wrong_domain = registry
        .allowed_domains
        .iter()
        .find(|value| *value != domain)
        .unwrap();
    assert!(
        crate::routes::language_items::draft_for_capability(
            "wrong-context-domain".into(),
            capability,
            &registry,
            Some(wrong_domain),
            Some(&context.id),
            Some("TypicalA1")
        )
        .is_err()
    );
    assert!(
        crate::routes::language_items::draft_for_capability(
            "no-context-any-domain".into(),
            capability,
            &registry,
            Some(wrong_domain),
            None,
            Some("TypicalA1")
        )
        .is_ok()
    );
}

#[test]
fn per_response_scoring_counts_authored_responses_instead_of_stimulus_arrays() {
    let (mut registry, _) = reading_package();
    for (kind, data, expected) in [
        ("ordering", json!({"items":["first","second","third"]}), 1),
        (
            "build-a-sentence",
            json!({"words":["one","two","three"]}),
            1,
        ),
        (
            "fill-in-blanks",
            json!({"items":[{"answers":["one","two"]},{"answers":["three"]}]}),
            3,
        ),
        (
            "image-label",
            json!({"items":[{"answers":["accepted","alternative"]},{"answers":["second"]}]}),
            2,
        ),
    ] {
        let configured = rule(&registry, kind, kind, "A1-R2");
        registry.exercise_template_rules = vec![configured.clone()];
        prepare_draft(&mut registry);
        let source = ExerciseTemplateContent {
            exercise_type: kind.into(),
            body: String::new(),
            data,
        };
        assert_eq!(
            scoring_units(&registry, &configured, &source).len(),
            expected,
            "{kind}"
        );
    }
}

#[test]
fn no_context_language_rules_are_exact_and_never_widen_entry_scope() {
    use crate::language_items::content_assessment::{
        content_is_excluded, validate_assessment_rules,
    };
    let (registry, _) = reading_package();
    let capability = registry
        .capabilities
        .iter()
        .find(|row| row.item_rule_id == "read-time")
        .unwrap();
    let mut content = registry
        .content_id_options
        .iter()
        .find(|entry| entry.kind != "supported")
        .unwrap()
        .clone();
    content.assessment_rules =
        vec![serde_json::from_value(json!({
        "itemRuleId":capability.item_rule_id,"itemFormatId":capability.item_format_id,
        "primaryCanDoId":capability.primary_can_do_id,"contextId":"","applicability":"excluded"
    })).unwrap()];
    let mut issues = vec![];
    validate_assessment_rules(&registry, &content, 0, true, &mut issues);
    assert!(issues.is_empty(), "{issues:?}");
    assert!(content_is_excluded(&content, capability, ""));
    assert!(!content_is_excluded(&content, capability, "D09"));
    content
        .metadata
        .insert("contextScopeMode".into(), json!("selected"));
    content.context_ids = vec!["D09".into()];
    content.assessment_rules[0].applicability =
        crate::language_items::content_assessment::AssessmentApplicability::Allowed;
    assert!(!content_context_matches(&content, ""));
}
