import { Box, HStack, Stack, Text } from "@chakra-ui/react";

import type { AiGenerationRun } from "./types";

const OUTCOME_LABELS: Record<string, string> = {
  responseReceived: "Response received",
  networkError: "Connection failed",
  httpError: "HTTP error",
  unreadableResponse: "Unreadable response",
};

export function AiRunTelemetry({ run }: { run: AiGenerationRun }) {
  const calls = run.providerCalls ?? [];
  if (run.elapsedMilliseconds == null && !calls.length) return null;
  return (
    <Box as="details" borderWidth="1px" borderRadius="lg" p={3}>
      <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Run details</Text>
      <HStack mt={3} gap={4} flexWrap="wrap" fontSize="sm">
        {run.elapsedMilliseconds != null ? <Text>{(run.elapsedMilliseconds / 1000).toFixed(2)} seconds</Text> : null}
        <Text>{run.retryCount} repair {run.retryCount === 1 ? "attempt" : "attempts"}</Text>
        {run.provider === "deterministic-mock"
          ? <Text>Offline simulation · no provider requests</Text>
          : <Text>{calls.length} provider {calls.length === 1 ? "request" : "requests"}</Text>}
      </HStack>
      {calls.map((call, index) => (
        <Stack key={index} mt={3} pt={3} borderTopWidth="1px" gap={1} fontSize="xs">
          <Text fontWeight="medium">
            Candidate {call.candidateOrdinal} · {call.phase === "repair" ? "Repair" : "Initial generation"} · {OUTCOME_LABELS[call.outcome] ?? call.outcome}
          </Text>
          <Text>{(call.elapsedMilliseconds / 1000).toFixed(2)} seconds · Input tokens: {call.inputTokens ?? "Not reported"} · Output tokens: {call.outputTokens ?? "Not reported"}</Text>
          {call.totalTokens != null ? <Text>Total tokens: {call.totalTokens}</Text> : null}
          {call.httpStatus != null ? <Text>HTTP status: {call.httpStatus}</Text> : null}
          {call.providerRequestId ? <Text>Request: {call.providerRequestId}</Text> : null}
          {call.providerResponseId ? <Text>Response: {call.providerResponseId}</Text> : null}
        </Stack>
      ))}
    </Box>
  );
}
