import assert from "node:assert/strict";
import test from "node:test";

import { EXERCISE_TEMPLATES } from "../client/features/language-items/exercise-template-catalog.ts";
import { applyExerciseRule, canRefreshExerciseRuleBaseline, exerciseRuleIssues, exerciseRuleSearchText, newExerciseRule } from "../client/features/language-items/exercise-settings-model.ts";
import type { DifficultyBandStandard, RegistrySnapshot } from "../client/features/language-items/types.ts";

function standard(id: string): DifficultyBandStandard {
  return { id, label: id, description: "Read short phrases.", defaultDrivers: {
    inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false,
  }, allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1, allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"] };
}
function fixture(): RegistrySnapshot {
  return {
    bundleVersion: "test", status: "draft", sourceFingerprint: "test", limitations: [], capabilities: [], candidateSchemas: [], taskPackageSchema: {},
    allowedDomains: ["Educational", "Personal"], difficultyBands: ["LowerA1", "TypicalA1", "UpperA1"], difficultyStandards: [standard("LowerA1"), standard("TypicalA1"), standard("UpperA1")],
    canDoOptions: [{ id: "read", label: "Find the room in a notice", primarySkill: "Reading", activity: "Reception" }],
    contextOptions: [{ id: "class", label: "Class notices", primaryDomains: ["Educational"], canDoIds: ["read"], scope: "Class notices", exclusions: [], retired: false }],
    contentIdOptions: [{ id: "word", kind: "lexical", label: "教室", canDoIds: [], contextIds: [], masteryScope: null, unknownSourceField: { preserved: true } }],
    requiredReviewGateIds: [],
  };
}
function configured(snapshot: RegistrySnapshot) {
  return { ...newExerciseRule(snapshot, EXERCISE_TEMPLATES[0].id), primaryCanDoId: "read", allowedDomains: ["Educational"],
    taskRequirements: "Find the room in a short class notice.", scoring: { method: "exactMatch" as const, criteria: "One point for the correct room.", normalizationPolicy: "Accept the same room number with optional spaces." } };
}

test("a configured template applies without Context enumeration and preserves independent settings", () => {
  const initial = fixture();
  const current = structuredClone(initial);
  const rule = configured(initial);
  assert.deepEqual(exerciseRuleIssues(initial, rule), []);
  assert.equal(applyExerciseRule(current, initial, rule), true);
  assert.deepEqual(current.exerciseTemplateRules, [rule]);
  assert.deepEqual(current.contentIdOptions, initial.contentIdOptions);
  assert.deepEqual(current.contextOptions, initial.contextOptions);
  assert.deepEqual(current.capabilities, initial.capabilities);
  current.exerciseTemplateRules![0].defaults.test = "Changed";
  assert.equal(rule.defaults.test, undefined, "applied rules cannot alias staged input");
});

test("stale apply and a duplicate Can-do/template pairing never write over settings", () => {
  const initial = fixture();
  const rule = configured(initial);
  const current = structuredClone(initial);
  current.contentIdOptions[0].notes = "Changed while the editor was open";
  const before = structuredClone(current);
  assert.equal(applyExerciseRule(current, initial, rule), false);
  assert.deepEqual(current, before);
  const occupied = { ...structuredClone(initial), exerciseTemplateRules: [rule] };
  const duplicate = { ...structuredClone(rule), id: "copy" };
  assert.ok(exerciseRuleIssues(occupied, duplicate).some((issue) => issue.includes("already has rules")));
  assert.equal(applyExerciseRule(occupied, structuredClone(occupied), duplicate), false);
  assert.equal(occupied.exerciseTemplateRules.length, 1);
});

test("a clean rule can follow a shared Can-do edit, while staged or conflicting rule changes remain protected", () => {
  const initial = fixture();
  const rule = configured(initial);
  initial.exerciseTemplateRules = [rule];
  const current = structuredClone(initial);
  current.canDoOptions[0].label = "Find a location in a short notice";
  assert.equal(canRefreshExerciseRuleBaseline(current, rule, false), true);
  assert.equal(canRefreshExerciseRuleBaseline(current, rule, true), false, "unapplied rule changes retain their saved baseline");
  const applied = structuredClone(current);
  assert.equal(applyExerciseRule(applied, current, { ...rule, taskRequirements: "Find the location stated in a short notice." }), true);
  assert.equal(applied.canDoOptions[0].label, current.canDoOptions[0].label, "applying a rule preserves the shared edit");
  current.exerciseTemplateRules![0].taskRequirements = "Changed elsewhere";
  assert.equal(canRefreshExerciseRuleBaseline(current, rule, false), false, "a changed exact rule must be reopened");
  current.exerciseTemplateRules = [];
  assert.equal(canRefreshExerciseRuleBaseline(current, rule, false), false, "a removed rule must not be recreated by applying old details");
});

test("explicit Context restrictions cannot silently widen Domain or Can-do scope", () => {
  const snapshot = fixture();
  const rule = configured(snapshot);
  rule.allowedContextIds = ["class"];
  rule.allowedDomains = ["Personal"];
  assert.ok(exerciseRuleIssues(snapshot, rule).some((issue) => issue.includes("allowed Domains")));
  assert.deepEqual(rule.allowedContextIds, ["class"]);
  rule.allowedDomains = ["Educational"];
  snapshot.contextOptions[0].canDoIds = ["another-ability"];
  assert.ok(exerciseRuleIssues(snapshot, rule).some((issue) => issue.includes("does not allow this Can-do")));
  snapshot.contextOptions[0].canDoIds = [];
  assert.ok(exerciseRuleIssues(snapshot, rule).some((issue) => issue.includes("does not allow this Can-do")), "an empty Context Can-do list never permits every ability");
});

test("all source templates are configurable while names remain exact and defaults independent", () => {
  const snapshot = fixture();
  assert.equal(EXERCISE_TEMPLATES.length, 60);
  for (const template of EXERCISE_TEMPLATES) {
    const rule = { ...configured(snapshot), exerciseType: template.id };
    assert.deepEqual(exerciseRuleIssues(snapshot, rule), [], template.name);
    assert.ok(exerciseRuleSearchText(snapshot, rule).includes(template.name.toLocaleLowerCase()), template.name);
  }
  const rule = configured(snapshot);
  rule.difficultyStandards[0].defaultDrivers.informationPoints = 9;
  assert.equal(snapshot.difficultyStandards[0].defaultDrivers.informationPoints, 1);
  assert.ok(exerciseRuleIssues(snapshot, rule).some((issue) => issue.includes("information points")));
});
