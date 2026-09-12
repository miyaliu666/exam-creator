import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { PilotResultFields } from "../client/features/language-items/pilot-result-fields";
import { EMPTY_PILOT_FORM, observedPercent, parsePilotResult, type PilotResultFormState } from "../client/features/language-items/pilot-result-form-state";
import { PilotResultSummary } from "../client/features/language-items/pilot-result-summary";
import { hasVersionUsage, selectableUsageVersions, selectedUsageVersion, usageTransitions } from "../client/features/language-items/version-usage-policy";
import type { PilotSummary, VersionUsageEvent, VersionUsageSummary } from "../client/features/language-items/version-usage-types";

function form(patch: Partial<PilotResultFormState> = {}): PilotResultFormState {
  return { ...EMPTY_PILOT_FORM, source: "September pilot report", sampleRef: "2026-09 group A", cohort: "A1 adult learners", sampleSize: "20", notes: "Observe more candidates before changing use status.", ...patch };
}

function pilot(patch: Partial<PilotSummary> = {}): PilotSummary {
  return { ...parsePilotResult(form()).summary!, ...patch };
}

function event(decision: PilotSummary["decision"], revision = 2): VersionUsageEvent {
  return { id: `event-${revision}`, itemId: "item", versionId: "version-1", contentHash: "hash-1", registryVersion: "rules-1",
    revision, requestId: "request", actorEmail: "author@example.test", createdAt: "2026-09-12T00:00:00Z", state: "pilot",
    change: { kind: "pilot", summary: pilot({ decision }) } };
}

function version(patch: Partial<VersionUsageSummary> = {}): VersionUsageSummary {
  return { versionId: "version-1", versionNumber: 1, contentHash: "hash-1", registryVersion: "rules-1", approved: true,
    approvalIssue: null, state: "unreleased", revision: 0, latestPilot: null, lastSuspensionRevision: null, ...patch };
}

test("version use starts after approval or recorded use, independent of mutable drafts", () => {
  assert.equal(hasVersionUsage([]), false);
  const pending = version({ approved: false, approvalIssue: "Review is incomplete" });
  assert.equal(hasVersionUsage([pending]), false);
  assert.equal(hasVersionUsage([pending, version()]), true);
  assert.equal(hasVersionUsage([{ ...pending, revision: 3, state: "live" }]), true);
  assert.equal(hasVersionUsage([{ ...pending, revision: 4, state: "retired" }]), true);
});

test("manual pilot results keep unknown metrics distinct from observed zero", () => {
  const missing = parsePilotResult(form()).summary!;
  assert.equal(missing.correctCount, null);
  assert.equal(missing.omittedCount, null);
  assert.equal(missing.discrimination, null);
  assert.equal(missing.medianResponseTimeSeconds, null);
  assert.equal(missing.timingBasis, "unknown");
  const zero = parsePilotResult(form({ correctCount: "0", omittedCount: "0", discrimination: "0", medianResponseTimeSeconds: "0", timingBasis: "active" })).summary!;
  assert.equal(zero.correctCount, 0);
  assert.equal(zero.medianResponseTimeSeconds, 0);
  assert.match(observedPercent(zero.correctCount, zero.sampleSize), /^0%/);
  assert.equal(observedPercent(missing.correctCount, missing.sampleSize), "Not recorded");
});

test("pilot count validation rejects impossible or fractional cohorts", () => {
  for (const patch of [
    { sampleSize: "0" }, { sampleSize: "1.5" }, { sampleSize: "10000001" }, { sampleSize: "Infinity" },
    { correctCount: "21" }, { omittedCount: "-1" }, { correctCount: "1.5" }, { correctCount: "12", omittedCount: "9" },
  ]) assert.equal(parsePilotResult(form(patch)).summary, null, JSON.stringify(patch));
  assert.ok(parsePilotResult(form({ correctCount: "12", omittedCount: "8" })).summary);
});

test("response timing needs its measurement basis and correlation stays within its scale", () => {
  assert.equal(parsePilotResult(form({ medianResponseTimeSeconds: "12" })).summary, null);
  assert.equal(parsePilotResult(form({ medianResponseTimeSeconds: "-1", timingBasis: "elapsed" })).summary, null);
  assert.equal(parsePilotResult(form({ discrimination: "1.1" })).summary, null);
  assert.equal(parsePilotResult(form({ discrimination: "NaN" })).summary, null);
  assert.equal(parsePilotResult(form({ discrimination: "-0.2" })).summary?.discrimination, -0.2);
  assert.equal(parsePilotResult(form({ timingBasis: "active" })).summary?.timingBasis, "unknown");
  assert.equal(parsePilotResult(form({ medianResponseTimeSeconds: "25.5", timingBasis: "elapsed" })).summary?.medianResponseTimeSeconds, 25.5);
});

test("manual summaries require traceable source, cohort and decision rationale", () => {
  for (const key of ["source", "sampleRef", "cohort", "notes"] as const) assert.equal(parsePilotResult(form({ [key]: " " })).summary, null, key);
  assert.equal(parsePilotResult(form({ source: "  pilot report  " })).summary?.source, "pilot report");
});

test("formal use requires the latest explicit release decision, independent of sample size", () => {
  assert.deepEqual(usageTransitions(version()), ["pilot", "suspended", "retired"]);
  assert.ok(!usageTransitions(version({ state: "pilot", revision: 2 })).includes("live"));
  assert.ok(!usageTransitions(version({ state: "pilot", revision: 2, latestPilot: event("retain") })).includes("live"));
  assert.ok(usageTransitions(version({ state: "pilot", revision: 2, latestPilot: event("release") })).includes("live"));
  assert.ok(!usageTransitions(version({ state: "pilot", revision: 2, latestPilot: event("revise") })).includes("live"));
});

test("a suspension invalidates earlier release evidence even after returning to pilot", () => {
  const suspended = version({ state: "suspended", revision: 4, latestPilot: event("release", 2), lastSuspensionRevision: 4 });
  assert.ok(!usageTransitions(suspended).includes("live"));
  assert.ok(!usageTransitions({ ...suspended, state: "pilot", revision: 5 }).includes("live"));
  assert.ok(usageTransitions({ ...suspended, state: "pilot", revision: 6, latestPilot: event("release", 6) }).includes("live"));
  assert.deepEqual(usageTransitions({ ...suspended, state: "retired" }), []);
});

test("withdrawal stays available for a used version after approval is lost", () => {
  const revoked = version({ approved: false, approvalIssue: "Review no longer approves", revision: 3, state: "live" });
  assert.deepEqual(usageTransitions(revoked), ["suspended", "retired"]);
  assert.deepEqual(usageTransitions({ ...revoked, state: "suspended" }), ["retired"]);
  assert.deepEqual(usageTransitions({ ...revoked, state: "unreleased", revision: 0 }), []);
});

test("a selected immutable version stays selected when newer approvals arrive or approval is revoked", () => {
  const old = version();
  const newer = version({ versionId: "version-2", versionNumber: 2 });
  const listed = selectableUsageVersions([old, newer]);
  assert.equal(selectedUsageVersion(listed, old.versionId)?.versionId, old.versionId);
  assert.equal(selectedUsageVersion(listed, "")?.versionId, newer.versionId);
  const revoked = { ...old, approved: false };
  assert.equal(selectedUsageVersion(selectableUsageVersions([revoked, newer]), old.versionId)?.versionId, old.versionId);
  assert.deepEqual(selectableUsageVersions([revoked]), [revoked]);
  assert.equal(selectableUsageVersions([{ ...revoked, revision: 1 }]).length, 1);
  assert.deepEqual(usageTransitions(revoked), []);
});

test("all frozen versions stay inspectable while the default prefers the latest approval", () => {
  const approved = version();
  const pending = version({ versionId: "pending", versionNumber: 2, approved: false, approvalIssue: "Review is incomplete" });
  const listed = selectableUsageVersions([approved, pending]);
  assert.deepEqual(listed.map((entry) => entry.versionId), ["pending", "version-1"]);
  assert.equal(selectedUsageVersion(listed, "")?.versionId, approved.versionId);
  assert.equal(selectedUsageVersion(listed, pending.versionId)?.versionId, pending.versionId);
  assert.equal(selectedUsageVersion([pending], "")?.versionId, pending.versionId);
  assert.deepEqual(usageTransitions(pending), []);
});

test("recorded summary renders unknown observations without inventing percentages or timing", () => {
  const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><PilotResultSummary summary={pilot()} /></ChakraProvider>);
  assert.match(html, /Manual summary/);
  assert.match(html, /Not recorded/);
  assert.doesNotMatch(html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, ""), /0%|0 seconds/);
});

test("pilot form labels identify the sample and explicit timing basis", () => {
  const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><PilotResultFields form={form()} disabled={false} onChange={() => undefined} /></ChakraProvider>);
  assert.match(html, /for="pilot-source"/);
  assert.match(html, /for="pilot-cohort"/);
  assert.match(html, /Elapsed time per item/);
  assert.match(html, /Active time per item/);
  assert.match(html, /Ready for formal use/);
});
