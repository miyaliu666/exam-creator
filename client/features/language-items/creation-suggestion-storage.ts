import type { CoverageBatchSuggestion, CoverageFilters } from "./coverage-types";
import { migrateLegacyBrowserSetup } from "./legacy-item-rule-browser-migration";

const FILTER_KEYS = ["language", "skill", "activity", "domain", "contextId", "itemRuleId", "primaryCanDoId", "difficultyBand", "itemFormatId"] as const;
const memory = new Map<string, CoverageBatchSuggestion>();

function storageKey(scope: string) {
  return `language-items:creation-suggestion:${scope}`;
}

function parseSuggestion(value: unknown): CoverageBatchSuggestion | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.registryVersion !== "string" || !record.registryVersion.trim() ||
      !Array.isArray(record.targetContentIds) || !record.targetContentIds.length ||
      record.targetContentIds.some((id: unknown) => typeof id !== "string" || !id.trim()) ||
      new Set(record.targetContentIds).size !== record.targetContentIds.length ||
      typeof record.desiredCount !== "number" || !Number.isSafeInteger(record.desiredCount) ||
      record.desiredCount < 1 || record.desiredCount > 1_000_000 ||
      !record.filters || typeof record.filters !== "object" || Array.isArray(record.filters)) return undefined;
  const rawFilters = migrateLegacyBrowserSetup(record.filters) as Record<string, unknown>;
  if (rawFilters.language !== undefined && !["zh", "en", "es"].includes(rawFilters.language as string)) return undefined;
  const filters: CoverageFilters = {};
  for (const key of FILTER_KEYS) {
    const entry = rawFilters[key];
    if (entry !== undefined && typeof entry !== "string") return undefined;
    if (typeof entry === "string") filters[key] = entry;
  }
  return { registryVersion: record.registryVersion, targetContentIds: [...record.targetContentIds], desiredCount: record.desiredCount, filters };
}

export function saveCreationSuggestion(scope: string, suggestion: CoverageBatchSuggestion) {
  const checked = parseSuggestion(suggestion);
  if (!checked) return;
  memory.set(scope, checked);
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(checked));
  } catch {
    // Navigation can still transfer a plan when browser storage is unavailable.
  }
}

export function readCreationSuggestion(scope: string): CoverageBatchSuggestion | undefined {
  try {
    const serialized = sessionStorage.getItem(storageKey(scope));
    if (serialized !== null) return parseSuggestion(JSON.parse(serialized));
  } catch {
    // Use only the same account's in-memory suggestion after a storage failure.
  }
  return parseSuggestion(memory.get(scope));
}

export function clearCreationSuggestion(scope: string) {
  memory.delete(scope);
  try {
    sessionStorage.removeItem(storageKey(scope));
  } catch {
    // Clearing in-memory state still works in restricted browser sessions.
  }
}
