import type { RegistrySnapshot, TaskPackage } from "./types";
import { isContentOptionCompatible } from "./content-compatibility";

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
  const capability = registry.capabilities.find(
    (entry) =>
      entry.blueprintSlotId === draft.blueprintSlotId &&
      entry.itemFormatId === draft.itemFormatId,
  );
  const context = registry.contextOptions.find(
    (entry) => entry.id === draft.content.contextId,
  );

  if (!title.trim()) addIssue("title", "Enter an item title");
  if (!capability?.allowedDomains.includes(draft.content.primaryDomain)) {
    addIssue("content.primaryDomain", "Select an applicable domain");
  }
  if (
    !capability?.allowedContextIds.includes(draft.content.contextId) ||
    !context?.primaryDomains.includes(draft.content.primaryDomain)
  ) {
    addIssue("content.contextId", "Select a context that matches the domain");
  }
  if (draft.content.targetContentIds.length === 0) {
    addIssue("content.targetContentIds", "Select at least one language-content target");
  } else if (
    draft.content.targetContentIds.some((id) => {
      const entry = registry.contentIdOptions.find((option) => option.id === id);
      return entry && (
        entry.kind === "supported" ||
        !isContentOptionCompatible(entry, capability, draft.content.contextId)
      );
    })
  ) {
    addIssue(
      "content.targetContentIds",
      "Remove language content that does not match the capability, mastery scope, or context",
    );
  }

  const expectedPoints = draft.content.difficulty?.drivers.informationPoints ?? 1;
  const points = draft.content.requiredInformationPoints;
  if (
    points.length !== expectedPoints ||
    points.some((point) =>
      !(typeof point === "string" ? point : point.label).trim()
    )
  ) {
    addIssue(
      "content.requiredInformationPoints",
      `Enter ${expectedPoints} required information point${expectedPoints === 1 ? "" : "s"}`,
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
