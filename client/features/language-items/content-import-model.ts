import { IMPORT_FIELDS, type ContentImportRow, type ImportField } from "./content-import-columns";
import { contentEntryDuplicateKeys, contentEntryIdentityChanged, contentEntryNameKeys } from "./content-catalog-model";
import { registryDisplayText } from "./registry-display-text";
import { contentLanguage, parseContentLanguage } from "./content-language";
import { simplifyContentEntry } from "./simple-language-content";
import type { ContentIdOption, RegistrySnapshot } from "./types";
export * from "./content-import-columns";
export * from "./content-import-parser";

export type ContentImportMode = "add" | "update";
export interface ContentImportIssue { field: ImportField; message: string }
export interface ContentImportPreview {
  row: ContentImportRow;
  entry?: ContentIdOption;
  errors: ContentImportIssue[];
  duplicates: string[];
  changes: Array<{ field: ImportField; before: string; after: string }>;
}
const unrestricted = (value: string) => /^(unrestricted|not restricted|不限制|__clear__)$/i.test(value.trim());
const printable = (value: unknown) => value === undefined || value === null ? "Not provided" : typeof value === "string" ? value : JSON.stringify(value);
const canonicalKeys = new Set(IMPORT_FIELDS.filter((field) => field.key !== "metadata").map((field) => field.key as string));

export function splitImportList(value: string): string[] {
  if (value.trim().startsWith("[")) {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) throw new Error("Use a JSON array of strings or separate values with semicolons.");
    return parsed as string[];
  }
  return value.split(/[;\n；]/).map((part) => part.trim()).filter(Boolean);
}
function resolveReferences(value: string, options: Array<{ id: string; label: string; retired?: boolean }>, allowRetired = false): string[] {
  if (unrestricted(value)) return [];
  const values = splitImportList(value);
  return [...new Set(values.map((part) => {
    const byId = options.find((option) => option.id === part);
    const matches = byId ? [byId] : options.filter((option) => option.label === part || registryDisplayText(option.label) === part);
    if (matches.length !== 1) throw new Error(matches.length ? `“${part}” matches more than one name; use its ID.` : `Unknown reference: “${part}”.`);
    if (matches[0].retired && !allowRetired) throw new Error(`“${part}” is retired; choose an active reference.`);
    return matches[0].id;
  }))];
}
function parseRow(row: ContentImportRow, snapshot: RegistrySnapshot, mode: ContentImportMode, existingById: Map<string, ContentIdOption>): ContentImportPreview {
  const errors: ContentImportIssue[] = [], values = row.values;
  const fail = (field: ImportField, message: string) => errors.push({ field, message });
  const existing = existingById.get(values.id.trim());
  if (mode === "update" && !existing) fail("id", "Update requires an existing ID from an export.");
  if (mode === "add" && existing) fail("id", "This ID already exists. Use Update mode to change it.");
  const entry: ContentIdOption = mode === "update" && existing ? { ...existing } : {
    id: values.id.trim() || `LC-${row.id}`, kind: "lexical", language: "zh", label: "", masteryScope: null, canDoIds: [], contextIds: [],
  };
  if (values.language.trim()) {
    const language = parseContentLanguage(values.language);
    if (language && existing && mode === "update" && language !== contentLanguage(existing)) fail("language", "An existing entry's language cannot change. Add a new entry with a new ID.");
    else if (language) entry.language = language;
    else fail("language", "Choose Chinese (zh), English (en), or Spanish (es).");
  }
  if (values.metadata.trim()) {
    try {
      const metadata: unknown = JSON.parse(values.metadata);
      if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) throw new Error("Additional metadata must be a JSON object.");
      for (const [key, value] of Object.entries(metadata)) {
        if (canonicalKeys.has(key) || ["__proto__", "constructor", "prototype", "metadata", "contextIds", "contextScopeMode", "excludedContextIds", "assessmentRules"].includes(key)) throw new Error(`Additional metadata cannot override “${key}”.`);
        entry[key] = value;
      }
    } catch (error) { fail("metadata", (error as Error).message); }
  }
  const kindValue = values.kind.trim().toLowerCase();
  const kind = ({ vocabulary: "lexical", lexical: "lexical", grammar: "grammar", character: "character", characters: "character", pragmatics: "pragmatics", "pragmatic functions": "pragmatics", supported: "supported", "supporting content": "supported", "supporting material types": "supported", 词汇: "lexical", 语法: "grammar" } as Record<string, string>)[kindValue];
  if (kindValue && !kind) fail("kind", "Choose Vocabulary, Grammar, Character, Pragmatics, or Supporting material types.");
  if (kind) {
    if (existing && mode === "update" && kind !== existing.kind) fail("kind", "An existing entry's category cannot change.");
    else entry.kind = kind;
  }
  for (const field of ["level", "label", "meaning", "pattern", "pinyin", "englishGloss", "restrictions", "notes"] as const) {
    const value = values[field].trim();
    if (value) entry[field] = value === "__CLEAR__" ? "" : values[field];
  }
  if (!entry.label.trim()) fail("label", "Name is required.");
  if (entry.level && /[\u0000-\u001f\u007f-\u009f]/.test(entry.level)) fail("level", "Use a single-line level without control characters.");
  if (mode === "add" && entry.kind === "lexical" && contentLanguage(entry) !== "en" && !entry.meaning?.trim()) fail("meaning", "Specify the meaning assessed by this vocabulary entry.");
  if (mode === "add" && entry.kind === "grammar" && !entry.pattern?.trim()) fail("pattern", "Grammar structure is required for a new grammar entry.");
  if (mode === "update" && existing?.meaning?.trim() && entry.kind === "lexical" && contentLanguage(entry) !== "en" && !entry.meaning?.trim()) fail("meaning", "Keep the assessed meaning or replace it with a corrected meaning.");
  if (mode === "update" && existing?.pattern?.trim() && entry.kind === "grammar" && !entry.pattern?.trim()) fail("pattern", "Keep the grammar structure or replace it with a corrected structure.");
  for (const field of ["canDoIds"] as const) {
    if (!values[field].trim()) continue;
    try {
      entry.canDoIds = resolveReferences(values[field], snapshot.canDoOptions);
    }
    catch (error) { fail(field, (error as Error).message); }
  }
  const mastery = values.masteryScope.trim();
  if (mastery) {
    const scope = ({ receptive: "receptive", understanding: "receptive", "receptive (understanding)": "receptive", 理解: "receptive", productive: "productive", expression: "productive", "productive (expression)": "productive", 表达: "productive", receptiveproductive: "receptiveProductive", "receptive and productive": "receptiveProductive", "understanding and expression": "receptiveProductive", 理解与表达: "receptiveProductive" } as Record<string, string>)[mastery.toLowerCase()];
    if (unrestricted(mastery)) entry.masteryScope = null;
    else if (scope) entry.masteryScope = scope;
    else fail("masteryScope", "Use receptive, productive, receptiveProductive, or Not restricted.");
  }
  for (const field of ["examples", "sources"] as const) {
    if (!values[field].trim()) continue;
    try { entry[field] = values[field].trim() === "__CLEAR__" ? [] : splitImportList(values[field]); }
    catch (error) { fail(field, (error as Error).message); }
  }
  if (entry.canDoIds.some((id) => !snapshot.canDoOptions.some((option) => option.id === id))) fail("canDoIds", "Remove unavailable Can-do references.");
  if (entry.masteryScope !== null && !["receptive", "productive", "receptiveProductive"].includes(entry.masteryScope)) fail("masteryScope", "Choose a valid mastery scope for this entry.");
  const changes = existing && mode === "update" ? IMPORT_FIELDS.filter(({ key }) => key !== "metadata" && JSON.stringify(existing[key]) !== JSON.stringify(entry[key])).map(({ key }) => ({ field: key, before: printable(existing[key]), after: printable(entry[key]) })) : [];
  if (existing && values.metadata.trim()) {
    const before = Object.fromEntries(Object.entries(existing).filter(([key]) => !canonicalKeys.has(key)));
    const after = Object.fromEntries(Object.entries(entry).filter(([key]) => !canonicalKeys.has(key)));
    if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ field: "metadata", before: JSON.stringify(before), after: JSON.stringify(after) });
  }
  return { row, entry: simplifyContentEntry(entry), errors, duplicates: [], changes };
}
export function validateContentImport(rows: ContentImportRow[], snapshot: RegistrySnapshot, mode: ContentImportMode): ContentImportPreview[] {
  const existingById = new Map(snapshot.contentIdOptions.map((entry) => [entry.id, entry]));
  const previews = rows.map((row) => parseRow(row, snapshot, mode, existingById));
  const included = previews.filter((preview) => preview.row.included && preview.entry);
  const idCounts = new Map<string, number>();
  const groups = new Map<string, Map<string, ContentIdOption>>();
  const combinedGroups = new Map<string, Map<string, ContentIdOption>>();
  const identities = new Map<string, Set<string>>();
  for (const preview of included) {
    const id = preview.entry!.id;
    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }
  const effectiveEntries = [...snapshot.contentIdOptions.filter((entry) => mode !== "update" || !idCounts.has(entry.id)), ...included.map((preview) => preview.entry!)];
  for (const entry of effectiveEntries) {
    for (const key of contentEntryNameKeys(entry)) {
      const group = groups.get(key) ?? new Map<string, ContentIdOption>();
      group.set(entry.id, entry); groups.set(key, group);
    }
    for (const identity of contentEntryDuplicateKeys(entry)) {
      const ids = identities.get(identity) ?? new Set<string>();
      ids.add(entry.id); identities.set(identity, ids);
    }
  }
  for (const preview of previews) {
    const entry = preview.entry;
    if (!entry) continue;
    if ((idCounts.get(entry.id) ?? 0) > 1) preview.errors.push({ field: "id", message: "This ID occurs in multiple included rows. Exclude the duplicate row." });
    const previous = existingById.get(entry.id);
    if (mode === "update" && previous && !contentEntryIdentityChanged(entry, previous)) continue;
    if (contentEntryDuplicateKeys(entry).some((identity) => {
      const ids = identities.get(identity);
      return ids && ids.size > (ids.has(entry.id) ? 1 : 0);
    })) {
      preview.errors.push({ field: "label", message: "This entry already exists. Edit the existing entry or exclude this row." });
      continue;
    }
    const nameKeys = contentEntryNameKeys(entry).sort(), combinedKey = JSON.stringify(nameKeys);
    let group = nameKeys.length === 1 ? groups.get(nameKeys[0]) : combinedGroups.get(combinedKey);
    if (!group && nameKeys.length > 1) {
      group = new Map<string, ContentIdOption>();
      for (const key of nameKeys) for (const [id, other] of groups.get(key) ?? []) group.set(id, other);
      combinedGroups.set(combinedKey, group);
    }
    if (group) {
      let matched = 0;
      for (const other of group.values()) {
        if (other.id === entry.id) continue;
        const detail = other.kind === "grammar" ? other.pattern : other.meaning;
        preview.duplicates.push(`${other.label}${detail ? ` — ${detail}` : ""}`);
        if (++matched === 10) break;
      }
      const total = group.size - (group.has(entry.id) ? 1 : 0);
      if (total > matched) preview.duplicates.push(`${total - matched} more entries with this name`);
      preview.duplicates = [...new Set(preview.duplicates)];
    }
  }
  return previews;
}
