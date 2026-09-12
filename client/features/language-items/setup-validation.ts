import type { RegistrySnapshot, TaskPackage } from "./types";
import { isContentOptionCompatible } from "./content-compatibility";
import { capabilityForDraft, contextSupportsCapability, difficultyStandardsForCapability } from "./registry-capability";

export interface AuthoringSetupIssue {
  path: string;
  message: string;
}

export function validateAuthoringSetup(
  title: string,
  draft: TaskPackage,
  registry: RegistrySnapshot | undefined,
): AuthoringSetupIssue[] {
  if (!registry) return [{ path: "registry", message: "Authoring data is loading" }];

  const issues: AuthoringSetupIssue[] = [];
  const addIssue = (path: string, message: string) => issues.push({ path, message });
  const capability = capabilityForDraft(registry, draft);
  const context = registry.contextOptions.find(
    (entry) => entry.id === draft.content.contextId,
  );

  if (!title.trim()) addIssue("title", "Enter an item title");
  if (
    !registry.allowedDomains.includes(draft.content.primaryDomain) ||
    !capability?.allowedDomains.includes(draft.content.primaryDomain)
  ) {
    addIssue("content.primaryDomain", "Select an applicable domain");
  }
  if (
    !capability?.allowedContextIds.includes(draft.content.contextId) ||
    !context?.primaryDomains.includes(draft.content.primaryDomain) ||
    (!!context && !!capability && !contextSupportsCapability(context, capability))
  ) {
    addIssue("content.contextId", "Select a context that matches the domain");
  }
  if (draft.content.targetContentIds.length === 0) {
    addIssue("content.targetContentIds", "Select at least one language-content target");
  } else if (
    draft.content.targetContentIds.some((id) => {
      const entry = registry.contentIdOptions.find((option) => option.id === id);
      return !entry || (
        entry.kind === "supported" ||
        !isContentOptionCompatible(entry, capability, draft.content.contextId)
      );
    })
  ) {
    addIssue(
      "content.targetContentIds",
      "Remove language content that does not match the item rules, mastery scope, or context",
    );
  }

  if ((draft.content.supportingContentRefs ?? []).some((id) => {
    const entry = registry.contentIdOptions.find((option) => option.id === id);
    return !entry || entry.kind !== "supported" ||
      !isContentOptionCompatible(entry, capability, draft.content.contextId);
  })) {
    addIssue("content.supportingContentRefs", "Remove supporting content that is unavailable for these item rules or context");
  }

  const standard = difficultyStandardsForCapability(registry, capability).find(
    (entry) => entry.id === draft.content.difficultyBand,
  );
  if (!standard) {
    addIssue("content.difficultyBand", "Select a difficulty available for these item rules");
  }
  const difficulty = draft.content.difficulty;
  if (!difficulty && (registry.settingsSchemaVersion ?? 0) >= 1) {
    addIssue("content.difficultyBand", "Select a difficulty profile for these item rules");
  }
  if (difficulty && standard) {
    if (difficulty.intendedBand !== standard.id) {
      addIssue("content.difficultyBand", "The difficulty profile must match the selected difficulty");
    }
    const drivers = difficulty.drivers;
    // Legacy pinned rules treated anchor deviations as advisory rather than blocking generation.
    const enforceRanges = (registry.settingsSchemaVersion ?? 0) >= 1;
    if (enforceRanges && !standard.allowedInputLengths.includes(drivers.inputLength)) {
      addIssue("content.difficulty.drivers.inputLength", "Choose an input length allowed for this difficulty");
    }
    if (enforceRanges && !standard.allowedSupportLevels.includes(drivers.supportLevel)) {
      addIssue("content.difficulty.drivers.supportLevel", "Choose contextual support allowed for this difficulty");
    }
    if (enforceRanges && (!Number.isInteger(drivers.informationPoints) ||
      drivers.informationPoints < standard.informationPointsMin ||
      drivers.informationPoints > standard.informationPointsMax)) {
      addIssue("content.difficulty.drivers.informationPoints", "Choose an information-point count allowed for this difficulty");
    }
    if (enforceRanges && ["IF-SINGLE-SELECT", "IF-MATCHING"].includes(draft.itemFormatId) &&
      !standard.allowedDistractorSimilarities.includes(drivers.distractorSimilarity)) {
      addIssue("content.difficulty.drivers.distractorSimilarity", "Choose distractor similarity allowed for this difficulty");
    }
    if (enforceRanges && drivers.inferenceRequired !== standard.defaultDrivers.inferenceRequired) {
      addIssue("content.difficulty.drivers.inferenceRequired", "The inference requirement must match the selected difficulty");
    }
  }

  const expectedPoints = difficulty?.drivers.informationPoints ?? standard?.defaultDrivers.informationPoints ?? 1;
  const points = draft.content.requiredInformationPoints;
  if (
    points.length !== expectedPoints ||
    points.some((point) =>
      !(typeof point === "string" ? point : point.label).trim()
    )
  ) {
    addIssue(
      "content.requiredInformationPoints",
      `Enter the required number of information points (${expectedPoints})`,
    );
  }
  if (
    draft.content.difficulty &&
    draft.content.difficulty.rationale.every((entry) => !entry.trim())
  ) {
    addIssue("content.difficulty.rationale", "Enter a difficulty rationale");
  }

  return issues;
}
