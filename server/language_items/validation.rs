use std::collections::HashSet;

use super::{
    domain::{CandidatePayload, Stimulus, TaskPackage, ValidationIssue, ValidationResult},
    registry::snapshot,
};

pub fn validate_task_package(package: &TaskPackage) -> ValidationResult {
    let mut issues = Vec::new();
    let registry = snapshot();
    let capability = registry.capabilities.iter().find(|entry| {
        entry.blueprint_slot_id == package.blueprint_slot_id
            && entry.item_format_id == package.item_format_id
    });
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
                "使用领域不适用于当前考试任务",
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
                "具体情境不适用于当前考试任务",
            );
        }
    } else {
        issue(
            &mut issues,
            "registry.capability",
            "itemFormatId",
            "题型与考试任务的组合未注册",
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
    validate_authoring_setup(package, &mut issues);
    if !registry
        .difficulty_bands
        .contains(&package.content.difficulty_band)
    {
        issue(
            &mut issues,
            "registry.difficulty",
            "content.difficultyBand",
            "Difficulty 不在允许范围内",
        );
    }
    validate_difficulty_profile(package, &mut issues);
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
                &format!("Content ID 不得重复: {content_id}"),
            );
        }
        if !registered_content_ids.contains(content_id.as_str()) {
            issue(
                &mut issues,
                "registry.contentId",
                &format!("content.targetContentIds.{index}"),
                &format!("未在当前 Registry 找到 Content ID: {content_id}"),
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
                    "支持性内容不能作为核心考查内容",
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
                    &format!("Content ID 与当前 Can-do、掌握范围或具体情境不兼容: {content_id}"),
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
                &format!("支持性 Content ID 不得重复: {content_id}"),
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
                "核心语言内容不能放入支持性内容",
            ),
            None => issue(
                &mut issues,
                "registry.contentId",
                &format!("content.supportingContentRefs.{index}"),
                &format!("未在当前 Registry 找到支持性 Content ID: {content_id}"),
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
                "信息点 ID 不能为空或重复",
            );
        }
        if point.label.trim().is_empty() {
            issue(
                &mut issues,
                "schema.minLength",
                &format!("content.requiredInformationPoints.{index}.label"),
                "Required information point 不能为空",
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
                "信息点类型无效",
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
                "信息点引用了不存在的计分点",
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
        issue(&mut issues, "schema.required", "taskId", "taskId 不能为空");
    }
    if package.task_version.trim().is_empty() {
        issue(
            &mut issues,
            "schema.required",
            "taskVersion",
            "taskVersion 不能为空",
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
        "本题评分规范版本不能为空",
        issues,
    );
    required(
        &scoring.scoring_contract_template_version,
        "scoringPackage.scoringContractTemplateVersion",
        "评分合同模板版本不能为空",
        issues,
    );
    if scoring.scoring_points.is_empty() {
        issue(
            issues,
            "scoring.points",
            "scoringPackage.scoringPoints",
            "至少需要一个计分点",
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
                "计分点 ID 不能为空或重复",
            );
        }
        if point.description.trim().is_empty() {
            issue(
                issues,
                "scoring.pointDescription",
                &format!("scoringPackage.scoringPoints.{index}.description"),
                "计分点说明不能为空",
            );
        }
        if point.points == 0 {
            issue(
                issues,
                "scoring.pointValue",
                &format!("scoringPackage.scoringPoints.{index}.points"),
                "计分点分值必须大于 0",
            );
        }
        total = total.saturating_add(point.points);
    }
    if total != scoring.max_raw_score {
        issue(
            issues,
            "scoring.maxRawScore",
            "scoringPackage.maxRawScore",
            "最高原始分必须等于全部计分点分值之和",
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
            "必须保存题目专属答案引用",
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
            "量表评分任务必须记录适用 benchmark 版本",
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
                &format!("题目作答单元 {expected_id} 缺少对应计分点"),
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
                "题干不能为空",
                issues,
            );
            if payload.options.len() < 2 {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload.options",
                    "至少需要两个选项",
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
                        "选项至少需要文本或图片",
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
                    "正确答案必须引用现有选项",
                );
            }
            if payload.shuffle_options {
                warning(
                    issues,
                    "delivery.optionOrderVariant",
                    "candidatePayload.shuffleOptions",
                    "随机排列会形成新的交付变体，请在组卷时复核",
                );
            }
        }
        CandidatePayload::Matching(payload) => {
            validate_stimulus(&payload.stimulus, "candidatePayload.stimulus", issues);
            required(
                &payload.prompt,
                "candidatePayload.prompt",
                "题干不能为空",
                issues,
            );
            if payload.left_items.len() < 2 || payload.right_items.len() < 2 {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload",
                    "匹配题左右两侧都至少需要两项",
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
                        "每个左侧项目都必须匹配一个现有右侧项目",
                    );
                }
            }
        }
        CandidatePayload::RestrictedInput(payload) => {
            validate_stimulus(&payload.stimulus, "candidatePayload.stimulus", issues);
            required(
                &payload.prompt,
                "candidatePayload.prompt",
                "题干不能为空",
                issues,
            );
            if payload.response_fields.is_empty() {
                issue(
                    issues,
                    "schema.minItems",
                    "candidatePayload.responseFields",
                    "至少需要一个作答字段",
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
                    "输入类型不能为空",
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
                        "每个作答字段至少需要一个可接受答案",
                    );
                }
            }
        }
        CandidatePayload::FormEntry(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "情境不能为空",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "作答说明不能为空",
                issues,
            );
            if !(4..=6).contains(&payload.fields.len()) {
                issue(
                    issues,
                    "business.formFieldCount",
                    "candidatePayload.fields",
                    "表单题需要 4–6 个字段",
                );
            }
            let mut ids = HashSet::new();
            for (index, field) in payload.fields.iter().enumerate() {
                unique_id(&field.field_id, index, "fields", &mut ids, issues);
                required(
                    &field.label,
                    &format!("candidatePayload.fields.{index}.label"),
                    "字段名称不能为空",
                    issues,
                );
            }
        }
        CandidatePayload::TypedMessage(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "情境不能为空",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "作答说明不能为空",
                issues,
            );
            required(
                &payload.recipient,
                "candidatePayload.recipient",
                "收件人不能为空",
                issues,
            );
            required(
                &payload.purpose,
                "candidatePayload.purpose",
                "写作目的不能为空",
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
                    "字数范围必须有效",
                );
            }
            require_rubric(package, issues);
        }
        CandidatePayload::SpokenSingle(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "情境不能为空",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "作答说明不能为空",
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
                    "口语题至少需要可见提示或音频提示",
                );
            }
            if payload.response_time_seconds == 0 {
                issue(
                    issues,
                    "business.responseTime",
                    "candidatePayload.responseTimeSeconds",
                    "作答时间必须大于 0",
                );
            }
            validate_content_points(&payload.required_content_points, issues);
            require_rubric(package, issues);
        }
        CandidatePayload::SpokenMultiturn(payload) => {
            required(
                &payload.situation,
                "candidatePayload.situation",
                "情境不能为空",
                issues,
            );
            required(
                &payload.instructions,
                "candidatePayload.instructions",
                "作答说明不能为空",
                issues,
            );
            required(
                &payload.roles.system_role,
                "candidatePayload.roles.systemRole",
                "系统角色不能为空",
                issues,
            );
            required(
                &payload.roles.candidate_role,
                "candidatePayload.roles.candidateRole",
                "考生角色不能为空",
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
                    "起始路径必须引用现有路径",
                );
                require_rubric(package, issues);
                return;
            };
            if path.turns.len() < 2 || !path.turns.iter().any(|turn| turn.speaker == "candidate") {
                issue(
                    issues,
                    "business.spokenTurns",
                    "candidatePayload.paths",
                    "多轮口语至少需要一轮系统提示和一轮考生作答",
                );
            }
            for (index, turn) in path.turns.iter().enumerate() {
                required(
                    &turn.turn_id,
                    &format!("candidatePayload.paths.0.turns.{index}.turnId"),
                    "轮次编号不能为空",
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
                        "系统轮次需要提示文本或音频引用",
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
                        "考生轮次需要作答编号",
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
            "材料至少需要文本、图片或音频",
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
            "编号不能为空",
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
            "编号必须唯一",
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
            "项目至少需要文本或图片",
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
            "至少需要一个内容点",
        );
    }
    for (index, point) in points.iter().enumerate() {
        required(
            &point.description,
            &format!("candidatePayload.requiredContentPoints.{index}.description"),
            "内容点不能为空",
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
            "开放作答题必须引用评分量表",
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
    let registry = snapshot();
    validate_authoring_setup(package, &mut issues);
    if !registry
        .difficulty_bands
        .contains(&package.content.difficulty_band)
    {
        issue(
            &mut issues,
            "authoring.difficulty",
            "content.difficultyBand",
            "请选择有效的 A1 内部难度",
        );
    }
    validate_difficulty_profile(package, &mut issues);
    let mut seen = HashSet::new();
    for (index, content_id) in package.content.target_content_ids.iter().enumerate() {
        if !seen.insert(content_id) {
            issue(
                &mut issues,
                "authoring.duplicateContent",
                &format!("content.targetContentIds.{index}"),
                "语言内容不能重复选择",
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
                "所选语言内容不在当前注册表中",
            );
        }
    }
    ValidationResult {
        valid: !issues.iter().any(|issue| issue.severity == "error"),
        registry_bundle_version: snapshot().bundle_version.clone(),
        issues,
    }
}

fn validate_authoring_setup(package: &TaskPackage, issues: &mut Vec<ValidationIssue>) {
    let registry = snapshot();
    let capability = registry.capabilities.iter().find(|entry| {
        entry.blueprint_slot_id == package.blueprint_slot_id
            && entry.item_format_id == package.item_format_id
    });
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
            "所选使用领域不适用于当前考试任务",
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
            "所选具体情境不适用于当前考试任务",
        );
    } else if context.is_none_or(|entry| {
        !entry
            .primary_domains
            .contains(&package.content.primary_domain)
    }) {
        issue(
            issues,
            "authoring.domainContext",
            "content.contextId",
            "具体情境与使用领域不一致",
        );
    }

    if package.content.target_content_ids.is_empty() {
        issue(
            issues,
            "authoring.targetContent",
            "content.targetContentIds",
            "至少选择一项词汇、语法、汉字或语用内容",
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
                    "支持性内容应放入“支持性内容”，不能代替核心语言内容",
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
                    &format!("“{}”不适用于当前 Can-do、掌握范围或具体情境", content.label),
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
            &format!("请填写 {expected_points} 项要考查的信息点"),
        );
    }
}

fn validate_difficulty_profile(package: &TaskPackage, issues: &mut Vec<ValidationIssue>) {
    let Some(difficulty) = &package.content.difficulty else {
        return;
    };
    if difficulty.intended_band != package.content.difficulty_band {
        issue(
            issues,
            "difficulty.intendedBandMismatch",
            "content.difficulty.intendedBand",
            "预期难度带必须与兼容字段 difficultyBand 一致",
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
            "难度状态无效",
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
            "必须记录预期难度依据",
        );
    }
    let drivers = &difficulty.drivers;
    if drivers.inference_required {
        issue(
            issues,
            "difficulty.a1Boundary",
            "content.difficulty.drivers.inferenceRequired",
            "A1 题项不能把复杂推断作为必要处理要求",
        );
    }
    if !(1..=2).contains(&drivers.information_points) {
        issue(
            issues,
            "difficulty.informationPoints",
            "content.difficulty.drivers.informationPoints",
            "A1 题项必须包含 1–2 个直接信息点",
        );
    }
    if !["wordOrPhrase", "shortSentence", "twoRelatedPhrases"]
        .contains(&drivers.input_length.as_str())
    {
        issue(
            issues,
            "difficulty.inputLength",
            "content.difficulty.drivers.inputLength",
            "A1 输入长度必须是词语、短句或两个紧密相关短语",
        );
    }
    if !["high", "moderate", "limited"].contains(&drivers.support_level.as_str()) {
        issue(
            issues,
            "difficulty.supportLevel",
            "content.difficulty.drivers.supportLevel",
            "情境支持程度无效",
        );
    }
    if !["clear", "moderate", "close", "notApplicable"]
        .contains(&drivers.distractor_similarity.as_str())
    {
        issue(
            issues,
            "difficulty.distractorSimilarity",
            "content.difficulty.drivers.distractorSimilarity",
            "干扰项相似度无效；开放作答题应使用 notApplicable",
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
            "未预试状态不能包含实测难度结果",
        );
    }

    let uses_distractors = matches!(
        package.candidate_payload,
        CandidatePayload::SingleSelect(_) | CandidatePayload::Matching(_)
    );
    let anchor_mismatch = match difficulty.intended_band.as_str() {
        "LowerA1" => {
            drivers.information_points != 1
                || drivers.input_length != "wordOrPhrase"
                || drivers.support_level != "high"
                || (uses_distractors && drivers.distractor_similarity != "clear")
        }
        "TypicalA1" => {
            drivers.input_length != "shortSentence"
                || drivers.support_level == "limited"
                || (uses_distractors && drivers.distractor_similarity == "close")
        }
        "UpperA1" => {
            drivers.information_points != 2
                || drivers.input_length == "wordOrPhrase"
                || drivers.support_level == "high"
                || (uses_distractors && drivers.distractor_similarity == "clear")
        }
        _ => false,
    };
    if anchor_mismatch {
        warning(
            issues,
            "difficulty.anchorMismatch",
            "content.difficulty.drivers",
            "实际难度驱动因素与所选 A1 内部难度锚点不完全一致，请人工确认",
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
            &format!("必须为 {expected}，当前为 {actual}"),
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
