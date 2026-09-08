import type { AiGenerationRun, AiGenerationSetupSnapshot, TaskPackage } from "./types";

function canonical(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value)
    .filter(([, entry]) => entry !== undefined).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function aiGenerationSetupSnapshot(draft: TaskPackage): AiGenerationSetupSnapshot {
  return {
    specVersions: draft.specVersions, blueprintSlotId: draft.blueprintSlotId, taskFamilyId: draft.taskFamilyId,
    itemFormatId: draft.itemFormatId, rendererId: draft.renderer.rendererId,
    primaryCanDoId: draft.content.primaryCanDoId, primaryDomain: draft.content.primaryDomain,
    contextId: draft.content.contextId, difficultyBand: draft.content.difficultyBand,
    difficulty: draft.content.difficulty ?? null, targetContentIds: draft.content.targetContentIds,
    supportingContentRefs: draft.content.supportingContentRefs ?? [],
    requiredInformationPoints: draft.content.requiredInformationPoints.map((point, index) => typeof point === "string"
      ? { id: `IP${index + 1}`, pointType: "other", label: point, required: true } : point),
  };
}

export function aiGenerationMatchesSetup(run: AiGenerationRun, draft: TaskPackage): boolean {
  const current = aiGenerationSetupSnapshot(draft);
  if (run.generationSetupSnapshot) return canonical(run.generationSetupSnapshot) === canonical(current);
  const keys = ["specVersions", "blueprintSlotId", "taskFamilyId", "itemFormatId", "rendererId",
    "primaryCanDoId", "primaryDomain", "contextId", "difficultyBand", "targetContentIds"] as const;
  return keys.every((key) => canonical(run[key]) === canonical(current[key])) &&
    canonical(run.requiredInformationPoints) === canonical(current.requiredInformationPoints.map((point) => point.label));
}
