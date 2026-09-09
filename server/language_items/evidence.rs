use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::domain::{TaskPackage, task_package_hash};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum LanguageRelation {
    Unknown,
    Understanding,
    RequiredProduction,
    Opportunity,
    Supporting,
    NotDemonstrated,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TargetEvidence {
    pub target_content_id: String,
    pub relation: LanguageRelation,
    pub evidence: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SourceUsage {
    Original,
    Authorized,
    Unverified,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EvidenceSource {
    pub title: String,
    pub url: String,
    pub usage: SourceUsage,
    pub notes: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemEvidence {
    pub id: String,
    pub item_id: String,
    pub content_hash: String,
    pub registry_version: String,
    pub reviewed_by: String,
    pub created_at: String,
    pub targets: Vec<TargetEvidence>,
    pub sources: Vec<EvidenceSource>,
    pub quality_notes: String,
    pub originality_notes: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveEvidence {
    pub expected_revision: u64,
    pub targets: Vec<TargetEvidence>,
    pub sources: Vec<EvidenceSource>,
    pub quality_notes: String,
    pub originality_notes: String,
}

pub fn validate_evidence(input: &SaveEvidence, package: &TaskPackage) -> Result<(), String> {
    if input.targets.len() > 100 || input.sources.len() > 20 {
        return Err("Too many language observations or sources in one review.".into());
    }
    let allowed: HashSet<&str> = package
        .content
        .target_content_ids
        .iter()
        .chain(&package.content.supporting_content_refs)
        .map(String::as_str)
        .collect();
    let mut seen = HashSet::new();
    for entry in &input.targets {
        if !allowed.contains(entry.target_content_id.as_str())
            || !seen.insert(&entry.target_content_id)
        {
            return Err(
                "Each language point must belong to this item and appear only once.".into(),
            );
        }
        if entry.evidence.len() > 4000
            || (entry.relation != LanguageRelation::Unknown && entry.evidence.trim().is_empty())
        {
            return Err("Explain each confirmed language relationship (up to 4,000 bytes).".into());
        }
    }
    for source in &input.sources {
        if source.title.trim().is_empty()
            || source.title.len() > 500
            || source.notes.len() > 4000
            || source.url.len() > 2000
        {
            return Err(
                "Provide a source title and keep source details within their limits.".into(),
            );
        }
        if !source.url.is_empty() {
            let url = url::Url::parse(&source.url)
                .map_err(|_| "Source links must be valid HTTP or HTTPS URLs.")?;
            if !matches!(url.scheme(), "http" | "https")
                || !url.username().is_empty()
                || url.password().is_some()
            {
                return Err(
                    "Source links must use HTTP or HTTPS without embedded credentials.".into(),
                );
            }
        }
        if source.usage == SourceUsage::Authorized && source.notes.trim().is_empty() {
            return Err(
                "Describe the permission and permitted use for authorized material.".into(),
            );
        }
    }
    if input.quality_notes.len() > 8000 || input.originality_notes.len() > 8000 {
        return Err("Review notes must be no longer than 8,000 bytes each.".into());
    }
    Ok(())
}

pub fn evidence_is_current(record: &ItemEvidence, package: &TaskPackage) -> bool {
    record.content_hash == evidence_content_hash(package)
        && record.registry_version == package.spec_versions.registry_bundle_version
}

pub fn evidence_content_hash(package: &TaskPackage) -> String {
    let mut reviewed = package.clone();
    // Freezing and review bookkeeping must not change what the author assessed.
    reviewed.task_version = "evidence".into();
    reviewed.review_package = Default::default();
    task_package_hash(&reviewed)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn package() -> TaskPackage {
        let mut package = TaskPackage::new("LI-EVIDENCE-TEST".into());
        package.content.target_content_ids = vec!["LEX-TEST".into()];
        package
    }

    fn input(package: &TaskPackage) -> SaveEvidence {
        SaveEvidence {
            expected_revision: 1,
            targets: vec![TargetEvidence {
                target_content_id: package.content.target_content_ids[0].clone(),
                relation: LanguageRelation::Understanding,
                evidence: "The answer depends on the notice's closing day.".into(),
            }],
            sources: vec![],
            quality_notes: String::new(),
            originality_notes: String::new(),
        }
    }

    #[test]
    fn language_confirmation_requires_an_existing_target_and_explanation() {
        let package = package();
        let mut review = input(&package);
        assert!(validate_evidence(&review, &package).is_ok());
        review.targets[0].evidence.clear();
        assert!(validate_evidence(&review, &package).is_err());
        review.targets[0].relation = LanguageRelation::Unknown;
        assert!(validate_evidence(&review, &package).is_ok());
        review.targets[0].target_content_id = "not-this-item".into();
        assert!(validate_evidence(&review, &package).is_err());
    }

    #[test]
    fn edited_content_invalidates_previous_confirmation() {
        let package = package();
        let record = ItemEvidence {
            id: "E1".into(),
            item_id: package.task_id.clone(),
            content_hash: evidence_content_hash(&package),
            registry_version: package.spec_versions.registry_bundle_version.clone(),
            reviewed_by: "author@example.com".into(),
            created_at: String::new(),
            targets: vec![],
            sources: vec![],
            quality_notes: String::new(),
            originality_notes: String::new(),
        };
        assert!(evidence_is_current(&record, &package));
        let mut changed = package;
        changed
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "新的问题".into();
        assert!(!evidence_is_current(&record, &changed));
    }

    #[test]
    fn freezing_preserves_evidence_but_changed_targets_do_not() {
        let package = package();
        let hash = evidence_content_hash(&package);
        let mut frozen = package.clone();
        frozen.task_version = "3".into();
        assert_eq!(hash, evidence_content_hash(&frozen));
        assert_ne!(task_package_hash(&package), task_package_hash(&frozen));
        frozen.content.target_content_ids.push("LEX-CHANGED".into());
        assert_ne!(hash, evidence_content_hash(&frozen));
    }

    #[test]
    fn review_bookkeeping_preserves_evidence_without_weakening_package_integrity() {
        let package = package();
        let mut reviewed = package.clone();
        reviewed.review_package.gates.insert(
            "languageReview".into(),
            serde_json::json!({ "decision": "approved", "comment": "Author reviewed this task." }),
        );
        assert_eq!(
            evidence_content_hash(&package),
            evidence_content_hash(&reviewed)
        );
        assert_ne!(task_package_hash(&package), task_package_hash(&reviewed));
    }

    #[test]
    fn answer_or_context_changes_invalidate_evidence_even_when_wording_is_unchanged() {
        let package = package();
        let hash = evidence_content_hash(&package);
        let mut changed_answer = package.clone();
        changed_answer.scoring_package.correct_option_id = Some("changed-answer".into());
        assert_ne!(hash, evidence_content_hash(&changed_answer));
        let mut changed_context = package;
        changed_context.content.context_id = "changed-context".into();
        assert_ne!(hash, evidence_content_hash(&changed_context));
    }

    #[test]
    fn source_links_cannot_execute_code_or_hide_credentials() {
        let package = package();
        let mut review = input(&package);
        review.sources.push(EvidenceSource {
            title: "Source".into(),
            url: "javascript:alert(1)".into(),
            usage: SourceUsage::Unverified,
            notes: String::new(),
        });
        assert!(validate_evidence(&review, &package).is_err());
        review.sources[0].url = "https://example.org/reference".into();
        review.sources[0].usage = SourceUsage::Authorized;
        assert!(validate_evidence(&review, &package).is_err());
        review.sources[0].notes =
            "Original material supplied by the author for this examination.".into();
        assert!(validate_evidence(&review, &package).is_ok());
    }
}
