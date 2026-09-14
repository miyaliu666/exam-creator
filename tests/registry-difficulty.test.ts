import assert from "node:assert/strict";
import test from "node:test";

import {
  changeAllowedDifficultyValues, changeDifficultyStandard, DIFFICULTY_LEVELS, hasApplicableDistractors,
  difficultyChoiceState, independenceFieldState, initialDifficultyStandards, restoreMissingDifficultyLevels,
  selectedDifficultyStandard, setDistractorsNotApplicable, setFixedDifficultyValue, setFixedInformationPoints, usesDistractors,
} from "../client/features/language-items/registry-difficulty.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

function standard(id = "LowerA1"): DifficultyBandStandard {
  return { id, label: "Previously customized label", description: "Saved definition", defaultDrivers: {
    inputLength: "wordOrPhrase", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear",
    independenceLevel: "highlySupported", inferenceRequired: false,
  }, allowedInputLengths: ["wordOrPhrase", "shortSentence"], informationPointsMin: 1, informationPointsMax: 2,
  allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"] };
}

function fixture() {
  const first = { itemRuleId: "slot", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "primary-1" } as RegistryCapability;
  const second = { ...first, itemRuleId: "second-rule", primaryCanDoId: "primary-2" };
  const snapshot = { settingsSchemaVersion: 1, difficultyStandards: DIFFICULTY_LEVELS.map(({ id }) => standard(id)),
    capabilityDifficultyProfileSets: [first, second].map((capability, index) => ({ ...capability, id: `profile-${index}`, standards: [standard()] })),
  } as RegistrySnapshot;
  return { snapshot, first, second };
}

test("difficulty reads and edits follow the selected rule and reject mismatched assertions", () => {
  const { snapshot, first, second } = fixture();
  changeDifficultyStandard(snapshot, second, "LowerA1", (entry) => { entry.description = "Second configuration"; });
  assert.equal(selectedDifficultyStandard(snapshot, first, "LowerA1")?.description, "Saved definition");
  assert.equal(selectedDifficultyStandard(snapshot, second, "LowerA1")?.description, "Second configuration");
  assert.equal(selectedDifficultyStandard(snapshot, { ...second, itemFormatId: "IF-MATCHING" }, "LowerA1"), undefined);
  assert.throws(() => changeDifficultyStandard(snapshot, { ...second, itemFormatId: "IF-MATCHING" }, "LowerA1", () => assert.fail("Mismatched rules cannot change a profile")), /different Item rules/);
  assert.equal(selectedDifficultyStandard(snapshot, { ...second, itemRuleId: "other-slot" }, "LowerA1"), undefined);
});

test("difficulty labels are fixed without rewriting saved labels", () => {
  const { snapshot, first } = fixture();
  assert.deepEqual(DIFFICULTY_LEVELS.map(({ label }) => label), ["Lower A1", "Typical A1", "Upper A1"]);
  selectedDifficultyStandard(snapshot, first, "LowerA1");
  assert.equal(snapshot.capabilityDifficultyProfileSets?.[0].standards[0].label, "Previously customized label");
});

test("initial open-response settings derive not applicable distractors without mutating baseline", () => {
  const { snapshot } = fixture();
  for (const format of ["IF-RESTRICTED-INPUT", "IF-FORM-ENTRY", "IF-TYPED-MESSAGE", "IF-SPOKEN-SINGLE", "IF-SPOKEN-MULTITURN"]) {
    assert.equal(usesDistractors(format), false);
    assert.ok(initialDifficultyStandards(snapshot, format).every((entry) => !hasApplicableDistractors(entry)));
  }
  for (const format of ["IF-SINGLE-SELECT", "IF-MATCHING"]) {
    assert.equal(usesDistractors(format), true);
    assert.equal(initialDifficultyStandards(snapshot, format)[0].defaultDrivers.distractorSimilarity, "clear");
  }
  assert.equal(snapshot.difficultyStandards[0].defaultDrivers.distractorSimilarity, "clear");
});

test("missing levels restore only absent data in the selected profile", () => {
  const { snapshot, first, second } = fixture();
  changeDifficultyStandard(snapshot, second, "LowerA1", (entry) => { entry.description = "Keep existing"; });
  restoreMissingDifficultyLevels(snapshot, second);
  assert.equal(selectedDifficultyStandard(snapshot, second, "LowerA1")?.description, "Keep existing");
  assert.equal(selectedDifficultyStandard(snapshot, second, "UpperA1")?.id, "UpperA1");
  assert.equal(selectedDifficultyStandard(snapshot, first, "UpperA1"), undefined);
  assert.equal(snapshot.capabilityDifficultyProfileSets?.length, 2);
});

test("saved non-applicable errors remain unchanged until an explicit repair", () => {
  const { snapshot, first } = fixture();
  const before = JSON.stringify(snapshot);
  assert.ok(hasApplicableDistractors(selectedDifficultyStandard(snapshot, first, "LowerA1")!));
  assert.equal(JSON.stringify(snapshot), before);
  changeDifficultyStandard(snapshot, first, "LowerA1", setDistractorsNotApplicable);
  assert.equal(hasApplicableDistractors(selectedDifficultyStandard(snapshot, first, "LowerA1")!), false);
});

test("choosing a single allowed value sets its default in the same explicit edit", () => {
  const entry = standard();
  changeAllowedDifficultyValues(entry, "inputLength", ["shortSentence"]);
  assert.deepEqual(entry.allowedInputLengths, ["shortSentence"]);
  assert.equal(entry.defaultDrivers.inputLength, "shortSentence");
  changeAllowedDifficultyValues(entry, "inputLength", ["wordOrPhrase", "shortSentence"]);
  assert.equal(entry.defaultDrivers.inputLength, "shortSentence");
});

test("range edits never promote unrecognized saved values to defaults", () => {
  const entry = standard();
  changeAllowedDifficultyValues(entry, "inputLength", ["obsolete-value", "shortSentence"]);
  assert.equal(entry.defaultDrivers.inputLength, "shortSentence");
  assert.deepEqual(entry.allowedInputLengths, ["obsolete-value", "shortSentence"]);
  changeAllowedDifficultyValues(entry, "inputLength", []);
  assert.deepEqual(entry.allowedInputLengths, []);
  assert.equal(entry.defaultDrivers.inputLength, "shortSentence");
});

test("modern missing profiles do not borrow global settings and recover only explicitly", () => {
  const { snapshot, second } = fixture();
  snapshot.capabilityDifficultyProfileSets = [];
  assert.equal(selectedDifficultyStandard(snapshot, second, "LowerA1"), undefined);
  assert.equal(snapshot.capabilityDifficultyProfileSets.length, 0);
  restoreMissingDifficultyLevels(snapshot, second);
  assert.equal(snapshot.capabilityDifficultyProfileSets.length, 1);
  assert.equal(selectedDifficultyStandard(snapshot, second, "UpperA1")?.id, "UpperA1");
});

test("legacy rule editing clones source data without normalization or changes to its baseline", () => {
  const { snapshot, first } = fixture();
  snapshot.settingsSchemaVersion = 0;
  snapshot.capabilityDifficultyProfileSets = [];
  const openCapability = { ...first, itemFormatId: "IF-TYPED-MESSAGE" };
  assert.equal(selectedDifficultyStandard(snapshot, openCapability, "LowerA1")?.defaultDrivers.distractorSimilarity, "clear");
  changeDifficultyStandard(snapshot, openCapability, "LowerA1", (entry) => { entry.description = "Updated explicitly"; });
  assert.equal(snapshot.difficultyStandards[0].description, "Saved definition");
  assert.equal(selectedDifficultyStandard(snapshot, openCapability, "LowerA1")?.defaultDrivers.distractorSimilarity, "clear");
});

test("invalid saved independence stays visibly selected instead of falling back to a valid level", () => {
  for (const savedValue of ["obsolete-level", ""]) {
    const state = independenceFieldState(savedValue);
    assert.equal(state.invalid, true);
    assert.deepEqual(state.options.find(({ id }) => id === savedValue), { id: savedValue, label: "Invalid saved value" });
    assert.deepEqual(state.options.slice(1).map(({ id }) => id), ["highlySupported", "partlySupported", "independent"]);
  }
  const valid = independenceFieldState("independent");
  assert.equal(valid.invalid, false);
  assert.equal(valid.options.some(({ label }) => label === "Invalid saved value"), false);
});

test("reading simplified fields preserves and distinguishes a saved range from a fixed value", () => {
  const entry = standard();
  const before = structuredClone(entry);
  const input = difficultyChoiceState(entry, "inputLength");
  assert.equal(input.value, "wordOrPhrase");
  assert.deepEqual(input.allowed, ["wordOrPhrase", "shortSentence"]);
  assert.equal(input.fixed, false);
  assert.equal(input.invalid, false);
  const support = difficultyChoiceState(entry, "supportLevel");
  assert.equal(support.fixed, true);
  assert.equal(support.invalid, false);
  assert.deepEqual(entry, before);
});

test("missing, unknown and mismatched saved choices remain invalid without being repaired on read", () => {
  for (const allowed of [[], ["obsolete-support"], ["high", "obsolete-support"], ["limited"]]) {
    const entry = standard();
    entry.allowedSupportLevels = allowed;
    const before = structuredClone(entry);
    const state = difficultyChoiceState(entry, "supportLevel");
    assert.equal(state.value, "high");
    assert.deepEqual(state.allowed, allowed);
    assert.equal(state.invalid, true);
    assert.equal(state.fixed, false);
    assert.deepEqual(entry, before);
  }
});

test("fixing a difficulty choice changes its driver and summary only in the selected level and configuration", () => {
  const { snapshot, first, second } = fixture();
  restoreMissingDifficultyLevels(snapshot, second);
  const before = structuredClone(snapshot);
  changeDifficultyStandard(snapshot, second, "UpperA1", (entry) => setFixedDifficultyValue(entry, "inputLength", "shortSentence"));
  const selected = selectedDifficultyStandard(snapshot, second, "UpperA1")!;
  assert.equal(selected.defaultDrivers.inputLength, "shortSentence");
  assert.deepEqual(selected.allowedInputLengths, ["shortSentence"]);
  assert.equal(difficultyChoiceState(selected, "inputLength").fixed, true);
  const expected = selectedDifficultyStandard(before, second, "UpperA1")!;
  expected.defaultDrivers.inputLength = "shortSentence";
  expected.allowedInputLengths = ["shortSentence"];
  expected.description = "Input length: Short sentence. Information points: 1. Contextual support: High. Distractor similarity: Clearly different.";
  assert.deepEqual(snapshot, before);
  assert.equal(selectedDifficultyStandard(snapshot, first, "LowerA1")?.description, "Saved definition");
});

test("choice formats retain valid historical distractor ranges without mislabeling them as invalid", () => {
  const entry = standard();
  entry.allowedDistractorSimilarities = ["clear", "notApplicable"];
  const before = structuredClone(entry);
  const state = difficultyChoiceState(entry, "distractorSimilarity");
  assert.deepEqual(state.options, ["clear", "moderate", "close"]);
  assert.deepEqual(state.allowed, ["clear", "notApplicable"]);
  assert.equal(state.invalid, false);
  assert.equal(state.fixed, false);
  assert.deepEqual(entry, before);
  setFixedDifficultyValue(entry, "distractorSimilarity", "moderate");
  assert.equal(entry.defaultDrivers.distractorSimilarity, "moderate");
  assert.deepEqual(entry.allowedDistractorSimilarities, ["moderate"]);
  assert.equal(difficultyChoiceState(entry, "distractorSimilarity").fixed, true);
  setDistractorsNotApplicable(entry);
  assert.match(entry.description, /Distractor similarity: Not applicable\./);
  const notApplicable = difficultyChoiceState(entry, "distractorSimilarity");
  assert.equal(notApplicable.value, "notApplicable");
  assert.equal(notApplicable.invalid, true);
  assert.equal(notApplicable.fixed, false);
});

test("an unsupported fixed choice cannot discard saved difficulty settings", () => {
  const entry = standard();
  const before = structuredClone(entry);
  setFixedDifficultyValue(entry, "inputLength", "obsolete-length");
  setFixedDifficultyValue(entry, "distractorSimilarity", "notApplicable");
  assert.deepEqual(entry, before);
});

test("explicit information-point edits replace default and range together without clamping invalid input", () => {
  for (const count of [2, 0, 1.5, 256]) {
    const entry = standard();
    const before = structuredClone(entry);
    setFixedInformationPoints(entry, count);
    assert.equal(entry.defaultDrivers.informationPoints, count);
    assert.equal(entry.informationPointsMin, count);
    assert.equal(entry.informationPointsMax, count);
    before.defaultDrivers.informationPoints = count;
    before.informationPointsMin = count;
    before.informationPointsMax = count;
    before.description = `Input length: Word or phrase. Information points: ${count}. Contextual support: High. Distractor similarity: Clearly different.`;
    assert.deepEqual(entry, before);
  }
});

test("explicit difficulty edits refresh stale prose used by new-item rationale and AI constraints", () => {
  const entry = standard();
  entry.description = "One information point with strong contextual support.";
  difficultyChoiceState(entry, "supportLevel");
  assert.equal(entry.description, "One information point with strong contextual support.");
  setFixedDifficultyValue(entry, "supportLevel", "limited");
  assert.equal(entry.description, "Input length: Word or phrase. Information points: 1. Contextual support: Limited. Distractor similarity: Clearly different.");
  setFixedInformationPoints(entry, 2);
  assert.equal(entry.description, "Input length: Word or phrase. Information points: 2. Contextual support: Limited. Distractor similarity: Clearly different.");
});
