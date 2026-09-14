import { Badge, Box, Heading, HStack, Stack, Text } from "@chakra-ui/react";

import { aiPrereviewBlockReason, isAiPrereviewFinding, type AiPrereviewStage } from "./ai-prereview";
import type { AiReviewRun } from "./types";
import { ReviewCheckResults } from "./review-check-results";
import { BlindAnswerResult } from "./blind-answer-result";

const STAGE_LABELS = {
  checking: "Checking item…",
  aiReview: "Answering and reviewing item…",
  creatingPr: "Creating review PR…",
} as const;

const FINDING_LABELS: Record<string, { label: string; color: string }> = {
  info: { label: "Info", color: "blue" },
  warning: { label: "Warning", color: "orange" },
  error: { label: "Error", color: "red" },
};

export function AiPrereviewPanel({ stage, review }: { stage: AiPrereviewStage; review: AiReviewRun | null }) {
  if (!stage && !review) return null;
  const reason = aiPrereviewBlockReason(review);
  const findings = Array.isArray(review?.findings) ? review.findings.filter(isAiPrereviewFinding) : [];
  return <Stack borderWidth="1px" borderRadius="lg" p={5} gap={3}>
    <Heading size="md">AI preliminary review</Heading>
    {stage ? <Text role="status">{STAGE_LABELS[stage]}</Text> : <>
      <Text role={reason ? "alert" : "status"} color={reason ? "fg.error" : "fg.success"}>
        {reason ?? "No serious issues found"}
      </Text>
      {typeof review?.model === "string" && review.model ? <Text fontSize="xs" color="fg.muted">{review.model}</Text> : null}
      <BlindAnswerResult attempt={review?.blindAnswer} />
      {review ? <ReviewCheckResults review={review} /> : null}
      {findings.map((finding, index) => <Box key={`${finding.code}-${finding.fieldPath}-${index}`} borderTopWidth="1px" pt={3}>
        <HStack gap={2} mb={1}>
          <Badge colorPalette={FINDING_LABELS[finding.severity].color}>{FINDING_LABELS[finding.severity].label}</Badge>
          {finding.fieldPath ? <Text fontSize="xs" color="fg.muted">{finding.fieldPath}</Text> : null}
        </HStack>
        <Text fontSize="sm">{finding.message}</Text>
      </Box>)}
    </>}
  </Stack>;
}
