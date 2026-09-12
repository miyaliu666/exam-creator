import { Badge, Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { PilotResultFields } from "./pilot-result-fields";
import { EMPTY_PILOT_FORM, parsePilotResult, type PilotResultFormState } from "./pilot-result-form-state";
import type { VersionUsageSummary } from "./version-usage-types";
import { useVersionUsageWrite } from "./version-usage-write";

export function PilotResultForm({ itemId, version, disabled, onDirtyChange, onBusyChange }: {
  itemId: string; version: VersionUsageSummary; disabled: boolean;
  onDirtyChange: (dirty: boolean) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [form, setForm] = useState<PilotResultFormState>({ ...EMPTY_PILOT_FORM });
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(EMPTY_PILOT_FORM);
  const write = useVersionUsageWrite(itemId, version, () => {
    setForm({ ...EMPTY_PILOT_FORM }); setAttempted(false); setSaved(true); onDirtyChange(false);
  });
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => { onBusyChange(write.isPending); }, [write.isPending, onBusyChange]);
  useEffect(() => () => onBusyChange(false), [onBusyChange]);
  const change = (patch: Partial<PilotResultFormState>) => { setForm((current) => ({ ...current, ...patch })); setSaved(false); write.resetRequest(); };
  const parsed = parsePilotResult(form);
  const eligible = (version.approved && version.state !== "retired") || write.retryPending;
  return <Box as="details" borderTopWidth="1px" pt={3}>
    <Text as="summary" cursor="pointer" fontWeight="medium">Record pilot results</Text>
    <Stack mt={3} gap={3}>
      <HStack><Badge>Manual summary · version {version.versionNumber}</Badge>{dirty ? <Badge colorPalette="orange">Unsaved</Badge> : null}</HStack>
      <PilotResultFields form={form} disabled={disabled || write.isPending || !eligible} onChange={change} />
      {attempted && parsed.errors.length ? <Stack role="alert" gap={1}>{parsed.errors.map((error) => <Text key={error} fontSize="sm" color="fg.error">{error}</Text>)}</Stack> : null}
      {write.isError ? <Text role="alert" color="fg.error">{write.error.message}</Text> : null}
      {saved ? <Text role="status" color="fg.success">Pilot results recorded for version {version.versionNumber}.</Text> : null}
      <Button alignSelf="start" variant="outline" loading={write.isPending} disabled={disabled || write.isPending || !dirty || !eligible} onClick={() => {
        setAttempted(true);
        if (parsed.summary) write.mutate({ kind: "pilot", summary: parsed.summary });
      }}>{write.retryPending ? "Retry pilot results" : "Save pilot results"}</Button>
      {dirty ? <Button alignSelf="start" size="sm" variant="plain" disabled={disabled || write.isPending} onClick={() => { setForm({ ...EMPTY_PILOT_FORM }); setAttempted(false); write.resetRequest(); }}>Discard pilot result changes</Button> : null}
    </Stack>
  </Box>;
}
