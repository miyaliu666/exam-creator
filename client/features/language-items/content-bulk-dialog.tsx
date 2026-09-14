import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ContentBulkFields } from "./content-bulk-fields";
import { contentBulkErrors, contentBulkSnapshotKey, emptyContentBulkChanges, prepareContentBulkEntries } from "./content-bulk-model";
import { ContentBulkPreview } from "./content-bulk-preview";
import { canGenerateContentPinyin, generateMissingContentPinyin } from "./content-pinyin";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentBulkDialog({ selectedIds, snapshot, disabled, onApply, onClose, onDirtyChange }: {
  selectedIds: string[];
  snapshot: RegistrySnapshot;
  disabled: boolean;
  onApply: (entries: ContentIdOption[], baselineKey: string) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [baseline] = useState(() => ({ key: contentBulkSnapshotKey(snapshot), entries: structuredClone(snapshot.contentIdOptions.filter((entry) => selectedIds.includes(entry.id))) }));
  const [changes, setChanges] = useState(emptyContentBulkChanges);
  const [pinyin, setPinyin] = useState(new Map<string, string>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const snapshotKey = useMemo(() => contentBulkSnapshotKey(snapshot), [snapshot]);
  const latest = useRef({ key: snapshotKey, disabled });
  latest.current = { key: snapshotKey, disabled };
  const active = useRef(true);
  const stale = latest.current.key !== baseline.key;
  const dirty = busy || JSON.stringify(changes) !== JSON.stringify(emptyContentBulkChanges()) || pinyin.size > 0;
  const prepared = prepareContentBulkEntries(baseline.entries, changes, pinyin);
  const errors = contentBulkErrors(changes, snapshot);
  const missingPinyin = baseline.entries.filter((entry) => canGenerateContentPinyin(entry) && !pinyin.has(entry.id));
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { active.current = true; return () => { active.current = false; onDirtyChange?.(false); }; }, [onDirtyChange]);
  const close = () => { if (!dirty || window.confirm("Discard these bulk changes?")) onClose(); };
  const generate = async () => {
    setBusy(true); setError("");
    try {
      const generated = await generateMissingContentPinyin(baseline.entries);
      if (!active.current) return;
      if (latest.current.disabled || latest.current.key !== baseline.key) throw new Error("Settings changed while pinyin was generated. Reopen bulk edit against the current draft.");
      setPinyin(new Map(generated.filter((entry) => entry.pinyin?.trim() && baseline.entries.some((original) => original.id === entry.id && canGenerateContentPinyin(original))).map((entry) => [entry.id, entry.pinyin!])));
    } catch (failure) { if (active.current) setError(failure instanceof Error ? failure.message : "Pinyin could not be generated."); }
    finally { if (active.current) setBusy(false); }
  };
  const apply = () => {
    if (disabled || stale || busy || errors.length || !prepared.length) return;
    try { onApply(prepared, baseline.key); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Changes could not be applied."); }
  };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside" size="xl">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Edit {baseline.entries.length} selected entries</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        {stale ? <Text role="alert" color="fg.error">Settings changed. Your staged changes are retained; reopen bulk edit to use the current draft.</Text> : null}
        {disabled && dirty ? <Text role="alert" color="fg.warning">Read-only. Unsaved changes are retained.</Text> : null}
        <ContentBulkFields changes={changes} snapshot={snapshot} disabled={disabled || stale || busy} onChange={(next) => { setChanges(next); setError(""); }} />
        <HStack flexWrap="wrap"><Button size="sm" variant="outline" disabled={disabled || stale || busy || !missingPinyin.length} onClick={() => void generate()}>{busy ? "Generating pinyin…" : `Generate missing pinyin (${missingPinyin.length})`}</Button>{pinyin.size ? <Button size="sm" variant="plain" disabled={busy || disabled} onClick={() => setPinyin(new Map())}>Discard generated pinyin</Button> : null}</HStack>
        {pinyin.size ? <Text fontSize="sm" color="fg.muted">Review generated pinyin below. Individual readings can be edited after applying.</Text> : null}
        {errors.map((issue) => <Text key={issue} role="alert" color="fg.error" fontSize="sm">{issue}</Text>)}
        {error ? <Text role="alert" color="fg.error">{error}</Text> : null}
        {prepared.length ? <ContentBulkPreview entries={prepared} original={baseline.entries} snapshot={snapshot} /> : <Text fontSize="sm" color="fg.muted">Choose the fields to change. Other values stay as they are.</Text>}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>Cancel</Button><Button colorPalette="teal" disabled={disabled || stale || busy || !prepared.length || !!errors.length} onClick={apply}>Apply to draft</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
