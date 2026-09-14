use std::collections::{BTreeMap, HashSet};

use serde_json::Value;

use super::domain::{CandidatePayload, EnglishTranslation, ValidationIssue};

pub fn has_chinese(text: &str) -> bool {
    text.chars().any(|character| matches!(character as u32, 0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff | 0x20000..=0x3134f))
}

fn is_reference(text: &str) -> bool {
    let text = text.trim();
    let lowercase = text.to_ascii_lowercase();
    let scheme = text.split_once(':').is_some_and(|(prefix, _)| {
        prefix.starts_with(|character: char| character.is_ascii_alphabetic())
            && prefix.chars().all(|character| {
                character.is_ascii_alphanumeric() || matches!(character, '+' | '-' | '.')
            })
    });
    scheme
        || text.starts_with('/')
        || text.starts_with('\\')
        || [
            ".mp3", ".wav", ".ogg", ".m4a", ".aac", ".mp4", ".png", ".jpg", ".jpeg", ".gif",
            ".svg", ".webm",
        ]
        .iter()
        .any(|extension| {
            lowercase
                .split(['?', '#'])
                .next()
                .unwrap_or("")
                .ends_with(extension)
        })
}

fn is_natural_text(text: &str) -> bool {
    !is_reference(text) && (has_chinese(text) || text.split_whitespace().count() > 1)
}

fn pointer_segment(segment: &str) -> String {
    segment.replace('~', "~0").replace('/', "~1")
}

fn valid_pointer(path: &str) -> bool {
    if !path.starts_with('/') || path.len() < 2 {
        return false;
    }
    let mut characters = path.chars();
    while let Some(character) = characters.next() {
        if character == '~' && !matches!(characters.next(), Some('0' | '1')) {
            return false;
        }
    }
    true
}

fn technical_profile_key(key: &str) -> bool {
    key == "id"
        || key.ends_with("Id")
        || key.ends_with("Ids")
        || key.ends_with("Ref")
        || key.ends_with("Refs")
        || matches!(key, "type" | "inputType" | "speaker")
}

fn profile_text(value: &Value, path: &str, fields: &mut BTreeMap<String, String>) {
    match value {
        Value::String(text)
            if !text.trim().is_empty()
                && !is_reference(text)
                && text.chars().any(|character| character.is_alphabetic()) =>
        {
            fields.insert(path.to_string(), text.clone());
        }
        Value::Object(entries) => {
            for (key, entry) in entries {
                if !technical_profile_key(key) {
                    profile_text(entry, &format!("{path}/{}", pointer_segment(key)), fields);
                }
            }
        }
        Value::Array(entries) => {
            for (index, entry) in entries.iter().enumerate() {
                profile_text(entry, &format!("{path}/{index}"), fields);
            }
        }
        _ => {}
    }
}

fn collect_pattern(
    value: &Value,
    path: &str,
    segments: &[&str],
    natural_only: bool,
    fields: &mut BTreeMap<String, String>,
) {
    let Some((segment, rest)) = segments.split_first() else {
        if let Some(text) = value
            .as_str()
            .filter(|text| !text.trim().is_empty() && (!natural_only || is_natural_text(text)))
        {
            fields.insert(path.to_string(), text.to_string());
        }
        return;
    };
    if *segment == "*" {
        if let Some(entries) = value.as_array() {
            for (index, entry) in entries.iter().enumerate() {
                collect_pattern(
                    entry,
                    &format!("{path}/{index}"),
                    rest,
                    natural_only,
                    fields,
                );
            }
        }
    } else if let Some(entry) = value.get(*segment) {
        collect_pattern(
            entry,
            &format!("{path}/{}", pointer_segment(segment)),
            rest,
            natural_only,
            fields,
        );
    }
}

fn exercise_text(
    field: &Value,
    value: &Value,
    pointer: &str,
    source_path: &str,
    policy: &Value,
    fields: &mut BTreeMap<String, String>,
) {
    let key = field.get("key").and_then(Value::as_str).unwrap_or("");
    if matches!(
        key,
        "type"
            | "level"
            | "language"
            | "instructionLanguage"
            | "src"
            | "countBy"
            | "layout"
            | "responseMode"
    ) || policy
        .get("privatePaths")
        .and_then(Value::as_array)
        .is_some_and(|paths| paths.iter().any(|path| path.as_str() == Some(source_path)))
    {
        return;
    }
    if key == "text"
        && policy.get("transform").and_then(Value::as_str) == Some("masked-letters")
        && value.as_str().is_some_and(|text| {
            regex::Regex::new(r"\{[^|{}]+\|\d+\}")
                .expect("mask pattern is valid")
                .is_match(text)
        })
    {
        return;
    }
    match field.get("type").and_then(Value::as_str) {
        Some("string") => {
            if let Some(text) = value
                .as_str()
                .filter(|text| !text.trim().is_empty() && !is_reference(text))
            {
                fields.insert(pointer.into(), text.into());
            }
        }
        Some("object") => {
            if let Some(properties) = field.get("properties").and_then(Value::as_array) {
                for child in properties {
                    if let Some(key) = child.get("key").and_then(Value::as_str)
                        && let Some(value) = value.get(key)
                    {
                        exercise_text(
                            child,
                            value,
                            &format!("{pointer}/{}", pointer_segment(key)),
                            &format!("{source_path}.{key}"),
                            policy,
                            fields,
                        );
                    }
                }
            }
        }
        Some("array") => {
            if let (Some(element), Some(values)) = (field.get("element"), value.as_array()) {
                for (index, value) in values.iter().enumerate() {
                    exercise_text(
                        element,
                        value,
                        &format!("{pointer}/{index}"),
                        &format!("{source_path}.*"),
                        policy,
                        fields,
                    );
                }
            }
        }
        Some("union") => {
            if let Some(variants) = field.get("variants").and_then(Value::as_array) {
                for variant in variants {
                    exercise_text(variant, value, pointer, source_path, policy, fields);
                }
            }
        }
        _ => {}
    }
}

/// Only these author-readable text fields can have translations; IDs and delivery settings are excluded.
pub fn translation_source_fields(payload: &CandidatePayload) -> BTreeMap<String, String> {
    translation_source_fields_with_definition(payload, None)
}

pub fn translation_source_fields_for_registry(
    payload: &CandidatePayload,
    registry: &super::registry::RegistrySnapshot,
) -> BTreeMap<String, String> {
    let definition = match payload {
        CandidatePayload::ExerciseTemplate(payload) => registry
            .exercise_template_schemas
            .get(&payload.exercise_type)
            .and_then(|schema| schema.get("x-exercise-template")),
        _ => None,
    };
    translation_source_fields_with_definition(payload, definition)
}

fn translation_source_fields_with_definition(
    payload: &CandidatePayload,
    definition: Option<&Value>,
) -> BTreeMap<String, String> {
    let value = serde_json::to_value(payload).expect("candidate payload is serializable");
    let mut fields = BTreeMap::new();
    if let CandidatePayload::ExerciseTemplate(payload) = payload {
        if !payload.body.trim().is_empty() {
            fields.insert("/body".into(), payload.body.clone());
        }
        if let Some(definition) =
            definition.or_else(|| super::exercise_templates::template(&payload.exercise_type))
        {
            let policy = &definition["projection"];
            if let Some(source_fields) = definition.get("fields").and_then(Value::as_array) {
                for field in source_fields {
                    if let Some(key) = field.get("key").and_then(Value::as_str)
                        && let Some(value) = payload.data.get(key)
                    {
                        exercise_text(
                            field,
                            value,
                            &format!("/data/{}", pointer_segment(key)),
                            key,
                            policy,
                            &mut fields,
                        );
                    }
                }
            }
            if policy.get("transform").and_then(Value::as_str) == Some("independent-columns") {
                for key in ["leftItems", "rightItems"] {
                    if let Some(value) = payload.data.get(key) {
                        profile_text(value, &format!("/data/{key}"), &mut fields);
                    }
                }
            }
        }
        return fields;
    }
    for pattern in [
        "stimulus/text",
        "prompt",
        "options/*/text",
        "leftItems/*/text",
        "rightItems/*/text",
        "responseFields/*/label",
        "responseFields/*/placeholder",
        "fields/*/label",
        "fields/*/placeholder",
        "situation",
        "instructions",
        "sourceMessage",
        "recipient",
        "purpose",
        "visiblePromptText",
        "requiredContentPoints/*/description",
        "roles/systemRole",
        "roles/candidateRole",
    ] {
        collect_pattern(
            &value,
            "",
            &pattern.split('/').collect::<Vec<_>>(),
            false,
            &mut fields,
        );
    }
    for pattern in [
        "promptAudioRef",
        "paths/*/turns/*/promptAudioRef",
        "paths/*/turns/*/requiredFunctionIds/*",
    ] {
        collect_pattern(
            &value,
            "",
            &pattern.split('/').collect::<Vec<_>>(),
            true,
            &mut fields,
        );
    }
    if let Some(profile) = value.get("sourceProfile") {
        profile_text(profile, "/sourceProfile", &mut fields);
    }
    fields
}

pub fn validate_english_translations(
    payload: &CandidatePayload,
    translations: &[EnglishTranslation],
    require_complete: bool,
) -> Vec<ValidationIssue> {
    let fields = translation_source_fields(payload);
    validate_translation_fields(fields, translations, require_complete)
}

pub fn validate_english_translations_for_registry(
    payload: &CandidatePayload,
    translations: &[EnglishTranslation],
    require_complete: bool,
    registry: &super::registry::RegistrySnapshot,
) -> Vec<ValidationIssue> {
    validate_translation_fields(
        translation_source_fields_for_registry(payload, registry),
        translations,
        require_complete,
    )
}

fn validate_translation_fields(
    fields: BTreeMap<String, String>,
    translations: &[EnglishTranslation],
    require_complete: bool,
) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();
    let mut paths = HashSet::new();
    let mut matched = HashSet::new();
    let mut add = |code: &str, path: String, message: &str, stale: bool| {
        issues.push(ValidationIssue {
            severity: if stale && !require_complete {
                "warning"
            } else {
                "error"
            }
            .to_string(),
            code: format!("authoring.englishTranslation.{code}"),
            path,
            rule_ref: "authoring.englishTranslations".to_string(),
            message: message.to_string(),
        });
    };
    for (index, translation) in translations.iter().enumerate() {
        let path = format!("authoringPackage.englishTranslations.{index}");
        if !valid_pointer(&translation.path) {
            add(
                "path",
                format!("{path}.path"),
                "Use an absolute RFC6901 JSON pointer relative to candidatePayload",
                false,
            );
        }
        if translation.source_text.trim().is_empty() {
            add(
                "sourceText",
                format!("{path}.sourceText"),
                "The exact source text is required",
                false,
            );
        }
        if !paths.insert(&translation.path) {
            add(
                "duplicate",
                format!("{path}.path"),
                "Each source field can have only one English translation",
                false,
            );
        }
        match fields.get(&translation.path) {
            Some(source) if source == &translation.source_text => {
                matched.insert(translation.path.as_str());
            }
            Some(_) => add(
                "staleSource",
                format!("{path}.sourceText"),
                "The source text has changed; update its English translation",
                true,
            ),
            None => add(
                "stalePath",
                format!("{path}.path"),
                "This translation no longer refers to an available text field",
                true,
            ),
        }
        if translation.english_text.trim().is_empty()
            || !translation
                .english_text
                .chars()
                .any(|character| character.is_ascii_alphabetic())
            || has_chinese(&translation.english_text)
        {
            add(
                "englishText",
                format!("{path}.englishText"),
                "Provide a nonempty English translation without Chinese text",
                false,
            );
        }
    }
    if require_complete {
        for path in fields
            .keys()
            .filter(|path| !matched.contains(path.as_str()))
        {
            add(
                "missing",
                "authoringPackage.englishTranslations".to_string(),
                &format!("Provide an English translation with the exact source text for {path}"),
                false,
            );
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::domain::{CandidatePreview, TaskPackage};

    #[test]
    fn legacy_serialization_and_candidate_preview_do_not_include_translations() {
        let mut package = TaskPackage::new("LI-TRANSLATIONS".to_string());
        let legacy = serde_json::to_value(&package).unwrap();
        assert_eq!(legacy["authoringPackage"], serde_json::json!({"notes": []}));
        let read: TaskPackage = serde_json::from_value(legacy.clone()).unwrap();
        assert!(read.authoring_package.english_translations.is_empty());
        assert_eq!(serde_json::to_value(read).unwrap(), legacy);
        package
            .authoring_package
            .english_translations
            .push(EnglishTranslation {
                path: "/prompt".to_string(),
                source_text: "问题".to_string(),
                english_text: "Private English translation".to_string(),
            });
        let preview = serde_json::to_value(CandidatePreview::from(&package)).unwrap();
        assert!(preview.get("authoringPackage").is_none());
        assert!(!preview.to_string().contains("Private English translation"));
        assert!(!preview.to_string().contains("englishTranslations"));
    }

    #[test]
    fn strict_generation_rejects_missing_stale_duplicate_and_non_english_translations() {
        let mut package = TaskPackage::new("LI-TRANSLATIONS".to_string());
        package
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "什么时候关门？".to_string();
        let translation = EnglishTranslation {
            path: "/prompt".to_string(),
            source_text: "什么时候关门？".to_string(),
            english_text: "When does it close?".to_string(),
        };
        assert!(
            validate_english_translations(
                &package.candidate_payload,
                std::slice::from_ref(&translation),
                true
            )
            .is_empty()
        );
        assert!(validate_english_translations(&package.candidate_payload, &[], false).is_empty());
        assert_eq!(
            validate_english_translations(&package.candidate_payload, &[], true)[0].code,
            "authoring.englishTranslation.missing"
        );
        let mut stale = translation.clone();
        stale.source_text = "旧问题".to_string();
        assert!(
            validate_english_translations(
                &package.candidate_payload,
                std::slice::from_ref(&stale),
                true
            )
            .iter()
            .all(|issue| issue.severity == "error")
        );
        assert_eq!(
            validate_english_translations(&package.candidate_payload, &[stale], false)[0].severity,
            "warning"
        );
        assert!(
            validate_english_translations(
                &package.candidate_payload,
                &[translation.clone(), translation.clone()],
                true
            )
            .iter()
            .any(|issue| issue.code.ends_with("duplicate"))
        );
        let mut untranslated = translation;
        untranslated.english_text = "什么时候关门？".to_string();
        assert!(
            validate_english_translations(&package.candidate_payload, &[untranslated], true)
                .iter()
                .any(|issue| issue.code.ends_with("englishText"))
        );
    }

    #[test]
    fn malformed_pointers_and_empty_sources_are_errors_even_on_editable_drafts() {
        let package = TaskPackage::new("LI-BAD-TRANSLATIONS".to_string());
        for path in ["prompt", "/", "/prompt~", "/prompt~2"] {
            let translation = EnglishTranslation {
                path: path.to_string(),
                source_text: " ".to_string(),
                english_text: "Question".to_string(),
            };
            let issues =
                validate_english_translations(&package.candidate_payload, &[translation], false);
            assert!(
                issues
                    .iter()
                    .any(|issue| issue.code.ends_with(".path") && issue.severity == "error")
            );
            assert!(
                issues
                    .iter()
                    .any(|issue| issue.code.ends_with(".sourceText") && issue.severity == "error")
            );
        }
    }

    #[test]
    fn text_field_allowlist_excludes_ids_media_and_escapes_profile_keys() {
        let mut package =
            TaskPackage::from_template("LI-PROFILE".to_string(), "writing-form-entry").unwrap();
        if let CandidatePayload::FormEntry(payload) = &mut package.candidate_payload {
            payload.source_profile = Some(
                serde_json::json!({"姓名/称呼~": "小王", "studentId": "学号", "photoRef": "https://example.test/photo.png", "age": "12"}),
            );
        }
        let fields = translation_source_fields(&package.candidate_payload);
        assert_eq!(
            fields
                .get("/sourceProfile/姓名~1称呼~0")
                .map(String::as_str),
            Some("小王")
        );
        assert_eq!(fields.len(), 1);
        let mut package =
            TaskPackage::from_template("LI-SPOKEN".to_string(), "speaking-multiturn").unwrap();
        if let CandidatePayload::SpokenMultiturn(payload) = &mut package.candidate_payload {
            payload.paths[0].turns[0].prompt_audio_ref =
                Some("https://example.test/question.mp3".to_string());
            payload.paths[0].turns[1].required_function_ids = vec!["PF-A1-001".to_string()];
        }
        let fields = translation_source_fields(&package.candidate_payload);
        assert!(!fields.keys().any(|path| path.contains("/paths/")));
    }
}
#[test]
fn generic_translation_sources_use_only_safe_human_fields() {
    let payload = CandidatePayload::ExerciseTemplate(
        crate::language_items::exercise_templates::ExerciseTemplateContent {
            exercise_type: "listening".into(),
            body: "请选择。".into(),
            data: serde_json::json!({"type":"listening","title":"上课时间","language":"zh-CN","audio":{"src":"/中文录音.mp3","alt":"听录音"},"transcript":"秘密答案","teacherNotes":"教师备注","questions":[{"prompt":"几点上课？","options":["九点","十点"],"correct":[0],"responseMode":"multiple","explanation":"私密解释"}]}),
        },
    );
    let fields = translation_source_fields(&payload);
    assert_eq!(fields.get("/body").map(String::as_str), Some("请选择。"));
    assert_eq!(
        fields
            .get("/data/questions/0/options/1")
            .map(String::as_str),
        Some("十点")
    );
    assert!(!fields.keys().any(|path| {
        [
            "src",
            "transcript",
            "teacherNotes",
            "correct",
            "responseMode",
            "explanation",
            "language",
        ]
        .iter()
        .any(|key| path.split('/').any(|segment| segment == *key))
    }));
    assert!(
        validate_english_translations(&payload, &[], true)
            .iter()
            .any(|issue| issue.code.ends_with("missing"))
    );
}
