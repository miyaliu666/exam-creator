import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { controlLanguageItemBatch, getLanguageItemBatch, getLanguageItemBatches } from "./batch-api";
import { BatchProgress } from "./batch-progress";
import { CONTENT_LANGUAGE_OPTIONS, contentLanguage } from "./content-language";
import { FilterSelect } from "./filter-select";
import { batchNeedsPolling, batchProgressVisibility, includeFocusedBatch } from "./batch-progress-state";
import type { RegistrySnapshot } from "./types";

export function BatchAuthoringPanel({ scope, registry, focusedJobId, onOpenItem }: {
  scope: string;
  registry: RegistrySnapshot;
  focusedJobId?: string;
  onOpenItem: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [showHistory, setShowHistory] = useState(false);
  const [languageFilter, setLanguageFilter] = useState("");
  const jobsQuery = useQuery({
    queryKey: ["language-item-batches", scope], queryFn: getLanguageItemBatches, retry: false,
    refetchInterval: (query) => query.state.data?.some(batchNeedsPolling) ? 2500 : false,
  });
  const needsFocusedJob = !!focusedJobId && !jobsQuery.isPending &&
    !(jobsQuery.data ?? []).some((job) => job.id === focusedJobId);
  const focusedJobQuery = useQuery({
    queryKey: ["language-item-batch", scope, focusedJobId],
    queryFn: () => getLanguageItemBatch(focusedJobId!),
    enabled: needsFocusedJob,
    retry: false,
    refetchInterval: (query) => query.state.data && batchNeedsPolling(query.state.data) ? 2500 : false,
  });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["language-item-batches", scope] }),
      queryClient.invalidateQueries({ queryKey: ["language-item-batch", scope] }),
      queryClient.invalidateQueries({ queryKey: ["language-items"] }),
      queryClient.invalidateQueries({ queryKey: ["language-coverage"] }),
    ]);
  };
  const control = useMutation({ mutationFn: ({ id, action }: { id: string; action: "pause" | "resume" }) => controlLanguageItemBatch(id, action), onSuccess: refresh });
  const jobs = includeFocusedBatch(jobsQuery.data ?? [], needsFocusedJob ? focusedJobQuery.data : undefined);
  const progressKey = jobs.map((job) => `${job.id}:${job.updatedAt}`).join("|");
  useEffect(() => {
    if (progressKey) void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["language-items"] }),
      queryClient.invalidateQueries({ queryKey: ["language-coverage"] }),
    ]);
  }, [progressKey, queryClient]);
  const matchingJobs = jobs.filter((job) => !languageFilter || job.groups.some((group) => contentLanguage(group) === languageFilter));
  const { latestId, visibleJobs, hiddenCompletedCount } = batchProgressVisibility(matchingJobs, showHistory, focusedJobId);
  return (
    <Stack gap={4}>
      <HStack><FilterSelect label="Language" value={languageFilter} options={[...CONTENT_LANGUAGE_OPTIONS]} onChange={setLanguageFilter} /></HStack>
      {jobsQuery.isSuccess && languageFilter && !matchingJobs.length ? <Text color="fg.muted">No generation jobs match this language.</Text> : null}
      {needsFocusedJob && focusedJobQuery.isPending ? <HStack><Spinner size="sm" /><Text color="fg.muted">Loading requested generation job…</Text></HStack> : null}
      {needsFocusedJob && focusedJobQuery.error ? <HStack flexWrap="wrap">
        <Text role="alert" color="fg.error" fontSize="sm">Could not load the requested generation job: {focusedJobQuery.error.message}</Text>
        <Button size="sm" variant="outline" loading={focusedJobQuery.isFetching} onClick={() => void focusedJobQuery.refetch()}>Retry requested job</Button>
      </HStack> : null}
      {jobs.length > 0 ? <>
        {showHistory || hiddenCompletedCount > 0 ? <HStack justify="flex-end">
          <Button size="sm" variant="ghost" onClick={() => setShowHistory(!showHistory)}>{showHistory ? "Hide older jobs" : `Show ${hiddenCompletedCount} older jobs`}</Button>
        </HStack> : null}
        {visibleJobs.map((job) => <BatchProgress key={job.id} job={job} registry={registry} onOpenItem={onOpenItem}
          defaultExpanded={job.id === focusedJobId || job.id === latestId}
          pending={control.isPending && control.variables.id === job.id} onControl={(action) => control.mutate({ id: job.id, action })} />)}
      </> : null}
      {jobsQuery.isPending ? <HStack><Spinner size="sm" /><Text color="fg.muted">Loading generation jobs…</Text></HStack> : null}
      {jobsQuery.isSuccess && jobs.length === 0 && !focusedJobId ? <Text color="fg.muted" py={8} textAlign="center">No generation jobs yet.</Text> : null}
      {jobsQuery.error ? <HStack flexWrap="wrap">
        <Text role="alert" color="fg.error" fontSize="sm">Could not load generation jobs: {jobsQuery.error.message}</Text>
        <Button size="sm" variant="outline" loading={jobsQuery.isFetching} onClick={() => void jobsQuery.refetch()}>Retry</Button>
      </HStack> : null}
      {control.error ? <Text role="alert" color="fg.error" fontSize="sm">{control.error.message}</Text> : null}
    </Stack>
  );
}
