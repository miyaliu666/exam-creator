import assert from "node:assert/strict";
import test from "node:test";

import { applySharedRegistryEdit, canDoReferenceCount, sharedRegistryImpact } from "../client/features/language-items/registry-shared-edit-model.ts";
import type { RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

function fixture(): RegistrySnapshot {
  const capability = { itemRuleId: "slot", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", title: "Read a notice",
    primaryReportedSkill: "Reading", communicativeActivity: "Reception", allowedContextIds: ["classroom"], allowedDomains: ["Educational"] } as RegistryCapability;
  return { bundleVersion: "test", capabilities: [capability], allowedDomains: ["Educational", "Personal"],
    contextOptions: [{ id: "classroom", label: "Classroom", primaryDomains: ["Educational"], canDoIds: ["read"], scope: "Class notices", retired: false, exclusions: [] }],
    canDoOptions: [{ id: "read", label: "Read a notice", primarySkill: "Reading", activity: "Reception" }],
    contentIdOptions: [{ id: "word", kind: "lexical", label: "教室", canDoIds: [], contextIds: [], masteryScope: null }],
  } as RegistrySnapshot;
}

test("shared Can-do edits preserve current item bindings and expose the required skill repair", () => {
  const initial = fixture();
  const staged = structuredClone(initial);
  staged.canDoOptions[0].primarySkill = "Listening";
  const current = structuredClone(initial);
  const originalCapability = structuredClone(current.capabilities[0]);
  assert.equal(applySharedRegistryEdit(current, initial, staged, "canDo"), true);
  assert.equal(current.canDoOptions[0].primarySkill, "Listening");
  assert.deepEqual(current.capabilities[0], originalCapability);
  assert.deepEqual(current.contextOptions, initial.contextOptions);
  assert.ok(sharedRegistryImpact(initial, staged, "canDo")[0].includes("Skill or activity needs repair"));
});

test("Context retirement retains explicit links for repair instead of deleting draft requirements", () => {
  const initial = fixture();
  const staged = structuredClone(initial);
  staged.contextOptions[0].retired = true;
  const current = structuredClone(initial);
  assert.equal(applySharedRegistryEdit(current, initial, staged, "contexts"), true);
  assert.deepEqual(current.capabilities[0].allowedContextIds, ["classroom"]);
  assert.deepEqual(current.contextOptions[0].canDoIds, ["read"]);
  assert.deepEqual(current.capabilities[0].allowedDomains, []);
  assert.ok(sharedRegistryImpact(initial, staged, "contexts")[0].includes("retired"));
});

test("changing a shared Context updates derived Domains while preserving the actual associations", () => {
  const initial = fixture();
  const staged = structuredClone(initial);
  staged.contextOptions[0].primaryDomains = ["Personal"];
  const current = structuredClone(initial);
  assert.equal(applySharedRegistryEdit(current, initial, staged, "contexts"), true);
  assert.deepEqual(current.capabilities[0].allowedDomains, ["Personal"]);
  assert.deepEqual(current.capabilities[0].allowedContextIds, initial.capabilities[0].allowedContextIds);
  assert.deepEqual(current.contentIdOptions, initial.contentIdOptions);
});

test("a stale shared edit cannot overwrite a remote or intervening local change", () => {
  const initial = fixture();
  const staged = structuredClone(initial);
  staged.canDoOptions[0].label = "My pending edit";
  const current = structuredClone(initial);
  current.contentIdOptions[0].notes = "Changed elsewhere";
  const before = structuredClone(current);
  assert.equal(applySharedRegistryEdit(current, initial, staged, "canDo"), false);
  assert.deepEqual(current, before);
});

test("Can-do deletion protection includes combination assessment-rule references", () => {
  const snapshot = fixture();
  snapshot.contentIdOptions[0].assessmentRules = [{ itemRuleId: "other", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "only-rule", contextId: "classroom",
    applicability: "allowed", assessmentMode: "understanding", communicativePurpose: "Read", requiredEvidence: ["Understand"], acceptableResponses: [], failurePatterns: [], prerequisites: [], validExamples: [], invalidExamples: [] }];
  assert.equal(canDoReferenceCount(snapshot, "only-rule"), 1);
  assert.equal(canDoReferenceCount(snapshot, "unused"), 0);
});
