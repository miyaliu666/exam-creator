import assert from "node:assert/strict";
import test from "node:test";

import {
  addRegistryConfiguration, changeRegistryConfiguration, configurationBindings,
  removeRegistryConfiguration, unusedConfigurationPrimaries,
} from "../client/features/language-items/registry-configuration.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot, ScoringContractSummary } from "../client/features/language-items/types.ts";

function fixture() {
  const selected: RegistryCapability = {
    blueprintSlotId: "slot", itemFormatId: "IF-TYPED-MESSAGE", primaryCanDoId: "primary",
    title: "Message", taskFamilyId: "family", rendererId: "renderer", scoringContractTemplateId: "contract",
    primaryReportedSkill: "Writing", communicativeActivity: "Production", communicativeActivities: ["Production", "Interaction"],
    supportingCanDoIds: ["support"], allowedContextIds: ["context"], allowedDomains: ["Personal"],
    observableEvidence: "Evidence for the original primary", a1Boundary: "Original boundary", taskFamilyCoreBehavior: "Coverage",
    taskStructure: "A message", prohibitedUses: ["No essay"], referenceTask: "Original example", invalidReferenceTask: "Original non-example",
  };
  const standard: DifficultyBandStandard = {
    id: "LowerA1", label: "Lower A1", description: "Baseline", defaultDrivers: {
      inputLength: "wordOrPhrase", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear",
      independenceLevel: "highlySupported", inferenceRequired: false,
    }, allowedInputLengths: ["wordOrPhrase"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  };
  const snapshot = {
    capabilities: [selected],
    canDoOptions: [
      { id: "primary", label: "Original", primarySkill: "Writing", activity: "Production" },
      { id: "second", label: "Second", primarySkill: "Writing", activity: "Production" },
      { id: "other-skill", label: "Read", primarySkill: "Reading", activity: "Production" },
      { id: "other-activity", label: "Interact", primarySkill: "Writing", activity: "Interaction" },
    ],
    scoringContracts: [{ scoringContractTemplateId: "contract", blueprintSlotId: "slot", itemFormatId: "IF-TYPED-MESSAGE" } as ScoringContractSummary],
    taskFamilyOptions: [{ id: "family", displayName: "Messaging", blueprintSlotIds: ["slot"], allowedItemFormatIds: ["IF-TYPED-MESSAGE"] }],
    difficultyStandards: [standard],
    capabilityDifficultyProfileSets: [{ ...selected, id: "profile", standards: [{ ...structuredClone(standard), description: "Customized original" }] }],
  } as RegistrySnapshot;
  return { snapshot, selected };
}

test("new configurations only accept an unused compatible primary and valid bindings", () => {
  const { snapshot, selected } = fixture();
  assert.deepEqual(unusedConfigurationPrimaries(snapshot, selected).map((entry) => entry.id), ["second"]);
  const before = JSON.stringify(snapshot);
  for (const primary of ["primary", "other-skill", "other-activity", "missing"]) {
    assert.equal(addRegistryConfiguration(snapshot, selected, primary), undefined);
    assert.equal(JSON.stringify(snapshot), before);
  }
  selected.scoringContractTemplateId = "wrong-contract";
  assert.equal(addRegistryConfiguration(snapshot, selected, "second"), undefined);
  selected.scoringContractTemplateId = "contract";
  selected.taskFamilyId = "wrong-family";
  assert.equal(configurationBindings(snapshot, selected).taskFamilyMatches, false);
  assert.equal(addRegistryConfiguration(snapshot, selected, "second"), undefined);
});

test("new primary has independent contexts, evidence and difficulty without copying source estimates", () => {
  const { snapshot, selected } = fixture();
  const original = structuredClone(selected);
  const added = addRegistryConfiguration(snapshot, selected, "second")!;
  assert.ok(added);
  assert.deepEqual(added.allowedContextIds, []);
  assert.deepEqual(added.allowedDomains, []);
  assert.deepEqual(added.supportingCanDoIds, []);
  assert.deepEqual(added.communicativeActivities, ["Production"]);
  for (const key of ["observableEvidence", "a1Boundary", "referenceTask", "invalidReferenceTask"] as const) assert.equal(added[key], "");
  assert.deepEqual(selected, original);
  const profile = snapshot.capabilityDifficultyProfileSets!.find((entry) => entry.primaryCanDoId === "second")!;
  assert.equal(profile.standards[0].description,
    "Input length: Word or phrase. Information points: 1. Contextual support: High. Distractor similarity: Not applicable.");
  assert.equal(profile.standards[0].defaultDrivers.distractorSimilarity, "notApplicable");
  profile.standards[0].description = "New estimate";
  assert.equal(snapshot.difficultyStandards[0].description, "Baseline");
  assert.equal(snapshot.capabilityDifficultyProfileSets![0].standards[0].description, "Customized original");
  assert.equal(addRegistryConfiguration(snapshot, selected, "second"), undefined);
});

test("configuration edits target stable identity after list reordering, never a stale index", () => {
  const { snapshot, selected } = fixture();
  const added = addRegistryConfiguration(snapshot, selected, "second")!;
  snapshot.capabilities.reverse();
  changeRegistryConfiguration(snapshot, selected, (entry) => { entry.observableEvidence = "Updated original"; });
  assert.equal(selected.observableEvidence, "Updated original");
  assert.equal(added.observableEvidence, "");
  const before = JSON.stringify(snapshot);
  changeRegistryConfiguration(snapshot, { ...selected, blueprintSlotId: "missing" }, (entry) => { entry.title = "Wrong edit"; });
  assert.equal(JSON.stringify(snapshot), before);
});

test("removing a configuration deletes only its difficulty profile and preserves the Can-do library", () => {
  const { snapshot, selected } = fixture();
  const library = structuredClone(snapshot.canDoOptions);
  assert.equal(removeRegistryConfiguration(snapshot, selected), undefined);
  const added = addRegistryConfiguration(snapshot, selected, "second")!;
  const unrelated = { ...selected, blueprintSlotId: "another-slot" };
  snapshot.capabilities.push(unrelated);
  snapshot.capabilityDifficultyProfileSets!.push({ ...unrelated, id: "other", standards: [] });
  assert.equal(removeRegistryConfiguration(snapshot, selected), added);
  assert.ok(snapshot.capabilities.includes(unrelated));
  assert.deepEqual(snapshot.canDoOptions, library);
  assert.equal(snapshot.capabilityDifficultyProfileSets!.length, 2);
  assert.ok(snapshot.capabilityDifficultyProfileSets!.every((entry) => entry.blueprintSlotId !== "slot" || entry.primaryCanDoId === "second"));
  assert.equal(removeRegistryConfiguration(snapshot, added), undefined);
});
