import { Box, Button, Collapsible, HStack, SimpleGrid, Stack, Table, Text } from "@chakra-ui/react";

import { DOMAIN_LABELS, ITEM_FORMAT_LABELS, SKILL_LABELS, WORKBENCH_LABELS } from "./labels";
import { capabilityKey, contextCompatibilityIssue, domainsForCapability } from "./registry-capability";
import { changeRegistryConfiguration, configurationBindings, type UpdateRegistryConfiguration } from "./registry-configuration";
import { RegistryConfigurationActions } from "./registry-configuration-actions";
import { registryDisplayText } from "./registry-display-text";
import { ReadOnlyField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import { registryItemRuleName } from "./registry-reference-labels";
import { RegistryTaskRules } from "./registry-task-rules";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface RegistryItemRuleEditorProps {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  update: UpdateRegistryConfiguration;
  disabled: boolean;
  onSelect: (capability: RegistryCapability) => void;
  onManageContexts: (contextId?: string) => void;
  onEditCanDo?: (id: string) => void;
  onEditScoring?: (id: string) => void;
  onRemoved?: () => void;
}

export function RegistryItemRuleEditor({ snapshot, capability, update, disabled, onSelect, onManageContexts, onEditCanDo, onEditScoring, onRemoved }: RegistryItemRuleEditorProps) {
  const selectedCanDo = snapshot.canDoOptions.find((entry) => entry.id === capability.primaryCanDoId);
  const bindings = configurationBindings(snapshot, capability);
  const contract = bindings.scoringContract;
  const primaryActivity = selectedCanDo?.activity ?? capability.communicativeActivity;
  const additionalActivities = [...new Set([capability.communicativeActivity, ...(capability.communicativeActivities ?? [])])]
    .filter((activity) => activity && activity !== primaryActivity);
  const activities = [additionalActivities.length ? `${primaryActivity} (primary)` : primaryActivity, ...additionalActivities].filter(Boolean).join(" · ");
  const skill = selectedCanDo?.primarySkill ?? capability.primaryReportedSkill;
  const selectedContexts = [...new Set(capability.allowedContextIds)].map((id) => {
    const context = snapshot.contextOptions.find((entry) => entry.id === id);
    const reason = contextCompatibilityIssue(snapshot, context, capability);
    return { id, context, reason };
  });
  const contextDomains = new Set(domainsForCapability(snapshot, capability));
  const savedDomains = new Set(capability.allowedDomains);
  const domainsNeedRepair = selectedContexts.length > 0 && selectedContexts.every(({ reason }) => !reason)
    && (contextDomains.size !== savedDomains.size || [...contextDomains].some((domain) => !savedDomains.has(domain)));
  const change = (mutate: (entry: RegistryCapability) => void) => update((next) => changeRegistryConfiguration(next, capability, mutate));
  const contractName = contract?.displayName ?? `${registryItemRuleName(snapshot, capability.itemRuleId)} · ${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Scoring"}`;
  return (
    <Stack gap={4}>
      <Text as="h3" fontWeight="semibold">Current item rules</Text>
      <SimpleGrid columns={{ base: 1, md: 3 }} gap={4} alignItems="end">
        <ReadOnlyField label={WORKBENCH_LABELS.primaryCanDo} value={selectedCanDo?.label ?? "Missing Can-do"} />
        <ReadOnlyField label={WORKBENCH_LABELS.itemFormat} value={ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Missing Item format"} />
      </SimpleGrid>
      <HStack gap={3}>
        {onEditCanDo ? <Button size="xs" variant="plain" onClick={() => onEditCanDo(capability.primaryCanDoId)}>{disabled ? "View Can-do statement" : "Edit Can-do statement"}</Button> : null}
        {onEditScoring ? <Button size="xs" variant="plain" onClick={() => onEditScoring(capability.scoringContractTemplateId)}>{disabled ? "View Scoring contract" : "Edit Scoring contract"}</Button> : null}
      </HStack>
      <Box borderWidth="1px" borderRadius="md" p={3} bg="bg.subtle">
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
          <ReadOnlyField label="Skill / Activities" value={[SKILL_LABELS[skill] ?? skill, activities].filter(Boolean).join(" · ")} />
          <ReadOnlyField label={WORKBENCH_LABELS.taskFamily} value={snapshot.taskFamilyOptions?.find((entry) => entry.id === capability.taskFamilyId)?.displayName ?? "Task family unavailable"} />
          <ReadOnlyField label={WORKBENCH_LABELS.scoringContract} value={contract ? `${contractName} · ${registryDisplayText(contract.scoringType)}` : "No matching scoring contract"} />
        </SimpleGrid>
      </Box>
      {!selectedCanDo || selectedCanDo.primarySkill !== capability.primaryReportedSkill || selectedCanDo.activity !== capability.communicativeActivity ? <Stack gap={2}>
        <Text color="fg.error" fontSize="sm">Primary Can-do is missing or does not match the skill and activity of these item rules.</Text>
        {!disabled && selectedCanDo?.primarySkill && selectedCanDo.activity ? <Button alignSelf="start" size="sm" variant="outline" onClick={() => change((entry) => {
          const previousActivity = entry.communicativeActivity;
          entry.primaryReportedSkill = selectedCanDo.primarySkill!; entry.communicativeActivity = selectedCanDo.activity!;
          entry.communicativeActivities = [...new Set([selectedCanDo.activity!, ...(entry.communicativeActivities ?? []).filter((activity) => activity !== previousActivity)])];
        })}>Use Can-do skill and activity</Button> : null}
      </Stack> : null}
      {!bindings.taskFamilyMatches ? <Stack gap={2}>
        <Text color="fg.error" fontSize="sm">The task family does not support these item rules and exercise template.</Text>
        {!disabled && bindings.taskFamilies.length === 1 ? <Button alignSelf="start" size="sm" variant="outline" onClick={() => change((entry) => { entry.taskFamilyId = bindings.taskFamilies[0].id; })}>Use registered task family</Button> : null}
      </Stack> : null}
      {!contract ? <Stack gap={2}>
        <Text color="fg.error" fontSize="sm">A matching scoring contract is required.</Text>
        {!disabled && bindings.scoringContracts.length === 1 ? <Button alignSelf="start" size="sm" variant="outline" onClick={() => change((entry) => { entry.scoringContractTemplateId = bindings.scoringContracts[0].scoringContractTemplateId; })}>Use registered scoring contract</Button> : null}
      </Stack> : null}
      <Collapsible.Root defaultOpen={!selectedContexts.length} display="flex" flexDirection="column" gap={3}>
      <HStack data-rule-section="contexts" justify="space-between" align="center" gap={3} flexWrap="wrap">
        <Text fontWeight="medium">Allowed Contexts and Domains</Text>
        {!disabled ? <Collapsible.Trigger asChild><Button size="sm" variant="outline">Change allowed Contexts</Button></Collapsible.Trigger> : null}
      </HStack>
      <Box borderWidth="1px" borderRadius="md" overflowX="auto">
        <Table.Root size="sm" aria-label="Allowed Contexts and Domains">
          <Table.Header><Table.Row><Table.ColumnHeader>Context</Table.ColumnHeader><Table.ColumnHeader>Domain</Table.ColumnHeader></Table.Row></Table.Header>
          <Table.Body>{selectedContexts.map(({ id, context, reason }) => <Table.Row key={id} verticalAlign="top">
            <Table.Cell>{context ? <Button variant="plain" height="auto" justifyContent="start" whiteSpace="normal" textAlign="left" colorPalette="teal" p={0}
              aria-label={`${disabled ? "View" : "Edit"} Context ${registryDisplayText(context.label)}`} onClick={() => onManageContexts(id)}>{registryDisplayText(context.label)}</Button>
              : <Text>Missing Context</Text>}
              {reason ? <Stack gap={1} mt={1}><Text fontSize="xs" color="fg.error">{reason}</Text>
                {!disabled ? <Button size="xs" variant="plain" colorPalette="red" alignSelf="start" p={0} onClick={() => change((entry) => {
                  entry.allowedContextIds = entry.allowedContextIds.filter((value) => value !== id);
                  entry.allowedDomains = domainsForCapability(snapshot, entry);
                })}>Remove invalid Context</Button> : null}</Stack> : null}
            </Table.Cell>
            <Table.Cell>{context?.primaryDomains.length === 1 && snapshot.allowedDomains.includes(context.primaryDomains[0])
              ? DOMAIN_LABELS[context.primaryDomains[0]] ?? context.primaryDomains[0]
              : <Text fontSize="sm" color="fg.error">One valid Domain required</Text>}</Table.Cell>
          </Table.Row>)}</Table.Body>
        </Table.Root>
        {!selectedContexts.length ? <Text p={3} fontSize="sm" color="fg.warning">Choose at least one compatible Context.</Text> : null}
      </Box>
      {domainsNeedRepair ? <Stack gap={2}>
        <Text fontSize="sm" color="fg.error">Saved allowed Domains do not match the Domains of the selected Contexts.</Text>
        {!disabled ? <Button size="sm" variant="outline" alignSelf="start" onClick={() => change((entry) => {
          entry.allowedDomains = domainsForCapability(snapshot, entry);
        })}>Use Context Domains</Button> : null}
      </Stack> : null}
      {!disabled ? <Collapsible.Content>
        <Box pt={3}><RegistryMultiSelect label="Allowed contexts" options={snapshot.contextOptions.filter((entry) => !contextCompatibilityIssue(snapshot, entry, capability)).map((entry) => ({ id: entry.id, label: `${registryDisplayText(entry.label)} · ${DOMAIN_LABELS[entry.primaryDomains[0]] ?? entry.primaryDomains[0]}` }))}
          values={capability.allowedContextIds} onChange={(values) => change((entry) => {
            entry.allowedContextIds = values;
            entry.allowedDomains = domainsForCapability(snapshot, entry);
          })} /></Box>
        <Button mt={2} size="sm" variant="plain" onClick={() => onManageContexts()}>Manage Context definitions</Button>
      </Collapsible.Content> : null}
      </Collapsible.Root>
      <RegistryTaskRules snapshot={snapshot} capability={capability} change={change} disabled={disabled} />
      <RegistryConfigurationActions key={capabilityKey(capability)} snapshot={snapshot} capability={capability} update={update} disabled={disabled} onSelect={onSelect} onRemoved={onRemoved} />
    </Stack>
  );
}
