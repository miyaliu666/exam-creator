import type { RegistrySnapshot } from "./types";
import { getContentAssessmentRule } from "./content-assessment-rules";
import { contentContextMatches, contentContextMode } from "./content-context-scope";
import { contentLanguage } from "./content-language";

type Capability = Pick<RegistrySnapshot["capabilities"][number], "itemRuleId" | "itemFormatId" | "primaryCanDoId" | "supportingCanDoIds" | "primaryReportedSkill">;
type ContentOption = RegistrySnapshot["contentIdOptions"][number];

export function isContentOptionCompatible(
  option: ContentOption,
  capability: Capability | undefined,
  contextId: string,
  language = "zh",
) {
  if (!capability || !["zh", "en", "es"].includes(language) || contentLanguage(option) !== language) return false;
  if (capability.itemFormatId?.startsWith("EXERCISE:") && !contextId &&
    (contentContextMode(option) !== "all" || option.contextIds.length > 0 || (option.excludedContextIds?.length ?? 0) > 0)) return false;

  const contextMatches = contentContextMatches(option, contextId);
  const relevantCanDoIds = new Set([
    capability.primaryCanDoId,
    ...(capability.supportingCanDoIds ?? []),
  ]);
  const canDoMatches =
    option.canDoIds.length === 0 ||
    option.canDoIds.some((canDoId) => relevantCanDoIds.has(canDoId));
  const isReceptiveSkill = ["Reading", "Listening"].includes(
    capability.primaryReportedSkill,
  );
  const isProductiveSkill = ["Writing", "Speaking"].includes(
    capability.primaryReportedSkill,
  );
  const masteryMatches =
    !option.masteryScope ||
    option.masteryScope === "receptiveProductive" ||
    (isReceptiveSkill && option.masteryScope === "receptive") ||
    (isProductiveSkill && option.masteryScope === "productive");

  return contextMatches && canDoMatches && masteryMatches &&
    (option.kind === "supported" || getContentAssessmentRule(option, capability, contextId)?.applicability !== "excluded");
}
