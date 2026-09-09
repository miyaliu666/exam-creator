import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { BatchGenerationJob } from "./batch-api";
import { getLanguageItemRegistry } from "./api";
import { batchCanResume } from "./batch-progress-state";
import { batchCreationTime, batchGenerationSummary } from "./batch-progress-display";
import { BatchProgressGroup } from "./batch-progress-group";
import { generationErrorMessage } from "./generation-message";
import type { RegistrySnapshot } from "./types";

const JOB_LABELS: Record<BatchGenerationJob["status"], string> = {
  queued: "Queued", running: "Generating", paused: "Paused", partial: "Needs attention", completed: "Generation complete",
};

export function BatchProgress({ job, registry, pending, defaultExpanded = false, onControl, onOpenItem }: {
  job: BatchGenerationJob;
  registry: RegistrySnapshot;
  pending: boolean;
  defaultExpanded?: boolean;
  onControl: (action: "pause" | "resume") => void;
  onOpenItem: (id: string) => void;
}) {
  const [manualExpansion, setManualExpansion] = useState<boolean>();
  const expanded = manualExpansion ?? defaultExpanded;
  const pinnedRegistry = useQuery({ queryKey: ["language-item-registry", job.registryVersion],
    queryFn: () => getLanguageItemRegistry(job.registryVersion), enabled: expanded && registry.bundleVersion !== job.registryVersion });
  const labels = registry.bundleVersion === job.registryVersion ? registry : pinnedRegistry.data;
  const summary = batchGenerationSummary(job);
  const active = ["queued", "running"].includes(job.status);
  const canResume = batchCanResume(job);
  const counts = [`${summary.total} ${summary.total === 1 ? "item" : "items"}`, `${summary.withCandidates} with AI drafts`,
    summary.generating ? `${summary.generating} generating` : "", summary.waiting ? `${summary.waiting} waiting` : "",
    summary.failed ? `${summary.failed} failed` : ""].filter(Boolean);
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Stack gap={3}>
        <HStack justify="space-between" flexWrap="wrap">
          <Stack gap={1}>
            <HStack flexWrap="wrap"><Text fontWeight="semibold">{job.title}</Text><Badge colorPalette={summary.failed ? "orange" : active ? "blue" : "teal"}>{JOB_LABELS[summary.status]}</Badge></HStack>
            <Text color="fg.muted" fontSize="xs"><time dateTime={job.createdAt}>{batchCreationTime(job.createdAt)}</time></Text>
            <Text fontSize="sm">{counts.join(" · ")}{job.candidatesPerItem > 1 ? ` · ${job.candidatesPerItem} AI drafts requested per item` : ""}</Text>
          </Stack>
          <HStack>
            {active ? <Button size="sm" variant="outline" loading={pending} onClick={() => onControl("pause")}>Pause</Button> :
              canResume ? <Button size="sm" variant="outline" loading={pending} onClick={() => onControl("resume")}>Continue remaining items</Button> : null}
            <Button size="sm" variant="ghost" onClick={() => setManualExpansion(!expanded)}>{expanded ? "Hide items" : "View items"}</Button>
          </HStack>
        </HStack>
        {job.status === "paused" ? <Text color="fg.muted" fontSize="sm">Current generation may finish; remaining items are paused.</Text> : null}
        {job.error ? <Text role="alert" color="fg.error" fontSize="sm">{generationErrorMessage(job.error)}</Text> : null}
        {expanded ? <>
          {job.groups.map((group, groupIndex) => <BatchProgressGroup key={groupIndex} group={group} groupIndex={groupIndex} grouped={job.groups.length > 1}
            children={job.children.filter((child) => child.groupIndex === groupIndex)} registry={labels} labelsError={Boolean(pinnedRegistry.error)} onOpenItem={onOpenItem} />)}
          {pinnedRegistry.error ? <Text role="alert" color="fg.error" fontSize="sm">Could not load this batch's Assessment Settings: {pinnedRegistry.error.message}</Text> : null}
        </> : null}
      </Stack>
    </Box>
  );
}
