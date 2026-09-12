import { Badge, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { observedPercent } from "./pilot-result-form-state";
import { PILOT_DECISION_LABELS, PILOT_TIMING_LABELS } from "./version-usage-labels";
import type { PilotSummary } from "./version-usage-types";

export function PilotResultSummary({ summary }: { summary: PilotSummary }) {
  return <Stack gap={2} fontSize="sm">
    <HStack flexWrap="wrap"><Badge>Manual summary</Badge><Badge colorPalette="blue">{PILOT_DECISION_LABELS[summary.decision]}</Badge></HStack>
    <Text><strong>Pilot reference:</strong> {summary.sampleRef}</Text>
    <Text><strong>Data source:</strong> {summary.source}</Text>
    <Text><strong>Candidate group:</strong> {summary.cohort}</Text>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
      <Text><strong>Sample size:</strong> {summary.sampleSize.toLocaleString()}</Text>
      <Text><strong>Correct:</strong> {observedPercent(summary.correctCount, summary.sampleSize)}</Text>
      <Text><strong>Omitted:</strong> {observedPercent(summary.omittedCount, summary.sampleSize)}</Text>
      <Text><strong>Discrimination (correlation):</strong> {summary.discrimination ?? "Not recorded"}</Text>
      <Text><strong>Median response time:</strong> {summary.medianResponseTimeSeconds === null ? "Not recorded" : `${summary.medianResponseTimeSeconds.toLocaleString()} seconds · ${PILOT_TIMING_LABELS[summary.timingBasis]}`}</Text>
    </SimpleGrid>
    <Text whiteSpace="pre-wrap"><strong>Findings and decision rationale:</strong> {summary.notes}</Text>
  </Stack>;
}
