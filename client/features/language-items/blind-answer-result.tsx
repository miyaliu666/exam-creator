import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";

import { isBlindAnswerAttempt } from "./blind-answer";
import type { BlindAnswerAttempt } from "./types";

const STATUS = {
  answered: { label: "Answered", color: "blue" },
  ambiguous: { label: "Multiple plausible answers", color: "orange" },
  insufficientInformation: { label: "Not enough information", color: "orange" },
} as const;

export function BlindAnswerResult({ attempt }: { attempt: BlindAnswerAttempt | undefined }) {
  if (!isBlindAnswerAttempt(attempt)) return null;
  const status = STATUS[attempt.status];
  return <Stack gap={2} borderTopWidth="1px" pt={3}>
    <HStack flexWrap="wrap">
      <Text fontWeight="semibold">Independent answer</Text>
      <Badge colorPalette={status.color}>{status.label}</Badge>
      {attempt.simulated ? <Badge colorPalette="orange">Simulated</Badge> : null}
    </HStack>
    <Text fontSize="sm" color="fg.muted">This check uses only the item shown to the candidate, before the saved answer or scoring guidance is revealed. Human review makes the final decision.</Text>
    {attempt.answer.trim() ? <Text fontSize="sm" whiteSpace="pre-wrap">{attempt.answer}</Text> : null}
    <Text fontSize="sm" whiteSpace="pre-wrap">{attempt.reasoning}</Text>
    {attempt.alternatives.length ? <Box>
      <Text fontSize="sm" fontWeight="medium">Other plausible answers</Text>
      {attempt.alternatives.map((answer, index) => <Text key={index} fontSize="sm" whiteSpace="pre-wrap">{answer}</Text>)}
    </Box> : null}
    {attempt.evidence.map((evidence, index) => <Box key={index} borderLeftWidth="2px" pl={3}>
      <Text fontSize="sm" whiteSpace="pre-wrap">{evidence.quote}</Text>
      <Text fontSize="xs" color="fg.muted">{evidence.fieldPath}</Text>
    </Box>)}
    {attempt.limitations.length ? <Box>
      <Text fontSize="sm" fontWeight="medium">Uncertainty</Text>
      {attempt.limitations.map((limitation, index) => <Text key={index} fontSize="sm" whiteSpace="pre-wrap">{limitation}</Text>)}
    </Box> : null}
  </Stack>;
}
