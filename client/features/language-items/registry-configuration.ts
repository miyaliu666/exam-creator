import { capabilityKey } from "./registry-capability.ts";
import { initialDifficultyStandards } from "./registry-difficulty.ts";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export type UpdateRegistryConfiguration = (mutate: (snapshot: RegistrySnapshot) => void) => void;

export function configurationBindings(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  const scoringContracts = snapshot.scoringContracts?.filter((entry) =>
    entry.itemRuleIds.includes(capability.itemRuleId) && entry.itemFormatId === capability.itemFormatId,
  ) ?? [];
  const taskFamilies = snapshot.taskFamilyOptions?.filter((entry) =>
    entry.itemRuleIds?.includes(capability.itemRuleId) && entry.allowedItemFormatIds?.includes(capability.itemFormatId),
  ) ?? [];
  return {
    scoringContracts,
    taskFamilies,
    scoringContract: scoringContracts.find((entry) => entry.scoringContractTemplateId === capability.scoringContractTemplateId),
    taskFamilyMatches: !snapshot.taskFamilyOptions?.some((entry) => entry.itemRuleIds?.length)
      || taskFamilies.some((entry) => entry.id === capability.taskFamilyId),
  };
}

export function compatibleConfigurationPrimaries(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  return snapshot.canDoOptions.filter((option) =>
    option.primarySkill === capability.primaryReportedSkill
    && option.activity === capability.communicativeActivity,
  );
}

export function addRegistryConfiguration(snapshot: RegistrySnapshot, selected: RegistryCapability, primaryId: string, createdId = `item-rule-${crypto.randomUUID()}`) {
  const source = snapshot.capabilities.find((entry) => capabilityKey(entry) === capabilityKey(selected));
  if (!source) return undefined;
  const bindings = configurationBindings(snapshot, source);
  const canDo = compatibleConfigurationPrimaries(snapshot, source).find((entry) => entry.id === primaryId);
  if (!bindings.scoringContract || !bindings.taskFamilyMatches || !canDo) return undefined;
  const variant: RegistryCapability = {
    ...structuredClone(source),
    itemRuleId: createdId,
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
  for (const contract of snapshot.scoringContracts ?? []) if (contract.scoringContractTemplateId === source.scoringContractTemplateId) contract.itemRuleIds.push(createdId);
  for (const family of snapshot.taskFamilyOptions ?? []) if (family.id === source.taskFamilyId) (family.itemRuleIds ??= []).push(createdId);
  snapshot.capabilityDifficultyProfileSets ??= [];
  snapshot.capabilityDifficultyProfileSets.push({
    id: `DPS-${variant.itemRuleId}-${variant.itemFormatId}-${variant.primaryCanDoId}`,
    itemRuleId: variant.itemRuleId,
    itemFormatId: variant.itemFormatId,
    primaryCanDoId: variant.primaryCanDoId,
    standards: initialDifficultyStandards(snapshot, variant.itemFormatId),
  });
  return variant;
}

export function removeRegistryConfiguration(snapshot: RegistrySnapshot, selected: RegistryCapability) {
  const key = capabilityKey(selected);
  if (!snapshot.capabilities.some((entry) => capabilityKey(entry) === key)) return false;
  snapshot.capabilities = snapshot.capabilities.filter((entry) => capabilityKey(entry) !== key);
  for (const contract of snapshot.scoringContracts ?? []) contract.itemRuleIds = contract.itemRuleIds.filter((id) => id !== key);
  for (const family of snapshot.taskFamilyOptions ?? []) family.itemRuleIds = family.itemRuleIds?.filter((id) => id !== key);
  snapshot.capabilityDifficultyProfileSets = (snapshot.capabilityDifficultyProfileSets ?? [])
    .filter((profile) => capabilityKey(profile) !== key);
  snapshot.reviewRuleSets = snapshot.reviewRuleSets?.filter((entry) => entry.itemRuleId !== key);
  return true;
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
    profile.itemRuleId = entry.itemRuleId;
    profile.itemFormatId = entry.itemFormatId;
    profile.primaryCanDoId = entry.primaryCanDoId;
    profile.id = `DPS-${entry.itemRuleId}-${entry.itemFormatId}-${entry.primaryCanDoId}`;
  }
}
