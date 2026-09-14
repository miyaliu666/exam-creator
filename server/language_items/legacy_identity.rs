//! Explicit storage/archive boundary for the retired identity representation.
//! Current authoring contracts and API serialization contain only itemRuleId.
use std::collections::{BTreeMap, HashSet};

use serde::{
    Deserialize, Deserializer, Serialize, Serializer, de::IntoDeserializer, ser::SerializeStruct,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

use super::{
    batch::{BatchChild, BatchGenerationJob, BatchGroup, CreateBatchBody},
    domain::*,
    registry::RegistrySnapshot,
};

#[derive(Clone, Debug)]
pub struct IntegrityProvenance {
    source_slot_id: String,
    canonical_rule_id: String,
    original_encoding: Option<OriginalPackageEncoding>,
}

#[derive(Clone, Debug)]
struct OriginalPackageEncoding {
    bytes: Vec<u8>,
    canonical_at_read: Vec<u8>,
}

pub fn legacy_rule_id(slot: &str, format: &str, can_do: &str) -> Result<String, String> {
    if [slot, format, can_do]
        .iter()
        .any(|part| part.trim().is_empty() || part.trim() != *part)
    {
        return Err("A historical item identity has an incomplete or malformed tuple.".into());
    }
    if format.starts_with("EXERCISE:") {
        let id = slot
            .strip_prefix("exercise:")
            .filter(|id| !id.is_empty())
            .ok_or("A historical exercise identity has an invalid source rule identifier.")?;
        return Ok(id.into());
    }
    let bytes = serde_json::to_vec(&[slot, format, can_do]).map_err(|error| error.to_string())?;
    Ok(format!(
        "legacy-rule-{}",
        hex::encode(Sha256::digest(bytes))
    ))
}

fn tuple(value: &Value) -> Result<(&str, &str, &str), String> {
    Ok((
        value
            .get("blueprintSlotId")
            .and_then(Value::as_str)
            .ok_or("Historical item identity is missing its source identifier.")?,
        value
            .get("itemFormatId")
            .and_then(Value::as_str)
            .ok_or("Historical item identity is missing its item format.")?,
        value
            .get("primaryCanDoId")
            .or_else(|| value.pointer("/content/primaryCanDoId"))
            .and_then(Value::as_str)
            .ok_or("Historical item identity is missing its Primary Can-do.")?,
    ))
}

pub fn normalize_record_value(value: &mut Value) -> Result<bool, String> {
    let before = value.clone();
    let batch_mode = historical_batch_mode(value)?;
    normalize_node(value)?;
    if let Some(registry_version) = batch_mode {
        let body = batch_body(value, registry_version)?;
        value["requestFingerprint"] = json!(super::batch::request_fingerprint(&body));
    }
    Ok(*value != before)
}

fn batch_body(value: &Value, registry_version: Option<String>) -> Result<CreateBatchBody, String> {
    serde_json::from_value(json!({"title": value["title"], "idempotencyKey": value["idempotencyKey"],
        "registryVersion": registry_version, "groups": value["groups"], "candidatesPerItem": value["candidatesPerItem"]}))
        .map_err(|error| error.to_string())
}

struct HistoricalBatch<'a>(&'a CreateBatchBody, &'a [String]);
struct HistoricalGroup<'a>(&'a BatchGroup, &'a str);
impl Serialize for HistoricalGroup<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("BatchGroup", 9)?;
        state.serialize_field("blueprintSlotId", self.1)?;
        state.serialize_field("itemFormatId", &self.0.item_format_id)?;
        state.serialize_field("primaryCanDoId", &self.0.primary_can_do_id)?;
        state.serialize_field("primaryDomain", &self.0.primary_domain)?;
        state.serialize_field("contextId", &self.0.context_id)?;
        state.serialize_field("difficultyBand", &self.0.difficulty_band)?;
        state.serialize_field("itemCount", &self.0.item_count)?;
        state.serialize_field(
            "requiredTargetContentIds",
            &self.0.required_target_content_ids,
        )?;
        state.serialize_field(
            "rotatingTargetContentIds",
            &self.0.rotating_target_content_ids,
        )?;
        state.end()
    }
}
impl Serialize for HistoricalBatch<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut state = serializer.serialize_struct("CreateBatchBody", 5)?;
        state.serialize_field("title", &self.0.title)?;
        state.serialize_field("idempotencyKey", &self.0.idempotency_key)?;
        state.serialize_field("registryVersion", &self.0.registry_version)?;
        let groups = self
            .0
            .groups
            .iter()
            .zip(self.1)
            .map(|(group, id)| HistoricalGroup(group, id))
            .collect::<Vec<_>>();
        state.serialize_field("groups", &groups)?;
        state.serialize_field("candidatesPerItem", &self.0.candidates_per_item)?;
        state.end()
    }
}

fn historical_batch_mode(value: &Value) -> Result<Option<Option<String>>, String> {
    if value.get("requestFingerprint").is_none() {
        return Ok(None);
    }
    let Some(groups) = value.get("groups").and_then(Value::as_array) else {
        return Ok(None);
    };
    if !groups
        .iter()
        .any(|group| group.get("blueprintSlotId").is_some())
    {
        return Ok(None);
    }
    let source_ids = groups
        .iter()
        .map(|group| tuple(group).map(|parts| parts.0.to_string()))
        .collect::<Result<Vec<_>, _>>()?;
    let mut normalized = value.clone();
    normalize_node(&mut normalized)?;
    let pinned = value
        .get("registryVersion")
        .and_then(Value::as_str)
        .ok_or("Historical batch is missing its pinned Registry.")?;
    for mode in [Some(pinned.to_string()), None] {
        let body = batch_body(&normalized, mode.clone())?;
        let bytes = serde_json::to_vec(&HistoricalBatch(&body, &source_ids))
            .map_err(|error| error.to_string())?;
        if value.get("requestFingerprint").and_then(Value::as_str)
            == Some(format!("{:x}", Sha256::digest(bytes)).as_str())
        {
            return Ok(Some(mode));
        }
    }
    Err("Historical batch request fingerprint does not match its saved request; migration cannot preserve its retry identity.".into())
}

fn normalize_node(value: &mut Value) -> Result<(), String> {
    if value.get("capabilities").is_some_and(Value::is_array) {
        normalize_registry_value(value)?;
        return Ok(());
    }
    if value.get("blueprintSlotId").is_some() {
        let (slot, format, can_do) = tuple(value)?;
        let id = legacy_rule_id(slot, format, can_do)?;
        let source_names = [
            (format!("slot.{slot}"), format!("itemRule.{id}")),
            (
                format!("contexts.{slot}.{format}.{can_do}"),
                format!("contexts.{id}"),
            ),
            (
                format!("difficulty.{slot}.{format}.{can_do}"),
                format!("difficulty.{id}"),
            ),
            (
                format!("content.{slot}.{format}.{can_do}"),
                format!("content.{id}"),
            ),
        ];
        let object = value
            .as_object_mut()
            .ok_or("Historical record is not an object.")?;
        if object.contains_key("itemRuleId") {
            return Err(
                "A record contains both historical and canonical item identity fields.".into(),
            );
        }
        object.remove("blueprintSlotId");
        object.insert("itemRuleId".into(), json!(id));
        if let Some(fingerprints) = object
            .get_mut("sourceFingerprints")
            .and_then(Value::as_object_mut)
        {
            for (old, new) in &source_names {
                if let Some(fingerprint) = fingerprints.remove(old) {
                    if fingerprints.insert(new.clone(), fingerprint).is_some() {
                        return Err(
                            "A historical review source contains conflicting identity references."
                                .into(),
                        );
                    }
                }
            }
        }
        if let Some(rules) = object.get_mut("rules").and_then(Value::as_array_mut) {
            for rule in rules {
                if let Some(refs) = rule.get_mut("sourceRefs").and_then(Value::as_array_mut) {
                    for reference in refs {
                        if let Some((_, new)) = source_names
                            .iter()
                            .find(|(old, _)| reference.as_str() == Some(old.as_str()))
                        {
                            *reference = json!(new);
                        }
                    }
                }
            }
        }
    }
    match value {
        Value::Object(object) => {
            for key in [
                "draft",
                "package",
                "taskPackage",
                "setupSnapshot",
                "generationSetupSnapshot",
                "snapshot",
                "registrySnapshot",
                "groups",
                "children",
                "capabilities",
                "capabilityDifficultyProfileSets",
                "reviewRuleSets",
                "contentIdOptions",
                "assessmentRules",
            ] {
                if let Some(child) = object.get_mut(key) {
                    normalize_node(child)?;
                }
            }
        }
        Value::Array(array) => {
            for child in array {
                normalize_node(child)?;
            }
        }
        _ => {}
    }
    Ok(())
}

pub fn normalize_registry_value(value: &mut Value) -> Result<bool, String> {
    let before = value.clone();
    let capabilities = value
        .get("capabilities")
        .and_then(Value::as_array)
        .ok_or("Registry capabilities are unavailable.")?;
    let mut mapping: BTreeMap<String, Vec<(String, String)>> = BTreeMap::new();
    let mut ids = HashSet::new();
    for row in capabilities {
        let id = if row.get("blueprintSlotId").is_some() {
            if row.get("itemRuleId").is_some() {
                return Err("A registry rule contains conflicting identity fields.".into());
            }
            let (slot, format, can_do) = tuple(row)?;
            let id = legacy_rule_id(slot, format, can_do)?;
            mapping
                .entry(slot.into())
                .or_default()
                .push((format.into(), id.clone()));
            id
        } else {
            row.get("itemRuleId")
                .and_then(Value::as_str)
                .filter(|id| !id.trim().is_empty())
                .ok_or("An item rule is missing its identifier.")?
                .into()
        };
        if !ids.insert(id) {
            return Err("Registry item rule identities are not unique.".into());
        }
    }
    let object = value
        .as_object_mut()
        .ok_or("Registry snapshot is not an object.")?;
    // Historical display metadata is retained on each concrete rule before retiring its entity.
    if let Some(entities) = object
        .remove("blueprintSlots")
        .and_then(|value| value.as_array().cloned())
    {
        if let Some(rows) = object.get_mut("capabilities").and_then(Value::as_array_mut) {
            for row in rows {
                if let Some(entity) = entities
                    .iter()
                    .find(|entity| entity.get("id") == row.get("blueprintSlotId"))
                {
                    if let Some(name) = entity
                        .get("displayName")
                        .and_then(Value::as_str)
                        .filter(|name| !name.trim().is_empty())
                    {
                        row["title"] = json!(name);
                    }
                }
            }
        }
    }
    for key in ["scoringContracts", "taskFamilyOptions", "referenceLabels"] {
        if let Some(rows) = object.get_mut(key).and_then(Value::as_array_mut) {
            for row in rows {
                let Some(fields) = row.as_object_mut() else {
                    continue;
                };
                let old_single = fields.remove("blueprintSlotId");
                let old_many = fields.remove("blueprintSlotIds");
                if old_single.is_some() || old_many.is_some() {
                    if fields.contains_key("itemRuleIds") {
                        return Err(
                            "Shared rule references contain conflicting identity fields.".into(),
                        );
                    }
                    let slots: Vec<_> = old_single
                        .into_iter()
                        .chain(
                            old_many
                                .and_then(|value| value.as_array().cloned())
                                .unwrap_or_default(),
                        )
                        .collect();
                    let format = (key == "scoringContracts")
                        .then(|| fields.get("itemFormatId").and_then(Value::as_str))
                        .flatten();
                    let mut refs = vec![];
                    for slot in slots {
                        let slot = slot
                            .as_str()
                            .ok_or("Historical shared rule reference is not a string.")?;
                        for (candidate_format, id) in mapping
                            .get(slot)
                            .ok_or("Historical shared rule references an unavailable binding.")?
                        {
                            if format.is_none_or(|format| candidate_format == format)
                                && !refs.contains(id)
                            {
                                refs.push(id.clone());
                            }
                        }
                    }
                    fields.insert("itemRuleIds".into(), json!(refs));
                }
            }
        }
    }
    // Schema normalization changes identity spelling only; old validation-version semantics remain pinned.
    if let Some(schema) = object.get_mut("taskPackageSchema") {
        normalize_schema(schema, &mapping)?;
    }
    for child in object.values_mut() {
        normalize_node(child)?;
    }
    Ok(*value != before)
}

fn normalize_schema(
    value: &mut Value,
    mapping: &BTreeMap<String, Vec<(String, String)>>,
) -> Result<(), String> {
    match value {
        Value::Object(object) => {
            if object.contains_key("blueprintSlotId") {
                if object.contains_key("itemRuleId") {
                    return Err(
                        "Historical schema contains conflicting identity definitions.".into(),
                    );
                }
                let definition = object.remove("blueprintSlotId").expect("Checked above");
                object.insert(
                    "itemRuleId".into(),
                    normalize_identity_schema(definition, mapping)?,
                );
            }
            for value in object.values_mut() {
                normalize_schema(value, mapping)?;
            }
        }
        Value::Array(array) => {
            for value in array {
                normalize_schema(value, mapping)?;
            }
        }
        Value::String(text) if text == "blueprintSlotId" => *text = "itemRuleId".into(),
        _ => {}
    }
    Ok(())
}

fn normalize_identity_schema(
    mut definition: Value,
    mapping: &BTreeMap<String, Vec<(String, String)>>,
) -> Result<Value, String> {
    let fields = definition
        .as_object_mut()
        .ok_or("Historical identity schema is not an object.")?;
    for key in fields.keys() {
        if !matches!(
            key.as_str(),
            "type"
                | "const"
                | "enum"
                | "minLength"
                | "title"
                | "description"
                | "$comment"
                | "deprecated"
                | "readOnly"
                | "writeOnly"
        ) {
            return Err(format!(
                "Historical identity schema uses unsupported constraint {key}; preserve and explicitly translate this restriction before migration."
            ));
        }
    }
    if fields
        .get("type")
        .is_some_and(|value| value.as_str() != Some("string"))
        || fields
            .get("minLength")
            .is_some_and(|value| !matches!(value.as_u64(), Some(0 | 1)))
    {
        return Err("Historical identity schema has unsupported string constraints.".into());
    }
    let constant = fields.remove("const");
    let enumeration = fields.remove("enum");
    let allowed = match enumeration {
        Some(Value::Array(values)) if values.iter().all(Value::is_string) => Some(values),
        Some(_) => return Err("Historical identity schema enum must contain identifiers.".into()),
        None => None,
    };
    if constant.as_ref().is_some_and(|value| !value.is_string()) {
        return Err("Historical identity schema const must be an identifier.".into());
    }
    if constant.is_some() || allowed.is_some() {
        let mut translated = mapping
            .iter()
            .filter(|(source, _)| {
                constant
                    .as_ref()
                    .is_none_or(|value| value.as_str() == Some(source.as_str()))
                    && allowed.as_ref().is_none_or(|values| {
                        values
                            .iter()
                            .any(|value| value.as_str() == Some(source.as_str()))
                    })
            })
            .flat_map(|(_, identities)| identities.iter().map(|(_, id)| id.clone()))
            .collect::<Vec<_>>();
        translated.sort();
        translated.dedup();
        fields.insert("enum".into(), json!(translated));
    }
    Ok(definition)
}

pub fn package_from_value(mut value: Value) -> Result<TaskPackage, String> {
    let mut provenance = if value.get("blueprintSlotId").is_some() {
        let (slot, format, can_do) = tuple(&value)?;
        Some(IntegrityProvenance {
            source_slot_id: slot.into(),
            canonical_rule_id: legacy_rule_id(slot, format, can_do)?,
            original_encoding: Some(OriginalPackageEncoding {
                bytes: serde_json::to_vec(&value).map_err(|error| error.to_string())?,
                canonical_at_read: Vec::new(),
            }),
        })
    } else {
        None
    };
    normalize_record_value(&mut value)?;
    let mut package: TaskPackage =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    if let Some(source) = provenance
        .as_mut()
        .and_then(|source| source.original_encoding.as_mut())
    {
        source.canonical_at_read =
            serde_json::to_vec(&package).map_err(|error| error.to_string())?;
    }
    package.integrity_provenance = provenance;
    Ok(package)
}

pub fn deserialize_package<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<TaskPackage, D::Error> {
    package_from_value(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
}

pub fn deserialize_registry<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<RegistrySnapshot, D::Error> {
    registry_from_value(Value::deserialize(deserializer)?).map_err(serde::de::Error::custom)
}

pub fn registry_from_value(mut value: Value) -> Result<RegistrySnapshot, String> {
    let original = value.clone();
    let changed = normalize_registry_value(&mut value)?;
    let mut snapshot: RegistrySnapshot =
        serde_json::from_value(value).map_err(|error| error.to_string())?;
    snapshot.integrity_source = changed.then_some(original);
    Ok(snapshot)
}

pub fn deserialize_groups<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<Vec<super::batch::BatchGroup>, D::Error> {
    let mut value = Value::deserialize(deserializer)?;
    normalize_record_value(&mut value).map_err(serde::de::Error::custom)?;
    serde_json::from_value(value).map_err(serde::de::Error::custom)
}

struct LegacyPackage<'a>(&'a TaskPackage, &'a IntegrityProvenance);
impl Serialize for LegacyPackage<'_> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let p = self.0;
        let mut state = serializer.serialize_struct("TaskPackage", 15)?;
        state.serialize_field("taskId", &p.task_id)?;
        state.serialize_field("taskVersion", &p.task_version)?;
        state.serialize_field("specVersions", &p.spec_versions)?;
        state.serialize_field("blueprintSlotId", &self.1.source_slot_id)?;
        state.serialize_field("taskFamilyId", &p.task_family_id)?;
        state.serialize_field("itemFormatId", &p.item_format_id)?;
        state.serialize_field("renderer", &p.renderer)?;
        state.serialize_field("candidatePayload", &p.candidate_payload)?;
        state.serialize_field("authoringPackage", &p.authoring_package)?;
        state.serialize_field("scoringPackage", &p.scoring_package)?;
        state.serialize_field("reviewPackage", &p.review_package)?;
        state.serialize_field("mediaRefs", &p.media_refs)?;
        state.serialize_field("deliveryPolicyRefs", &p.delivery_policy_refs)?;
        state.serialize_field("content", &p.content)?;
        state.serialize_field("variation", &p.variation)?;
        state.end()
    }
}

pub fn integrity_bytes(package: &TaskPackage) -> Vec<u8> {
    match package
        .integrity_provenance
        .as_ref()
        .filter(|source| source.canonical_rule_id == package.item_rule_id)
    {
        Some(source) => {
            if let Some(original) = &source.original_encoding
                && serde_json::to_vec(package).expect("TaskPackage is serializable")
                    == original.canonical_at_read
            {
                return original.bytes.clone();
            }
            serde_json::to_vec(&LegacyPackage(package, source))
                .expect("Legacy package is serializable")
        }
        None => serde_json::to_vec(package).expect("TaskPackage is serializable"),
    }
}

/// Evidence deliberately excludes only these two bookkeeping fields. Normalize
/// both representations before comparing, so old absent fields and string
/// information points retain their original hash representation.
pub fn evidence_integrity_bytes(package: &TaskPackage) -> Vec<u8> {
    let mut reviewed = package.clone();
    reviewed.task_version = "evidence".into();
    reviewed.review_package = Default::default();
    if let Some(source) = package
        .integrity_provenance
        .as_ref()
        .filter(|source| source.canonical_rule_id == package.item_rule_id)
        .and_then(|source| source.original_encoding.as_ref())
    {
        let mut baseline: Value = serde_json::from_slice(&source.canonical_at_read)
            .expect("Saved canonical encoding is JSON");
        baseline["taskVersion"] = json!("evidence");
        baseline["reviewPackage"] = json!({"gates":{}});
        if serde_json::to_value(&reviewed).expect("TaskPackage is serializable") == baseline {
            let mut original: Value =
                serde_json::from_slice(&source.bytes).expect("Saved original encoding is JSON");
            original["taskVersion"] = json!("evidence");
            original["reviewPackage"] = json!({"gates":{}});
            return serde_json::to_vec(&original)
                .expect("Original evidence encoding is serializable");
        }
    }
    integrity_bytes(&reviewed)
}

pub fn verify_immutable_version_value(value: &Value) -> Result<(), String> {
    let package = package_from_value(
        value
            .get("package")
            .cloned()
            .ok_or("An immutable version is missing its package.")?,
    )?;
    if value.get("frozen").and_then(Value::as_bool) == Some(true)
        && value.get("contentHash").and_then(Value::as_str)
            != Some(task_package_hash(&package).as_str())
    {
        return Err("An immutable version failed its original content hash check.".into());
    }
    Ok(())
}

pub fn start_canonical_revision(package: &mut TaskPackage) {
    package.integrity_provenance = None;
    package.spec_versions.task_package_version = "0.2".into();
}

/// Upgrade only an explicitly mutable Registry draft or a new review contract.
pub fn upgrade_mutable_registry_schema(snapshot: &mut Value) -> Result<(), String> {
    let schema = snapshot
        .get_mut("taskPackageSchema")
        .ok_or("Registry is missing its TaskPackage schema.")?;
    upgrade_task_schema(schema)
}

pub fn upgrade_task_schema(schema: &mut Value) -> Result<(), String> {
    let version = schema
        .pointer_mut("/properties/specVersions/properties/taskPackageVersion")
        .ok_or("TaskPackage schema is missing its version contract.")?;
    *version = json!({"const": "0.2"});
    if schema["$id"] == "urn:fcc:exam-creator:language-item-task-package:0.1" {
        schema["$id"] = json!("urn:fcc:exam-creator:language-item-task-package:0.2");
    }
    if schema["title"] == "Exam Creator Language Item TaskPackage v0.1" {
        schema["title"] = json!("Exam Creator Language Item TaskPackage v0.2");
    }
    if let Some(contract) =
        schema.pointer_mut("/properties/scoringPackage/properties/scoringContractTemplateId")
    {
        const BUNDLED_PATTERN: &str = r"^SCT-[RLWS]-A1-[1-4]-(SINGLE-SELECT|MATCHING|RESTRICTED-INPUT|FORM-ENTRY|TYPED-MESSAGE|SPOKEN-SINGLE|SPOKEN-MULTITURN)-v0\.1$";
        if contract.get("pattern").and_then(Value::as_str) == Some(BUNDLED_PATTERN) {
            let fields = contract
                .as_object_mut()
                .expect("A schema property is an object");
            fields.remove("pattern");
            fields.entry("minLength").or_insert(json!(1));
        }
    }
    Ok(())
}

impl<'de> Deserialize<'de> for AiGenerationRun {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let mut value = Value::deserialize(deserializer)?;
        normalize_record_value(&mut value).map_err(serde::de::Error::custom)?;
        AiGenerationRunWire::deserialize(value.into_deserializer())
            .map_err(serde::de::Error::custom)
    }
}

impl<'de> Deserialize<'de> for LanguageItemVersion {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let value = Value::deserialize(deserializer)?;
        verify_immutable_version_value(&value).map_err(serde::de::Error::custom)?;
        LanguageItemVersionWire::deserialize(value.into_deserializer())
            .map_err(serde::de::Error::custom)
    }
}

impl<'de> Deserialize<'de> for BatchGenerationJob {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let mut value = Value::deserialize(deserializer)?;
        normalize_record_value(&mut value).map_err(serde::de::Error::custom)?;
        BatchGenerationJobWire::deserialize(value.into_deserializer())
            .map_err(serde::de::Error::custom)
    }
}

pub fn coverage_metadata_projection(prefix: &str) -> mongodb::bson::Document {
    [
        ("registryVersion", "specVersions.registryBundleVersion"),
        ("itemRuleId", "itemRuleId"),
        ("_historicalIdentity", "blueprintSlotId"),
        ("itemFormatId", "itemFormatId"),
        ("primaryCanDoId", "content.primaryCanDoId"),
        ("skill", "content.primaryReportedSkill"),
        ("activity", "content.communicativeActivity"),
        ("domain", "content.primaryDomain"),
        ("contextId", "content.contextId"),
        ("difficultyBand", "content.difficultyBand"),
        ("coreIds", "content.targetContentIds"),
        ("supportingIds", "content.supportingContentRefs"),
    ]
    .into_iter()
    .map(|(key, path)| (key.to_string(), format!("${prefix}.{path}").into()))
    .collect()
}

pub fn deserialize_coverage_metadata<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<super::coverage::CoverageMetadata, D::Error> {
    let mut value = Value::deserialize(deserializer)?;
    if let Some(source) = value
        .as_object_mut()
        .and_then(|object| object.remove("_historicalIdentity"))
    {
        if !source.is_null() {
            if value.get("itemRuleId").is_some_and(|id| !id.is_null()) {
                return Err(serde::de::Error::custom(
                    "Coverage record contains conflicting identities.",
                ));
            }
            value["blueprintSlotId"] = source;
            normalize_record_value(&mut value).map_err(serde::de::Error::custom)?;
        }
    }
    serde_json::from_value(value).map_err(serde::de::Error::custom)
}

#[derive(Deserialize)]
#[serde(remote = "AiGenerationRun", rename_all = "camelCase")]
struct AiGenerationRunWire {
    pub id: String,
    pub item_id: String,
    pub provider: String,
    pub model: String,
    pub model_version: String,
    pub prompt_id: String,
    pub prompt_version: String,
    pub output_schema_version: String,
    pub spec_versions: SpecVersions,
    pub item_rule_id: String,
    pub task_family_id: String,
    pub item_format_id: String,
    pub renderer_id: String,
    pub primary_can_do_id: String,
    pub primary_domain: String,
    pub context_id: String,
    pub difficulty_band: String,
    pub target_content_ids: Vec<String>,
    pub required_information_points: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub generation_setup_snapshot: Option<Value>,
    pub requested_count: u64,
    pub candidates: Vec<AiCandidate>,
    pub adopted_candidate_id: Option<String>,
    pub status: String,
    pub error: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub idempotency_key: Option<String>,
    #[serde(default)]
    pub attempt_count: u64,
    #[serde(default)]
    pub retry_count: u64,
    #[serde(default)]
    pub candidate_errors: Vec<String>,
    #[serde(default)]
    pub elapsed_milliseconds: Option<u64>,
    #[serde(default)]
    pub provider_calls: Vec<AiProviderCall>,
    pub created_by: String,
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(remote = "LanguageItemVersion", rename_all = "camelCase")]
struct LanguageItemVersionWire {
    pub id: String,
    pub item_id: String,
    pub version_number: u64,
    pub created_from_draft_revision: u64,
    pub author_email: String,
    pub submitted_by: String,
    pub frozen: bool,
    pub content_hash: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub evidence_content_hash: Option<String>,
    pub lifecycle_status: String,
    #[serde(deserialize_with = "super::legacy_identity::deserialize_package")]
    pub package: TaskPackage,
    pub validation: ValidationResult,
    pub created_at: String,
}

#[derive(Deserialize)]
#[serde(remote = "super::batch::BatchGenerationJob", rename_all = "camelCase")]
struct BatchGenerationJobWire {
    pub id: String,
    pub title: String,
    pub owner_email: String,
    pub idempotency_key: String,
    pub request_fingerprint: String,
    pub registry_version: String,
    #[serde(deserialize_with = "super::legacy_identity::deserialize_groups")]
    pub groups: Vec<BatchGroup>,
    pub candidates_per_item: u64,
    pub status: String,
    pub children: Vec<BatchChild>,
    pub error: Option<String>,
    pub worker_token: Option<String>,
    pub lease_expires_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn original_minimal_and_string_point_encodings_preserve_hashes_without_hiding_edits() {
        for (source, original_hash, evidence_hash) in [
            (
                include_str!("legacy/fixtures/minimal.json"),
                "fnv1a64:cd91e97eddee4e71",
                "fnv1a64:61dcfb727a75a6c7",
            ),
            (
                include_str!("legacy/fixtures/string-points.json"),
                "fnv1a64:e807b953023b0faf",
                "fnv1a64:5e5e7df6dccbe195",
            ),
        ] {
            let raw: Value = serde_json::from_str(source).unwrap();
            assert!(raw["scoringPackage"].get("itemScoringVersion").is_none());
            let package = package_from_value(raw.clone()).unwrap();
            assert_eq!(task_package_hash(&package), original_hash);
            assert_eq!(
                super::super::evidence::evidence_content_hash(&package),
                evidence_hash
            );
            assert_eq!(package.scoring_package.item_scoring_version, "0.1");
            let version = json!({"package":raw,"contentHash":original_hash,"frozen":true});
            verify_immutable_version_value(&version).unwrap();
            let mut changed = package.clone();
            changed.candidate_payload =
                CandidatePayload::SingleSelect(SingleSelectCandidatePayload {
                    stimulus: Stimulus {
                        text: Some("Changed material".into()),
                        image_refs: vec![],
                        audio_ref: None,
                    },
                    prompt: "Changed prompt".into(),
                    options: vec![],
                    shuffle_options: false,
                });
            assert_ne!(task_package_hash(&changed), original_hash);
            assert_ne!(
                super::super::evidence::evidence_content_hash(&changed),
                evidence_hash
            );
            let mut bookkeeping = package.clone();
            bookkeeping.task_version = "2".into();
            bookkeeping
                .review_package
                .gates
                .insert("editorial".into(), json!({"decision":"approved"}));
            assert_ne!(task_package_hash(&bookkeeping), original_hash);
            assert_eq!(
                super::super::evidence::evidence_content_hash(&bookkeeping),
                evidence_hash
            );
            let mut revision = package.clone();
            start_canonical_revision(&mut revision);
            let canonical = serde_json::to_value(&revision).unwrap();
            assert!(canonical.get("blueprintSlotId").is_none());
            verify_immutable_version_value(&json!({"package":canonical,"contentHash":task_package_hash(&revision),"frozen":true})).unwrap();
        }
    }

    #[test]
    #[ignore = "Optional read-only verification of a local migration inspection export"]
    fn inspected_historical_packages_retain_recorded_hashes() {
        let path = std::env::var("WORKBENCH_HISTORY_FIXTURE")
            .expect("Set WORKBENCH_HISTORY_FIXTURE to the local inspection JSON");
        let rows: Vec<Value> = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        for row in &rows {
            let record = &row["record"];
            verify_immutable_version_value(record)
                .unwrap_or_else(|error| panic!("{}: {error}", record["id"]));
            let package = package_from_value(record["package"].clone()).unwrap();
            if let Some(expected) = record["evidenceContentHash"].as_str() {
                assert_eq!(
                    super::super::evidence::evidence_content_hash(&package),
                    expected,
                    "{}",
                    record["id"]
                );
            }
        }
        println!(
            "Verified {} original immutable packages and all recorded evidence hashes",
            rows.len()
        );
    }

    fn historical_package() -> (Value, String) {
        let mut package = TaskPackage::new("LI-history".into());
        package.task_version = "1".into();
        package.spec_versions.task_package_version = "0.1".into();
        package.integrity_provenance = Some(IntegrityProvenance {
            source_slot_id: "R-A1-1".into(),
            canonical_rule_id: package.item_rule_id.clone(),
            original_encoding: None,
        });
        let hash = task_package_hash(&package);
        (
            serde_json::from_slice(&integrity_bytes(&package)).unwrap(),
            hash,
        )
    }

    #[test]
    fn immutable_original_hash_survives_canonical_read_and_new_revision_rehashes() {
        let (raw, hash) = historical_package();
        let mut package = package_from_value(raw.clone()).unwrap();
        assert_eq!(task_package_hash(&package), hash);
        let public = serde_json::to_value(&package).unwrap();
        assert!(public.get("blueprintSlotId").is_none());
        assert!(public.get("itemRuleId").is_some());
        let version = json!({"package":raw,"contentHash":hash,"frozen":true});
        verify_immutable_version_value(&version).unwrap();
        let mut corrupt = version.clone();
        corrupt["package"]["taskId"] = json!("LI-forged");
        assert!(verify_immutable_version_value(&corrupt).is_err());
        start_canonical_revision(&mut package);
        let hash = task_package_hash(&package);
        let canonical = serde_json::to_value(&package).unwrap();
        assert_eq!(
            package_from_value(canonical.clone())
                .unwrap()
                .spec_versions
                .task_package_version,
            "0.2"
        );
        verify_immutable_version_value(
            &json!({"package":canonical,"contentHash":hash,"frozen":true}),
        )
        .unwrap();
    }

    #[test]
    fn identity_tuples_are_unique_and_conflicts_fail_closed() {
        assert_eq!(
            legacy_rule_id("R-A1-1", "IF-SINGLE-SELECT", "A1-R1").unwrap(),
            "legacy-rule-5a24db839969ad64af09b47ec5dc290b4b81d186dff05b732dc1eee72beb0e61"
        );
        assert_ne!(
            legacy_rule_id("R-A1-1", "IF-SINGLE-SELECT", "A1-R1").unwrap(),
            legacy_rule_id("R-A1-1", "IF-MATCHING", "A1-R1").unwrap()
        );
        let (mut raw, _) = historical_package();
        raw["itemRuleId"] = json!("conflict");
        assert!(normalize_record_value(&mut raw).is_err());
        assert!(legacy_rule_id("", "IF-SINGLE-SELECT", "A1-R1").is_err());
    }

    #[test]
    fn batch_retry_hash_preserves_explicit_and_default_registry_modes_and_raw_calls() {
        for mode in [None, Some("registry-pinned".to_string())] {
            let group = BatchGroup {
                language: None,
                item_rule_id: legacy_rule_id("R-A1-1", "IF-SINGLE-SELECT", "A1-R1").unwrap(),
                item_format_id: "IF-SINGLE-SELECT".into(),
                primary_can_do_id: "A1-R1".into(),
                primary_domain: "Public".into(),
                context_id: "D09".into(),
                difficulty_band: "A1-typical".into(),
                item_count: 1,
                required_target_content_ids: vec![],
                rotating_target_content_ids: vec![],
            };
            let body = CreateBatchBody {
                title: "Batch".into(),
                idempotency_key: "request".into(),
                registry_version: mode,
                groups: vec![group],
                candidates_per_item: 2,
            };
            let bytes = serde_json::to_vec(&HistoricalBatch(&body, &["R-A1-1".into()])).unwrap();
            let mut job: Value = serde_json::from_slice(&bytes).unwrap();
            job["registryVersion"] = json!("registry-pinned");
            job["requestFingerprint"] = json!(format!("{:x}", Sha256::digest(&bytes)));
            job["providerCalls"] = json!([{"requestBody":{"blueprintSlotId":"private-original"}}]);
            let raw_calls = job["providerCalls"].clone();
            let mut corrupt = job.clone();
            corrupt["requestFingerprint"] = json!("bad");
            assert!(normalize_record_value(&mut corrupt).is_err());
            assert!(normalize_record_value(&mut job).unwrap());
            assert_eq!(
                job["requestFingerprint"],
                super::super::batch::request_fingerprint(&body)
            );
            assert_eq!(job["providerCalls"], raw_calls);
            assert!(!normalize_record_value(&mut job).unwrap());
        }
    }

    #[test]
    fn historical_coverage_uses_metadata_tuple_without_answer_projection() {
        let metadata: super::super::coverage::CoverageMetadata = deserialize_coverage_metadata(json!({"_historicalIdentity":"R-A1-1","itemFormatId":"IF-SINGLE-SELECT","primaryCanDoId":"A1-R1"}).into_deserializer()).unwrap();
        assert_eq!(
            metadata.item_rule_id,
            legacy_rule_id("R-A1-1", "IF-SINGLE-SELECT", "A1-R1").unwrap()
        );
        let projection = coverage_metadata_projection("package");
        let text = format!("{projection:?}");
        assert!(
            !text.contains("candidatePayload")
                && !text.contains("scoringPackage")
                && !text.contains("authoringPackage")
        );
    }

    #[test]
    fn schema_translation_preserves_narrowed_identity_constraints() {
        let mapping = BTreeMap::from([
            (
                "R-A1-1".into(),
                vec![
                    ("IF-SINGLE-SELECT".into(), "rule-one".into()),
                    ("IF-MATCHING".into(), "rule-two".into()),
                ],
            ),
            (
                "R-A1-2".into(),
                vec![("IF-MATCHING".into(), "rule-three".into())],
            ),
        ]);
        let translated = normalize_identity_schema(
            json!({"type":"string","const":"R-A1-1","description":"Only the selected task"}),
            &mapping,
        )
        .unwrap();
        assert_eq!(translated["enum"], json!(["rule-one", "rule-two"]));
        assert_eq!(translated["description"], "Only the selected task");
        let narrow = normalize_identity_schema(json!({"enum":["R-A1-2"]}), &mapping).unwrap();
        assert_eq!(narrow["enum"], json!(["rule-three"]));
        assert!(normalize_identity_schema(json!({"pattern":"^R-"}), &mapping).is_err());
    }
}
