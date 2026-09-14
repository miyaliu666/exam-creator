import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";

import { isReviewCheckResult, reviewChecklistProblem } from "./review-check-validation";
import type { AiReviewRun } from "./types";

const STATUS = {
  pass: { label: "Passed", color: "teal" },
  fail: { label: "Not met", color: "red" },
  insufficientEvidence: { label: "Insufficient evidence", color: "orange" },
} as const;

export function ReviewCheckResults({ review }: { review: AiReviewRun }) {
  if (!review.reviewPlan && !review.checkResults) return null;
  const problem = reviewChecklistProblem(review);
  const checks = Array.isArray(review.reviewPlan?.checks) ? review.reviewPlan.checks : [];
  const results = Array.isArray(review.checkResults) ? review.checkResults.filter(isReviewCheckResult) : [];
  return <Stack gap={3}>
    <Text fontWeight="semibold">Review checklist</Text>
    {problem ? <Text role="alert" color="fg.error">{problem}</Text> : null}
    {checks.filter((check) => check && typeof check === "object" && typeof check.id === "string").map((check) => {
      const result = results.find((entry) => entry.checkId === check.id);
      const state = result ? STATUS[result.status] : { label: "Result missing", color: "orange" };
      return <Box key={check.id} borderTopWidth="1px" pt={3}><Stack gap={2}>
        <HStack flexWrap="wrap"><Badge colorPalette={state.color}>{state.label}</Badge><Text fontWeight="medium">{typeof check.title === "string" ? check.title : "Review requirement"}</Text><Text fontSize="xs" color="fg.muted">{check.origin === "fixed" || check.required ? "Required" : "Advisory"}</Text></HStack>
        {typeof check.criterion === "string" ? <Text fontSize="sm">{check.criterion}</Text> : null}
        {result ? <Text fontSize="sm">{result.message}</Text> : null}
        {result?.evidence.map((evidence, index) => <Box key={index} borderLeftWidth="2px" pl={3}><Text fontSize="sm" whiteSpace="pre-wrap">{evidence.quote}</Text><Text fontSize="xs" color="fg.muted">{evidence.fieldPath}</Text></Box>)}
        {result && !result.evidence.length ? <Text fontSize="xs" color="fg.muted">No quoted evidence recorded.</Text> : null}
      </Stack></Box>;
    })}
  </Stack>;
}
