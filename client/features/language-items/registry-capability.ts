import type {
  DifficultyBandStandard,
  RegistryCapability,
  RegistryContext,
  RegistrySnapshot,
  TaskPackage,
} from "./types";

export function capabilityKey(capability: Pick<RegistryCapability, "blueprintSlotId" | "itemFormatId" | "primaryCanDoId">) {
  return `${capability.blueprintSlotId}::${capability.itemFormatId}::${capability.primaryCanDoId}`;
}

export function capabilityForDraft(
  registry: RegistrySnapshot | undefined,
  draft: TaskPackage,
) {
  const exact = registry?.capabilities.find(
    (entry) =>
      entry.blueprintSlotId === draft.blueprintSlotId &&
      entry.itemFormatId === draft.itemFormatId &&
      entry.primaryCanDoId === draft.content.primaryCanDoId,
  );
  if (exact) return exact;
  if (draft.content.primaryCanDoId) return undefined;

  const legacyMatches = registry?.capabilities.filter(
    (entry) =>
      entry.blueprintSlotId === draft.blueprintSlotId &&
      entry.itemFormatId === draft.itemFormatId,
  );
  return legacyMatches?.length === 1 ? legacyMatches[0] : undefined;
}

export function contextSupportsCapability(
  context: RegistryContext,
  capability: RegistryCapability,
) {
  return !context.retired && context.primaryDomains.length === 1 &&
    !!context.label.trim() && !!context.scope.trim() &&
    context.canDoIds.includes(capability.primaryCanDoId);
}

export function contextsForCapability(
  registry: RegistrySnapshot | undefined,
  capability: RegistryCapability | undefined,
) {
  if (!registry || !capability) return [];
  return registry.contextOptions.filter(
    (context) =>
      capability.allowedContextIds.includes(context.id) &&
      contextSupportsCapability(context, capability) &&
      registry.allowedDomains.includes(context.primaryDomains[0]),
  );
}

export function domainsForCapability(registry: RegistrySnapshot, capability: RegistryCapability) {
  const contexts = contextsForCapability(registry, capability);
  return registry.allowedDomains.filter((domain) => contexts.some((context) => context.primaryDomains.includes(domain)));
}

export function contextCompatibilityIssue(registry: RegistrySnapshot, context: RegistryContext | undefined, capability: RegistryCapability) {
  if (!context) return "This context no longer exists.";
  if (context.retired) return "This context is retired.";
  if (!context.canDoIds.includes(capability.primaryCanDoId)) return "Does not support the selected Primary Can-do.";
  if (context.primaryDomains.length !== 1 || !registry.allowedDomains.includes(context.primaryDomains[0])) return "Requires one valid Domain.";
  if (!context.label.trim() || !context.scope.trim()) return "Context name and scope are required.";
  return null;
}

export function difficultyStandardsForCapability(
  registry: RegistrySnapshot | undefined,
  capability: RegistryCapability | undefined,
): DifficultyBandStandard[] {
  if (!registry || !capability) return [];
  const key = capabilityKey(capability);
  return registry.capabilityDifficultyProfileSets?.find(
    (profile) =>
      `${profile.blueprintSlotId}::${profile.itemFormatId}::${profile.primaryCanDoId}` === key,
  )?.standards ?? registry.difficultyStandards;
}
