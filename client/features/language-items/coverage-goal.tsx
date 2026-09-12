import { Box, Button, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { BATCH_ITEM_LIMIT } from "./batch-plan";
import { coverageNewItemPlan, parseCoverageGoalCount } from "./coverage-goal-model";
import type { CoverageBatchSuggestion, CoverageRequest, CoverageResponse } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function CoverageGoal({ request, goal, registry, pending, onChange, onPlan, expanded = false,
  inputText, onInputTextChange, newItemText, onNewItemTextChange, onInspectUnapproved,
}: {
  request: CoverageRequest; goal: CoverageResponse["goal"]; registry: RegistrySnapshot; pending: boolean;
  onChange: (desiredCount: number | undefined) => void; onPlan: (suggestion: CoverageBatchSuggestion) => void;
  expanded?: boolean;
  inputText?: string; onInputTextChange?: (text: string) => void;
  newItemText?: string; onNewItemTextChange?: (text: string) => void;
  onInspectUnapproved?: () => void;
}) {
  const [localText, setLocalText] = useState(() => request.desiredCount?.toString() ?? "");
  const [localNewItemText, setLocalNewItemText] = useState("");
  const text = inputText ?? localText;
  const newText = newItemText ?? localNewItemText;
  const desiredCount = parseCoverageGoalCount(text);
  const invalid = text.trim() !== "" && desiredCount === undefined;
  const currentGoal = !pending && desiredCount !== undefined && goal?.desiredCount === desiredCount ? goal : null;
  const count = newText.trim() === "" ? undefined : Number(newText);
  const eligibility = coverageNewItemPlan(request, currentGoal, registry);
  const plan = coverageNewItemPlan(request, currentGoal, registry, count);
  const maximum = Math.min(BATCH_ITEM_LIMIT, currentGoal?.unfilledCount ?? 0);
  const newCountInvalid = count !== undefined && (!Number.isSafeInteger(count) || count < 1 || count > maximum);
  return <Box asChild borderTopWidth="1px" pt={4}><details open={expanded || request.desiredCount !== undefined || undefined}>
    <Box as="summary" cursor="pointer" fontWeight="medium">Item count goal</Box>
    <Stack gap={3} mt={3}>
      <Field.Root invalid={invalid} maxW="64">
        <Field.Label>Desired approved item count</Field.Label>
        <Input type="number" min={0} max={1000000} step={1} aria-label="Desired approved item count" value={text} autoFocus={expanded}
          onChange={(event) => {
            const value = event.target.value;
            if (inputText === undefined) setLocalText(value);
            onInputTextChange?.(value);
            onChange(parseCoverageGoalCount(value));
          }} />
        <Field.ErrorText>Enter a whole number from 0 to 1,000,000.</Field.ErrorText>
      </Field.Root>
      {pending && desiredCount !== undefined && <Text role="status" fontSize="sm">Loading goal…</Text>}
      {currentGoal && <>
        <HStack gap={5} flexWrap="wrap" fontSize="sm">
          <Text>Approved items: <strong>{currentGoal.approvedCount}</strong></Text>
          <Text>Approved item shortfall: <strong>{currentGoal.unfilledCount}</strong></Text>
          {currentGoal.pendingCount > 0 && <Text>Unapproved items: <strong>{currentGoal.pendingCount}</strong></Text>}
        </HStack>
        {currentGoal.pendingCount > 0 && onInspectUnapproved && <Button size="sm" variant="outline" alignSelf="start" onClick={onInspectUnapproved}>View {currentGoal.pendingCount} unapproved items</Button>}
        {currentGoal.approvedUnknownCount > 0 && <Text fontSize="sm" color="fg.warning">{currentGoal.approvedUnknownCount} approved items lack saved target data.{currentGoal.unfilledCount > 0 ? " The shortfall is uncertain; planning is unavailable." : ""}</Text>}
        {currentGoal.pendingUnknownCount > 0 && <Text fontSize="sm" color="fg.muted">{currentGoal.pendingUnknownCount} unapproved items lack saved target data.</Text>}
        {eligibility.reason && currentGoal.approvedUnknownCount === 0 && <Text fontSize="sm" color="fg.muted">{eligibility.reason}</Text>}
        {currentGoal.unfilledCount > 0 && currentGoal.approvedUnknownCount === 0 && !eligibility.reason && <>
          <Field.Root invalid={newCountInvalid} maxW="64">
            <Field.Label>New items to plan</Field.Label>
            <Input type="number" min={1} max={maximum} step={1} aria-label="New items to plan" value={newText}
              onChange={(event) => {
                const value = event.target.value;
                if (newItemText === undefined) setLocalNewItemText(value);
                onNewItemTextChange?.(value);
              }} />
            <Field.ErrorText>Enter a whole number from 1 to {maximum}.</Field.ErrorText>
          </Field.Root>
          {plan.reason && !newCountInvalid && <Text fontSize="sm" color="fg.muted">{plan.reason}</Text>}
          {plan.suggestion && <Button size="sm" alignSelf="start" colorPalette="teal" onClick={() => { if (plan.suggestion) onPlan(plan.suggestion); }}>Plan {plan.suggestion.desiredCount} new {plan.suggestion.desiredCount === 1 ? "item" : "items"}</Button>}
        </>}
      </>}
    </Stack>
  </details></Box>;
}
