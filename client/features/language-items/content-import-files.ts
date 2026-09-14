import { IMPORT_FIELDS, inferContentKind, mapContentTables, type ContentImportTable } from "./content-import-columns";
import { parseContentTables, tableFromRecords } from "./content-import-parser";
import { registryDisplayText } from "./registry-display-text";
import type { ContentIdOption, RegistrySnapshot } from "./types";

const MAX_ROWS = 5000;
const supportSheets = new Set(["Instructions", "Can-do references", "Context references"]);
const instructionRows = [
  ["New entries: Name is required; vocabulary also requires Meaning, grammar requires Structure."],
  ["Language: Chinese (zh), English (en), or Spanish (es). Blank new rows use the import language; blank updates preserve the saved language. Legacy entries without a language are Chinese."],
  ["Level is optional and preserves your source level, such as A1, A2 or HSK 1. It does not set item Difficulty."],
  ["Pinyin is optional for Chinese vocabulary. Missing pinyin can be generated in the import preview."],
  ["The worksheet name supplies the category. Other fields can be set after importing."],
  ["Meaning is optional for English vocabulary. It accepts definitions or translations in any language; a separate English meaning is optional."],
  ["Mastery scope: receptive, productive, receptiveProductive, or Not restricted. Blank means Not restricted for new entries."],
  ["Can-do: IDs or unique names separated by semicolons. Blank means Not restricted for new entries."],
  ["Update by exported ID: blanks preserve values; __CLEAR__ clears optional fields or scope restrictions. Missing rows never delete entries."],
  ["Examples and Sources: semicolon-separated values, or a JSON string array for values containing semicolons or line breaks."],
  ["Additional metadata: JSON object for extra source fields; cannot replace standard fields."],
  ["Limits: 5 MiB per file, 5,000 entries. Reference sheets are excluded from import."],
];
export async function readContentTables(file: File): Promise<ContentImportTable[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file smaller than 5 MiB.");
  if (/\.(md|markdown|tsv|txt)$/i.test(file.name)) return parseContentTables(await file.text(), file.name, /\.(md|markdown)$/i.test(file.name));
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Choose an .xlsx workbook, a Markdown table (.md), or a .tsv/.txt table.");
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellFormula: true, sheetRows: MAX_ROWS + 2 });
  const tables: ContentImportTable[] = [];
  for (const name of workbook.SheetNames) {
    if (supportSheets.has(name)) continue;
    const sheet = workbook.Sheets[name];
    const fullRange = sheet["!fullref"] ?? sheet["!ref"];
    if (!fullRange) continue;
    const range = XLSX.utils.decode_range(fullRange);
    if (range.e.r > MAX_ROWS || range.e.c > 100) throw new Error(`${name}: limit the workbook to 5,000 content rows and 100 columns per sheet.`);
    for (const [address, cell] of Object.entries(sheet)) {
      if (!address.startsWith("!") && typeof cell === "object" && cell && "f" in cell) throw new Error(`${name}, ${address}: replace formulas with their text values before importing.`);
    }
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
    const records = rows.map((cells, index) => ({ line: index + range.s.r + 1, cells: cells.map(String) })).filter((row) => row.cells.some((cell) => cell.trim()));
    if (!records.length) continue;
    const table = tableFromRecords(records, `${file.name} / ${name}`, true);
    table.defaultKind = inferContentKind(name);
    tables.push(table);
  }
  if (tables.reduce((sum, table) => sum + table.rows.length, 0) > MAX_ROWS) throw new Error("Import at most 5,000 content rows at a time.");
  if (!tables.length) throw new Error("The workbook has no content tables.");
  return tables;
}
export async function readContentFile(file: File, kind = "lexical", language = "") { return mapContentTables(await readContentTables(file), kind, language); }

function entryCells(entry: ContentIdOption): string[] {
  const standard = new Set(IMPORT_FIELDS.map(({ key }) => key as string));
  return IMPORT_FIELDS.map(({ key }) => {
    if (key === "metadata") {
      const metadata = Object.fromEntries(Object.entries(entry).filter(([field]) => !standard.has(field) && !["contextIds", "contextScopeMode", "excludedContextIds", "assessmentRules"].includes(field)));
      return Object.keys(metadata).length ? JSON.stringify(metadata) : "";
    }
    const value = entry[key];
    if (["masteryScope", "canDoIds"].includes(key) && (value === null || (Array.isArray(value) && !value.length))) return "Not restricted";
    if (value === undefined) return "";
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === "string") return value || "__CLEAR__";
    return "";
  });
}
export async function buildContentWorkbook(entries: ContentIdOption[], snapshot: RegistrySnapshot, template = false): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();
  const append = (name: string, rows: string[][]) => {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = rows[0]?.map(() => ({ wch: 28 }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  };
  for (const [kind, title] of [["lexical", "Vocabulary"], ["grammar", "Grammar"], ["character", "Characters"], ["pragmatics", "Pragmatic functions"], ["supported", "Supporting material types"]]) {
    const matching = entries.filter((entry) => entry.kind === kind);
    if (!matching.length && !(template && ["lexical", "grammar"].includes(kind))) continue;
    const templateFields = kind === "grammar" ? ["Language", "Level", "Name", "Structure", "Meaning"] : ["Language", "Level", "Name", "Meaning", "Pinyin"];
    append(title, template ? [templateFields] : [IMPORT_FIELDS.map(({ label }) => label), ...matching.map(entryCells)]);
  }
  if (!workbook.SheetNames.length) append("Language content", [IMPORT_FIELDS.map(({ label }) => label)]);
  append("Instructions", instructionRows);
  if (!template) {
    append("Can-do references", [["ID", "Name"], ...snapshot.canDoOptions.map((entry) => [entry.id, registryDisplayText(entry.label)])]);
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadContentTemplate(snapshot: RegistrySnapshot, format: "xlsx" | "markdown" = "xlsx"): Promise<void> {
  if (format === "markdown") {
    download(buildContentMarkdownTemplate(), "language-content-template.md", "text/markdown;charset=utf-8");
    return;
  }
  download(await buildContentWorkbook([], snapshot, true), "language-content-template.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
export function buildContentMarkdownTemplate(): string {
  return "# Language content template\n\nFill either table. Language accepts Chinese (zh), English (en), or Spanish (es); blank new rows use the selected import language. Level and Pinyin are optional. Add further fields after import. Escape literal pipes as \\|; use <br> for newlines.\n\n## Vocabulary\n\n| Language | Level | Name | Meaning | Pinyin |\n| --- | --- | --- | --- | --- |\n\n## Grammar\n\n| Language | Level | Name | Structure | Meaning |\n| --- | --- | --- | --- | --- |\n";
}
export async function exportContentEntries(entries: ContentIdOption[], snapshot: RegistrySnapshot): Promise<void> {
  download(await buildContentWorkbook(entries, snapshot), "language-content.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}
