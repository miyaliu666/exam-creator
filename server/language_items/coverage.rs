use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CoverageScope {
    #[default]
    Approved,
    Drafts,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CoverageRole {
    #[default]
    Core,
    Supporting,
    Either,
    Confirmed,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CoverageMatch {
    #[default]
    All,
    Any,
    Exact,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoverageFilters {
    pub skill: Option<String>,
    pub activity: Option<String>,
    pub domain: Option<String>,
    pub context_id: Option<String>,
    pub blueprint_slot_id: Option<String>,
    pub primary_can_do_id: Option<String>,
    pub difficulty_band: Option<String>,
    pub item_format_id: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CoverageRequest {
    #[serde(default)]
    pub scope: CoverageScope,
    pub registry_version: Option<String>,
    #[serde(default)]
    pub role: CoverageRole,
    #[serde(default)]
    pub selected_ids: Vec<String>,
    #[serde(default)]
    pub excluded_ids: Vec<String>,
    #[serde(default)]
    pub match_mode: CoverageMatch,
    #[serde(default)]
    pub filters: CoverageFilters,
    pub desired_count: Option<usize>,
    pub pattern: Option<Vec<String>>,
    #[serde(default)]
    pub offset: usize,
    pub limit: Option<usize>,
    #[serde(default)]
    pub include_overview: bool,
}

/// Only metadata is projected from MongoDB; candidate, answer, and reviewer content never enters analytics.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageMetadata {
    #[serde(default)]
    pub registry_version: String,
    #[serde(default)]
    pub blueprint_slot_id: String,
    #[serde(default)]
    pub item_format_id: String,
    #[serde(default)]
    pub primary_can_do_id: String,
    #[serde(default)]
    pub skill: String,
    #[serde(default)]
    pub activity: String,
    #[serde(default)]
    pub activities: Vec<String>,
    #[serde(default)]
    pub domain: String,
    #[serde(default)]
    pub context_id: String,
    #[serde(default)]
    pub difficulty_band: String,
    pub core_ids: Option<Vec<String>>,
    pub supporting_ids: Option<Vec<String>>,
    pub confirmed_ids: Option<Vec<String>>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageVersion {
    pub id: String,
    pub version_number: u64,
    #[serde(default)]
    pub lifecycle_status: String,
    pub metadata: CoverageMetadata,
    #[serde(default)]
    pub evidence: Vec<CoverageEvidence>,
    #[serde(default)]
    pub gate_decisions: Vec<CoverageGateDecision>,
    #[serde(default)]
    pub unresolved_requests: Vec<String>,
    #[serde(default)]
    pub approved: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageGateDecision {
    pub gate_id: String,
    pub decision: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageEvidence {
    pub targets: Vec<CoverageEvidenceTarget>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageEvidenceTarget {
    pub target_content_id: String,
    pub relation: String,
}

pub fn confirmed_references(
    metadata: &CoverageMetadata,
    evidence: Option<&CoverageEvidence>,
) -> Option<Vec<String>> {
    let evidence = evidence?;
    let core = metadata.core_ids.as_ref()?;
    // Partial reviews cannot establish that a missing point was assessed or absent from an exact set.
    if !core.iter().all(|id| {
        evidence.targets.iter().any(|target| {
            &target.target_content_id == id
                && matches!(
                    target.relation.as_str(),
                    "understanding"
                        | "requiredProduction"
                        | "opportunity"
                        | "supporting"
                        | "notDemonstrated"
                )
        })
    }) {
        return None;
    }
    Some(
        evidence
            .targets
            .iter()
            .filter(|target| {
                core.contains(&target.target_content_id)
                    && matches!(
                        target.relation.as_str(),
                        "understanding" | "requiredProduction"
                    )
            })
            .map(|target| target.target_content_id.clone())
            .collect(),
    )
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageItem {
    pub id: String,
    pub title: String,
    pub status: String,
    pub draft: CoverageMetadata,
    #[serde(default)]
    pub versions: Vec<CoverageVersion>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageItemSummary {
    pub id: String,
    pub title: String,
    pub version_id: Option<String>,
    pub scope: CoverageScope,
    pub status: String,
    pub metadata: CoverageMetadata,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageCount {
    pub id: String,
    pub count: usize,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageSetupCount {
    pub filters: CoverageFilters,
    pub approved_count: usize,
    pub pending_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoveragePattern {
    pub present_ids: Vec<String>,
    pub count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageGoal {
    pub desired_count: usize,
    pub approved_count: usize,
    pub pending_count: usize,
    pub approved_unknown_count: usize,
    pub pending_unknown_count: usize,
    pub unfilled_count: usize,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageOverviewEntry {
    pub id: String,
    pub planned_count: usize,
    pub confirmed_count: usize,
    pub pending_count: usize,
}

#[derive(Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageOverview {
    pub approved_item_count: usize,
    pub pending_item_count: usize,
    pub planned_unknown_count: usize,
    pub confirmed_unknown_count: usize,
    pub pending_unknown_count: usize,
    pub entries: Vec<CoverageOverviewEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageResponse {
    pub registry_version: String,
    pub available_registry_versions: Vec<String>,
    pub scope: CoverageScope,
    pub scoped_count: usize,
    pub known_count: usize,
    pub unknown_count: usize,
    pub matched_count: usize,
    pub pending_count: usize,
    pub approved_unknown_count: usize,
    pub pending_unknown_count: usize,
    pub term_counts: Vec<CoverageCount>,
    pub patterns: Vec<CoveragePattern>,
    pub breakdowns: BTreeMap<String, Vec<CoverageCount>>,
    pub setup_counts: Vec<CoverageSetupCount>,
    pub goal: Option<CoverageGoal>,
    pub items: Vec<CoverageItemSummary>,
    pub offset: usize,
    pub limit: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub overview: Option<CoverageOverview>,
}

pub fn approved_version(item: &CoverageItem) -> Option<&CoverageVersion> {
    item.versions
        .iter()
        .filter(|version| version.approved)
        .max_by_key(|version| version.version_number)
}

pub fn version_is_approved(version: &CoverageVersion, required_gates: Option<&[String]>) -> bool {
    if !version.unresolved_requests.is_empty()
        || version
            .gate_decisions
            .iter()
            .any(|decision| decision.decision != "approved")
    {
        return false;
    }
    version.lifecycle_status == "approved"
        || required_gates.is_some_and(|gates| {
            !gates.is_empty()
                && gates.iter().all(|gate| {
                    version.gate_decisions.iter().any(|decision| {
                        &decision.gate_id == gate && decision.decision == "approved"
                    })
                })
        })
}

fn dimensions_match(metadata: &CoverageMetadata, filters: &CoverageFilters) -> bool {
    [
        (&filters.skill, &metadata.skill),
        (&filters.domain, &metadata.domain),
        (&filters.context_id, &metadata.context_id),
        (&filters.blueprint_slot_id, &metadata.blueprint_slot_id),
        (&filters.primary_can_do_id, &metadata.primary_can_do_id),
        (&filters.difficulty_band, &metadata.difficulty_band),
        (&filters.item_format_id, &metadata.item_format_id),
    ]
    .into_iter()
    .all(|(expected, actual)| expected.as_ref().is_none_or(|value| value == actual))
        && filters.activity.as_ref().is_none_or(|activity| {
            &metadata.activity == activity || metadata.activities.contains(activity)
        })
}

fn references(metadata: &CoverageMetadata, role: &CoverageRole) -> Option<BTreeSet<String>> {
    match role {
        CoverageRole::Core => metadata
            .core_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect()),
        CoverageRole::Supporting => metadata
            .supporting_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect()),
        CoverageRole::Either => Some(
            metadata
                .core_ids
                .as_ref()?
                .iter()
                .chain(metadata.supporting_ids.as_ref()?)
                .cloned()
                .collect(),
        ),
        CoverageRole::Confirmed => metadata
            .confirmed_ids
            .as_ref()
            .map(|ids| ids.iter().cloned().collect()),
    }
}

fn passes_exclusions(ids: &BTreeSet<String>, excluded_ids: &[String]) -> bool {
    !excluded_ids.iter().any(|id| ids.contains(id))
}

fn content_matches(ids: &BTreeSet<String>, request: &CoverageRequest) -> bool {
    if !passes_exclusions(ids, &request.excluded_ids) {
        return false;
    }
    let selected: BTreeSet<_> = request.selected_ids.iter().cloned().collect();
    if let Some(pattern) = &request.pattern {
        let present: BTreeSet<_> = pattern.iter().cloned().collect();
        return ids
            .intersection(&selected)
            .cloned()
            .collect::<BTreeSet<_>>()
            == present;
    }
    match request.match_mode {
        CoverageMatch::All => selected.is_subset(ids),
        CoverageMatch::Any => selected.is_empty() || !selected.is_disjoint(ids),
        CoverageMatch::Exact => *ids == selected,
    }
}

fn inventory(items: &[CoverageItem], scope: &CoverageScope) -> Vec<CoverageItemSummary> {
    items
        .iter()
        .filter_map(|item| match scope {
            CoverageScope::Approved => approved_version(item).map(|version| CoverageItemSummary {
                id: item.id.clone(),
                title: item.title.clone(),
                version_id: Some(version.id.clone()),
                scope: CoverageScope::Approved,
                status: "approved".to_string(),
                metadata: version.metadata.clone(),
            }),
            CoverageScope::Drafts
                if !matches!(
                    item.status.as_str(),
                    "approved" | "approvedForExport" | "exportedToStaging"
                ) =>
            {
                Some(CoverageItemSummary {
                    id: item.id.clone(),
                    title: item.title.clone(),
                    version_id: None,
                    scope: CoverageScope::Drafts,
                    status: item.status.clone(),
                    metadata: item.draft.clone(),
                })
            }
            CoverageScope::Drafts => None,
        })
        .collect()
}

fn coverage_overview<'a>(
    approved: impl Iterator<Item = &'a CoverageItemSummary>,
    pending: impl Iterator<Item = &'a CoverageItemSummary>,
) -> CoverageOverview {
    let mut overview = CoverageOverview::default();
    let mut entries: BTreeMap<String, [usize; 3]> = BTreeMap::new();
    let mut count_targets = |ids: &Option<Vec<String>>, column: usize| {
        let Some(ids) = ids else {
            return 1;
        };
        for id in ids.iter().collect::<BTreeSet<_>>() {
            entries.entry(id.clone()).or_default()[column] += 1;
        }
        0
    };
    for item in approved {
        overview.approved_item_count += 1;
        overview.planned_unknown_count += count_targets(&item.metadata.core_ids, 0);
        overview.confirmed_unknown_count += count_targets(&item.metadata.confirmed_ids, 1);
    }
    for item in pending {
        overview.pending_item_count += 1;
        overview.pending_unknown_count += count_targets(&item.metadata.core_ids, 2);
    }
    overview.entries = entries
        .into_iter()
        .map(
            |(id, [planned_count, confirmed_count, pending_count])| CoverageOverviewEntry {
                id,
                planned_count,
                confirmed_count,
                pending_count,
            },
        )
        .collect();
    overview
}

fn coverage_setup_counts<'a>(
    approved: impl Iterator<Item = &'a CoverageItemSummary>,
    pending: impl Iterator<Item = &'a CoverageItemSummary>,
    filters: &CoverageFilters,
) -> Vec<CoverageSetupCount> {
    let mut counts: BTreeMap<[String; 6], [usize; 2]> = BTreeMap::new();
    for (item, column) in approved
        .map(|item| (item, 0))
        .chain(pending.map(|item| (item, 1)))
    {
        let metadata = &item.metadata;
        let setup = [
            metadata.blueprint_slot_id.clone(),
            metadata.item_format_id.clone(),
            metadata.primary_can_do_id.clone(),
            metadata.domain.clone(),
            metadata.context_id.clone(),
            metadata.difficulty_band.clone(),
        ];
        counts.entry(setup).or_default()[column] += 1;
    }
    counts
        .into_iter()
        .map(|(setup, [approved_count, pending_count])| {
            let [
                blueprint_slot_id,
                item_format_id,
                primary_can_do_id,
                domain,
                context_id,
                difficulty_band,
            ] = setup;
            CoverageSetupCount {
                filters: CoverageFilters {
                    // Keep the query's activity membership: substituting the primary activity could broaden a drilldown.
                    skill: filters.skill.clone(),
                    activity: filters.activity.clone(),
                    blueprint_slot_id: Some(blueprint_slot_id),
                    item_format_id: Some(item_format_id),
                    primary_can_do_id: Some(primary_can_do_id),
                    domain: Some(domain),
                    context_id: Some(context_id),
                    difficulty_band: Some(difficulty_band),
                },
                approved_count,
                pending_count,
            }
        })
        .collect()
}

pub fn analyze_coverage(
    items: &[CoverageItem],
    request: &CoverageRequest,
    registry_version: &str,
) -> CoverageResponse {
    let approved = inventory(items, &CoverageScope::Approved);
    let pending = inventory(items, &CoverageScope::Drafts);
    let available_registry_versions = approved
        .iter()
        .chain(&pending)
        .map(|item| item.metadata.registry_version.clone())
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect();
    let in_scope = |item: &&CoverageItemSummary| {
        item.metadata.registry_version == registry_version
            && dimensions_match(&item.metadata, &request.filters)
    };
    // Overview describes the inventory behind a query, so language selections and pagination cannot narrow it.
    let overview = request.include_overview.then(|| {
        coverage_overview(
            approved.iter().filter(in_scope),
            pending.iter().filter(in_scope),
        )
    });
    let matching = |item: &&CoverageItemSummary| {
        in_scope(item)
            && references(&item.metadata, &request.role)
                .is_some_and(|ids| content_matches(&ids, request))
    };
    let setup_counts = coverage_setup_counts(
        approved.iter().filter(matching),
        pending.iter().filter(matching),
        &request.filters,
    );
    let pending_count = setup_counts.iter().map(|setup| setup.pending_count).sum();
    let approved_count = setup_counts.iter().map(|setup| setup.approved_count).sum();
    let unknown_in_scope = |item: &&CoverageItemSummary| {
        in_scope(item) && references(&item.metadata, &request.role).is_none()
    };
    let pending_unknown_count = pending.iter().filter(unknown_in_scope).count();
    let approved_unknown_count = approved.iter().filter(unknown_in_scope).count();
    let source = if request.scope == CoverageScope::Approved {
        &approved
    } else {
        &pending
    };
    let scoped: Vec<_> = source.iter().filter(in_scope).collect();
    let known: Vec<_> = scoped
        .iter()
        .filter_map(|item| references(&item.metadata, &request.role).map(|ids| (*item, ids)))
        .collect();
    // Counts retain exclusions so selecting a pattern preserves its displayed item count.
    let counted: Vec<_> = known
        .iter()
        .filter(|(_, ids)| passes_exclusions(ids, &request.excluded_ids))
        .collect();
    let selected: BTreeSet<_> = request.selected_ids.iter().cloned().collect();
    let term_counts = selected
        .iter()
        .map(|id| CoverageCount {
            id: id.clone(),
            count: counted.iter().filter(|(_, ids)| ids.contains(id)).count(),
        })
        .collect();
    let mut pattern_counts: BTreeMap<Vec<String>, usize> = BTreeMap::new();
    for (_, ids) in &counted {
        // Selected-point matching must not remove alternative patterns or the all-absent row.
        *pattern_counts
            .entry(ids.intersection(&selected).cloned().collect())
            .or_default() += 1;
    }
    let patterns = pattern_counts
        .into_iter()
        .map(|(present_ids, count)| CoveragePattern { present_ids, count })
        .collect();
    let mut matched: Vec<_> = known
        .iter()
        .filter(|(_, ids)| content_matches(ids, request))
        .map(|(item, _)| (*item).clone())
        .collect();
    matched.sort_by(|left, right| left.id.cmp(&right.id));
    let mut dimensions: BTreeMap<String, BTreeMap<String, usize>> = BTreeMap::new();
    for item in &matched {
        let metadata = &item.metadata;
        for (key, value) in [
            ("skill", &metadata.skill),
            ("domain", &metadata.domain),
            ("contextId", &metadata.context_id),
            ("blueprintSlotId", &metadata.blueprint_slot_id),
            ("primaryCanDoId", &metadata.primary_can_do_id),
            ("difficultyBand", &metadata.difficulty_band),
            ("itemFormatId", &metadata.item_format_id),
        ] {
            *dimensions
                .entry(key.to_string())
                .or_default()
                .entry(value.clone())
                .or_default() += 1;
        }
        let activities = metadata
            .activities
            .iter()
            .chain(std::iter::once(&metadata.activity))
            .filter(|value| !value.is_empty())
            .collect::<BTreeSet<_>>();
        if activities.is_empty() {
            *dimensions
                .entry("activity".to_string())
                .or_default()
                .entry(String::new())
                .or_default() += 1;
        } else {
            for activity in activities {
                *dimensions
                    .entry("activity".to_string())
                    .or_default()
                    .entry(activity.clone())
                    .or_default() += 1;
            }
        }
    }
    let breakdowns = dimensions
        .into_iter()
        .map(|(key, values)| {
            (
                key,
                values
                    .into_iter()
                    .map(|(id, count)| CoverageCount { id, count })
                    .collect(),
            )
        })
        .collect();
    let matched_count = matched.len();
    let limit = request.limit.unwrap_or(50).clamp(1, 200);
    let goal = request.desired_count.map(|desired_count| CoverageGoal {
        desired_count,
        approved_count,
        pending_count,
        approved_unknown_count,
        pending_unknown_count,
        unfilled_count: desired_count.saturating_sub(approved_count),
    });
    CoverageResponse {
        registry_version: registry_version.to_string(),
        available_registry_versions,
        scope: request.scope.clone(),
        scoped_count: scoped.len(),
        known_count: known.len(),
        unknown_count: scoped.len() - known.len(),
        matched_count,
        pending_count,
        approved_unknown_count,
        pending_unknown_count,
        term_counts,
        patterns,
        breakdowns,
        setup_counts,
        goal,
        items: matched
            .into_iter()
            .skip(request.offset)
            .take(limit)
            .collect(),
        offset: request.offset,
        limit,
        overview,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: usize, targets: Option<Vec<&str>>, approved: bool) -> CoverageItem {
        let metadata = CoverageMetadata {
            registry_version: "v1".to_string(),
            skill: "Reading".to_string(),
            context_id: "shop".to_string(),
            core_ids: targets.map(|values| values.iter().map(|value| value.to_string()).collect()),
            supporting_ids: Some(vec![]),
            ..Default::default()
        };
        CoverageItem {
            id: id.to_string(),
            title: format!("Item {id}"),
            status: if approved {
                "approvedForExport"
            } else {
                "draft"
            }
            .to_string(),
            draft: metadata.clone(),
            versions: vec![CoverageVersion {
                id: format!("version-{id}"),
                version_number: 1,
                lifecycle_status: "approved".to_string(),
                metadata,
                evidence: vec![],
                gate_decisions: vec![],
                unresolved_requests: vec![],
                approved,
            }],
        }
    }

    fn setup_item(id: usize, targets: Option<Vec<&str>>, approved: bool) -> CoverageItem {
        let mut value = item(id, targets, approved);
        let metadata = CoverageMetadata {
            blueprint_slot_id: "R1".into(),
            item_format_id: "single".into(),
            primary_can_do_id: "read-notice".into(),
            activity: "Reception".into(),
            domain: "Public".into(),
            difficulty_band: "TypicalA1".into(),
            ..value.draft.clone()
        };
        value.draft = metadata.clone();
        value.versions[0].metadata = metadata;
        value
    }

    #[test]
    fn setup_counts_keep_every_dimension_joint_and_count_both_inventories_before_pagination() {
        let mut items = Vec::new();
        for dimension in 0..7 {
            for index in 0..5 {
                let mut value = setup_item(dimension * 5 + index, Some(vec!["A"]), index < 3);
                let metadata = &mut value.draft;
                match dimension {
                    1 => metadata.blueprint_slot_id = "R2".into(),
                    2 => metadata.item_format_id = "matching".into(),
                    3 => metadata.primary_can_do_id = "read-instruction".into(),
                    4 => metadata.domain = "Personal".into(),
                    5 => metadata.context_id = "school".into(),
                    6 => metadata.difficulty_band = "UpperA1".into(),
                    _ => (),
                }
                value.versions[0].metadata = value.draft.clone();
                items.push(value);
            }
        }
        let request = CoverageRequest {
            selected_ids: vec!["A".into()],
            offset: 10,
            limit: Some(1),
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.matched_count, 21);
        assert_eq!(result.pending_count, 14);
        assert_eq!(result.setup_counts.len(), 7);
        for setup in &result.setup_counts {
            assert_eq!((setup.approved_count, setup.pending_count), (3, 2));
            for (scope, count) in [(CoverageScope::Approved, 3), (CoverageScope::Drafts, 2)] {
                let drilled = analyze_coverage(
                    &items,
                    &CoverageRequest {
                        scope,
                        filters: setup.filters.clone(),
                        offset: 0,
                        ..request.clone()
                    },
                    "v1",
                );
                assert_eq!(drilled.matched_count, count);
                assert_eq!(drilled.setup_counts.len(), 1);
            }
        }
        items.reverse();
        let drafts = analyze_coverage(
            &items,
            &CoverageRequest {
                scope: CoverageScope::Drafts,
                ..request
            },
            "v1",
        );
        assert_eq!(drafts.setup_counts, result.setup_counts);
    }

    #[test]
    fn setup_counts_apply_language_matching_exclusions_and_active_patterns_to_both_inventories() {
        let mut items = Vec::new();
        for (index, targets) in [
            Some(vec!["A"]),
            Some(vec!["A", "B"]),
            Some(vec!["A", "B", "C"]),
            Some(vec!["A", "X"]),
            Some(vec!["B"]),
            Some(vec![]),
            None,
        ]
        .into_iter()
        .enumerate()
        {
            items.push(setup_item(index, targets.clone(), true));
            items.push(setup_item(index + 10, targets, false));
        }
        for (match_mode, pattern, expected) in [
            (CoverageMatch::All, None, 2),
            (CoverageMatch::Any, None, 4),
            (CoverageMatch::Exact, None, 1),
            (CoverageMatch::All, Some(vec!["A".into()]), 1),
            (CoverageMatch::All, Some(vec!["A".into(), "B".into()]), 2),
            (CoverageMatch::Any, Some(vec![]), 1),
        ] {
            let request = CoverageRequest {
                selected_ids: vec!["A".into(), "B".into()],
                excluded_ids: vec!["X".into()],
                match_mode,
                pattern,
                ..Default::default()
            };
            let result = analyze_coverage(&items, &request, "v1");
            assert_eq!(result.setup_counts.len(), 1);
            let setup = &result.setup_counts[0];
            assert_eq!(result.matched_count, expected);
            assert_eq!(
                (setup.approved_count, setup.pending_count),
                (expected, expected)
            );
            assert_eq!(
                (result.approved_unknown_count, result.pending_unknown_count),
                (1, 1)
            );
        }
        let absent = analyze_coverage(
            &items,
            &CoverageRequest {
                selected_ids: vec!["absent".into()],
                ..Default::default()
            },
            "v1",
        );
        assert!(absent.setup_counts.is_empty());
    }

    #[test]
    fn setup_counts_keep_latest_approved_setup_separate_from_current_revision() {
        let mut value = setup_item(1, Some(vec!["A"]), true);
        let mut latest = value.versions[0].clone();
        latest.version_number = 2;
        latest.metadata.context_id = "school".into();
        latest.metadata.difficulty_band = "LowerA1".into();
        value.versions.push(latest.clone());
        let mut unapproved = latest;
        unapproved.version_number = 3;
        unapproved.approved = false;
        unapproved.metadata.context_id = "unapproved-version".into();
        value.versions.push(unapproved);
        value.status = "readyForReview".into();
        value.draft.difficulty_band = "UpperA1".into();
        let request = CoverageRequest {
            selected_ids: vec!["A".into()],
            ..Default::default()
        };
        let result = analyze_coverage(&[value.clone()], &request, "v1");
        assert_eq!(result.setup_counts.len(), 2);
        let approved = result
            .setup_counts
            .iter()
            .find(|setup| setup.approved_count == 1)
            .unwrap();
        assert_eq!(approved.filters.context_id.as_deref(), Some("school"));
        assert_eq!(approved.filters.difficulty_band.as_deref(), Some("LowerA1"));
        assert_eq!(approved.pending_count, 0);
        let pending = result
            .setup_counts
            .iter()
            .find(|setup| setup.pending_count == 1)
            .unwrap();
        assert_eq!(pending.filters.context_id.as_deref(), Some("shop"));
        assert_eq!(pending.filters.difficulty_band.as_deref(), Some("UpperA1"));
        assert_eq!(pending.approved_count, 0);
        value.draft.registry_version = "v2".into();
        assert_eq!(
            analyze_coverage(&[value.clone()], &request, "v1").setup_counts,
            vec![CoverageSetupCount {
                filters: approved.filters.clone(),
                approved_count: 1,
                pending_count: 0,
            }]
        );
        let v2 = analyze_coverage(&[value], &request, "v2");
        assert_eq!(v2.setup_counts.len(), 1);
        assert_eq!(
            (
                v2.setup_counts[0].approved_count,
                v2.setup_counts[0].pending_count
            ),
            (0, 1)
        );
    }

    #[test]
    fn setup_drilldown_preserves_secondary_activity_and_exact_empty_setup_fields() {
        let mut first = setup_item(1, Some(vec!["A"]), true);
        first.versions[0].metadata.activities = vec!["Mediation".into(), "Mediation".into()];
        first.versions[0].metadata.domain.clear();
        let mut second = first.clone();
        second.id = "2".into();
        second.versions[0].metadata.activity = "Production".into();
        let mut wrong_activity = first.clone();
        wrong_activity.id = "3".into();
        wrong_activity.versions[0].metadata.activities.clear();
        let mut other_domain = first.clone();
        other_domain.id = "4".into();
        other_domain.versions[0].metadata.domain = "Public".into();
        let items = [first, second, wrong_activity, other_domain];
        let request = CoverageRequest {
            filters: CoverageFilters {
                skill: Some("Reading".into()),
                activity: Some("Mediation".into()),
                ..Default::default()
            },
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(result.matched_count, 3);
        assert_eq!(result.setup_counts.len(), 2);
        let setup = result
            .setup_counts
            .iter()
            .find(|setup| setup.filters.domain.as_deref() == Some(""))
            .unwrap();
        assert_eq!(setup.approved_count, 2);
        assert_eq!(setup.filters.skill, request.filters.skill);
        assert_eq!(setup.filters.activity, request.filters.activity);
        assert_eq!(
            analyze_coverage(
                &items,
                &CoverageRequest {
                    filters: setup.filters.clone(),
                    ..request
                },
                "v1"
            )
            .matched_count,
            setup.approved_count
        );
    }

    #[test]
    fn setup_counts_apply_every_inventory_filter_and_report_both_unknown_inventories() {
        let mut approved = setup_item(1, None, true);
        approved.versions[0].metadata.activities = vec!["Mediation".into()];
        let mut pending = setup_item(2, None, false);
        pending.draft.activities = vec!["Mediation".into()];
        let mut known_approved = approved.clone();
        known_approved.id = "3".into();
        known_approved.versions[0].metadata.core_ids = Some(vec!["A".into()]);
        let mut known_pending = pending.clone();
        known_pending.id = "4".into();
        known_pending.draft.core_ids = Some(vec!["A".into()]);
        let items = [approved, pending, known_approved, known_pending];
        let filters = CoverageFilters {
            skill: Some("Reading".into()),
            activity: Some("Mediation".into()),
            blueprint_slot_id: Some("R1".into()),
            item_format_id: Some("single".into()),
            primary_can_do_id: Some("read-notice".into()),
            domain: Some("Public".into()),
            context_id: Some("shop".into()),
            difficulty_band: Some("TypicalA1".into()),
        };
        let request = CoverageRequest {
            scope: CoverageScope::Drafts,
            filters: filters.clone(),
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(result.setup_counts.len(), 1);
        assert_eq!(
            (
                result.setup_counts[0].approved_count,
                result.setup_counts[0].pending_count
            ),
            (1, 1)
        );
        assert_eq!(
            (result.approved_unknown_count, result.pending_unknown_count),
            (1, 1)
        );
        for key in [
            "skill",
            "activity",
            "blueprintSlotId",
            "itemFormatId",
            "primaryCanDoId",
            "domain",
            "contextId",
            "difficultyBand",
        ] {
            let mut changed = serde_json::to_value(&filters).unwrap();
            changed[key] = serde_json::json!("different");
            let narrowed = CoverageRequest {
                filters: serde_json::from_value(changed).unwrap(),
                ..request.clone()
            };
            let result = analyze_coverage(&items, &narrowed, "v1");
            assert!(result.setup_counts.is_empty());
            assert_eq!(
                (result.approved_unknown_count, result.pending_unknown_count),
                (0, 0)
            );
        }
        let serialized = serde_json::to_value(result).unwrap();
        assert_eq!(serialized["approvedUnknownCount"], 1);
        assert_eq!(
            serialized["setupCounts"],
            serde_json::json!([{
                "filters": filters, "approvedCount": 1, "pendingCount": 1,
            }])
        );
    }

    #[test]
    fn intersections_partition_items_without_counting_repeated_ids() {
        let items: Vec<_> = (0..25)
            .map(|id| {
                item(
                    id,
                    Some(if id < 5 {
                        vec!["A", "A"]
                    } else if id < 10 {
                        vec!["A", "B"]
                    } else {
                        vec!["B"]
                    }),
                    true,
                )
            })
            .collect();
        let request = CoverageRequest {
            selected_ids: vec!["A".to_string(), "B".to_string()],
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(result.matched_count, 5);
        assert_eq!(
            result
                .term_counts
                .iter()
                .map(|term| term.count)
                .collect::<Vec<_>>(),
            vec![10, 20]
        );
        assert_eq!(
            result
                .patterns
                .iter()
                .map(|pattern| pattern.count)
                .sum::<usize>(),
            25
        );
        let union = analyze_coverage(
            &items,
            &CoverageRequest {
                match_mode: CoverageMatch::Any,
                ..request
            },
            "v1",
        );
        assert_eq!(union.matched_count, 25);
    }

    #[test]
    fn latest_approved_version_survives_new_draft_and_new_unapproved_version() {
        let mut approved = item(1, Some(vec!["old"]), true);
        let mut newest = approved.versions[0].clone();
        newest.id = "pending-version".to_string();
        newest.version_number = 2;
        newest.approved = false;
        newest.metadata.core_ids = Some(vec!["new".to_string()]);
        approved.versions.push(newest);
        approved.status = "draft".to_string();
        approved.draft.core_ids = Some(vec!["new".to_string()]);
        let request = CoverageRequest {
            selected_ids: vec!["old".to_string()],
            ..Default::default()
        };
        let result = analyze_coverage(&[approved], &request, "v1");
        assert_eq!(result.matched_count, 1);
        assert_eq!(result.items[0].version_id.as_deref(), Some("version-1"));
        assert_eq!(result.pending_count, 0);
    }

    #[test]
    fn unknown_is_neither_empty_set_nor_false_absence_and_pending_is_separate() {
        let items = vec![
            item(1, None, true),
            item(2, Some(vec![]), true),
            item(3, Some(vec!["A"]), false),
        ];
        let request = CoverageRequest {
            desired_count: Some(3),
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(
            (
                result.scoped_count,
                result.known_count,
                result.unknown_count,
                result.matched_count,
                result.pending_count
            ),
            (2, 1, 1, 1, 1)
        );
        assert_eq!(
            result
                .patterns
                .iter()
                .map(|pattern| pattern.count)
                .sum::<usize>(),
            1
        );
        assert_eq!(result.goal.unwrap().unfilled_count, 2);
    }

    #[test]
    fn full_set_and_selected_pattern_are_different_and_filters_change_denominator() {
        let mut other = item(2, Some(vec!["A"]), true);
        other.versions[0].metadata.context_id = "school".to_string();
        let items = vec![item(1, Some(vec!["A", "B", "C"]), true), other];
        let request = CoverageRequest {
            selected_ids: vec!["A".to_string(), "B".to_string()],
            match_mode: CoverageMatch::Exact,
            filters: CoverageFilters {
                context_id: Some("shop".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };
        let exact = analyze_coverage(&items, &request, "v1");
        assert_eq!((exact.scoped_count, exact.matched_count), (1, 0));
        let pattern = analyze_coverage(
            &items,
            &CoverageRequest {
                pattern: Some(vec!["A".to_string(), "B".to_string()]),
                ..request
            },
            "v1",
        );
        assert_eq!(pattern.matched_count, 1);
        assert_eq!(pattern.breakdowns["contextId"][0].count, 1);
    }

    #[test]
    fn latest_approved_inventory_does_not_resurrect_old_registry_snapshot() {
        let mut value = item(1, Some(vec!["A"]), true);
        let mut next = value.versions[0].clone();
        next.version_number = 2;
        next.metadata.registry_version = "v2".to_string();
        value.versions.push(next);
        assert_eq!(
            analyze_coverage(&[value], &CoverageRequest::default(), "v1").scoped_count,
            0
        );
    }

    #[test]
    fn incomplete_or_opportunity_evidence_is_not_confirmed_assessment() {
        let value = item(1, Some(vec!["A", "B"]), true);
        let mut evidence = CoverageEvidence {
            targets: vec![CoverageEvidenceTarget {
                target_content_id: "A".to_string(),
                relation: "understanding".to_string(),
            }],
        };
        assert!(confirmed_references(&value.draft, None).is_none());
        assert!(confirmed_references(&value.draft, Some(&evidence)).is_none());
        evidence.targets.push(CoverageEvidenceTarget {
            target_content_id: "B".to_string(),
            relation: "opportunity".to_string(),
        });
        assert_eq!(
            confirmed_references(&value.draft, Some(&evidence)),
            Some(vec!["A".to_string()])
        );
    }

    #[test]
    fn supporting_activity_can_be_filtered_without_double_counting_item() {
        let mut value = item(1, Some(vec!["A"]), true);
        value.versions[0].metadata.activity = "Reception".to_string();
        value.versions[0].metadata.activities =
            vec!["Reception".to_string(), "Mediation".to_string()];
        let request = CoverageRequest {
            filters: CoverageFilters {
                activity: Some("Mediation".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };
        let result = analyze_coverage(&[value], &request, "v1");
        assert_eq!(result.matched_count, 1);
        assert_eq!(
            result.breakdowns["activity"]
                .iter()
                .map(|entry| entry.count)
                .collect::<Vec<_>>(),
            vec![1, 1]
        );
    }

    #[test]
    fn incomplete_confirmations_and_pending_drafts_remain_unknown_in_goal_insights() {
        let mut reviewed = item(1, Some(vec!["A", "B"]), true);
        let evidence = CoverageEvidence {
            targets: vec![
                CoverageEvidenceTarget {
                    target_content_id: "A".into(),
                    relation: "requiredProduction".into(),
                },
                CoverageEvidenceTarget {
                    target_content_id: "B".into(),
                    relation: "opportunity".into(),
                },
            ],
        };
        reviewed.versions[0].metadata.confirmed_ids =
            confirmed_references(&reviewed.draft, Some(&evidence));
        let items = vec![
            reviewed,
            item(2, Some(vec!["A"]), true),
            item(3, Some(vec!["A"]), false),
        ];
        let request = CoverageRequest {
            role: CoverageRole::Confirmed,
            selected_ids: vec!["A".into()],
            desired_count: Some(4),
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(
            (
                result.matched_count,
                result.unknown_count,
                result.pending_count,
                result.pending_unknown_count
            ),
            (1, 1, 0, 1)
        );
        let goal = result.goal.unwrap();
        assert_eq!(
            (
                goal.approved_count,
                goal.approved_unknown_count,
                goal.pending_unknown_count,
                goal.unfilled_count
            ),
            (1, 1, 1, 3)
        );
        let opportunity = analyze_coverage(
            &items,
            &CoverageRequest {
                selected_ids: vec!["B".into()],
                ..request
            },
            "v1",
        );
        assert_eq!(opportunity.matched_count, 0);
        assert_eq!(opportunity.unknown_count, 1);
    }

    #[test]
    fn eight_selected_points_support_exclusions_and_disjoint_pattern_drilldown() {
        let selected = vec![
            "word-1",
            "word-2",
            "word-3",
            "word-4",
            "word-5",
            "grammar-1",
            "grammar-2",
            "grammar-3",
        ];
        let mut extra = selected.clone();
        extra.push("excluded");
        let items = vec![
            item(1, Some(selected.clone()), true),
            item(2, Some(extra), true),
            item(3, Some(vec!["word-1"]), true),
            item(4, Some(vec![]), true),
            item(5, None, true),
        ];
        let request = CoverageRequest {
            selected_ids: selected.iter().map(|id| id.to_string()).collect(),
            excluded_ids: vec!["excluded".into()],
            ..Default::default()
        };
        let result = analyze_coverage(&items, &request, "v1");
        assert_eq!(
            (
                result.scoped_count,
                result.known_count,
                result.unknown_count,
                result.matched_count
            ),
            (5, 4, 1, 1)
        );
        assert_eq!(
            result
                .patterns
                .iter()
                .map(|pattern| pattern.count)
                .sum::<usize>(),
            3
        );
        let any = analyze_coverage(
            &items,
            &CoverageRequest {
                match_mode: CoverageMatch::Any,
                ..request.clone()
            },
            "v1",
        );
        assert_eq!(any.matched_count, 2);
        let none = analyze_coverage(
            &items,
            &CoverageRequest {
                pattern: Some(vec![]),
                ..request
            },
            "v1",
        );
        assert_eq!(none.matched_count, 1);
        assert_eq!(none.items[0].id, "4");
    }

    #[test]
    fn excluded_targets_apply_to_counts_and_every_pattern_matches_its_drilldown() {
        let mut items = vec![
            item(1, Some(vec!["A", "B", "C"]), true),
            item(2, Some(vec!["A", "B", "X"]), true),
            item(3, Some(vec!["A"]), true),
            item(4, Some(vec!["B"]), true),
            item(5, Some(vec![]), true),
            item(6, None, true),
        ];
        for item in &mut items {
            item.versions[0].metadata.supporting_ids = item.draft.core_ids.clone();
            item.versions[0].metadata.confirmed_ids = item.draft.core_ids.clone();
        }
        for role in [
            CoverageRole::Core,
            CoverageRole::Supporting,
            CoverageRole::Either,
            CoverageRole::Confirmed,
        ] {
            for match_mode in [CoverageMatch::All, CoverageMatch::Any, CoverageMatch::Exact] {
                let request = CoverageRequest {
                    role: role.clone(),
                    match_mode,
                    selected_ids: vec!["A".into(), "B".into()],
                    excluded_ids: vec!["X".into()],
                    ..Default::default()
                };
                let result = analyze_coverage(&items, &request, "v1");
                assert_eq!(
                    (
                        result.scoped_count,
                        result.known_count,
                        result.unknown_count
                    ),
                    (6, 5, 1)
                );
                assert_eq!(
                    result
                        .term_counts
                        .iter()
                        .map(|entry| (entry.id.as_str(), entry.count))
                        .collect::<Vec<_>>(),
                    vec![("A", 2), ("B", 2)]
                );
                assert_eq!(result.patterns.len(), 4);
                assert_eq!(
                    result
                        .patterns
                        .iter()
                        .map(|pattern| pattern.count)
                        .sum::<usize>(),
                    4
                );
                for pattern in &result.patterns {
                    let drilled = analyze_coverage(
                        &items,
                        &CoverageRequest {
                            pattern: Some(pattern.present_ids.clone()),
                            ..request.clone()
                        },
                        "v1",
                    );
                    assert_eq!(drilled.matched_count, pattern.count);
                    assert_eq!(drilled.items.len(), pattern.count);
                    assert!(drilled.items.iter().all(|item| item.id != "2"));
                    assert_eq!(drilled.patterns.len(), result.patterns.len());
                    assert_eq!(
                        drilled
                            .patterns
                            .iter()
                            .map(|pattern| pattern.count)
                            .sum::<usize>(),
                        4
                    );
                }
            }
        }
    }

    #[test]
    fn merged_approval_cannot_bypass_an_unresolved_change_request() {
        let mut version = item(1, Some(vec!["A"]), true).versions.remove(0);
        assert!(version_is_approved(&version, None));
        version.unresolved_requests.push("change-request".into());
        assert!(!version_is_approved(&version, None));
        version.unresolved_requests.clear();
        version.gate_decisions.push(CoverageGateDecision {
            gate_id: "human".into(),
            decision: "revise".into(),
        });
        assert!(!version_is_approved(&version, None));
        version.lifecycle_status = "submitted".into();
        version.gate_decisions[0].decision = "approved".into();
        assert!(version_is_approved(&version, Some(&["human".into()])));
        assert!(!version_is_approved(
            &version,
            Some(&["human".into(), "missing".into()])
        ));
        assert!(!version_is_approved(&version, Some(&[])));
    }

    #[test]
    fn overview_is_opt_in_and_does_not_change_existing_response_contracts() {
        let request: CoverageRequest = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(!request.include_overview);
        let response = analyze_coverage(&[], &request, "v1");
        assert!(response.overview.is_none());
        assert!(
            serde_json::to_value(response)
                .unwrap()
                .get("overview")
                .is_none()
        );

        let request: CoverageRequest =
            serde_json::from_value(serde_json::json!({ "includeOverview": true })).unwrap();
        let response = serde_json::to_value(analyze_coverage(&[], &request, "v1")).unwrap();
        assert_eq!(
            response["overview"],
            serde_json::json!({
                "approvedItemCount": 0, "pendingItemCount": 0,
                "plannedUnknownCount": 0, "confirmedUnknownCount": 0, "pendingUnknownCount": 0,
                "entries": [],
            })
        );
    }

    #[test]
    fn overview_counts_all_target_references_without_selection_and_deduplicates_per_item() {
        let mut approved = item(1, Some(vec!["A", "A", "B"]), true);
        approved.versions[0].metadata.confirmed_ids = Some(vec!["A".into(), "A".into()]);
        approved.versions[0].metadata.supporting_ids = Some(vec!["material".into()]);
        let pending = item(2, Some(vec!["B", "B", "C"]), false);
        let request = CoverageRequest {
            include_overview: true,
            ..Default::default()
        };
        let result = analyze_coverage(&[approved, pending], &request, "v1");
        assert!(result.term_counts.is_empty());
        assert_eq!(
            result.overview.unwrap(),
            CoverageOverview {
                approved_item_count: 1,
                pending_item_count: 1,
                entries: vec![
                    CoverageOverviewEntry {
                        id: "A".into(),
                        planned_count: 1,
                        confirmed_count: 1,
                        pending_count: 0
                    },
                    CoverageOverviewEntry {
                        id: "B".into(),
                        planned_count: 1,
                        confirmed_count: 0,
                        pending_count: 1
                    },
                    CoverageOverviewEntry {
                        id: "C".into(),
                        planned_count: 0,
                        confirmed_count: 0,
                        pending_count: 1
                    },
                ],
                ..Default::default()
            }
        );
    }

    #[test]
    fn overview_counts_latest_approved_content_and_current_revision_independently() {
        let mut value = item(1, Some(vec!["old"]), true);
        let mut latest = value.versions[0].clone();
        latest.id = "latest-approved".into();
        latest.version_number = 2;
        latest.metadata.core_ids = Some(vec!["approved".into()]);
        latest.metadata.confirmed_ids = Some(vec!["approved".into()]);
        let mut unapproved = latest.clone();
        unapproved.id = "newest-unapproved".into();
        unapproved.version_number = 3;
        unapproved.approved = false;
        unapproved.metadata.core_ids = Some(vec!["pending".into()]);
        value.versions.extend([latest, unapproved]);
        value.status = "readyForReview".into();
        value.draft.core_ids = Some(vec!["pending".into()]);

        let request = CoverageRequest {
            include_overview: true,
            ..Default::default()
        };
        let result = analyze_coverage(&[value], &request, "v1");
        assert_eq!(
            result.items[0].version_id.as_deref(),
            Some("latest-approved")
        );
        assert_eq!(
            result.overview.unwrap(),
            CoverageOverview {
                approved_item_count: 1,
                pending_item_count: 1,
                entries: vec![
                    CoverageOverviewEntry {
                        id: "approved".into(),
                        planned_count: 1,
                        confirmed_count: 1,
                        pending_count: 0
                    },
                    CoverageOverviewEntry {
                        id: "pending".into(),
                        planned_count: 0,
                        confirmed_count: 0,
                        pending_count: 1
                    },
                ],
                ..Default::default()
            }
        );
    }

    #[test]
    fn overview_uses_the_same_registry_and_all_eight_dimension_filters_as_inventory() {
        let metadata = CoverageMetadata {
            registry_version: "v1".into(),
            skill: "Reading".into(),
            activity: "Reception".into(),
            activities: vec!["Mediation".into()],
            domain: "Public".into(),
            context_id: "shop".into(),
            blueprint_slot_id: "R1".into(),
            primary_can_do_id: "read-notice".into(),
            difficulty_band: "TypicalA1".into(),
            item_format_id: "single".into(),
            core_ids: Some(vec!["A".into()]),
            confirmed_ids: Some(vec!["A".into()]),
            ..Default::default()
        };
        let mut value = item(1, Some(vec!["A"]), true);
        value.versions[0].metadata = metadata.clone();
        value.draft = metadata;
        value.status = "draft".into();
        let request = CoverageRequest {
            include_overview: true,
            filters: CoverageFilters {
                skill: Some("Reading".into()),
                activity: Some("Mediation".into()),
                domain: Some("Public".into()),
                context_id: Some("shop".into()),
                blueprint_slot_id: Some("R1".into()),
                primary_can_do_id: Some("read-notice".into()),
                difficulty_band: Some("TypicalA1".into()),
                item_format_id: Some("single".into()),
            },
            ..Default::default()
        };
        let result = analyze_coverage(&[value.clone()], &request, "v1");
        assert_eq!(result.overview.as_ref().unwrap().approved_item_count, 1);
        assert_eq!(result.overview.unwrap().pending_item_count, 1);

        for filters in [
            CoverageFilters {
                skill: Some("Writing".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                activity: Some("Production".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                domain: Some("Educational".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                context_id: Some("school".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                blueprint_slot_id: Some("R2".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                primary_can_do_id: Some("introduce".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                difficulty_band: Some("UpperA1".into()),
                ..request.filters.clone()
            },
            CoverageFilters {
                item_format_id: Some("matching".into()),
                ..request.filters.clone()
            },
        ] {
            let result = analyze_coverage(
                &[value.clone()],
                &CoverageRequest {
                    filters,
                    ..request.clone()
                },
                "v1",
            );
            assert_eq!(result.overview.unwrap(), CoverageOverview::default());
        }
        assert_eq!(
            analyze_coverage(&[value.clone()], &request, "v2")
                .overview
                .unwrap(),
            CoverageOverview::default()
        );

        let mut latest = value.versions[0].clone();
        latest.version_number = 2;
        latest.metadata.registry_version = "v2".into();
        value.versions.push(latest);
        let result = analyze_coverage(&[value], &request, "v1").overview.unwrap();
        assert_eq!(result.approved_item_count, 0);
        assert_eq!(result.pending_item_count, 1);
        assert_eq!(result.entries[0].planned_count, 0);
    }

    #[test]
    fn overview_is_independent_of_scope_role_language_filters_goal_and_pagination() {
        let mut approved = item(1, Some(vec!["A", "B"]), true);
        approved.versions[0].metadata.confirmed_ids = Some(vec!["A".into()]);
        let items = vec![approved, item(2, Some(vec!["B"]), false)];
        let request = CoverageRequest {
            include_overview: true,
            ..Default::default()
        };
        let expected = analyze_coverage(&items, &request, "v1").overview.unwrap();
        for match_mode in [CoverageMatch::All, CoverageMatch::Any, CoverageMatch::Exact] {
            let narrowed = CoverageRequest {
                scope: CoverageScope::Drafts,
                role: CoverageRole::Supporting,
                selected_ids: vec!["A".into()],
                excluded_ids: vec!["B".into()],
                match_mode,
                pattern: Some(vec!["A".into()]),
                desired_count: Some(30),
                offset: 100,
                limit: Some(1),
                ..request.clone()
            };
            let result = analyze_coverage(&items, &narrowed, "v1");
            assert_eq!(result.matched_count, 0);
            assert!(result.items.is_empty());
            assert_eq!(result.overview.unwrap(), expected);
        }
        let confirmed = CoverageRequest {
            role: CoverageRole::Confirmed,
            ..request
        };
        assert_eq!(
            analyze_coverage(&items, &confirmed, "v1").overview.unwrap(),
            expected
        );
    }

    #[test]
    fn overview_preserves_unknown_and_incomplete_evidence_instead_of_treating_them_as_empty() {
        let unknown = item(1, None, true);
        let mut empty = item(2, Some(vec![]), true);
        empty.versions[0].metadata.confirmed_ids = Some(vec![]);
        let mut partial = item(3, Some(vec!["A", "B"]), true);
        partial.versions[0].metadata.confirmed_ids = confirmed_references(
            &partial.draft,
            Some(&CoverageEvidence {
                targets: vec![CoverageEvidenceTarget {
                    target_content_id: "A".into(),
                    relation: "understanding".into(),
                }],
            }),
        );
        let items = vec![
            unknown,
            empty,
            partial,
            item(4, None, false),
            item(5, Some(vec![]), false),
        ];
        let request = CoverageRequest {
            include_overview: true,
            ..Default::default()
        };
        assert_eq!(
            analyze_coverage(&items, &request, "v1").overview.unwrap(),
            CoverageOverview {
                approved_item_count: 3,
                pending_item_count: 2,
                planned_unknown_count: 1,
                confirmed_unknown_count: 2,
                pending_unknown_count: 1,
                entries: vec![
                    CoverageOverviewEntry {
                        id: "A".into(),
                        planned_count: 1,
                        confirmed_count: 0,
                        pending_count: 0
                    },
                    CoverageOverviewEntry {
                        id: "B".into(),
                        planned_count: 1,
                        confirmed_count: 0,
                        pending_count: 0
                    },
                ],
            }
        );
    }
}
