import { languageTargetDisplayText, languageTargetLabel } from "./language-target-labels.ts";
import type { ContentIdOption, RegistrySnapshot } from "./types.ts";

export const CONTENT_MASTERY_OPTIONS = [
  { id: "", label: "Not restricted" },
  { id: "receptive", label: "Receptive (understanding)" },
  { id: "productive", label: "Productive (expression)" },
  { id: "receptiveProductive", label: "Receptive and productive" },
];

export interface ContentCatalogFilters {
  kind: string;
  query: string;
  mastery: string;
  canDoId: string;
  contextId: string;
}

export function contentEntryBaselineMatches(initial: ContentIdOption, entries: ContentIdOption[], isNew: boolean): boolean {
  const current = entries.find((entry) => entry.id === initial.id);
  if (isNew) return !current;
  if (!current) return false;
  const canonical = (entry: ContentIdOption) => JSON.stringify(entry, (_key, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)))
      : value);
  return canonical(current) === canonical(initial);
}

export function prepareContentEntry(entry: ContentIdOption, initial: ContentIdOption): ContentIdOption {
  const result = structuredClone(entry);
  if (entry.label !== initial.label) result.label = entry.label.trim();
  for (const key of ["examples", "sources"] as const) {
    if (JSON.stringify(entry[key]) !== JSON.stringify(initial[key])) result[key] = entry[key]?.map((value) => value.trim()).filter(Boolean);
  }
  return result;
}

export function contentMasteryLabel(scope: string | null) {
  return CONTENT_MASTERY_OPTIONS.find((option) => option.id === (scope ?? ""))?.label ?? "Unknown mastery scope";
}

const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();

export function contentEntryNameKey(entry: ContentIdOption): string {
  return JSON.stringify([entry.kind, normalized(entry.label)]);
}

export function contentEntryNameKeys(entry: ContentIdOption): string[] {
  const names = [entry.label];
  if (entry.kind === "grammar" || entry.kind === "pragmatics") {
    // Only established display names are aliases; an authored English meaning is not another name.
    const display = languageTargetLabel({ id: entry.id, kind: entry.kind, label: entry.label });
    names.push(display.primary);
    if (display.english) names.push(display.english);
  }
  return [...new Set(names.map((name) => JSON.stringify([entry.kind, normalized(name)])))];
}

const identityDetail = (entry: ContentIdOption) => normalized((entry.kind === "lexical" ? entry.meaning : entry.kind === "grammar" ? entry.pattern : undefined) ?? "");

export function contentEntryIdentityKey(entry: ContentIdOption): string {
  return JSON.stringify([contentEntryNameKey(entry), identityDetail(entry)]);
}

export function contentEntryDuplicateKeys(entry: ContentIdOption): string[] {
  return contentEntryNameKeys(entry).map((key) => JSON.stringify([key, identityDetail(entry)]));
}

export function contentEntryIdentityChanged(entry: ContentIdOption, initial: ContentIdOption): boolean {
  return contentEntryIdentityKey(entry) !== contentEntryIdentityKey(initial);
}

export function sameNameContentEntries(entry: ContentIdOption, entries: ContentIdOption[]) {
  const keys = new Set(contentEntryNameKeys(entry));
  return entries.filter((candidate) => candidate.id !== entry.id && contentEntryNameKeys(candidate).some((key) => keys.has(key)));
}

export function duplicateContentEntries(entry: ContentIdOption, entries: ContentIdOption[]) {
  const keys = new Set(contentEntryDuplicateKeys(entry));
  return entries.filter((candidate) => candidate.id !== entry.id && contentEntryDuplicateKeys(candidate).some((key) => keys.has(key)));
}

export function filterContentEntries(entries: ContentIdOption[], filters: ContentCatalogFilters) {
  const query = normalized(filters.query);
  const matchesScope = (ids: string[], selected: string) => !selected
    || (selected === "__unrestricted" ? !ids.length : !ids.length || ids.includes(selected));
  return entries.filter((entry) => (!filters.kind || entry.kind === filters.kind)
    && (filters.mastery === "all" || (entry.masteryScope ?? "") === filters.mastery)
    && matchesScope(entry.canDoIds, filters.canDoId)
    && matchesScope(entry.contextIds, filters.contextId)
    && (!query || normalized([languageTargetDisplayText(entry), entry.meaning, entry.pattern, entry.pinyin, entry.englishGloss].filter(Boolean).join(" ")).includes(query)));
}

export function contentEntryErrors(entry: ContentIdOption, snapshot: RegistrySnapshot, isNew: boolean) {
  const errors: string[] = [];
  if (!entry.label.trim()) errors.push("Enter a name.");
  if (entry.kind === "lexical" && (isNew || entry.meaning !== undefined) && !entry.meaning?.trim()) errors.push("Enter the vocabulary meaning being assessed.");
  if (entry.kind === "grammar" && (isNew || entry.pattern !== undefined) && !entry.pattern?.trim()) errors.push("Enter the grammar structure.");
  if (!CONTENT_MASTERY_OPTIONS.some((option) => option.id === (entry.masteryScope ?? ""))) errors.push("Choose a valid mastery scope.");
  if (entry.canDoIds.some((id) => !snapshot.canDoOptions.some((option) => option.id === id))) errors.push("Remove unavailable Can-do references.");
  if (entry.contextIds.some((id) => !snapshot.contextOptions.some((option) => option.id === id && !option.retired))) errors.push("Remove unavailable or retired Context references.");
  return errors;
}

export function newContentEntry(kind = "lexical"): ContentIdOption {
  return { id: `CONTENT-CUSTOM-${crypto.randomUUID()}`, kind, label: "", masteryScope: null, canDoIds: [], contextIds: [] };
}
