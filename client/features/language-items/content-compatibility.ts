import type { RegistrySnapshot } from "./types";
import { getContentAssessmentRule } from "./content-assessment-rules";

type Capability = RegistrySnapshot["capabilities"][number];
type ContentOption = RegistrySnapshot["contentIdOptions"][number];

export function isContentOptionCompatible(
  option: ContentOption,
  capability: Capability | undefined,
  contextId: string,
) {
  if (!capability) return false;

  const contextMatches =
    option.contextIds.length === 0 || option.contextIds.includes(contextId);
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
