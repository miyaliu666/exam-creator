import { Badge, Box, Grid, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import type { LanguageItemVersionDiff } from "./types";

interface VersionDiffPanelProps {
  diff: LanguageItemVersionDiff | undefined;
  isPending: boolean;
  error: Error | null;
}

function display(value: unknown | null): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2) ?? "—";
}

export function VersionDiffPanel({
  diff,
  isPending,
  error,
}: VersionDiffPanelProps) {
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Heading size="md">Changes from prior frozen version</Heading>
      {isPending ? (
        <Text color="fg.muted" mt={2}>Loading version comparison…</Text>
      ) : error ? (
        <Text color="fg.error" mt={2}>{error.message}</Text>
      ) : !diff?.baseVersionId ? (
        <Text color="fg.muted" mt={2}>
          This is the first frozen version; there is no prior snapshot to compare.
        </Text>
      ) : diff.changes.length === 0 ? (
        <Text color="fg.muted" mt={2}>
          No TaskPackage fields changed from {diff.baseVersionId}.
        </Text>
      ) : (
        <Stack gap={3} mt={3}>
          <Text fontSize="sm" color="fg.muted">
            Comparing {diff.baseVersionId} → {diff.versionId}
          </Text>
          {diff.changes.map((change) => (
            <Box key={change.path} borderWidth="1px" borderRadius="md" p={3}>
              <HStack mb={2} flexWrap="wrap">
                <Badge>{change.partition}</Badge>
                <Text as="code" fontSize="sm">{change.path}</Text>
              </HStack>
              <Grid templateColumns={{ base: "1fr", md: "1fr 1fr" }} gap={3}>
                <Box>
                  <Text fontSize="xs" color="fg.muted">Before</Text>
                  <Text as="pre" whiteSpace="pre-wrap" fontSize="xs">{display(change.before)}</Text>
                </Box>
                <Box>
                  <Text fontSize="xs" color="fg.muted">After</Text>
                  <Text as="pre" whiteSpace="pre-wrap" fontSize="xs">{display(change.after)}</Text>
                </Box>
              </Grid>
            </Box>
          ))}
          {diff.truncated ? (
            <Text color="fg.warning" fontSize="sm">
              The comparison reached the 200-change display limit.
            </Text>
          ) : null}
        </Stack>
      )}
    </Box>
  );
}
