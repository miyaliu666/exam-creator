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

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
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
    pub pending_unknown_count: usize,
    pub term_counts: Vec<CoverageCount>,
    pub patterns: Vec<CoveragePattern>,
    pub breakdowns: BTreeMap<String, Vec<CoverageCount>>,
    pub goal: Option<CoverageGoal>,
    pub items: Vec<CoverageItemSummary>,
    pub offset: usize,
    pub limit: usize,
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

fn content_matches(ids: &BTreeSet<String>, request: &CoverageRequest) -> bool {
    if request.excluded_ids.iter().any(|id| ids.contains(id)) {
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
    let matching = |item: &&CoverageItemSummary| {
        in_scope(item)
            && references(&item.metadata, &request.role)
                .is_some_and(|ids| content_matches(&ids, request))
    };
    let pending_count = pending.iter().filter(matching).count();
    let approved_count = approved.iter().filter(matching).count();
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
    let selected: BTreeSet<_> = request.selected_ids.iter().cloned().collect();
    let term_counts = selected
        .iter()
        .map(|id| CoverageCount {
            id: id.clone(),
            count: known.iter().filter(|(_, ids)| ids.contains(id)).count(),
        })
        .collect();
    let mut pattern_counts: BTreeMap<Vec<String>, usize> = BTreeMap::new();
    for (_, ids) in &known {
        // Patterns partition the dimension-filtered known inventory, including the all-absent row.
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
        pending_unknown_count,
        term_counts,
        patterns,
        breakdowns,
        goal,
        items: matched
            .into_iter()
            .skip(request.offset)
            .take(limit)
            .collect(),
        offset: request.offset,
        limit,
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
            4
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
}
