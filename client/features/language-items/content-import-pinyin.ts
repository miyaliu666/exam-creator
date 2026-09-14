import { validateContentImport, type ContentImportMode, type ContentImportRow } from "./content-import-model";
import { canGenerateContentPinyin, generateMissingContentPinyin } from "./content-pinyin";
import type { RegistrySnapshot } from "./types";

export async function fillImportPinyin(rows: ContentImportRow[], snapshot: RegistrySnapshot, mode: ContentImportMode): Promise<ContentImportRow[]> {
  const previews = validateContentImport(rows, snapshot, mode);
  const eligible = previews.filter(({ row, entry }) => row.included && row.values.pinyin.trim() !== "__CLEAR__" && entry && canGenerateContentPinyin(entry));
  if (!eligible.length) return rows;
  const generated = await generateMissingContentPinyin(eligible.map(({ entry }) => entry!));
  const byRow = new Map(eligible.map(({ row }, index) => [row.id, generated[index]]));
  return rows.map((row) => {
    const entry = byRow.get(row.id);
    return entry?.pinyin ? { ...row, values: { ...row.values, pinyin: entry.pinyin }, generatedPinyin: { label: entry.label, value: entry.pinyin } } : row;
  });
}

export function invalidateImportPinyin(previous: ContentImportRow, next: ContentImportRow): ContentImportRow {
  if (!previous.generatedPinyin) return next;
  if (next.values.pinyin !== previous.generatedPinyin.value) return { ...next, generatedPinyin: undefined };
  if (next.values.label !== previous.values.label || next.values.language !== previous.values.language) return { ...next, generatedPinyin: undefined, values: { ...next.values, pinyin: "" } };
  return next;
}
