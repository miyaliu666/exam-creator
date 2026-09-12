import { Badge, Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PilotResultForm } from "./pilot-result-form";
import { PilotResultSummary } from "./pilot-result-summary";
import type { LanguageItemVersion } from "./types";
import { VersionAssemblyDownload } from "./version-assembly-download";
import { getVersionUsage } from "./version-usage-api";
import { VersionUsageContext } from "./version-usage-context";
import { VersionUsageHistory } from "./version-usage-history";
import { VERSION_USAGE_LABELS } from "./version-usage-labels";
import type { VersionUsagePanelProps } from "./version-usage-panel";
import { VersionUsageStateForm } from "./version-usage-state-form";
import type { VersionUsageSummary } from "./version-usage-types";

export function VersionUsageDetails(props: VersionUsagePanelProps & { version: VersionUsageSummary; snapshot: LanguageItemVersion | undefined }) {
  const cache = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["language-version-usage", props.itemId, props.version.versionId],
    queryFn: ({ pageParam }) => getVersionUsage(props.itemId, props.version.versionId, pageParam),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBeforeRevision ?? undefined,
  });
  const [stateDirty, setStateDirty] = useState(false);
  const [pilotDirty, setPilotDirty] = useState(false);
  const [stateBusy, setStateBusy] = useState(false);
  const [pilotBusy, setPilotBusy] = useState(false);
  const [revising, setRevising] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const version = query.data?.pages[0]?.version ?? props.version;
  const writeBusy = stateBusy || pilotBusy;
  const busy = writeBusy || revising;
  const dirty = stateDirty || pilotDirty;
  useEffect(() => { props.onDirtyChange(dirty); }, [dirty, props.onDirtyChange]);
  useEffect(() => () => props.onDirtyChange(false), [props.onDirtyChange]);
  useEffect(() => { props.onBusyChange(writeBusy); }, [writeBusy, props.onBusyChange]);
  useEffect(() => () => props.onBusyChange(false), [props.onBusyChange]);
  const contextMatches = props.snapshot?.contentHash === version.contentHash;
  const disabled = !!props.disabled || !props.canManage || !contextMatches || query.isPending || query.isError || busy;
  const latest = version.latestPilot;
  const summary = latest?.change.kind === "pilot" ? latest.change.summary : null;
  return <Stack gap={4}>
    <HStack flexWrap="wrap"><Badge colorPalette={version.state === "live" ? "teal" : version.state === "suspended" ? "orange" : "gray"}>{VERSION_USAGE_LABELS[version.state]}</Badge><Text fontSize="sm">Version {version.versionNumber}</Text></HStack>
    <Text fontSize="sm" color="fg.muted">These decisions record workbench availability. Existing exam deployments must be managed separately.</Text>
    {props.snapshot && contextMatches ? <VersionUsageContext version={props.snapshot} /> : <Stack gap={2}><Text role="alert" color="fg.error" fontSize="sm">The saved version details are unavailable.</Text><Button alignSelf="start" size="sm" variant="outline" disabled={busy} onClick={() => void cache.invalidateQueries({ queryKey: ["language-item-versions", props.itemId] })}>Retry saved version details</Button></Stack>}
    {query.isPending ? <Spinner size="sm" /> : null}
    {query.isError ? <Stack gap={2}><Text role="alert" color="fg.error">{query.error.message}</Text><Button alignSelf="start" size="sm" variant="outline" disabled={busy} onClick={() => void query.refetch()}>Retry version history</Button></Stack> : null}
    {!version.approved ? <Text role="alert" color="fg.error">{version.approvalIssue ?? "This version is not approved for use."}</Text> : null}
    {props.canManage ? <VersionUsageStateForm itemId={props.itemId} version={version} disabled={disabled || pilotDirty} onDirtyChange={setStateDirty} onBusyChange={setStateBusy} /> : null}
    {summary ? <Box borderTopWidth="1px" pt={3}><Text fontWeight="medium" mb={2}>Latest pilot results · version {version.versionNumber}</Text><PilotResultSummary summary={summary} /></Box> : <Text fontSize="sm" color="fg.muted">No pilot results recorded for this version.</Text>}
    {props.canManage ? <PilotResultForm itemId={props.itemId} version={version} disabled={disabled || stateDirty} onDirtyChange={setPilotDirty} onBusyChange={setPilotBusy} /> : null}
    {props.canManage ? <Stack gap={2}>
      {props.canRevise ? <Button alignSelf="start" variant="outline" disabled={disabled || dirty || !version.approved} loading={revising} onClick={async () => {
        setRevising(true); setRevisionError("");
        try { await props.onRevise(version.versionId, summary && ["revise", "retest"].includes(summary.decision) ? latest?.id : undefined); }
        catch (error) { setRevisionError(error instanceof Error ? error.message : String(error)); }
        finally { setRevising(false); }
      }}>Start revision from version {version.versionNumber}</Button> : <HStack flexWrap="wrap"><Text fontSize="sm" color="fg.muted">Continue the current draft before starting another revision.</Text>{props.onOpenDraft ? <Button size="sm" variant="outline" disabled={busy} onClick={props.onOpenDraft}>Open current draft</Button> : null}</HStack>}
      {revisionError ? <Text role="alert" color="fg.error">{revisionError}</Text> : null}
    </Stack> : null}
    <VersionAssemblyDownload itemId={props.itemId} versionId={version.versionId} versionNumber={version.versionNumber} disabled={busy} />
    {query.data ? <VersionUsageHistory events={query.data.pages.flatMap((page) => page.events)} hasMore={query.hasNextPage} busy={query.isFetchingNextPage || busy} onLoadMore={() => void query.fetchNextPage()} /> : null}
  </Stack>;
}
