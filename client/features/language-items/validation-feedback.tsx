import { Field } from "@chakra-ui/react";

import type { ValidationIssue } from "./types";

export function validationMessages(
  issues: ValidationIssue[] | undefined,
  path: string,
  includeDescendants = false,
) {
  return (issues ?? [])
    .filter(
      (issue) =>
        issue.path === path ||
        (includeDescendants && issue.path.startsWith(`${path}.`)),
    )
    .map((issue) => issue.message);
}

export function FieldValidationMessages({
  issues,
  path,
  includeDescendants = false,
}: {
  issues: ValidationIssue[] | undefined;
  path: string;
  includeDescendants?: boolean;
}) {
  const messages = validationMessages(issues, path, includeDescendants);
  if (messages.length === 0) return null;
  return <Field.ErrorText>{Array.from(new Set(messages)).join("；")}</Field.ErrorText>;
}
