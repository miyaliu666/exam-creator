import { isContentOptionCompatible } from "./content-compatibility.ts";
import { isValidCandidateCount } from "./candidate-count.ts";
import { contextsForCapability, difficultyStandardsForCapability } from "./registry-capability.ts";
import type { BatchGroup, CreateBatchInput } from "./batch-api";
import { slotLabel } from "./labels.ts";
import type { RegistrySnapshot } from "./types";

export const BATCH_ITEM_LIMIT = 50;
export const BATCH_GROUP_LIMIT = 20;

export function batchRequest(draft: CreateBatchInput, registry: RegistrySnapshot): CreateBatchInput {
  const setups = [...new Set(draft.groups.map((group) => slotLabel(group.blueprintSlotId, registry)))];
  const automaticName = setups.length <= 1 ? setups[0] ?? "Language items" : `${setups[0]} + ${setups.length - 1} setups`;
  return { ...draft, title: draft.title.trim() || automaticName.slice(0, 120) };
}

export function allocatedBatchTargets(group: BatchGroup): string[][] {
  if (!Number.isInteger(group.itemCount) || group.itemCount < 1 || group.itemCount > BATCH_ITEM_LIMIT) return [];
  // Keep the preview aligned with allocate_targets in server/language_items/batch.rs.
  return Array.from({ length: group.itemCount }, (_, ordinal) => {
    const pool = group.rotatingTargetContentIds;
    const assigned = pool.filter((_, index) => index % group.itemCount === ordinal);
    const distributed = assigned.length ? assigned : pool.length ? [pool[ordinal % pool.length]] : [];
    return [...new Set([...group.requiredTargetContentIds, ...distributed])];
  });
}

export function batchCapability(group: BatchGroup, registry: RegistrySnapshot) {
  return registry.capabilities.find((capability) =>
    capability.blueprintSlotId === group.blueprintSlotId &&
    capability.itemFormatId === group.itemFormatId &&
    capability.primaryCanDoId === group.primaryCanDoId);
}

export function batchTargetOptions(group: BatchGroup, registry: RegistrySnapshot) {
  const capability = batchCapability(group, registry);
  return registry.contentIdOptions.filter((option) =>
    option.kind !== "supported" && isContentOptionCompatible(option, capability, group.contextId));
}

export function batchPlanIssues(groups: BatchGroup[], registry: RegistrySnapshot, candidatesPerItem: number, requireTargets = true) {
  const issues: string[] = [];
  if (!groups.length) issues.push("Add at least one task group.");
  if (groups.length > BATCH_GROUP_LIMIT) issues.push(`Use up to ${BATCH_GROUP_LIMIT} task groups at a time.`);
  const count = groups.reduce((total, group) => total + group.itemCount, 0);
  if (count > BATCH_ITEM_LIMIT) issues.push(`Use up to ${BATCH_ITEM_LIMIT} items at a time.`);
  if (!isValidCandidateCount(candidatesPerItem)) {
    issues.push("Enter a positive whole number of AI drafts per item.");
  }
  groups.forEach((group, index) => {
    const prefix = groups.length > 1 ? `Group ${index + 1}: ` : "";
    const capability = batchCapability(group, registry);
    const context = contextsForCapability(registry, capability).find((entry) => entry.id === group.contextId);
    if (!capability || !context?.primaryDomains.includes(group.primaryDomain) ||
        !capability.allowedDomains.includes(group.primaryDomain) ||
        !difficultyStandardsForCapability(registry, capability).some((entry) => entry.id === group.difficultyBand)) {
      issues.push(`${prefix}review the setup against the current Assessment Settings.`);
    }
    if (!Number.isInteger(group.itemCount) || group.itemCount < 1 || group.itemCount > BATCH_ITEM_LIMIT) {
      issues.push(`${prefix}enter an item count from 1 to ${BATCH_ITEM_LIMIT}.`);
    }
    const selected = [...group.requiredTargetContentIds, ...group.rotatingTargetContentIds];
    if (requireTargets && !selected.length) issues.push(`${prefix}choose language targets to generate AI drafts.`);
    const compatible = new Set(batchTargetOptions(group, registry).map((entry) => entry.id));
    if (selected.some((id) => !compatible.has(id))) issues.push(`${prefix}remove or replace incompatible language targets.`);
    if ([group.requiredTargetContentIds, group.rotatingTargetContentIds].some((ids) =>
      ids.length > 100 || new Set(ids).size !== ids.length || ids.some((id) => !id.trim()))) {
      issues.push(`${prefix}use up to 100 distinct language targets in each list.`);
    }
    if (group.requiredTargetContentIds.some((id) => group.rotatingTargetContentIds.includes(id))) {
      issues.push(`${prefix}a target cannot be both required in every item and distributed.`);
    }
  });
  return issues;
}
