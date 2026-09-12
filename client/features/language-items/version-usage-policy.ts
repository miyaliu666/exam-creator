import type { VersionUsageState, VersionUsageSummary } from "./version-usage-types";

const TRANSITIONS: Record<VersionUsageState, readonly VersionUsageState[]> = {
  unreleased: ["pilot", "suspended", "retired"], pilot: ["live", "suspended", "retired"],
  live: ["suspended", "retired"], suspended: ["pilot", "live", "retired"], retired: [],
};

export function hasVersionUsage(versions: readonly VersionUsageSummary[]): boolean {
  return versions.some((version) => version.approved || version.revision > 0);
}

export function selectableUsageVersions(versions: readonly VersionUsageSummary[]): VersionUsageSummary[] {
  return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
}

export function selectedUsageVersion(versions: readonly VersionUsageSummary[], selectedId: string): VersionUsageSummary | undefined {
  return versions.find((version) => version.versionId === selectedId) ?? versions.find((version) => version.approved) ?? versions[0];
}

export function usageTransitions(version: VersionUsageSummary): readonly VersionUsageState[] {
  if (!version.approved) return version.revision > 0 ? TRANSITIONS[version.state].filter((state) => state === "suspended" || state === "retired") : [];
  const latest = version.latestPilot;
  const canRelease = latest?.change.kind === "pilot" && latest.change.summary.decision === "release"
    && latest.revision > (version.lastSuspensionRevision ?? 0);
  return TRANSITIONS[version.state].filter((state) => state !== "live" || canRelease);
}
