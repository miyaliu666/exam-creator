import type {
  DifficultyBandStandard,
  RegistryCapability,
  RegistryContext,
  RegistrySnapshot,
  TaskPackage,
} from "./types";

export function capabilityKey(capability: Pick<RegistryCapability, "itemRuleId">) {
  return capability.itemRuleId;
}

export function exerciseRuleForCapability(registry: RegistrySnapshot | undefined, capability: RegistryCapability | undefined) {
  if (!capability) return undefined;
  return registry?.exerciseTemplateRules?.find((rule) =>
    rule.id === capability.itemRuleId &&
    `EXERCISE:${rule.exerciseType}` === capability.itemFormatId &&
    rule.primaryCanDoId === capability.primaryCanDoId);
}

export function contextIsOptional(registry: RegistrySnapshot | undefined, capability: RegistryCapability | undefined) {
  return exerciseRuleForCapability(registry, capability)?.allowedContextIds.length === 0;
}

export function setupContextIsCompatible(registry: RegistrySnapshot | undefined, capability: RegistryCapability | undefined, domain: string, contextId: string) {
  if (!contextId) return contextIsOptional(registry, capability);
  return contextsForCapability(registry, capability).some((context) => context.id === contextId && context.primaryDomains.includes(domain));
}

export function capabilityForDraft(
  registry: RegistrySnapshot | undefined,
  draft: TaskPackage,
) {
  const exact = registry?.capabilities.find(
    (entry) =>
      entry.itemRuleId === draft.itemRuleId &&
      entry.itemFormatId === draft.itemFormatId &&
      entry.primaryCanDoId === draft.content.primaryCanDoId,
  );
  if (exact) return exact;
  if (draft.content.primaryCanDoId) return undefined;

  const legacyMatches = registry?.capabilities.filter(
    (entry) =>
      entry.itemRuleId === draft.itemRuleId &&
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
  const rule = exerciseRuleForCapability(registry, capability);
  return registry.contextOptions.filter(
    (context) =>
      ((rule && !rule.allowedContextIds.length) || capability.allowedContextIds.includes(context.id)) &&
      contextSupportsCapability(context, capability) &&
      (!rule || rule.allowedDomains.includes(context.primaryDomains[0])) &&
      registry.allowedDomains.includes(context.primaryDomains[0]),
  );
}

export function domainsForCapability(registry: RegistrySnapshot, capability: RegistryCapability) {
  const rule = exerciseRuleForCapability(registry, capability);
  if (rule) return registry.allowedDomains.filter((domain) => rule.allowedDomains.includes(domain));
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
  const rule = exerciseRuleForCapability(registry, capability);
  if (rule) return rule.difficultyStandards;
  const key = capabilityKey(capability);
  const profiles = registry.capabilityDifficultyProfileSets ?? [];
  if (!profiles.length && (registry.settingsSchemaVersion ?? 0) === 0) return registry.difficultyStandards;
  const profile = profiles.find((entry) => entry.itemRuleId === key);
  return profile?.itemFormatId === capability.itemFormatId && profile.primaryCanDoId === capability.primaryCanDoId ? profile.standards : [];
}
