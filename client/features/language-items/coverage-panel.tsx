import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getLanguageItemRegistry } from "./api";
import { getLanguageCoverage } from "./coverage-api";
import { CoverageControls } from "./coverage-controls";
import { CoverageFilterSection } from "./coverage-filter-section";
import { CoverageOverviewPanel } from "./coverage-overview";
import { CoverageResults } from "./coverage-results";
import { coverageAnalysisKey, coverageSetupQuery, type CoverageSetupGoalState } from "./coverage-setup-model";
import { updateCoverageRequest } from "./coverage-query";
import { hasCoverageViewFilters, initialCoverageState, inspectCoverageEntry, normalizeCoverageTargets, resetCoverageView, updateCoverageState } from "./coverage-state";
import type { CoverageBatchSuggestion, CoverageRequest } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function LanguageCoveragePanel({ registry, accountScope, onPlanBatch }: {
  registry: RegistrySnapshot; accountScope: string; onPlanBatch: (suggestion: CoverageBatchSuggestion) => void;
}) {
  const [state, setState] = useState(() => initialCoverageState(registry.bundleVersion));
  const [resetCount, setResetCount] = useState(0);
  const [showMatchingItems, setShowMatchingItems] = useState(false);
  const [setupReturnRequest, setSetupReturnRequest] = useState<CoverageRequest>();
  const [setupReturnPlanning, setSetupReturnPlanning] = useState<CoverageSetupGoalState>();
  const [setupGoal, setSetupGoal] = useState<CoverageSetupGoalState>();
  const queryClient = useQueryClient();
  const fetchingCount = useIsFetching({ queryKey: ["language-coverage", accountScope] });
  const { view } = state;
  const inventory = view === "overview" ? state.overviewInventory : state.request;
  const pinnedRegistry = useQuery({
    queryKey: ["language-item-registry", inventory.registryVersion],
    queryFn: () => getLanguageItemRegistry(inventory.registryVersion),
    enabled: inventory.registryVersion !== registry.bundleVersion,
  });
  const currentRegistry = inventory.registryVersion === registry.bundleVersion ? registry : pinnedRegistry.data;
  const settingsError = inventory.registryVersion === registry.bundleVersion ? null : pinnedRegistry.error;
  const normalizedState = view === "items" && currentRegistry ? normalizeCoverageTargets(state, currentRegistry) : state;
  const { request } = normalizedState;
  const analysisKey = coverageAnalysisKey(request);
  const activeSetupGoal = setupGoal?.queryKey === analysisKey ? setupGoal : undefined;
  useEffect(() => {
    if (view === "items" && currentRegistry) setState((previous) => normalizeCoverageTargets(previous, currentRegistry));
  }, [currentRegistry, view]);
  useEffect(() => {
    if (setupGoal && setupGoal.queryKey !== analysisKey) setSetupGoal(undefined);
  }, [analysisKey, setupGoal]);
  const overviewRequest: CoverageRequest = {
    ...initialCoverageState(state.overviewInventory.registryVersion).request, filters: state.overviewInventory.filters, includeOverview: true,
  };
  const activeRequest = view === "overview" ? overviewRequest : request;
  const query = useQuery({ queryKey: ["language-coverage", accountScope, activeRequest], queryFn: () => getLanguageCoverage(activeRequest), enabled: !!currentRegistry, staleTime: 15_000, refetchOnMount: "always" });
  const update = (patch: Partial<CoverageRequest>) => {
    setState((previous) => updateCoverageState(previous, patch));
    if (view === "items" && coverageAnalysisKey(updateCoverageRequest(request, patch)) !== analysisKey) {
      setShowMatchingItems(false); setSetupReturnRequest(undefined); setSetupReturnPlanning(undefined); setSetupGoal(undefined);
    }
  };
  // Quantities stay attached to their language targets and setup, independent of detail status.
  const goalKey = JSON.stringify({ analysisKey, resetCount });
  const hasFilters = hasCoverageViewFilters(normalizedState, registry.bundleVersion);
  const reset = () => {
    setState((previous) => resetCoverageView(previous, registry.bundleVersion));
    if (view === "items") {
      setResetCount((previous) => previous + 1); setShowMatchingItems(false); setSetupReturnRequest(undefined); setSetupReturnPlanning(undefined); setSetupGoal(undefined);
    }
  };
  const controls = <fieldset disabled={!currentRegistry} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <CoverageControls key={view} registry={currentRegistry ?? registry} versions={[registry.bundleVersion, inventory.registryVersion, ...(query.data?.availableRegistryVersions ?? [])]}
      request={activeRequest} onChange={update} overview={view === "overview"} />
  </fieldset>;
  const feedback = <>
    {!currentRegistry && !settingsError && <HStack role="status"><Spinner size="sm" /><Text>Loading Assessment Settings…</Text></HStack>}
    {settingsError && <HStack role="alert" flexWrap="wrap"><Text color="fg.error">{settingsError.message}</Text><Button size="sm" variant="outline" onClick={() => void pinnedRegistry.refetch()}>Retry settings</Button><Button size="sm" variant="outline" onClick={() => update({ registryVersion: registry.bundleVersion, filters: {}, selectedIds: [], excludedIds: [] })}>Use current settings</Button></HStack>}
    {query.error && <HStack role="alert" flexWrap="wrap"><Text color="fg.error">{query.error.message}</Text><Button size="sm" variant="outline" onClick={() => void query.refetch()}>Retry coverage</Button></HStack>}
    {query.isPending && currentRegistry && <HStack role="status"><Spinner size="sm" /><Text fontSize="sm">Loading coverage…</Text></HStack>}
    {view === "overview" && query.data && !query.error && !query.data.overview && <Text role="alert" color="fg.error">Coverage overview could not be loaded. Try Refresh.</Text>}
  </>;

  return <Stack gap={5}>
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
    <HStack gap={2} role="group" aria-label="Coverage view">
      <Button size="sm" colorPalette="teal" variant={view === "overview" ? "solid" : "outline"} aria-pressed={view === "overview"} onClick={() => setState((previous) => ({ ...previous, view: "overview" }))}>Overview</Button>
      <Button size="sm" colorPalette="teal" variant={view === "items" ? "solid" : "outline"} aria-pressed={view === "items"} onClick={() => setState((previous) => ({ ...previous, view: "items" }))}>Find items</Button>
    </HStack>
      <Button size="sm" variant="outline" onClick={() => void queryClient.invalidateQueries({ queryKey: ["language-coverage", accountScope], refetchType: "active" })}
        disabled={!currentRegistry} loading={fetchingCount > 0}>Refresh</Button>
    </HStack>
    {view === "overview" && <CoverageOverviewPanel registry={currentRegistry ?? registry} data={currentRegistry && !query.error ? query.data?.overview : undefined} state={state.overview}
        filters={controls} feedback={feedback} disabled={!currentRegistry} onReset={hasFilters ? reset : undefined}
        onStateChange={(patch) => setState((previous) => ({ ...previous, overview: { ...previous.overview, ...patch, offset: patch.offset ?? 0 } }))}
        onInspect={(id, scope) => {
          setState((previous) => inspectCoverageEntry(previous, id, scope));
          setSetupReturnRequest(undefined); setShowMatchingItems(false);
          setSetupReturnPlanning(undefined);
          setSetupGoal(undefined);
        }} />}
    {view === "items" && <>
      {setupReturnRequest && <Button size="sm" variant="outline" alignSelf="start" onClick={() => {
        setState((previous) => ({ ...previous, request: setupReturnRequest }));
        setSetupReturnRequest(undefined); setShowMatchingItems(false);
        setSetupGoal(setupReturnPlanning); setSetupReturnPlanning(undefined);
      }}>Back to item setups</Button>}
      <CoverageFilterSection onReset={hasFilters ? reset : undefined}>{controls}</CoverageFilterSection>
      {feedback}
    </>}
    {view === "items" && query.data && !query.error && currentRegistry && <CoverageResults key={goalKey} data={query.data} request={request} registry={currentRegistry}
      currentRegistry={registry} accountScope={accountScope} showItems={showMatchingItems} onPlan={onPlanBatch} onChange={update}
      onItemsOpenChange={setShowMatchingItems} setupGoal={activeSetupGoal}
      onSetupGoalChange={(next) => setSetupGoal(next ? { ...next, queryKey: analysisKey } : undefined)}
      onInspect={(filters, scope) => {
        update(coverageSetupQuery(request, filters, scope));
        setSetupReturnPlanning(setupReturnRequest ? setupReturnPlanning : activeSetupGoal);
        setSetupReturnRequest(setupReturnRequest ?? request); setShowMatchingItems(true);
      }} />}
  </Stack>;
}
