import { Box, Button, Dialog, HStack, Input, SimpleGrid, Stack, Table, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { EXERCISE_TEMPLATES, exerciseTemplateName } from "./exercise-template-catalog";
import { ExerciseSettingsDetail } from "./exercise-settings-detail";
import { ExerciseSettingsLibrary } from "./exercise-settings-library";
import { ExerciseSettingsTemplateSelect } from "./exercise-settings-template-select";
import { exerciseRuleIssues, exerciseRuleSearchText, EXERCISE_SCORING_METHODS, newExerciseRule } from "./exercise-settings-model";
import { FilterSelect } from "./filter-select";
import { DOMAIN_LABELS, SKILL_LABELS, exerciseLabel } from "./labels";
import { capabilityKey } from "./registry-capability";
import { registryDisplayText } from "./registry-display-text";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { ExerciseTemplateRule, RegistryCapability } from "./types";

const EMPTY_FILTERS = { query: "", canDo: "", template: "", skill: "", domain: "" };

export function ExerciseSettingsWorkspace({ snapshot, update, disabled, onEditCanDo, onEditLegacy, onStagedDirtyChange, requestedRule, actions, onViewContent }: SharedRegistryEditorProps & {
  onEditCanDo: (id?: string) => void; onEditLegacy: (capability: RegistryCapability) => void; onStagedDirtyChange: (dirty: boolean) => void;
  requestedRule?: { id: string; sequence: number };
  actions?: ReactNode;
  onViewContent?: (ruleId: string, contextId?: string) => void;
}) {
  const [view, setView] = useState("rules");
  const [legacyOpen, setLegacyOpen] = useState(() => !(snapshot.exerciseTemplateRules ?? []).length);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState<{ rule: ExerciseTemplateRule; isNew: boolean }>();
  const [removing, setRemoving] = useState<{ rule: ExerciseTemplateRule; baseline: string }>();
  const [pendingRule, setPendingRule] = useState<string>();
  const stagedDirty = useRef(false);
  const handledRequest = useRef<number | undefined>(undefined);
  const reportDirty = useCallback((dirty: boolean) => { stagedDirty.current = dirty; onStagedDirtyChange(dirty); }, [onStagedDirtyChange]);
  useEffect(() => {
    if (!requestedRule || requestedRule.sequence === handledRequest.current) return;
    handledRequest.current = requestedRule.sequence;
    if (selected?.rule.id === requestedRule.id) return;
    const rule = snapshot.exerciseTemplateRules?.find((entry) => entry.id === requestedRule.id);
    if (!rule) return;
    if (stagedDirty.current) setPendingRule(rule.id);
    else setSelected({ rule: structuredClone(rule), isNew: false });
  }, [requestedRule, selected, snapshot]);
  const rules = snapshot.exerciseTemplateRules ?? [];
  const rows = useMemo(() => rules.filter((rule) => {
    const canDo = snapshot.canDoOptions.find((entry) => entry.id === rule.primaryCanDoId);
    return (!filters.canDo || rule.primaryCanDoId === filters.canDo) && (!filters.template || rule.exerciseType === filters.template)
      && (!filters.skill || canDo?.primarySkill === filters.skill) && (!filters.domain || rule.allowedDomains.includes(filters.domain))
      && filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every((word) => exerciseRuleSearchText(snapshot, rule).includes(word));
  }), [rules, snapshot, filters]);
  const add = (exerciseType = "") => setSelected({ rule: newExerciseRule(snapshot, exerciseType), isNew: true });
  const legacy = snapshot.capabilities.filter((entry) => !entry.itemFormatId.startsWith("EXERCISE:"));
  const closeDetail = () => { setSelected(undefined); reportDirty(false); setView("rules"); };

  return <Stack gap={4}>
    {pendingRule ? <Stack role="alert" borderWidth="1px" borderRadius="md" p={3}><Text>Discard unapplied changes and open the requested item rules?</Text><HStack>
      <Button size="sm" colorPalette="red" onClick={() => { const rule = snapshot.exerciseTemplateRules?.find((entry) => entry.id === pendingRule); if (rule) { reportDirty(false); setSelected({ rule: structuredClone(rule), isNew: false }); } setPendingRule(undefined); }}>Discard and open item rules</Button>
      <Button size="sm" variant="outline" onClick={() => setPendingRule(undefined)}>Keep editing</Button>
    </HStack></Stack> : null}
    <div hidden={!!selected}>
      <Stack gap={4}>
        <HStack justify="space-between" flexWrap="wrap" gap={3}>
          <HStack gap={2} role="group" aria-label="Item rule views">
            <Button size="sm" aria-pressed={view === "rules"} variant={view === "rules" ? "subtle" : "outline"} onClick={() => setView("rules")}>Configured rules</Button>
            <Button size="sm" aria-pressed={view === "templates"} variant={view === "templates" ? "subtle" : "outline"} onClick={() => setView("templates")}>Exercise templates ({EXERCISE_TEMPLATES.length})</Button>
          </HStack>
          {actions}
        </HStack>
        <div hidden={view !== "rules"}><Stack gap={4}>
          <HStack justify="space-between" gap={3} flexWrap="wrap">
            <Text fontSize="sm" color="fg.muted">{rules.length ? "One Can-do and exercise template per row. Shared across Chinese, English and Spanish." : "No exercise template rules yet."}</Text>
            <HStack>{rules.length ? <Button size="sm" variant="plain" onClick={() => setFilters(EMPTY_FILTERS)}>Reset filters</Button> : null}<Button size="sm" colorPalette="teal" disabled={disabled} onClick={() => add()}>Add item rules</Button></HStack>
          </HStack>
          {rules.length ? <><SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
            <Stack gap={1}><Text fontSize="sm">Search exercise template rules</Text><Input aria-label="Search exercise template rules" value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} /></Stack>
            <FilterSelect label="Can-do" value={filters.canDo} options={snapshot.canDoOptions.map((entry) => ({ id: entry.id, label: registryDisplayText(entry.label) }))} onChange={(value) => setFilters((current) => ({ ...current, canDo: value }))} />
            <ExerciseSettingsTemplateSelect filter value={filters.template} onChange={(value) => setFilters((current) => ({ ...current, template: value }))} />
          </SimpleGrid>
          <details><Text as="summary" fontSize="sm" cursor="pointer">More filters</Text><SimpleGrid columns={{ base: 1, md: 2 }} mt={3} gap={3}>
            <FilterSelect label="Skill" value={filters.skill} options={Object.entries(SKILL_LABELS).map(([id, label]) => ({ id, label }))} onChange={(value) => setFilters((current) => ({ ...current, skill: value }))} />
            <FilterSelect label="Domain" value={filters.domain} options={snapshot.allowedDomains.map((id) => ({ id, label: DOMAIN_LABELS[id] ?? id }))} onChange={(value) => setFilters((current) => ({ ...current, domain: value }))} />
          </SimpleGrid></details></> : null}
          {rules.length ? <>
            <Text fontSize="sm" color="fg.muted">{rows.length} exercise template {rows.length === 1 ? "rule" : "rules"}</Text>
            <Box overflowX="auto" maxH="70vh" borderWidth="1px" borderRadius="lg"><Table.Root size="sm" stickyHeader minW="1040px" aria-label="Exercise item rules overview">
            <Table.Header><Table.Row><Table.ColumnHeader>Can-do</Table.ColumnHeader><Table.ColumnHeader>Exercise template</Table.ColumnHeader><Table.ColumnHeader>Allowed Domains</Table.ColumnHeader><Table.ColumnHeader>Difficulty</Table.ColumnHeader><Table.ColumnHeader>Scoring</Table.ColumnHeader><Table.ColumnHeader>Actions</Table.ColumnHeader></Table.Row></Table.Header>
            <Table.Body>{rows.map((rule) => {
              const canDo = snapshot.canDoOptions.find((entry) => entry.id === rule.primaryCanDoId);
              const issues = exerciseRuleIssues(snapshot, rule);
              return <Table.Row key={rule.id} verticalAlign="top">
                <Table.Cell maxW="280px"><Stack gap={1}><Text fontWeight="medium">{registryDisplayText(canDo?.label ?? "Missing Can-do")}</Text><Text fontSize="xs" color="fg.muted">{SKILL_LABELS[canDo?.primarySkill ?? ""] ?? canDo?.primarySkill ?? "Skill not set"} · {canDo?.activity ?? "Activity not set"}</Text>
                  {issues.map((issue) => <Text key={issue} fontSize="xs" color="fg.error">{issue}</Text>)}
                </Stack></Table.Cell>
                <Table.Cell><Stack gap={1}><Text>{exerciseTemplateName(rule.exerciseType)}</Text>{!rule.enabled ? <Text fontSize="xs" color="fg.muted">Disabled for new items</Text> : null}</Stack></Table.Cell>
                <Table.Cell>{rule.allowedDomains.map((id) => DOMAIN_LABELS[id] ?? id).join(", ") || "None selected"}</Table.Cell>
                <Table.Cell>{rule.difficultyStandards.map((entry) => registryDisplayText(entry.label)).join(", ") || "No profiles"}</Table.Cell>
                <Table.Cell>{EXERCISE_SCORING_METHODS.find((entry) => entry.id === rule.scoring.method)?.label ?? "Unknown method"}</Table.Cell>
                <Table.Cell><HStack gap={1} flexWrap="wrap">
                  <Button size="xs" variant="outline" colorPalette="teal" onClick={() => setSelected({ rule: structuredClone(rule), isNew: false })}>{disabled ? "View" : "Edit"}</Button>
                  <Button size="xs" variant="outline" onClick={() => onViewContent?.(rule.id)}>View content</Button>
                  <Button size="xs" variant="outline" disabled={disabled} onClick={() => setSelected({ rule: { ...structuredClone(rule), id: `exercise-rule-${crypto.randomUUID()}`, primaryCanDoId: "" }, isNew: true })}>Copy</Button>
                  <Button size="xs" variant="plain" colorPalette="red" disabled={disabled} onClick={() => setRemoving({ rule: structuredClone(rule), baseline: JSON.stringify(snapshot) })}>Remove</Button>
                </HStack></Table.Cell>
              </Table.Row>;
            })}</Table.Body>
            </Table.Root></Box>
          </> : null}
          {rules.length && !rows.length ? <Text color="fg.muted">No exercise template rules match these filters.</Text> : null}
          {legacy.length ? <details open={legacyOpen} onToggle={(event) => setLegacyOpen(event.currentTarget.open)}><Text as="summary" cursor="pointer" fontSize="sm">Existing item rules ({legacy.length})</Text><Stack gap={3} mt={3}>
            <Text fontSize="sm" color="fg.muted">Existing rules retain their saved task, scoring, Context, difficulty and review requirements. Open a rule to inspect or repair it.</Text>
            <Box overflowX="auto" borderWidth="1px" borderRadius="md"><Table.Root size="sm" aria-label="Existing item rules">
              <Table.Header><Table.Row><Table.ColumnHeader>Can-do</Table.ColumnHeader><Table.ColumnHeader>Exercise template</Table.ColumnHeader><Table.ColumnHeader>Action</Table.ColumnHeader></Table.Row></Table.Header>
              <Table.Body>{legacy.map((entry, index) => <Table.Row key={`${capabilityKey(entry)}-${index}`}><Table.Cell><Stack gap={1}><Text>{registryDisplayText(snapshot.canDoOptions.find((canDo) => canDo.id === entry.primaryCanDoId)?.label ?? "Missing Can-do")}</Text><Text fontSize="xs" color="fg.muted">{registryDisplayText(entry.observableEvidence)}</Text></Stack></Table.Cell>
                <Table.Cell>{exerciseLabel(entry.itemFormatId, entry.primaryReportedSkill)}</Table.Cell><Table.Cell><HStack gap={1} flexWrap="wrap"><Button size="xs" variant="outline" onClick={() => onEditLegacy(entry)}>{disabled ? "View saved rules" : "Edit saved rules"}</Button><Button size="xs" variant="outline" onClick={() => onViewContent?.(entry.itemRuleId, entry.allowedContextIds[0])}>View content</Button></HStack></Table.Cell></Table.Row>)}</Table.Body>
            </Table.Root></Box>
          </Stack></details> : null}
        </Stack></div>
        <div hidden={view !== "templates"}><ExerciseSettingsLibrary snapshot={snapshot} disabled={disabled} onConfigure={add} /></div>
      </Stack>
    </div>
    {selected ? <ExerciseSettingsDetail key={selected.rule.id} snapshot={snapshot} update={update} disabled={disabled} rule={selected.rule} isNew={selected.isNew} onClose={closeDetail} onEditCanDo={onEditCanDo} onStagedDirtyChange={reportDirty} /> : null}
    {removing ? <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && setRemoving(undefined)}><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Remove item rules</Dialog.Title></Dialog.Header><Dialog.Body><Stack gap={3}>
        <Text>Remove {exerciseTemplateName(removing.rule.exerciseType)} for {registryDisplayText(snapshot.canDoOptions.find((entry) => entry.id === removing.rule.primaryCanDoId)?.label ?? "this Can-do")} from this draft?</Text>
        <Text fontSize="sm" color="fg.muted">Published settings and items using earlier versions keep their original rules.</Text>
        {removing.baseline !== JSON.stringify(snapshot) ? <Text role="alert" color="fg.error">Settings changed. Close this dialog and review the current row.</Text> : null}
      </Stack></Dialog.Body><Dialog.Footer><Button variant="outline" onClick={() => setRemoving(undefined)}>Cancel</Button><Button colorPalette="red" disabled={disabled || removing.baseline !== JSON.stringify(snapshot)} onClick={() => {
        if (disabled || removing.baseline !== JSON.stringify(snapshot)) return;
        update((next) => { if (JSON.stringify(next) === removing.baseline) next.exerciseTemplateRules = (next.exerciseTemplateRules ?? []).filter((entry) => entry.id !== removing.rule.id); });
        setRemoving(undefined);
      }}>Remove from draft</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner></Dialog.Root> : null}
  </Stack>;
}
