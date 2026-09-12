import assert from "node:assert/strict";
import test from "node:test";
import { buildContentWorkbook, readContentFile, readContentTables } from "../client/features/language-items/content-import-files.ts";
import { canPreviewContentTables, createEmptyImportRow, mapContentTables, parseContentTables, parseContentText, validateContentImport } from "../client/features/language-items/content-import-model.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";

const existing: ContentIdOption = {
  id: "LX-existing", kind: "lexical", label: "你好", meaning: "a greeting", masteryScope: "receptive",
  canDoIds: ["CD-greeting"], contextIds: ["CTX-shop"], examples: ["你好；欢迎", "你好\n朋友"],
  sources: ["https://example.test/a;b"], notes: "Line one\nLine two | notes", sourceRecord: { status: "reviewed", groups: ["greeting"] },
};
const snapshot = {
  contentIdOptions: [existing],
  canDoOptions: [{ id: "CD-greeting", label: "Give a greeting" }, { id: "CD-ambiguous-a", label: "Ambiguous" }, { id: "CD-ambiguous-b", label: "Ambiguous" }],
  contextOptions: [{ id: "CTX-shop", label: "A shop", retired: false }, { id: "CTX-retired", label: "Old context", retired: true }],
} as RegistrySnapshot;
function readyRow() {
  const row = createEmptyImportRow();
  Object.assign(row.values, { label: "谢谢", meaning: "express thanks", masteryScope: "receptiveProductive", canDoIds: "Not restricted", contextIds: "Not restricted" });
  return row;
}
test("Markdown tables parse literal pipes and multiline examples with source row numbers", () => {
  const rows = parseContentText("# Vocabulary\n\n| Name | Meaning | Examples |\n| --- | --- | --- |\n| 好 | good \\| fine | 好<br>你好 |\n");
  assert.equal(rows[0].values.meaning, "good | fine");
  assert.equal(rows[0].values.examples, "好\n你好");
  assert.match(rows[0].source, /row 5/);
});
test("TSV keeps quoted tabs and line breaks and single-column input keeps its first name", () => {
  const rows = parseContentText('Name\tMeaning\n好\t"good\tand\nfine"');
  assert.equal(rows[0].values.meaning, "good\tand\nfine");
  assert.deepEqual(parseContentText("你好\n谢谢").map((row) => row.values.label), ["你好", "谢谢"]);
  assert.throws(() => parseContentText('Name\tMeaning\n好\t"unclosed'), /unclosed/);
});
test("unknown table columns can be explicitly mapped and conflicting mappings fail", () => {
  const tables = parseContentTables("Term\tDescription\n谢谢\texpress thanks");
  assert.deepEqual(tables[0].mapping, ["", ""]);
  tables[0].mapping = ["label", "meaning"];
  assert.equal(mapContentTables(tables)[0].values.meaning, "express thanks");
  tables[0].mapping = ["label", "label"];
  assert.throws(() => mapContentTables(tables), /only be mapped once/);
});
test("recognized tables go directly to preview while unknown or ambiguous columns require mapping", () => {
  const known = parseContentTables("Name\tMeaning\tEnglish gloss\n谢谢\texpress thanks\tthank you");
  assert.equal(canPreviewContentTables(known), true);
  assert.equal(canPreviewContentTables(parseContentTables("你好\n谢谢")), true);
  assert.equal(canPreviewContentTables(parseContentTables("ID\tNotes\nLX-existing\tUpdated note")), true);
  for (const input of ["Term\tDescription\n谢谢\texpress thanks", "Name\tUnknown\n谢谢\tpreserved", "Name\tWord\n谢谢\t您好", "Meaning\tNotes\nthanks\tnote", "Name\t\n谢谢\tpreserved"]) {
    const tables = parseContentTables(input);
    const original = structuredClone(tables);
    assert.equal(canPreviewContentTables(tables), false);
    assert.equal(canPreviewContentTables([...known, ...tables]), false);
    assert.deepEqual(tables, original);
  }
  assert.equal(canPreviewContentTables([]), false);
});
test("blank category cells use the selected add default and stay blank for updates", () => {
  const tables = parseContentTables("Category\tName\tStructure\n\tIdentify\tA 是 B");
  assert.equal(canPreviewContentTables(tables), true);
  assert.equal(mapContentTables(tables, "grammar")[0].values.kind, "grammar");
  assert.equal(mapContentTables(tables, "")[0].values.kind, "");
  tables[0].rows[0].cells[0] = "character";
  assert.equal(mapContentTables(tables, "grammar")[0].values.kind, "character");
});
test("new entries require meaning or structure and blank scopes default to unrestricted", () => {
  const row = createEmptyImportRow(); row.values.label = "好";
  const result = validateContentImport([row], snapshot, "add")[0];
  assert.deepEqual(result.errors.map((issue) => issue.field), ["meaning"]);
  assert.equal(result.entry?.masteryScope, null);
  assert.deepEqual(result.entry?.canDoIds, []);
  assert.deepEqual(result.entry?.contextIds, []);
  row.values.meaning = "good";
  assert.deepEqual(validateContentImport([row], snapshot, "add")[0].errors, []);
  row.values.kind = "grammar";
  assert.ok(validateContentImport([row], snapshot, "add")[0].errors.some((issue) => issue.field === "pattern"));
});
test("references resolve exact IDs and unique names, rejecting retired and ambiguous names", () => {
  const row = readyRow(); row.values.canDoIds = "Give a greeting"; row.values.contextIds = "A shop";
  assert.deepEqual(validateContentImport([row], snapshot, "add")[0].entry?.canDoIds, ["CD-greeting"]);
  row.values.canDoIds = "Ambiguous"; row.values.contextIds = "Old context";
  const result = validateContentImport([row], snapshot, "add")[0];
  assert.ok(result.errors.some((issue) => issue.field === "canDoIds" && issue.message.includes("more than one")));
  assert.ok(result.errors.some((issue) => issue.field === "contextIds" && issue.message.includes("retired")));
});
test("blank updates preserve fields and additional metadata while explicit clear removes optional values", () => {
  const row = parseContentText("ID\tName\tMeaning\tContext\nLX-existing\t\t\t__CLEAR__")[0];
  const result = validateContentImport([row], snapshot, "update")[0];
  assert.deepEqual(result.errors, []);
  assert.equal(result.entry?.meaning, "a greeting");
  assert.equal(result.entry?.masteryScope, "receptive");
  assert.deepEqual(result.entry?.canDoIds, existing.canDoIds);
  assert.deepEqual(result.entry?.sourceRecord, existing.sourceRecord);
  assert.deepEqual(result.entry?.contextIds, []);
  assert.deepEqual(result.changes.map((change) => change.field), ["contextIds"]);
});

test("same-name translated meanings require review while exact duplicates cannot be confirmed", () => {
  const we = { ...existing, label: "我们", meaning: "第一人称复数" };
  const current = { ...snapshot, contentIdOptions: [we] };
  const row = readyRow(); row.values.label = " 我们 "; row.values.meaning = "we";
  let result = validateContentImport([row], current, "add")[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.duplicates, ["我们 — 第一人称复数"]);
  row.values.meaning = "第一人称复数";
  row.duplicateConfirmed = true;
  result = validateContentImport([row], current, "add")[0];
  assert.match(result.errors.map((issue) => issue.message).join(" "), /already exists/);
  assert.deepEqual(result.duplicates, []);
});

test("imports detect bundled Chinese name aliases and require structure equality for exact grammar duplicates", () => {
  const grammar: ContentIdOption = { ...existing, id: "GR-A1-001", kind: "grammar", label: "State identity or category", pattern: "A 是 B" };
  const current = { ...snapshot, contentIdOptions: [grammar] };
  const row = createEmptyImportRow("grammar"); row.values.label = "说明身份或类别"; row.values.pattern = "A 是 B";
  let result = validateContentImport([row], current, "add")[0];
  assert.match(result.errors.map((issue) => issue.message).join(" "), /already exists/);
  row.values.pattern = "A 在 B";
  result = validateContentImport([row], current, "add")[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.duplicates, ["State identity or category — A 是 B"]);
  current.contentIdOptions = [{ ...grammar, label: "My custom rule", englishGloss: row.values.label }];
  assert.deepEqual(validateContentImport([row], current, "add")[0].duplicates, []);
  current.contentIdOptions = [{ ...grammar, id: "custom-grammar", englishGloss: row.values.label }];
  assert.deepEqual(validateContentImport([row], current, "add")[0].duplicates, []);
});

test("import alias unions deduplicate matches and preserve actual name changes on update", () => {
  const grammar: ContentIdOption = { ...existing, id: "GR-A1-001", kind: "grammar", label: "State identity or category", pattern: "A 是 B" };
  const other = { ...grammar, id: "custom-grammar", label: "说明身份或类别", pattern: "A 在 B" };
  const current = { ...snapshot, contentIdOptions: [grammar, other] };
  const row = createEmptyImportRow(""); row.values.id = grammar.id; row.values.pattern = "A 叫 B";
  let result = validateContentImport([row], current, "update")[0];
  assert.deepEqual(result.errors, []);
  assert.equal(result.duplicates.length, 1);
  row.values.pattern = "A 在 B"; row.values.label = "说明身份或类别";
  result = validateContentImport([row], current, "update")[0];
  assert.match(result.errors.map((issue) => issue.message).join(" "), /already exists/);
  const pragmatic = { ...existing, id: "PRAG-GREET", kind: "pragmatics", label: "Greeting" };
  const proposed = createEmptyImportRow("pragmatics"); proposed.values.label = "问候";
  assert.match(validateContentImport([proposed], { ...snapshot, contentIdOptions: [pragmatic] }, "add")[0].errors.map((issue) => issue.message).join(" "), /already exists/);
});

test("exact duplicates among new included rows block import and excluded rows do not", () => {
  const first = readyRow(), second = readyRow();
  assert.ok(validateContentImport([first, second], snapshot, "add").every((row) => row.errors.some((issue) => issue.message.includes("already exists"))));
  second.included = false;
  assert.deepEqual(validateContentImport([first, second], snapshot, "add")[0].errors, []);
});

test("legacy duplicate entries allow ancillary edits but identity-changing updates still reject collisions", () => {
  const copy = { ...existing, id: "LX-legacy-duplicate" };
  const other = { ...existing, id: "LX-other", label: "谢谢", meaning: "express thanks" };
  const current = { ...snapshot, contentIdOptions: [existing, copy, other] };
  const row = createEmptyImportRow(""); row.values.id = copy.id; row.values.notes = "Updated author note";
  let result = validateContentImport([row], current, "update")[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.duplicates, []);
  assert.equal(result.entry?.notes, row.values.notes);
  row.values.label = other.label; row.values.meaning = other.meaning;
  result = validateContentImport([row], current, "update")[0];
  assert.match(result.errors.map((issue) => issue.message).join(" "), /already exists/);
  row.values.meaning = "offer thanks politely";
  result = validateContentImport([row], current, "update")[0];
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.duplicates, ["谢谢 — express thanks"]);
});

test("duplicate detection uses final included updates so renamed entries can exchange identities", () => {
  const second = { ...existing, id: "LX-second", label: "谢谢", meaning: "express thanks" };
  const current = { ...snapshot, contentIdOptions: [existing, second] };
  const firstRow = createEmptyImportRow(""), secondRow = createEmptyImportRow("");
  Object.assign(firstRow.values, { id: existing.id, label: second.label, meaning: second.meaning });
  Object.assign(secondRow.values, { id: second.id, label: existing.label, meaning: existing.meaning });
  const result = validateContentImport([firstRow, secondRow], current, "update");
  assert.deepEqual(result.flatMap((preview) => preview.errors), []);
  assert.deepEqual(result.flatMap((preview) => preview.duplicates), []);
});
test("updates need known IDs, cannot change category, and add does not overwrite", () => {
  const row = readyRow(); row.values.id = existing.id;
  assert.ok(validateContentImport([row], snapshot, "add")[0].errors.some((issue) => issue.field === "id"));
  row.values.kind = "grammar";
  assert.ok(validateContentImport([row], snapshot, "update")[0].errors.some((issue) => issue.field === "kind"));
  row.values.id = "unknown";
  assert.ok(validateContentImport([row], snapshot, "update")[0].errors.some((issue) => issue.field === "id"));
});
test("same names retain distinct meanings with a warning and stable identities survive revalidation", () => {
  const row = readyRow(); row.values.label = "你好"; row.values.meaning = "answer a telephone";
  const first = validateContentImport([row], snapshot, "add")[0];
  const second = validateContentImport([row], snapshot, "add")[0];
  assert.equal(first.entry?.id, second.entry?.id);
  assert.equal(first.duplicates.length, 1);
  assert.equal(first.entry?.meaning, "answer a telephone");
  assert.equal(snapshot.contentIdOptions[0].meaning, "a greeting");
});
test("duplicate IDs within included rows block import, excluded rows do not", () => {
  const first = readyRow(), second = readyRow(); first.values.id = "LX-new"; second.values.id = "LX-new";
  assert.ok(validateContentImport([first, second], snapshot, "add")[0].errors.some((issue) => issue.field === "id"));
  second.included = false;
  assert.equal(validateContentImport([first, second], snapshot, "add")[0].errors.length, 0);
});
test("additional metadata cannot overwrite canonical fields or prototype keys", () => {
  const row = readyRow();
  for (const metadata of ['{"id":"injected"}', '{"__proto__":{"polluted":true}}', '{"constructor":{}}']) {
    row.values.metadata = metadata;
    assert.ok(validateContentImport([row], snapshot, "add")[0].errors.some((issue) => issue.field === "metadata"));
  }
});
test("Excel export and reimport preserves punctuation, line breaks, IDs and unknown metadata", async () => {
  const grammar: ContentIdOption = { id: "GP-1", kind: "grammar", label: "Identify something", pattern: "A 是 B", masteryScope: null, canDoIds: [], contextIds: [], englishGloss: "", examples: [] };
  const supporting: ContentIdOption = { id: "SUP-1", kind: "supported", label: "Names", masteryScope: null, canDoIds: [], contextIds: [] };
  const current = { ...snapshot, contentIdOptions: [existing, grammar, supporting] };
  const bytes = await buildContentWorkbook(current.contentIdOptions, current);
  const rows = await readContentFile(new File([bytes], "roundtrip.xlsx"));
  const result = validateContentImport(rows, current, "update");
  assert.equal(rows.length, 3);
  assert.deepEqual(result.flatMap((row) => row.errors), []);
  assert.deepEqual(result.map((row) => row.entry), current.contentIdOptions);
  assert.deepEqual(result.flatMap((row) => row.changes), []);
});
test("Markdown files require a table while pasted names remain supported", async () => {
  await assert.rejects(readContentTables(new File(["# Vocabulary\n\nHello and goodbye."], "words.md")), /Markdown table/);
  assert.throws(() => parseContentText("| Name | Meaning |\n| 好 | good |"), /Markdown table/);
  assert.equal(parseContentText("你好\n谢谢").length, 2);
});
test("table width and per-import row limits prevent silently discarded cells", () => {
  assert.throws(() => parseContentTables("Name\tMeaning\n好\tgood\tlost data"), /beyond the header/);
  assert.throws(() => parseContentTables(Array(5001).fill("你好").join("\n")), /5,000/);
});
test("visible scope labels are accepted and previously populated assessed meaning cannot be cleared", () => {
  const row = readyRow(); row.values.masteryScope = "Receptive and productive";
  assert.equal(validateContentImport([row], snapshot, "add")[0].entry?.masteryScope, "receptiveProductive");
  row.values.id = existing.id; row.values.meaning = "__CLEAR__";
  assert.ok(validateContentImport([row], snapshot, "update")[0].errors.some((issue) => issue.field === "meaning"));
});
test("mapping respects explicit new-entry category and blank category for updates", () => {
  const tables = parseContentTables("ID\tName\tGrammar structure\n\tIdentify\tA 是 B");
  assert.equal(mapContentTables(tables, "grammar")[0].values.kind, "grammar");
  assert.equal(mapContentTables(tables, "")[0].values.kind, "");
});
test("grammar worksheet supplies its category and refuses formula cells", async () => {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await buildContentWorkbook([], snapshot, true), { type: "array" });
  XLSX.utils.sheet_add_aoa(workbook.Sheets.Grammar, [["", "", "Identify something", "", "A 是 B", "Not restricted", "Not restricted", "Not restricted"]], { origin: "A2" });
  const file = () => new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "template.xlsx");
  const rows = await readContentFile(file());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.kind, "grammar");
  assert.equal(validateContentImport(rows, snapshot, "add")[0].errors.length, 0);
  workbook.Sheets.Grammar.C2 = { t: "s", v: "Cached name", f: '"Cached name"' };
  await assert.rejects(readContentFile(file()), /replace formulas/);
});
test("large duplicate imports keep a bounded preview without merging entries", () => {
  const rows = Array.from({ length: 5000 }, (_, index) => {
    const row = readyRow(); row.values.meaning = `meaning ${index}`; return row;
  });
  const result = validateContentImport(rows, snapshot, "add");
  assert.equal(result.length, 5000);
  assert.equal(new Set(result.map((preview) => preview.entry?.id)).size, 5000);
  assert.ok(result.every((preview) => preview.duplicates.length <= 11 && !preview.errors.length));
});
