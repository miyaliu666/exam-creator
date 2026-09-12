import { Box, Button, Dialog, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { contentEntryBaselineMatches, contentEntryErrors, contentEntryIdentityChanged, duplicateContentEntries, prepareContentEntry, sameNameContentEntries } from "./content-catalog-model";
import { ContentEntryDetails, ContentEntryFields } from "./content-entry-fields";
import { ContentEntryScopes } from "./content-entry-scopes";
import { languageTargetLabel } from "./language-target-labels";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentEntryDialog({ initialEntry, isNew, snapshot, disabled, onApply, onClose, onDirtyChange, onOpenExisting }: {
  initialEntry: ContentIdOption;
  isNew: boolean;
  snapshot: RegistrySnapshot;
  disabled: boolean;
  onApply: (entry: ContentIdOption) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpenExisting: (entry: ContentIdOption) => void;
}) {
  const [entry, setEntry] = useState(() => structuredClone(initialEntry));
  const [confirmedMatches, setConfirmedMatches] = useState("");
  const changed = JSON.stringify(entry) !== JSON.stringify(initialEntry);
  const next = prepareContentEntry(entry, initialEntry);
  const stale = !contentEntryBaselineMatches(initialEntry, snapshot.contentIdOptions, isNew);
  const errors = contentEntryErrors(next, snapshot, isNew);
  const matches = isNew || contentEntryIdentityChanged(next, initialEntry) ? sameNameContentEntries(next, snapshot.contentIdOptions) : [];
  const exactDuplicate = matches.length > 0 && duplicateContentEntries(next, matches).length > 0;
  const matchKey = JSON.stringify(matches);
  const duplicatePending = matches.length > 0 && (exactDuplicate || confirmedMatches !== matchKey);
  const changeEntry = (value: ContentIdOption) => { setEntry(value); setConfirmedMatches(""); };
  useEffect(() => { onDirtyChange?.(changed); }, [changed, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  const close = () => { if (changed && !window.confirm("Discard the changes to this language content entry?")) return; onClose(); };
  const apply = () => {
    if (disabled || !contentEntryBaselineMatches(initialEntry, snapshot.contentIdOptions, isNew) || errors.length || duplicatePending) return;
    onApply(next);
  };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside" size="lg">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>{disabled ? "Language content" : isNew ? "New entry" : "Edit entry"}</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={5}>
        {stale ? <Text role="alert" color="fg.error">This entry changed or was removed. Copy any unsaved edits, then reopen it.</Text> : null}
        <ContentEntryFields entry={entry} snapshot={snapshot} isNew={isNew} disabled={disabled} onChange={changeEntry}>
          {!disabled && matches.length ? <Stack borderWidth="1px" borderRadius="md" p={3} gap={2}>
            <Text fontWeight="medium" fontSize="sm">{exactDuplicate ? "This entry already exists." : "Existing entries with this name"}</Text>
            <Stack maxH="40" overflowY="auto" gap={2}>{matches.map((match) => <Box key={match.id}>
              <Button size="sm" variant="plain" p={0} colorPalette="teal" onClick={() => {
                if (!changed || window.confirm("Discard these changes and edit the existing entry?")) onOpenExisting(match);
              }}>Edit existing: {languageTargetLabel(match).primary}</Button>
              <Text fontSize="sm">{(match.kind === "grammar" ? match.pattern : match.meaning) || languageTargetLabel(match).english || "Meaning not recorded"}</Text>
            </Box>)}</Stack>
            {!exactDuplicate ? <label><input type="checkbox" checked={confirmedMatches === matchKey} onChange={(event) => setConfirmedMatches(event.target.checked ? matchKey : "")} /> Different meaning or use</label> : null}
          </Stack> : null}
        </ContentEntryFields>
        <Box borderTopWidth="1px" pt={4}><ContentEntryScopes entry={entry} snapshot={snapshot} onChange={changeEntry} disabled={disabled} /></Box>
        <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Details</summary><ContentEntryDetails entry={entry} disabled={disabled} onChange={changeEntry} /></details>
        {!disabled && changed && errors.length ? <Stack role="status" gap={1}>{errors.map((error) => <Text key={error} color="fg.error" fontSize="sm">{error}</Text>)}</Stack> : null}
        {disabled && changed ? <Text role="alert" color="fg.warning">Read-only. Unsaved changes are retained.</Text> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>{disabled ? "Close" : "Cancel"}</Button>{!disabled ? <Button colorPalette="teal" disabled={stale || !changed || !!errors.length || duplicatePending} onClick={apply}>{isNew ? "Add to draft" : "Apply changes"}</Button> : null}</Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
