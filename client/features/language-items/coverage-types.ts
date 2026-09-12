export interface CoverageFilters {
  skill?: string;
  activity?: string;
  domain?: string;
  contextId?: string;
  blueprintSlotId?: string;
  primaryCanDoId?: string;
  difficultyBand?: string;
  itemFormatId?: string;
}

export interface CoverageBatchSuggestion {
  registryVersion: string;
  targetContentIds: string[];
  desiredCount: number;
  filters: CoverageFilters;
}

export interface CoverageRequest {
  scope: "approved" | "drafts";
  registryVersion: string;
  role: "core" | "supporting" | "either" | "confirmed";
  selectedIds: string[];
  excludedIds: string[];
  matchMode: "all" | "any" | "exact";
  filters: CoverageFilters;
  desiredCount?: number;
  pattern?: string[];
  offset: number;
  limit: number;
  includeOverview?: boolean;
}

export interface CoverageOverview {
  approvedItemCount: number;
  pendingItemCount: number;
  plannedUnknownCount: number;
  confirmedUnknownCount: number;
  pendingUnknownCount: number;
  entries: Array<{ id: string; plannedCount: number; confirmedCount: number; pendingCount: number }>;
}

export interface CoverageOverviewState {
  category: string;
  search: string;
  sort: "name" | "planned" | "pending";
  offset: number;
}

export interface CoveragePageState {
  view: "overview" | "items";
  request: CoverageRequest;
  overviewInventory: Pick<CoverageRequest, "registryVersion" | "filters">;
  overview: CoverageOverviewState;
}

export interface CoverageMetadata {
  registryVersion: string;
  blueprintSlotId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  skill: string;
  activity: string;
  activities: string[];
  domain: string;
  contextId: string;
  difficultyBand: string;
  coreIds: string[] | null;
  supportingIds: string[] | null;
  confirmedIds?: string[] | null;
}

export interface CoverageCount {
  id: string;
  count: number;
}

export interface CoverageSetupCount {
  filters: CoverageFilters;
  approvedCount: number;
  pendingCount: number;
}

export interface CoverageResponse {
  setupCounts?: CoverageSetupCount[];
  approvedUnknownCount?: number;
  overview?: CoverageOverview;
  registryVersion: string;
  availableRegistryVersions: string[];
  scope: "approved" | "drafts";
  scopedCount: number;
  knownCount: number;
  unknownCount: number;
  matchedCount: number;
  pendingCount: number;
  pendingUnknownCount: number;
  termCounts: CoverageCount[];
  patterns: Array<{ presentIds: string[]; count: number }>;
  breakdowns: Record<string, CoverageCount[]>;
  goal: { desiredCount: number; approvedCount: number; pendingCount: number; approvedUnknownCount: number; pendingUnknownCount: number; unfilledCount: number } | null;
  items: Array<{ id: string; title: string; versionId: string | null; scope: "approved" | "drafts"; status: string; metadata: CoverageMetadata }>;
  offset: number;
  limit: number;
}
