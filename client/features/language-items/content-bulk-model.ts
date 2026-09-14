import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model.ts";
import type { ContentIdOption, RegistrySnapshot } from "./types.ts";

export type BulkScopeMode = "keep" | "unrestricted" | "selected";
export interface ContentBulkChanges {
  levelMode: "keep" | "set" | "clear";
  level: string;
  mastery: string;
  canDoMode: BulkScopeMode;
  canDoIds: string[];
}

export const emptyContentBulkChanges = (): ContentBulkChanges => ({
  levelMode: "keep", level: "", mastery: "__keep", canDoMode: "keep", canDoIds: [],
});

export function contentBulkSnapshotKey(snapshot: RegistrySnapshot): string {
  return JSON.stringify(snapshot, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
}

export function contentBulkErrors(changes: ContentBulkChanges, snapshot: RegistrySnapshot): string[] {
  const errors: string[] = [];
  if (changes.levelMode === "set" && !changes.level.trim()) errors.push("Enter a level or choose Clear level.");
  if (changes.levelMode === "set" && /[\u0000-\u001f\u007f-\u009f]/u.test(changes.level)) errors.push("Level must be a single line without control characters.");
  if (changes.mastery !== "__keep" && !CONTENT_MASTERY_OPTIONS.some((option) => option.id === changes.mastery)) errors.push("Choose a valid mastery scope.");
  if (changes.canDoMode === "selected" && (!changes.canDoIds.length || changes.canDoIds.some((id) => !snapshot.canDoOptions.some((entry) => entry.id === id)))) errors.push("Choose available Can-do values.");
  return errors;
}

export function prepareContentBulkEntries(entries: ContentIdOption[], changes: ContentBulkChanges, pinyin: ReadonlyMap<string, string> = new Map()): ContentIdOption[] {
  return entries.flatMap((entry) => {
    const next = structuredClone(entry);
    if (changes.levelMode === "set") next.level = changes.level.trim();
    if (changes.levelMode === "clear" && next.level) next.level = "";
    if (changes.mastery !== "__keep") next.masteryScope = changes.mastery || null;
    if (changes.canDoMode !== "keep") next.canDoIds = changes.canDoMode === "selected" ? [...changes.canDoIds] : [];
    if (!next.pinyin?.trim() && pinyin.has(entry.id)) next.pinyin = pinyin.get(entry.id)!;
    return JSON.stringify(next) === JSON.stringify(entry) ? [] : [next];
  });
}

export function currentContentSelection(selected: string[], entries: ContentIdOption[]): string[] {
  const available = new Set(entries.map((entry) => entry.id));
  return [...new Set(selected)].filter((id) => available.has(id));
}
