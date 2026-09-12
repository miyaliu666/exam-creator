import { coverageContentOptions } from "./coverage-labels.ts";
import type { CoverageOverview, CoverageOverviewState } from "./coverage-types";
import { CONTENT_KIND_LABELS } from "./labels.ts";
import type { RegistrySnapshot } from "./types";

export const COVERAGE_OVERVIEW_PAGE_SIZE = 25;
export const COVERAGE_OVERVIEW_CATEGORIES = ["lexical", "grammar", "character", "pragmatics"];

export function coverageOverviewCategories(registry: RegistrySnapshot) {
  return [...new Set([...COVERAGE_OVERVIEW_CATEGORIES, ...registry.contentIdOptions.filter((entry) => entry.kind !== "supported").map((entry) => entry.kind)])];
}

export interface CoverageOverviewRow {
  id: string;
  label: string;
  category: string;
  plannedCount: number;
  pendingCount: number;
}

export function summarizeCoverageRows(rows: CoverageOverviewRow[]) {
  const total = rows.length;
  const approved = rows.filter((row) => row.plannedCount > 0).length;
  const unapprovedOnly = rows.filter((row) => row.plannedCount === 0 && row.pendingCount > 0).length;
  const noItems = rows.filter((row) => row.plannedCount === 0 && row.pendingCount === 0).length;
  const percent = (count: number) => total ? count / total * 100 : null;
  return { total, approved, unapprovedOnly, noItems, approvedPercent: percent(approved), unapprovedOnlyPercent: percent(unapprovedOnly), noItemsPercent: percent(noItems) };
}

export function coverageOverviewRows(registry: RegistrySnapshot, data: CoverageOverview): CoverageOverviewRow[] {
  const directory = new Map(registry.contentIdOptions.filter((entry) => entry.kind !== "supported").map((entry) => [entry.id, entry]));
  const labels = new Map(coverageContentOptions(registry).map((entry) => [entry.id, entry.label]));
  const counts = new Map(data.entries.map((entry) => [entry.id, entry]));
  // Sparse inventory counts must not remove unrepresented entries from the directory denominator.
  return [...directory.values()].map((entry) => ({
    id: entry.id,
    label: labels.get(entry.id) ?? entry.label,
    category: entry.kind,
    plannedCount: counts.get(entry.id)?.plannedCount ?? 0,
    pendingCount: counts.get(entry.id)?.pendingCount ?? 0,
  }));
}

export function coverageOverviewModel(registry: RegistrySnapshot, data: CoverageOverview, state: CoverageOverviewState) {
  const rows = coverageOverviewRows(registry, data);
  const categories = coverageOverviewCategories(registry);
  const categoryRows = rows.filter((row) => !state.category || state.category === "all" || row.category === state.category);
  const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase();
  const search = normalize(state.search);
  const matching = categoryRows.filter((row) => normalize(row.label).includes(search));
  const countKey = { planned: "plannedCount", pending: "pendingCount" } as const;
  const name = (row: CoverageOverviewRow) => {
    const prefix = `${CONTENT_KIND_LABELS[row.category] ?? row.category}: `;
    return row.label.startsWith(prefix) ? row.label.slice(prefix.length) : row.label;
  };
  matching.sort((left, right) => {
    const countDifference = state.sort === "name" ? 0 : (left[countKey[state.sort]] - right[countKey[state.sort]]) * (state.sort === "pending" ? -1 : 1);
    return countDifference || name(left).localeCompare(name(right), "zh-Hans", { sensitivity: "base", numeric: true }) || left.id.localeCompare(right.id);
  });
  const lastOffset = Math.max(0, Math.ceil(matching.length / COVERAGE_OVERVIEW_PAGE_SIZE) - 1) * COVERAGE_OVERVIEW_PAGE_SIZE;
  const offset = Math.min(Math.max(0, Math.floor(state.offset / COVERAGE_OVERVIEW_PAGE_SIZE) * COVERAGE_OVERVIEW_PAGE_SIZE), lastOffset);
  return {
    summary: summarizeCoverageRows(matching),
    categoryTotal: categoryRows.length,
    categories,
    rows: matching.slice(offset, offset + COVERAGE_OVERVIEW_PAGE_SIZE),
    matchedCount: matching.length,
    offset,
  };
}
