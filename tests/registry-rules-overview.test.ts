import assert from "node:assert/strict";
import test from "node:test";

import { filterRegistryOverviewRows, registryRulesOverviewRows } from "../client/features/language-items/registry-rules-overview-model.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

function standard(id: string, count = 1): DifficultyBandStandard {
  return {
    id, label: id, description: `Saved ${id}`, defaultDrivers: { inputLength: "shortSentence", informationPoints: count,
      supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: count, informationPointsMax: count,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
}

function fixture(): RegistrySnapshot {
  const capability: RegistryCapability = {
    blueprintSlotId: "slot", title: "Legacy title", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read-notice",
    taskFamilyId: "family", rendererId: "renderer", scoringContractTemplateId: "contract", primaryReportedSkill: "Reading",
    communicativeActivity: "Reception", allowedDomains: ["Educational"], allowedContextIds: ["classroom"],
    observableEvidence: "Find a room", taskStructure: "A notice", prohibitedUses: [], referenceTask: "Today in room 205",
  };
  const other: RegistryCapability = { ...capability, primaryCanDoId: "read-time", allowedContextIds: ["classroom", "schedule"] };
  return {
    settingsSchemaVersion: 1, bundleVersion: "test", status: "draft", limitations: [], sourceFingerprint: "test",
    capabilities: [capability, other], blueprintSlots: [{ id: "slot", displayName: "Class notices", description: "", allowedItemFormatIds: ["IF-SINGLE-SELECT"] }],
    candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Educational"], difficultyBands: ["LowerA1", "TypicalA1", "UpperA1"],
    difficultyStandards: [standard("LowerA1", 99)],
    capabilityDifficultyProfileSets: [capability, other].map((entry, index) => ({ ...entry, id: `profile-${index}`,
      standards: [standard("LowerA1", index + 1), standard("TypicalA1", index + 2), standard("UpperA1", index + 3)] })),
    canDoOptions: [
      { id: "read-notice", label: "Find a classroom", primarySkill: "Reading", activity: "Reception" },
      { id: "read-time", label: "Find a time", primarySkill: "Reading", activity: "Reception" },
    ],
    contextOptions: [
      { id: "classroom", label: "Classroom notices", primaryDomains: ["Educational"], canDoIds: ["read-notice", "read-time"], scope: "Class notices", exclusions: [], retired: false },
      { id: "schedule", label: "Course timetable", primaryDomains: ["Educational"], canDoIds: ["read-time"], scope: "Course times", exclusions: [], retired: false },
    ],
    contentIdOptions: [
      { id: "room", kind: "lexical", label: "教室", canDoIds: ["read-notice"], contextIds: [], masteryScope: "receptive" },
      { id: "time", kind: "lexical", label: "今天", canDoIds: ["read-time"], contextIds: ["schedule"], masteryScope: null },
      { id: "in", kind: "grammar", label: "在", canDoIds: [], contextIds: [], masteryScope: null },
      { id: "write", kind: "grammar", label: "把", canDoIds: [], contextIds: [], masteryScope: "productive" },
      { id: "name", kind: "supported", label: "personName", canDoIds: [], contextIds: [], masteryScope: null },
    ], requiredReviewGateIds: [],
  };
}

test("overview joins only saved combinations and keeps same-slot primary profiles independent", () => {
  const snapshot = fixture();
  const before = structuredClone(snapshot);
  const rows = registryRulesOverviewRows(snapshot);
  assert.equal(rows.length, 3);
  assert.equal(new Set(rows.map((row) => row.key)).size, 3);
  assert.ok(rows.every((row) => row.slotName === "Class notices"));
  assert.equal(rows[0].difficulties[0].standard?.defaultDrivers.informationPoints, 1);
  assert.equal(rows[1].difficulties[0].standard?.defaultDrivers.informationPoints, 2);
  assert.equal(rows[0].capability.primaryCanDoId, "read-notice");
  assert.equal(rows[1].capability.primaryCanDoId, "read-time");
  assert.equal(rows[0].contentCount, 2);
  assert.equal(rows[1].contentCount, 1);
  assert.equal(rows[2].contentCount, 2);
  assert.deepEqual(snapshot, before);
});

test("empty, missing, retired and incompatible Context bindings remain visible for repair", () => {
  const snapshot = fixture();
  snapshot.capabilities[0].allowedContextIds = [];
  snapshot.capabilities[1].allowedContextIds = ["missing", "classroom", "schedule"];
  snapshot.contextOptions[0].retired = true;
  snapshot.contextOptions[1].canDoIds = ["read-notice"];
  const rows = registryRulesOverviewRows(snapshot);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].contextId, "");
  assert.ok(rows[0].issues.includes("No Context is selected."));
  assert.ok(rows[1].issues.includes("This context no longer exists."));
  assert.ok(rows[2].issues.includes("This context is retired."));
  assert.ok(rows[3].issues.includes("Does not support the selected Primary Can-do."));
  assert.ok(rows.every((row) => row.contentCount === null));
});

test("missing difficulty does not inherit a different primary or global default in current snapshots", () => {
  const snapshot = fixture();
  snapshot.capabilityDifficultyProfileSets!.splice(0, 1);
  const rows = registryRulesOverviewRows(snapshot);
  assert.ok(rows[0].difficulties.every((difficulty) => !difficulty.standard && difficulty.issues.length));
  assert.equal(rows[1].difficulties[0].standard?.defaultDrivers.informationPoints, 2);
  snapshot.settingsSchemaVersion = 0;
  snapshot.capabilityDifficultyProfileSets = [];
  assert.equal(registryRulesOverviewRows(snapshot)[0].difficulties[0].standard?.defaultDrivers.informationPoints, 99);
});

test("saved difficulty ranges and invalid defaults are visible without normalizing the data", () => {
  const snapshot = fixture();
  const saved = snapshot.capabilityDifficultyProfileSets![0].standards[0];
  saved.allowedInputLengths = ["wordOrPhrase", "shortSentence"];
  saved.informationPointsMax = 3;
  saved.defaultDrivers.supportLevel = "limited";
  const before = structuredClone(saved);
  const difficulty = registryRulesOverviewRows(snapshot)[0].difficulties[0];
  assert.ok(difficulty.lines.some((line) => line.includes("allowed: Word or phrase / Short sentence")));
  assert.ok(difficulty.lines.some((line) => line.includes("range: 1–3")));
  assert.ok(difficulty.issues.includes("A saved default is outside its allowed values."));
  assert.deepEqual(saved, before);
});

test("combined filters use actual combination labels without inventing an empty configuration", () => {
  const snapshot = fixture();
  const rows = registryRulesOverviewRows(snapshot);
  assert.equal(filterRegistryOverviewRows(rows, { query: "  classroom TIME ", skill: "Reading", contextId: "classroom" }).length, 1);
  assert.equal(filterRegistryOverviewRows(rows, { query: "", skill: "Speaking", contextId: "" }).length, 0);
  assert.equal(filterRegistryOverviewRows(rows, { query: "", skill: "", contextId: "schedule" }).length, 1);
  snapshot.capabilities = [];
  assert.deepEqual(registryRulesOverviewRows(snapshot), []);
});
