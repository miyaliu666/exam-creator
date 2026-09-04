import { Badge, Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import type {
  LanguageItemAuditEvent,
  LanguageItemExport,
} from "./types";

interface AuditPanelProps {
  events: LanguageItemAuditEvent[];
  exports: LanguageItemExport[];
}

const ACTION_LABELS: Record<string, string> = {
  "item.created": "Item created",
  "item.archived": "Item archived",
  "item.restored": "Item restored",
  "item.deleted": "Item moved to trash",
  "draft.updated": "Draft updated",
  "draft.validated": "Validation run",
  "version.frozen": "Review snapshot created",
  "version.revision.started": "Revision draft created",
  "ai.generation.completed": "AI candidates generated",
  "ai.generation.failed": "AI candidate generation failed",
  "ai.candidate.adopted": "AI candidate adopted",
  "ai.review.completed": "Version AI pre-review completed",
  "ai.review.failed": "Version AI pre-review failed",
  "ai.review.draft.completed": "Draft AI pre-review completed",
  "ai.review.draft.failed": "Draft AI pre-review failed",
  "review.recorded": "Human review decision recorded",
  "review.discussion.created": "Review discussion opened",
  "review.discussion.updated": "Review discussion updated",
  "github_review.submitted": "Submitted for GitHub review",
  "github_review.synced": "GitHub review synced",
  "export.staging.failed": "Staging export failed",
  "export.staging.completed": "Exported to Staging",
  "export.production.rejected": "Production export rejected",
  "assembly.staging.completed": "Added to a Staging test",
};

export function AuditPanel({ events, exports }: AuditPanelProps) {
  const formatDate = (value: string) => new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return (
    <Stack borderWidth="1px" borderRadius="xl" p={6} gap={4}>
      <Heading size="lg">History</Heading>
      {exports.map((entry) => (
        <Box key={entry.id} borderWidth="1px" borderRadius="lg" p={3}>
          <HStack justify="space-between">
            <Badge colorPalette="green">{entry.target}</Badge>
            <Text fontSize="xs">{formatDate(entry.createdAt)}</Text>
          </HStack>
          <Text fontSize="sm" mt={2}>Exported</Text>
        </Box>
      ))}
      {events.length === 0 ? (
        <Text color="fg.muted">No history yet.</Text>
      ) : (
        events.slice(0, 20).map((event) => (
          <Box key={event.id} borderLeftWidth="3px" borderColor="teal.500" pl={3}>
            <Text fontWeight="medium">{ACTION_LABELS[event.action] ?? event.action}</Text>
            <Text fontSize="xs" color="fg.muted">
              {event.actorEmail} · {formatDate(event.createdAt)}
            </Text>
          </Box>
        ))
      )}
    </Stack>
  );
}
