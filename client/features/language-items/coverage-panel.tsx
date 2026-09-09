import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getLanguageItemRegistry } from "./api";
import { getLanguageCoverage } from "./coverage-api";
import { CoverageControls } from "./coverage-controls";
import { CoverageGoal } from "./coverage-goal";
import { updateCoverageRequest } from "./coverage-query";
import { CoverageResults } from "./coverage-results";
import type { CoverageBatchSuggestion, CoverageRequest } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

function initialRequest(registryVersion: string): CoverageRequest {
  return { scope: "approved", registryVersion, role: "core", selectedIds: [], excludedIds: [], matchMode: "all", filters: {}, offset: 0, limit: 25 };
}

export function LanguageCoveragePanel({ registry, onPlanBatch }: {
  registry: RegistrySnapshot; onPlanBatch: (suggestion: CoverageBatchSuggestion) => void;
}) {
  const [request, setRequest] = useState<CoverageRequest>(() => initialRequest(registry.bundleVersion));
  const pinnedRegistry = useQuery({
    queryKey: ["language-item-registry", request.registryVersion],
    queryFn: () => getLanguageItemRegistry(request.registryVersion),
    enabled: request.registryVersion !== registry.bundleVersion,
  });
  const currentRegistry = request.registryVersion === registry.bundleVersion ? registry : pinnedRegistry.data;
  const query = useQuery({ queryKey: ["language-coverage", request], queryFn: () => getLanguageCoverage(request), staleTime: 15_000 });
  const update = (patch: Partial<CoverageRequest>) => setRequest((previous) => updateCoverageRequest(previous, patch));
  // A goal belongs to one query. A new scope must not reuse its target quantity.
  const goalKey = JSON.stringify({ ...request, offset: undefined, limit: undefined, desiredCount: undefined });
  const hasFilters = request.scope !== "approved" || request.role !== "core" || request.matchMode !== "all" ||
    request.selectedIds.length > 0 || request.excludedIds.length > 0 || request.pattern !== undefined ||
    Object.values(request.filters).some(Boolean) || request.registryVersion !== registry.bundleVersion;

  return <Stack gap={5}>
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Stack gap={4}>
        {currentRegistry ? <CoverageControls registry={currentRegistry} versions={[registry.bundleVersion, request.registryVersion, ...(query.data?.availableRegistryVersions ?? [])]} request={request} onChange={update} /> :
          <HStack><Spinner size="sm" /><Text>Loading Assessment Settings…</Text></HStack>}
        {pinnedRegistry.error && <HStack role="alert"><Text color="fg.error">{pinnedRegistry.error.message}</Text><Button size="sm" variant="outline" onClick={() => void pinnedRegistry.refetch()}>Retry settings</Button></HStack>}
        <HStack justify="end">
          {hasFilters && <Button size="sm" variant="ghost" onClick={() => setRequest(initialRequest(registry.bundleVersion))}>Reset</Button>}
          <Button size="sm" variant="outline" onClick={() => void query.refetch()} loading={query.isFetching}>Refresh</Button>
        </HStack>
      </Stack>
    </Box>
    {query.error && <Text color="fg.error" role="alert">{query.error.message}</Text>}
    {query.isPending && <HStack role="status"><Spinner size="sm" /><Text fontSize="sm">Loading coverage…</Text></HStack>}
    {query.data && currentRegistry && <CoverageResults data={query.data} request={request} registry={currentRegistry} onChange={update} />}
    {request.scope === "approved" && <CoverageGoal key={goalKey} request={request} goal={query.error ? null : query.data?.goal ?? null}
      registry={registry} pending={query.isFetching} onChange={(desiredCount) => update({ desiredCount })} onPlan={onPlanBatch} />}
  </Stack>;
}
