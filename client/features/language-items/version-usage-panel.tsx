import { Badge, Box, Button, HStack, NativeSelect, Spinner, Stack, Text } from "@chakra-ui/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { LanguageItemVersion } from "./types";
import { getItemVersionUsage } from "./version-usage-api";
import { VersionUsageDetails } from "./version-usage-details";
import { VERSION_USAGE_LABELS } from "./version-usage-labels";
import { hasVersionUsage, selectableUsageVersions, selectedUsageVersion } from "./version-usage-policy";

export interface VersionUsagePanelProps {
  itemId: string;
  versions: LanguageItemVersion[];
  canManage: boolean;
  disabled?: boolean;
  canRevise: boolean;
  onDirtyChange: (dirty: boolean) => void;
  onBusyChange: (busy: boolean) => void;
  onRevise: (versionId: string, usageEventId?: string) => Promise<void>;
  onOpenDraft?: () => void;
}

export function VersionUsagePanel(props: VersionUsagePanelProps) {
  const cache = useQueryClient();
  const query = useQuery({ queryKey: ["language-item-usage", props.itemId], queryFn: () => getItemVersionUsage(props.itemId) });
  const [selection, setSelection] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const available = selectableUsageVersions(query.data?.versions ?? []);
  const selected = selectedUsageVersion(available, selection);
  useEffect(() => { if (!selection && selected) setSelection(selected.versionId); }, [selection, selected?.versionId]);
  useEffect(() => { props.onDirtyChange(dirty); }, [dirty, props.onDirtyChange]);
  useEffect(() => () => props.onDirtyChange(false), [props.onDirtyChange]);
  useEffect(() => { props.onBusyChange(busy); }, [busy, props.onBusyChange]);
  useEffect(() => () => props.onBusyChange(false), [props.onBusyChange]);
  if (query.isSuccess && !hasVersionUsage(available) && !dirty && !busy) return null;
  return <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
    <Text as="summary" cursor="pointer" fontWeight="medium">Version use and pilot results</Text>
    <Stack mt={4} gap={4}>
      {query.isPending ? <Spinner size="sm" /> : null}
      {query.isError ? <Stack gap={2}><Text role="alert" color="fg.error">{query.error.message}</Text><Button alignSelf="start" size="sm" variant="outline" disabled={busy} onClick={() => void query.refetch()}>Retry version use</Button></Stack> : null}
      {selected ? <>
        <HStack flexWrap="wrap" gap={3}>
          <Box flex="1" minW="220px"><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="approved-usage-version">Version</label></Text>
            <NativeSelect.Root disabled={busy || props.disabled}><NativeSelect.Field id="approved-usage-version" value={selected.versionId} onChange={(event) => {
              if (dirty && !window.confirm("Discard unsaved use status and pilot results before changing version?")) return;
              setDirty(false); setSelection(event.target.value);
            }}>{available.map((version) => <option key={version.versionId} value={version.versionId}>Version {version.versionNumber} · {version.approved ? "Approved" : "Approval unavailable"} · {VERSION_USAGE_LABELS[version.state]}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
          </Box>
          {dirty ? <Badge colorPalette="orange">Unsaved</Badge> : null}
          <Button size="sm" variant="outline" disabled={busy || dirty || props.disabled} onClick={() => void Promise.all([
            query.refetch(), cache.invalidateQueries({ queryKey: ["language-version-usage", props.itemId] }),
            cache.invalidateQueries({ queryKey: ["language-item-versions", props.itemId] }),
          ])}>Refresh versions</Button>
        </HStack>
        <VersionUsageDetails key={selected.versionId} {...props} version={selected}
          snapshot={props.versions.find((version) => version.id === selected.versionId)}
          disabled={props.disabled || query.isError} onDirtyChange={setDirty} onBusyChange={setBusy} />
      </> : null}
    </Stack>
  </Box>;
}
