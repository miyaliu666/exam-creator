import { Box, Button, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import type { EditorSection } from "./authoring-workflow";
import type { AuthoringSetupIssue } from "./setup-validation";
import type { ValidationResult } from "./types";

export function DraftCheckPanel({ validation, setupIssues, checking, onCheck, onEdit }: {
  validation: ValidationResult | null;
  setupIssues: AuthoringSetupIssue[];
  checking: boolean;
  onCheck: () => void;
  onEdit: (section: EditorSection) => void;
}) {
  const issues = [...setupIssues.map((issue) => ({ ...issue, severity: "error" })), ...(validation?.issues ?? [])]
    .filter((issue, index, entries) => entries.findIndex((entry) => entry.path === issue.path && entry.message === issue.message) === index);
  return (
    <Stack borderWidth="1px" borderRadius="lg" p={5} gap={3}>
      <HStack justify="space-between" flexWrap="wrap">
        <Heading size="md">Item checks</Heading>
        <Button variant="outline" loading={checking} onClick={onCheck}>{validation ? "Check again" : "Check item"}</Button>
      </HStack>
      {!validation && !checking ? <Text fontSize="sm" color="fg.muted">Check required before submission.</Text> : null}
      {checking ? <Text role="status">Saving and checking the item…</Text> : null}
      {validation?.valid && !setupIssues.length ? <Text color="fg.success">Checks passed. Ready for human review.</Text> : null}
      {issues.map((issue, index) => (
        <HStack key={`${issue.path}-${index}`} justify="space-between" align="start" gap={3}>
          <Box><Text fontSize="sm" color={issue.severity === "warning" ? "fg.warning" : "fg.error"}>{issue.message}</Text></Box>
          <Button size="xs" variant="ghost" flexShrink={0} onClick={() => onEdit(issue.path === "title" || issue.path.startsWith("content.") ? "setup" : "content")}>
            {issue.path === "title" || issue.path.startsWith("content.") ? "Go to Prepare" : "Go to editor"}
          </Button>
        </HStack>
      ))}
    </Stack>
  );
}
