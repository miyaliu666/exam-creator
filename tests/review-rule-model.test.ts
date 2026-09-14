import assert from "node:assert/strict";
import test from "node:test";

import { applyReviewRuleProposals, isLegacyPublishedReview, removeReviewCustomRule, reviewCustomRuleIssues, reviewRuleProposals, reviewRuleRequestKey, reviewRuleSetForCapability, writeReviewRuleSet } from "../client/features/language-items/review-rule-model.ts";
import type { ReviewCustomRule, ReviewPlanPreview, ReviewRuleSuggestions } from "../client/features/language-items/review-rule-types.ts";
import type { RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types.ts";

const capability = { itemRuleId: "slot", itemFormatId: "format", primaryCanDoId: "can-do" } as RegistryCapability;
const custom: ReviewCustomRule = { id: "author-rule", title: "Avoid misleading room numbers", criterion: "The room destination is unambiguous", requiredEvidence: ["Quote the applicable room information"], sourceRefs: ["slot.slot"], required: true };
const preview: ReviewPlanPreview = {
  plan: { ...capability, planVersion: "1", planHash: "plan-1", sourceFingerprint: "new-source", checks: [{ ...custom, id: "fixed.context", origin: "fixed", method: "ai" }] },
  sourceFingerprint: "new-source", sourceFingerprints: { "slot.slot": "new" }, savedSourceFingerprint: "old-source", stale: true,
  sourceChanges: [{ sourceRef: "slot.slot", label: "Item rules", change: "changed" }], sources: [{ id: "slot.slot", label: "Item rules", value: { purpose: "Find a classroom" } }],
};
function snapshot(): RegistrySnapshot {
  return { bundleVersion: "draft", reviewRuleSets: [{ ...capability, sourceFingerprint: "old-source", sourceFingerprints: { "slot.slot": "old" }, rules: [structuredClone(custom)] }] } as RegistrySnapshot;
}
function suggestions(rules: ReviewCustomRule[]): ReviewRuleSuggestions {
  return { ...preview, provider: "openai", model: "review-model", promptVersion: "1", simulated: false, suggestions: rules };
}

test("review rule sets use exact Item rules identity and leave legacy snapshots unchanged", () => {
  const legacy = { bundleVersion: "old" } as RegistrySnapshot;
  assert.equal(reviewRuleSetForCapability(legacy, capability), undefined);
  assert.equal(Object.hasOwn(legacy, "reviewRuleSets"), false);
  const configured = snapshot();
  assert.equal(reviewRuleSetForCapability(configured, capability)?.rules[0].id, custom.id);
  for (const field of ["itemRuleId", "itemFormatId", "primaryCanDoId"] as const) assert.equal(reviewRuleSetForCapability(configured, { ...capability, [field]: "other" }), undefined);
});

test("editing supplementary criteria does not silently acknowledge changed source settings", () => {
  const state = snapshot();
  const changed = { ...custom, criterion: "Updated author criterion" };
  writeReviewRuleSet(state, capability, [changed], preview, false);
  assert.equal(state.reviewRuleSets?.[0].sourceFingerprint, "old-source");
  assert.deepEqual(state.reviewRuleSets?.[0].sourceFingerprints, { "slot.slot": "old" });
  assert.equal(state.reviewRuleSets?.[0].rules[0].criterion, changed.criterion);
  writeReviewRuleSet(state, capability, [changed], preview, true);
  assert.equal(state.reviewRuleSets?.[0].sourceFingerprint, "new-source");
  assert.deepEqual(state.reviewRuleSets?.[0].sourceFingerprints, preview.sourceFingerprints);
});

test("accepting current sources preserves other combinations and cannot apply a different plan", () => {
  const state = snapshot();
  const other = { ...capability, itemRuleId: "other-rule", primaryCanDoId: "other" };
  const unrelated = { ...state.reviewRuleSets![0], ...other };
  state.reviewRuleSets!.push(unrelated);
  writeReviewRuleSet(state, capability, [], preview, true);
  assert.deepEqual(state.reviewRuleSets?.[1], unrelated);
  assert.throws(() => writeReviewRuleSet(state, other, [], preview, true), /different Item rules/);
  assert.equal(preview.plan.checks[0].required, true);
});

test("AI proposals apply only selected differences and never remove unmentioned author rules", () => {
  const second = { ...custom, id: "keep-author-rule", criterion: "Keep this author standard" };
  const proposed = { ...custom, criterion: "AI proposed standard" };
  const added = { ...custom, id: "ai-added" };
  const original = [custom, second];
  const proposals = reviewRuleProposals(suggestions([proposed, added]), original);
  assert.deepEqual(applyReviewRuleProposals(original, original, proposals, []), original);
  const applied = applyReviewRuleProposals(original, original, proposals, [added.id]);
  assert.equal(applied[0].criterion, custom.criterion);
  assert.deepEqual(applied[1], second);
  assert.equal(applied[2].id, added.id);
  assert.equal(original.length, 2);
});

test("manual changes and concurrent identity additions block stale AI replacements", () => {
  const proposed = { ...custom, criterion: "AI proposed" };
  const proposals = reviewRuleProposals(suggestions([proposed]), [custom]);
  assert.throws(() => applyReviewRuleProposals([{ ...custom, criterion: "Latest author edit" }], [custom], proposals, [custom.id]), /changed after AI generation/);
  const added = { ...custom, id: "new-id" };
  const additions = reviewRuleProposals(suggestions([added]), []);
  assert.throws(() => applyReviewRuleProposals([added], [], additions, [added.id]), /changed after AI generation/);
  assert.throws(() => applyReviewRuleProposals([custom], [custom], proposals, ["missing"]), /unavailable/);
});

test("generated rules cannot replace fixed requirements or hide duplicate identities", () => {
  const fixed = { ...custom, id: "fixed.context" };
  assert.match(reviewRuleProposals(suggestions([fixed]), [])[0].issues.join(" "), /fixed/);
  const duplicate = reviewRuleProposals(suggestions([custom, custom]), []);
  assert.ok(duplicate.every((proposal) => proposal.issues.some((issue) => issue.includes("more than once"))));
  assert.throws(() => applyReviewRuleProposals([], [], duplicate, [custom.id]), /more than once/);
  assert.match(reviewCustomRuleIssues({ ...custom, sourceRefs: ["missing"] }, preview.sources).join(" "), /unavailable sources/);
  assert.match(reviewCustomRuleIssues({ ...custom, sourceRefs: [] }, preview.sources).join(" "), /at least one source/);
  assert.match(reviewCustomRuleIssues({ ...custom, sourceRefs: ["slot.slot", "slot.slot"] }, preview.sources).join(" "), /duplicate sources/);
});

test("generation baselines include unsaved settings, revision and Registry identity", () => {
  const initial = snapshot();
  const key = reviewRuleRequestKey(initial, capability, "version-1", 4);
  assert.notEqual(reviewRuleRequestKey(initial, capability, "version-1", 5), key);
  assert.notEqual(reviewRuleRequestKey(initial, capability, "version-2", 4), key);
  assert.notEqual(reviewRuleRequestKey({ ...initial, limitations: ["Changed unsaved source"] }, capability, "version-1", 4), key);
});

test("removing the final custom rule clears only that ruleset without migrating legacy empty sets on read", () => {
  const state = snapshot();
  const other = { ...state.reviewRuleSets![0], itemRuleId: "other-rule", primaryCanDoId: "other", rules: [] };
  state.reviewRuleSets!.push(other);
  removeReviewCustomRule(state, capability, custom.id, preview);
  assert.equal(reviewRuleSetForCapability(state, capability), undefined);
  assert.deepEqual(state.reviewRuleSets, [other]);
  removeReviewCustomRule(state, other, "missing", preview);
  assert.deepEqual(state.reviewRuleSets, [other]);
});

test("only published legacy combinations without a ruleset use earlier review checks", () => {
  const state = { settingsSchemaVersion: 1 } as RegistrySnapshot;
  assert.equal(isLegacyPublishedReview(state, capability, true), true);
  assert.equal(isLegacyPublishedReview(state, capability, false), false);
  assert.equal(isLegacyPublishedReview({ ...state, settingsSchemaVersion: 2 }, capability, true), false);
  assert.equal(isLegacyPublishedReview(snapshot(), capability, true), false);
});
