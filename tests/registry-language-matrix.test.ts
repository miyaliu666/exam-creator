import assert from "node:assert/strict";
import test from "node:test";

import { createContentAssessmentRule } from "../client/features/language-items/content-assessment-rules.ts";
import { isContentOptionCompatible } from "../client/features/language-items/content-compatibility.ts";
import { EMPTY_MATRIX_FILTERS, languageMatrixCell, languageMatrixColumns, languageMatrixEntries, orphanedAssessmentRules } from "../client/features/language-items/registry-language-matrix-model.ts";
import type { ContentIdOption, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

function fixture() {
  const capability = { blueprintSlotId: "slot", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", primaryReportedSkill: "Reading", allowedContextIds: ["class"], supportingCanDoIds: [], title: "Notice" } as RegistryCapability;
  const entry: ContentIdOption = { id: "word", kind: "lexical", label: "开", meaning: "打开", englishGloss: "open", masteryScope: null, canDoIds: [], contextIds: [] };
  const snapshot = { bundleVersion: "one", capabilities: [capability, { ...capability, primaryCanDoId: "other" }], contentIdOptions: [entry, { ...entry, id: "drive", meaning: "驾驶", englishGloss: "drive" }, { ...entry, id: "background", kind: "supported" }], contextOptions: [{ id: "class", label: "Class", primaryDomains: ["Educational"], canDoIds: ["read", "other"], scope: "Classes", exclusions: [], retired: false }], allowedDomains: ["Educational"] } as RegistrySnapshot;
  return { snapshot, capability, entry };
}

test("matrix columns retain complete Can-do bindings rather than merging the skill and Context", () => {
  const { snapshot } = fixture();
  const columns = languageMatrixColumns(snapshot, EMPTY_MATRIX_FILTERS);
  assert.equal(columns.length, 2);
  assert.notEqual(columns[0].key, columns[1].key);
  snapshot.capabilities[0].allowedContextIds = [];
  assert.equal(languageMatrixColumns(snapshot, EMPTY_MATRIX_FILTERS).length, 1);
  snapshot.contextOptions[0].retired = true;
  assert.equal(languageMatrixColumns(snapshot, EMPTY_MATRIX_FILTERS).length, 0);
});

test("unrestricted scope is allowed while missing assessment evidence remains undefined", () => {
  const { snapshot, entry } = fixture();
  const column = languageMatrixColumns(snapshot, EMPTY_MATRIX_FILTERS)[0];
  assert.deepEqual(languageMatrixCell(entry, column), { allowed: true, label: "Allowed", detail: "Assessment rule not defined" });
});

test("an exclusion affects only its exact combination and allowed rules do not override scopes", () => {
  const { snapshot, capability, entry } = fixture();
  const rule = createContentAssessmentRule(entry, capability, "class");
  rule.applicability = "excluded";
  entry.assessmentRules = [rule];
  assert.equal(isContentOptionCompatible(entry, capability, "class"), false);
  assert.equal(isContentOptionCompatible(entry, snapshot.capabilities[1], "class"), true);
  rule.applicability = "allowed";
  entry.masteryScope = "productive";
  assert.equal(isContentOptionCompatible(entry, capability, "class"), false);
});

test("matrix retains distinct meanings, searches English and excludes supporting types", () => {
  const { snapshot } = fixture();
  assert.deepEqual(languageMatrixEntries(snapshot, EMPTY_MATRIX_FILTERS).map((entry) => entry.id), ["word", "drive"]);
  assert.deepEqual(languageMatrixEntries(snapshot, { ...EMPTY_MATRIX_FILTERS, query: "drive" }).map((entry) => entry.id), ["drive"]);
  assert.deepEqual(languageMatrixEntries(snapshot, { ...EMPTY_MATRIX_FILTERS, query: "打开" }).map((entry) => entry.id), ["word"]);
});

test("removed or incompatible bindings stay discoverable for explicit repair", () => {
  const { snapshot, entry, capability } = fixture();
  entry.assessmentRules = [createContentAssessmentRule(entry, capability, "class")];
  assert.equal(orphanedAssessmentRules(snapshot).length, 0);
  snapshot.contextOptions[0].retired = true;
  assert.match(orphanedAssessmentRules(snapshot)[0].reason, /Context/);
  snapshot.capabilities = [];
  assert.match(orphanedAssessmentRules(snapshot)[0].reason, /Item rules/);
  assert.equal(entry.assessmentRules.length, 1);
});

test("a production mode saved for Reading remains visibly incomplete", () => {
  const { snapshot, capability, entry } = fixture();
  const rule = createContentAssessmentRule(entry, capability, "class");
  Object.assign(rule, { assessmentMode: "controlledProduction", communicativePurpose: "Use a sentence", requiredEvidence: ["Write a sentence"] });
  entry.assessmentRules = [rule];
  const column = languageMatrixColumns(snapshot, EMPTY_MATRIX_FILTERS).find((value) => value.capability.primaryCanDoId === capability.primaryCanDoId)!;
  assert.equal(languageMatrixCell(entry, column).detail, "Assessment rule incomplete");
});
