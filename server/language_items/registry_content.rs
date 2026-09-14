use std::collections::{HashMap, HashSet};

use once_cell::sync::Lazy;
use serde_json::{Map, Value};

use super::{
    content_assessment::validate_assessment_rules,
    content_context::content_context_issues,
    registry::{ContentIdOption, GRAMMAR_REGISTRY, LEXICON_REGISTRY, RegistrySnapshot},
    registry_store::{RegistryValidationIssue, RegistryValidationResult},
};

pub fn content_language(content: &ContentIdOption) -> Option<&str> {
    match content.metadata.get("language") {
        // Existing published entries predate language metadata and assess Chinese.
        None => Some("zh"),
        Some(Value::String(language)) if ["zh", "en", "es"].contains(&language.as_str()) => {
            Some(language)
        }
        _ => None,
    }
}

pub fn content_supports_current_assessment(content: &ContentIdOption) -> bool {
    content_language(content).is_some()
}

pub fn content_matches_language(content: &ContentIdOption, language: &str) -> bool {
    content_language(content) == Some(language)
}

struct SeedContent {
    kind: &'static str,
    label: String,
    metadata: Map<String, Value>,
}

static SEED_METADATA: Lazy<HashMap<String, SeedContent>> = Lazy::new(|| {
    let mut result = HashMap::new();
    for (source, kind, id_key, label_key) in [
        (LEXICON_REGISTRY, "lexical", "lexicalId", "form"),
        (GRAMMAR_REGISTRY, "grammar", "grammarId", "function"),
    ] {
        // A YAML parser retains aliases, Unicode, quoted scalars and nested source
        // metadata; the historical published bundle parser is intentionally unchanged.
        let document: Value =
            serde_yaml_ng::from_str(source).expect("embedded content YAML is valid");
        for entry in document["entries"]
            .as_array()
            .expect("content entries are a list")
        {
            let mut metadata = entry
                .as_object()
                .expect("content entry is an object")
                .clone();
            let id = metadata
                .remove(id_key)
                .and_then(|v| v.as_str().map(str::to_owned))
                .expect("content entry ID");
            let label = metadata
                .remove(label_key)
                .and_then(|v| v.as_str().map(str::to_owned))
                .expect("content entry label");
            for key in ["canDoIds", "contextIds", "masteryScope"] {
                metadata.remove(key);
            }
            for (original, canonical) in [
                ("meaningInScope", "meaning"),
                ("pinyinInScope", "pinyin"),
                ("sourceIds", "sources"),
            ] {
                if let Some(value) = metadata.remove(original) {
                    metadata.insert(canonical.to_string(), value);
                }
            }
            result.insert(
                id,
                SeedContent {
                    kind,
                    label,
                    metadata,
                },
            );
        }
    }
    result
});

pub fn hydrate_draft_content_metadata(snapshot: &mut RegistrySnapshot) {
    for content in &mut snapshot.content_id_options {
        let Some(source) = SEED_METADATA.get(&content.id) else {
            continue;
        };
        if content.kind != source.kind
            || content.label != source.label
            || content_language(content) != Some("zh")
        {
            continue;
        }
        let mut value = serde_json::to_value(&*content).expect("language content serializes");
        let fields = value
            .as_object_mut()
            .expect("language content is an object");
        for (key, value) in &source.metadata {
            // Explicit empty values represent author decisions and must not be refilled.
            fields.entry(key.clone()).or_insert_with(|| value.clone());
        }
        *content =
            serde_json::from_value(value).expect("seed content metadata matches the contract");
    }
}

fn issue(
    issues: &mut Vec<RegistryValidationIssue>,
    code: &str,
    path: String,
    message: impl Into<String>,
) {
    issues.push(RegistryValidationIssue {
        severity: "error".to_string(),
        code: code.to_string(),
        path,
        message: message.into(),
    });
}

fn required_metadata(
    content: &ContentIdOption,
    previous: Option<&ContentIdOption>,
    saving: bool,
    index: usize,
    issues: &mut Vec<RegistryValidationIssue>,
) {
    let (field, value, old_value, code) = match content.kind.as_str() {
        "lexical" if content_language(content) != Some("en") => (
            "meaning",
            &content.meaning,
            previous.and_then(|old| old.meaning.as_ref()),
            "registry.contentMeaningRequired",
        ),
        "grammar" => (
            "pattern",
            &content.pattern,
            previous.and_then(|old| old.pattern.as_ref()),
            "registry.contentPatternRequired",
        ),
        _ => return,
    };
    // Old custom entries may be incomplete, including already saved drafts. A new
    // entry, or a previously completed field, cannot become incomplete on save.
    let required = saving && (previous.is_none() || old_value.is_some());
    if (required || value.is_some()) && value.as_ref().is_none_or(|text| text.trim().is_empty()) {
        issue(
            issues,
            code,
            format!("contentIdOptions.{index}.{field}"),
            format!("Language content “{}” requires {field}", content.label),
        );
    }
}

pub fn validate_language_content(
    snapshot: &RegistrySnapshot,
    previous: Option<&RegistrySnapshot>,
) -> RegistryValidationResult {
    let mut issues = Vec::new();
    let mut seen_ids = HashSet::new();
    let can_do_ids: HashSet<_> = snapshot
        .can_do_options
        .iter()
        .map(|entry| entry.id.as_str())
        .collect();
    let contexts: HashMap<_, _> = snapshot
        .context_options
        .iter()
        .map(|entry| (entry.id.as_str(), entry))
        .collect();
    let old: HashMap<_, _> = previous
        .into_iter()
        .flat_map(|value| &value.content_id_options)
        .map(|entry| (entry.id.as_str(), entry))
        .collect();
    for (index, content) in snapshot.content_id_options.iter().enumerate() {
        let path = format!("contentIdOptions.{index}");
        let before = old.get(content.id.as_str()).copied();
        if content.id.trim().is_empty() || content.id.trim() != content.id {
            issue(
                &mut issues,
                "registry.requiredId",
                format!("{path}.id"),
                "Language content requires a nonblank ID without surrounding spaces",
            );
        } else if !seen_ids.insert(content.id.as_str()) {
            issue(
                &mut issues,
                "registry.duplicateId",
                format!("{path}.id"),
                format!("Duplicate language content ID: {}", content.id),
            );
        }
        if content.label.trim().is_empty() {
            issue(
                &mut issues,
                "registry.contentLabelRequired",
                format!("{path}.label"),
                "Language content requires a name",
            );
        }
        if content_language(content).is_none() {
            issue(
                &mut issues,
                "registry.invalidContentLanguage",
                format!("{path}.language"),
                "Language must be Chinese (zh), English (en), or Spanish (es)",
            );
        } else if before.is_some_and(|entry| {
            content_language(entry).is_some()
                && content_language(entry) != content_language(content)
        }) {
            issue(
                &mut issues,
                "registry.contentLanguageImmutable",
                format!("{path}.language"),
                "An existing language content ID cannot change language; create a new entry instead",
            );
        }
        // A source vocabulary level is an author-supplied label, independent of
        // the A1 difficulty profiles and task compatibility rules.
        if content
            .level
            .as_deref()
            .is_some_and(|level| level.chars().any(char::is_control))
        {
            issue(
                &mut issues,
                "registry.invalidContentLevel",
                format!("{path}.level"),
                "Level must be a single-line text label without control characters",
            );
        }
        if !["lexical", "grammar", "character", "pragmatics", "supported"]
            .contains(&content.kind.as_str())
        {
            issue(
                &mut issues,
                "registry.invalidContentKind",
                format!("{path}.kind"),
                "Unknown language content category",
            );
        }
        if before.is_some_and(|entry| entry.kind != content.kind) {
            issue(
                &mut issues,
                "registry.contentKindImmutable",
                format!("{path}.kind"),
                "An existing language content ID cannot change category",
            );
        }
        if content.mastery_scope.as_deref().is_some_and(|scope| {
            !["receptive", "productive", "receptiveProductive"].contains(&scope)
        }) {
            issue(
                &mut issues,
                "registry.invalidContentMastery",
                format!("{path}.masteryScope"),
                "Mastery scope must be receptive, productive, receptiveProductive, or null for unrestricted",
            );
        }
        required_metadata(content, before, previous.is_some(), index, &mut issues);
        validate_assessment_rules(snapshot, content, index, previous.is_none(), &mut issues);
        for (field, message) in content_context_issues(content, snapshot) {
            issue(
                &mut issues,
                "registry.contentContextScope",
                format!("{path}.{field}"),
                message,
            );
        }
        for (field, ids) in [
            ("canDoIds", &content.can_do_ids),
            ("contextIds", &content.context_ids),
        ] {
            let mut seen = HashSet::new();
            for id in ids {
                if !seen.insert(id) {
                    issue(
                        &mut issues,
                        "registry.duplicateContentReference",
                        format!("{path}.{field}"),
                        format!("Repeated language content reference: {id}"),
                    );
                }
                if field == "canDoIds" && !can_do_ids.contains(id.as_str()) {
                    issue(
                        &mut issues,
                        "registry.unknownContentCanDo",
                        format!("{path}.{field}"),
                        format!("Unknown Can-do: {id}"),
                    );
                }
                if field == "contextIds" {
                    match contexts.get(id.as_str()) {
                        None => issue(
                            &mut issues,
                            "registry.unknownContentContext",
                            format!("{path}.{field}"),
                            format!("Unknown Context: {id}"),
                        ),
                        Some(context) if context.retired => issue(
                            &mut issues,
                            "registry.retiredContentContext",
                            format!("{path}.{field}"),
                            format!("Context “{}” is retired", context.label),
                        ),
                        _ => {}
                    }
                }
            }
        }
    }
    RegistryValidationResult {
        valid: issues.is_empty(),
        issues,
    }
}

#[cfg(test)]
mod tests {
    use super::super::registry::{
        hydrate_published_registry_snapshot, prepare_registry_draft, snapshot,
    };
    use super::*;

    #[test]
    fn legacy_content_roundtrip_and_published_reads_do_not_add_metadata() {
        let mut published = snapshot().clone();
        let original = serde_json::to_value(&published.content_id_options).unwrap();
        assert!(original[0].get("meaning").is_none());
        assert!(original[0].get("level").is_none());
        hydrate_published_registry_snapshot(&mut published);
        assert_eq!(
            original,
            serde_json::to_value(&published.content_id_options).unwrap()
        );
        let restored: Vec<ContentIdOption> = serde_json::from_value(original.clone()).unwrap();
        assert_eq!(original, serde_json::to_value(restored).unwrap());
    }

    #[test]
    fn multilingual_content_roundtrips_and_identical_forms_remain_separate_entries() {
        let before = snapshot().clone();
        let mut draft = before.clone();
        let original = &before.content_id_options[0];
        assert_eq!(content_language(original), Some("zh"));
        assert!(!original.metadata.contains_key("language"));
        for language in ["zh", "en", "es"] {
            let mut entry = original.clone();
            entry.id = format!("LEX-{language}-SHARED");
            entry.label = "a".into();
            entry.meaning = Some("A distinct language-specific entry".into());
            entry
                .metadata
                .insert("language".into(), serde_json::json!(language));
            entry
                .metadata
                .insert("sourceDetails".into(), serde_json::json!({"edition": 2}));
            draft.content_id_options.push(entry);
        }
        assert!(validate_language_content(&draft, Some(&before)).valid);
        let stored = serde_json::to_value(&draft).unwrap();
        let mut restored: RegistrySnapshot = serde_json::from_value(stored.clone()).unwrap();
        hydrate_published_registry_snapshot(&mut restored);
        assert_eq!(serde_json::to_value(&restored).unwrap(), stored);
        for entry in restored.content_id_options.iter().rev().take(3) {
            assert!(content_language(entry).is_some());
            assert_eq!(
                entry.metadata["sourceDetails"],
                serde_json::json!({"edition": 2})
            );
        }
    }

    #[test]
    fn language_metadata_rejects_invalid_values_and_changes_to_existing_identity() {
        let before = snapshot().clone();
        for language in [
            serde_json::json!("fr"),
            serde_json::json!(""),
            serde_json::json!(null),
            serde_json::json!(2),
            serde_json::json!(["en"]),
        ] {
            let mut draft = before.clone();
            draft.content_id_options[0]
                .metadata
                .insert("language".into(), language);
            for result in [
                validate_language_content(&draft, Some(&before)),
                validate_language_content(&draft, None),
            ] {
                assert!(result.issues.iter().any(|issue| {
                    issue.code == "registry.invalidContentLanguage"
                        && issue.path == "contentIdOptions.0.language"
                }));
            }
            assert!(!content_supports_current_assessment(
                &draft.content_id_options[0]
            ));
        }
        let mut draft = before.clone();
        draft.content_id_options[0]
            .metadata
            .insert("language".into(), serde_json::json!("zh"));
        assert!(validate_language_content(&draft, Some(&before)).valid);
        draft.content_id_options[0]
            .metadata
            .insert("language".into(), serde_json::json!("en"));
        assert!(
            validate_language_content(&draft, Some(&before))
                .issues
                .iter()
                .any(|issue| { issue.code == "registry.contentLanguageImmutable" })
        );
    }

    #[test]
    fn source_levels_roundtrip_without_rewriting_rules_or_unknown_metadata() {
        let before = snapshot().clone();
        for level in ["A2", "HSK3", "3", "", "Advanced / 高级"] {
            let mut stored = serde_json::to_value(&before).unwrap();
            stored["contentIdOptions"][0]["level"] = serde_json::json!(level);
            stored["contentIdOptions"][0]["sourceDetails"] =
                serde_json::json!({"edition": 3, "labels": ["original"]});
            let mut restored: RegistrySnapshot = serde_json::from_value(stored.clone()).unwrap();
            assert_eq!(restored.content_id_options[0].level.as_deref(), Some(level));
            assert!(
                !restored.content_id_options[0]
                    .metadata
                    .contains_key("level")
            );
            assert!(validate_language_content(&restored, Some(&before)).valid);
            assert_eq!(serde_json::to_value(&restored).unwrap(), stored);
            hydrate_published_registry_snapshot(&mut restored);
            assert_eq!(serde_json::to_value(&restored).unwrap(), stored);
            prepare_registry_draft(&mut restored);
            assert_eq!(restored.content_id_options[0].level.as_deref(), Some(level));
            assert_eq!(
                restored.content_id_options[0].metadata["sourceDetails"],
                stored["contentIdOptions"][0]["sourceDetails"]
            );
        }
    }

    #[test]
    fn invalid_source_levels_are_rejected_without_silently_coercing_values() {
        let before = snapshot().clone();
        for level in [
            serde_json::json!(2),
            serde_json::json!(["A2"]),
            serde_json::json!({"value": "A2"}),
        ] {
            let mut entry = serde_json::to_value(&before.content_id_options[0]).unwrap();
            entry["level"] = level;
            assert!(serde_json::from_value::<ContentIdOption>(entry).is_err());
        }
        for level in ["A2\nB1", "HSK\t3", "A2\u{0000}"] {
            let mut draft = before.clone();
            draft.content_id_options[0].level = Some(level.to_string());
            for result in [
                validate_language_content(&draft, Some(&before)),
                validate_language_content(&draft, None),
            ] {
                assert!(
                    result
                        .issues
                        .iter()
                        .any(|issue| issue.code == "registry.invalidContentLevel"
                            && issue.path == "contentIdOptions.0.level")
                );
            }
        }
    }

    #[test]
    fn new_drafts_hydrate_rich_seed_details_and_preserve_authored_metadata() {
        let mut draft = snapshot().clone();
        prepare_registry_draft(&mut draft);
        let lexical = draft
            .content_id_options
            .iter()
            .find(|entry| entry.id == "LEX-A1-0001")
            .unwrap();
        assert!(
            lexical
                .meaning
                .as_deref()
                .is_some_and(|value| !value.is_empty())
        );
        assert_eq!(lexical.pinyin.as_deref(), Some("nǐ hǎo"));
        assert_eq!(lexical.metadata["type"], "word");
        assert!(lexical.metadata["acceptedVariants"].is_array());
        let grammar = draft
            .content_id_options
            .iter_mut()
            .find(|entry| entry.id == "GR-A1-001")
            .unwrap();
        assert_eq!(grammar.pattern.as_deref(), Some("A 是 B"));
        assert_eq!(grammar.examples.as_ref().unwrap()[0], "我是学生。");
        assert!(grammar.metadata["triggerLexicalIds"].is_array());
        grammar.pattern = Some("自定义结构".to_string());
        grammar.examples = Some(Vec::new());
        grammar.restrictions = Some(String::new());
        grammar.metadata.insert(
            "extraSource".to_string(),
            serde_json::json!({"nested": ["source"]}),
        );
        let before = serde_json::to_value(&*grammar).unwrap();
        hydrate_draft_content_metadata(&mut draft);
        assert_eq!(
            before,
            serde_json::to_value(
                draft
                    .content_id_options
                    .iter()
                    .find(|entry| entry.id == "GR-A1-001")
                    .unwrap()
            )
            .unwrap()
        );
    }

    #[test]
    fn customized_labels_are_not_given_original_seed_meanings() {
        let mut draft = snapshot().clone();
        draft.content_id_options[0].label = "另一义项".to_string();
        let mut expected = draft.content_id_options[0].clone();
        // New drafts remove historical Context restrictions independently of metadata hydration.
        expected.context_ids.clear();
        prepare_registry_draft(&mut draft);
        assert_eq!(
            serde_json::to_value(expected).unwrap(),
            serde_json::to_value(&draft.content_id_options[0]).unwrap()
        );
    }

    #[test]
    fn new_content_requires_details_but_legacy_custom_entries_can_remain_incomplete() {
        let mut before = snapshot().clone();
        before.content_id_options[0].id = "CUSTOM-LEGACY".to_string();
        let mut draft = before.clone();
        draft.content_id_options[0].label = "Updated legacy entry".to_string();
        assert!(validate_language_content(&draft, Some(&before)).valid);
        let mut added = draft.content_id_options[0].clone();
        added.id = "CUSTOM-NEW".to_string();
        draft.content_id_options.push(added);
        assert!(
            validate_language_content(&draft, Some(&before))
                .issues
                .iter()
                .any(|issue| issue.code == "registry.contentMeaningRequired")
        );
        draft.content_id_options.last_mut().unwrap().meaning =
            Some("A limited meaning".to_string());
        assert!(validate_language_content(&draft, Some(&before)).valid);
        let saved = draft.clone();
        draft.content_id_options.last_mut().unwrap().meaning = None;
        assert!(!validate_language_content(&draft, Some(&saved)).valid);
    }

    #[test]
    fn english_vocabulary_can_be_saved_and_published_without_meaning() {
        let before = snapshot().clone();
        for meaning in [None, Some(""), Some("   "), Some("An optional definition")] {
            let mut draft = before.clone();
            let mut added = before.content_id_options[0].clone();
            added.id = "LEX-EN-OPTIONAL-MEANING".into();
            added.label = "about".into();
            added.meaning = meaning.map(str::to_owned);
            added
                .metadata
                .insert("language".into(), serde_json::json!("en"));
            draft.content_id_options.push(added);
            assert!(validate_language_content(&draft, Some(&before)).valid);
            assert!(validate_language_content(&draft, None).valid);
            let stored = serde_json::to_value(&draft).unwrap();
            let restored: RegistrySnapshot = serde_json::from_value(stored.clone()).unwrap();
            assert_eq!(serde_json::to_value(&restored).unwrap(), stored);

            let mut updated = draft.clone();
            updated.content_id_options.last_mut().unwrap().meaning = None;
            assert!(validate_language_content(&updated, Some(&draft)).valid);
            assert!(validate_language_content(&updated, None).valid);
        }
    }

    #[test]
    fn optional_english_meaning_does_not_relax_other_language_or_grammar_requirements() {
        let before = snapshot().clone();
        for language in [None, Some("zh"), Some("es")] {
            let mut draft = before.clone();
            let mut added = before.content_id_options[0].clone();
            added.id = "LEX-REQUIRES-MEANING".into();
            added.meaning = None;
            if let Some(language) = language {
                added
                    .metadata
                    .insert("language".into(), serde_json::json!(language));
            }
            draft.content_id_options.push(added);
            assert!(
                validate_language_content(&draft, Some(&before))
                    .issues
                    .iter()
                    .any(|issue| issue.code == "registry.contentMeaningRequired")
            );
        }
        let mut draft = before.clone();
        let mut added = before
            .content_id_options
            .iter()
            .find(|entry| entry.kind == "grammar")
            .unwrap()
            .clone();
        added.id = "GR-EN-REQUIRES-PATTERN".into();
        added.pattern = None;
        added
            .metadata
            .insert("language".into(), serde_json::json!("en"));
        draft.content_id_options.push(added);
        assert!(
            validate_language_content(&draft, Some(&before))
                .issues
                .iter()
                .any(|issue| issue.code == "registry.contentPatternRequired")
        );
    }

    #[test]
    fn content_validation_rejects_invalid_references_and_identity_without_other_draft_checks() {
        let before = snapshot().clone();
        let mut draft = before.clone();
        draft.capabilities.clear();
        assert!(validate_language_content(&draft, Some(&before)).valid);
        draft.content_id_options[0].kind = "grammar".to_string();
        draft.content_id_options[0].label.clear();
        draft.content_id_options[0].mastery_scope = Some("guess".to_string());
        draft.content_id_options[0].can_do_ids = vec!["missing".to_string()];
        draft.content_id_options[0].context_ids =
            vec!["missing".to_string(), draft.context_options[0].id.clone()];
        draft.context_options[0].retired = true;
        draft
            .content_id_options
            .push(draft.content_id_options[0].clone());
        let result = validate_language_content(&draft, Some(&before));
        for code in [
            "registry.contentKindImmutable",
            "registry.contentLabelRequired",
            "registry.invalidContentMastery",
            "registry.unknownContentCanDo",
            "registry.unknownContentContext",
            "registry.retiredContentContext",
            "registry.duplicateId",
        ] {
            assert!(
                result.issues.iter().any(|issue| issue.code == code),
                "missing {code}"
            );
        }
    }
}
