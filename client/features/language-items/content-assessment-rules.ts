import type { ContentAssessmentRule, ContentIdOption, RegistryCapability } from "./types.ts";

type RuleIdentity = Pick<ContentAssessmentRule, "itemRuleId" | "contextId">;
type RuleCapability = Pick<RegistryCapability, "itemRuleId" | "itemFormatId" | "primaryCanDoId">;

/** Read-only compatibility for assessment exceptions in pinned historical snapshots. */
export function contentAssessmentRuleKey(rule: RuleIdentity): string {
  return JSON.stringify([rule.itemRuleId, rule.contextId]);
}

export function getContentAssessmentRule(entry: ContentIdOption, capability: RuleCapability, contextId: string): ContentAssessmentRule | undefined {
  const key = contentAssessmentRuleKey({ ...capability, contextId });
  const matches = entry.assessmentRules?.filter((rule) => contentAssessmentRuleKey(rule) === key && rule.itemFormatId === capability.itemFormatId && rule.primaryCanDoId === capability.primaryCanDoId) ?? [];
  // Conflicting legacy duplicates must not turn an explicit exclusion into permission.
  return matches.find((rule) => rule.applicability === "excluded") ?? matches[0];
}
