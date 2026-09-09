import {
  Box,
  Button,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  CONTENT_KIND_LABELS,
  DOMAIN_LABELS,
  ITEM_FORMAT_LABELS,
  WORKBENCH_LABELS,
} from "./labels";
import { capabilityKey, domainsForCapability } from "./registry-capability";
import { RegistryBlueprintEditor } from "./registry-blueprint-editor";
import { RegistryDifficultyEditor } from "./registry-difficulty-editor";
import { RegistryMultiSelect } from "./registry-multi-select";
import { ReferenceSourcesPanel } from "./reference-sources-panel";
import { registryDisplayText } from "./registry-display-text";
import { createRegistryTextFormatter, RegistryTextContext, registryReferenceName, registrySlotName } from "./registry-reference-labels";
import type {
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

function ContextEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const [selectedId, setSelectedId] = useState(snapshot.contextOptions[0]?.id ?? "");
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
          {references.length ? <ReadOnlyField label="Used by" value={`${references.length} task configurations`} /> : null}
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

function ContentEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const kinds = [...new Set(snapshot.contentIdOptions.map((entry) => entry.kind))];
  const [kind, setKind] = useState(kinds[0] ?? "");
  const entries = snapshot.contentIdOptions.filter((entry) => entry.kind === kind);
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? "");
  const entry = entries.find((option) => option.id === selectedId) ?? entries[0];
  useEffect(() => { setSelectedId(entries[0]?.id ?? ""); }, [kind]);
  if (!entry) return <Text color="fg.muted">No language content entries configured.</Text>;
  const index = snapshot.contentIdOptions.findIndex((option) => option.id === entry.id);
  const invalidContexts = entry.contextIds.flatMap((id) => {
    const context = snapshot.contextOptions.find((option) => option.id === id);
    const reason = !context ? "This context no longer exists." : context.retired ? "This context is retired." : null;
    return reason ? [{ id, label: context?.label ?? "Missing context", reason }] : [];
  });
  return (
    <Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <SelectField label="Content category" value={kind} options={kinds.map((id) => ({ id, label: CONTENT_KIND_LABELS[id] ?? id }))} onChange={setKind} />
        <SelectField label="Language content entry" value={entry.id} translate={kind !== "lexical" && kind !== "character"} options={entries.map((option) => ({ id: option.id, label: option.label }))} onChange={setSelectedId} />
      </SimpleGrid>
      <TextField label="Display label" value={entry.label} translate={entry.kind !== "lexical" && entry.kind !== "character"} disabled={disabled} onChange={(value) => update((next) => { next.contentIdOptions[index].label = value; })} />
      <SelectField label="Mastery scope" value={entry.masteryScope ?? ""} options={[{ id: "", label: "Not restricted" }, { id: "receptive", label: "Receptive" }, { id: "productive", label: "Productive" }, { id: "receptiveProductive", label: "Receptive and productive" }]} disabled={disabled} onChange={(value) => update((next) => { next.contentIdOptions[index].masteryScope = value || null; })} />
      <RegistryMultiSelect label="Compatible Can-do" options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(values) => update((next) => { next.contentIdOptions[index].canDoIds = values; })} />
      <InvalidSelections label="Invalid compatible Can-do" entries={entry.canDoIds.filter((id) => !snapshot.canDoOptions.some((canDo) => canDo.id === id)).map((id) => ({ id, label: "Missing Can-do", reason: "This Can-do no longer exists." }))} disabled={disabled} onRemove={(id) => update((next) => { next.contentIdOptions[index].canDoIds = entry.canDoIds.filter((value) => value !== id); })} />
      <RegistryMultiSelect label="Compatible contexts" options={snapshot.contextOptions.filter((context) => !context.retired).map((context) => ({ id: context.id, label: context.label }))} values={entry.contextIds} disabled={disabled} onChange={(values) => update((next) => { next.contentIdOptions[index].contextIds = values; })} />
      <InvalidSelections label="Unavailable content contexts" entries={invalidContexts} disabled={disabled} onRemove={(id) => update((next) => { next.contentIdOptions[index].contextIds = entry.contextIds.filter((value) => value !== id); })} />
    </Stack>
  );
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
      <TextListField label="Task-specific scoring requirements" values={entry.taskSpecificRequirements} disabled={disabled} onChange={(values) => change((contract) => { contract.taskSpecificRequirements = values; })} />
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

export function RegistryRuleEditor({ snapshot, update, disabled, history }: RegistryEditorProps & { history?: ReactNode }) {
  const displayText = useMemo(() => createRegistryTextFormatter(snapshot), [snapshot]);
  const [area, setArea] = useState<"configuration" | "libraries">("configuration");
  const [library, setLibrary] = useState("contexts");
  const [difficultyLevel, setDifficultyLevel] = useState("LowerA1");
  const [selectedKey, setSelectedKey] = useState(() => snapshot.capabilities[0] ? capabilityKey(snapshot.capabilities[0]) : "");
  const capability = snapshot.capabilities.find((entry) => capabilityKey(entry) === selectedKey) ?? snapshot.capabilities[0];
  const editorProps = { snapshot, update, disabled };
  return (
    <RegistryTextContext.Provider value={displayText}>
      <Stack gap={5}>
        <HStack borderBottomWidth="1px" pb={3} gap={2}>
          <Button variant={area === "configuration" ? "subtle" : "ghost"} colorPalette="blue" aria-pressed={area === "configuration"} onClick={() => setArea("configuration")}>
            {WORKBENCH_LABELS.taskConfiguration}
          </Button>
          <Button variant={area === "libraries" ? "subtle" : "ghost"} colorPalette="blue" aria-pressed={area === "libraries"} onClick={() => setArea("libraries")}>
            Rule libraries
          </Button>
        </HStack>
        {area === "configuration" ? capability ? <>
          <RegistryBlueprintEditor {...editorProps} capability={capability} onSelect={(entry) => setSelectedKey(capabilityKey(entry))} onManageContexts={() => { setLibrary("contexts"); setArea("libraries"); }} />
          <Box borderTopWidth="1px" pt={5}>
            <Text fontWeight="semibold" mb={4}>{WORKBENCH_LABELS.difficulty}</Text>
            <RegistryDifficultyEditor {...editorProps} capability={capability} selectedLevel={difficultyLevel} onSelectLevel={setDifficultyLevel} />
          </Box>
        </> : <Text color="fg.muted">No task configurations available.</Text> : (
          <Stack gap={5}>
            <SelectField label="Rule library" value={library} options={RULE_LIBRARIES.filter((entry) => entry.id !== "history" || history !== undefined)} onChange={setLibrary} />
            {library === "contexts" ? <ContextEditor {...editorProps} /> : null}
            {library === "sources" ? <ReferenceSourcesPanel /> : null}
            {library === "canDo" ? <CanDoEditor {...editorProps} /> : null}
            {library === "content" ? <ContentEditor {...editorProps} /> : null}
            {library === "scoring" ? <ScoringEditor {...editorProps} /> : null}
            {library === "review" ? <ContractsEditor {...editorProps} /> : null}
            {library === "history" ? history : null}
          </Stack>
        )}
      </Stack>
    </RegistryTextContext.Provider>
  );
}
