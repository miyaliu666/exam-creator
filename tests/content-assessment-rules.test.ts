import assert from "node:assert/strict";
import test from "node:test";

import {
  contentAssessmentModeOptions, contentAssessmentRuleBaseline, contentAssessmentRuleIssues,
  contentAssessmentRuleKey, contentAssessmentRuleScopeConflicts, createContentAssessmentRule,
  getContentAssessmentRule, prepareContentAssessmentRule, replaceContentAssessmentRule,
} from "../client/features/language-items/content-assessment-rules.ts";
import type { ContentAssessmentRule, ContentIdOption, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

const capability = {
  blueprintSlotId: "slot", itemFormatId: "single", primaryCanDoId: "read", primaryReportedSkill: "Reading",
  supportingCanDoIds: ["related"], allowedContextIds: ["school"],
} as RegistryCapability;
const entry: ContentIdOption = { id: "grammar", kind: "grammar", label: "在／不在", contextIds: [], canDoIds: [], masteryScope: null };
const rule: ContentAssessmentRule = {
  ...createContentAssessmentRule(entry, capability, "school"), assessmentMode: "understanding",
  communicativePurpose: "Find the classroom", requiredEvidence: ["Distinguish the actual classroom from the negated location"],
  extension: { reviewed: false },
};
const configured = { ...entry, assessmentRules: [rule] };
const snapshot = {
  bundleVersion: "draft-1", contentIdOptions: [configured], capabilities: [capability],
  contextOptions: [{ id: "school", label: "School", retired: false, canDoIds: ["read"], scope: "Classroom notices", primaryDomains: ["Educational"] }],
} as RegistrySnapshot;

test("rules match the complete Item rules and Context identity without changing legacy entries", () => {
  assert.equal(getContentAssessmentRule(entry, capability, "school"), undefined);
  assert.equal(getContentAssessmentRule(configured, capability, "school"), rule);
  assert.equal(getContentAssessmentRule(configured, { ...capability, blueprintSlotId: "other" }, "school"), undefined);
  assert.equal(getContentAssessmentRule(configured, { ...capability, itemFormatId: "other" }, "school"), undefined);
  assert.equal(getContentAssessmentRule(configured, { ...capability, primaryCanDoId: "other" }, "school"), undefined);
  assert.equal(getContentAssessmentRule(configured, capability, "home"), undefined);
  assert.notEqual(contentAssessmentRuleKey({ ...rule, contextId: "a::b", primaryCanDoId: "c" }), contentAssessmentRuleKey({ ...rule, contextId: "b", primaryCanDoId: "c::a" }));
  assert.equal(Object.hasOwn(entry, "assessmentRules"), false);
});

test("explicit exclusions prevail when legacy duplicates conflict", () => {
  const excluded = { ...rule, applicability: "excluded" as const };
  assert.equal(getContentAssessmentRule({ ...entry, assessmentRules: [rule, excluded] }, capability, "school"), excluded);
  assert.equal(getContentAssessmentRule({ ...entry, assessmentRules: [excluded, rule] }, capability, "school"), excluded);
});

test("staging and applying preserve unknown metadata and other combinations without mutating the entry", () => {
  const other = { ...rule, contextId: "home", extension: { reviewed: true } };
  const original = { ...configured, assessmentRules: [rule, other], source: { note: "preserve" } };
  const staged = createContentAssessmentRule(original, capability, "school");
  staged.communicativePurpose = "New purpose";
  const next = replaceContentAssessmentRule(original, capability, "school", staged);
  assert.equal(original.assessmentRules[0].communicativePurpose, "Find the classroom");
  assert.equal(next.assessmentRules?.[0].communicativePurpose, "New purpose");
  assert.deepEqual(next.assessmentRules?.[0].extension, { reviewed: false });
  assert.deepEqual(next.assessmentRules?.[1], other);
  assert.deepEqual(next.source, original.source);
  assert.notEqual(next.source, original.source);
  assert.throws(() => replaceContentAssessmentRule(original, capability, "school", other), /must match/);
});

test("explicit removal restores scope and preserves rules for other combinations", () => {
  const original = { ...configured, contextIds: ["school"], assessmentRules: [rule, { ...rule, contextId: "home" }] };
  const next = replaceContentAssessmentRule(original, capability, "school", null);
  assert.equal(getContentAssessmentRule(next, capability, "school"), undefined);
  assert.equal(next.assessmentRules?.length, 1);
  assert.deepEqual(next.contextIds, original.contextIds);
  assert.equal(Object.hasOwn(replaceContentAssessmentRule(entry, capability, "school", null), "assessmentRules"), false);
});

test("allowed rules do not widen Can-do, Context or mastery scope", () => {
  const restricted = { ...configured, contextIds: ["home"], canDoIds: ["write"], masteryScope: "productive" };
  assert.equal(contentAssessmentRuleScopeConflicts(restricted, capability, "school").length, 3);
  assert.deepEqual(contentAssessmentRuleScopeConflicts(configured, capability, "school"), []);
  assert.deepEqual(contentAssessmentRuleScopeConflicts({ ...configured, canDoIds: ["related"], masteryScope: "receptive" }, capability, "school"), []);
  assert.equal(contentAssessmentRuleScopeConflicts({ ...entry, masteryScope: "unknown" }, capability, "school").length, 1);
});

test("mode choices follow receptive and productive skills while incomplete drafts remain representable", () => {
  for (const skill of ["Reading", "Listening"]) assert.deepEqual(contentAssessmentModeOptions({ primaryReportedSkill: skill }).map((option) => option.id), ["understanding"]);
  for (const skill of ["Writing", "Speaking"]) assert.deepEqual(contentAssessmentModeOptions({ primaryReportedSkill: skill }).map((option) => option.id), ["controlledProduction", "freeProduction"]);
  assert.deepEqual(contentAssessmentModeOptions({ primaryReportedSkill: "Unknown" }), []);
  assert.deepEqual(contentAssessmentRuleIssues(rule, capability), []);
  assert.match(contentAssessmentRuleIssues({ ...rule, requiredEvidence: ["Valid evidence", " "] }, capability).join(" "), /blank lines/);
  assert.equal(contentAssessmentRuleIssues(createContentAssessmentRule(entry, capability, "school"), capability).length, 3);
  assert.deepEqual(contentAssessmentRuleIssues({ ...rule, applicability: "excluded", assessmentMode: null, communicativePurpose: "", requiredEvidence: [] }, capability), []);
  assert.match(contentAssessmentRuleIssues({ ...rule, assessmentMode: "controlledProduction" }, capability).join(" "), /does not match/);
  assert.match(contentAssessmentRuleIssues(rule, { ...capability, primaryReportedSkill: "Writing" }).join(" "), /does not match/);
});

test("preparation cleans changed fields only and preserves untouched authored values", () => {
  const initial = { ...rule, communicativePurpose: "  original purpose  ", validExamples: ["  original spacing  "] };
  const staged = { ...initial, requiredEvidence: ["  target relationship  ", " "] };
  const next = prepareContentAssessmentRule(staged, initial);
  assert.deepEqual(next.requiredEvidence, ["target relationship"]);
  assert.equal(next.communicativePurpose, initial.communicativePurpose);
  assert.deepEqual(next.validExamples, initial.validExamples);
  assert.deepEqual(next.extension, initial.extension);
  assert.deepEqual(staged.requiredEvidence, ["  target relationship  ", " "]);
});

test("baseline detects changes to the entry, Item rules, Context and Registry identity", () => {
  const baseline = contentAssessmentRuleBaseline(configured, capability, "school", snapshot);
  assert.equal(contentAssessmentRuleBaseline(configured, capability, "school", structuredClone(snapshot)), baseline);
  for (const changed of [
    { ...snapshot, bundleVersion: "draft-2" },
    { ...snapshot, contentIdOptions: [{ ...configured, label: "updated" }] },
    { ...snapshot, contentIdOptions: [] },
    { ...snapshot, capabilities: [{ ...capability, primaryReportedSkill: "Listening" }] },
    { ...snapshot, capabilities: [] },
    { ...snapshot, contextOptions: [{ ...snapshot.contextOptions[0], retired: true }] },
    { ...snapshot, contextOptions: [] },
  ]) assert.notEqual(contentAssessmentRuleBaseline(configured, capability, "school", changed), baseline);
  assert.equal(contentAssessmentRuleBaseline(configured, capability, "school", { ...snapshot, contentIdOptions: [...snapshot.contentIdOptions, { ...entry, id: "other" }] }), baseline);
  assert.equal(contentAssessmentRuleBaseline(configured, capability, "school", { ...snapshot, contentIdOptions: [{ assessmentRules: [rule], ...entry }] }), baseline);
});
