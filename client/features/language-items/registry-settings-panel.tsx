import { Badge, Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useContext, useEffect, useState } from "react";

import { AuthContext } from "../../contexts/auth";
import { RegistryRuleEditor } from "./registry-rule-editor";
import { registryStatus } from "./registry-workflow";
import { RegistryPublishDialog, RegistryValidationFeedback } from "./registry-workflow-feedback";
import { useRegistrySettings } from "./use-registry-settings";

export function RegistrySettingsPanel({ onDirtyChange, onBusyChange }: {
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { user } = useContext(AuthContext)!;
  const [stagedDirty, setStagedDirty] = useState(false);
  const settings = useRegistrySettings(user?.email, stagedDirty);
  const { record, editable, dirty, busy, feedback, publication } = settings;
  useEffect(() => { onDirtyChange?.(dirty || stagedDirty); }, [dirty, stagedDirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const status = record ? registryStatus(record, dirty, user?.email) : null;
  const needsSave = dirty || stagedDirty || settings.remoteChanged;

  return (
    <Box borderWidth="1px" borderRadius="xl" bg="bg" overflow="hidden">
      <Stack p={5} gap={4}>
        {settings.loading ? <Spinner /> : null}
        {record ? <>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <HStack flexWrap="wrap" gap={2}>
              <Badge colorPalette={status?.colorPalette}>{status?.label}</Badge>
              {editable ? <>
                <Button variant="outline" loading={settings.action === "save"} disabled={busy || !dirty || stagedDirty || settings.remoteChanged} onClick={() => settings.run("save")}>Save draft</Button>
                <Button colorPalette="teal" title={needsSave ? "Save the draft first" : settings.staleBase ? "Start from the latest published settings" : "Review and confirm publication"} loading={settings.action === "prepare" || settings.action === "publish"} disabled={busy || needsSave || settings.staleBase || feedback.validation?.valid === false} onClick={() => settings.run("prepare")}>Publish</Button>
              </> : <Button colorPalette="teal" disabled={busy} loading={settings.action === "restart"} onClick={settings.restart}>Edit settings</Button>}
            </HStack>
          </HStack>
          {settings.remoteChanged ? <HStack flexWrap="wrap">
            <Text color="fg.error">This draft changed elsewhere. Local edits have been kept.</Text>
            <Button variant="outline" disabled={busy} onClick={settings.reload}>Reload saved draft</Button>
          </HStack> : null}
          {settings.staleBase ? <HStack flexWrap="wrap">
            <Text color="fg.warning">This draft is based on older published settings.</Text>
            <Button variant="outline" disabled={busy} onClick={settings.restart}>Start from published settings</Button>
          </HStack> : null}
          {settings.error ? <Text role="alert" color="fg.error">{settings.error}</Text> : null}
          {feedback.notice ? <Text role="status" color="fg.info">{feedback.notice}</Text> : null}
          {feedback.warnings?.map((warning) => <Text key={warning} role="alert" color="fg.warning">{warning}</Text>)}
          {feedback.validation ? <RegistryValidationFeedback snapshot={record.snapshot} result={feedback.validation} /> : null}
          <RegistryRuleEditor snapshot={record.snapshot} update={settings.update} disabled={!editable || busy || !!publication || settings.remoteChanged} onStagedDirtyChange={setStagedDirty} history={
            <Stack gap={2}>
              {settings.audit.map((event) => <HStack key={event.id} justify="space-between" align="start" gap={3} fontSize="sm">
                <Text>{event.action.replace(/^registry[._]/, "").replace(/[._]/g, " ")} · {event.actorEmail}</Text>
                <Text color="fg.muted" whiteSpace="nowrap">{new Date(event.createdAt).toLocaleString()}</Text>
              </HStack>)}
              {settings.auditError ? <Text color="fg.error">{settings.auditError}</Text> : !settings.audit.length ? <Text color="fg.muted">No changes recorded.</Text> : null}
            </Stack>
          } />
        </> : settings.error ? <Text role="alert" color="fg.error">{settings.error}</Text> : null}
      </Stack>
      <RegistryPublishDialog publication={publication} busy={busy} onClose={settings.closePublication} onPublish={() => settings.run("publish")} />
    </Box>
  );
}
