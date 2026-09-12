import type { ContentAssessmentRule, ContentIdOption, RegistryCapability, RegistrySnapshot } from "./types.ts";

type RuleIdentity = Pick<ContentAssessmentRule, "blueprintSlotId" | "itemFormatId" | "primaryCanDoId" | "contextId">;
type RuleCapability = Pick<RegistryCapability, "blueprintSlotId" | "itemFormatId" | "primaryCanDoId">;

export const CONTENT_ASSESSMENT_LIST_FIELDS = [
  { key: "requiredEvidence", label: "Required evidence" },
  { key: "acceptableResponses", label: "Acceptable responses" },
  { key: "failurePatterns", label: "Failure patterns" },
  { key: "prerequisites", label: "Prerequisites" },
  { key: "validExamples", label: "Valid item example" },
  { key: "invalidExamples", label: "Invalid item example" },
] as const;

export function contentAssessmentRuleKey(rule: RuleIdentity): string {
  return JSON.stringify([rule.blueprintSlotId, rule.itemFormatId, rule.primaryCanDoId, rule.contextId]);
}

export function getContentAssessmentRule(entry: ContentIdOption, capability: RuleCapability, contextId: string): ContentAssessmentRule | undefined {
  const key = contentAssessmentRuleKey({ ...capability, contextId });
  const matches = entry.assessmentRules?.filter((rule) => contentAssessmentRuleKey(rule) === key) ?? [];
  // Conflicting legacy duplicates must not turn an explicit exclusion into permission.
  return matches.find((rule) => rule.applicability === "excluded") ?? matches[0];
}

export function createContentAssessmentRule(entry: ContentIdOption, capability: RuleCapability, contextId: string): ContentAssessmentRule {
  const saved = getContentAssessmentRule(entry, capability, contextId);
  return saved ? structuredClone(saved) : {
    blueprintSlotId: capability.blueprintSlotId, itemFormatId: capability.itemFormatId,
    primaryCanDoId: capability.primaryCanDoId, contextId, applicability: "allowed", assessmentMode: null,
    communicativePurpose: "", requiredEvidence: [], acceptableResponses: [], failurePatterns: [],
    prerequisites: [], validExamples: [], invalidExamples: [],
  };
}

export function replaceContentAssessmentRule(entry: ContentIdOption, capability: RuleCapability, contextId: string, rule: ContentAssessmentRule | null): ContentIdOption {
  const key = contentAssessmentRuleKey({ ...capability, contextId });
  if (rule && contentAssessmentRuleKey(rule) !== key) throw new Error("The assessment rule must match the selected Item rules and Context.");
  const next = structuredClone(entry);
  if (!rule && !next.assessmentRules) return next;
  const rules = next.assessmentRules ?? [];
  const index = rules.findIndex((saved) => contentAssessmentRuleKey(saved) === key);
  next.assessmentRules = rules.filter((saved) => contentAssessmentRuleKey(saved) !== key);
  if (rule) next.assessmentRules.splice(index < 0 ? next.assessmentRules.length : index, 0, structuredClone(rule));
  return next;
}

export function contentAssessmentModeOptions(capability: Pick<RegistryCapability, "primaryReportedSkill">) {
  if (["Reading", "Listening"].includes(capability.primaryReportedSkill)) return [{ id: "understanding", label: "Understanding" }] as const;
  if (["Writing", "Speaking"].includes(capability.primaryReportedSkill)) return [
    { id: "controlledProduction", label: "Controlled production" },
    { id: "freeProduction", label: "Free production" },
  ] as const;
  return [];
}

export function contentAssessmentRuleScopeConflicts(entry: ContentIdOption, capability: RegistryCapability, contextId: string): string[] {
  const issues: string[] = [];
  if (entry.contextIds.length && !entry.contextIds.includes(contextId)) issues.push("The entry's Applicable Context excludes this Context.");
  const canDoIds = [capability.primaryCanDoId, ...(capability.supportingCanDoIds ?? [])];
  if (entry.canDoIds.length && !entry.canDoIds.some((id) => canDoIds.includes(id))) issues.push("The entry's Applicable Can-do excludes these Item rules.");
  const receptive = ["Reading", "Listening"].includes(capability.primaryReportedSkill);
  const productive = ["Writing", "Speaking"].includes(capability.primaryReportedSkill);
  if (entry.masteryScope && entry.masteryScope !== "receptiveProductive"
    && !(receptive && entry.masteryScope === "receptive") && !(productive && entry.masteryScope === "productive")) {
    issues.push("The entry's Mastery scope excludes this skill.");
  }
  return issues;
}

export function contentAssessmentRuleIssues(rule: ContentAssessmentRule, capability: RegistryCapability): string[] {
  if (rule.applicability === "excluded") return [];
  const issues: string[] = [];
  if (!rule.assessmentMode) issues.push("Choose an assessment mode.");
  else if (!contentAssessmentModeOptions(capability).some((option) => option.id === rule.assessmentMode)) issues.push("Assessment mode does not match this skill.");
  if (!rule.communicativePurpose.trim()) issues.push("Add a communicative purpose.");
  if (!rule.requiredEvidence.length || rule.requiredEvidence.some((value) => !value.trim())) issues.push("Add required evidence and remove blank lines.");
  return issues;
}

export function prepareContentAssessmentRule(rule: ContentAssessmentRule, initial: ContentAssessmentRule): ContentAssessmentRule {
  const next = structuredClone(rule);
  if (rule.communicativePurpose !== initial.communicativePurpose) next.communicativePurpose = rule.communicativePurpose.trim();
  for (const { key } of CONTENT_ASSESSMENT_LIST_FIELDS) {
    if (JSON.stringify(rule[key]) !== JSON.stringify(initial[key])) next[key] = rule[key].map((value) => value.trim()).filter(Boolean);
  }
  return next;
}

export function contentAssessmentRuleBaseline(entry: ContentIdOption, capability: RuleCapability, contextId: string, snapshot: RegistrySnapshot): string {
  const key = contentAssessmentRuleKey({ ...capability, contextId });
  return JSON.stringify({
    bundleVersion: snapshot.bundleVersion,
    entry: snapshot.contentIdOptions.find((option) => option.id === entry.id),
    capability: snapshot.capabilities.find((option) => contentAssessmentRuleKey({ ...option, contextId }) === key),
    context: snapshot.contextOptions.find((option) => option.id === contextId),
  }, (_key, value: unknown) => value && typeof value === "object" && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) : value);
}
