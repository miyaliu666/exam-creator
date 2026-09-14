export const IMPORT_FIELDS = [
  { key: "id", label: "ID" }, { key: "language", label: "Language" }, { key: "kind", label: "Category" }, { key: "level", label: "Level" }, { key: "label", label: "Name" },
  { key: "meaning", label: "Meaning" }, { key: "pattern", label: "Structure" },
  { key: "masteryScope", label: "Mastery scope" }, { key: "canDoIds", label: "Can-do" },
  { key: "pinyin", label: "Pinyin" },
  { key: "englishGloss", label: "English meaning" }, { key: "examples", label: "Examples" },
  { key: "restrictions", label: "Usage restrictions" }, { key: "sources", label: "Sources" },
  { key: "notes", label: "Notes" }, { key: "metadata", label: "Additional metadata" },
] as const;
export type ImportField = typeof IMPORT_FIELDS[number]["key"];
export type ImportValues = Record<ImportField, string>;
export interface ContentImportRow {
  id: string;
  source: string;
  values: ImportValues;
  included: boolean;
  duplicateConfirmed: boolean;
  sourceFields?: ImportField[];
  generatedPinyin?: { label: string; value: string };
}
export interface ContentImportTable {
  source: string;
  headers: string[];
  mapping: Array<ImportField | "__ignore" | "">;
  rows: Array<{ line: number; cells: string[] }>;
  defaultKind?: string;
}
const aliases: Record<string, ImportField> = {
  lang: "language", 语言: "language", 語言: "language", idioma: "language",
  type: "kind", category: "kind", 类别: "kind", 类型: "kind", 名称: "label", 词语: "label", 语法名称: "label",
  name: "label", word: "label", vocabulary: "label", 词汇: "label", 义项: "meaning", 限定义项: "meaning", 释义: "meaning",
  assessedmeaning: "meaning", translation: "meaning", 意思: "meaning", 翻译: "meaning", 级别: "level", 等级: "level",
  structure: "pattern", grammarstructure: "pattern", 语法结构: "pattern", 掌握范围: "masteryScope",
  cando: "canDoIds", candos: "canDoIds", 适用cando: "canDoIds",
  拼音: "pinyin", 英文释义: "englishGloss", 例句: "examples",
  usagerestrictions: "restrictions", 使用限制: "restrictions", 来源: "sources", 备注: "notes", additionalmetadata: "metadata",
};
const headerKey = (text: string) => text.trim().replace(/[\s_\-\/]/g, "").toLowerCase();
export function inferImportField(header: string): ImportField | "" {
  const key = headerKey(header);
  return IMPORT_FIELDS.find((field) => headerKey(field.key) === key || headerKey(field.label) === key)?.key ?? aliases[key] ?? "";
}
export function createEmptyImportRow(kind = "lexical", source = "Manual input"): ContentImportRow {
  const values = Object.fromEntries(IMPORT_FIELDS.map(({ key }) => [key, ""])) as ImportValues;
  values.kind = kind;
  return { id: crypto.randomUUID(), source, values, included: true, duplicateConfirmed: false };
}
export function inferContentKind(name: string): string | undefined {
  if (/grammar|语法/i.test(name)) return "grammar";
  if (/vocabulary|lexical|词汇|词语/i.test(name)) return "lexical";
  if (/characters?|汉字/i.test(name)) return "character";
  if (/pragmatic|语用/i.test(name)) return "pragmatics";
  return undefined;
}
export function canPreviewContentTables(tables: ContentImportTable[]): boolean {
  return !!tables.length && tables.every(({ headers, mapping }) => mapping.length === headers.length
    && mapping.every(Boolean) && new Set(mapping.filter((field) => field !== "__ignore")).size === mapping.filter((field) => field !== "__ignore").length
    && (mapping.includes("label") || mapping.includes("id")));
}
export function mapContentTables(tables: ContentImportTable[], kind = "lexical", language = ""): ContentImportRow[] {
  if (tables.reduce((total, table) => total + table.rows.length, 0) > 5000) throw new Error("Import at most 5,000 content rows at a time.");
  return tables.flatMap((table) => {
    const fields = table.mapping.filter((field) => field && field !== "__ignore");
    if (fields.length !== new Set(fields).size) throw new Error(`${table.source}: each field can only be mapped once.`);
    if (!fields.includes("label") && !fields.includes("id")) throw new Error(`${table.source}: map a Name or ID column first.`);
    return table.rows.map(({ line, cells }) => {
      const row = createEmptyImportRow(table.defaultKind ?? kind, `${table.source}, row ${line}`);
      row.sourceFields = fields as ImportField[];
      table.mapping.forEach((field, index) => { if (field && field !== "__ignore" && (field !== "kind" || cells[index]?.trim())) row.values[field] = cells[index] ?? ""; });
      if (!row.values.language.trim()) row.values.language = language;
      return row;
    });
  });
}
