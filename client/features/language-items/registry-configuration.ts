import { capabilityKey } from "./registry-capability.ts";
import { initialDifficultyStandards } from "./registry-difficulty.ts";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export type UpdateRegistryConfiguration = (mutate: (snapshot: RegistrySnapshot) => void) => void;

export function configurationBindings(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  const scoringContracts = snapshot.scoringContracts?.filter((entry) =>
    entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === capability.itemFormatId,
  ) ?? [];
  const taskFamilies = snapshot.taskFamilyOptions?.filter((entry) =>
    entry.blueprintSlotIds?.includes(capability.blueprintSlotId) && entry.allowedItemFormatIds?.includes(capability.itemFormatId),
  ) ?? [];
  return {
    scoringContracts,
    taskFamilies,
    scoringContract: scoringContracts.find((entry) => entry.scoringContractTemplateId === capability.scoringContractTemplateId),
    taskFamilyMatches: !snapshot.taskFamilyOptions?.some((entry) => entry.blueprintSlotIds?.length)
      || taskFamilies.some((entry) => entry.id === capability.taskFamilyId),
  };
}

export function configurationSiblings(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  return snapshot.capabilities.filter((entry) =>
    entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === capability.itemFormatId,
  );
}

export function unusedConfigurationPrimaries(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  const siblings = configurationSiblings(snapshot, capability);
  return snapshot.canDoOptions.filter((option) =>
    !siblings.some((entry) => entry.primaryCanDoId === option.id)
    && option.primarySkill === capability.primaryReportedSkill
    && option.activity === capability.communicativeActivity,
  );
}

export function addRegistryConfiguration(snapshot: RegistrySnapshot, selected: RegistryCapability, primaryId: string) {
  const source = snapshot.capabilities.find((entry) => capabilityKey(entry) === capabilityKey(selected));
  if (!source) return undefined;
  const bindings = configurationBindings(snapshot, source);
  const canDo = unusedConfigurationPrimaries(snapshot, source).find((entry) => entry.id === primaryId);
  if (!bindings.scoringContract || !bindings.taskFamilyMatches || !canDo) return undefined;
  const variant: RegistryCapability = {
    ...structuredClone(source),
    primaryCanDoId: canDo.id,
    primaryReportedSkill: canDo.primarySkill ?? source.primaryReportedSkill,
    communicativeActivity: canDo.activity ?? source.communicativeActivity,
    communicativeActivities: canDo.activity ? [canDo.activity] : [...(source.communicativeActivities ?? [])],
    supportingCanDoIds: [],
    allowedContextIds: [],
    allowedDomains: [],
    observableEvidence: "",
    a1Boundary: "",
    referenceTask: "",
    invalidReferenceTask: "",
  };
  snapshot.capabilities.push(variant);
  snapshot.capabilityDifficultyProfileSets ??= [];
  snapshot.capabilityDifficultyProfileSets.push({
    id: `DPS-${variant.blueprintSlotId}-${variant.itemFormatId}-${variant.primaryCanDoId}`,
    blueprintSlotId: variant.blueprintSlotId,
    itemFormatId: variant.itemFormatId,
    primaryCanDoId: variant.primaryCanDoId,
    standards: initialDifficultyStandards(snapshot, variant.itemFormatId),
  });
  return variant;
}

export function removeRegistryConfiguration(snapshot: RegistrySnapshot, selected: RegistryCapability) {
  const key = capabilityKey(selected);
  const siblings = configurationSiblings(snapshot, selected);
  const replacement = siblings.find((entry) => capabilityKey(entry) !== key);
  if (!replacement || !siblings.some((entry) => capabilityKey(entry) === key)) return undefined;
  snapshot.capabilities = snapshot.capabilities.filter((entry) => capabilityKey(entry) !== key);
  snapshot.capabilityDifficultyProfileSets = (snapshot.capabilityDifficultyProfileSets ?? [])
    .filter((profile) => capabilityKey(profile) !== key);
  return replacement;
}

export function changeRegistryConfiguration(
  snapshot: RegistrySnapshot,
  selected: RegistryCapability,
  mutate: (capability: RegistryCapability) => void,
) {
  const key = capabilityKey(selected);
  const entry = snapshot.capabilities.find((candidate) => capabilityKey(candidate) === key);
  if (!entry) return;
  mutate(entry);
  const profile = snapshot.capabilityDifficultyProfileSets?.find((candidate) => capabilityKey(candidate) === key);
  if (profile) {
    profile.blueprintSlotId = entry.blueprintSlotId;
    profile.itemFormatId = entry.itemFormatId;
    profile.primaryCanDoId = entry.primaryCanDoId;
    profile.id = `DPS-${entry.blueprintSlotId}-${entry.itemFormatId}-${entry.primaryCanDoId}`;
  }
}
