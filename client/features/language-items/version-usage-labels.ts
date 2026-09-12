import type { PilotDecision, PilotTimingBasis, VersionUsageState } from "./version-usage-types";

export const VERSION_USAGE_LABELS: Record<VersionUsageState, string> = {
  unreleased: "Unreleased", pilot: "Pilot", live: "Released for formal use", suspended: "Suspended", retired: "Retired",
};

export const PILOT_DECISION_LABELS: Record<PilotDecision, string> = {
  retain: "Retain for further observation", revise: "Revise content", retest: "Run another pilot",
  release: "Ready for formal use", retire: "Retire this version",
};

export const PILOT_TIMING_LABELS: Record<PilotTimingBasis, string> = {
  unknown: "Not recorded", elapsed: "Elapsed time per item", active: "Active time per item",
};
