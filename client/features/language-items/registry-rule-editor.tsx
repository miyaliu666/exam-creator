import {
  Box,
  Button,
  Field,
  HStack,
  Input,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";

import {
  CONTENT_KIND_LABELS,
  DOMAIN_LABELS,
  ITEM_FORMAT_LABELS,
  SKILL_LABELS,
} from "./labels";
import { capabilityKey, contextCompatibilityIssue, domainsForCapability } from "./registry-capability";
import { registryDisplayText } from "./registry-display-text";
import { createRegistryTextFormatter, RegistryTextContext, registryCombinationName, registryReferenceName, registrySlotName } from "./registry-reference-labels";
import type {
  DifficultyBandStandard,
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
  ToggleList,
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

function RuleSection({
  title,
  children,
  open,
}: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
}) {
  const [expanded, setExpanded] = useState(open ?? false);
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Button
        variant="plain"
        h="auto"
        p={0}
        w="full"
        display="block"
        textAlign="left"
        onClick={() => setExpanded((current) => !current)}
      >
        <Text fontWeight="semibold">{expanded ? "−" : "+"} {title}</Text>
      </Button>
      {expanded ? <Box pt={5}>{children}</Box> : null}
    </Box>
  );
}

function NumberField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Input
        type="number"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field.Root>
  );
}

function BlueprintEditor({
  snapshot,
  update,
  disabled,
}: RegistryEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [newCanDoId, setNewCanDoId] = useState("");
  const capability = snapshot.capabilities[selectedIndex] ?? snapshot.capabilities[0];
  useEffect(() => {
    if (selectedIndex >= snapshot.capabilities.length) setSelectedIndex(0);
  }, [selectedIndex, snapshot.capabilities.length]);
  if (!capability) return <Text color="fg.muted">No blueprint slots configured.</Text>;
  const slotOptions = snapshot.capabilities
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) => candidate.blueprintSlotId === entry.blueprintSlotId) === index
    )
    .map((entry) => ({ id: entry.blueprintSlotId, label: registrySlotName(snapshot, entry.blueprintSlotId) }));
  const slotCapabilities = snapshot.capabilities.filter(
    (entry) => entry.blueprintSlotId === capability.blueprintSlotId,
  );
  const formatOptions = slotCapabilities
    .filter((entry, index, entries) =>
      entries.findIndex((candidate) => candidate.itemFormatId === entry.itemFormatId) === index
    )
    .map((entry) => ({
      id: entry.itemFormatId,
      label: ITEM_FORMAT_LABELS[entry.itemFormatId] ?? "Item format",
    }));
  const primaryCapabilities = slotCapabilities.filter(
    (entry) => entry.itemFormatId === capability.itemFormatId,
  );
  const primaryOptions = primaryCapabilities.map((entry) => ({
    id: entry.primaryCanDoId,
    label: snapshot.canDoOptions.find((option) => option.id === entry.primaryCanDoId)?.label ?? "Can-do",
  }));
  const unusedCanDoOptions = snapshot.canDoOptions.filter(
    (option) => !primaryCapabilities.some((entry) => entry.primaryCanDoId === option.id) &&
      option.primarySkill === capability.primaryReportedSkill &&
      option.activity === capability.communicativeActivity,
  );
  const selectedCanDo = snapshot.canDoOptions.find(
    (entry) => entry.id === capability.primaryCanDoId,
  );
  const scoringContract = snapshot.scoringContracts?.find(
    (entry) => entry.scoringContractTemplateId === capability.scoringContractTemplateId &&
      entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === capability.itemFormatId,
  );
  const invalidContexts = [...new Set(capability.allowedContextIds)].flatMap((id) => {
    const context = snapshot.contextOptions.find((entry) => entry.id === id);
    const reason = contextCompatibilityIssue(snapshot, context, capability);
    return reason ? [{ id, label: context?.label ?? "Missing context", reason }] : [];
  });
  const invalidSupporting = [...new Set(capability.supportingCanDoIds ?? [])].flatMap((id) => {
    const canDo = snapshot.canDoOptions.find((entry) => entry.id === id);
    const reason = !canDo ? "This Can-do no longer exists." : id === capability.primaryCanDoId ? "Primary Can-do cannot also be supporting." : null;
    return reason ? [{ id, label: canDo?.label ?? "Missing Can-do", reason }] : [];
  });
  const change = (mutate: (entry: typeof capability) => void) => update((next) => {
    const entry = next.capabilities[selectedIndex];
    const previousKey = capabilityKey(entry);
    mutate(entry);
    const profile = next.capabilityDifficultyProfileSets?.find((candidate) =>
      `${candidate.blueprintSlotId}::${candidate.itemFormatId}::${candidate.primaryCanDoId}` === previousKey
    );
    if (profile) {
      profile.blueprintSlotId = entry.blueprintSlotId;
      profile.itemFormatId = entry.itemFormatId;
      profile.primaryCanDoId = entry.primaryCanDoId;
      profile.id = `DPS-${entry.blueprintSlotId}-${entry.itemFormatId}-${entry.primaryCanDoId}`;
    }
  });
  const addPrimaryCanDo = () => {
    if (!scoringContract || !unusedCanDoOptions.some((entry) => entry.id === newCanDoId)) return;
    const newIndex = snapshot.capabilities.length;
    update((next) => {
      const source = next.capabilities[selectedIndex];
      const canDo = next.canDoOptions.find((entry) => entry.id === newCanDoId);
      const variant: RegistryCapability = structuredClone(source);
      variant.primaryCanDoId = newCanDoId;
      variant.primaryReportedSkill = canDo?.primarySkill ?? source.primaryReportedSkill;
      variant.communicativeActivity = canDo?.activity ?? source.communicativeActivity;
      variant.communicativeActivities = canDo?.activity
        ? [canDo.activity]
        : source.communicativeActivities;
      variant.supportingCanDoIds = [];
      variant.allowedContextIds = [];
      variant.allowedDomains = [];
      variant.observableEvidence = "";
      variant.a1Boundary = "";
      variant.referenceTask = "";
      variant.invalidReferenceTask = "";
      next.capabilities.push(variant);
      next.capabilityDifficultyProfileSets ??= [];
      next.capabilityDifficultyProfileSets.push({
        id: `DPS-${variant.blueprintSlotId}-${variant.itemFormatId}-${variant.primaryCanDoId}`,
        blueprintSlotId: variant.blueprintSlotId,
        itemFormatId: variant.itemFormatId,
        primaryCanDoId: variant.primaryCanDoId,
        standards: structuredClone(next.difficultyStandards),
      });
    });
    setSelectedIndex(newIndex);
    setNewCanDoId("");
  };
  const removeVariant = () => {
    if (primaryCapabilities.length <= 1) return;
    if (!window.confirm(`Remove ${registryDisplayText(capability.title)} / ${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "item format"} / ${registryDisplayText(selectedCanDo?.label ?? "Primary Can-do")}?`)) return;
    update((next) => {
      const [removed] = next.capabilities.splice(selectedIndex, 1);
      next.capabilityDifficultyProfileSets = (next.capabilityDifficultyProfileSets ?? []).filter((profile) =>
        !(profile.blueprintSlotId === removed.blueprintSlotId &&
          profile.itemFormatId === removed.itemFormatId &&
          profile.primaryCanDoId === removed.primaryCanDoId)
      );
    });
    const remainingIndex = snapshot.capabilities.findIndex((entry, index) => index !== selectedIndex && entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === capability.itemFormatId);
    setSelectedIndex(remainingIndex > selectedIndex ? remainingIndex - 1 : Math.max(0, remainingIndex));
    setNewCanDoId("");
  };
  return (
    <Stack gap={5}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <SelectField
          label="Slot"
          value={capability.blueprintSlotId}
          options={slotOptions}
          onChange={(value) => {
            const index = snapshot.capabilities.findIndex(
              (entry) => entry.blueprintSlotId === value,
            );
            if (index >= 0) setSelectedIndex(index);
            setNewCanDoId("");
          }}
        />
        <SelectField
          label="Item format"
          value={capability.itemFormatId}
          options={formatOptions}
          onChange={(value) => {
            const index = snapshot.capabilities.findIndex(
              (entry) => entry.blueprintSlotId === capability.blueprintSlotId &&
                entry.itemFormatId === value,
            );
            if (index >= 0) setSelectedIndex(index);
            setNewCanDoId("");
          }}
        />
        <SelectField
          label="Primary Can-do"
          value={capability.primaryCanDoId}
          options={primaryOptions}
          onChange={(value) => {
            const index = snapshot.capabilities.findIndex(
              (entry) => entry.blueprintSlotId === capability.blueprintSlotId &&
                entry.itemFormatId === capability.itemFormatId &&
                entry.primaryCanDoId === value,
            );
            if (index >= 0) setSelectedIndex(index);
          }}
        />
      </SimpleGrid>
      {selectedCanDo && (selectedCanDo.primarySkill !== capability.primaryReportedSkill || selectedCanDo.activity !== capability.communicativeActivity) ? (
        <Text color="fg.error" fontSize="sm">The selected Primary Can-do does not match this task configuration’s skill or activity.</Text>
      ) : null}
      {!disabled && unusedCanDoOptions.length > 0 ? (
        <HStack align="end" gap={3}>
          <Box flex="1">
            <SelectField
              label="New Primary Can-do"
              value={newCanDoId}
              options={[{ id: "", label: "Select" }, ...unusedCanDoOptions]}
              onChange={setNewCanDoId}
            />
          </Box>
          <Button variant="outline" disabled={!scoringContract || !unusedCanDoOptions.some((entry) => entry.id === newCanDoId)} onClick={addPrimaryCanDo}>Add</Button>
          <Button variant="outline" colorPalette="red" disabled={primaryCapabilities.length <= 1} onClick={removeVariant}>Remove</Button>
        </HStack>
      ) : !disabled ? (
        <Button alignSelf="start" variant="outline" colorPalette="red" disabled={primaryCapabilities.length <= 1} onClick={removeVariant}>
          Remove Primary Can-do
        </Button>
      ) : null}
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <ReadOnlyField
          label="Primary reported skill"
          value={SKILL_LABELS[selectedCanDo?.primarySkill ?? capability.primaryReportedSkill] ?? selectedCanDo?.primarySkill ?? capability.primaryReportedSkill}
        />
        <ReadOnlyField
          label="Communicative activity"
          value={selectedCanDo?.activity ?? capability.communicativeActivity}
        />
        <ReadOnlyField label="Scoring" value={scoringContract?.scoringType ?? "Scoring contract unavailable"} />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <ReadOnlyField label="Task family" value={snapshot.taskFamilyOptions?.find((entry) => entry.id === capability.taskFamilyId)?.displayName ?? capability.taskFamilyCoreBehavior ?? "Task family unavailable"} />
        <ReadOnlyField label="Scoring contract" value={scoringContract ? scoringContract.displayName ?? `${registrySlotName(snapshot, capability.blueprintSlotId)} · ${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Scoring"}` : "No matching scoring contract"} />
      </SimpleGrid>
      <ToggleList label="Supporting Can-do" options={snapshot.canDoOptions.filter((entry) => entry.id !== capability.primaryCanDoId)} values={capability.supportingCanDoIds ?? []} disabled={disabled} onChange={(values) => change((entry) => { entry.supportingCanDoIds = values; })} />
      <InvalidSelections label="Invalid supporting Can-do" entries={invalidSupporting} disabled={disabled} onRemove={(id) => change((entry) => { entry.supportingCanDoIds = entry.supportingCanDoIds?.filter((value) => value !== id); })} />
      <ReadOnlyField
        label="Domains"
        value={domainsForCapability(snapshot, capability).map((domain) => DOMAIN_LABELS[domain] ?? domain).join(", ") || "No usable contexts selected"}
      />
      <ToggleList
        label="Allowed contexts"
        options={snapshot.contextOptions.filter((entry) => !contextCompatibilityIssue(snapshot, entry, capability)).map((entry) => ({ id: entry.id, label: entry.label }))}
        values={capability.allowedContextIds}
        disabled={disabled}
        onChange={(values) => change((entry) => {
          entry.allowedContextIds = values;
          entry.allowedDomains = domainsForCapability(snapshot, entry);
        })}
      />
      <InvalidSelections label="Invalid selected contexts" entries={invalidContexts} disabled={disabled} onRemove={(id) => change((entry) => {
        entry.allowedContextIds = entry.allowedContextIds.filter((value) => value !== id);
        entry.allowedDomains = domainsForCapability(snapshot, entry);
      })} />
      <ReadOnlyField label="Activities" value={(capability.communicativeActivities ?? []).join(", ")} />
      <TextField label="Observable evidence" value={capability.observableEvidence} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.observableEvidence = value; })} />
      <TextField label="A1 boundary" value={capability.a1Boundary ?? ""} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.a1Boundary = value; })} />
      <TextField label="Task family core behavior" value={capability.taskFamilyCoreBehavior ?? ""} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.taskFamilyCoreBehavior = value; })} />
      <TextField label="Task structure" value={capability.taskStructure} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.taskStructure = value; })} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <TextField label="Valid reference task" value={capability.referenceTask} disabled={disabled} onChange={(value) => change((entry) => { entry.referenceTask = value; })} />
        <TextField label="Invalid reference task" value={capability.invalidReferenceTask ?? ""} disabled={disabled} onChange={(value) => change((entry) => { entry.invalidReferenceTask = value; })} />
      </SimpleGrid>
      <TextListField label="Prohibited uses" values={capability.prohibitedUses} disabled={disabled} onChange={(values) => change((entry) => { entry.prohibitedUses = values; })} />
      <Box as="details" borderTopWidth="1px" pt={3}>
        <Text as="summary" cursor="pointer" fontWeight="medium">Delivery rules</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={3}>
          <ReadOnlyField label="Presentation" value={registryReferenceName(snapshot, capability.rendererId, `${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Item"} presentation`)} />
          {Object.entries(capability.deliveryPolicyRefs ?? {}).map(([key, id]) => (
            <ReadOnlyField key={key} label={({ navigationPolicyId: "Navigation", inputPolicyId: "Input", playbackPolicyId: "Playback", recordingPolicyId: "Recording", speakingRateProfileId: "Speaking rate", pauseProfileId: "Pauses" } as Record<string, string>)[key] ?? "Delivery rule"} value={registryReferenceName(snapshot, id, "Configured")} />
          ))}
        </SimpleGrid>
      </Box>
    </Stack>
  );
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
          <Box><Text fontSize="sm" fontWeight="medium" mb={1}>New Can-do</Text><Input value={newLabel} onChange={(event) => setNewLabel(event.target.value)} /></Box>
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
            <Input value={newContextLabel} onChange={(event) => setNewContextLabel(event.target.value)} />
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
            label="Concrete context"
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
            value={entry.primaryDomains[0] ?? ""}
            options={[{ id: "", label: "Select Domain" }, ...snapshot.allowedDomains.map((id) => ({ id, label: DOMAIN_LABELS[id] ?? id }))]}
            disabled={disabled}
            onChange={(value) => changeContext((context) => { context.primaryDomains = value ? [value] : []; })}
          />
          <ToggleList label="Compatible Primary Can-do" options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(values) => changeContext((context) => { context.canDoIds = values; })} />
          <InvalidSelections label="Invalid compatible Can-do" entries={entry.canDoIds.filter((id) => !snapshot.canDoOptions.some((canDo) => canDo.id === id)).map((id) => ({ id, label: "Missing Can-do", reason: "This Can-do no longer exists." }))} disabled={disabled} onRemove={(id) => changeContext((context) => { context.canDoIds = context.canDoIds.filter((value) => value !== id); })} />
          <TextField label="Scope and boundary" value={entry.scope} multiline disabled={disabled} onChange={(value) => changeContext((context) => { context.scope = value; })} />
          <TextListField label="Explicit exclusions" values={entry.exclusions} disabled={disabled} onChange={(values) => changeContext((context) => { context.exclusions = values; })} />
        </>
      ) : <Text color="fg.muted">No concrete contexts configured.</Text>}
    </Stack>
  );
}

function DifficultyEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState(
    snapshot.capabilities[0] ? capabilityKey(snapshot.capabilities[0]) : "",
  );
  const capability = snapshot.capabilities.find(
    (candidate) => capabilityKey(candidate) === selectedCapabilityKey,
  ) ?? snapshot.capabilities[0];
  const profile = snapshot.capabilityDifficultyProfileSets?.find((candidate) =>
    capability &&
    candidate.blueprintSlotId === capability.blueprintSlotId &&
    candidate.itemFormatId === capability.itemFormatId &&
    candidate.primaryCanDoId === capability.primaryCanDoId
  );
  const standards = profile?.standards ?? snapshot.difficultyStandards;
  const [selectedId, setSelectedId] = useState(standards[0]?.id ?? "");
  const entry = standards.find((standard) => standard.id === selectedId) ?? standards[0];
  if (!entry) return <Text color="fg.muted">No difficulty standards configured.</Text>;
  const change = (mutate: (standard: DifficultyBandStandard) => void) => update((next) => {
    if (!capability) return;
    next.capabilityDifficultyProfileSets ??= [];
    let nextProfile = next.capabilityDifficultyProfileSets.find((candidate) =>
      candidate.blueprintSlotId === capability.blueprintSlotId &&
      candidate.itemFormatId === capability.itemFormatId &&
      candidate.primaryCanDoId === capability.primaryCanDoId
    );
    if (!nextProfile) {
      nextProfile = {
        id: `DPS-${capability.blueprintSlotId}-${capability.itemFormatId}-${capability.primaryCanDoId}`,
        blueprintSlotId: capability.blueprintSlotId,
        itemFormatId: capability.itemFormatId,
        primaryCanDoId: capability.primaryCanDoId,
        standards: structuredClone(next.difficultyStandards),
      };
      next.capabilityDifficultyProfileSets.push(nextProfile);
    }
    const standard = nextProfile.standards.find((candidate) => candidate.id === entry.id);
    if (standard) mutate(standard);
  });
  return (
    <Stack gap={4}>
      <SelectField
        label="Applies to"
        value={capability ? capabilityKey(capability) : ""}
        options={snapshot.capabilities.map((candidate) => ({
          id: capabilityKey(candidate),
          label: registryCombinationName(snapshot, candidate),
        }))}
        onChange={(value) => {
          setSelectedCapabilityKey(value);
          const nextCapability = snapshot.capabilities.find((candidate) => capabilityKey(candidate) === value);
          const nextProfile = snapshot.capabilityDifficultyProfileSets?.find((candidate) =>
            nextCapability &&
            candidate.blueprintSlotId === nextCapability.blueprintSlotId &&
            candidate.itemFormatId === nextCapability.itemFormatId &&
            candidate.primaryCanDoId === nextCapability.primaryCanDoId
          );
          setSelectedId((nextProfile?.standards ?? snapshot.difficultyStandards)[0]?.id ?? "");
        }}
      />
      <SelectField label="A1 difficulty band" value={entry.id} options={standards.map((standard) => ({ id: standard.id, label: standard.label }))} onChange={setSelectedId} />
      <TextField label="Display name" value={entry.label} disabled={disabled} onChange={(value) => change((standard) => { standard.label = value; })} />
      <TextField label="Difficulty definition" value={entry.description} multiline disabled={disabled} onChange={(value) => change((standard) => { standard.description = value; })} />
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4}>
        <SelectField label="Default input length" value={entry.defaultDrivers.inputLength} options={uniqueOptions(["wordOrPhrase", "shortSentence", "twoRelatedPhrases"])} disabled={disabled} onChange={(value) => change((standard) => { standard.defaultDrivers.inputLength = value as DifficultyBandStandard["defaultDrivers"]["inputLength"]; })} />
        <SelectField label="Default support" value={entry.defaultDrivers.supportLevel} options={uniqueOptions(["high", "moderate", "limited"])} disabled={disabled} onChange={(value) => change((standard) => { standard.defaultDrivers.supportLevel = value as DifficultyBandStandard["defaultDrivers"]["supportLevel"]; })} />
        <SelectField label="Default distractor similarity" value={entry.defaultDrivers.distractorSimilarity} options={uniqueOptions(["clear", "moderate", "close", "notApplicable"])} disabled={disabled} onChange={(value) => change((standard) => { standard.defaultDrivers.distractorSimilarity = value as DifficultyBandStandard["defaultDrivers"]["distractorSimilarity"]; })} />
        <SelectField label="Default independence" value={entry.defaultDrivers.independenceLevel} options={uniqueOptions(["highlySupported", "partlySupported", "independent"])} disabled={disabled} onChange={(value) => change((standard) => { standard.defaultDrivers.independenceLevel = value as DifficultyBandStandard["defaultDrivers"]["independenceLevel"]; })} />
        <NumberField label="Default information points" value={entry.defaultDrivers.informationPoints} disabled={disabled} onChange={(value) => change((standard) => { standard.defaultDrivers.informationPoints = value; })} />
        <NumberField label="Minimum information points" value={entry.informationPointsMin} disabled={disabled} onChange={(value) => change((standard) => { standard.informationPointsMin = value; })} />
        <NumberField label="Maximum information points" value={entry.informationPointsMax} disabled={disabled} onChange={(value) => change((standard) => { standard.informationPointsMax = value; })} />
      </SimpleGrid>
      <ToggleList label="Allowed input lengths" options={uniqueOptions(["wordOrPhrase", "shortSentence", "twoRelatedPhrases"])} values={entry.allowedInputLengths} disabled={disabled} onChange={(values) => change((standard) => { standard.allowedInputLengths = values; })} />
      <ToggleList label="Allowed support levels" options={uniqueOptions(["high", "moderate", "limited"])} values={entry.allowedSupportLevels} disabled={disabled} onChange={(values) => change((standard) => { standard.allowedSupportLevels = values; })} />
      <ToggleList label="Allowed distractor similarity" options={uniqueOptions(["clear", "moderate", "close", "notApplicable"])} values={entry.allowedDistractorSimilarities} disabled={disabled} onChange={(values) => change((standard) => { standard.allowedDistractorSimilarities = values; })} />
      <Field.Root>
        <HStack>
          <input type="checkbox" checked={entry.defaultDrivers.inferenceRequired} disabled={disabled} onChange={(event) => change((standard) => { standard.defaultDrivers.inferenceRequired = event.target.checked; })} />
          <Field.Label mb={0}>Inference required by default</Field.Label>
        </HStack>
      </Field.Root>
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
  return (
    <Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <SelectField label="Content category" value={kind} options={kinds.map((id) => ({ id, label: CONTENT_KIND_LABELS[id] ?? id }))} onChange={setKind} />
        <SelectField label="Language content entry" value={entry.id} translate={kind !== "lexical" && kind !== "character"} options={entries.map((option) => ({ id: option.id, label: option.label }))} onChange={setSelectedId} />
      </SimpleGrid>
      <TextField label="Display label" value={entry.label} translate={entry.kind !== "lexical" && entry.kind !== "character"} disabled={disabled} onChange={(value) => update((next) => { next.contentIdOptions[index].label = value; })} />
      <SelectField label="Mastery scope" value={entry.masteryScope ?? ""} options={[{ id: "", label: "Not restricted" }, { id: "receptive", label: "Receptive" }, { id: "productive", label: "Productive" }, { id: "receptiveProductive", label: "Receptive and productive" }]} disabled={disabled} onChange={(value) => update((next) => { next.contentIdOptions[index].masteryScope = value || null; })} />
      <ToggleList label="Compatible Can-do" options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(values) => update((next) => { next.contentIdOptions[index].canDoIds = values; })} />
      <ToggleList label="Compatible contexts" options={snapshot.contextOptions.map((context) => ({ id: context.id, label: context.label }))} values={entry.contextIds} disabled={disabled} onChange={(values) => update((next) => { next.contentIdOptions[index].contextIds = values; })} />
    </Stack>
  );
}

function PolicyEditor({
  label,
  policy,
  disabled,
  onChange,
}: {
  label: string;
  policy: ScoringPolicySummary;
  disabled: boolean;
  onChange: (mutate: (policy: ScoringPolicySummary) => void) => void;
}) {
  return (
    <Box borderWidth="1px" borderRadius="md" p={3}>
      <Stack gap={3}>
        <Text fontWeight="medium">{label}</Text>
        <TextField label="Summary" value={policy.summary} disabled={disabled} onChange={(value) => onChange((next) => { next.summary = value; })} />
        <TextListField label="Details" values={policy.details} disabled={disabled} onChange={(values) => onChange((next) => { next.details = values; })} />
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
  const capability = snapshot.capabilities.find((candidate) =>
    candidate.blueprintSlotId === entry.blueprintSlotId &&
    candidate.itemFormatId === entry.itemFormatId
  );
  const change = (mutate: (contract: ScoringContractSummary) => void) => update((next) => { mutate(next.scoringContracts![index]); });
  const policy = (key: "normalization" | "partialCredit" | "invalidResponse" | "technicalIncident" | "adjudication" | "raterQualification") =>
    (mutate: (policy: ScoringPolicySummary) => void) => change((contract) => { mutate(contract[key]); });
  return (
    <Stack gap={4}>
      <SelectField label="Exam task" value={entry.scoringContractTemplateId} options={contractOptions} onChange={setSelectedId} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <ReadOnlyField label="Slot" value={capability?.title ?? "Exam task"} />
        <ReadOnlyField label="Item format" value={ITEM_FORMAT_LABELS[entry.itemFormatId] ?? "Item format"} />
      </SimpleGrid>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <ReadOnlyField label="Scoring type" value={entry.scoringType} />
        <ReadOnlyField label="Contract status" value={entry.status} />
      </SimpleGrid>
      <TextListField label="Task-specific scoring requirements" values={entry.taskSpecificRequirements} disabled={disabled} onChange={(values) => change((contract) => { contract.taskSpecificRequirements = values; })} />
      <TextField label="Score cap or exclusion" value={entry.capOrExclusion ?? ""} disabled={disabled} onChange={(value) => change((contract) => { contract.capOrExclusion = value || undefined; })} />
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap={3}>
        <PolicyEditor label="Normalization" policy={entry.normalization} disabled={disabled} onChange={policy("normalization")} />
        <PolicyEditor label="Partial credit" policy={entry.partialCredit} disabled={disabled} onChange={policy("partialCredit")} />
        <PolicyEditor label="Invalid response" policy={entry.invalidResponse} disabled={disabled} onChange={policy("invalidResponse")} />
        <PolicyEditor label="Technical incident" policy={entry.technicalIncident} disabled={disabled} onChange={policy("technicalIncident")} />
        <PolicyEditor label="Adjudication" policy={entry.adjudication} disabled={disabled} onChange={policy("adjudication")} />
        <PolicyEditor label="Rater qualification" policy={entry.raterQualification} disabled={disabled} onChange={policy("raterQualification")} />
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

export function RegistryRuleEditor({ snapshot, update, disabled }: RegistryEditorProps) {
  const displayText = useMemo(() => createRegistryTextFormatter(snapshot), [snapshot]);
  return (
    <RegistryTextContext.Provider value={displayText}>
    <Stack gap={3}>
      <RuleSection open title="Task configuration">
        <BlueprintEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="Can-do library">
        <CanDoEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="Contexts">
        <ContextEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="A1 difficulty standards">
        <DifficultyEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="Language content">
        <ContentEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="Scoring contracts">
        <ScoringEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
      <RuleSection title="Review and publication">
        <ContractsEditor snapshot={snapshot} update={update} disabled={disabled} />
      </RuleSection>
    </Stack>
    </RegistryTextContext.Provider>
  );
}
