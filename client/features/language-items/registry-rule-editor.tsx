import {
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  DOMAIN_LABELS,
  ITEM_FORMAT_LABELS,
  WORKBENCH_LABELS,
} from "./labels";
import { ContentCatalog } from "./content-catalog";
import { ContentEntryDialog } from "./content-entry-dialog";
import { ContentAssessmentRuleDialog } from "./content-assessment-rule-dialog";
import { replaceContentAssessmentRule } from "./content-assessment-rules";
import { RegistryRulesOverview } from "./registry-rules-overview";
import { RegistryLanguageMatrix, type LanguageMatrixFocus } from "./registry-language-matrix";
import { capabilityKey, domainsForCapability } from "./registry-capability";
import { RegistryBlueprintEditor } from "./registry-blueprint-editor";
import { RegistryDifficultyEditor } from "./registry-difficulty-editor";
import { RegistryMultiSelect } from "./registry-multi-select";
import { ReferenceSourcesPanel } from "./reference-sources-panel";
import { registryDisplayText } from "./registry-display-text";
import { createRegistryTextFormatter, RegistryTextContext, registryReferenceName, registrySlotName } from "./registry-reference-labels";
import type {
  ContentIdOption,
  RegistryCapability,
  RegistrySnapshot,
  ScoringContractSummary,
  ScoringPolicySummary,
} from "./types";
import {
  ReadOnlyField,
  InvalidSelections,
  SelectField,
  TextField,
  TextListField,
  type FormOption,
} from "./registry-form-controls";

export type UpdateRegistry = (mutate: (snapshot: RegistrySnapshot) => void) => void;

function uniqueOptions(values: string[]): FormOption[] {
  return [...new Set(values)].map((value) => ({ id: value, label: value }));
}

function nameExists(entries: FormOption[], label: string, exceptId?: string) {
  const normalize = (value: string) => registryDisplayText(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return entries.some((entry) => entry.id !== exceptId && normalize(entry.label) === normalize(label));
}

function CanDoEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const [selectedId, setSelectedId] = useState(snapshot.canDoOptions[0]?.id ?? "");
  const [newLabel, setNewLabel] = useState("");
  const [newSkill, setNewSkill] = useState("Reading");
  const [newActivity, setNewActivity] = useState("Reception");
  const index = Math.max(0, snapshot.canDoOptions.findIndex((entry) => entry.id === selectedId));
  const entry = snapshot.canDoOptions[index];
  const addCanDo = () => {
    const label = newLabel.trim();
    if (!label || nameExists(snapshot.canDoOptions, label)) return;
    const id = `A1-CUSTOM-${crypto.randomUUID()}`;
    update((next) => next.canDoOptions.push({
      id,
      label,
      primarySkill: newSkill,
      activity: newActivity,
    }));
    setSelectedId(id);
    setNewLabel("");
  };
  const removeCanDo = () => {
    if (!entry) return;
    const referenced = snapshot.capabilities.some((candidate) =>
      candidate.primaryCanDoId === entry.id || candidate.supportingCanDoIds?.includes(entry.id)
    ) || snapshot.contextOptions.some((context) => context.canDoIds.includes(entry.id))
      || snapshot.contentIdOptions.some((content) => content.canDoIds.includes(entry.id));
    if (referenced) {
      window.alert("This Can-do is still referenced. Remove those references before deleting it.");
      return;
    }
    if (!window.confirm(`Delete “${registryDisplayText(entry.label)}”?`)) return;
    update((next) => { next.canDoOptions = next.canDoOptions.filter((candidate) => candidate.id !== entry.id); });
    setSelectedId(snapshot.canDoOptions.find((candidate) => candidate.id !== entry.id)?.id ?? "");
  };
  return (
    <Stack gap={4}>
      {!disabled ? (
        <SimpleGrid columns={{ base: 1, md: 4 }} gap={3} alignItems="end">
          <Box><Text fontSize="sm" fontWeight="medium" mb={1}>New Can-do</Text><Input aria-label="New Can-do" value={newLabel} onChange={(event) => setNewLabel(event.target.value)} /></Box>
          <SelectField label="Primary skill" value={newSkill} options={uniqueOptions(["Reading", "Listening", "Writing", "Speaking"])} onChange={setNewSkill} />
          <SelectField label="Activity" value={newActivity} options={uniqueOptions(["Reception", "Production", "Interaction", "Mediation"])} onChange={setNewActivity} />
          <Button variant="outline" disabled={!newLabel.trim() || nameExists(snapshot.canDoOptions, newLabel)} onClick={addCanDo}>Add</Button>
        </SimpleGrid>
      ) : null}
      {newLabel.trim() && nameExists(snapshot.canDoOptions, newLabel) ? <Text color="fg.error" fontSize="sm">A Can-do with this name already exists.</Text> : null}
      {entry ? (
        <>
          <SelectField label="Can-do" value={entry.id} options={snapshot.canDoOptions} onChange={setSelectedId} />
          {!disabled ? <Button alignSelf="start" size="sm" variant="outline" colorPalette="red" onClick={removeCanDo}>Delete unused</Button> : null}
          <TextField label="Can-do statement" value={entry.label} disabled={disabled} onChange={(value) => update((next) => { next.canDoOptions[index].label = value; })} multiline />
          {nameExists(snapshot.canDoOptions, entry.label, entry.id) ? <Text color="fg.error" fontSize="sm">A Can-do with this name already exists.</Text> : null}
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
            <ReadOnlyField label="Primary skill" value={entry.primarySkill ?? "Not set"} />
            <ReadOnlyField label="Activity" value={entry.activity ?? "Not set"} />
          </SimpleGrid>
        </>
      ) : <Text color="fg.muted">No Can-do statements configured.</Text>}
    </Stack>
  );
}

function ContextEditor({ snapshot, update, disabled, initialContextId }: RegistryEditorProps & { initialContextId?: string }) {
  const [selectedId, setSelectedId] = useState(initialContextId || snapshot.contextOptions[0]?.id || "");
  useEffect(() => { if (initialContextId) setSelectedId(initialContextId); }, [initialContextId]);
  const [newContextLabel, setNewContextLabel] = useState("");
  const index = snapshot.contextOptions.findIndex((entry) => entry.id === selectedId);
  const entry = snapshot.contextOptions[index];
  const changeContext = (mutate: (context: RegistrySnapshot["contextOptions"][number]) => void) => update((next) => {
    if (!next.contextOptions[index]) return;
    mutate(next.contextOptions[index]);
    for (const capability of next.capabilities) capability.allowedDomains = domainsForCapability(next, capability);
  });
  const references = snapshot.capabilities.filter((capability) => capability.allowedContextIds.includes(entry?.id));
  const addContext = () => {
    const label = newContextLabel.trim();
    if (!label || nameExists(snapshot.contextOptions, label)) return;
    const id = `CTX-CUSTOM-${crypto.randomUUID()}`;
    update((next) => {
      next.contextOptions.push({
        id,
        label,
        primaryDomains: [],
        canDoIds: [],
        scope: "",
        exclusions: [],
        retired: true,
      });
    });
    setSelectedId(id);
    setNewContextLabel("");
  };
  const setRetired = (retired: boolean) => changeContext((context) => { context.retired = retired; });
  return (
    <Stack gap={4}>
      {!disabled ? (
        <HStack align="end">
          <Box flex="1">
            <Text fontSize="sm" fontWeight="medium" mb={1}>New context</Text>
            <Input aria-label="New context" value={newContextLabel} onChange={(event) => setNewContextLabel(event.target.value)} />
          </Box>
          <Button
            variant="outline"
            disabled={!newContextLabel.trim() || nameExists(snapshot.contextOptions, newContextLabel)}
            onClick={addContext}
          >
            Add Context
          </Button>
        </HStack>
      ) : null}
      {newContextLabel.trim() && nameExists(snapshot.contextOptions, newContextLabel) ? <Text color="fg.error" fontSize="sm">A context with this name already exists.</Text> : null}
      {entry ? (
        <>
          <SelectField
            label={WORKBENCH_LABELS.context}
            value={entry.id}
            options={snapshot.contextOptions.map((context) => ({
              id: context.id,
              label: `${registryDisplayText(context.label)}${context.retired ? " · retired" : ""}`,
            }))}
            onChange={setSelectedId}
          />
          <HStack justify="space-between" align="end" flexWrap="wrap">
            {!disabled ? (
              <Button
                size="sm"
                variant="outline"
                colorPalette={entry.retired ? "teal" : "orange"}
                disabled={entry.retired && (!entry.label.trim() || nameExists(snapshot.contextOptions, entry.label, entry.id) || !entry.scope.trim() || entry.primaryDomains.length !== 1 || !snapshot.allowedDomains.includes(entry.primaryDomains[0]) || !entry.canDoIds.some((id) => snapshot.canDoOptions.some((canDo) => canDo.id === id)))}
                onClick={() => setRetired(!entry.retired)}
              >
                {entry.retired ? "Restore Context" : "Retire Context"}
              </Button>
            ) : null}
          </HStack>
          {references.length ? <ReadOnlyField label="Used by" value={`${references.length} item rule sets`} /> : null}
          <TextField label="Context name" value={entry.label} disabled={disabled} onChange={(value) => changeContext((context) => { context.label = value; })} />
          {nameExists(snapshot.contextOptions, entry.label, entry.id) ? <Text color="fg.error" fontSize="sm">A context with this name already exists.</Text> : null}
          <SelectField
            label="Primary Domain"
            value={entry.primaryDomains.length === 1 ? entry.primaryDomains[0] : ""}
            options={[{ id: "", label: "Select Domain" }, ...snapshot.allowedDomains.map((id) => ({ id, label: DOMAIN_LABELS[id] ?? id }))]}
            disabled={disabled}
            onChange={(value) => changeContext((context) => { context.primaryDomains = value ? [value] : []; })}
          />
          {entry.primaryDomains.length > 1 ? <Text role="alert" color="fg.error">This context has multiple primary domains. Select one Domain.</Text> : null}
          <RegistryMultiSelect label="Compatible Primary Can-do" options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(values) => changeContext((context) => { context.canDoIds = values; })} />
          <InvalidSelections label="Invalid compatible Can-do" entries={entry.canDoIds.filter((id) => !snapshot.canDoOptions.some((canDo) => canDo.id === id)).map((id) => ({ id, label: "Missing Can-do", reason: "This Can-do no longer exists." }))} disabled={disabled} onRemove={(id) => changeContext((context) => { context.canDoIds = context.canDoIds.filter((value) => value !== id); })} />
          <TextField label="Scope and boundary" value={entry.scope} multiline disabled={disabled} onChange={(value) => changeContext((context) => { context.scope = value; })} />
          <TextListField label="Explicit exclusions" values={entry.exclusions} disabled={disabled} onChange={(values) => changeContext((context) => { context.exclusions = values; })} />
        </>
      ) : <Text color="fg.muted">No concrete contexts configured.</Text>}
    </Stack>
  );
}

interface RegistryEditorProps {
  snapshot: RegistrySnapshot;
  update: UpdateRegistry;
  disabled: boolean;
}

function PolicyEditor({
  label,
  policy,
  disabled,
  onChange,
  usageCount,
}: {
  label: string;
  policy: ScoringPolicySummary;
  disabled: boolean;
  onChange: (mutate: (policy: ScoringPolicySummary) => void) => void;
  usageCount: number;
}) {
  return (
    <Box borderWidth="1px" borderRadius="md" p={3}>
      <Stack gap={3}>
        <Text fontWeight="medium">{label}</Text>
        {usageCount > 1 ? <Text fontSize="xs" color="fg.muted">Used by {usageCount} scoring contracts</Text> : null}
        <TextField label="Summary" value={policy.summary} disabled={disabled || policy.policyId === "notApplicable"} onChange={(value) => onChange((next) => { next.summary = value; })} />
        <TextListField label="Details" values={policy.details} disabled={disabled || policy.policyId === "notApplicable"} onChange={(values) => onChange((next) => { next.details = values; })} />
      </Stack>
    </Box>
  );
}

function ScoringEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const contracts = snapshot.scoringContracts ?? [];
  const [selectedId, setSelectedId] = useState(contracts[0]?.scoringContractTemplateId ?? "");
  const index = Math.max(0, contracts.findIndex((entry) => entry.scoringContractTemplateId === selectedId));
  const entry = contracts[index];
  if (!entry) return <Text color="fg.muted">No scoring contracts configured.</Text>;
  const contractOptions = contracts.map((contract) => {
    const capability = snapshot.capabilities.find((candidate) =>
      candidate.blueprintSlotId === contract.blueprintSlotId &&
      candidate.itemFormatId === contract.itemFormatId
    );
    return {
      id: contract.scoringContractTemplateId,
      label: contract.displayName ?? `${registrySlotName(snapshot, capability?.blueprintSlotId ?? contract.blueprintSlotId)} · ${ITEM_FORMAT_LABELS[contract.itemFormatId] ?? "Item format"}`,
    };
  });
  const change = (mutate: (contract: ScoringContractSummary) => void) => update((next) => { mutate(next.scoringContracts![index]); });
  const policy = (key: "normalization" | "partialCredit" | "invalidResponse" | "technicalIncident" | "adjudication" | "raterQualification") =>
    (mutate: (policy: ScoringPolicySummary) => void) => update((next) => {
      for (const contract of next.scoringContracts ?? []) {
        if (contract[key].policyId === entry[key].policyId) mutate(contract[key]);
      }
    });
  return (
    <Stack gap={4}>
      <SelectField label={WORKBENCH_LABELS.scoringContract} value={entry.scoringContractTemplateId} options={contractOptions} onChange={setSelectedId} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <ReadOnlyField label={WORKBENCH_LABELS.blueprintSlot} value={registrySlotName(snapshot, entry.blueprintSlotId)} />
        <ReadOnlyField label={WORKBENCH_LABELS.itemFormat} value={ITEM_FORMAT_LABELS[entry.itemFormatId] ?? WORKBENCH_LABELS.itemFormat} />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <ReadOnlyField label="Scoring type" value={entry.scoringType} />
        <ReadOnlyField label="Contract status" value={entry.status} />
      </SimpleGrid>
      <TextListField label="Item-specific scoring requirements" values={entry.taskSpecificRequirements} disabled={disabled} onChange={(values) => change((contract) => { contract.taskSpecificRequirements = values; })} />
      <TextField label="Score cap or exclusion" value={entry.capOrExclusion ?? ""} disabled={disabled} onChange={(value) => change((contract) => { contract.capOrExclusion = value || undefined; })} />
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={3}>
        <PolicyEditor label="Normalization" policy={entry.normalization} usageCount={contracts.filter((contract) => contract.normalization.policyId === entry.normalization.policyId).length} disabled={disabled} onChange={policy("normalization")} />
        <PolicyEditor label="Partial credit" policy={entry.partialCredit} usageCount={contracts.filter((contract) => contract.partialCredit.policyId === entry.partialCredit.policyId).length} disabled={disabled} onChange={policy("partialCredit")} />
        <PolicyEditor label="Invalid response" policy={entry.invalidResponse} usageCount={contracts.filter((contract) => contract.invalidResponse.policyId === entry.invalidResponse.policyId).length} disabled={disabled} onChange={policy("invalidResponse")} />
        <PolicyEditor label="Technical incident" policy={entry.technicalIncident} usageCount={contracts.filter((contract) => contract.technicalIncident.policyId === entry.technicalIncident.policyId).length} disabled={disabled} onChange={policy("technicalIncident")} />
        <PolicyEditor label="Adjudication" policy={entry.adjudication} usageCount={contracts.filter((contract) => contract.adjudication.policyId === entry.adjudication.policyId).length} disabled={disabled} onChange={policy("adjudication")} />
        <PolicyEditor label="Rater qualification" policy={entry.raterQualification} usageCount={contracts.filter((contract) => contract.raterQualification.policyId === entry.raterQualification.policyId).length} disabled={disabled} onChange={policy("raterQualification")} />
      </SimpleGrid>
    </Stack>
  );
}

function ContractsEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  return (
    <Stack gap={4}>
      <ReadOnlyField label="Required reviews" value={snapshot.requiredReviewGateIds.map((id) => registryReferenceName(snapshot, id, "Required review")).join(" · ")} />
      <TextListField label="Published limitations" values={snapshot.limitations} disabled={disabled} onChange={(values) => update((next) => { next.limitations = values; })} />
    </Stack>
  );
}

const RULE_LIBRARIES = [
  { id: "sources", label: "Reference sources" },
  { id: "contexts", label: "Contexts" },
  { id: "canDo", label: "Can-do library" },
  { id: "content", label: "Language content" },
  { id: "scoring", label: "Scoring contracts" },
  { id: "review", label: "Review rules" },
  { id: "history", label: "Change history" },
];

export function RegistryRuleEditor({ snapshot, update, disabled, history, onStagedDirtyChange }: RegistryEditorProps & { history?: ReactNode; onStagedDirtyChange?: (dirty: boolean) => void }) {
  const displayText = useMemo(() => createRegistryTextFormatter(snapshot), [snapshot]);
  type Area = "overview" | "matrix" | "configuration" | "libraries";
  const [area, setArea] = useState<Area>("overview");
  const scrollPositions = useRef<Partial<Record<Area, number>>>({});
  const previousArea = useRef<Area>("overview");
  useEffect(() => {
    if (previousArea.current === area) return;
    previousArea.current = area;
    window.scrollTo({ top: scrollPositions.current[area] ?? 0, behavior: "instant" });
  }, [area]);
  const [returnArea, setReturnArea] = useState<"overview" | "matrix" | null>(null);
  const [library, setLibrary] = useState("contexts");
  const [difficultyLevel, setDifficultyLevel] = useState("LowerA1");
  const [selectedKey, setSelectedKey] = useState(() => snapshot.capabilities[0] ? capabilityKey(snapshot.capabilities[0]) : "");
  const [contextId, setContextId] = useState("");
  const [selectedRowKey, setSelectedRowKey] = useState("");
  const [matrixFocus, setMatrixFocus] = useState<LanguageMatrixFocus>();
  const [editingEntry, setEditingEntry] = useState<ContentIdOption | null>(null);
  const [editingRule, setEditingRule] = useState<{ entry: ContentIdOption; capability: RegistryCapability; contextId: string } | null>(null);
  const [stagedDirty, setStagedDirty] = useState(false);
  const handleStagedDirty = useCallback((dirty: boolean) => { setStagedDirty(dirty); onStagedDirtyChange?.(dirty); }, [onStagedDirtyChange]);
  const capability = snapshot.capabilities.find((entry) => capabilityKey(entry) === selectedKey) ?? snapshot.capabilities[0];
  const editorProps = { snapshot, update, disabled };
  const canNavigate = () => !stagedDirty || window.confirm("Discard the unapplied language content changes?");
  const navigate = (next: Area) => {
    if (area === next || !canNavigate()) return;
    scrollPositions.current[area] = window.scrollY;
    setEditingEntry(null); setEditingRule(null); handleStagedDirty(false); setArea(next);
  };
  const openRules = (entry: RegistryCapability, selectedContext = "", level = "LowerA1") => {
    if (!canNavigate()) return;
    scrollPositions.current[area] = window.scrollY;
    if (area === "overview" || area === "matrix") setReturnArea(area);
    setSelectedKey(capabilityKey(entry)); setContextId(selectedContext); setDifficultyLevel(level); setArea("configuration");
  };
  const openContext = (id: string) => {
    if (!canNavigate()) return;
    scrollPositions.current[area] = window.scrollY;
    if (area === "overview" || area === "matrix") setReturnArea(area);
    setContextId(id); setLibrary("contexts"); setArea("libraries");
  };
  const closeDialog = () => { setEditingEntry(null); setEditingRule(null); handleStagedDirty(false); };
  return (
    <RegistryTextContext.Provider value={displayText}>
      <Stack gap={5}>
        <HStack borderBottomWidth="1px" pb={3} gap={2} flexWrap="wrap">
          {([{ id: "overview", label: "Rules overview" }, { id: "matrix", label: "Language content matrix" }, { id: "configuration", label: WORKBENCH_LABELS.itemRules }, { id: "libraries", label: "Rule libraries" }] as const).map(({ id, label }) =>
            <Button key={id} variant={area === id ? "subtle" : "ghost"} colorPalette="blue" aria-pressed={area === id} onClick={() => navigate(id)}>{label}</Button>)}
        </HStack>
        {returnArea && (area === "configuration" || area === "libraries") ? <Button alignSelf="start" variant="outline" size="sm" onClick={() => navigate(returnArea)}>Back to {returnArea === "overview" ? "Rules overview" : "Language content matrix"}</Button> : null}
        <div hidden={area !== "overview"}>
          <RegistryRulesOverview {...editorProps} selectedRowKey={selectedRowKey} onSelectedRowChange={setSelectedRowKey} onEditRules={openRules} onEditContext={openContext} onViewContent={(entry, id) => {
            scrollPositions.current[area] = window.scrollY;
            setMatrixFocus((current) => ({ capabilityKey: capabilityKey(entry), contextId: id, sequence: (current?.sequence ?? 0) + 1 })); setArea("matrix");
          }} />
        </div>
        <div hidden={area !== "matrix"}>
          <RegistryLanguageMatrix {...editorProps} focus={matrixFocus} onOpenEntry={(entry) => setEditingEntry(structuredClone(entry))} onOpenRule={(entry, column) => setEditingRule({ entry: structuredClone(entry), capability: structuredClone(column.capability), contextId: column.context.id })} onOpenItemRules={openRules} />
        </div>
        {area === "configuration" ? capability ? <>
          {contextId ? <HStack><Text fontSize="sm">{WORKBENCH_LABELS.context}: {displayText(snapshot.contextOptions.find((entry) => entry.id === contextId)?.label ?? "Missing Context")}</Text><Button size="xs" variant="plain" onClick={() => openContext(contextId)}>{disabled ? "View Context" : "Edit Context"}</Button></HStack> : null}
          <RegistryBlueprintEditor {...editorProps} capability={capability} onSelect={(entry) => { setSelectedKey(capabilityKey(entry)); setContextId(""); }} onManageContexts={() => openContext(contextId)} />
          <Box borderTopWidth="1px" pt={5}>
            <Text fontWeight="semibold" mb={4}>{WORKBENCH_LABELS.difficulty}</Text>
            <RegistryDifficultyEditor {...editorProps} capability={capability} selectedLevel={difficultyLevel} onSelectLevel={setDifficultyLevel} />
          </Box>
        </> : <Text color="fg.muted">No item rule sets available.</Text> : area === "libraries" ? (
          <Stack gap={5}>
            <SelectField label="Rule library" value={library} options={RULE_LIBRARIES.filter((entry) => entry.id !== "history" || history !== undefined)} onChange={(value) => { if (canNavigate()) { handleStagedDirty(false); setLibrary(value); } }} />
            {library === "contexts" ? <ContextEditor {...editorProps} initialContextId={contextId} /> : null}
            {library === "sources" ? <ReferenceSourcesPanel /> : null}
            {library === "canDo" ? <CanDoEditor {...editorProps} /> : null}
            {library === "content" ? <ContentCatalog {...editorProps} onStagedDirtyChange={handleStagedDirty} /> : null}
            {library === "scoring" ? <ScoringEditor {...editorProps} /> : null}
            {library === "review" ? <ContractsEditor {...editorProps} /> : null}
            {library === "history" ? history : null}
          </Stack>
        ) : null}
        {editingEntry ? <ContentEntryDialog key={editingEntry.id} initialEntry={editingEntry} isNew={false} snapshot={snapshot} disabled={disabled} onDirtyChange={handleStagedDirty} onClose={closeDialog} onOpenExisting={(entry) => setEditingEntry(structuredClone(entry))} onApply={(entry) => {
          if (disabled) return;
          update((next) => { const index = next.contentIdOptions.findIndex((value) => value.id === entry.id); if (index >= 0) next.contentIdOptions[index] = entry; }); closeDialog();
        }} /> : null}
        {editingRule ? <ContentAssessmentRuleDialog {...editingRule} snapshot={snapshot} disabled={disabled} onDirtyChange={handleStagedDirty} onClose={closeDialog} onApply={(rule) => {
          if (disabled) return;
          update((next) => { const index = next.contentIdOptions.findIndex((entry) => entry.id === editingRule.entry.id); if (index >= 0) next.contentIdOptions[index] = replaceContentAssessmentRule(next.contentIdOptions[index], editingRule.capability, editingRule.contextId, rule); }); closeDialog();
        }} /> : null}
      </Stack>
    </RegistryTextContext.Provider>
  );
}
