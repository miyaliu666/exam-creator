import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { ContentImportDefaults } from "./content-import-defaults";
import { readContentTables } from "./content-import-files";
import { ContentImportFooter } from "./content-import-footer";
import { ContentImportInput } from "./content-import-input";
import { ContentImportMapping } from "./content-import-mapping";
import { ContentImportSource } from "./content-import-source";
import { ContentImportSamples } from "./content-import-samples";
import { CONTENT_LANGUAGE_OPTIONS, contentLanguage, parseContentLanguage } from "./content-language";
import { sampleContentImportRows } from "./content-language-samples";
import { fillImportPinyin, invalidateImportPinyin } from "./content-import-pinyin";
import { canPreviewContentTables, mapContentTables, parseContentTables, validateContentImport, type ContentImportRow, type ContentImportTable as ParsedContentTable } from "./content-import-model";
import { ContentImportTable } from "./content-import-table";
import { excludeContentImportReviewRows, getContentImportBlockReason, getContentImportReview } from "./content-import-review";
import { SelectField } from "./registry-form-controls";
import type { ContentIdOption, RegistrySnapshot } from "./types";

const clearDuplicateConfirmations = (rows: ContentImportRow[]) => rows.map((row) => row.duplicateConfirmed ? { ...row, duplicateConfirmed: false } : row);

export function ContentImportDialog({ snapshot, onApply, onClose, onDirtyChange, disabled = false, initialLanguage = "zh" }: {
  snapshot: RegistrySnapshot;
  onApply: (entries: ContentIdOption[], mode: "add" | "update") => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
  initialLanguage?: string;
}) {
  const [rows, setRows] = useState<ContentImportRow[]>([]);
  const [pendingTables, setPendingTables] = useState<ParsedContentTable[]>([]);
  const [text, setText] = useState("");
  const [kind, setKind] = useState("lexical");
  const [language, setLanguage] = useState(parseContentLanguage(initialLanguage) ?? "zh");
  const [mode, setMode] = useState<"add" | "update">("add");
  const [busy, setBusy] = useState(false);
  const [autoPinyin, setAutoPinyin] = useState(true);
  const [busyText, setBusyText] = useState("Reading input…");
  const [error, setError] = useState("");
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviewRowIds, setReviewRowIds] = useState<string[]>([]);
  const [reviewRequest, setReviewRequest] = useState(0);
  const snapshotFingerprint = useMemo(() => JSON.stringify(snapshot.contentIdOptions), [snapshot.contentIdOptions]);
  const [confirmationFingerprint, setConfirmationFingerprint] = useState(snapshotFingerprint);
  const previews = useMemo(() => validateContentImport(rows, snapshot, mode), [rows, snapshot, mode]);
  const review = getContentImportReview(previews, confirmationFingerprint === snapshotFingerprint);
  const { included, invalid, duplicates, needsAttention } = review;
  const hasChinese = included.some(({ entry }) => entry && contentLanguage(entry) === "zh" && ["lexical", "character"].includes(entry.kind) && /\p{Script=Han}/u.test(entry.label));
  const dirty = !!rows.length || !!pendingTables.length || !!text.trim() || busy;
  const hasPendingInput = !!pendingTables.length || !!text.trim();
  const locked = disabled || busy;
  const blockReason = getContentImportBlockReason({ disabled, busy, busyText, hasPendingTables: !!pendingTables.length, hasPendingText: !!text.trim(), totalRows: rows.length, review, mode });
  const showReview = () => { setReviewRowIds(needsAttention.map(({ row }) => row.id)); setReviewOnly(true); setReviewRequest((current) => current + 1); };
  const excludeReview = () => {
    const ids = needsAttention.filter(({ row }) => reviewRowIds.includes(row.id)).map(({ row }) => row.id);
    setRows((current) => excludeContentImportReviewRows(current, ids, snapshot, mode));
  };
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  useEffect(() => {
    setRows(clearDuplicateConfirmations);
    setConfirmationFingerprint(snapshotFingerprint);
  }, [snapshotFingerprint]);
  const append = async (next: ContentImportRow[]) => {
    if (!next.length) throw new Error("No rows were found. Choose a file or paste a table or names.");
    if (rows.length + next.length > 5000) throw new Error("The preview supports up to 5,000 rows. Apply this preview before adding more input.");
    setError("");
    let prepared = next;
    if (autoPinyin) {
      setBusyText("Preparing preview and missing pinyin…");
      try { prepared = await fillImportPinyin(next, snapshot, mode); }
      catch (failure) { setError(`Rows loaded. Pinyin could not be generated: ${failure instanceof Error ? failure.message : "Try again."}`); }
    }
    setRows((current) => [...clearDuplicateConfirmations(current), ...prepared]);
  };
  const changeRow = (next: ContentImportRow) => setRows((current) => {
    const previous = current.find((row) => row.id === next.id);
    const safeNext = previous ? invalidateImportPinyin(previous, next) : next;
    const updated = current.map((row) => row.id === next.id ? safeNext : row);
    return previous && (previous.values !== next.values || previous.included !== next.included) ? clearDuplicateConfirmations(updated) : updated;
  });
  const previewTables = async (tables: ParsedContentTable[]) => {
    if (canPreviewContentTables(tables)) await append(mapContentTables(tables, mode === "update" ? "" : kind, mode === "update" ? "" : language));
    else { setPendingTables(tables); setError(""); }
  };
  const parse = async () => {
    if (locked || pendingTables.length) return;
    setBusy(true); setBusyText("Reading pasted input…");
    try { await previewTables(parseContentTables(text)); setText(""); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The pasted content could not be read."); }
    finally { setBusy(false); }
  };
  const loadFile = async (file: File) => {
    if (locked || pendingTables.length) return;
    setBusy(true); setBusyText("Reading file…"); setError("");
    try { await previewTables(await readContentTables(file)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The file could not be read."); }
    finally { setBusy(false); }
  };
  const fillPinyin = async () => {
    if (locked) return;
    setBusy(true); setBusyText("Generating missing pinyin…"); setError("");
    try { setRows(await fillImportPinyin(rows, snapshot, mode)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "Pinyin could not be generated. Your preview is retained."); }
    finally { setBusy(false); }
  };
  const previewSamples = async (sampleLanguage: "en" | "es") => {
    if (locked || hasPendingInput || mode !== "add") return;
    setBusy(true); setBusyText("Loading sample preview…");
    try { await append(sampleContentImportRows(sampleLanguage)); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The sample could not be loaded."); }
    finally { setBusy(false); }
  };
  const close = () => {
    if (busy) return;
    if (dirty && !window.confirm("Discard this import?")) return;
    onClose();
  };
  const apply = () => {
    if (blockReason) return;
    try { onApply(included.map((preview) => preview.entry!), mode); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The changes could not be applied. Your preview is retained."); }
  };
  return <Dialog.Root open size="cover" closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside">
    <Dialog.Backdrop /><Dialog.Positioner padding={{ base: 2, md: 4 }}><Dialog.Content maxH="100%">
      <Dialog.Header><Dialog.Title>Import language content</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        <ContentImportSource hasRows={!!rows.length} hasPendingInput={hasPendingInput} modeLabel={mode === "add" ? "Add new entries" : "Update existing entries by ID"} rowCount={rows.length}>
        <SelectField label="Import mode" value={mode} disabled={locked} options={[{ id: "add", label: "Add new entries" }, { id: "update", label: "Update existing entries by ID" }]} onChange={(value) => { setMode(value as "add" | "update"); setError(""); setRows((current) => current.map((row) => ({ ...row, duplicateConfirmed: false }))); }} />
        {mode === "update" ? <Text fontSize="sm" color="fg.muted">Use IDs from an export. Blank cells keep saved values; __CLEAR__ clears optional fields or scope restrictions. An existing entry keeps its language. Missing rows do not delete entries.</Text> : <SelectField label="Import language" value={language} disabled={locked} options={[...CONTENT_LANGUAGE_OPTIONS]} onChange={(value) => setLanguage(parseContentLanguage(value) ?? "zh")} />}
        {mode === "add" ? <Text fontSize="sm" color="fg.muted">Rows without a Language value use {CONTENT_LANGUAGE_OPTIONS.find((option) => option.id === language)?.label}. A Language column can mix Chinese, English and Spanish in one file.</Text> : null}
        <ContentImportInput text={text} kind={kind} busy={locked || !!pendingTables.length || rows.length >= 5000} allowDefaultCategory={mode === "add"} onText={setText} onKind={setKind} onParse={() => void parse()} onFile={(file) => void loadFile(file)} />
        {mode === "add" ? <ContentImportSamples disabled={locked || hasPendingInput || rows.length > 4993} onPreview={(value) => void previewSamples(value)} /> : null}
        {pendingTables.length ? <ContentImportMapping tables={pendingTables} disabled={locked} onChange={setPendingTables} onApply={async () => {
          setBusy(true);
          try { await append(mapContentTables(pendingTables, mode === "update" ? "" : kind, mode === "update" ? "" : language)); setPendingTables([]); }
          catch (failure) { setError(failure instanceof Error ? failure.message : "Column mapping could not be applied."); }
          finally { setBusy(false); }
        }} onDiscard={() => setPendingTables([])} /> : null}
        </ContentImportSource>
        {busy ? <Text role="status">{busyText}</Text> : null}
        {disabled ? <Text role="alert" color="fg.warning">The settings draft is read-only. Import changes are retained.</Text> : null}
        {error ? <Text role="alert" color="fg.error">{error}</Text> : null}
        {included.length && hasPendingInput ? <Text fontSize="sm" color="fg.muted">Read or discard the remaining input before applying.</Text> : null}
        {rows.length ? <>
          {hasChinese ? <HStack flexWrap="wrap" gap={3}><label><input type="checkbox" checked={autoPinyin} disabled={locked} onChange={(event) => setAutoPinyin(event.target.checked)} /> Generate missing pinyin for added rows</label><Button size="xs" variant="outline" disabled={locked} onClick={() => void fillPinyin()}>Fill missing pinyin</Button><Text fontSize="xs" color="fg.muted">Review and edit pinyin in the preview.</Text></HStack> : null}
          <ContentImportDefaults snapshot={snapshot} disabled={locked || !included.length} onApply={(values) => setRows((current) => clearDuplicateConfirmations(current).map((row) => row.included ? { ...row, values: { ...row.values, ...values } } : row))} />
          <HStack flexWrap="wrap" gap={3}>
            <Text role="status" fontSize="sm">{included.length} of {rows.length} rows included · {invalid.length} with errors · {duplicates.length} same-name rows to review</Text>
            <HStack><Button size="xs" variant="outline" disabled={locked} onClick={() => setRows((current) => current.map((row) => ({ ...row, included: true, duplicateConfirmed: false })))}>Include all</Button><Button size="xs" variant="outline" disabled={locked} onClick={() => setRows((current) => current.map((row) => ({ ...row, included: false, duplicateConfirmed: false })))}>Exclude all</Button></HStack>
          </HStack>
          <ContentImportTable previews={previews} mode={mode} disabled={locked} reviewOnly={reviewOnly} reviewIds={reviewRowIds} pendingReviewIds={needsAttention.map(({ row }) => row.id)} reviewRequest={reviewRequest} onShowAll={() => setReviewOnly(false)} onExcludeReview={excludeReview} onChange={changeRow} onRemove={(id) => setRows((current) => clearDuplicateConfirmations(current.filter((row) => row.id !== id)))} />
        </> : null}
      </Stack></Dialog.Body>
      <ContentImportFooter mode={mode} count={included.length} reason={blockReason} reviewCount={needsAttention.length} busy={busy} onReview={showReview} onApply={apply} onClose={close} />
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
