import type { AuthoringSetupIssue } from "./setup-validation";
import type { ValidationIssue } from "./types";

const REQUIREMENT_PATHS = [
  "content.targetContentIds", "content.supportingContentRefs", "content.requiredInformationPoints",
] as const;

function isRequirementPath(path: string): boolean {
  return REQUIREMENT_PATHS.some((root) => path === root || path.startsWith(`${root}.`));
}

export function generationRequirementsNeedRepair(
  setupIssues: readonly Pick<AuthoringSetupIssue, "path">[],
  validationIssues: readonly Pick<ValidationIssue, "path" | "severity">[],
): boolean {
  // Formal checks can identify an individual entry that client setup checks do not inspect.
  return setupIssues.some((issue) => isRequirementPath(issue.path)) ||
    validationIssues.some((issue) => issue.severity === "error" && isRequirementPath(issue.path));
}
