import { Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";

import { getLanguageCoverage } from "./coverage-api";
import { CoverageGoal } from "./coverage-goal";
import { parseCoverageGoalCount } from "./coverage-goal-model";
import { coverageSetupGoalRequest } from "./coverage-setup-model";
import type { CoverageBatchSuggestion, CoverageFilters, CoverageRequest } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function CoverageSetupGoal({ request, filters, registry, accountScope, onPlan, onClose, inputText, newItemText, onInputTextChange, onNewItemTextChange, onInspectUnapproved }: {
  request: CoverageRequest; filters: CoverageFilters; registry: RegistrySnapshot; accountScope: string;
  onPlan: (suggestion: CoverageBatchSuggestion) => void; onClose: () => void;
  inputText: string; newItemText: string;
  onInputTextChange: (text: string) => void; onNewItemTextChange: (text: string) => void; onInspectUnapproved: () => void;
}) {
  const desiredCount = parseCoverageGoalCount(inputText);
  const goalRequest = coverageSetupGoalRequest(request, filters, desiredCount);
  const query = useQuery({ queryKey: ["language-coverage", accountScope, goalRequest], queryFn: () => getLanguageCoverage(goalRequest), enabled: desiredCount !== undefined });
  return <Stack gap={2} p={2}>
    <HStack justify="end"><Button size="xs" variant="plain" onClick={onClose}>Close goal</Button></HStack>
    {query.error && <HStack role="alert"><Text color="fg.error">{query.error.message}</Text><Button size="xs" variant="outline" onClick={() => void query.refetch()}>Retry goal</Button></HStack>}
    <CoverageGoal request={goalRequest} goal={query.error ? null : query.data?.goal ?? null} registry={registry}
      pending={query.isFetching || query.isPending} expanded onChange={() => {}} onPlan={onPlan} inputText={inputText} newItemText={newItemText}
      onInputTextChange={onInputTextChange} onNewItemTextChange={onNewItemTextChange} onInspectUnapproved={onInspectUnapproved} />
  </Stack>;
}
