use std::collections::HashSet;

use serde_json::Value;

use super::registry::{ContentIdOption, RegistrySnapshot};

fn mode(content: &ContentIdOption) -> Option<&str> {
    match content.metadata.get("contextScopeMode") {
        None => Some(if content.context_ids.is_empty() {
            "all"
        } else {
            "selected"
        }),
        Some(Value::String(value)) if ["all", "selected"].contains(&value.as_str()) => Some(value),
        _ => None,
    }
}

fn exclusions(content: &ContentIdOption) -> Option<Vec<&str>> {
    match content.metadata.get("excludedContextIds") {
        None => Some(Vec::new()),
        Some(Value::Array(values)) => values.iter().map(Value::as_str).collect(),
        _ => None,
    }
}

pub fn content_context_matches(content: &ContentIdOption, context_id: &str) -> bool {
    let Some(excluded) = exclusions(content) else {
        return false;
    };
    // An exercise without a predefined Context cannot claim that a scoped
    // language entry is eligible. Only completely unrestricted entries apply.
    if context_id.is_empty() {
        return mode(content) == Some("all")
            && content.context_ids.is_empty()
            && excluded.is_empty();
    }
    match mode(content) {
        Some("all") => content.context_ids.is_empty() && !excluded.contains(&context_id),
        Some("selected") => {
            excluded.is_empty() && content.context_ids.iter().any(|id| id == context_id)
        }
        _ => false,
    }
}

pub fn content_context_issues(
    content: &ContentIdOption,
    snapshot: &RegistrySnapshot,
) -> Vec<(&'static str, String)> {
    let mut issues = Vec::new();
    let mode = mode(content);
    if mode.is_none() {
        issues.push((
            "contextScopeMode",
            "Context scope must be all or selected.".into(),
        ));
    }
    let Some(excluded) = exclusions(content) else {
        issues.push((
            "excludedContextIds",
            "Excluded Contexts must be an array of Context IDs.".into(),
        ));
        return issues;
    };
    if mode == Some("all") && !content.context_ids.is_empty() {
        issues.push((
            "contextIds",
            "All Contexts cannot also specify an inclusion list.".into(),
        ));
    }
    if mode == Some("selected") && !excluded.is_empty() {
        issues.push((
            "excludedContextIds",
            "Selected Contexts cannot also specify exclusions.".into(),
        ));
    }
    let mut seen = HashSet::new();
    for id in excluded {
        if !seen.insert(id) {
            issues.push((
                "excludedContextIds",
                format!("Repeated excluded Context: {id}"),
            ));
        }
        if !snapshot
            .context_options
            .iter()
            .any(|context| context.id == id)
        {
            issues.push((
                "excludedContextIds",
                format!("Unknown excluded Context: {id}"),
            ));
        }
    }
    issues
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::registry::snapshot;
    use serde_json::json;

    #[test]
    fn legacy_empty_remains_all_while_selected_empty_means_none() {
        let mut entry = snapshot().content_id_options[0].clone();
        entry.context_ids.clear();
        assert!(content_context_matches(&entry, "D09"));
        entry
            .metadata
            .insert("contextScopeMode".into(), json!("selected"));
        assert!(!content_context_matches(&entry, "D09"));
        assert!(content_context_issues(&entry, snapshot()).is_empty());
        let saved: ContentIdOption =
            serde_json::from_value(serde_json::to_value(entry).unwrap()).unwrap();
        assert!(!content_context_matches(&saved, "D09"));
    }

    #[test]
    fn one_context_exclusion_preserves_other_and_future_contexts() {
        let mut entry = snapshot().content_id_options[0].clone();
        entry.context_ids.clear();
        entry
            .metadata
            .insert("contextScopeMode".into(), json!("all"));
        entry
            .metadata
            .insert("excludedContextIds".into(), json!(["D09"]));
        assert!(!content_context_matches(&entry, "D09"));
        assert!(content_context_matches(&entry, "D14"));
        assert!(content_context_matches(&entry, "future-context"));
        assert!(content_context_issues(&entry, snapshot()).is_empty());
    }

    #[test]
    fn malformed_and_conflicting_scopes_are_rejected() {
        let mut entry = snapshot().content_id_options[0].clone();
        entry.context_ids = vec!["D09".into()];
        entry
            .metadata
            .insert("contextScopeMode".into(), json!("all"));
        assert!(!content_context_issues(&entry, snapshot()).is_empty());
        assert!(!content_context_matches(&entry, "D09"));
        entry.context_ids.clear();
        entry
            .metadata
            .insert("excludedContextIds".into(), json!([4]));
        assert!(!content_context_issues(&entry, snapshot()).is_empty());
        assert!(!content_context_matches(&entry, "D09"));
        entry
            .metadata
            .insert("excludedContextIds".into(), json!(["missing", "missing"]));
        assert_eq!(content_context_issues(&entry, snapshot()).len(), 3);
    }
}
