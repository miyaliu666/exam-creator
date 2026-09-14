import { Box, Button, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { VERSION_USAGE_LABELS } from "./version-usage-labels";
import { usageTransitions } from "./version-usage-policy";
import type { VersionUsageState, VersionUsageSummary } from "./version-usage-types";
import { useVersionUsageWrite } from "./version-usage-write";

export function VersionUsageStateForm({ itemId, version, disabled, onDirtyChange, onBusyChange }: {
  itemId: string; version: VersionUsageSummary; disabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [target, setTarget] = useState<VersionUsageState | "">("");
  const [reason, setReason] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = !!target || reason !== "";
  const write = useVersionUsageWrite(itemId, version, () => { setTarget(""); setReason(""); setSaved(true); onDirtyChange(false); });
  const transitions = usageTransitions(version);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { onBusyChange(write.isPending); }, [write.isPending, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const allowed = !!target && (transitions.includes(target) || write.retryPending);
  if (version.state === "retired" && !dirty && !write.retryPending) return <Text fontSize="sm" color="fg.muted">This version is retired. Its content and history remain available.</Text>;
  return <Stack gap={3}>
    <Box><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="version-usage-state">Change use status</label></Text>
      <NativeSelect.Root disabled={disabled || write.isPending}><NativeSelect.Field id="version-usage-state" value={target} onChange={(event) => {
        setTarget(event.target.value as VersionUsageState | ""); setSaved(false); write.resetRequest();
      }}><option value="" disabled hidden>Select status</option>{target && !transitions.includes(target) ? <option value={target}>{VERSION_USAGE_LABELS[target]} · previous request</option> : null}{transitions.map((value) => <option key={value} value={value}>{VERSION_USAGE_LABELS[value]}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    </Box>
    {(version.state === "pilot" || version.state === "suspended") && !transitions.includes("live") ? <Text fontSize="sm" color="fg.muted">Formal use requires a current pilot result with the decision Ready for formal use.</Text> : null}
    {target ? <Box><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="version-usage-reason">Reason</label></Text>
      <Textarea id="version-usage-reason" value={reason} maxLength={4000} disabled={disabled || write.isPending} onChange={(event) => { setReason(event.target.value); setSaved(false); write.resetRequest(); }} />
    </Box> : null}
    {target === "retired" ? <Text fontSize="sm" color="fg.warning">Retirement is final for this version.</Text> : null}
    {target && !transitions.includes(target) && !write.retryPending ? <Text role="alert" color="fg.error">The saved use status changed. Choose an available status again.</Text> : null}
    {write.isError ? <Text role="alert" color="fg.error">{write.error.message}</Text> : null}
    {saved ? <Text role="status" color="fg.success">Use status recorded.</Text> : null}
    <Button alignSelf="start" variant="outline" disabled={disabled || write.isPending || !allowed || !reason.trim()} loading={write.isPending} onClick={() => {
      if (!target || !reason.trim() || !allowed) return;
      if (target === "retired" && !write.retryPending && !window.confirm(`Retire version ${version.versionNumber}? It cannot be returned to use. Existing exam deployments must be managed separately.`)) return;
      write.mutate({ kind: "state", state: target, reason: reason.trim() });
    }}>{write.retryPending ? "Retry use status" : "Save use status"}</Button>
    {dirty ? <Button alignSelf="start" size="sm" variant="plain" disabled={disabled || write.isPending} onClick={() => { setTarget(""); setReason(""); write.resetRequest(); }}>Discard use status changes</Button> : null}
  </Stack>;
}
