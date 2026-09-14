import assert from "node:assert/strict";
import test from "node:test";

import {
  addRegistryConfiguration, changeRegistryConfiguration, configurationBindings,
  removeRegistryConfiguration, compatibleConfigurationPrimaries,
} from "../client/features/language-items/registry-configuration.ts";
import { capabilityForDraft, capabilityKey } from "../client/features/language-items/registry-capability.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot, ScoringContractSummary, TaskPackage } from "../client/features/language-items/types.ts";

function fixture() {
  const selected: RegistryCapability = {
    itemRuleId: "slot", itemFormatId: "IF-TYPED-MESSAGE", primaryCanDoId: "primary",
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
    contentIdOptions: [],
    canDoOptions: [
      { id: "primary", label: "Original", primarySkill: "Writing", activity: "Production" },
      { id: "second", label: "Second", primarySkill: "Writing", activity: "Production" },
      { id: "other-skill", label: "Read", primarySkill: "Reading", activity: "Production" },
      { id: "other-activity", label: "Interact", primarySkill: "Writing", activity: "Interaction" },
    ],
    scoringContracts: [{ scoringContractTemplateId: "contract", itemRuleIds: ["slot"], itemFormatId: "IF-TYPED-MESSAGE" } as ScoringContractSummary],
    taskFamilyOptions: [{ id: "family", displayName: "Messaging", itemRuleIds: ["slot"], allowedItemFormatIds: ["IF-TYPED-MESSAGE"] }],
    difficultyStandards: [standard],
    capabilityDifficultyProfileSets: [{ ...selected, id: "profile", standards: [{ ...structuredClone(standard), description: "Customized original" }] }],
  } as RegistrySnapshot;
  return { snapshot, selected };
}

test("new configurations accept compatible primaries and valid shared bindings", () => {
  const { snapshot, selected } = fixture();
  assert.deepEqual(compatibleConfigurationPrimaries(snapshot, selected).map((entry) => entry.id), ["primary", "second"]);
  const before = JSON.stringify(snapshot);
  for (const primary of ["other-skill", "other-activity", "missing"]) {
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
  assert.notEqual(added.itemRuleId, selected.itemRuleId);
  assert.deepEqual(snapshot.scoringContracts?.[0].itemRuleIds, [selected.itemRuleId, added.itemRuleId]);
  assert.deepEqual(snapshot.taskFamilyOptions?.[0].itemRuleIds, [selected.itemRuleId, added.itemRuleId]);
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
  const another = addRegistryConfiguration(snapshot, selected, "second")!;
  assert.notEqual(another.itemRuleId, added.itemRuleId);
});

test("configuration edits target stable identity after list reordering, never a stale index", () => {
  const { snapshot, selected } = fixture();
  const added = addRegistryConfiguration(snapshot, selected, "second")!;
  snapshot.capabilities.reverse();
  changeRegistryConfiguration(snapshot, selected, (entry) => { entry.observableEvidence = "Updated original"; });
  assert.equal(selected.observableEvidence, "Updated original");
  assert.equal(added.observableEvidence, "");
  const before = JSON.stringify(snapshot);
  changeRegistryConfiguration(snapshot, { ...selected, itemRuleId: "missing" }, (entry) => { entry.title = "Wrong edit"; });
  assert.equal(JSON.stringify(snapshot), before);
});

test("removing a rule cleans its references without deleting shared definitions or requiring siblings", () => {
  const { snapshot, selected } = fixture();
  const library = structuredClone(snapshot.canDoOptions);
  const added = addRegistryConfiguration(snapshot, selected, "second")!;
  removeRegistryConfiguration(snapshot, selected);
  assert.deepEqual(snapshot.capabilities.map((rule) => rule.itemRuleId), [added.itemRuleId]);
  assert.deepEqual(snapshot.scoringContracts?.[0].itemRuleIds, [added.itemRuleId]);
  assert.deepEqual(snapshot.taskFamilyOptions?.[0].itemRuleIds, [added.itemRuleId]);
  assert.deepEqual(snapshot.capabilityDifficultyProfileSets?.map((profile) => profile.itemRuleId), [added.itemRuleId]);
  removeRegistryConfiguration(snapshot, added);
  assert.deepEqual(snapshot.capabilities, []);
  assert.deepEqual(snapshot.scoringContracts?.[0].itemRuleIds, []);
  assert.deepEqual(snapshot.taskFamilyOptions?.[0].itemRuleIds, []);
  assert.deepEqual(snapshot.capabilityDifficultyProfileSets, []);
  assert.deepEqual(snapshot.canDoOptions, library);
});

test("two rules with the same Can-do and format retain distinct identity and authored requirements", () => {
  const { snapshot, selected } = fixture();
  const other = { ...structuredClone(selected), itemRuleId: "another-rule", taskStructure: "A different message" };
  snapshot.capabilities.push(other);
  const packageFor = (itemRuleId: string) => ({ itemRuleId, itemFormatId: selected.itemFormatId,
    content: { primaryCanDoId: selected.primaryCanDoId } }) as TaskPackage;
  assert.notEqual(capabilityKey(selected), capabilityKey(other));
  assert.equal(capabilityForDraft(snapshot, packageFor(selected.itemRuleId)), selected);
  assert.equal(capabilityForDraft(snapshot, packageFor(other.itemRuleId)), other);
  changeRegistryConfiguration(snapshot, other, (rule) => { rule.taskStructure = "Edited separately"; });
  assert.equal(selected.taskStructure, "A message");
  assert.equal(other.taskStructure, "Edited separately");
});

test("a canonical rule ID does not authorize inconsistent format or Can-do assertions", () => {
  const { snapshot, selected } = fixture();
  const package_ = { itemRuleId: selected.itemRuleId, itemFormatId: selected.itemFormatId,
    content: { primaryCanDoId: selected.primaryCanDoId } } as TaskPackage;
  assert.equal(capabilityForDraft(snapshot, package_), selected);
  assert.equal(capabilityForDraft(snapshot, { ...package_, itemRuleId: "missing" }), undefined);
  assert.equal(capabilityForDraft(snapshot, { ...package_, itemFormatId: "IF-SINGLE-SELECT" }), undefined);
  assert.equal(capabilityForDraft(snapshot, { ...package_, content: { ...package_.content, primaryCanDoId: "second" } }), undefined);
});
