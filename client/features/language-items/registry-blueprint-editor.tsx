import { Box, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { DOMAIN_LABELS, ITEM_FORMAT_LABELS, SKILL_LABELS, WORKBENCH_LABELS } from "./labels";
import { capabilityKey, contextCompatibilityIssue, domainsForCapability } from "./registry-capability";
import { changeRegistryConfiguration, configurationBindings, configurationSiblings, type UpdateRegistryConfiguration } from "./registry-configuration";
import { RegistryConfigurationActions } from "./registry-configuration-actions";
import { registryDisplayText } from "./registry-display-text";
import { InvalidSelections, ReadOnlyField, SelectField, type FormOption } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import { registrySlotName } from "./registry-reference-labels";
import { RegistryTaskRules } from "./registry-task-rules";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface RegistryBlueprintEditorProps {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  update: UpdateRegistryConfiguration;
  disabled: boolean;
  onSelect: (capability: RegistryCapability) => void;
  onManageContexts: () => void;
}

function ConfigurationSelector({ label, value, options, onChange }: {
  label: string; value: string; options: FormOption[]; onChange: (value: string) => void;
}) {
  return options.length === 1
    ? <ReadOnlyField label={label} value={options[0].label} />
    : <SelectField label={label} value={value} options={options} onChange={onChange} />;
}

export function RegistryBlueprintEditor({ snapshot, capability, update, disabled, onSelect, onManageContexts }: RegistryBlueprintEditorProps) {
  const slotCapabilities = snapshot.capabilities.filter((entry) => entry.blueprintSlotId === capability.blueprintSlotId);
  const primaryCapabilities = configurationSiblings(snapshot, capability);
  const slotOptions = [...new Set(snapshot.capabilities.map((entry) => entry.blueprintSlotId))]
    .map((id) => ({ id, label: registrySlotName(snapshot, id) }));
  const formatOptions = [...new Set(slotCapabilities.map((entry) => entry.itemFormatId))]
    .map((id) => ({ id, label: ITEM_FORMAT_LABELS[id] ?? "Item format" }));
  const primaryOptions = primaryCapabilities.map((entry) => ({ id: entry.primaryCanDoId,
    label: snapshot.canDoOptions.find((option) => option.id === entry.primaryCanDoId)?.label ?? "Missing Can-do" }));
  const selectedCanDo = snapshot.canDoOptions.find((entry) => entry.id === capability.primaryCanDoId);
  const bindings = configurationBindings(snapshot, capability);
  const contract = bindings.scoringContract;
  const primaryActivity = selectedCanDo?.activity ?? capability.communicativeActivity;
  const additionalActivities = [...new Set([capability.communicativeActivity, ...(capability.communicativeActivities ?? [])])]
    .filter((activity) => activity && activity !== primaryActivity);
  const activities = [additionalActivities.length ? `${primaryActivity} (primary)` : primaryActivity, ...additionalActivities].filter(Boolean).join(" · ");
  const skill = selectedCanDo?.primarySkill ?? capability.primaryReportedSkill;
  const invalidContexts = [...new Set(capability.allowedContextIds)].flatMap((id) => {
    const context = snapshot.contextOptions.find((entry) => entry.id === id);
    const reason = contextCompatibilityIssue(snapshot, context, capability);
    return reason ? [{ id, label: context?.label ?? "Missing context", reason }] : [];
  });
  const change = (mutate: (entry: RegistryCapability) => void) => update((next) => changeRegistryConfiguration(next, capability, mutate));
  const select = (matches: (entry: RegistryCapability) => boolean) => {
    const entry = snapshot.capabilities.find(matches);
    if (entry) onSelect(entry);
  };
  const contractName = contract?.displayName ?? `${registrySlotName(snapshot, capability.blueprintSlotId)} · ${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Scoring"}`;
  return (
    <Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4} alignItems="end">
        <ConfigurationSelector label={WORKBENCH_LABELS.blueprintSlot} value={capability.blueprintSlotId} options={slotOptions}
          onChange={(value) => select((entry) => entry.blueprintSlotId === value)} />
        <ConfigurationSelector label={WORKBENCH_LABELS.itemFormat} value={capability.itemFormatId} options={formatOptions}
          onChange={(value) => select((entry) => entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === value)} />
        <ConfigurationSelector label={WORKBENCH_LABELS.primaryCanDo} value={capability.primaryCanDoId} options={primaryOptions}
          onChange={(value) => select((entry) => entry.blueprintSlotId === capability.blueprintSlotId && entry.itemFormatId === capability.itemFormatId && entry.primaryCanDoId === value)} />
      </SimpleGrid>
      <Box borderWidth="1px" borderRadius="md" p={3} bg="bg.subtle">
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
          <ReadOnlyField label="Skill / Activities" value={[SKILL_LABELS[skill] ?? skill, activities].filter(Boolean).join(" · ")} />
          <ReadOnlyField label={WORKBENCH_LABELS.taskFamily} value={snapshot.taskFamilyOptions?.find((entry) => entry.id === capability.taskFamilyId)?.displayName ?? "Task family unavailable"} />
          <ReadOnlyField label={WORKBENCH_LABELS.scoringContract} value={contract ? `${contractName} · ${registryDisplayText(contract.scoringType)}` : "No matching scoring contract"} />
        </SimpleGrid>
      </Box>
      {!selectedCanDo || selectedCanDo.primarySkill !== capability.primaryReportedSkill || selectedCanDo.activity !== capability.communicativeActivity ?
        <Text color="fg.error" fontSize="sm">Primary Can-do is missing or does not match this configuration’s skill and activity.</Text> : null}
      {!bindings.taskFamilyMatches ? <Stack gap={2}>
        <Text color="fg.error" fontSize="sm">The task family does not support this blueprint slot and item format.</Text>
        {!disabled && bindings.taskFamilies.length === 1 ? <Button alignSelf="start" size="sm" variant="outline" onClick={() => change((entry) => { entry.taskFamilyId = bindings.taskFamilies[0].id; })}>Use registered task family</Button> : null}
      </Stack> : null}
      {!contract ? <Stack gap={2}>
        <Text color="fg.error" fontSize="sm">A matching scoring contract is required.</Text>
        {!disabled && bindings.scoringContracts.length === 1 ? <Button alignSelf="start" size="sm" variant="outline" onClick={() => change((entry) => { entry.scoringContractTemplateId = bindings.scoringContracts[0].scoringContractTemplateId; })}>Use registered scoring contract</Button> : null}
      </Stack> : null}
      <RegistryMultiSelect label="Allowed contexts" options={snapshot.contextOptions.filter((entry) => !contextCompatibilityIssue(snapshot, entry, capability)).map((entry) => ({ id: entry.id, label: entry.label }))}
        values={capability.allowedContextIds} disabled={disabled} onChange={(values) => change((entry) => {
          entry.allowedContextIds = values;
          entry.allowedDomains = domainsForCapability(snapshot, entry);
        })} />
      <HStack justify="space-between" align="start" gap={3}>
        <ReadOnlyField label="Domains" value={domainsForCapability(snapshot, capability).map((domain) => DOMAIN_LABELS[domain] ?? domain).join(", ")} />
        <Button size="sm" variant="plain" onClick={onManageContexts}>Manage contexts</Button>
      </HStack>
      <InvalidSelections label="Invalid selected contexts" entries={invalidContexts} disabled={disabled} onRemove={(id) => change((entry) => {
        entry.allowedContextIds = entry.allowedContextIds.filter((value) => value !== id);
        entry.allowedDomains = domainsForCapability(snapshot, entry);
      })} />
      <RegistryTaskRules snapshot={snapshot} capability={capability} change={change} disabled={disabled} />
      <RegistryConfigurationActions key={capabilityKey(capability)} snapshot={snapshot} capability={capability} update={update} disabled={disabled} onSelect={onSelect} />
    </Stack>
  );
}
