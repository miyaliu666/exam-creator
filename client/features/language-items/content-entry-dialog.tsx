import { Box, Button, Dialog, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

import { contentEntryBaselineMatches, contentEntryErrors, contentEntryIdentityChanged, duplicateContentEntries, prepareContentEntry, reconcileContentGeneratedPinyin, sameNameContentEntries, type ContentGeneratedPinyin } from "./content-catalog-model";
import { ContentEntryDetails, ContentEntryFields } from "./content-entry-fields";
import { ContentEntryScopes } from "./content-entry-scopes";
import { ContentEntryPreview } from "./content-entry-preview";
import { languageTargetLabel } from "./language-target-labels";
import { generateMissingContentPinyin } from "./content-pinyin";
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
  const [generatingPinyin, setGeneratingPinyin] = useState(false);
  const [pinyinError, setPinyinError] = useState("");
  const [generatedPinyin, setGeneratedPinyin] = useState<ContentGeneratedPinyin | null>(null);
  const active = useRef(true);
  const latest = useRef({ entry, disabled, snapshot });
  latest.current = { entry, disabled, snapshot };
  const changed = JSON.stringify(entry) !== JSON.stringify(initialEntry);
  const next = prepareContentEntry(entry, initialEntry);
  const stale = !contentEntryBaselineMatches(initialEntry, snapshot.contentIdOptions, isNew);
  const errors = contentEntryErrors(next, snapshot, isNew);
  const matches = isNew || contentEntryIdentityChanged(next, initialEntry) ? sameNameContentEntries(next, snapshot.contentIdOptions) : [];
  const exactDuplicate = matches.length > 0 && duplicateContentEntries(next, matches).length > 0;
  const matchKey = JSON.stringify(matches);
  const duplicatePending = matches.length > 0 && (exactDuplicate || confirmedMatches !== matchKey);
  const changeEntry = (value: ContentIdOption) => {
    const reconciled = reconcileContentGeneratedPinyin(value, generatedPinyin);
    setEntry(reconciled.entry); setGeneratedPinyin(reconciled.generated); setConfirmedMatches("");
  };
  useEffect(() => { onDirtyChange?.(changed || generatingPinyin); }, [changed, generatingPinyin, onDirtyChange]);
  useEffect(() => { active.current = true; return () => { active.current = false; onDirtyChange?.(false); }; }, [onDirtyChange]);
  const close = () => { if ((changed || generatingPinyin) && !window.confirm("Discard the changes to this language content entry?")) return; onClose(); };
  const generatePinyin = async () => {
    setGeneratingPinyin(true); setPinyinError("");
    const startingEntry = JSON.stringify(entry);
    try {
      const [generated] = await generateMissingContentPinyin([entry]);
      if (!active.current) return;
      if (latest.current.disabled || JSON.stringify(latest.current.entry) !== startingEntry || !contentEntryBaselineMatches(initialEntry, latest.current.snapshot.contentIdOptions, isNew)) throw new Error("This entry changed while pinyin was generated. Review the current entry and try again.");
      changeEntry(generated);
      if (generated.pinyin && generated.pinyin !== entry.pinyin) setGeneratedPinyin({ label: generated.label, pinyin: generated.pinyin });
    } catch (failure) { if (active.current) setPinyinError(failure instanceof Error ? failure.message : "Pinyin could not be generated."); }
    finally { if (active.current) setGeneratingPinyin(false); }
  };
  const apply = () => {
    if (disabled || generatingPinyin || !contentEntryBaselineMatches(initialEntry, snapshot.contentIdOptions, isNew) || errors.length || duplicatePending) return;
    onApply(next);
  };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside" size="lg">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>{disabled ? "Language content" : isNew ? "New entry" : "Edit entry"}</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={5}>
        {stale ? <Text role="alert" color="fg.error">This entry changed or was removed. Copy any unsaved edits, then reopen it.</Text> : null}
        {disabled && !changed ? <ContentEntryPreview entry={entry} snapshot={snapshot} /> : <>
        <ContentEntryFields entry={entry} snapshot={snapshot} isNew={isNew} disabled={disabled || generatingPinyin} onChange={changeEntry}>
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
        <Box borderTopWidth="1px" pt={4}><ContentEntryScopes entry={entry} snapshot={snapshot} onChange={changeEntry} disabled={disabled || generatingPinyin} /></Box>
        <details open><summary style={{ cursor: "pointer", fontWeight: 600 }}>Examples and details</summary><ContentEntryDetails entry={entry} disabled={disabled || generatingPinyin} onChange={changeEntry} onGeneratePinyin={() => void generatePinyin()} generatingPinyin={generatingPinyin} /></details>
        </>}
        {pinyinError ? <Text role="alert" color="fg.error">{pinyinError}</Text> : null}
        {!disabled && changed && errors.length ? <Stack role="status" gap={1}>{errors.map((error) => <Text key={error} color="fg.error" fontSize="sm">{error}</Text>)}</Stack> : null}
        {disabled && changed ? <Text role="alert" color="fg.warning">Read-only. Unsaved changes are retained.</Text> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>{disabled ? "Close" : "Cancel"}</Button>{!disabled ? <Button colorPalette="teal" disabled={stale || generatingPinyin || !changed || !!errors.length || duplicatePending} onClick={apply}>Apply to draft</Button> : null}</Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
