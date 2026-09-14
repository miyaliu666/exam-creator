//! Explicit, offline migration of mutable Workbench records. Never runs at startup.
use std::{collections::BTreeMap, fs::OpenOptions, io::Write, path::PathBuf};

use futures_util::TryStreamExt;
use mongodb::{
    Database,
    bson::{Bson, Document, doc},
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::legacy_identity::{
    normalize_record_value, normalize_registry_value, upgrade_mutable_registry_schema,
    verify_immutable_version_value,
};

const MUTABLE_COLLECTIONS: [&str; 4] = [
    "LanguageAssessmentRegistryVersions",
    "LanguageItems",
    "LanguageItemAiRuns",
    "LanguageItemBatchGenerationJobs",
];

#[derive(Debug, PartialEq, Eq)]
pub struct MigrationOptions {
    pub apply: bool,
    pub backup: Option<PathBuf>,
}

pub fn parse_options(args: &[String]) -> Result<MigrationOptions, String> {
    let mut apply = false;
    let mut dry_run = false;
    let mut backup = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--migrate-item-rule-identity" => {}
            "--apply" if !apply => apply = true,
            "--dry-run" if !dry_run => dry_run = true,
            "--backup" if backup.is_none() => {
                index += 1;
                let path = args
                    .get(index)
                    .filter(|value| !value.starts_with("--") && !value.is_empty())
                    .ok_or("--backup requires a file path")?;
                backup = Some(PathBuf::from(path));
            }
            option => {
                return Err(format!(
                    "Unsupported or repeated migration option: {option}"
                ));
            }
        }
        index += 1;
    }
    if apply == dry_run {
        return Err("Choose exactly one of --dry-run or --apply".into());
    }
    if apply && backup.is_none() {
        return Err("--apply requires --backup pointing to a new local file".into());
    }
    if dry_run && backup.is_some() {
        return Err("--backup is only used with --apply".into());
    }
    Ok(MigrationOptions { apply, backup })
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionReport {
    scanned: usize,
    changes: usize,
    preserved: usize,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationReport {
    database: String,
    dry_run: bool,
    collections: BTreeMap<String, CollectionReport>,
    immutable_versions_verified: usize,
    applied: usize,
    errors: Vec<String>,
}

struct Change {
    collection: String,
    before: Document,
    after: Document,
}

fn json_record(document: &Document) -> Value {
    let mut value = serde_json::to_value(document).expect("BSON documents serialize to JSON");
    value
        .as_object_mut()
        .expect("Document is an object")
        .remove("_id");
    value
}

fn blocked_work(collection: &str, record: &Value) -> bool {
    let status = record.get("status").and_then(Value::as_str).unwrap_or("");
    if collection == "LanguageItemAiRuns" {
        return matches!(status, "queued" | "running");
    }
    if collection == "LanguageItemBatchGenerationJobs" {
        return matches!(status, "queued" | "running")
            || record
                .get("workerToken")
                .is_some_and(|value| !value.is_null())
            || record
                .get("children")
                .and_then(Value::as_array)
                .is_some_and(|children| {
                    children
                        .iter()
                        .any(|child| child.get("status").and_then(Value::as_str) == Some("running"))
                });
    }
    false
}

fn bump_revision(record: &mut Value) -> Result<(), String> {
    let revision = record
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or("A valid revision is required")?;
    let next = revision
        .checked_add(1)
        .filter(|value| *value <= i64::MAX as u64)
        .ok_or("Revision cannot be incremented safely")?;
    record["revision"] = json!(next);
    Ok(())
}

fn upgrade_package(package: &mut Value, clear_checks: bool) {
    if let Some(versions) = package
        .get_mut("specVersions")
        .and_then(Value::as_object_mut)
    {
        versions.insert("taskPackageVersion".into(), json!("0.2"));
    }
    if clear_checks {
        if let Some(review) = package
            .get_mut("reviewPackage")
            .and_then(Value::as_object_mut)
        {
            review.insert("gates".into(), json!({}));
        }
    }
}

/// Returns None for immutable/locked records and for an already migrated record.
fn prepare_record(collection: &str, before: &Value) -> Result<Option<Value>, String> {
    if blocked_work(collection, before) {
        return Err("Generation work is active or uncertain; finish or explicitly pause/recover it before migration".into());
    }
    let mut after = before.clone();
    match collection {
        "LanguageAssessmentRegistryVersions" => {
            if before.get("status").and_then(Value::as_str) != Some("draft") {
                return Ok(None);
            }
            let snapshot = after
                .get_mut("snapshot")
                .ok_or("Registry draft has no snapshot")?;
            if !normalize_registry_value(snapshot)? {
                return Ok(None);
            }
            upgrade_mutable_registry_schema(snapshot)?;
            snapshot["settingsSchemaVersion"] = json!(3);
            bump_revision(&mut after)?;
        }
        "LanguageItems" => {
            // Submitted drafts are locked evidence until an explicit new revision is made.
            if before.get("status").and_then(Value::as_str) != Some("draft") {
                return Ok(None);
            }
            let package = after.get_mut("draft").ok_or("Item has no draft package")?;
            if !normalize_record_value(package)? {
                return Ok(None);
            }
            upgrade_package(package, true);
            bump_revision(&mut after)?;
        }
        "LanguageItemAiRuns" => {
            // Raw provider requests and feedback remain a record of what was actually sent.
            let provider_calls = after
                .as_object_mut()
                .ok_or("Run must be an object")?
                .remove("providerCalls");
            let changed = normalize_record_value(&mut after)?;
            if let Some(calls) = provider_calls {
                after["providerCalls"] = calls;
            }
            if !changed {
                return Ok(None);
            }
            upgrade_package(&mut after, false);
            if let Some(setup) = after.get_mut("generationSetupSnapshot") {
                upgrade_package(setup, false);
            }
        }
        "LanguageItemBatchGenerationJobs" => {
            if !normalize_record_value(&mut after)? {
                return Ok(None);
            }
            if let Some(children) = after.get_mut("children").and_then(Value::as_array_mut) {
                for child in children {
                    if let Some(setup) = child.get_mut("setupSnapshot") {
                        upgrade_package(setup, false);
                    }
                }
            }
        }
        _ => return Err("Collection is outside the migration allowlist".into()),
    }
    after["updatedAt"] = json!(chrono::Utc::now().to_rfc3339());
    Ok(Some(after))
}

/// Preserve original BSON types for unchanged subtrees, including unknown metadata.
fn patch_bson(original: &Bson, before: &Value, after: &Value) -> Result<Bson, String> {
    if before == after {
        return Ok(original.clone());
    }
    if let (Bson::Document(document), Some(old), Some(new)) =
        (original, before.as_object(), after.as_object())
    {
        let mut result = Document::new();
        // Preserve original document field order; append only new fields.
        let keys = document
            .keys()
            .filter(|key| new.contains_key(*key))
            .chain(new.keys().filter(|key| !document.contains_key(*key)));
        for key in keys {
            let value = &new[key];
            let patched = match (document.get(key), old.get(key)) {
                (Some(raw), Some(previous)) => patch_bson(raw, previous, value)?,
                _ => bson::serialize_to_bson(value).map_err(|error| error.to_string())?,
            };
            result.insert(key, patched);
        }
        return Ok(Bson::Document(result));
    }
    if let (Bson::Array(raw), Some(old), Some(new)) =
        (original, before.as_array(), after.as_array())
    {
        if raw.len() == old.len() && old.len() == new.len() {
            return Ok(Bson::Array(
                raw.iter()
                    .zip(old)
                    .zip(new)
                    .map(|((raw, old), new)| patch_bson(raw, old, new))
                    .collect::<Result<_, _>>()?,
            ));
        }
    }
    bson::serialize_to_bson(after).map_err(|error| error.to_string())
}

fn changed_document(
    before: &Document,
    before_json: &Value,
    after_json: &Value,
) -> Result<Document, String> {
    let mut without_id = before.clone();
    without_id.remove("_id");
    let Bson::Document(after) = patch_bson(&Bson::Document(without_id), before_json, after_json)?
    else {
        return Err("Migration result must be a document".into());
    };
    let id = before
        .get("_id")
        .ok_or("A stored record has no MongoDB identity")?;
    // Keep the MongoDB identity first so stored documents and rollback guards
    // have the same field order after a replacement.
    let mut result = doc! { "_id": id.clone() };
    result.extend(after);
    Ok(result)
}

fn exact_guard(document: &Document) -> Result<Document, String> {
    Ok(
        doc! { "_id": document.get("_id").ok_or("Stored record has no identity")?.clone(),
        "$expr": { "$eq": ["$$ROOT", { "$literal": document.clone() }] } },
    )
}

fn encoded_document(document: &Document) -> Result<Value, String> {
    let bytes = bson::serialize_to_vec(document).map_err(|error| error.to_string())?;
    Ok(json!({"bsonHex":hex::encode(&bytes),"sha256":format!("{:x}",Sha256::digest(&bytes))}))
}

fn write_backup(path: &PathBuf, database: &str, changes: &[Change]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|error| format!("Cannot create a new backup file: {error}"))?;
    let records = changes
        .iter()
        .map(|change| {
            Ok(json!({"collection":change.collection,
        "before":encoded_document(&change.before)?,"after":encoded_document(&change.after)?}))
        })
        .collect::<Result<Vec<_>, String>>()?;
    let body = json!({"migration":"item-rule-identity-v1","database":database,"createdAt":chrono::Utc::now().to_rfc3339(),"records":records});
    serde_json::to_writer(&mut file, &body).map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;
    file.sync_all().map_err(|error| error.to_string())
}

pub async fn migrate(
    database: &Database,
    options: &MigrationOptions,
) -> Result<MigrationReport, String> {
    let mut report = MigrationReport {
        database: database.name().into(),
        dry_run: !options.apply,
        ..MigrationReport::default()
    };
    let mut changes = Vec::new();
    let mut versions = database
        .collection::<Document>("LanguageItemVersions")
        .find(doc! {})
        .await
        .map_err(|error| error.to_string())?;
    while let Some(version) = versions
        .try_next()
        .await
        .map_err(|error| error.to_string())?
    {
        match verify_immutable_version_value(&json_record(&version)) {
            Ok(()) => report.immutable_versions_verified += 1,
            Err(error) => report.errors.push(format!(
                "LanguageItemVersions {}: {error}",
                version.get_str("id").unwrap_or("unknown")
            )),
        }
    }
    for collection in MUTABLE_COLLECTIONS {
        let mut cursor = database
            .collection::<Document>(collection)
            .find(doc! {})
            .await
            .map_err(|error| error.to_string())?;
        let mut counts = CollectionReport::default();
        while let Some(before) = cursor.try_next().await.map_err(|error| error.to_string())? {
            counts.scanned += 1;
            let before_json = json_record(&before);
            match prepare_record(collection, &before_json).and_then(|after| {
                after
                    .map(|value| changed_document(&before, &before_json, &value))
                    .transpose()
            }) {
                Ok(Some(after)) => {
                    counts.changes += 1;
                    changes.push(Change {
                        collection: collection.into(),
                        before,
                        after,
                    });
                }
                Ok(None) => counts.preserved += 1,
                Err(error) => report.errors.push(format!(
                    "{collection} {}: {error}",
                    before.get_str("id").unwrap_or("unknown")
                )),
            }
        }
        report.collections.insert(collection.into(), counts);
    }
    if !options.apply || !report.errors.is_empty() {
        return Ok(report);
    }
    // Other application writers must be stopped. Guards protect touched records,
    // but cannot prevent a separate process from inserting new generation work.
    for change in &changes {
        if database
            .collection::<Document>(&change.collection)
            .find_one(exact_guard(&change.before)?)
            .await
            .map_err(|error| error.to_string())?
            .is_none()
        {
            report.errors.push("A record changed after preflight; nothing was written. Stop other writers and retry.".into());
            return Ok(report);
        }
    }
    write_backup(
        options.backup.as_ref().ok_or("A backup path is required")?,
        database.name(),
        &changes,
    )?;
    for (index, change) in changes.iter().enumerate() {
        let result = database
            .collection::<Document>(&change.collection)
            .replace_one(exact_guard(&change.before)?, &change.after)
            .await;
        let failure = match result {
            Ok(result) if result.matched_count == 1 => None,
            Ok(_) => Some("A record changed concurrently".to_string()),
            Err(error) => Some(error.to_string()),
        };
        if let Some(error) = failure {
            report.errors.push(format!("Migration stopped: {error}. Checking the uncertain write and rolling back completed writes."));
            // A network error can arrive after MongoDB committed the replacement.
            // Resolve that write before rolling back earlier acknowledged writes.
            match restore_change(database, change).await {
                Ok(()) => {}
                Err(error) => report.errors.push(error),
            }
            for completed in changes[..index].iter().rev() {
                match restore_change(database, completed).await {
                    Ok(()) => report.applied -= 1,
                    Err(error) => report.errors.push(error),
                }
            }
            return Ok(report);
        }
        report.applied += 1;
    }
    Ok(report)
}

async fn restore_change(database: &Database, change: &Change) -> Result<(), String> {
    let collection = database.collection::<Document>(&change.collection);
    let identity =
        doc! { "_id": change.before.get("_id").ok_or("Backup record has no identity")?.clone() };
    let unresolved = || {
        format!(
            "Rollback requires manual inspection for {} {}. The outcome is unresolved; original BSON is in the backup.",
            change.collection,
            change.before.get_str("id").unwrap_or("unknown")
        )
    };
    let current = collection
        .find_one(identity.clone())
        .await
        .map_err(|_| unresolved())?;
    if current.as_ref() == Some(&change.before) {
        return Ok(());
    }
    if current.as_ref() != Some(&change.after) {
        return Err(unresolved());
    }
    match collection
        .replace_one(exact_guard(&change.after)?, &change.before)
        .await
    {
        Ok(result) if result.matched_count == 1 => Ok(()),
        _ => {
            // Resolve an uncertain rollback acknowledgement without overwriting a
            // concurrent third state or replaying any generation operation.
            if collection
                .find_one(identity)
                .await
                .map_err(|_| unresolved())?
                .as_ref()
                == Some(&change.before)
            {
                Ok(())
            } else {
                Err(unresolved())
            }
        }
    }
}

pub async fn run_cli(args: &[String]) -> Result<(), String> {
    let inspection = match args {
        [flag, path]
            if flag == "--inspect-item-rule-history"
                && !path.starts_with("--")
                && !path.is_empty() =>
        {
            Some(PathBuf::from(path))
        }
        _ => None,
    };
    let options = if inspection.is_none() {
        Some(parse_options(args)?)
    } else {
        None
    };
    let uri =
        std::env::var("MONGODB_URI_STAGING").map_err(|_| "MONGODB_URI_STAGING is required")?;
    let client = mongodb::Client::with_uri_str(uri)
        .await
        .map_err(|error| error.to_string())?;
    let database = client
        .default_database()
        .ok_or("MONGODB_URI_STAGING must name its database")?;
    if let Some(path) = inspection {
        let mut records = database
            .collection::<Document>("LanguageItemVersions")
            .find(doc! {})
            .await
            .map_err(|error| error.to_string())?;
        let mut history = Vec::new();
        while let Some(record) = records
            .try_next()
            .await
            .map_err(|error| error.to_string())?
        {
            history.push(
                json!({"record":json_record(&record), "original":encoded_document(&record)?,
                "verificationError":verify_immutable_version_value(&json_record(&record)).err()}),
            );
        }
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| error.to_string())?;
        serde_json::to_writer(&mut file, &history).map_err(|error| error.to_string())?;
        file.sync_all().map_err(|error| error.to_string())?;
        println!(
            "Exported {} immutable records for local inspection; no database records changed.",
            history.len()
        );
        return Ok(());
    }
    let report = migrate(&database, &options.ok_or("Migration options are missing")?).await?;
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|error| error.to_string())?
    );
    if report.errors.is_empty() {
        Ok(())
    } else {
        Err("Migration preflight or application failed; see the report above".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn apply_requires_new_backup_and_explicit_mode() {
        let args = |values: &[&str]| {
            values
                .iter()
                .map(|value| value.to_string())
                .collect::<Vec<_>>()
        };
        assert!(parse_options(&args(&["--apply"])).is_err());
        assert!(
            parse_options(&args(&["--dry-run", "--apply", "--backup", "backup.json"])).is_err()
        );
        assert!(parse_options(&args(&["--apply", "--backup", "--dry-run"])).is_err());
        assert_eq!(
            parse_options(&args(&["--dry-run"])).unwrap(),
            MigrationOptions {
                apply: false,
                backup: None
            }
        );
        assert!(
            parse_options(&args(&["--apply", "--backup", "backup.json"]))
                .unwrap()
                .apply
        );
    }

    #[test]
    fn active_and_uncertain_provider_calls_block_without_rewriting_status() {
        for value in [json!({"status":"running"}), json!({"status":"queued"})] {
            assert!(prepare_record("LanguageItemAiRuns", &value).is_err());
        }
        assert!(
            prepare_record(
                "LanguageItemBatchGenerationJobs",
                &json!({"status":"paused","workerToken":"owner"})
            )
            .is_err()
        );
        assert!(
            prepare_record(
                "LanguageItemBatchGenerationJobs",
                &json!({"status":"paused","children":[{"status":"running"}]})
            )
            .is_err()
        );
        assert!(!blocked_work(
            "LanguageItemBatchGenerationJobs",
            &json!({"status":"paused","children":[{"status":"pending"}]})
        ));
    }

    #[test]
    fn immutable_registry_and_submitted_draft_are_never_rewritten() {
        assert!(
            prepare_record(
                "LanguageAssessmentRegistryVersions",
                &json!({"status":"published"})
            )
            .unwrap()
            .is_none()
        );
        assert!(
            prepare_record("LanguageItems", &json!({"status":"inReview"}))
                .unwrap()
                .is_none()
        );
        assert!(
            prepare_record("LanguageItems", &json!({"status":"approved"}))
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn bson_patch_preserves_unknown_metadata_types_and_identity() {
        let original = doc! { "_id": bson::oid::ObjectId::new(), "revision": 1_i64,
        "draft": { "name":"Original", "metadata": { "count": 7_i64, "when": bson::DateTime::from_millis(12345) } } };
        let before = json_record(&original);
        let mut after = before.clone();
        after["draft"]["name"] = json!("Changed");
        let result = changed_document(&original, &before, &after).unwrap();
        assert_eq!(result.get("_id"), original.get("_id"));
        assert_eq!(
            result.keys().collect::<Vec<_>>(),
            original.keys().collect::<Vec<_>>()
        );
        assert_eq!(result.get("revision"), original.get("revision"));
        assert_eq!(
            result.get_document("draft").unwrap().get("metadata"),
            original.get_document("draft").unwrap().get("metadata")
        );
        assert_eq!(
            result
                .get_document("draft")
                .unwrap()
                .get_str("name")
                .unwrap(),
            "Changed"
        );
    }

    fn historical_setup() -> Value {
        json!({"blueprintSlotId":"SLOT-READ", "itemFormatId":"FMT-SINGLE", "primaryCanDoId":"R-A1-1",
            "specVersions":{"taskPackageVersion":"0.1"},
            "content":{"targetContentIds":["word-1"],"contextId":"context-1"},
            "candidatePayload":{"text":"Preserved authored content"}})
    }

    #[test]
    fn mutable_item_migration_preserves_authored_content_and_is_idempotent() {
        let mut package = historical_setup();
        package["reviewPackage"] = json!({"gates":{"passed":true},"notes":"Keep"});
        let before = json!({"status":"draft","revision":7,"draft":package});
        let after = prepare_record("LanguageItems", &before).unwrap().unwrap();
        assert_eq!(after["revision"], 8);
        assert_eq!(after["draft"]["specVersions"]["taskPackageVersion"], "0.2");
        assert_eq!(after["draft"]["content"], before["draft"]["content"]);
        assert_eq!(
            after["draft"]["candidatePayload"],
            before["draft"]["candidatePayload"]
        );
        assert_eq!(
            after["draft"]["reviewPackage"],
            json!({"gates":{},"notes":"Keep"})
        );
        assert!(after["draft"].get("blueprintSlotId").is_none());
        assert!(
            after["draft"]["itemRuleId"]
                .as_str()
                .unwrap()
                .starts_with("legacy-rule-")
        );
        assert!(prepare_record("LanguageItems", &after).unwrap().is_none());
    }

    #[test]
    fn completed_run_migration_keeps_provider_evidence_and_upgrades_fallback_version() {
        let mut before = historical_setup();
        before["status"] = json!("completed");
        before["providerCalls"] =
            json!([{"request":historical_setup(),"response":"Original provider response"}]);
        before["candidates"] = json!([{"id":"candidate-1","content":"Original answer"}]);
        let after = prepare_record("LanguageItemAiRuns", &before)
            .unwrap()
            .unwrap();
        assert_eq!(after["specVersions"]["taskPackageVersion"], "0.2");
        assert_eq!(after["providerCalls"], before["providerCalls"]);
        assert_eq!(after["candidates"], before["candidates"]);
        assert!(after.get("generationSetupSnapshot").is_none());
        assert!(
            prepare_record("LanguageItemAiRuns", &after)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn mutable_registry_gets_current_package_contract_without_rewriting_publications() {
        let snapshot = json!({"settingsSchemaVersion":2,"capabilities":[historical_setup()],
            "taskPackageSchema":{"properties":{"blueprintSlotId":{"type":"string"},
                "specVersions":{"properties":{"taskPackageVersion":{"const":"0.1"}}},
                "scoringPackage":{"properties":{"scoringContractTemplateId":{"pattern":"^SCT-OLD$"}}}}}});
        let before = json!({"status":"draft","revision":4,"snapshot":snapshot});
        let after = prepare_record("LanguageAssessmentRegistryVersions", &before)
            .unwrap()
            .unwrap();
        assert_eq!(after["snapshot"]["settingsSchemaVersion"], 3);
        assert_eq!(after.pointer("/snapshot/taskPackageSchema/properties/specVersions/properties/taskPackageVersion/const"), Some(&json!("0.2")));
        assert_eq!(after.pointer("/snapshot/taskPackageSchema/properties/scoringPackage/properties/scoringContractTemplateId/pattern"), Some(&json!("^SCT-OLD$")));
        assert!(
            prepare_record("LanguageAssessmentRegistryVersions", &after)
                .unwrap()
                .is_none()
        );
        let mut published = before;
        published["status"] = json!("published");
        assert!(
            prepare_record("LanguageAssessmentRegistryVersions", &published)
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn archived_bundled_scoring_pattern_is_replaced_by_registry_membership() {
        let schema: Value = serde_json::from_str(include_str!("../../language-item-workbench/contracts/legacy/language-item-task-package-v0.1.schema.json")).unwrap();
        let mut snapshot = json!({"taskPackageSchema":schema});
        upgrade_mutable_registry_schema(&mut snapshot).unwrap();
        assert!(snapshot.pointer("/taskPackageSchema/properties/scoringPackage/properties/scoringContractTemplateId/pattern").is_none());
        assert_eq!(
            snapshot.pointer(
                "/taskPackageSchema/properties/specVersions/properties/taskPackageVersion/const"
            ),
            Some(&json!("0.2"))
        );
    }
}
