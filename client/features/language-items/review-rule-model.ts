import { capabilityKey } from "./registry-capability.ts";
import type { ReviewCustomRule, ReviewPlanPreview, ReviewRuleSet, ReviewRuleSuggestions } from "./review-rule-types.ts";
import type { RegistryCapability, RegistrySnapshot } from "./types.ts";

type RuleCapability = Pick<RegistryCapability, "itemRuleId" | "itemFormatId" | "primaryCanDoId">;

export function reviewRuleSetForCapability(snapshot: RegistrySnapshot, capability: RuleCapability) {
  const rules = snapshot.reviewRuleSets?.find((entry) => capabilityKey(entry) === capabilityKey(capability));
  return rules?.itemFormatId === capability.itemFormatId && rules.primaryCanDoId === capability.primaryCanDoId ? rules : undefined;
}

export function isLegacyPublishedReview(snapshot: RegistrySnapshot, capability: RuleCapability, published: boolean) {
  return published && (snapshot.settingsSchemaVersion ?? 0) < 2 && !reviewRuleSetForCapability(snapshot, capability);
}

export function reviewRuleRequestKey(snapshot: RegistrySnapshot, capability: RuleCapability, versionId: string, revision: number) {
  return JSON.stringify([versionId, revision, capabilityKey(capability), snapshot]);
}

export function reviewCustomRuleIssues(rule: ReviewCustomRule, sources: ReviewPlanPreview["sources"]) {
  const issues: string[] = [];
  if (!rule.id.trim()) issues.push("The rule identity is missing.");
  if (rule.id.trim() !== rule.id) issues.push("The rule identity cannot contain surrounding spaces.");
  if (rule.id.startsWith("fixed.")) issues.push("A supplementary rule cannot use a fixed requirement identity.");
  if (!rule.title.trim()) issues.push("Enter a rule name.");
  if (!rule.criterion.trim()) issues.push("Enter the pass criteria.");
  if (!rule.requiredEvidence.length || rule.requiredEvidence.some((value) => !value.trim())) issues.push("Describe the required evidence and remove blank lines.");
  if (!rule.sourceRefs.length) issues.push("Select at least one source setting.");
  if (rule.sourceRefs.some((id) => !sources.some((source) => source.id === id))) issues.push("Remove unavailable sources.");
  if (new Set(rule.sourceRefs).size !== rule.sourceRefs.length) issues.push("Remove duplicate sources.");
  return issues;
}

export function newReviewCustomRule(): ReviewCustomRule {
  return { id: `review-custom-${crypto.randomUUID()}`, title: "", criterion: "", requiredEvidence: [], sourceRefs: [], required: true };
}

export function prepareReviewCustomRule(rule: ReviewCustomRule): ReviewCustomRule {
  return { ...structuredClone(rule), title: rule.title.trim(), criterion: rule.criterion.trim(),
    requiredEvidence: rule.requiredEvidence.map((line) => line.trim()).filter(Boolean), sourceRefs: [...new Set(rule.sourceRefs)] };
}

export function writeReviewRuleSet(snapshot: RegistrySnapshot, capability: RuleCapability, rules: ReviewCustomRule[], preview: ReviewPlanPreview, acceptSources: boolean) {
  if (capabilityKey(preview.plan) !== capabilityKey(capability) || preview.plan.itemFormatId !== capability.itemFormatId || preview.plan.primaryCanDoId !== capability.primaryCanDoId) throw new Error("The review plan belongs to different Item rules.");
  const current = reviewRuleSetForCapability(snapshot, capability);
  const next: ReviewRuleSet = {
    ...current, itemRuleId: capability.itemRuleId, itemFormatId: capability.itemFormatId, primaryCanDoId: capability.primaryCanDoId,
    sourceFingerprint: !current || acceptSources ? preview.sourceFingerprint : current.sourceFingerprint,
    sourceFingerprints: structuredClone(!current || acceptSources ? preview.sourceFingerprints : current.sourceFingerprints),
    rules: structuredClone(rules),
  };
  snapshot.reviewRuleSets ??= [];
  const index = snapshot.reviewRuleSets.findIndex((entry) => capabilityKey(entry) === capabilityKey(capability));
  if (index < 0) snapshot.reviewRuleSets.push(next); else snapshot.reviewRuleSets[index] = next;
}

export function removeReviewCustomRule(snapshot: RegistrySnapshot, capability: RuleCapability, id: string, preview: ReviewPlanPreview) {
  const current = reviewRuleSetForCapability(snapshot, capability);
  if (!current?.rules.some((rule) => rule.id === id)) return;
  const remaining = current.rules.filter((rule) => rule.id !== id);
  if (remaining.length) writeReviewRuleSet(snapshot, capability, remaining, preview, false);
  else snapshot.reviewRuleSets = snapshot.reviewRuleSets?.filter((entry) => capabilityKey(entry) !== capabilityKey(capability));
}

export interface ReviewRuleProposal { proposed: ReviewCustomRule; previous: ReviewCustomRule | undefined; changed: boolean; issues: string[] }

export function reviewRuleProposals(result: ReviewRuleSuggestions, current: ReviewCustomRule[]): ReviewRuleProposal[] {
  const counts = new Map<string, number>();
  for (const rule of result.suggestions) counts.set(rule.id, (counts.get(rule.id) ?? 0) + 1);
  return result.suggestions.map((proposed) => {
    const previous = current.find((rule) => rule.id === proposed.id);
    const issues = reviewCustomRuleIssues(proposed, result.sources);
    if ((counts.get(proposed.id) ?? 0) > 1) issues.push("AI returned this rule identity more than once.");
    if (result.plan.checks.some((check) => check.id === proposed.id && check.origin === "fixed")) issues.push("A supplementary rule cannot replace a fixed source requirement.");
    return { proposed, previous, changed: JSON.stringify(proposed) !== JSON.stringify(previous), issues };
  });
}

export function applyReviewRuleProposals(current: ReviewCustomRule[], baseline: ReviewCustomRule[], proposals: ReviewRuleProposal[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length || selectedIds.some((id) => !proposals.some((proposal) => proposal.proposed.id === id))) throw new Error("The selected review suggestions are unavailable.");
  const result = structuredClone(current);
  for (const { proposed, previous, issues } of proposals.filter((proposal) => selected.has(proposal.proposed.id))) {
    if (issues.length) throw new Error(issues.join(" "));
    const live = current.find((rule) => rule.id === proposed.id);
    const opened = baseline.find((rule) => rule.id === proposed.id);
    if (JSON.stringify(live) !== JSON.stringify(opened) || JSON.stringify(opened) !== JSON.stringify(previous)) throw new Error("This review rule changed after AI generation. Regenerate suggestions before replacing it.");
    const index = result.findIndex((rule) => rule.id === proposed.id);
    if (index < 0) result.push(prepareReviewCustomRule(proposed)); else result[index] = prepareReviewCustomRule(proposed);
  }
  return result;
}
