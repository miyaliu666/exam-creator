import { isContentOptionCompatible } from "./content-compatibility.ts";
import { contentLanguage } from "./content-language.ts";
import { difficultyStandardsForCapability } from "./registry-capability.ts";
import { coverageContextMatchesFilter, coverageContextsForCapability } from "./coverage-context";
import type { CoverageFilters } from "./coverage-types";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function coverageContentScope(registry: RegistrySnapshot, filters: CoverageFilters): {
  entries: ContentIdOption[];
  hasMatchingSetup: boolean;
} {
  const language = filters.language ?? "zh";
  const directory = registry.contentIdOptions.filter((entry) => entry.kind !== "supported" && contentLanguage(entry) === language);
  // Opening Overview shows the entire directory, including entries without a current item setup.
  if (!Object.entries(filters).some(([key, value]) => key !== "language" && !!value)) return { entries: directory, hasMatchingSetup: true };

  const capabilities = registry.capabilities.filter((capability) =>
    (!filters.skill || filters.skill === capability.primaryReportedSkill) &&
    (!filters.activity || [capability.communicativeActivity, ...(capability.communicativeActivities ?? [])].includes(filters.activity)) &&
    (!filters.itemRuleId || filters.itemRuleId === capability.itemRuleId) &&
    (!filters.itemFormatId || filters.itemFormatId === capability.itemFormatId) &&
    (!filters.primaryCanDoId || filters.primaryCanDoId === capability.primaryCanDoId) &&
    difficultyStandardsForCapability(registry, capability).some((standard) =>
      registry.difficultyBands.includes(standard.id) && (!filters.difficultyBand || standard.id === filters.difficultyBand)));
  const setups = capabilities.flatMap((capability) => coverageContextsForCapability(registry, capability)
    .filter((context) => coverageContextMatchesFilter(context.id, filters.contextId) &&
      (!filters.domain || context.domain === filters.domain))
    .map((context) => ({ capability, contextId: context.id })));

  return {
    // Every condition must be satisfied by the same setup; item counts never determine eligibility.
    entries: directory.filter((entry) => setups.some(({ capability, contextId }) =>
      isContentOptionCompatible(entry, capability, contextId, language))),
    hasMatchingSetup: setups.length > 0,
  };
}
