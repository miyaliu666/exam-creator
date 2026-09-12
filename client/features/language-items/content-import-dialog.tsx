import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { ContentImportDefaults } from "./content-import-defaults";
import { readContentTables } from "./content-import-files";
import { ContentImportInput } from "./content-import-input";
import { ContentImportMapping } from "./content-import-mapping";
import { canPreviewContentTables, mapContentTables, parseContentTables, validateContentImport, type ContentImportRow, type ContentImportTable as ParsedContentTable } from "./content-import-model";
import { ContentImportTable } from "./content-import-table";
import { SelectField } from "./registry-form-controls";
import type { ContentIdOption, RegistrySnapshot } from "./types";

const clearDuplicateConfirmations = (rows: ContentImportRow[]) => rows.map((row) => row.duplicateConfirmed ? { ...row, duplicateConfirmed: false } : row);

export function ContentImportDialog({ snapshot, onApply, onClose, onDirtyChange, disabled = false }: {
  snapshot: RegistrySnapshot;
  onApply: (entries: ContentIdOption[], mode: "add" | "update") => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<ContentImportRow[]>([]);
  const [pendingTables, setPendingTables] = useState<ParsedContentTable[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("lexical");
  const [mode, setMode] = useState<"add" | "update">("add");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const snapshotFingerprint = useMemo(() => JSON.stringify(snapshot.contentIdOptions), [snapshot.contentIdOptions]);
  const [confirmationFingerprint, setConfirmationFingerprint] = useState(snapshotFingerprint);
  const previews = useMemo(() => validateContentImport(rows, snapshot, mode), [rows, snapshot, mode]);
  const included = previews.filter((preview) => preview.row.included);
  const invalid = included.filter((preview) => preview.errors.length || !preview.entry);
  const duplicates = included.filter((preview) => preview.duplicates.length && (!preview.row.duplicateConfirmed || confirmationFingerprint !== snapshotFingerprint));
  const dirty = !!rows.length || !!pendingTables.length || !!text.trim() || busy;
  const hasPendingInput = !!pendingTables.length || !!text.trim();
  const locked = disabled || busy;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => {
    setRows(clearDuplicateConfirmations);
    setConfirmationFingerprint(snapshotFingerprint);
  }, [snapshotFingerprint]);
  const append = (next: ContentImportRow[]) => {
    if (!next.length) throw new Error("No rows were found. Choose a file or paste a table or names.");
    if (rows.length + next.length > 5000) throw new Error("The preview supports up to 5,000 rows. Apply this preview before adding more input.");
    setRows((current) => [...clearDuplicateConfirmations(current), ...next]);
    setError("");
  };
  const changeRow = (next: ContentImportRow) => setRows((current) => {
    const previous = current.find((row) => row.id === next.id);
    const updated = current.map((row) => row.id === next.id ? next : row);
    return previous && (previous.values !== next.values || previous.included !== next.included) ? clearDuplicateConfirmations(updated) : updated;
  });
  const previewTables = (tables: ParsedContentTable[]) => {
    if (canPreviewContentTables(tables)) append(mapContentTables(tables, mode === "update" ? "" : kind));
    else { setPendingTables(tables); setError(""); }
  };
  const parse = () => {
    if (locked || pendingTables.length) return;
    try { previewTables(parseContentTables(text)); setText(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The pasted content could not be read."); }
  };
  const loadFile = async (file: File) => {
    if (locked || pendingTables.length) return;
    setBusy(true); setError("");
    try { previewTables(await readContentTables(file)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The file could not be read."); }
    finally { setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard this import?")) return;
    onClose();
  };
  const apply = () => {
    if (locked || hasPendingInput || !included.length || invalid.length || duplicates.length) return;
    try { onApply(included.map((preview) => preview.entry!), mode); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The changes could not be applied. Your preview is retained."); }
  };
  return <Dialog.Root open size="cover" closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Import language content</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={5}>
        <SelectField label="Import mode" value={mode} disabled={locked} options={[{ id: "add", label: "Add new entries" }, { id: "update", label: "Update existing entries by ID" }]} onChange={(value) => { setMode(value as "add" | "update"); setError(""); setRows((current) => current.map((row) => ({ ...row, duplicateConfirmed: false }))); }} />
        {mode === "update" ? <Text fontSize="sm" color="fg.muted">Use IDs from an export. Blank cells keep saved values; __CLEAR__ clears optional fields or scope restrictions. Missing rows do not delete entries.</Text> : null}
        <ContentImportInput text={text} kind={kind} busy={locked || !!pendingTables.length || rows.length >= 5000} allowDefaultCategory={mode === "add"} onText={setText} onKind={setKind} onParse={parse} onFile={(file) => void loadFile(file)} />
        {pendingTables.length ? <ContentImportMapping tables={pendingTables} disabled={locked} onChange={setPendingTables} onApply={() => {
          try { append(mapContentTables(pendingTables, mode === "update" ? "" : kind)); setPendingTables([]); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Column mapping could not be applied."); }
        }} onDiscard={() => setPendingTables([])} /> : null}
        {busy ? <Text role="status">Reading file…</Text> : null}
        {disabled ? <Text role="alert" color="fg.warning">The settings draft is read-only. Import changes are retained.</Text> : null}
        {error ? <Text role="alert" color="fg.error">{error}</Text> : null}
        {included.length && hasPendingInput ? <Text fontSize="sm" color="fg.muted">Read or discard the remaining input before applying.</Text> : null}
        {rows.length ? <>
          <ContentImportDefaults snapshot={snapshot} disabled={locked || !included.length} onApply={(values) => setRows((current) => clearDuplicateConfirmations(current).map((row) => row.included ? { ...row, values: { ...row.values, ...values } } : row))} />
          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <Text role="status" fontSize="sm">{included.length} of {rows.length} rows included · {invalid.length} with errors · {duplicates.length} duplicates to review</Text>
            <HStack><Button size="xs" variant="outline" disabled={locked} onClick={() => setRows((current) => current.map((row) => ({ ...row, included: true, duplicateConfirmed: false })))}>Include all</Button><Button size="xs" variant="outline" disabled={locked} onClick={() => setRows((current) => current.map((row) => ({ ...row, included: false, duplicateConfirmed: false })))}>Exclude all</Button></HStack>
          </HStack>
          <ContentImportTable previews={previews} mode={mode} disabled={locked} onChange={changeRow} onRemove={(id) => setRows((current) => clearDuplicateConfirmations(current.filter((row) => row.id !== id)))} />
        </> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" disabled={busy} onClick={close}>Cancel</Button><Button colorPalette="teal" disabled={locked || hasPendingInput || !included.length || !!invalid.length || !!duplicates.length} onClick={apply}>{mode === "add" ? "Add" : "Update"} {included.length} {included.length === 1 ? "entry" : "entries"} in draft</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
