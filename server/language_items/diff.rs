use std::collections::BTreeSet;

use serde_json::Value;

use super::domain::{LanguageItemVersion, LanguageItemVersionDiff, TaskPackageChange};

const MAX_CHANGES: usize = 200;

pub fn diff_versions(
    version: &LanguageItemVersion,
    base: Option<&LanguageItemVersion>,
) -> LanguageItemVersionDiff {
    let Some(base) = base else {
        return LanguageItemVersionDiff {
            version_id: version.id.clone(),
            base_version_id: None,
            changes: vec![],
            truncated: false,
        };
    };
    let before = serde_json::to_value(&base.package).expect("TaskPackage serializes");
    let after = serde_json::to_value(&version.package).expect("TaskPackage serializes");
    let mut changes = vec![];
    diff_values("", Some(&before), Some(&after), &mut changes);
    let truncated = changes.len() >= MAX_CHANGES;
    LanguageItemVersionDiff {
        version_id: version.id.clone(),
        base_version_id: Some(base.id.clone()),
        changes,
        truncated,
    }
}

fn diff_values(
    path: &str,
    before: Option<&Value>,
    after: Option<&Value>,
    changes: &mut Vec<TaskPackageChange>,
) {
    if changes.len() >= MAX_CHANGES || before == after {
        return;
    }
    match (before, after) {
        (Some(Value::Object(before)), Some(Value::Object(after))) => {
            let keys = before
                .keys()
                .chain(after.keys())
                .map(String::as_str)
                .collect::<BTreeSet<_>>();
            for key in keys {
                if changes.len() >= MAX_CHANGES {
                    break;
                }
                let child_path = if path.is_empty() {
                    key.to_string()
                } else {
                    format!("{path}.{key}")
                };
                diff_values(&child_path, before.get(key), after.get(key), changes);
            }
        }
        (Some(Value::Array(before)), Some(Value::Array(after))) => {
            for index in 0..before.len().max(after.len()) {
                if changes.len() >= MAX_CHANGES {
                    break;
                }
                diff_values(
                    &format!("{path}[{index}]"),
                    before.get(index),
                    after.get(index),
                    changes,
                );
            }
        }
        _ => changes.push(TaskPackageChange {
            path: path.to_string(),
            partition: partition_for(path).to_string(),
            before: before.cloned(),
            after: after.cloned(),
        }),
    }
}

fn partition_for(path: &str) -> &'static str {
    match path.split(['.', '[']).next().unwrap_or_default() {
        "candidatePayload" => "candidate",
        "authoringPackage" => "authoring",
        "scoringPackage" => "scoring",
        "reviewPackage" => "review",
        _ => "contract",
    }
}

#[cfg(test)]
mod tests {
    use crate::language_items::{
        domain::{LanguageItemVersion, TaskPackage, task_package_hash},
        validation::validate_task_package,
    };

    use super::*;

    fn version(id: &str, version_number: u64, package: TaskPackage) -> LanguageItemVersion {
        LanguageItemVersion {
            id: id.to_string(),
            item_id: package.task_id.clone(),
            version_number,
            created_from_draft_revision: version_number,
            author_email: "author@example.test".to_string(),
            submitted_by: "author@example.test".to_string(),
            frozen: true,
            evidence_content_hash: Some(crate::language_items::evidence::evidence_content_hash(
                &package,
            )),
            content_hash: task_package_hash(&package),
            lifecycle_status: "submitted".to_string(),
            validation: validate_task_package(&package),
            package,
            created_at: "2026-09-04T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn reports_partitioned_leaf_changes_between_frozen_versions() {
        let mut before_package = TaskPackage::new("LI-DIFF".to_string());
        before_package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .prompt = "旧题干".to_string();
        before_package.authoring_package.notes = vec!["旧备注".to_string()];
        let before = version("LIV-DIFF-1", 1, before_package.clone());

        let mut after_package = before_package;
        after_package
            .candidate_payload
            .as_single_select_mut()
            .expect("default is single select")
            .prompt = "新题干".to_string();
        after_package.authoring_package.notes[0] = "新备注".to_string();
        after_package.scoring_package.correct_option_id = Some("B".to_string());
        let after = version("LIV-DIFF-2", 2, after_package);

        let diff = diff_versions(&after, Some(&before));
        assert_eq!(diff.base_version_id.as_deref(), Some("LIV-DIFF-1"));
        assert!(!diff.truncated);
        assert!(diff.changes.iter().any(|change| {
            change.path == "candidatePayload.prompt" && change.partition == "candidate"
        }));
        assert!(diff.changes.iter().any(|change| {
            change.path == "authoringPackage.notes[0]" && change.partition == "authoring"
        }));
        assert!(diff.changes.iter().any(|change| {
            change.path == "scoringPackage.correctOptionId" && change.partition == "scoring"
        }));
        assert!(diff.changes.iter().all(|change| change.path != "taskId"));
    }

    #[test]
    fn first_version_has_no_synthetic_changes() {
        let version = version("LIV-FIRST", 1, TaskPackage::new("LI-FIRST".to_string()));
        let diff = diff_versions(&version, None);
        assert!(diff.base_version_id.is_none());
        assert!(diff.changes.is_empty());
        assert!(!diff.truncated);
    }
}
