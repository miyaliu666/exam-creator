import { Box, Button, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { coverageGoalPlan } from "./coverage-query";
import type { CoverageBatchSuggestion, CoverageRequest, CoverageResponse } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function CoverageGoal({ request, goal, registry, pending, onChange, onPlan }: {
  request: CoverageRequest; goal: CoverageResponse["goal"]; registry: RegistrySnapshot; pending: boolean;
  onChange: (desiredCount: number | undefined) => void; onPlan: (suggestion: CoverageBatchSuggestion) => void;
}) {
  const [text, setText] = useState(() => request.desiredCount?.toString() ?? "");
  const invalid = text !== "" && (!Number.isSafeInteger(Number(text)) || Number(text) < 0 || Number(text) > 1_000_000);
  const plan = coverageGoalPlan(request, goal, registry);
  return <Box as="details" borderTopWidth="1px" pt={4}>
    <Box as="summary" cursor="pointer" fontWeight="medium">Inventory goal{goal ? ` · ${goal.desiredCount}` : ""}</Box>
    <Stack gap={3} mt={3}>
      <Field.Root invalid={invalid} maxW="64">
        <Field.Label>Target approved items</Field.Label>
        <Input type="number" min={0} max={1000000} step={1} aria-label="Target approved items" value={text} placeholder="No goal"
          onChange={(event) => {
            const value = event.target.value;
            setText(value);
            const count = Number(value);
            onChange(value !== "" && Number.isSafeInteger(count) && count >= 0 && count <= 1_000_000 ? count : undefined);
          }} />
        <Field.ErrorText>Enter a whole number from 0 to 1,000,000.</Field.ErrorText>
      </Field.Root>
      {goal && !invalid && <>
        <HStack gap={5} flexWrap="wrap" fontSize="sm">
          <Text>Approved: <strong>{goal.approvedCount}</strong></Text>
          <Text>{goal.approvedUnknownCount ? "Remaining (known inventory)" : "Remaining"}: <strong>{goal.unfilledCount}</strong></Text>
        </HStack>
        {goal.approvedUnknownCount > 0 && <Text fontSize="sm" color="fg.warning">{goal.approvedUnknownCount} approved items have unknown coverage.{goal.unfilledCount > 0 ? " The gap is uncertain; planning is unavailable." : ""}</Text>}
        {(goal.pendingCount > 0 || goal.pendingUnknownCount > 0) && <Text fontSize="sm" color="fg.muted">
          Pending: {goal.pendingCount}{goal.pendingUnknownCount > 0 ? ` · unknown: ${goal.pendingUnknownCount}` : ""}. Pending items may revise approved items and do not reduce the remaining count.
        </Text>}
        {plan.reason && goal.approvedUnknownCount === 0 && <Text fontSize="sm" color="fg.muted">{plan.reason}</Text>}
        {plan.suggestion && <Button size="sm" alignSelf="start" colorPalette="teal" disabled={pending} onClick={() => { if (plan.suggestion) onPlan(plan.suggestion); }}>Plan {plan.suggestion.desiredCount} more {plan.suggestion.desiredCount === 1 ? "item" : "items"}</Button>}
      </>}
    </Stack>
  </Box>;
}
