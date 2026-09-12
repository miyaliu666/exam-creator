export const IMPORT_FIELDS = [
  { key: "id", label: "ID" }, { key: "kind", label: "Category" }, { key: "label", label: "Name" },
  { key: "meaning", label: "Meaning" }, { key: "pattern", label: "Structure" },
  { key: "masteryScope", label: "Mastery scope" }, { key: "canDoIds", label: "Can-do" },
  { key: "contextIds", label: "Context" }, { key: "pinyin", label: "Pinyin" },
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
}
export interface ContentImportTable {
  source: string;
  headers: string[];
  mapping: Array<ImportField | "">;
  rows: Array<{ line: number; cells: string[] }>;
}
const aliases: Record<string, ImportField> = {
  type: "kind", category: "kind", 类别: "kind", 类型: "kind", 名称: "label", 词语: "label", 语法名称: "label",
  name: "label", word: "label", vocabulary: "label", 义项: "meaning", 限定义项: "meaning", 释义: "meaning",
  assessedmeaning: "meaning",
  structure: "pattern", grammarstructure: "pattern", 语法结构: "pattern", 掌握范围: "masteryScope",
  cando: "canDoIds", candos: "canDoIds", 适用cando: "canDoIds", context: "contextIds", contexts: "contextIds",
  适用context: "contextIds", 拼音: "pinyin", 英文释义: "englishGloss", 例句: "examples",
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
export function canPreviewContentTables(tables: ContentImportTable[]): boolean {
  return !!tables.length && tables.every(({ headers, mapping }) => mapping.length === headers.length
    && mapping.every(Boolean) && new Set(mapping).size === mapping.length
    && (mapping.includes("label") || mapping.includes("id")));
}
export function mapContentTables(tables: ContentImportTable[], kind = "lexical"): ContentImportRow[] {
  if (tables.reduce((total, table) => total + table.rows.length, 0) > 5000) throw new Error("Import at most 5,000 content rows at a time.");
  return tables.flatMap((table) => {
    const fields = table.mapping.filter(Boolean);
    if (fields.length !== new Set(fields).size) throw new Error(`${table.source}: each field can only be mapped once.`);
    if (!fields.includes("label") && !fields.includes("id")) throw new Error(`${table.source}: map a Name or ID column first.`);
    return table.rows.map(({ line, cells }) => {
      const row = createEmptyImportRow(kind, `${table.source}, row ${line}`);
      table.mapping.forEach((field, index) => { if (field && (field !== "kind" || cells[index]?.trim())) row.values[field] = cells[index] ?? ""; });
      return row;
    });
  });
}
