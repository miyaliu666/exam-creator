use std::collections::HashSet;

use super::{
    domain::{CandidatePayload, Stimulus, TaskPackage, ValidationIssue, ValidationResult},
    registry::{
        RegistrySnapshot, capability_for, context_supports_capability,
        difficulty_standards_for_capability, snapshot_for,
    },
};

#[cfg(test)]
use super::registry::snapshot;

fn missing_registry_result(package: &TaskPackage) -> ValidationResult {
    ValidationResult {
        valid: false,
        registry_bundle_version: package.spec_versions.registry_bundle_version.clone(),
        issues: vec![ValidationIssue {
            severity: "error".to_string(),
            code: "registry.versionUnavailable".to_string(),
            path: "specVersions.registryBundleVersion".to_string(),
            rule_ref: "registry.version".to_string(),
            message: format!(
                "Registry version {} is unavailable; the item cannot be reinterpreted against a different version",
                package.spec_versions.registry_bundle_version
            ),
        }],
    }
}

pub fn validate_task_package(package: &TaskPackage) -> ValidationResult {
    let mut issues = Vec::new();
    let Some(registry) = snapshot_for(&package.spec_versions.registry_bundle_version) else {
        return missing_registry_result(package);
    };
    let capability = capability_for(
        &registry,
        &package.blueprint_slot_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    );
    if let Some(capability) = capability {
        for (code, path, actual, expected) in [
            (
                "registry.family",
                "taskFamilyId",
                &package.task_family_id,
                &capability.task_family_id,
            ),
            (
                "registry.renderer",
                "renderer.rendererId",
                &package.renderer.renderer_id,
                &capability.renderer_id,
            ),
            (
                "registry.scoring",
                "scoringPackage.scoringContractTemplateId",
                &package.scoring_package.scoring_contract_template_id,
                &capability.scoring_contract_template_id,
            ),
            (
                "registry.canDo",
                "content.primaryCanDoId",
                &package.content.primary_can_do_id,
                &capability.primary_can_do_id,
            ),
            (
                "registry.skill",
                "content.primaryReportedSkill",
                &package.content.primary_reported_skill,
                &capability.primary_reported_skill,
            ),
            (
                "registry.activity",
                "content.communicativeActivity",
                &package.content.communicative_activity,
                &capability.communicative_activity,
            ),
        ] {
            check_equal(&mut issues, code, path, actual, expected);
        }
        for (path, actual, expected) in [
            (
                "deliveryPolicyRefs.navigationPolicyId",
                &package.delivery_policy_refs.navigation_policy_id,
                &capability.delivery_policy_refs.navigation_policy_id,
            ),
            (
                "deliveryPolicyRefs.inputPolicyId",
                &package.delivery_policy_refs.input_policy_id,
                &capability.delivery_policy_refs.input_policy_id,
            ),
            (
                "deliveryPolicyRefs.playbackPolicyId",
                &package.delivery_policy_refs.playback_policy_id,
                &capability.delivery_policy_refs.playback_policy_id,
            ),
            (
                "deliveryPolicyRefs.recordingPolicyId",
                &package.delivery_policy_refs.recording_policy_id,
                &capability.delivery_policy_refs.recording_policy_id,
            ),
            (
                "deliveryPolicyRefs.speakingRateProfileId",
                &package.delivery_policy_refs.speaking_rate_profile_id,
                &capability.delivery_policy_refs.speaking_rate_profile_id,
            ),
            (
                "deliveryPolicyRefs.pauseProfileId",
                &package.delivery_policy_refs.pause_profile_id,
                &capability.delivery_policy_refs.pause_profile_id,
            ),
        ] {
            check_equal(
                &mut issues,
                "registry.deliveryPolicy",
                path,
                actual,
                expected,
            );
        }
        if !capability
            .allowed_domains
            .contains(&package.content.primary_domain)
        {
            issue(
                &mut issues,
                "registry.domain",
                "content.primaryDomain",
                "The selected domain is not available for this exam task",
            );
        }
        if !capability
            .allowed_context_ids
            .contains(&package.content.context_id)
        {
            issue(
                &mut issues,
                "registry.context",
                "content.contextId",
                "The selected context is not available for this exam task",
            );
        }
    } else {
        issue(
            &mut issues,
            "registry.capability",
            "itemFormatId",
            "This item format is not registered for the selected exam task",
        );
    }
    check_equal(
        &mut issues,
        "registry.version",
        "specVersions.registryBundleVersion",
        &package.spec_versions.registry_bundle_version,
        &registry.bundle_version,
    );
    check_equal(
        &mut issues,
        "contract.version",
        "specVersions.planningSpecVersion",
        &package.spec_versions.planning_spec_version,
        "0.2-provisional",
    );
    check_equal(
        &mut issues,
        "contract.version",
        "specVersions.taskPackageVersion",
        &package.spec_versions.task_package_version,
        "0.1",
    );
    validate_authoring_setup(package, &registry, &mut issues);
    if !registry
        .difficulty_bands
        .contains(&package.content.difficulty_band)
    {
        issue(
            &mut issues,
            "registry.difficulty",
            "content.difficultyBand",
            "Difficulty is not in the allowed range",
        );
    }
    validate_difficulty_profile(package, &registry, &mut issues);
    let registered_content_ids: HashSet<&str> = registry
        .content_id_options
        .iter()
        .map(|entry| entry.id.as_str())
        .collect();
    let mut seen_content_ids = HashSet::new();
    for (index, content_id) in package.content.target_content_ids.iter().enumerate() {
        if !seen_content_ids.insert(content_id.as_str()) {
            issue(
                &mut issues,
                "schema.uniqueItems",
                &format!("content.targetContentIds.{index}"),
                &format!("Content ID must be unique: {content_id}"),
            );
        }
        if !registered_content_ids.contains(content_id.as_str()) {
            issue(
                &mut issues,
                "registry.contentId",
                &format!("content.targetContentIds.{index}"),
                &format!("Content ID was not found in the current Registry: {content_id}"),
            );
        } else if let (Some(capability), Some(content_option)) = (
            capability,
            registry
                .content_id_options
                .iter()
                .find(|entry| entry.id == *content_id),
        ) {
            if content_option.kind == "supported" {
                issue(
                    &mut issues,
                    "registry.contentPartition",
                    &format!("content.targetContentIds.{index}"),
                    "Supporting content cannot be used as core target content",
                );
            }
            let relevant_can_do = content_option.can_do_ids.is_empty()
                || content_option.can_do_ids.iter().any(|can_do_id| {
                    can_do_id == &capability.primary_can_do_id
                        || capability.supporting_can_do_ids.contains(can_do_id)
                });
            let context_matches = content_option.context_ids.is_empty()
                || content_option
                    .context_ids
                    .contains(&package.content.context_id);
            let receptive_skill = matches!(
                capability.primary_reported_skill.as_str(),
                "Reading" | "Listening"
            );
            let mastery_matches = content_option.mastery_scope.as_deref().is_none_or(|scope| {
                scope == "receptiveProductive" || (receptive_skill && scope == "receptive")
            });
            if !relevant_can_do || !context_matches || !mastery_matches {
                issue(
                    &mut issues,
                    "registry.contentCompatibility",
                    &format!("content.targetContentIds.{index}"),
                    &format!(
                        "Content ID is incompatible with the current Can-do, mastery scope, or context: {content_id}"
                    ),
                );
            }
        }
    }
    let mut seen_supporting_content_ids = HashSet::new();
    for (index, content_id) in package.content.supporting_content_refs.iter().enumerate() {
        if !seen_supporting_content_ids.insert(content_id.as_str()) {
            issue(
                &mut issues,
                "schema.uniqueItems",
                &format!("content.supportingContentRefs.{index}"),
                &format!("Supporting content ID must be unique: {content_id}"),
            );
        }
        match registry
            .content_id_options
            .iter()
            .find(|entry| entry.id == *content_id)
        {
            Some(content) if content.kind == "supported" => {}
            Some(_) => issue(
                &mut issues,
                "registry.contentPartition",
                &format!("content.supportingContentRefs.{index}"),
                "Core language content cannot be placed in supporting content",
            ),
            None => issue(
                &mut issues,
                "registry.contentId",
                &format!("content.supportingContentRefs.{index}"),
                &format!(
                    "Supporting content ID was not found in the current Registry: {content_id}"
                ),
            ),
        }
    }
    let scoring_point_ids: HashSet<&str> = package
        .scoring_package
        .scoring_points
        .iter()
        .map(|point| point.scoring_point_id.as_str())
        .collect();
    let mut information_point_ids = HashSet::new();
    for (index, point) in package
        .content
        .required_information_points
        .iter()
        .enumerate()
    {
        if point.id.trim().is_empty() || !information_point_ids.insert(point.id.as_str()) {
            issue(
                &mut issues,
                "schema.uniqueId",
                &format!("content.requiredInformationPoints.{index}.id"),
                "Information point IDs must be present and unique",
            );
        }
        if point.label.trim().is_empty() {
            issue(
                &mut issues,
                "schema.minLength",
                &format!("content.requiredInformationPoints.{index}.label"),
                "Required information point cannot be empty",
            );
        }
        if ![
            "date", "time", "location", "price", "quantity", "name", "action", "purpose", "other",
        ]
        .contains(&point.point_type.as_str())
        {
            issue(
                &mut issues,
                "schema.enum",
                &format!("content.requiredInformationPoints.{index}.pointType"),
                "Information point type is invalid",
            );
        }
        if point
            .scoring_point_id
            .as_deref()
            .is_some_and(|id| !scoring_point_ids.contains(id))
        {
            issue(
                &mut issues,
                "scoring.informationPointRef",
                &format!("content.requiredInformationPoints.{index}.scoringPointId"),
                "Information point references a scoring point that does not exist",
            );
        }
    }
    check_equal(
        &mut issues,
        "contract.rendererVersion",
        "renderer.rendererVersion",
        &package.renderer.renderer_version,
        "0.1",
    );
    if package.task_id.trim().is_empty() {
        issue(
            &mut issues,
            "schema.required",
            "taskId",
            "taskId is required",
        );
    }
    if package.task_version.trim().is_empty() {
        issue(
            &mut issues,
            "schema.required",
            "taskVersion",
            "taskVersion is required",
        );
    }
    validate_candidate_payload(package, &mut issues);
    validate_item_scoring_spec(package, &mut issues);

    ValidationResult {
        valid: !issues.iter().any(|issue| issue.severity == "error"),
        registry_bundle_version: registry.bundle_version.clone(),
        issues,
    }
}

fn validate_item_scoring_spec(package: &TaskPackage, issues: &mut Vec<ValidationIssue>) {
    let scoring = &package.scoring_package;
    required(
        &scoring.item_scoring_version,
        "scoringPackage.itemScoringVersion",
        "Item scoring specification version is required",
        issues,
    );
    required(
        &scoring.scoring_contract_template_version,
        "scoringPackage.scoringContractTemplateVersion",
        "Scoring contract template version is required",
        issues,
    );
    if scoring.scoring_points.is_empty() {
        issue(
            issues,
            "scoring.points",
            "scoringPackage.scoringPoints",
            "At least one scoring point is required",
        );
    }
    let mut ids = HashSet::new();
    let mut total = 0_u16;
    for (index, point) in scoring.scoring_points.iter().enumerate() {
        if point.scoring_point_id.trim().is_empty() || !ids.insert(&point.scoring_point_id) {
            issue(
                issues,
                "scoring.pointId",
                &format!("scoringPackage.scoringPoints.{index}.scoringPointId"),
                "Scoring point IDs must be present and unique",
            );
        }
        if point.description.trim().is_empty() {
            issue(
                issues,
                "scoring.pointDescription",
                &format!("scoringPackage.scoringPoints.{index}.description"),
                "Scoring point description is required",
            );
        }
        if point.points == 0 {
            issue(
                issues,
                "scoring.pointValue",
                &format!("scoringPackage.scoringPoints.{index}.points"),
                "Scoring point value must be greater than 0",
            );
        }
        total = total.saturating_add(point.points);
    }
    if total != scoring.max_raw_score {
        issue(
            issues,
            "scoring.maxRawScore",
            "scoringPackage.maxRawScore",
            "Maximum raw score must equal the sum of all scoring point values",
        );
    }
    if scoring
        .answer_key_ref
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
    {
        issue(
            issues,
            "scoring.answerKeyRef",
            "scoringPackage.answerKeyRef",
            "An item-specific answer key reference is required",
        );
    }
    if scoring.rubric_id.is_some()
        && scoring
            .benchmark_set_version
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
    {
        issue(
            issues,
            "scoring.benchmark",
            "scoringPackage.benchmarkSetVersion",
            "Rubric-scored tasks must specify an applicable benchmark version",
        );
    }

    let expected_unit_ids: Vec<String> = match &package.candidate_payload {
        CandidatePayload::SingleSelect(_) => vec!["SP-ITEM".to_string()],
        CandidatePayload::Matching(payload) => payload
            .left_items
            .iter()
            .map(|item| format!("SP-{}", item.item_id))
            .collect(),
        CandidatePayload::RestrictedInput(payload) => payload
            .response_fields
            .iter()
            .map(|field| format!("SP-{}", field.response_id))
            .collect(),
        CandidatePayload::FormEntry(payload) => payload
            .fields
            .iter()
            .map(|field| format!("SP-{}", field.field_id))
            .collect(),
        CandidatePayload::TypedMessage(_)
        | CandidatePayload::SpokenSingle(_)
        | CandidatePayload::SpokenMultiturn(_) => vec![],
    };
    for expected_id in expected_unit_ids {
        if !ids.iter().any(|id| id.as_str() == expected_id) {
            issue(
                issues,
                "scoring.missingResponseUnit",
                "scoringPackage.scoringPoints",
                &format!("Response unit {expected_id} does not have a corresponding scoring point"),
            );
        }
    }
}

fn validate_candidate_payload(package: &TaskPackage, issues: &mut Vec<ValidationIssue>) {
    match &package.candidate_payload {
        CandidatePayload::SingleSelect(payload) => {
            validate_stimulus(&payload.stimulus, "candidatePayload.stimulus", issues);
            required(
                &payload.prompt,
                "candidatePayload.prompt",
                "Prompt is required",
                issues,
            );
            if payload.options.len() < 2 {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload.options",
                    "At least two options are required",
                );
            }
            let mut ids = HashSet::new();
            for (index, option) in payload.options.iter().enumerate() {
                unique_id(&option.option_id, index, "options", &mut ids, issues);
                if option
                    .text
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty())
                    && option
                        .image_ref
                        .as_deref()
                        .is_none_or(|value| value.trim().is_empty())
                {
                    issue(
                        issues,
                        "schema.optionContent",
                        &format!("candidatePayload.options.{index}"),
                        "Each option must include text or an image",
                    );
                }
            }
            if package
                .scoring_package
                .correct_option_id
                .as_deref()
                .is_none_or(|id| !ids.contains(id))
            {
                issue(
                    issues,
                    "business.correctOption",
                    "scoringPackage.correctOptionId",
                    "The correct answer must reference an existing option",
                );
            }
            if payload.shuffle_options {
                warning(
                    issues,
                    "delivery.optionOrderVariant",
                    "candidatePayload.shuffleOptions",
                    "Randomizing the options creates a delivery variant; review it before delivery",
                );
            }
        }
        CandidatePayload::Matching(payload) => {
            validate_stimulus(&payload.stimulus, "candidatePayload.stimulus", issues);
            required(
                &payload.prompt,
                "candidatePayload.prompt",
                "Prompt is required",
                issues,
            );
            if payload.left_items.len() < 2 || payload.right_items.len() < 2 {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload",
                    "Matching items require at least two entries on each side",
                );
            }
            let mut left_ids = HashSet::new();
            let mut right_ids = HashSet::new();
            for (index, entry) in payload.left_items.iter().enumerate() {
                unique_id(&entry.item_id, index, "leftItems", &mut left_ids, issues);
                item_content(
                    entry.text.as_deref(),
                    entry.image_ref.as_deref(),
                    index,
                    "leftItems",
                    issues,
                );
            }
            for (index, entry) in payload.right_items.iter().enumerate() {
                unique_id(&entry.item_id, index, "rightItems", &mut right_ids, issues);
                item_content(
                    entry.text.as_deref(),
                    entry.image_ref.as_deref(),
                    index,
                    "rightItems",
                    issues,
                );
            }
            for left_id in &left_ids {
                if package
                    .scoring_package
                    .correct_matches
                    .get(*left_id)
                    .is_none_or(|right_id| !right_ids.contains(right_id.as_str()))
                {
                    issue(
                        issues,
                        "business.correctMatch",
                        "scoringPackage.correctMatches",
                        "Each left-side item must match an existing right-side item",
                    );
                }
            }
        }
        CandidatePayload::RestrictedInput(payload) => {
            validate_stimulus(&payload.stimulus, "candidatePayload.stimulus", issues);
            required(
                &payload.prompt,
                "candidatePayload.prompt",
                "Prompt is required",
                issues,
            );
            if payload.response_fields.is_empty() {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload.responseFields",
                    "At least one response field is required",
                );
            }
            let mut ids = HashSet::new();
            for (index, field) in payload.response_fields.iter().enumerate() {
                unique_id(
                    &field.response_id,
                    index,
                    "responseFields",
                    &mut ids,
                    issues,
                );
                required(
                    &field.input_type,
                    &format!("candidatePayload.responseFields.{index}.inputType"),
                    "Input type is required",
                    issues,
                );
                if package
                    .scoring_package
                    .accepted_responses
                    .get(&field.response_id)
                    .is_none_or(|answers| answers.iter().all(|answer| answer.trim().is_empty()))
                {
                    issue(
                        issues,
                        "business.acceptedResponse",
                        &format!("scoringPackage.acceptedResponses.{}", field.response_id),
                        "Each response field must have at least one accepted answer",
                    );
                }
            }
        }
        CandidatePayload::FormEntry(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "Situation is required",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "Instructions are required",
                issues,
            );
            if !(4..=6).contains(&payload.fields.len()) {
                issue(
                    issues,
                    "business.formFieldCount",
                    "candidatePayload.fields",
                    "Form-entry items require 4–6 fields",
                );
            }
            let mut ids = HashSet::new();
            for (index, field) in payload.fields.iter().enumerate() {
                unique_id(&field.field_id, index, "fields", &mut ids, issues);
                required(
                    &field.label,
                    &format!("candidatePayload.fields.{index}.label"),
                    "Field name is required",
                    issues,
                );
            }
        }
        CandidatePayload::TypedMessage(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "Situation is required",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "Instructions are required",
                issues,
            );
            required(
                &payload.recipient,
                "candidatePayload.recipient",
                "Recipient is required",
                issues,
            );
            required(
                &payload.purpose,
                "candidatePayload.purpose",
                "Writing purpose is required",
                issues,
            );
            validate_content_points(&payload.required_content_points, issues);
            if payload.length_guidance.minimum == 0
                || payload.length_guidance.minimum > payload.length_guidance.maximum
            {
                issue(
                    issues,
                    "business.lengthGuidance",
                    "candidatePayload.lengthGuidance",
                    "Character-count range must be valid",
                );
            }
            require_rubric(package, issues);
        }
        CandidatePayload::SpokenSingle(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "Situation is required",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "Instructions are required",
                issues,
            );
            if payload
                .visible_prompt_text
                .as_deref()
                .is_none_or(|value| value.trim().is_empty())
                && payload
                    .prompt_audio_ref
                    .as_deref()
                    .is_none_or(|value| value.trim().is_empty())
            {
                issue(
                    issues,
                    "schema.prompt",
                    "candidatePayload",
                    "Spoken-response items require a visible or audio prompt",
                );
            }
            if payload.response_time_seconds == 0 {
                issue(
                    issues,
                    "business.responseTime",
                    "candidatePayload.responseTimeSeconds",
                    "Response time must be greater than 0",
                );
            }
            validate_content_points(&payload.required_content_points, issues);
            require_rubric(package, issues);
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "Situation is required",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "Instructions are required",
                issues,
            );
            required(
                &payload.roles.system_role,
                "candidatePayload.roles.systemRole",
                "System role is required",
                issues,
            );
            required(
                &payload.roles.candidate_role,
                "candidatePayload.roles.candidateRole",
                "Candidate role is required",
                issues,
            );
            let Some(path) = payload
                .paths
                .iter()
                .find(|path| path.path_id == payload.start_path_id)
            else {
                issue(
                    issues,
                    "business.startPath",
                    "candidatePayload.startPathId",
                    "The start path must reference an existing path",
                );
                require_rubric(package, issues);
                return;
            };
            if path.turns.len() < 2 || !path.turns.iter().any(|turn| turn.speaker == "candidate") {
                issue(
                    issues,
                    "business.spokenTurns",
                    "candidatePayload.paths",
                    "Spoken interactions require at least one system prompt and one candidate response",
                );
            }
            for (index, turn) in path.turns.iter().enumerate() {
                required(
                    &turn.turn_id,
                    &format!("candidatePayload.paths.0.turns.{index}.turnId"),
                    "Turn ID is required",
                    issues,
                );
                if turn.speaker == "system"
                    && turn
                        .prompt_audio_ref
                        .as_deref()
                        .is_none_or(|value| value.trim().is_empty())
                {
                    issue(
                        issues,
                        "schema.prompt",
                        &format!("candidatePayload.paths.0.turns.{index}.promptAudioRef"),
                        "System turns require prompt text or an audio reference",
                    );
                }
                if turn.speaker == "candidate"
                    && turn
                        .response_id
                        .as_deref()
                        .is_none_or(|value| value.trim().is_empty())
                {
                    issue(
                        issues,
                        "schema.response",
                        &format!("candidatePayload.paths.0.turns.{index}.responseId"),
                        "Candidate turns require a response ID",
                    );
                }
            }
            require_rubric(package, issues);
        }
    }
}

fn validate_stimulus(stimulus: &Stimulus, path: &str, issues: &mut Vec<ValidationIssue>) {
    if stimulus
        .text
        .as_deref()
        .is_none_or(|value| value.trim().is_empty())
        && stimulus
            .image_refs
            .iter()
            .all(|value| value.trim().is_empty())
        && stimulus
            .audio_ref
            .as_deref()
            .is_none_or(|value| value.trim().is_empty())
    {
        issue(
            issues,
            "schema.stimulus",
            path,
            "The stimulus must include text, an image, or audio",
        );
    }
}

fn unique_id<'a>(
    id: &'a str,
    index: usize,
    collection: &str,
    ids: &mut HashSet<&'a str>,
    issues: &mut Vec<ValidationIssue>,
) {
    if id.trim().is_empty() {
        issue(
            issues,
            "schema.required",
            &format!("candidatePayload.{collection}.{index}"),
            "ID is required",
        );
    } else if !ids.insert(id) {
        issue(
            issues,
            if collection == "options" {
                "business.duplicateOptionId"
            } else {
                "business.duplicateId"
            },
            &format!("candidatePayload.{collection}.{index}"),
            "ID must be unique",
        );
    }
}

fn item_content(
    text: Option<&str>,
    image: Option<&str>,
    index: usize,
    collection: &str,
    issues: &mut Vec<ValidationIssue>,
) {
    if text.is_none_or(|value| value.trim().is_empty())
        && image.is_none_or(|value| value.trim().is_empty())
    {
        issue(
            issues,
            "schema.itemContent",
            &format!("candidatePayload.{collection}.{index}"),
            "Each item must include text or an image",
        );
    }
}

fn validate_content_points(
    points: &[super::domain::ContentPoint],
    issues: &mut Vec<ValidationIssue>,
) {
    if points.is_empty() {
        issue(
            issues,
            "schema.minItems",
            "candidatePayload.requiredContentPoints",
            "At least one content point is required",
        );
    }
    for (index, point) in points.iter().enumerate() {
        required(
            &point.description,
            &format!("candidatePayload.requiredContentPoints.{index}.description"),
            "Content point cannot be empty",
            issues,
        );
    }
}

fn require_rubric(package: &TaskPackage, issues: &mut Vec<ValidationIssue>) {
    if package
        .scoring_package
        .rubric_id
        .as_deref()
        .is_none_or(str::is_empty)
    {
        issue(
            issues,
            "business.rubric",
            "scoringPackage.rubricId",
            "Open-response items must reference a scoring rubric",
        );
    }
}

fn required(value: &str, path: &str, message: &str, issues: &mut Vec<ValidationIssue>) {
    if value.trim().is_empty() {
        issue(issues, "schema.required", path, message);
    }
}

pub fn validate_generation_setup(package: &TaskPackage) -> ValidationResult {
    let mut issues = Vec::new();
    let Some(registry) = snapshot_for(&package.spec_versions.registry_bundle_version) else {
        return missing_registry_result(package);
    };
    validate_authoring_setup(package, &registry, &mut issues);
    if !registry
        .difficulty_bands
        .contains(&package.content.difficulty_band)
    {
        issue(
            &mut issues,
            "authoring.difficulty",
            "content.difficultyBand",
            "Select a valid A1 difficulty band",
        );
    }
    validate_difficulty_profile(package, &registry, &mut issues);
    let mut seen = HashSet::new();
    for (index, content_id) in package.content.target_content_ids.iter().enumerate() {
        if !seen.insert(content_id) {
            issue(
                &mut issues,
                "authoring.duplicateContent",
                &format!("content.targetContentIds.{index}"),
                "Language content cannot be selected more than once",
            );
        }
        if !registry
            .content_id_options
            .iter()
            .any(|entry| &entry.id == content_id)
        {
            issue(
                &mut issues,
                "authoring.unknownContent",
                &format!("content.targetContentIds.{index}"),
                "The selected language content was not found in the current Registry",
            );
        }
    }
    ValidationResult {
        valid: !issues.iter().any(|issue| issue.severity == "error"),
        registry_bundle_version: registry.bundle_version.clone(),
        issues,
    }
}

fn validate_authoring_setup(
    package: &TaskPackage,
    registry: &RegistrySnapshot,
    issues: &mut Vec<ValidationIssue>,
) {
    let capability = capability_for(
        registry,
        &package.blueprint_slot_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    );
    let context = registry
        .context_options
        .iter()
        .find(|entry| entry.id == package.content.context_id);

    if capability.is_none_or(|entry| {
        !entry
            .allowed_domains
            .contains(&package.content.primary_domain)
    }) {
        issue(
            issues,
            "authoring.domain",
            "content.primaryDomain",
            "The selected domain is not available for this exam task",
        );
    }
    if capability.is_none_or(|entry| {
        !entry
            .allowed_context_ids
            .contains(&package.content.context_id)
    }) {
        issue(
            issues,
            "authoring.context",
            "content.contextId",
            "The selected context is not available for this exam task",
        );
    } else if context.is_none_or(|entry| {
        !entry
            .primary_domains
            .contains(&package.content.primary_domain)
            || capability.is_none_or(|capability| !context_supports_capability(entry, capability))
    }) {
        issue(
            issues,
            "authoring.domainContext",
            "content.contextId",
            "The selected context does not match the domain",
        );
    }

    if package.content.target_content_ids.is_empty() {
        issue(
            issues,
            "authoring.targetContent",
            "content.targetContentIds",
            "Select at least one vocabulary, grammar, character, or pragmatic target",
        );
    }
    for (index, content_id) in package.content.target_content_ids.iter().enumerate() {
        if let Some(content) = registry
            .content_id_options
            .iter()
            .find(|entry| &entry.id == content_id)
        {
            if content.kind == "supported" {
                issue(
                    issues,
                    "authoring.contentPartition",
                    &format!("content.targetContentIds.{index}"),
                    "Supporting content belongs in the Supporting content section and cannot replace core language content",
                );
            }
            let context_matches = content.context_ids.is_empty()
                || content.context_ids.contains(&package.content.context_id);
            let can_do_matches = capability.is_some_and(|capability| {
                content.can_do_ids.is_empty()
                    || content.can_do_ids.contains(&capability.primary_can_do_id)
                    || content
                        .can_do_ids
                        .iter()
                        .any(|id| capability.supporting_can_do_ids.contains(id))
            });
            let receptive_skill = capability.is_some_and(|capability| {
                matches!(
                    capability.primary_reported_skill.as_str(),
                    "Reading" | "Listening"
                )
            });
            let mastery_matches = content.mastery_scope.as_deref().is_none_or(|scope| {
                scope == "receptiveProductive" || (receptive_skill && scope == "receptive")
            });
            if !context_matches || !can_do_matches || !mastery_matches {
                issue(
                    issues,
                    "authoring.contentCompatibility",
                    &format!("content.targetContentIds.{index}"),
                    &format!(
                        "\"{}\" is incompatible with the current Can-do, mastery scope, or context",
                        content.label
                    ),
                );
            }
        }
    }

    let expected_points = package
        .content
        .difficulty
        .as_ref()
        .map(|profile| usize::from(profile.drivers.information_points))
        .unwrap_or(1);
    let completed_points = package
        .content
        .required_information_points
        .iter()
        .filter(|point| !point.label.trim().is_empty())
        .count();
    if package.content.required_information_points.len() != expected_points
        || completed_points != expected_points
    {
        issue(
            issues,
            "authoring.informationPoints",
            "content.requiredInformationPoints",
            &format!("Enter the required number of information points ({expected_points})"),
        );
    }
}

fn validate_difficulty_profile(
    package: &TaskPackage,
    registry: &RegistrySnapshot,
    issues: &mut Vec<ValidationIssue>,
) {
    let Some(difficulty) = &package.content.difficulty else {
        return;
    };
    if difficulty.intended_band != package.content.difficulty_band {
        issue(
            issues,
            "difficulty.intendedBandMismatch",
            "content.difficulty.intendedBand",
            "The intended difficulty band must match the compatibility field difficultyBand",
        );
    }
    if ![
        "AuthorEstimated",
        "ExpertEstimated",
        "HumanConfirmed",
        "Piloted",
    ]
    .contains(&difficulty.status.as_str())
    {
        issue(
            issues,
            "difficulty.status",
            "content.difficulty.status",
            "Difficulty status is invalid",
        );
    }
    if difficulty
        .rationale
        .iter()
        .all(|entry| entry.trim().is_empty())
    {
        issue(
            issues,
            "difficulty.rationale",
            "content.difficulty.rationale",
            "An intended-difficulty rationale is required",
        );
    }
    let drivers = &difficulty.drivers;
    if drivers.inference_required {
        issue(
            issues,
            "difficulty.a1Boundary",
            "content.difficulty.drivers.inferenceRequired",
            "A1 items cannot require complex inference",
        );
    }
    if !(1..=2).contains(&drivers.information_points) {
        issue(
            issues,
            "difficulty.informationPoints",
            "content.difficulty.drivers.informationPoints",
            "A1 items must contain 1–2 explicit information points",
        );
    }
    if !["wordOrPhrase", "shortSentence", "twoRelatedPhrases"]
        .contains(&drivers.input_length.as_str())
    {
        issue(
            issues,
            "difficulty.inputLength",
            "content.difficulty.drivers.inputLength",
            "A1 input length must be a word or phrase, a short sentence, or two closely related phrases",
        );
    }
    if !["high", "moderate", "limited"].contains(&drivers.support_level.as_str()) {
        issue(
            issues,
            "difficulty.supportLevel",
            "content.difficulty.drivers.supportLevel",
            "Contextual-support level is invalid",
        );
    }
    if !["clear", "moderate", "close", "notApplicable"]
        .contains(&drivers.distractor_similarity.as_str())
    {
        issue(
            issues,
            "difficulty.distractorSimilarity",
            "content.difficulty.drivers.distractorSimilarity",
            "Distractor similarity is invalid; open-response items should use notApplicable",
        );
    }
    if difficulty.empirical_difficulty.status == "NotPiloted"
        && (difficulty.empirical_difficulty.sample_id.is_some()
            || difficulty.empirical_difficulty.observed_band.is_some()
            || difficulty.empirical_difficulty.percent_correct.is_some())
    {
        issue(
            issues,
            "difficulty.empiricalState",
            "content.difficulty.empiricalDifficulty",
            "Unpiloted items cannot include empirical difficulty results",
        );
    }

    let uses_distractors = matches!(
        package.candidate_payload,
        CandidatePayload::SingleSelect(_) | CandidatePayload::Matching(_)
    );
    let standards = capability_for(
        registry,
        &package.blueprint_slot_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    )
    .map(|capability| difficulty_standards_for_capability(registry, capability))
    .unwrap_or(registry.difficulty_standards.as_slice());
    let anchor_mismatch = standards
        .iter()
        .find(|standard| standard.id == difficulty.intended_band)
        .is_some_and(|standard| {
            drivers.information_points < standard.information_points_min
                || drivers.information_points > standard.information_points_max
                || !standard
                    .allowed_input_lengths
                    .contains(&drivers.input_length)
                || !standard
                    .allowed_support_levels
                    .contains(&drivers.support_level)
                || (uses_distractors
                    && !standard
                        .allowed_distractor_similarities
                        .contains(&drivers.distractor_similarity))
                || drivers.inference_required != standard.default_drivers.inference_required
        });
    if anchor_mismatch {
        warning(
            issues,
            "difficulty.anchorMismatch",
            "content.difficulty.drivers",
            "The actual difficulty drivers do not fully match the selected A1 difficulty anchor; review them manually",
        );
    }
}

fn check_equal(
    issues: &mut Vec<ValidationIssue>,
    code: &str,
    path: &str,
    actual: &str,
    expected: &str,
) {
    if actual != expected {
        issue(
            issues,
            code,
            path,
            &format!("Expected {expected}; found {actual}"),
        );
    }
}

fn issue(issues: &mut Vec<ValidationIssue>, code: &str, path: &str, message: &str) {
    issues.push(ValidationIssue {
        severity: "error".to_string(),
        code: code.to_string(),
        path: path.to_string(),
        rule_ref: code.to_string(),
        message: message.to_string(),
    });
}

fn warning(issues: &mut Vec<ValidationIssue>, code: &str, path: &str, message: &str) {
    issues.push(ValidationIssue {
        severity: "warning".to_string(),
        code: code.to_string(),
        path: path.to_string(),
        rule_ref: code.to_string(),
        message: message.to_string(),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::domain::TaskPackage;

    fn valid_package() -> TaskPackage {
        let mut package = TaskPackage::new("R-A1-1-TEST".to_string());
        let payload = package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select");
        payload.stimulus.text = Some("星期一不开门".to_string());
        payload.prompt = "哪一天不能来？".to_string();
        payload.options[0].text = Some("星期一".to_string());
        payload.options[1].text = Some("星期二".to_string());
        package.content.target_content_ids = vec!["LEX-A1-0208".to_string()];
        package.content.required_information_points =
            vec![crate::language_items::domain::InformationPoint::new(
                0,
                "营业日期",
            )];
        package
    }

    #[test]
    fn valid_single_select_passes() {
        assert!(validate_task_package(&valid_package()).valid);
    }

    #[test]
    fn target_content_must_match_the_locked_can_do_and_context() {
        let mut package = valid_package();
        let incompatible = snapshot()
            .content_id_options
            .iter()
            .find(|entry| {
                entry.context_ids.contains(&package.content.context_id)
                    && !entry.can_do_ids.is_empty()
                    && !entry
                        .can_do_ids
                        .contains(&package.content.primary_can_do_id)
            })
            .expect("fixture context has content for another Can-do");
        package.content.target_content_ids = vec![incompatible.id.clone()];

        let result = validate_task_package(&package);
        assert!(result.issues.iter().any(|issue| {
            issue.code == "registry.contentCompatibility"
                && issue.path == "content.targetContentIds.0"
        }));
    }

    #[test]
    fn core_and_supporting_content_are_kept_in_separate_partitions() {
        let mut package = valid_package();
        let supported = snapshot()
            .content_id_options
            .iter()
            .find(|entry| entry.kind == "supported")
            .expect("supported content entry")
            .id
            .clone();
        package.content.target_content_ids = vec![supported];

        let result = validate_task_package(&package);

        assert!(result.issues.iter().any(|issue| {
            issue.code == "registry.contentPartition" && issue.path == "content.targetContentIds.0"
        }));
    }

    #[test]
    fn duplicate_option_and_bad_answer_fail() {
        let mut package = valid_package();
        package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .options[1]
            .option_id = "A".to_string();
        package.scoring_package.correct_option_id = Some("Z".to_string());
        let result = validate_task_package(&package);
        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|i| i.code == "business.duplicateOptionId")
        );
        assert!(
            result
                .issues
                .iter()
                .any(|i| i.code == "business.correctOption")
        );
    }

    #[test]
    fn objective_response_units_require_matching_scoring_points() {
        let mut package = valid_package();
        package.scoring_package.scoring_points.clear();
        package.scoring_package.max_raw_score = 0;

        let result = validate_task_package(&package);

        assert!(result.issues.iter().any(|issue| {
            issue.code == "scoring.missingResponseUnit"
                && issue.path == "scoringPackage.scoringPoints"
        }));
    }

    #[test]
    fn unsupported_registry_combination_fails() {
        let mut package = valid_package();
        package.item_format_id = "IF-MATCHING".to_string();
        assert!(!validate_task_package(&package).valid);
    }

    #[test]
    fn generation_setup_requires_content_and_information_points() {
        let package = TaskPackage::new("R-A1-1-SETUP".to_string());
        let result = validate_generation_setup(&package);

        assert!(!result.valid);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.code == "authoring.targetContent")
        );
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.code == "authoring.informationPoints")
        );
    }

    #[test]
    fn generation_setup_rejects_domain_context_mismatch() {
        let mut package = valid_package();
        package.content.primary_domain = "Educational".to_string();
        package.content.context_id = "D09".to_string();

        let result = validate_generation_setup(&package);
        assert!(
            result
                .issues
                .iter()
                .any(|issue| issue.code == "authoring.domainContext")
        );
    }
}
