use axum::{Json, extract::State};
use futures_util::TryStreamExt;
use http::StatusCode;
use mongodb::bson::{Document, doc};

use crate::{
    database::prisma,
    errors::Error,
    language_items::{
        coverage::{
            CoverageItem, CoverageMetadata, CoverageRequest, CoverageResponse, CoverageRole,
            CoverageScope, analyze_coverage, confirmed_references, version_is_approved,
        },
        registry::{active_snapshot, capability_for, snapshot_for},
        registry_content::content_matches_language,
    },
    state::ServerState,
};

fn metadata_projection(prefix: &str) -> Document {
    let mut projection =
        crate::language_items::legacy_identity::coverage_metadata_projection(prefix);
    projection.insert(
        "language",
        doc! { "$ifNull": [format!("${prefix}.content.language"), "zh"] },
    );
    projection
}

fn validate_request(request: &CoverageRequest) -> Result<(), Error> {
    if !matches!(
        request.filters.language.as_deref().unwrap_or("zh"),
        "zh" | "en" | "es"
    ) {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "Choose Chinese, English, or Spanish for coverage.".to_string(),
        ));
    }
    if request.scope == CoverageScope::Drafts && matches!(request.role, CoverageRole::Confirmed) {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "Confirmed coverage is available for immutable approved versions only".to_string(),
        ));
    }
    if request.selected_ids.len() + request.excluded_ids.len() > 256
        || request
            .selected_ids
            .iter()
            .chain(&request.excluded_ids)
            .any(|id| id.trim().is_empty() || id.len() > 256)
        || request.desired_count.is_some_and(|count| count > 1_000_000)
        || request
            .pattern
            .as_ref()
            .is_some_and(|pattern| pattern.iter().any(|id| !request.selected_ids.contains(id)))
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "Invalid coverage selection, pattern, or inventory goal".to_string(),
        ));
    }
    if request
        .selected_ids
        .iter()
        .any(|id| request.excluded_ids.contains(id))
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "A language point cannot be both selected and excluded".to_string(),
        ));
    }
    Ok(())
}

pub async fn post_coverage(
    _: prisma::ExamCreatorUser,
    State(state): State<ServerState>,
    Json(request): Json<CoverageRequest>,
) -> Result<Json<CoverageResponse>, Error> {
    validate_request(&request)?;
    let registry_version = request
        .registry_version
        .as_deref()
        .unwrap_or(&active_snapshot().bundle_version)
        .to_string();
    let registry = snapshot_for(&registry_version).ok_or_else(|| {
        Error::Server(
            StatusCode::NOT_FOUND,
            "The selected Assessment Settings version is unavailable".to_string(),
        )
    })?;
    if request
        .selected_ids
        .iter()
        .chain(&request.excluded_ids)
        .any(|id| {
            !registry.content_id_options.iter().any(|option| {
                &option.id == id
                    && content_matches_language(
                        option,
                        request.filters.language.as_deref().unwrap_or("zh"),
                    )
            })
        })
    {
        return Err(Error::Server(
            StatusCode::BAD_REQUEST,
            "A selected language point is not defined for this language in this Assessment Settings version"
                .to_string(),
        ));
    }
    let database = &state.workbench_database;
    // A metadata projection keeps candidate text, scoring keys, translations, and review comments out of the result and memory.
    let pipeline = vec![
        doc! { "$match": { "$or": [{ "recordState": "active" }, { "recordState": { "$exists": false } }] } },
        doc! { "$project": { "_id": 0, "id": 1, "title": 1, "status": 1, "draft": metadata_projection("draft") } },
        doc! { "$lookup": {
            "from": database.versions.name(), "let": { "itemId": "$id" },
            "pipeline": [
                { "$match": { "$expr": { "$and": [{ "$eq": ["$itemId", "$$itemId"] }, { "$eq": ["$frozen", true] }] } } },
                { "$project": { "_id": 0, "id": 1, "itemId": 1, "evidenceContentHash": 1, "versionNumber": 1, "lifecycleStatus": 1, "metadata": metadata_projection("package") } },
                { "$lookup": {
                    "from": database.item_evidence.name(), "let": { "itemId": "$itemId", "contentHash": "$evidenceContentHash", "registryVersion": "$metadata.registryVersion" },
                    "pipeline": [
                        { "$match": { "$expr": { "$and": [{ "$eq": [{ "$type": "$$contentHash" }, "string"] }, { "$ne": ["$$contentHash", ""] }, { "$eq": ["$itemId", "$$itemId"] }, { "$eq": ["$contentHash", "$$contentHash"] }, { "$eq": ["$registryVersion", "$$registryVersion"] }] } } },
                        { "$sort": { "createdAt": -1, "_id": -1 } }, { "$limit": 1 },
                        { "$project": { "_id": 0, "targets.targetContentId": 1, "targets.relation": 1 } }
                    ], "as": "evidence"
                } },
                { "$lookup": {
                    "from": database.reviews.name(), "let": { "versionId": "$id" },
                    "pipeline": [
                        { "$match": { "$expr": { "$eq": ["$versionId", "$$versionId"] } } },
                        { "$sort": { "createdAt": 1, "_id": 1 } },
                        { "$group": { "_id": "$gateId", "decision": { "$last": "$decision" } } },
                        { "$project": { "_id": 0, "gateId": "$_id", "decision": 1 } }
                    ], "as": "gateDecisions"
                } },
                { "$lookup": {
                    "from": database.review_discussions.name(), "let": { "versionId": "$id" },
                    "pipeline": [
                        { "$match": { "kind": "changeRequest", "$expr": { "$eq": ["$versionId", "$$versionId"] } } },
                        { "$project": { "_id": 0, "id": 1 } },
                        { "$lookup": {
                            "from": database.review_discussion_events.name(), "let": { "discussionId": "$id" },
                            "pipeline": [
                                { "$match": { "kind": { "$ne": "comment" }, "$expr": { "$eq": ["$discussionId", "$$discussionId"] } } },
                                { "$sort": { "createdAt": -1, "_id": -1 } }, { "$limit": 1 },
                                { "$project": { "_id": 0, "kind": 1 } }
                            ], "as": "latestEvent"
                        } },
                        { "$match": { "latestEvent.0.kind": { "$ne": "resolved" } } },
                        { "$project": { "id": 1 } }
                    ], "as": "unresolvedRequests"
                } },
                { "$set": { "unresolvedRequests": { "$map": { "input": "$unresolvedRequests", "as": "request", "in": "$$request.id" } } } }
            ], "as": "versions"
        } },
    ];
    let mut items: Vec<CoverageItem> = database
        .language_items
        .aggregate(pipeline)
        .with_type::<CoverageItem>()
        .await?
        .try_collect()
        .await?;
    for item in &mut items {
        hydrate_activities(&mut item.draft);
        for version in &mut item.versions {
            hydrate_activities(&mut version.metadata);
            version.metadata.confirmed_ids =
                confirmed_references(&version.metadata, version.evidence.first());
            let pinned_registry = snapshot_for(&version.metadata.registry_version);
            version.approved = version_is_approved(
                version,
                pinned_registry
                    .as_ref()
                    .map(|registry| registry.required_review_gate_ids.as_slice()),
            );
        }
    }
    let mut response = analyze_coverage(&items, &request, &registry_version);
    if let Some(overview) = &mut response.overview {
        let target_ids = registry
            .content_id_options
            .iter()
            .filter(|option| {
                option.kind != "supported"
                    && content_matches_language(
                        option,
                        request.filters.language.as_deref().unwrap_or("zh"),
                    )
            })
            .map(|option| option.id.as_str())
            .collect::<std::collections::BTreeSet<_>>();
        overview
            .entries
            .retain(|entry| target_ids.contains(entry.id.as_str()));
    }
    Ok(Json(response))
}

fn hydrate_activities(metadata: &mut CoverageMetadata) {
    if let Some(registry) = snapshot_for(&metadata.registry_version)
        && let Some(capability) = capability_for(
            &registry,
            &metadata.item_rule_id,
            &metadata.item_format_id,
            Some(&metadata.primary_can_do_id),
        )
    {
        metadata.activities = capability.communicative_activities.clone();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn projection_cannot_include_payload_answers_or_review_content() {
        let projection = metadata_projection("package");
        assert_eq!(projection.len(), 13);
        assert_eq!(
            projection.get_document("language").unwrap(),
            &doc! { "$ifNull": ["$package.content.language", "zh"] }
        );
        let serialized = projection.to_string();
        for private_field in [
            "candidatePayload",
            "authoringPackage",
            "scoringPackage",
            "reviewPackage",
        ] {
            assert!(!serialized.contains(private_field));
        }
    }

    #[test]
    fn arbitrary_eight_point_selection_is_valid_but_conflicting_filters_are_rejected() {
        let mut request = CoverageRequest {
            selected_ids: (0..8).map(|id| format!("point-{id}")).collect(),
            ..Default::default()
        };
        assert!(validate_request(&request).is_ok());
        request.excluded_ids.push("point-0".to_string());
        assert!(validate_request(&request).is_err());
    }

    #[test]
    fn coverage_language_requires_a_supported_code_and_defaults_legacy_requests_to_chinese() {
        let mut request = CoverageRequest::default();
        assert!(validate_request(&request).is_ok());
        for language in ["zh", "en", "es"] {
            request.filters.language = Some(language.into());
            assert!(validate_request(&request).is_ok());
        }
        for language in ["", "fr", "English"] {
            request.filters.language = Some(language.into());
            assert!(validate_request(&request).is_err());
        }
    }
}
