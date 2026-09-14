import { Button, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { ContentCatalogFilterFields } from "./content-catalog-filters";
import { filterContentEntries, newContentEntry, type ContentCatalogFilters } from "./content-catalog-model";
import { ContentCatalogTable } from "./content-catalog-table";
import { ContentBulkDialog } from "./content-bulk-dialog";
import { contentBulkSnapshotKey, currentContentSelection } from "./content-bulk-model";
import { ContentEntryDialog } from "./content-entry-dialog";
import { ContentImportDialog } from "./content-import-dialog";
import { ContentLanguageOverview } from "./content-language-overview";
import { isContentOptionCompatible } from "./content-compatibility";
import { contentLanguage } from "./content-language";
import { exerciseTemplateName } from "./exercise-template-catalog";
import { downloadContentTemplate, exportContentEntries } from "./content-import-files";
import { SelectField } from "./registry-form-controls";
import { registryItemRuleName } from "./registry-reference-labels";
import type { UpdateRegistry } from "./registry-rule-editor";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export interface ContentRuleFocus { ruleId: string; contextId?: string }

export function ContentCatalog({ snapshot, update, disabled, published, onStagedDirtyChange, focus, onClearFocus }: {
  snapshot: RegistrySnapshot;
  update: UpdateRegistry;
  disabled: boolean;
  published?: boolean;
  onStagedDirtyChange?: (dirty: boolean) => void;
  focus?: ContentRuleFocus;
  onClearFocus?: () => void;
}) {
  const [filters, setFilters] = useState<ContentCatalogFilters>({ kind: "", language: focus ? "zh" : "", query: "", mastery: "all", canDoId: "" });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [editing, setEditing] = useState<{ entry: ContentIdOption; isNew: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionVersion, setSelectionVersion] = useState(snapshot.bundleVersion);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusContext, setFocusContext] = useState(focus?.contextId ?? "");
  useEffect(() => {
    setFocusContext(focus?.contextId ?? "");
    setFilters((current) => ({ kind: "", language: focus ? current.language || "zh" : "", query: "", mastery: "all", canDoId: "" }));
    setPage(0);
  }, [focus?.ruleId, focus?.contextId]);
  const sourceRule = snapshot.exerciseTemplateRules?.find((rule) => rule.id === focus?.ruleId);
  const savedCapability = snapshot.capabilities.find((entry) => entry.itemRuleId === focus?.ruleId);
  const canDo = sourceRule && snapshot.canDoOptions.find((entry) => entry.id === sourceRule.primaryCanDoId);
  const capability = sourceRule ? (canDo ? {
    itemRuleId: sourceRule.id, itemFormatId: `EXERCISE:${sourceRule.exerciseType}`,
    primaryCanDoId: sourceRule.primaryCanDoId, supportingCanDoIds: [], primaryReportedSkill: canDo.primarySkill ?? "",
  } : undefined) : savedCapability;
  const contexts = focus && capability ? snapshot.contextOptions.filter((entry) => !entry.retired && entry.primaryDomains.length === 1
    && entry.canDoIds.includes(capability.primaryCanDoId)
    && (sourceRule ? sourceRule.allowedDomains.includes(entry.primaryDomains[0]) && (!sourceRule.allowedContextIds.length || sourceRule.allowedContextIds.includes(entry.id))
      : savedCapability?.allowedContextIds.includes(entry.id))) : [];
  const contextOptions = sourceRule && !sourceRule.allowedContextIds.length
    ? [{ id: "", label: "No predefined Context" }, ...contexts] : contexts;
  const selectedContext = contextOptions.some((entry) => entry.id === focusContext) ? focusContext : contextOptions[0]?.id ?? "";
  const availableEntries = useMemo(() => !focus ? snapshot.contentIdOptions : snapshot.contentIdOptions.filter((entry) =>
    !!capability && !!contextOptions.length && isContentOptionCompatible(entry, capability, selectedContext, contentLanguage(entry))),
  [snapshot, focus, capability, contextOptions.length, selectedContext]);
  const filtered = useMemo(() => filterContentEntries(availableEntries, filters), [availableEntries, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const visibleEntries = filtered.slice(visiblePage * pageSize, (visiblePage + 1) * pageSize);
  const selection = disabled || selectionVersion !== snapshot.bundleVersion ? [] : currentContentSelection(selectedIds, filtered);
  useEffect(() => { setSelectedIds([]); setSelectionVersion(snapshot.bundleVersion); }, [disabled, snapshot.bundleVersion]);
  useEffect(() => () => { onStagedDirtyChange?.(false); }, [onStagedDirtyChange]);
  const close = () => { setEditing(null); setImporting(false); setBulkEditing(false); onStagedDirtyChange?.(false); };
  const apply = (entries: ContentIdOption[], mode: "add" | "update", baselineKey?: string) => {
    if (disabled) throw new Error("Open your own settings draft before applying language content changes.");
    const current = new Map(snapshot.contentIdOptions.map((entry) => [entry.id, entry]));
    if (new Set(entries.map((entry) => entry.id)).size !== entries.length) throw new Error("The input contains repeated entry IDs.");
    for (const entry of entries) {
      if (mode === "add" && current.has(entry.id)) throw new Error("An entry with this ID is already in the draft. Choose update mode to change it.");
      if (mode === "update" && (!current.has(entry.id) || current.get(entry.id)?.kind !== entry.kind)) throw new Error("An entry is missing or its category changed. Review the input against the current draft.");
    }
    update((next) => {
      if (baselineKey && contentBulkSnapshotKey(next) !== baselineKey) throw new Error("Settings changed. Reopen bulk edit against the current draft.");
      if (mode === "add") next.contentIdOptions.push(...structuredClone(entries));
      else {
        const changes = new Map(entries.map((entry) => [entry.id, entry]));
        next.contentIdOptions = next.contentIdOptions.map((entry) => changes.has(entry.id) ? { ...entry, ...structuredClone(changes.get(entry.id)!) } : entry);
      }
    });
    setNotice(`${entries.length} ${entries.length === 1 ? "entry" : "entries"} ${mode === "add" ? "added to" : "updated in"} draft.`);
    setSelectedIds([]);
    close();
  };
  const download = async (template: false | "xlsx" | "markdown") => {
    setDownloadBusy(true); setError("");
    try { if (template) await downloadContentTemplate(snapshot, template); else await exportContentEntries(filtered, snapshot); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "The download could not be prepared."); }
    finally { setDownloadBusy(false); }
  };
  return <Stack gap={4}>
    {focus ? <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <Stack gap={1}><Text fontWeight="semibold">Available content for {sourceRule ? `${exerciseTemplateName(sourceRule.exerciseType)} · ${canDo?.label ?? "Missing Can-do"}` : savedCapability ? registryItemRuleName(snapshot, savedCapability.itemRuleId) : "unavailable item rules"}</Text>
        <Text fontSize="sm" color="fg.muted">Showing entries compatible with this item rule. {published && disabled ? "Select Edit settings to add or import content." : "Add or import content here when needed."}</Text></Stack>
      <Button size="sm" variant="outline" onClick={onClearFocus}>Show all content</Button>
    </HStack> : null}
    {focus && contextOptions.length > 1 ? <SelectField label="Context" value={selectedContext} options={contextOptions} onChange={setFocusContext} /> : null}
    {focus && !contextOptions.length ? <Text role="alert" color="fg.error">This item rule has no available Context. Repair its Context settings to see compatible content.</Text> : null}
    <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
      <Text fontWeight="semibold" fontSize="lg">Directory</Text>
      <HStack flexWrap="wrap" gap={2}>
        <Button size="sm" colorPalette="teal" disabled={disabled} onClick={() => { setError(""); setEditing({ entry: newContentEntry(filters.kind || "lexical", filters.language || "zh"), isNew: true }); }}>New entry</Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => { setError(""); setImporting(true); }}>Import</Button>
        <Menu.Root><Menu.Trigger asChild><Button size="sm" variant="outline" disabled={downloadBusy}>Download template</Button></Menu.Trigger><Portal><Menu.Positioner><Menu.Content><Menu.Item value="xlsx" onClick={() => void download("xlsx")}>Excel (.xlsx)</Menu.Item><Menu.Item value="markdown" onClick={() => void download("markdown")}>Markdown (.md)</Menu.Item></Menu.Content></Menu.Positioner></Portal></Menu.Root>
        <Button size="sm" variant="outline" disabled={downloadBusy || !filtered.length} onClick={() => void download(false)}>Export</Button>
      </HStack>
    </HStack>
    {published && disabled ? <Text fontSize="sm" color="fg.muted" role="note">This published version is read-only. Select Edit settings above to add or import language content. Save the draft and select Use for new items to make changes available in Language coverage.</Text> : null}
    {error ? <Text role="alert" color="fg.error">{error}</Text> : null}
    {notice ? <Text role="status" fontSize="sm" color="fg.success">{notice}</Text> : null}
    <ContentLanguageOverview entries={availableEntries} selected={filters.language ?? ""} onSelect={(language) => { setFilters((current) => ({ ...current, language })); setPage(0); setSelectedIds([]); }} />
    <ContentCatalogFilterFields filters={filters} snapshot={snapshot} onChange={(next) => { setFilters(next); setPage(0); setSelectedIds([]); }} />
    {selection.length ? <HStack flexWrap="wrap" gap={3}><Text fontSize="sm" role="status">{selection.length} selected across {filtered.length} filtered entries</Text><Button size="sm" variant="outline" disabled={disabled || selection.length === filtered.length} onClick={() => setSelectedIds(filtered.map((entry) => entry.id))}>Select all {filtered.length} filtered entries</Button><Button size="sm" colorPalette="teal" disabled={disabled} onClick={() => setBulkEditing(true)}>Edit selected</Button><Button size="sm" variant="plain" onClick={() => setSelectedIds([])}>Clear selection</Button></HStack> : null}
    <ContentCatalogTable entries={visibleEntries} snapshot={snapshot} disabled={disabled} showCategory={!filters.kind} onOpen={(entry) => setEditing({ entry, isNew: false })} selectedIds={selection} onSelect={(id, selected) => setSelectedIds(selected ? [...selection, id] : selection.filter((value) => value !== id))} onSelectPage={(selected) => setSelectedIds(selected ? [...new Set([...selection, ...visibleEntries.map((entry) => entry.id)])] : selection.filter((id) => !visibleEntries.some((entry) => entry.id === id)))} />
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <Text fontSize="sm" color="fg.muted">{filtered.length ? `${visiblePage * pageSize + 1}–${Math.min((visiblePage + 1) * pageSize, filtered.length)}` : "0"} of {filtered.length} entries</Text>
      <HStack gap={3}><SelectField label="Rows per page" value={String(pageSize)} options={[25, 50, 100].map((value) => ({ id: String(value), label: String(value) }))} onChange={(value) => { setPageSize(Number(value)); setPage(0); }} /><Button size="sm" variant="outline" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous</Button><Text fontSize="sm" whiteSpace="nowrap">Page {visiblePage + 1} of {pageCount}</Text><Button size="sm" variant="outline" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next</Button></HStack>
    </HStack>
    {editing ? <ContentEntryDialog key={editing.entry.id} initialEntry={editing.entry} isNew={editing.isNew} snapshot={snapshot} disabled={disabled} onApply={(entry) => apply([entry], editing.isNew ? "add" : "update")} onClose={close} onOpenExisting={(entry) => setEditing({ entry, isNew: false })} onDirtyChange={onStagedDirtyChange} /> : null}
    {importing ? <ContentImportDialog snapshot={snapshot} initialLanguage={filters.language || "zh"} onApply={apply} onClose={close} onDirtyChange={onStagedDirtyChange} disabled={disabled} /> : null}
    {bulkEditing ? <ContentBulkDialog selectedIds={selection} snapshot={snapshot} disabled={disabled} onApply={(entries, baselineKey) => apply(entries, "update", baselineKey)} onClose={close} onDirtyChange={onStagedDirtyChange} /> : null}
  </Stack>;
}
