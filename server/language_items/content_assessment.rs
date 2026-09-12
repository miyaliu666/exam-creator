use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use super::{
    registry::{
        ContentIdOption, RegistrySnapshot, WorkbenchCapability, capability_for,
        context_supports_capability,
    },
    registry_store::RegistryValidationIssue,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssessmentApplicability {
    Allowed,
    Excluded,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AssessmentMode {
    Understanding,
    ControlledProduction,
    FreeProduction,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentAssessmentRule {
    pub blueprint_slot_id: String,
    pub item_format_id: String,
    pub primary_can_do_id: String,
    pub context_id: String,
    pub applicability: AssessmentApplicability,
    #[serde(default)]
    pub assessment_mode: Option<AssessmentMode>,
    #[serde(default)]
    pub communicative_purpose: String,
    #[serde(default)]
    pub required_evidence: Vec<String>,
    #[serde(default)]
    pub acceptable_responses: Vec<String>,
    #[serde(default)]
    pub failure_patterns: Vec<String>,
    #[serde(default)]
    pub prerequisites: Vec<String>,
    #[serde(default)]
    pub valid_examples: Vec<String>,
    #[serde(default)]
    pub invalid_examples: Vec<String>,
    #[serde(flatten)]
    pub metadata: Map<String, Value>,
}

impl ContentAssessmentRule {
    pub fn matches(
        &self,
        blueprint_slot_id: &str,
        item_format_id: &str,
        primary_can_do_id: &str,
        context_id: &str,
    ) -> bool {
        self.blueprint_slot_id == blueprint_slot_id
            && self.item_format_id == item_format_id
            && self.primary_can_do_id == primary_can_do_id
            && self.context_id == context_id
    }
}

pub fn content_is_excluded(
    content: &ContentIdOption,
    capability: &WorkbenchCapability,
    context_id: &str,
) -> bool {
    if content.kind == "supported" {
        return false;
    }
    content.assessment_rules.iter().any(|rule| {
        rule.applicability == AssessmentApplicability::Excluded
            && rule.matches(
                &capability.blueprint_slot_id,
                &capability.item_format_id,
                &capability.primary_can_do_id,
                context_id,
            )
    })
}

pub fn content_for_assessment(
    content: &ContentIdOption,
    blueprint_slot_id: &str,
    item_format_id: &str,
    primary_can_do_id: &str,
    context_id: &str,
) -> ContentIdOption {
    let mut selected = content.clone();
    // Rules for another combination must not become instructions for this item.
    selected.assessment_rules.retain(|rule| {
        rule.matches(
            blueprint_slot_id,
            item_format_id,
            primary_can_do_id,
            context_id,
        )
    });
    selected
}

pub fn validate_assessment_rules(
    snapshot: &RegistrySnapshot,
    content: &ContentIdOption,
    content_index: usize,
    require_complete: bool,
    issues: &mut Vec<RegistryValidationIssue>,
) {
    if content.kind == "supported" {
        if require_complete && !content.assessment_rules.is_empty() {
            issues.push(RegistryValidationIssue {
                severity: "error".to_string(),
                code: "registry.supportingContentAssessmentRules".to_string(),
                path: format!("contentIdOptions.{content_index}.assessmentRules"),
                message: "Assessment rules apply only to core language targets. Remove these rules from supporting content before publishing".to_string(),
            });
        }
        return;
    }
    let mut seen = HashSet::new();
    for (index, rule) in content.assessment_rules.iter().enumerate() {
        let path = format!("contentIdOptions.{content_index}.assessmentRules.{index}");
        let mut issue = |code: &str, field: &str, message: &str| {
            issues.push(RegistryValidationIssue {
                severity: "error".to_string(),
                code: code.to_string(),
                path: if field.is_empty() {
                    path.clone()
                } else {
                    format!("{path}.{field}")
                },
                message: message.to_string(),
            });
        };
        if !seen.insert((
            &rule.blueprint_slot_id,
            &rule.item_format_id,
            &rule.primary_can_do_id,
            &rule.context_id,
        )) {
            issue(
                "registry.duplicateContentAssessmentRule",
                "",
                "A language target can have only one assessment rule for each Item rules and Context combination",
            );
        }
        let capability = capability_for(
            snapshot,
            &rule.blueprint_slot_id,
            &rule.item_format_id,
            Some(&rule.primary_can_do_id),
        );
        match capability {
            None => issue(
                "registry.contentAssessmentItemRules",
                "primaryCanDoId",
                "The assessment rule references unavailable Item rules",
            ),
            Some(capability) => {
                let context = snapshot
                    .context_options
                    .iter()
                    .find(|context| context.id == rule.context_id);
                if context.is_none_or(|context| {
                    !context_supports_capability(context, capability)
                        || !capability.allowed_context_ids.contains(&context.id)
                        || context.primary_domains.len() != 1
                        || !capability
                            .allowed_domains
                            .contains(&context.primary_domains[0])
                        || !snapshot
                            .allowed_domains
                            .contains(&context.primary_domains[0])
                        || context.label.trim().is_empty()
                        || context.scope.trim().is_empty()
                }) {
                    issue(
                        "registry.contentAssessmentContext",
                        "contextId",
                        "The assessment rule requires an active Context allowed by these Item rules",
                    );
                }
            }
        }
        if require_complete && rule.applicability == AssessmentApplicability::Allowed {
            match rule.assessment_mode {
                None => issue(
                    "registry.contentAssessmentModeRequired",
                    "assessmentMode",
                    "Choose an assessment mode for the allowed combination before publishing",
                ),
                Some(mode)
                    if capability.is_some_and(|capability| {
                        !matches!(
                            (capability.primary_reported_skill.as_str(), mode),
                            ("Reading" | "Listening", AssessmentMode::Understanding)
                                | (
                                    "Writing" | "Speaking",
                                    AssessmentMode::ControlledProduction
                                        | AssessmentMode::FreeProduction
                                )
                        )
                    }) =>
                {
                    issue(
                        "registry.contentAssessmentModeSkill",
                        "assessmentMode",
                        "Assessment mode must match the Item rules skill: Understanding for Reading or Listening, and Controlled production or Free production for Writing or Speaking",
                    );
                }
                Some(_) => {}
            }
            if rule.communicative_purpose.trim().is_empty() {
                issue(
                    "registry.contentAssessmentPurposeRequired",
                    "communicativePurpose",
                    "Describe the communicative purpose for the allowed combination before publishing",
                );
            }
            if rule.required_evidence.is_empty()
                || rule
                    .required_evidence
                    .iter()
                    .any(|entry| entry.trim().is_empty())
            {
                issue(
                    "registry.contentAssessmentEvidenceRequired",
                    "requiredEvidence",
                    "Describe the required evidence for the allowed combination before publishing",
                );
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::language_items::{
        ai::{generate_mock_candidates, generation_prompt_preview},
        batch::{BatchGroup, CreateBatchBody, prepare_job},
        domain::{InformationPoint, TaskPackage},
        registry::{hydrate_published_registry_snapshot, install_published_snapshot, snapshot},
        registry_content::validate_language_content,
        registry_store::validate_registry,
        validation::{validate_generation_setup, validate_task_package},
    };

    fn fixture() -> (RegistrySnapshot, TaskPackage, ContentAssessmentRule) {
        let mut registry = snapshot().clone();
        registry.bundle_version = format!("assessment-rules-test-{}", uuid::Uuid::new_v4());
        let mut package = TaskPackage::new("LI-ASSESSMENT-TEST".into());
        package.spec_versions.registry_bundle_version = registry.bundle_version.clone();
        package.content.target_content_ids = vec!["LEX-A1-0208".into()];
        package.content.required_information_points = vec![InformationPoint::new(0, "营业日期")];
        let payload = package.candidate_payload.as_single_select_mut().unwrap();
        payload.stimulus.text = Some("星期一不开门".into());
        payload.prompt = "哪一天不能来？".into();
        payload.options[0].text = Some("星期一".into());
        payload.options[1].text = Some("星期二".into());
        let rule = ContentAssessmentRule {
            blueprint_slot_id: package.blueprint_slot_id.clone(),
            item_format_id: package.item_format_id.clone(),
            primary_can_do_id: package.content.primary_can_do_id.clone(),
            context_id: package.content.context_id.clone(),
            applicability: AssessmentApplicability::Allowed,
            assessment_mode: Some(AssessmentMode::Understanding),
            communicative_purpose: "了解开放时间".into(),
            required_evidence: vec!["答案依赖营业日期".into()],
            acceptable_responses: vec!["星期一".into()],
            failure_patterns: vec!["仅凭选项长度猜测".into()],
            prerequisites: vec![],
            valid_examples: vec!["星期一不开门。哪一天不能来？".into()],
            invalid_examples: vec![],
            metadata: Map::new(),
        };
        (registry, package, rule)
    }

    fn target_mut<'a>(
        registry: &'a mut RegistrySnapshot,
        package: &TaskPackage,
    ) -> &'a mut ContentIdOption {
        registry
            .content_id_options
            .iter_mut()
            .find(|entry| entry.id == package.content.target_content_ids[0])
            .unwrap()
    }

    fn batch_for(package: &TaskPackage) -> CreateBatchBody {
        CreateBatchBody {
            title: "Assessment rule test".into(),
            idempotency_key: uuid::Uuid::new_v4().to_string(),
            registry_version: Some(package.spec_versions.registry_bundle_version.clone()),
            candidates_per_item: 1,
            groups: vec![BatchGroup {
                blueprint_slot_id: package.blueprint_slot_id.clone(),
                item_format_id: package.item_format_id.clone(),
                primary_can_do_id: package.content.primary_can_do_id.clone(),
                primary_domain: package.content.primary_domain.clone(),
                context_id: package.content.context_id.clone(),
                difficulty_band: package.content.difficulty_band.clone(),
                item_count: 2,
                required_target_content_ids: package.content.target_content_ids.clone(),
                rotating_target_content_ids: vec![],
            }],
        }
    }

    #[test]
    fn legacy_rules_remain_absent_and_not_restricted_behavior_is_unchanged() {
        let (mut registry, package, _) = fixture();
        let target = target_mut(&mut registry, &package);
        target.can_do_ids.clear();
        target.context_ids.clear();
        target.mastery_scope = None;
        let original = serde_json::to_value(&registry).unwrap();
        assert!(
            original["contentIdOptions"]
                .as_array()
                .unwrap()
                .iter()
                .all(|entry| entry.get("assessmentRules").is_none())
        );
        hydrate_published_registry_snapshot(&mut registry);
        assert_eq!(original, serde_json::to_value(&registry).unwrap());
        install_published_snapshot(registry.clone(), false);
        assert!(validate_generation_setup(&package).valid);
        assert!(validate_task_package(&package).valid);
        assert!(prepare_job(batch_for(&package), "test@example.test", &registry).is_ok());
    }

    #[test]
    fn supporting_content_keeps_legacy_compatibility_without_applying_assessment_exclusions() {
        let (mut registry, mut package, mut rule) = fixture();
        let supporting_index = registry
            .content_id_options
            .iter()
            .position(|entry| entry.kind == "supported")
            .unwrap();
        let supporting = &mut registry.content_id_options[supporting_index];
        supporting.can_do_ids.clear();
        supporting.context_ids.clear();
        supporting.mastery_scope = None;
        package.content.supporting_content_refs = vec![supporting.id.clone()];
        assert!(supporting.assessment_rules.is_empty());
        install_published_snapshot(registry.clone(), false);
        for result in [
            validate_generation_setup(&package),
            validate_task_package(&package),
        ] {
            assert!(result.valid, "{:?}", result.issues);
        }

        rule.applicability = AssessmentApplicability::Excluded;
        registry.content_id_options[supporting_index].assessment_rules = vec![rule];
        let capability = capability_for(
            &registry,
            &package.blueprint_slot_id,
            &package.item_format_id,
            Some(&package.content.primary_can_do_id),
        )
        .unwrap();
        assert!(!content_is_excluded(
            &registry.content_id_options[supporting_index],
            capability,
            &package.content.context_id
        ));
        install_published_snapshot(registry.clone(), false);
        for result in [
            validate_generation_setup(&package),
            validate_task_package(&package),
        ] {
            assert!(result.valid, "{:?}", result.issues);
        }

        registry.content_id_options[supporting_index].context_ids = vec!["not-this-context".into()];
        install_published_snapshot(registry, false);
        for result in [
            validate_generation_setup(&package),
            validate_task_package(&package),
        ] {
            assert!(result.issues.iter().any(|issue| {
                issue.code == "authoring.contentCompatibility"
                    && issue.path == "content.supportingContentRefs.0"
            }));
            assert!(
                result
                    .issues
                    .iter()
                    .all(|issue| issue.code != "authoring.contentAssessmentExcluded")
            );
        }
    }

    #[test]
    fn supporting_assessment_rules_can_be_saved_but_must_be_removed_before_publication() {
        let (mut registry, _, mut rule) = fixture();
        let before = registry.clone();
        let supporting_index = registry
            .content_id_options
            .iter()
            .position(|entry| entry.kind == "supported")
            .unwrap();
        rule.context_id = "old-context".into();
        rule.assessment_mode = None;
        registry.content_id_options[supporting_index].assessment_rules = vec![rule];

        assert!(validate_language_content(&registry, Some(&before)).valid);
        let saved: RegistrySnapshot =
            serde_json::from_value(serde_json::to_value(&registry).unwrap()).unwrap();
        assert_eq!(
            serde_json::to_value(&saved.content_id_options[supporting_index]).unwrap(),
            serde_json::to_value(&registry.content_id_options[supporting_index]).unwrap()
        );
        let result = validate_registry(&saved);
        assert!(result.issues.iter().any(|issue| {
            issue.code == "registry.supportingContentAssessmentRules"
                && issue.path == format!("contentIdOptions.{supporting_index}.assessmentRules")
                && issue.message.contains("Remove these rules")
        }));
        registry.content_id_options[supporting_index]
            .assessment_rules
            .clear();
        assert!(validate_language_content(&registry, None).valid);
    }

    #[test]
    fn misplaced_core_target_reports_partition_without_assessing_supporting_references() {
        let (mut registry, mut package, mut rule) = fixture();
        rule.applicability = AssessmentApplicability::Excluded;
        target_mut(&mut registry, &package).assessment_rules = vec![rule];
        package.content.supporting_content_refs = package.content.target_content_ids.clone();
        package.content.target_content_ids.clear();
        install_published_snapshot(registry, false);
        let result = validate_generation_setup(&package);
        assert!(result.issues.iter().any(|issue| {
            issue.code == "authoring.contentPartition"
                && issue.path == "content.supportingContentRefs.0"
        }));
        assert!(
            result
                .issues
                .iter()
                .all(|issue| issue.code != "authoring.contentAssessmentExcluded")
        );
    }

    #[test]
    fn exact_exclusion_blocks_single_batch_and_generated_candidate_validation() {
        let (mut registry, package, mut rule) = fixture();
        rule.applicability = AssessmentApplicability::Excluded;
        target_mut(&mut registry, &package).assessment_rules = vec![rule.clone()];
        install_published_snapshot(registry.clone(), false);
        for result in [
            validate_generation_setup(&package),
            validate_task_package(&package),
            generate_mock_candidates(&package, 1).remove(0).validation,
        ] {
            assert!(!result.valid);
            assert!(
                result
                    .issues
                    .iter()
                    .any(|issue| issue.code == "authoring.contentAssessmentExcluded")
            );
        }
        assert!(prepare_job(batch_for(&package), "test@example.test", &registry).is_err());
        let capability = capability_for(
            &registry,
            &package.blueprint_slot_id,
            &package.item_format_id,
            Some(&package.content.primary_can_do_id),
        )
        .unwrap()
        .clone();
        for field in [
            "blueprintSlotId",
            "itemFormatId",
            "primaryCanDoId",
            "contextId",
        ] {
            let mut different = serde_json::to_value(&rule).unwrap();
            different[field] = json!("another-combination");
            let target = target_mut(&mut registry, &package);
            target.assessment_rules = vec![serde_json::from_value(different).unwrap()];
            assert!(
                !content_is_excluded(target, &capability, &package.content.context_id),
                "mismatched {field} must not exclude"
            );
        }
    }

    #[test]
    fn allowed_rule_cannot_relax_existing_can_do_context_or_mastery_scopes() {
        for field in ["canDo", "context", "mastery"] {
            let (mut registry, package, rule) = fixture();
            let target = target_mut(&mut registry, &package);
            target.assessment_rules = vec![rule];
            match field {
                "canDo" => target.can_do_ids = vec!["not-this-can-do".into()],
                "context" => target.context_ids = vec!["not-this-context".into()],
                _ => target.mastery_scope = Some("productive".into()),
            }
            install_published_snapshot(registry.clone(), false);
            for result in [
                validate_generation_setup(&package),
                validate_task_package(&package),
            ] {
                assert!(!result.valid);
                assert!(
                    result
                        .issues
                        .iter()
                        .any(|issue| issue.code == "authoring.contentCompatibility")
                );
            }
            assert!(prepare_job(batch_for(&package), "test@example.test", &registry).is_err());
        }
    }

    #[test]
    fn incomplete_allowed_rule_saves_but_publish_requires_its_assessment_brief() {
        let (mut registry, package, mut rule) = fixture();
        let before = registry.clone();
        rule.assessment_mode = None;
        rule.communicative_purpose.clear();
        rule.required_evidence.clear();
        target_mut(&mut registry, &package).assessment_rules = vec![rule];
        assert!(validate_language_content(&registry, Some(&before)).valid);
        let result = validate_registry(&registry);
        for code in [
            "registry.contentAssessmentModeRequired",
            "registry.contentAssessmentPurposeRequired",
            "registry.contentAssessmentEvidenceRequired",
        ] {
            assert!(
                result.issues.iter().any(|issue| issue.code == code),
                "missing {code}"
            );
        }
        target_mut(&mut registry, &package).assessment_rules[0].applicability =
            AssessmentApplicability::Excluded;
        assert!(validate_language_content(&registry, None).valid);
    }

    #[test]
    fn publication_matches_assessment_mode_to_all_four_skills_without_rewriting_drafts() {
        for skill in ["Reading", "Listening", "Writing", "Speaking"] {
            for mode in [
                AssessmentMode::Understanding,
                AssessmentMode::ControlledProduction,
                AssessmentMode::FreeProduction,
            ] {
                let (mut registry, package, mut rule) = fixture();
                crate::language_items::registry::prepare_registry_draft(&mut registry);
                let before = registry.clone();
                let capability = registry
                    .capabilities
                    .iter()
                    .find(|capability| capability.primary_reported_skill == skill)
                    .unwrap();
                rule.blueprint_slot_id = capability.blueprint_slot_id.clone();
                rule.item_format_id = capability.item_format_id.clone();
                rule.primary_can_do_id = capability.primary_can_do_id.clone();
                rule.context_id = capability.allowed_context_ids[0].clone();
                rule.assessment_mode = Some(mode);
                target_mut(&mut registry, &package).assessment_rules = vec![rule];

                let authored = serde_json::to_value(&registry).unwrap();
                let draft = validate_language_content(&registry, Some(&before));
                assert!(draft.valid, "{skill} / {mode:?}: {:?}", draft.issues);
                assert_eq!(serde_json::to_value(&registry).unwrap(), authored);

                let should_match = match skill {
                    "Reading" | "Listening" => mode == AssessmentMode::Understanding,
                    _ => mode != AssessmentMode::Understanding,
                };
                let published = validate_registry(&registry);
                assert_eq!(
                    published.issues.iter().any(|issue| {
                        issue.code == "registry.contentAssessmentModeSkill"
                            && issue.path.ends_with(".assessmentRules.0.assessmentMode")
                    }),
                    !should_match,
                    "{skill} / {mode:?}: {:?}",
                    published.issues
                );
                assert_eq!(
                    validate_language_content(&registry, None).valid,
                    should_match
                );

                target_mut(&mut registry, &package).assessment_rules[0].applicability =
                    AssessmentApplicability::Excluded;
                assert!(validate_language_content(&registry, None).valid);
            }
        }
    }

    #[test]
    fn duplicate_and_unavailable_combinations_block_registry_publication() {
        let (mut registry, package, rule) = fixture();
        target_mut(&mut registry, &package).assessment_rules = vec![rule.clone(), rule.clone()];
        assert!(
            validate_registry(&registry)
                .issues
                .iter()
                .any(|issue| issue.code == "registry.duplicateContentAssessmentRule")
        );
        target_mut(&mut registry, &package).assessment_rules[1].primary_can_do_id =
            "missing".into();
        assert!(
            validate_registry(&registry)
                .issues
                .iter()
                .any(|issue| issue.code == "registry.contentAssessmentItemRules")
        );
        target_mut(&mut registry, &package).assessment_rules = vec![rule];
        registry
            .context_options
            .iter_mut()
            .find(|context| context.id == package.content.context_id)
            .unwrap()
            .retired = true;
        assert!(
            validate_registry(&registry)
                .issues
                .iter()
                .any(|issue| issue.code == "registry.contentAssessmentContext")
        );
        target_mut(&mut registry, &package).assessment_rules[0].context_id =
            "missing-context".into();
        assert!(
            validate_registry(&registry)
                .issues
                .iter()
                .any(|issue| issue.code == "registry.contentAssessmentContext")
        );
    }

    #[test]
    fn rules_retain_extra_metadata_and_reject_unknown_enum_values() {
        let (_, _, rule) = fixture();
        let mut value = serde_json::to_value(&rule).unwrap();
        value["futureDetail"] = json!({ "source": "retained" });
        let restored: ContentAssessmentRule = serde_json::from_value(value.clone()).unwrap();
        assert_eq!(serde_json::to_value(restored).unwrap(), value);
        for field in ["assessmentMode", "applicability"] {
            let mut invalid = value.clone();
            invalid[field] = json!("unrecognized");
            assert!(serde_json::from_value::<ContentAssessmentRule>(invalid).is_err());
        }
    }

    #[tokio::test]
    async fn independent_review_receives_current_assessment_rules_and_can_cite_them() {
        let (mut registry, package, rule) = fixture();
        let mut other = rule.clone();
        other.context_id = "another-context".into();
        target_mut(&mut registry, &package).assessment_rules = vec![other, rule];
        install_published_snapshot(registry, false);
        let rule_ref = format!(
            "content.{}.assessmentRules",
            package.content.target_content_ids[0]
        );
        let finding = json!({
            "category": "content", "severity": "warning", "code": "evidence.needsReview",
            "fieldPath": "candidatePayload.prompt", "ruleRef": rule_ref,
            "message": "请确认答案依赖所选语言目标。",
        });
        let (sent, mut received) = tokio::sync::mpsc::unbounded_channel();
        let app = axum::Router::new().route("/responses", axum::routing::post(move |axum::Json(body): axum::Json<Value>| {
            let sent = sent.clone();
            let finding = finding.clone();
            async move {
                sent.send(body).unwrap();
                axum::Json(json!({ "output": [{ "type": "message", "content": [{ "type": "output_text", "text": json!({ "findings": [finding] }).to_string() }] }] }))
            }
        }));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base_url = format!("http://{}", listener.local_addr().unwrap());
        let server = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let config = crate::config::LanguageItemAiProviderConfig::OpenAi {
            api_key: "local-test-only".into(),
            base_url,
            model: "test".into(),
        };
        let result =
            crate::language_items::ai::review(&config, &reqwest::Client::new(), &package).await;
        server.abort();
        assert_eq!(result.unwrap()[0].rule_ref, rule_ref);
        let body = received.try_recv().unwrap();
        assert_eq!(
            body["instructions"],
            crate::language_items::ai::REVIEW_PROMPT
        );
        let input: Value = serde_json::from_str(body["input"].as_str().unwrap()).unwrap();
        let rules = input["registryRules"]["targetContent"][0]["assessmentRules"]
            .as_array()
            .unwrap();
        assert_eq!(rules.len(), 1);
        assert_eq!(rules[0]["contextId"], package.content.context_id);
        assert!(
            input["allowedRuleRefs"]
                .as_array()
                .unwrap()
                .contains(&json!(rule_ref))
        );
    }

    #[test]
    fn ai_input_uses_only_the_current_rule_and_preserves_rich_target_metadata() {
        let (mut registry, package, mut rule) = fixture();
        rule.metadata
            .insert("futureDetail".into(), json!({ "keep": true }));
        let mut other = rule.clone();
        other.context_id = "other-context".into();
        let target = target_mut(&mut registry, &package);
        target.assessment_rules = vec![other, rule.clone()];
        target.pattern = Some("不要改写结构".into());
        target
            .metadata
            .insert("extraSource".into(), json!({ "nested": [1, 2] }));
        let expected = content_for_assessment(
            target,
            &package.blueprint_slot_id,
            &package.item_format_id,
            &package.content.primary_can_do_id,
            &package.content.context_id,
        );
        install_published_snapshot(registry, false);
        let config = crate::config::LanguageItemAiProviderConfig::OpenAi {
            api_key: "not-sent".into(),
            base_url: "http://unused".into(),
            model: "test".into(),
        };
        let preview = generation_prompt_preview(&config, &package, 1).unwrap();
        assert_eq!(preview.prompt_version, "0.7");
        assert_eq!(
            preview.request_body["instructions"],
            crate::language_items::ai::GENERATION_PROMPT
        );
        let input: Value =
            serde_json::from_str(preview.request_body["input"].as_str().unwrap()).unwrap();
        assert_eq!(
            input["lockedConstraints"]["targetContent"][0],
            serde_json::to_value(&expected).unwrap()
        );
        assert_eq!(expected.assessment_rules.len(), 1);
        assert_eq!(
            expected.assessment_rules[0].context_id,
            package.content.context_id
        );
        assert_eq!(
            expected.metadata["extraSource"],
            json!({ "nested": [1, 2] })
        );
    }
}
