import { Box, Button, Stack, Text } from "@chakra-ui/react";
import { PilotResultSummary } from "./pilot-result-summary";
import { VERSION_USAGE_LABELS } from "./version-usage-labels";
import type { VersionUsageEvent } from "./version-usage-types";

export function VersionUsageHistory({ events, hasMore, busy, onLoadMore }: {
  events: VersionUsageEvent[]; hasMore: boolean; busy: boolean; onLoadMore: () => void;
}) {
  return <Box as="details" borderTopWidth="1px" pt={3}>
    <Text as="summary" cursor="pointer" fontWeight="medium">Use and pilot history</Text>
    <Stack mt={3} gap={3}>
      {!events.length ? <Text fontSize="sm" color="fg.muted">No use decisions recorded.</Text> : null}
      {events.map((event) => <Box as="details" key={event.id} borderWidth="1px" borderRadius="md" p={3}>
        <Text as="summary" cursor="pointer" fontSize="sm">{event.change.kind === "state" ? VERSION_USAGE_LABELS[event.change.state] : "Pilot results recorded"} · {new Date(event.createdAt).toLocaleString()}</Text>
        <Stack mt={3} gap={2}><Text fontSize="xs" color="fg.muted">{event.actorEmail}</Text>
          {event.change.kind === "pilot" ? <PilotResultSummary summary={event.change.summary} /> : <Text fontSize="sm" whiteSpace="pre-wrap">{event.change.reason}</Text>}
        </Stack>
      </Box>)}
      {hasMore ? <Button alignSelf="start" size="sm" variant="outline" loading={busy} disabled={busy} onClick={onLoadMore}>Load earlier history</Button> : null}
    </Stack>
  </Box>;
}
