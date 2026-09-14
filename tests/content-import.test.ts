import assert from "node:assert/strict";
import test from "node:test";
import { buildContentMarkdownTemplate, buildContentWorkbook, readContentFile, readContentTables } from "../client/features/language-items/content-import-files.ts";
import { fillImportPinyin, invalidateImportPinyin } from "../client/features/language-items/content-import-pinyin.ts";
import { canPreviewContentTables, createEmptyImportRow, mapContentTables, parseContentTables, parseContentText, validateContentImport } from "../client/features/language-items/content-import-model.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";
import { contentLanguage, contentLanguageLabel, parseContentLanguage } from "../client/features/language-items/content-language.ts";
import { sampleContentImportRows } from "../client/features/language-items/content-language-samples.ts";
import { simplifyContentEntry } from "../client/features/language-items/simple-language-content.ts";

const existing: ContentIdOption = {
  id: "LX-existing", kind: "lexical", level: "HSK 1", label: "你好", meaning: "a greeting", masteryScope: "receptive",
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
  Object.assign(row.values, { label: "谢谢", meaning: "express thanks", masteryScope: "receptiveProductive", canDoIds: "Not restricted" });
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

test("ordinary vocabulary sheets recognize level and translations without adding a category column", async () => {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Level", "Vocabulary", "Pinyin", "Translation"], ["A2", "啊", "a", "ah, oh"]]), "Vocabulary");
  const tables = await readContentTables(new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "language-content.xlsx"));
  assert.deepEqual(tables[0].headers, ["Level", "Vocabulary", "Pinyin", "Translation"]);
  assert.deepEqual(tables[0].mapping, ["level", "label", "pinyin", "meaning"]);
  assert.equal(tables[0].defaultKind, "lexical");
  assert.equal(canPreviewContentTables(tables), true);
  const result = validateContentImport(mapContentTables(tables, "grammar"), snapshot, "add")[0];
  assert.deepEqual(result.errors, []);
  assert.equal(result.entry?.level, "A2");
  assert.equal(result.entry?.meaning, "ah, oh");
  assert.equal(result.entry?.englishGloss, undefined);
  assert.equal(result.entry?.pinyin, "a");
});

test("English, Spanish and Chinese word lists need only a name and meaning, with optional free-text levels", () => {
  for (const input of ["Level\tWord\tTranslation\nB1\tweekend\t周末", "级别\t词汇\t意思\nA2\tsemana\tweek", "等级\t名称\t翻译\nHSK 3\t周末\tweekend", "Name\tMeaning\nsaludo\tgreeting"]) {
    const tables = parseContentTables(input);
    assert.equal(canPreviewContentTables(tables), true);
    const result = validateContentImport(mapContentTables(tables), snapshot, "add")[0];
    assert.deepEqual(result.errors, []);
    assert.equal(result.entry?.masteryScope, null);
    assert.deepEqual(result.entry?.contextIds, []);
    assert.deepEqual(result.entry?.canDoIds, []);
    assert.equal(result.entry?.englishGloss, undefined);
  }
});

test("level updates preserve blank values and permit explicit clearing without changing other fields", () => {
  const row = createEmptyImportRow(""); row.values.id = existing.id;
  assert.equal(validateContentImport([row], snapshot, "update")[0].entry?.level, "HSK 1");
  row.values.level = "__CLEAR__";
  assert.equal(validateContentImport([row], snapshot, "update")[0].entry?.level, "");
  row.values.level = "HSK\n3";
  assert.ok(validateContentImport([row], snapshot, "update")[0].errors.some(({ field }) => field === "level"));
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
test("Can-do references resolve exact IDs and unique names", () => {
  const row = readyRow(); row.values.canDoIds = "Give a greeting";
  assert.deepEqual(validateContentImport([row], snapshot, "add")[0].entry?.canDoIds, ["CD-greeting"]);
  row.values.canDoIds = "Ambiguous";
  const result = validateContentImport([row], snapshot, "add")[0];
  assert.ok(result.errors.some((issue) => issue.field === "canDoIds" && issue.message.includes("more than one")));
});
test("blank updates preserve authored fields while dropping old Context exceptions", () => {
  const table = parseContentTables("ID\tName\tMeaning\tContext\nLX-existing\t\t\tCTX-shop");
  assert.equal(canPreviewContentTables(table), false);
  table[0].mapping[3] = "__ignore";
  assert.equal(canPreviewContentTables(table), true);
  const row = mapContentTables(table)[0];
  const result = validateContentImport([row], snapshot, "update")[0];
  assert.deepEqual(result.errors, []);
  assert.equal(result.entry?.meaning, "a greeting");
  assert.equal(result.entry?.masteryScope, "receptive");
  assert.deepEqual(result.entry?.canDoIds, existing.canDoIds);
  assert.deepEqual(result.entry?.sourceRecord, existing.sourceRecord);
  assert.deepEqual(result.entry?.contextIds, []);
  assert.deepEqual(result.changes, []);
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
  assert.deepEqual(result.map((row) => row.entry), current.contentIdOptions.map(simplifyContentEntry));
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
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Vocabulary, { header: 1 }), [["Language", "Level", "Name", "Meaning", "Pinyin"]]);
  assert.deepEqual(XLSX.utils.sheet_to_json(workbook.Sheets.Grammar, { header: 1 }), [["Language", "Level", "Name", "Structure", "Meaning"]]);
  XLSX.utils.sheet_add_aoa(workbook.Sheets.Grammar, [["Chinese", "A2", "Identify something", "A 是 B", ""]], { origin: "A2" });
  const file = () => new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "template.xlsx");
  const rows = await readContentFile(file());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].values.kind, "grammar");
  assert.equal(validateContentImport(rows, snapshot, "add")[0].errors.length, 0);
  workbook.Sheets.Grammar.C2 = { t: "s", v: "Cached name", f: '"Cached name"' };
  await assert.rejects(readContentFile(file()), /replace formulas/);
});

test("Markdown templates keep basic columns and infer each table category from its heading", () => {
  const text = buildContentMarkdownTemplate().replace("| --- | --- | --- | --- | --- |\n\n## Grammar", "| --- | --- | --- | --- | --- |\n| Chinese | A1 | 谢谢 | thanks | |\n\n## Grammar") + "| zh | A2 | 因为……所以…… | 因为……所以…… | |\n";
  const tables = parseContentTables(text);
  assert.deepEqual(tables.map((table) => table.defaultKind), ["lexical", "grammar"]);
  assert.equal(canPreviewContentTables(tables), true);
  const results = validateContentImport(mapContentTables(tables), snapshot, "add");
  assert.deepEqual(results.flatMap((result) => result.errors), []);
  assert.deepEqual(results.map((result) => result.entry?.kind), ["lexical", "grammar"]);
});

test("missing Chinese pinyin is generated into editable previews while supplied and cleared values are preserved", async () => {
  const rows = parseContentText("Name\tMeaning\tPinyin\n周末\tweekend\t\n谢谢\tthanks\tauthored pronunciation\nsemana\tweek\t");
  const result = await fillImportPinyin(rows, snapshot, "add");
  assert.equal(result[0].values.pinyin, "zhōu mò");
  assert.deepEqual(result[0].generatedPinyin, { label: "周末", value: "zhōu mò" });
  assert.equal(result[1].values.pinyin, "authored pronunciation");
  assert.equal(result[2].values.pinyin, "");
  assert.equal(rows[0].values.pinyin, "");
  const update = createEmptyImportRow(""); update.values.id = existing.id; update.values.pinyin = "__CLEAR__";
  assert.equal((await fillImportPinyin([update], snapshot, "update"))[0].values.pinyin, "__CLEAR__");
});

test("renaming clears only unchanged generated pinyin, never supplied or manually edited values", async () => {
  const source = readyRow(); source.values.label = "周末";
  const generated = (await fillImportPinyin([source], snapshot, "add"))[0];
  const renamed = invalidateImportPinyin(generated, { ...generated, values: { ...generated.values, label: "星期" } });
  assert.equal(renamed.values.pinyin, "");
  assert.equal(renamed.generatedPinyin, undefined);
  const edited = invalidateImportPinyin(generated, { ...generated, values: { ...generated.values, pinyin: "manual" } });
  assert.equal(edited.generatedPinyin, undefined);
  assert.equal(invalidateImportPinyin(edited, { ...edited, values: { ...edited.values, label: "星期" } }).values.pinyin, "manual");
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

test("language aliases normalize to explicit codes and legacy Chinese stays unchanged", () => {
  const original = structuredClone(existing);
  assert.equal(contentLanguage(existing), "zh");
  assert.deepEqual(existing, original);
  for (const [code, labels] of [["zh", ["zh", "Chinese", "中文"]], ["en", ["en", "English", "英语"]], ["es", ["es", "Spanish", "西班牙语", "español"]]] as const) {
    for (const label of labels) {
      assert.equal(parseContentLanguage(label), code);
      const row = readyRow(); row.values.language = label;
      assert.equal(validateContentImport([row], snapshot, "add")[0].entry?.language, code);
    }
  }
  assert.equal(contentLanguageLabel("es"), "Spanish");
  assert.equal(contentLanguage({ language: "fr" }), "fr");
  for (const value of ["French", "__CLEAR__", "constructor", "__proto__"]) {
    const row = readyRow(); row.values.language = value;
    assert.ok(validateContentImport([row], snapshot, "add")[0].errors.some((issue) => issue.field === "language"));
  }
});

test("import language defaults fill blank new rows while explicit mixed languages win", () => {
  const tables = parseContentTables("Language\tName\tMeaning\n\tlibro\tbook\nEnglish\twater\ta drink\n中文\t书\tbook");
  const rows = mapContentTables(tables, "lexical", "es");
  assert.deepEqual(validateContentImport(rows, snapshot, "add").map(({ entry }) => entry?.language), ["es", "en", "zh"]);
  const chinese = readyRow();
  assert.equal(validateContentImport([chinese], snapshot, "add")[0].entry?.language, "zh");
});

test("blank language updates preserve legacy and explicit language and prevent identity changes", () => {
  const spanish = { ...existing, id: "LX-spanish", language: "es", label: "hola" };
  const current = { ...snapshot, contentIdOptions: [existing, spanish] };
  const rows = mapContentTables(parseContentTables("ID\tLanguage\tNotes\nLX-existing\t\tUpdated\nLX-spanish\t\tActualizado"), "", "");
  const previews = validateContentImport(rows, current, "update");
  assert.deepEqual(previews.flatMap(({ errors }) => errors), []);
  assert.equal(previews[0].entry?.language, undefined);
  assert.equal(previews[1].entry?.language, "es");
  assert.deepEqual(previews.flatMap(({ changes }) => changes.map(({ field }) => field)), ["notes", "notes"]);
  rows[0].values.language = "English";
  assert.ok(validateContentImport(rows, current, "update")[0].errors.some(({ field, message }) => field === "language" && message.includes("new ID")));
  rows[0].values.language = "Chinese";
  assert.deepEqual(validateContentImport(rows, current, "update")[0].errors, []);
});

test("sample previews are original multilingual content with stable IDs and no claimed levels", async () => {
  const rows = [...sampleContentImportRows("en"), ...sampleContentImportRows("es")];
  const previews = validateContentImport(rows, snapshot, "add");
  assert.equal(rows.length, 14);
  assert.deepEqual(previews.flatMap(({ errors }) => errors), []);
  for (const language of ["en", "es"] as const) {
    const entries = previews.flatMap(({ entry }) => entry?.language === language ? [entry] : []);
    assert.equal(entries.filter(({ kind }) => kind === "lexical").length, 4);
    assert.equal(entries.filter(({ kind }) => kind === "grammar").length, 3);
    assert.deepEqual(sampleContentImportRows(language).map(({ values }) => values.id), entries.map(({ id }) => id));
    assert.ok(entries.every((entry) => !entry.level && entry.examples?.length && entry.sources?.[0].includes("Original demonstration") && !entry.assessmentRules));
  }
  assert.ok(rows.some(({ values }) => values.examples.includes("¡Hola, Lucía!")));
  const entries = previews.map(({ entry }) => entry!);
  const current = { ...snapshot, contentIdOptions: [...snapshot.contentIdOptions, ...entries] };
  const bytes = await buildContentWorkbook(current.contentIdOptions, current);
  const reimport = await readContentFile(new File([bytes], "multilingual.xlsx"));
  const updates = validateContentImport(reimport, current, "update");
  assert.deepEqual(updates.flatMap(({ errors }) => errors), []);
  assert.deepEqual(updates.flatMap(({ changes }) => changes), []);
  assert.deepEqual(updates.map(({ entry }) => entry).sort((a, b) => a!.id.localeCompare(b!.id)), current.contentIdOptions.map(simplifyContentEntry).sort((a, b) => a.id.localeCompare(b.id)));
});

test("duplicate names and meanings are scoped to language", () => {
  const english = readyRow(); Object.assign(english.values, { language: "en", label: "no", meaning: "a negative response" });
  const spanish = readyRow(); Object.assign(spanish.values, { language: "es", label: "no", meaning: "a negative response" });
  const previews = validateContentImport([english, spanish], snapshot, "add");
  assert.deepEqual(previews.flatMap(({ errors }) => errors), []);
  assert.deepEqual(previews.flatMap(({ duplicates }) => duplicates), []);
});

test("English vocabulary imports accept omitted and blank meanings from files and default-language input", async () => {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Language", "Level", "Name"], ["English", "A1", "about"]]), "Vocabulary");
  const file = new File([XLSX.write(workbook, { type: "array", bookType: "xlsx" })], "English.xlsx");
  const rows = [
    ...await readContentFile(file),
    ...mapContentTables(parseContentTables("Level\tName\tMeaning\nA1\tabove\t   "), "lexical", "en"),
    ...mapContentTables(parseContentTables("| Name |\n| --- |\n| across |"), "lexical", "en"),
  ];
  const previews = validateContentImport(rows, snapshot, "add");
  assert.deepEqual(previews.flatMap(({ errors }) => errors), []);
  assert.deepEqual(previews.map(({ entry }) => [entry?.language, entry?.label, entry?.meaning]), [
    ["en", "about", undefined], ["en", "above", undefined], ["en", "across", undefined],
  ]);
  const exported = await buildContentWorkbook(previews.map(({ entry }) => entry!), snapshot);
  const reimported = await readContentFile(new File([exported], "English-export.xlsx"));
  assert.deepEqual(validateContentImport(reimported, snapshot, "add").flatMap(({ errors }) => errors), []);
});

test("English meaning updates preserve blank input and allow explicit clearing", () => {
  const english = { ...existing, id: "LX-en", language: "en", label: "hello" };
  const current = { ...snapshot, contentIdOptions: [english] };
  const row = createEmptyImportRow(""); row.values.id = english.id;
  assert.equal(validateContentImport([row], current, "update")[0].entry?.meaning, existing.meaning);
  row.values.meaning = "__CLEAR__";
  const cleared = validateContentImport([row], current, "update")[0];
  assert.deepEqual(cleared.errors, []);
  assert.equal(cleared.entry?.meaning, "");
  assert.deepEqual(cleared.changes.map(({ field }) => field), ["meaning"]);
});

test("optional English meanings retain duplicate protection and other language requirements", () => {
  const rows = mapContentTables(parseContentTables("Name\nabout\nabout"), "lexical", "en");
  assert.ok(validateContentImport(rows, snapshot, "add").every(({ errors }) => errors.some(({ field }) => field === "label")));
  for (const language of ["", "zh", "es"]) {
    const row = readyRow(); row.values.language = language; row.values.meaning = "";
    assert.ok(validateContentImport([row], snapshot, "add")[0].errors.some(({ field }) => field === "meaning"));
  }
  const grammar = createEmptyImportRow("grammar"); Object.assign(grammar.values, { language: "English", label: "Present simple" });
  assert.ok(validateContentImport([grammar], snapshot, "add")[0].errors.some(({ field }) => field === "pattern"));
});
