import assert from "node:assert/strict";
import test from "node:test";

import { contentEntryBaselineMatches, contentEntryErrors, contentEntryIdentityChanged, duplicateContentEntries, filterContentEntries, prepareContentEntry, sameNameContentEntries, type ContentCatalogFilters } from "../client/features/language-items/content-catalog-model.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";

const entry: ContentIdOption = { id: "word", kind: "lexical", label: "你好", englishGloss: "hello", masteryScope: "receptive", canDoIds: ["greeting"], contextIds: ["home"] };
const snapshot = {
  canDoOptions: [{ id: "greeting", label: "Greeting" }],
  contextOptions: [{ id: "home", label: "Home", retired: false }, { id: "old", label: "Old", retired: true }],
} as RegistrySnapshot;
const filters: ContentCatalogFilters = { kind: "", query: "", mastery: "all", canDoId: "", contextId: "" };

test("new vocabulary and grammar require meaning or structure while legacy edits remain possible", () => {
  assert.deepEqual(contentEntryErrors(entry, snapshot, false), []);
  assert.match(contentEntryErrors(entry, snapshot, true).join(" "), /meaning/);
  assert.deepEqual(contentEntryErrors({ ...entry, meaning: "A greeting" }, snapshot, true), []);
  assert.match(contentEntryErrors({ ...entry, kind: "grammar" }, snapshot, true).join(" "), /structure/);
  assert.deepEqual(contentEntryErrors({ ...entry, kind: "grammar", pattern: "A 是 B" }, snapshot, true), []);
  assert.match(contentEntryErrors({ ...entry, meaning: "" }, snapshot, false).join(" "), /meaning/);
  assert.match(contentEntryErrors({ ...entry, kind: "grammar", pattern: "" }, snapshot, false).join(" "), /structure/);
});

test("invalid references, retired Contexts and unknown mastery remain visible as repair errors", () => {
  const result = contentEntryErrors({ ...entry, masteryScope: "future", canDoIds: ["missing"], contextIds: ["old"] }, snapshot, false);
  assert.equal(result.length, 3);
  assert.match(result.join(" "), /Can-do/);
  assert.match(result.join(" "), /retired Context/);
  assert.deepEqual(contentEntryErrors({ ...entry, masteryScope: null, canDoIds: [], contextIds: [] }, snapshot, false), []);
});

test("homonyms with different meanings and grammar structures are separate entries", () => {
  const entries = [{ ...entry, meaning: "greeting" }, { ...entry, id: "other-meaning", meaning: "checking a connection" }];
  assert.deepEqual(duplicateContentEntries({ ...entry, id: "new", meaning: " GREETING " }, entries).map((value) => value.id), ["word"]);
  assert.deepEqual(duplicateContentEntries(entries[0], entries), []);
  assert.deepEqual(duplicateContentEntries({ ...entry, id: "new", kind: "grammar", pattern: "A 是 B" }, entries), []);
});

test("same-name detection catches translated meanings without merging different categories", () => {
  const existing = { ...entry, label: "我们", meaning: "第一人称复数" };
  const proposed = { ...entry, id: "new", label: "  我们  ", meaning: "we" };
  assert.deepEqual(sameNameContentEntries(proposed, [existing]).map((value) => value.id), [existing.id]);
  assert.deepEqual(duplicateContentEntries(proposed, [existing]), []);
  assert.deepEqual(sameNameContentEntries({ ...proposed, kind: "character" }, [existing]), []);
});

test("bundled grammar and pragmatics match either established Chinese or English name", () => {
  const grammar = { ...entry, id: "GR-A1-001", kind: "grammar", label: "State identity or category", pattern: "A 是 B" };
  const chinese = { ...grammar, id: "custom-grammar", label: "说明身份或类别" };
  assert.deepEqual(sameNameContentEntries(chinese, [grammar]), [grammar]);
  assert.deepEqual(duplicateContentEntries(chinese, [grammar]), [grammar]);
  assert.deepEqual(duplicateContentEntries({ ...chinese, pattern: "A 在 B" }, [grammar]), []);
  assert.deepEqual(sameNameContentEntries({ ...chinese, label: grammar.label }, [{ ...grammar, label: chinese.label }]).map((value) => value.id), [grammar.id]);
  assert.equal(contentEntryIdentityChanged({ ...grammar, label: chinese.label }, grammar), true);
  const pragmatic = { ...entry, id: "PRAG-GREET", kind: "pragmatics", label: "Greeting" };
  assert.deepEqual(duplicateContentEntries({ ...pragmatic, id: "custom-pragmatic", label: "问候" }, [pragmatic]), [pragmatic]);
});

test("renamed and custom rules do not inherit former display aliases or authored English meanings", () => {
  const grammar = { ...entry, id: "GR-A1-001", kind: "grammar", label: "State identity or category", pattern: "A 是 B" };
  const chinese = { ...grammar, id: "custom-grammar", label: "说明身份或类别" };
  assert.deepEqual(sameNameContentEntries(chinese, [{ ...grammar, label: "My custom rule", englishGloss: chinese.label }]), []);
  assert.deepEqual(sameNameContentEntries(chinese, [{ ...grammar, id: "other-custom", englishGloss: chinese.label }]), []);
  assert.deepEqual(duplicateContentEntries(chinese, [{ ...grammar, englishGloss: "" }]).map((value) => value.id), [grammar.id]);
});

test("identity normalization ignores unrelated metadata but preserves category-specific meaning", () => {
  const lexical = { ...entry, label: "ＡＢＣ", meaning: "  A   GREETING  ", pattern: "old unrelated structure" };
  assert.deepEqual(duplicateContentEntries({ ...lexical, id: "new", label: "abc", meaning: "a greeting", pattern: "different unrelated structure" }, [lexical]), [lexical]);
  const grammar = { ...entry, kind: "grammar", pattern: "A 是 B", meaning: "legacy" };
  assert.deepEqual(duplicateContentEntries({ ...grammar, id: "new", meaning: "changed legacy" }, [grammar]), [grammar]);
  assert.equal(contentEntryIdentityChanged({ ...lexical, notes: "New note", canDoIds: [] }, lexical), false);
  assert.equal(contentEntryIdentityChanged({ ...lexical, label: "abc", meaning: "a greeting" }, lexical), false);
  assert.equal(contentEntryIdentityChanged({ ...lexical, meaning: "Another meaning" }, lexical), true);
  assert.equal(contentEntryIdentityChanged({ ...grammar, pattern: "A 在 B" }, grammar), true);
  const character = { ...entry, kind: "character", meaning: "legacy meaning" };
  assert.equal(contentEntryIdentityChanged({ ...character, meaning: "edited legacy meaning" }, character), false);
});

test("Can-do and Context applicability filters include unrestricted entries without mutating data", () => {
  const entries = [entry, { ...entry, id: "unrestricted", canDoIds: [], contextIds: [] }, { ...entry, id: "elsewhere", contextIds: ["away"] }];
  const before = JSON.stringify(entries);
  assert.deepEqual(filterContentEntries(entries, { ...filters, canDoId: "greeting", contextId: "home" }).map((value) => value.id), ["word", "unrestricted"]);
  assert.deepEqual(filterContentEntries(entries, { ...filters, contextId: "__unrestricted" }).map((value) => value.id), ["unrestricted"]);
  assert.equal(JSON.stringify(entries), before);
});

test("search matches authored metadata and bilingual fallback while mastery and category stay independent", () => {
  const entries = [entry, { ...entry, id: "grammar", kind: "grammar", label: "判断句", pattern: "A 是 B", masteryScope: null }, { ...entry, id: "custom", label: "再见", pinyin: "zai jian", meaning: "A farewell", englishGloss: "Goodbye" }];
  for (const query of ["FAREWELL", "zai jian", "GOODBYE"]) assert.deepEqual(filterContentEntries(entries, { ...filters, query }).map((value) => value.id), ["custom"]);
  assert.equal(filterContentEntries(entries, { ...filters, query: "hello" })[0]?.id, "word");
  assert.deepEqual(filterContentEntries(entries, { ...filters, kind: "grammar", mastery: "" }).map((value) => value.id), ["grammar"]);
});

test("staged edits preserve unknown metadata and omitted legacy fields without mutating the original", () => {
  const original = { ...entry, examples: ["  original spacing  "], sourceMetadata: { reviewState: "provisional", variants: ["您好"] } };
  const staged = { ...structuredClone(original), label: "  您好  " };
  const result = prepareContentEntry(staged, original);
  assert.equal(result.label, "您好");
  assert.deepEqual(result.canDoIds, ["greeting"]);
  assert.deepEqual(result.contextIds, ["home"]);
  assert.deepEqual(result.examples, original.examples);
  assert.deepEqual((result as typeof original).sourceMetadata, original.sourceMetadata);
  assert.equal(Object.hasOwn(result, "meaning"), false);
  assert.deepEqual(original.contextIds, ["home"]);
  assert.equal(original.label, "你好");
  assert.notEqual((result as typeof original).sourceMetadata, original.sourceMetadata);
});

test("explicit scope edits use their canonical values without changing untouched scope fields", () => {
  const result = prepareContentEntry({ ...entry, contextIds: [], masteryScope: null }, entry);
  assert.deepEqual(result.contextIds, []);
  assert.equal(result.masteryScope, null);
  assert.deepEqual(result.canDoIds, ["greeting"]);
  assert.deepEqual(entry.contextIds, ["home"]);
});

test("entry baseline detects refreshed changes, deletion and new-ID collisions before staged apply", () => {
  const opened = { ...entry, sourceMetadata: { reviewState: "provisional", variants: ["您好"] } };
  assert.equal(contentEntryBaselineMatches(opened, [structuredClone(opened)], false), true);
  assert.equal(contentEntryBaselineMatches(opened, [{ ...opened, label: "您好" }], false), false);
  assert.equal(contentEntryBaselineMatches(opened, [{ ...opened, sourceMetadata: { reviewState: "reviewed", variants: ["您好"] } }], false), false);
  assert.equal(contentEntryBaselineMatches(opened, [], false), false);
  assert.equal(contentEntryBaselineMatches(opened, [opened], true), false);
  assert.equal(contentEntryBaselineMatches(opened, [], true), true);
});

test("entry baseline ignores JSON key ordering and unrelated entry updates", () => {
  const opened = { ...entry, sourceMetadata: { reviewState: "provisional", variants: ["您好"] } };
  const reread = { sourceMetadata: { variants: ["您好"], reviewState: "provisional" }, ...entry };
  assert.equal(contentEntryBaselineMatches(opened, [reread, { ...entry, id: "unrelated", label: "Changed elsewhere" }], false), true);
});
