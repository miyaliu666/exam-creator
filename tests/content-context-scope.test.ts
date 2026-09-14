import assert from "node:assert/strict";
import test from "node:test";

import { contentContextMatches, contentContextMode } from "../client/features/language-items/content-context-scope.ts";
import { isContentOptionCompatible } from "../client/features/language-items/content-compatibility.ts";
import { buildContentWorkbook, readContentFile } from "../client/features/language-items/content-import-files.ts";
import { validateContentImport } from "../client/features/language-items/content-import-model.ts";
import { simplifyContentEntry } from "../client/features/language-items/simple-language-content.ts";
import type { ContentIdOption, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

const entry: ContentIdOption = { id: "name", kind: "lexical", label: "名字", meaning: "姓名", contextIds: [], canDoIds: [], masteryScope: null };
const capability = { itemRuleId: "slot", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "personal", primaryReportedSkill: "Listening", supportingCanDoIds: [] } as unknown as RegistryCapability;

test("historical Context scopes retain their saved all, selected, and excluded meanings", () => {
  const selected = { ...entry, contextScopeMode: "selected" as const, contextIds: ["personal"] };
  const none = { ...selected, contextIds: [] };
  const excluded = { ...entry, contextScopeMode: "all" as const, excludedContextIds: ["personal"] };
  assert.equal(contentContextMode(entry), "all");
  assert.equal(contentContextMode({ ...entry, contextIds: ["personal"] }), "selected");
  assert.equal(contentContextMatches(selected, "personal"), true);
  assert.equal(contentContextMatches(selected, "future"), false);
  assert.equal(contentContextMatches(none, "personal"), false);
  assert.equal(contentContextMatches(none, "future"), false);
  assert.equal(contentContextMatches(excluded, "personal"), false);
  assert.equal(contentContextMatches(excluded, "future"), true);
  assert.equal(contentContextMatches(entry, "personal"), true);
  assert.equal(contentContextMatches({ ...excluded, excludedContextIds: [42] } as unknown as ContentIdOption, "future"), false);
});

test("historical Context and exact-combination exclusions still constrain pinned content", () => {
  const selected = { ...entry, contextScopeMode: "selected" as const, contextIds: ["personal"] };
  assert.equal(isContentOptionCompatible(selected, capability, "personal"), true);
  assert.equal(isContentOptionCompatible(selected, capability, "future"), false);
  assert.equal(isContentOptionCompatible({ ...selected, masteryScope: "productive" }, capability, "personal"), false);
  assert.equal(isContentOptionCompatible({ ...selected, canDoIds: ["unrelated"] }, capability, "personal"), false);
  const rule = {
    itemRuleId: capability.itemRuleId, itemFormatId: capability.itemFormatId,
    primaryCanDoId: capability.primaryCanDoId, contextId: "personal", applicability: "excluded" as const,
    assessmentMode: null, communicativePurpose: "", requiredEvidence: [], acceptableResponses: [],
    failurePatterns: [], prerequisites: [], validExamples: [], invalidExamples: [],
  };
  assert.equal(isContentOptionCompatible({ ...selected, assessmentRules: [rule] }, capability, "personal"), false);
});

test("new content exports omit historical Context exceptions", async () => {
  const entries = [
    { ...entry, id: "none", label: "名字一", meaning: "first name", contextScopeMode: "selected" as const },
    { ...entry, id: "excluded", label: "名字二", meaning: "second name", contextScopeMode: "all" as const, excludedContextIds: ["personal"] },
  ];
  const snapshot = { contentIdOptions: entries, canDoOptions: [], contextOptions: [{ id: "personal", label: "Personal", retired: false }] } as unknown as RegistrySnapshot;
  const bytes = await buildContentWorkbook(entries, snapshot);
  const rows = await readContentFile(new File([bytes], "context-roundtrip.xlsx"));
  assert.ok(rows.every((row) => !("contextIds" in row.values)));
  const result = validateContentImport(rows, snapshot, "update");
  assert.deepEqual(result.flatMap((row) => row.errors), []);
  assert.deepEqual(result.map((row) => row.entry), entries.map(simplifyContentEntry));
  assert.deepEqual(result.flatMap((row) => row.changes), []);
});
