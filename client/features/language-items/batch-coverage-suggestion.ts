import { isContentOptionCompatible } from "./content-compatibility.ts";
import { contextsForCapability, difficultyStandardsForCapability } from "./registry-capability.ts";
import type { BatchGroup } from "./batch-api";
import type { CoverageBatchSuggestion } from "./coverage-types";
import type { RegistrySnapshot } from "./types";
import type { NewLanguageItemSelection } from "./new-language-item-dialog";

function unique(values: string[]) {
  const choices = [...new Set(values)];
  return choices.length === 1 ? choices[0] : "";
}

export function coverageSuggestionSetup(suggestion: CoverageBatchSuggestion, registry: RegistrySnapshot): Partial<BatchGroup> | undefined {
  // A matching identifier in another published version can carry different meaning.
  if (suggestion.registryVersion !== registry.bundleVersion) return undefined;
  const filters = suggestion.filters;
  const capabilities = registry.capabilities.filter((capability) =>
    (!filters.skill || filters.skill === capability.primaryReportedSkill) &&
    (!filters.activity || (capability.communicativeActivities ?? [capability.communicativeActivity]).includes(filters.activity)) &&
    (!filters.blueprintSlotId || filters.blueprintSlotId === capability.blueprintSlotId) &&
    (!filters.itemFormatId || filters.itemFormatId === capability.itemFormatId) &&
    (!filters.primaryCanDoId || filters.primaryCanDoId === capability.primaryCanDoId) &&
    (!filters.difficultyBand || difficultyStandardsForCapability(registry, capability).some((standard) => standard.id === filters.difficultyBand)));
  const combinations = capabilities.flatMap((capability) => contextsForCapability(registry, capability)
    .filter((context) => capability.allowedDomains.includes(context.primaryDomains[0]) &&
      (!filters.contextId || filters.contextId === context.id) &&
      (!filters.domain || context.primaryDomains.includes(filters.domain)) &&
      suggestion.targetContentIds.every((id) => {
        const target = registry.contentIdOptions.find((entry) => entry.id === id);
        return target && target.kind !== "supported" && isContentOptionCompatible(target, capability, context.id);
      }))
    .map((context) => ({ capability, context })));
  if (!combinations.length) return undefined;
  return {
    blueprintSlotId: filters.blueprintSlotId ?? unique(combinations.map(({ capability }) => capability.blueprintSlotId)),
    itemFormatId: filters.itemFormatId ?? unique(combinations.map(({ capability }) => capability.itemFormatId)),
    primaryCanDoId: filters.primaryCanDoId ?? unique(combinations.map(({ capability }) => capability.primaryCanDoId)),
    primaryDomain: filters.domain ?? unique(combinations.map(({ context }) => context.primaryDomains[0])),
    contextId: filters.contextId ?? unique(combinations.map(({ context }) => context.id)),
    difficultyBand: filters.difficultyBand ?? "TypicalA1",
    itemCount: suggestion.desiredCount,
    requiredTargetContentIds: [...suggestion.targetContentIds],
    rotatingTargetContentIds: [],
  };
}

export function setupMatchesCoverageSuggestion(suggestion: CoverageBatchSuggestion, selection: NewLanguageItemSelection, registry: RegistrySnapshot) {
  const filters = suggestion.filters;
  const dimensions = {
    blueprintSlotId: selection.blueprintSlotId, itemFormatId: selection.itemFormatId,
    primaryCanDoId: selection.primaryCanDoId, domain: selection.primaryDomain,
    contextId: selection.contextId, difficultyBand: selection.difficultyBand,
  };
  if (Object.entries(dimensions).some(([key, value]) => {
    const filter = filters[key as keyof typeof dimensions];
    return !!filter && filter !== value;
  })) return false;
  return !!coverageSuggestionSetup({ ...suggestion, filters: { ...filters, ...dimensions } }, registry);
}
