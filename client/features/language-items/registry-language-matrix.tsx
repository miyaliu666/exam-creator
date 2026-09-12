import { Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import { CONTENT_KIND_LABELS, ITEM_FORMAT_LABELS, SKILL_LABELS, WORKBENCH_LABELS } from "./labels";
import { capabilityKey } from "./registry-capability";
import { SelectField, TextField } from "./registry-form-controls";
import { EMPTY_MATRIX_FILTERS, languageMatrixColumns, languageMatrixEntries, orphanedAssessmentRules, type LanguageMatrixColumn } from "./registry-language-matrix-model";
import { RegistryLanguageMatrixTable } from "./registry-language-matrix-table";
import { registrySlotName } from "./registry-reference-labels";
import type { UpdateRegistry } from "./registry-rule-editor";
import type { ContentIdOption, RegistryCapability, RegistrySnapshot } from "./types";

export interface LanguageMatrixFocus { capabilityKey: string; contextId: string; sequence: number }
const ROWS = 20;
const COLUMNS = 4;

export function RegistryLanguageMatrix({ snapshot, update, disabled, focus, onOpenEntry, onOpenRule, onOpenItemRules }: {
  snapshot: RegistrySnapshot;
  update: UpdateRegistry;
  disabled: boolean;
  focus?: LanguageMatrixFocus;
  onOpenEntry: (entry: ContentIdOption) => void;
  onOpenRule: (entry: ContentIdOption, column: LanguageMatrixColumn) => void;
  onOpenItemRules: (capability: RegistryCapability, contextId: string) => void;
}) {
  const [filters, setFilters] = useState(EMPTY_MATRIX_FILTERS);
  const [rowPage, setRowPage] = useState(0);
  const [columnPage, setColumnPage] = useState(0);
  const [selectedCell, setSelectedCell] = useState("");
  useEffect(() => {
    if (!focus) return;
    setFilters({ ...EMPTY_MATRIX_FILTERS, capabilityKey: focus.capabilityKey, contextId: focus.contextId });
    setRowPage(0); setColumnPage(0);
  }, [focus]);
  const entries = useMemo(() => languageMatrixEntries(snapshot, filters), [snapshot, filters]);
  const columns = useMemo(() => languageMatrixColumns(snapshot, filters), [snapshot, filters]);
  const orphaned = useMemo(() => orphanedAssessmentRules(snapshot), [snapshot]);
  const rowPages = Math.max(1, Math.ceil(entries.length / ROWS));
  const columnPages = Math.max(1, Math.ceil(columns.length / COLUMNS));
  const visibleRowPage = Math.min(rowPage, rowPages - 1);
  const visibleColumnPage = Math.min(columnPage, columnPages - 1);
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value, ...(["skill", "contextId"].includes(key) ? { capabilityKey: "" } : {}) }));
    setRowPage(0); setColumnPage(0);
  };
  return <Stack gap={4}>
    <Text fontWeight="semibold" fontSize="lg">Language content matrix</Text>
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      <SelectField label="Category" value={filters.kind} options={[{ id: "", label: "All categories" }, ...Object.entries(CONTENT_KIND_LABELS).filter(([id]) => id !== "supported").map(([id, label]) => ({ id, label }))]} onChange={(value) => change("kind", value)} />
      <TextField label="Search language content" value={filters.query} translate={false} onChange={(value) => change("query", value)} />
      <SelectField label="Skill" value={filters.skill} options={[{ id: "", label: "All skills" }, ...Object.entries(SKILL_LABELS).map(([id, label]) => ({ id, label }))]} onChange={(value) => change("skill", value)} />
      <SelectField label={WORKBENCH_LABELS.context} value={filters.contextId} options={[{ id: "", label: "All Contexts" }, ...snapshot.contextOptions.map(({ id, label }) => ({ id, label }))]} onChange={(value) => change("contextId", value)} />
      <SelectField label={WORKBENCH_LABELS.itemRules} value={filters.capabilityKey} options={[{ id: "", label: "All item rules" }, ...snapshot.capabilities.filter((capability) => !filters.skill || filters.skill === capability.primaryReportedSkill).map((capability) => ({ id: capabilityKey(capability), label: `${registrySlotName(snapshot, capability.blueprintSlotId)} · ${ITEM_FORMAT_LABELS[capability.itemFormatId]} · ${snapshot.canDoOptions.find((option) => option.id === capability.primaryCanDoId)?.label ?? "Missing Primary Can-do"}` }))]} onChange={(value) => change("capabilityKey", value)} />
      <Button alignSelf="end" variant="outline" onClick={() => { setFilters(EMPTY_MATRIX_FILTERS); setRowPage(0); setColumnPage(0); }}>Reset filters</Button>
    </SimpleGrid>
    {orphaned.length ? <details><summary>Assessment rules needing attention ({orphaned.length})</summary><Stack mt={3} gap={3}>
      {orphaned.map(({ entry, rule, index, reason, label }) => <HStack key={`${entry.id}:${index}`} align="start" justify="space-between"><Stack gap={1}><Button variant="plain" p={0} h="auto" whiteSpace="normal" onClick={() => onOpenEntry(entry)}>{label}</Button><Text color="fg.error" fontSize="sm">{reason}</Text><details><summary>Saved assessment rule</summary><Stack mt={2} gap={1}><Text fontSize="sm">{rule.applicability === "excluded" ? "Excluded for this combination" : "Allowed within entry scope"}</Text><Text fontSize="sm">{rule.communicativePurpose || "Communicative purpose not provided"}</Text>{rule.requiredEvidence.map((evidence, position) => <Text key={position} fontSize="sm">{evidence}</Text>)}</Stack></details></Stack><Button size="sm" variant="outline" disabled={disabled} onClick={() => update((next) => {
        const current = next.contentIdOptions.find((value) => value.id === entry.id);
        if (current?.assessmentRules?.[index] && JSON.stringify(current.assessmentRules[index]) === JSON.stringify(rule)) current.assessmentRules.splice(index, 1);
      })}>Remove rule</Button></HStack>)}
    </Stack></details> : null}
    <HStack justify="space-between" flexWrap="wrap">
      <Text fontSize="sm">{columns.length} Item rules × Context combinations</Text>
      <HStack><Button size="sm" variant="outline" disabled={!visibleColumnPage} onClick={() => setColumnPage(visibleColumnPage - 1)}>Previous columns</Button><Text fontSize="sm">{visibleColumnPage + 1} / {columnPages}</Text><Button size="sm" variant="outline" disabled={visibleColumnPage + 1 >= columnPages} onClick={() => setColumnPage(visibleColumnPage + 1)}>Next columns</Button></HStack>
    </HStack>
    <RegistryLanguageMatrixTable snapshot={snapshot} disabled={disabled} entries={entries.slice(visibleRowPage * ROWS, (visibleRowPage + 1) * ROWS)} columns={columns.slice(visibleColumnPage * COLUMNS, (visibleColumnPage + 1) * COLUMNS)} selectedCell={selectedCell} onOpenEntry={onOpenEntry} onOpenItemRules={(column) => onOpenItemRules(column.capability, column.context.id)} onOpenRule={(entry, column) => { setSelectedCell(JSON.stringify([entry.id, column.key])); onOpenRule(entry, column); }} />
    <HStack justify="space-between" flexWrap="wrap"><Text fontSize="sm">{entries.length} language entries</Text><HStack><Button size="sm" variant="outline" disabled={!visibleRowPage} onClick={() => setRowPage(visibleRowPage - 1)}>Previous rows</Button><Text fontSize="sm">{visibleRowPage + 1} / {rowPages}</Text><Button size="sm" variant="outline" disabled={visibleRowPage + 1 >= rowPages} onClick={() => setRowPage(visibleRowPage + 1)}>Next rows</Button></HStack></HStack>
  </Stack>;
}
