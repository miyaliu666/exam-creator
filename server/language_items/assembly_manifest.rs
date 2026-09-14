use serde::Serialize;

use super::{
    domain::{
        DeliveryPolicyRefs, LanguageItemRecordState, LanguageItemVersion, RendererRef,
        SpecVersions, task_package_hash,
    },
    registry::{RegistrySnapshot, capability_for, difficulty_standards_for_capability},
    version_usage::UsageState,
};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyReference {
    pub id: String,
    pub label: Option<String>,
}

fn reference(id: &str, label: Option<&str>) -> AssemblyReference {
    AssemblyReference {
        id: id.to_string(),
        label: label.filter(|value| !value.is_empty()).map(str::to_string),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblySource {
    pub item_id: String,
    pub version_id: String,
    pub version_number: u64,
    pub content_hash: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyScoring {
    pub item_scoring_version: String,
    pub contract: AssemblyReference,
    pub contract_version: String,
    pub max_raw_score: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssemblyManifest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    pub manifest_version: String,
    pub scope: String,
    pub delivery_integration: String,
    pub source: AssemblySource,
    pub spec_versions: SpecVersions,
    pub item_rule: AssemblyReference,
    pub task_family: AssemblyReference,
    pub item_format: AssemblyReference,
    pub renderer: RendererRef,
    pub primary_can_do: AssemblyReference,
    pub primary_reported_skill: String,
    pub communicative_activity: String,
    pub domain: String,
    pub context: AssemblyReference,
    pub intended_difficulty: AssemblyReference,
    pub targets: Vec<AssemblyReference>,
    pub supporting_content: Vec<AssemblyReference>,
    pub scoring: AssemblyScoring,
    pub delivery_policy_refs: DeliveryPolicyRefs,
    pub approved: bool,
    pub record_state: LanguageItemRecordState,
    pub use_state: UsageState,
    pub usage_revision: u64,
    pub available_for_pilot_assembly: bool,
    pub available_for_live_assembly: bool,
}

pub fn build_assembly_manifest(
    version: &LanguageItemVersion,
    registry: &RegistrySnapshot,
    approved: bool,
    record_state: LanguageItemRecordState,
    use_state: UsageState,
    usage_revision: u64,
) -> Result<AssemblyManifest, String> {
    let package = &version.package;
    if !version.frozen || task_package_hash(package) != version.content_hash {
        return Err("Assembly preparation requires an intact frozen version.".into());
    }
    if package.spec_versions.registry_bundle_version != registry.bundle_version {
        return Err("Assembly metadata must use the version's pinned Assessment Settings.".into());
    }
    let capability = capability_for(
        registry,
        &package.item_rule_id,
        &package.item_format_id,
        Some(&package.content.primary_can_do_id),
    );
    let content_reference = |id: &String| {
        reference(
            id,
            registry
                .content_id_options
                .iter()
                .find(|entry| &entry.id == id)
                .map(|entry| entry.label.as_str()),
        )
    };
    let ready = approved && record_state == LanguageItemRecordState::Active;
    // This allowlist is intentionally independent of TaskPackage serialization: answers and author notes never enter assembly metadata.
    Ok(AssemblyManifest {
        language: package.content.language.clone(),
        manifest_version: "1".into(),
        scope: "workbenchPreparation".into(),
        delivery_integration: "notConnected".into(),
        source: AssemblySource {
            item_id: version.item_id.clone(),
            version_id: version.id.clone(),
            version_number: version.version_number,
            content_hash: version.content_hash.clone(),
        },
        spec_versions: package.spec_versions.clone(),
        item_rule: reference(
            &package.item_rule_id,
            capability.map(|entry| entry.title.as_str()),
        ),
        task_family: reference(
            &package.task_family_id,
            registry
                .task_family_options
                .iter()
                .find(|entry| entry.id == package.task_family_id)
                .map(|entry| entry.display_name.as_str()),
        ),
        item_format: reference(
            &package.item_format_id,
            registry
                .reference_labels
                .iter()
                .find(|entry| entry.id == package.item_format_id)
                .map(|entry| entry.display_name.as_str()),
        ),
        renderer: package.renderer.clone(),
        primary_can_do: reference(
            &package.content.primary_can_do_id,
            registry
                .can_do_options
                .iter()
                .find(|entry| entry.id == package.content.primary_can_do_id)
                .map(|entry| entry.label.as_str()),
        ),
        primary_reported_skill: package.content.primary_reported_skill.clone(),
        communicative_activity: package.content.communicative_activity.clone(),
        domain: package.content.primary_domain.clone(),
        context: reference(
            &package.content.context_id,
            registry
                .context_options
                .iter()
                .find(|entry| entry.id == package.content.context_id)
                .map(|entry| entry.label.as_str()),
        ),
        intended_difficulty: reference(
            &package.content.difficulty_band,
            capability
                .and_then(|capability| {
                    difficulty_standards_for_capability(registry, capability)
                        .iter()
                        .find(|entry| entry.id == package.content.difficulty_band)
                })
                .map(|entry| entry.label.as_str()),
        ),
        targets: package
            .content
            .target_content_ids
            .iter()
            .map(content_reference)
            .collect(),
        supporting_content: package
            .content
            .supporting_content_refs
            .iter()
            .map(content_reference)
            .collect(),
        scoring: AssemblyScoring {
            item_scoring_version: package.scoring_package.item_scoring_version.clone(),
            contract: reference(
                &package.scoring_package.scoring_contract_template_id,
                registry
                    .scoring_contracts
                    .iter()
                    .find(|entry| {
                        entry.scoring_contract_template_id
                            == package.scoring_package.scoring_contract_template_id
                    })
                    .map(|entry| entry.display_name.as_str()),
            ),
            contract_version: package
                .scoring_package
                .scoring_contract_template_version
                .clone(),
            max_raw_score: package.scoring_package.max_raw_score,
        },
        delivery_policy_refs: package.delivery_policy_refs.clone(),
        approved,
        record_state,
        use_state,
        usage_revision,
        available_for_pilot_assembly: ready && use_state == UsageState::Pilot,
        available_for_live_assembly: ready && use_state == UsageState::Live,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::language_items::{
        domain::{TaskPackage, ValidationResult},
        registry::snapshot,
    };

    fn version() -> LanguageItemVersion {
        let mut package = TaskPackage::new("LI-assembly".into());
        package.task_version = "3".into();
        package.content.target_content_ids = vec!["LEX-GOODBYE".into()];
        package
            .authoring_package
            .notes
            .push("PRIVATE-AUTHOR-NOTE".into());
        package.scoring_package.correct_option_id = Some("PRIVATE-ANSWER".into());
        package
            .candidate_payload
            .as_single_select_mut()
            .unwrap()
            .prompt = "CANDIDATE-TEXT".into();
        LanguageItemVersion {
            id: "LIV-assembly-3".into(),
            item_id: "LI-assembly".into(),
            version_number: 3,
            created_from_draft_revision: 8,
            author_email: "private@example.test".into(),
            submitted_by: "private@example.test".into(),
            frozen: true,
            content_hash: task_package_hash(&package),
            evidence_content_hash: None,
            lifecycle_status: "approved".into(),
            package,
            validation: ValidationResult {
                valid: true,
                registry_bundle_version: snapshot().bundle_version.clone(),
                issues: vec![],
            },
            created_at: "2026-09-12T00:00:00Z".into(),
        }
    }

    #[test]
    fn manifest_contains_frozen_dimensions_without_candidate_or_author_content() {
        let version = version();
        let manifest = build_assembly_manifest(
            &version,
            snapshot(),
            true,
            LanguageItemRecordState::Active,
            UsageState::Pilot,
            2,
        )
        .unwrap();
        let json = serde_json::to_string(&manifest).unwrap();
        for secret in [
            "PRIVATE-AUTHOR-NOTE",
            "PRIVATE-ANSWER",
            "CANDIDATE-TEXT",
            "private@example.test",
            "candidatePayload",
            "authoringPackage",
            "correctOptionId",
            "reviewPackage",
        ] {
            assert!(!json.contains(secret), "manifest leaked {secret}");
        }
        assert_eq!(manifest.source.version_id, version.id);
        assert_eq!(manifest.source.content_hash, version.content_hash);
        assert_eq!(manifest.targets[0].id, "LEX-GOODBYE");
        assert_eq!(
            manifest.spec_versions.registry_bundle_version,
            version.package.spec_versions.registry_bundle_version
        );
        assert_eq!(manifest.delivery_integration, "notConnected");
        assert!(manifest.language.is_none());
        let mut english = version.clone();
        english.package.content.language = Some("en".into());
        english.content_hash = task_package_hash(&english.package);
        let manifest = build_assembly_manifest(
            &english,
            snapshot(),
            true,
            LanguageItemRecordState::Active,
            UsageState::Pilot,
            2,
        )
        .unwrap();
        assert_eq!(manifest.language.as_deref(), Some("en"));
        assert_eq!(manifest.source.content_hash, english.content_hash);
    }

    #[test]
    fn workbench_availability_requires_approval_active_record_and_matching_use() {
        for state in [
            UsageState::Unreleased,
            UsageState::Pilot,
            UsageState::Live,
            UsageState::Suspended,
            UsageState::Retired,
        ] {
            for approved in [false, true] {
                for record in [
                    LanguageItemRecordState::Active,
                    LanguageItemRecordState::Archived,
                    LanguageItemRecordState::Deleted,
                ] {
                    let result =
                        build_assembly_manifest(&version(), snapshot(), approved, record, state, 4)
                            .unwrap();
                    assert_eq!(
                        result.available_for_pilot_assembly,
                        approved
                            && record == LanguageItemRecordState::Active
                            && state == UsageState::Pilot
                    );
                    assert_eq!(
                        result.available_for_live_assembly,
                        approved
                            && record == LanguageItemRecordState::Active
                            && state == UsageState::Live
                    );
                }
            }
        }
    }

    #[test]
    fn manifest_rejects_wrong_registry_unfrozen_and_corrupt_versions() {
        let mut source = version();
        let mut registry = snapshot().clone();
        registry.bundle_version = "unrelated-new-settings".into();
        assert!(
            build_assembly_manifest(
                &source,
                &registry,
                true,
                LanguageItemRecordState::Active,
                UsageState::Pilot,
                0
            )
            .is_err()
        );
        source.frozen = false;
        assert!(
            build_assembly_manifest(
                &source,
                snapshot(),
                true,
                LanguageItemRecordState::Active,
                UsageState::Pilot,
                0
            )
            .is_err()
        );
        source.frozen = true;
        source.package.content.context_id = "modified".into();
        assert!(
            build_assembly_manifest(
                &source,
                snapshot(),
                true,
                LanguageItemRecordState::Active,
                UsageState::Pilot,
                0
            )
            .is_err()
        );
    }
}
