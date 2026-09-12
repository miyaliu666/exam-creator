import { Button, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { ContentCatalogFilterFields } from "./content-catalog-filters";
import { filterContentEntries, newContentEntry, type ContentCatalogFilters } from "./content-catalog-model";
import { ContentCatalogTable } from "./content-catalog-table";
import { ContentEntryDialog } from "./content-entry-dialog";
import { ContentImportDialog } from "./content-import-dialog";
import { downloadContentTemplate, exportContentEntries } from "./content-import-files";
import { SelectField } from "./registry-form-controls";
import type { UpdateRegistry } from "./registry-rule-editor";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentCatalog({ snapshot, update, disabled, onStagedDirtyChange }: {
  snapshot: RegistrySnapshot;
  update: UpdateRegistry;
  disabled: boolean;
  onStagedDirtyChange?: (dirty: boolean) => void;
}) {
  const [filters, setFilters] = useState<ContentCatalogFilters>({ kind: "lexical", query: "", mastery: "all", canDoId: "", contextId: "" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<{ entry: ContentIdOption; isNew: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const filtered = useMemo(() => filterContentEntries(snapshot.contentIdOptions, filters), [snapshot.contentIdOptions, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleEntries = filtered.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  useEffect(() => () => { onStagedDirtyChange?.(false); }, [onStagedDirtyChange]);
  const close = () => { setEditing(null); setImporting(false); onStagedDirtyChange?.(false); };
  const apply = (entries: ContentIdOption[], mode: "add" | "update") => {
    if (disabled) throw new Error("Open your own settings draft before applying language content changes.");
    const current = new Map(snapshot.contentIdOptions.map((entry) => [entry.id, entry]));
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("The input contains repeated entry IDs.");
    for (const entry of entries) {
      if (mode === "add" && current.has(entry.id)) throw new Error("An entry with this ID is already in the draft. Choose update mode to change it.");
      if (mode === "update" && (!current.has(entry.id) || current.get(entry.id)?.kind !== entry.kind)) throw new Error("An entry is missing or its category changed. Review the input against the current draft.");
    }
    update((next) => {
      if (mode === "add") next.contentIdOptions.push(...structuredClone(entries));
      else {
        const changes = new Map(entries.map((entry) => [entry.id, entry]));
        next.contentIdOptions = next.contentIdOptions.map((entry) => changes.has(entry.id) ? { ...entry, ...structuredClone(changes.get(entry.id)!) } : entry);
      }
    });
    setNotice(`${entries.length} ${entries.length === 1 ? "entry" : "entries"} ${mode === "add" ? "added to" : "updated in"} draft.`);
    close();
  };
  const download = async (template: false | "xlsx" | "markdown") => {
    setDownloadBusy(true); setError("");
    try { if (template) await downloadContentTemplate(snapshot, template); else await exportContentEntries(filtered, snapshot); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The download could not be prepared."); }
    finally { setDownloadBusy(false); }
  };
  return <Stack gap={4}>
    <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
      <Text fontWeight="semibold" fontSize="lg">Language content</Text>
      <HStack flexWrap="wrap" gap={2}>
        <Button size="sm" colorPalette="teal" disabled={disabled} onClick={() => { setError(""); setEditing({ entry: newContentEntry(filters.kind || "lexical"), isNew: true }); }}>New entry</Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setError(""); setImporting(true); }}>Import</Button>
        <Menu.Root><Menu.Trigger asChild><Button size="sm" variant="outline" disabled={downloadBusy}>Download template</Button></Menu.Trigger><Portal><Menu.Positioner><Menu.Content><Menu.Item value="xlsx" onClick={() => void download("xlsx")}>Excel (.xlsx)</Menu.Item><Menu.Item value="markdown" onClick={() => void download("markdown")}>Markdown (.md)</Menu.Item></Menu.Content></Menu.Positioner></Portal></Menu.Root>
        <Button size="sm" variant="outline" disabled={downloadBusy || !filtered.length} onClick={() => void download(false)}>Export</Button>
      </HStack>
    </HStack>
    {error ? <Text role="alert" color="fg.error">{error}</Text> : null}
    {notice ? <Text role="status" fontSize="sm" color="fg.success">{notice}</Text> : null}
    <ContentCatalogFilterFields filters={filters} snapshot={snapshot} onChange={(next) => { setFilters(next); setPage(0); }} />
    <ContentCatalogTable entries={visibleEntries} snapshot={snapshot} disabled={disabled} showCategory={!filters.kind} onOpen={(entry) => setEditing({ entry, isNew: false })} />
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <Text fontSize="sm" color="fg.muted">{filtered.length ? `${visiblePage * pageSize + 1}–${Math.min((visiblePage + 1) * pageSize, filtered.length)}` : "0"} of {filtered.length} entries</Text>
      <HStack gap={3}><SelectField label="Rows per page" value={String(pageSize)} options={[25, 50, 100].map((value) => ({ id: String(value), label: String(value) }))} onChange={(value) => { setPageSize(Number(value)); setPage(0); }} /><Button size="sm" variant="outline" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous</Button><Text fontSize="sm" whiteSpace="nowrap">Page {visiblePage + 1} of {pageCount}</Text><Button size="sm" variant="outline" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next</Button></HStack>
    </HStack>
    {editing ? <ContentEntryDialog key={editing.entry.id} initialEntry={editing.entry} isNew={editing.isNew} snapshot={snapshot} disabled={disabled} onApply={(entry) => apply([entry], editing.isNew ? "add" : "update")} onClose={close} onOpenExisting={(entry) => setEditing({ entry, isNew: false })} onDirtyChange={onStagedDirtyChange} /> : null}
    {importing ? <ContentImportDialog snapshot={snapshot} onApply={apply} onClose={close} onDirtyChange={onStagedDirtyChange} disabled={disabled} /> : null}
  </Stack>;
}
