import assert from "node:assert/strict";
import test from "node:test";

import { contentBulkErrors, contentBulkSnapshotKey, currentContentSelection, emptyContentBulkChanges, prepareContentBulkEntries } from "../client/features/language-items/content-bulk-model.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";

const word: ContentIdOption = { id: "one", kind: "lexical", label: "我们", meaning: "we", level: "A1", masteryScope: "receptive", canDoIds: ["read"], contextIds: ["school"], englishGloss: "we", assessment_rules: [{ purpose: "read a notice" }], sourceMetadata: { source: "Imported" } };
const snapshot = { contentIdOptions: [word], canDoOptions: [{ id: "read", label: "Read" }], contextOptions: [{ id: "school", label: "School" }, { id: "retired", label: "Old", retired: true }] } as RegistrySnapshot;

test("bulk defaults preserve every entry, including unknown assessment and source metadata", () => {
  assert.deepEqual(prepareContentBulkEntries([word], emptyContentBulkChanges()), []);
  const original = structuredClone(word);
  const [result] = prepareContentBulkEntries([word], { ...emptyContentBulkChanges(), levelMode: "set", level: " A2 " });
  assert.equal(result.level, "A2");
  assert.deepEqual({ ...result, level: "A1" }, word);
  assert.deepEqual(word, original);
  assert.notEqual(result.assessment_rules, word.assessment_rules);
});

test("bulk level, mastery, and Can-do clear only on explicit actions and exclude unchanged entries", () => {
  const missing = { ...word, id: "empty", level: "", canDoIds: [], contextIds: [], masteryScope: null };
  const cleared = prepareContentBulkEntries([word, missing], { ...emptyContentBulkChanges(), levelMode: "clear", mastery: "", canDoMode: "unrestricted" });
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].level, "");
  assert.equal(cleared[0].masteryScope, null);
  assert.deepEqual(cleared[0].canDoIds, []);
  assert.deepEqual(cleared[0].contextIds, word.contextIds, "bulk editing does not reinterpret a historical snapshot");
  const [replaced] = prepareContentBulkEntries([word], { ...emptyContentBulkChanges(), canDoMode: "selected", canDoIds: ["another"] });
  assert.deepEqual(replaced.canDoIds, ["another"]);
  assert.deepEqual(replaced.contextIds, word.contextIds);
});

test("bulk pinyin never replaces supplied readings and does not change nonselected entries", () => {
  const supplied = { ...word, id: "provided", pinyin: "author supplied reading" };
  const result = prepareContentBulkEntries([word, supplied], emptyContentBulkChanges(), new Map([["one", "wǒ men"], ["provided", "automatic"], ["unselected", "automatic"]]));
  assert.deepEqual(result.map((entry) => entry.id), ["one"]);
  assert.equal(result[0].pinyin, "wǒ men");
  assert.deepEqual(result[0].assessment_rules, word.assessment_rules);
  assert.equal(supplied.pinyin, "author supplied reading");
});

test("bulk validation requires explicit nonempty Can-do selections", () => {
  assert.deepEqual(contentBulkErrors(emptyContentBulkChanges(), snapshot), []);
  assert.match(contentBulkErrors({ ...emptyContentBulkChanges(), levelMode: "set", level: " " }, snapshot).join(" "), /Enter a level/);
  assert.match(contentBulkErrors({ ...emptyContentBulkChanges(), levelMode: "set", level: "A2\nB1" }, snapshot).join(" "), /single line/);
  assert.equal(contentBulkErrors({ ...emptyContentBulkChanges(), canDoMode: "selected" }, snapshot).length, 1);
  assert.deepEqual(contentBulkErrors({ ...emptyContentBulkChanges(), canDoMode: "selected", canDoIds: ["read"] }, snapshot), []);
});

test("bulk snapshot baseline detects unrelated settings and nested rule changes without depending on key order", () => {
  const baseline = contentBulkSnapshotKey(snapshot);
  assert.equal(contentBulkSnapshotKey({ contextOptions: snapshot.contextOptions, contentIdOptions: snapshot.contentIdOptions, canDoOptions: snapshot.canDoOptions } as RegistrySnapshot), baseline);
  assert.notEqual(contentBulkSnapshotKey({ ...snapshot, canDoOptions: [...snapshot.canDoOptions, { id: "new", label: "New" }] }), baseline);
  assert.notEqual(contentBulkSnapshotKey({ ...snapshot, contentIdOptions: [{ ...word, assessment_rules: [{ purpose: "Updated rule" }] }] }), baseline);
  assert.notEqual(contentBulkSnapshotKey({ ...snapshot, contentIdOptions: [] }), baseline);
});

test("catalog selection reports only unique existing filtered entries", () => {
  assert.deepEqual(currentContentSelection(["missing", "one", "hidden", "one"], [word]), ["one"]);
  assert.deepEqual(currentContentSelection(["one"], []), []);
});
