import { Box, Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
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
  useEffect(() => { setStagedDirty(false); }, [record?.id, settings.editorReset]);
  useEffect(() => { onDirtyChange?.(dirty || stagedDirty); }, [dirty, stagedDirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  const status = record ? registryStatus(record, dirty || stagedDirty, user?.email) : null;
  const needsSave = dirty || stagedDirty || settings.remoteChanged;

  return (
    <Box borderWidth="1px" borderRadius="xl" bg="bg">
      <Stack p={5} gap={4}>
        {settings.loading && !record ? <HStack role="status"><Spinner size="sm" /><Text>Loading settings…</Text></HStack> : null}
        {settings.loadError ? <HStack flexWrap="wrap">
          <Text role="alert" color="fg.error">Could not load settings: {settings.loadError}</Text>
          <Button variant="outline" size="sm" loading={settings.refreshing} disabled={busy || settings.refreshing} onClick={settings.retryLoad}>Retry loading settings</Button>
        </HStack> : null}
        {!record && !settings.loading && !settings.loadError ? <Stack gap={3} align="start">
          <Text role="status">No published settings are available.</Text>
          <Button variant="outline" size="sm" loading={settings.refreshing} disabled={busy || settings.refreshing} onClick={settings.retryLoad}>Retry loading settings</Button>
        </Stack> : null}
        {record ? <>
          <HStack justify="space-between" gap={3} flexWrap="wrap" position="sticky" top="3.5rem" zIndex={20} bg="bg" py={3} borderBottomWidth="1px">
            <Stack gap={1}>
              <Text role="status" fontSize="sm" color={dirty || stagedDirty ? "fg.warning" : "fg.muted"}>{status?.label}</Text>
              {stagedDirty ? <Text fontSize="xs" color="fg.muted">Apply or cancel the open edits before saving.</Text> : null}
            </Stack>
            <HStack flexWrap="wrap" gap={2}>
              {editable ? <>
                {dirty || stagedDirty ? <Button colorPalette="teal" title={stagedDirty ? "Apply or cancel the open edits first" : "Save changes without using them for new items"} loading={settings.action === "save"} disabled={busy || !dirty || stagedDirty || settings.remoteChanged} onClick={() => settings.run("save")}>Save changes</Button>
                  : <Button colorPalette="teal" title={needsSave ? "Reload the saved draft first" : settings.staleBase ? "Start from the latest published settings" : "Check and confirm settings for new items"} loading={settings.action === "prepare" || settings.action === "publish"} disabled={busy || needsSave || settings.staleBase || feedback.validation?.valid === false} onClick={() => settings.run("prepare")}>Use for new items</Button>}
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
          {feedback.validation && !feedback.validation.valid ? <RegistryValidationFeedback snapshot={record.snapshot} result={feedback.validation} /> : null}
          <RegistryRuleEditor key={`${record.id}:${settings.editorReset}`} snapshot={record.snapshot} registryVersionId={record.id} expectedRevision={record.revision} published={record.status !== "draft"} update={settings.update} disabled={!editable || busy || !!publication || settings.remoteChanged} onStagedDirtyChange={setStagedDirty} />
        </> : settings.error ? <Text role="alert" color="fg.error">{settings.error}</Text> : null}
      </Stack>
      <RegistryPublishDialog publication={publication} busy={busy} onClose={settings.closePublication} onPublish={() => settings.run("publish")} />
    </Box>
  );
}
