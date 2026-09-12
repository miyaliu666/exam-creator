export type VersionUsageState = "unreleased" | "pilot" | "live" | "suspended" | "retired";
export type PilotDecision = "retain" | "revise" | "retest" | "release" | "retire";
export type PilotTimingBasis = "elapsed" | "active" | "unknown";

export interface PilotSummary {
  source: string;
  sampleRef: string;
  cohort: string;
  sampleSize: number;
  correctCount: number | null;
  omittedCount: number | null;
  discrimination: number | null;
  medianResponseTimeSeconds: number | null;
  timingBasis: PilotTimingBasis;
  decision: PilotDecision;
  notes: string;
}

export type VersionUsageChange =
  | { kind: "state"; state: VersionUsageState; reason: string }
  | { kind: "pilot"; summary: PilotSummary };

export interface VersionUsageEvent {
  id: string;
  itemId: string;
  versionId: string;
  contentHash: string;
  registryVersion: string;
  revision: number;
  requestId: string;
  actorEmail: string;
  createdAt: string;
  state: VersionUsageState;
  change: VersionUsageChange;
}

export interface VersionUsageSummary {
  versionId: string;
  versionNumber: number;
  contentHash: string;
  registryVersion: string;
  approved: boolean;
  approvalIssue: string | null;
  state: VersionUsageState;
  revision: number;
  latestPilot: VersionUsageEvent | null;
  lastSuspensionRevision: number | null;
}

export interface VersionUsagePage {
  version: VersionUsageSummary;
  events: VersionUsageEvent[];
  nextBeforeRevision: number | null;
}

export interface VersionUsageWrite {
  requestId: string;
  expectedRevision: number;
  change: VersionUsageChange;
}
