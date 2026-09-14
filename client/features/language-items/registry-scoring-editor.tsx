import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { ITEM_FORMAT_LABELS, WORKBENCH_LABELS } from "./labels";
import { ReadOnlyField, SelectField, TextField, TextListField } from "./registry-form-controls";
import { registryItemRuleName } from "./registry-reference-labels";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { ScoringContractSummary, ScoringPolicySummary } from "./types";

const POLICIES = [
  ["normalization", "Normalization"], ["partialCredit", "Partial credit"], ["invalidResponse", "Invalid response"],
  ["technicalIncident", "Technical incident"], ["adjudication", "Adjudication"], ["raterQualification", "Rater qualification"],
] as const;

export function RegistryScoringEditor({ snapshot, update, disabled, selectedId }: SharedRegistryEditorProps) {
  const contracts = snapshot.scoringContracts ?? [];
  const [id, setId] = useState(selectedId || contracts[0]?.scoringContractTemplateId || "");
  const entry = contracts.find((contract) => contract.scoringContractTemplateId === id);
  if (!entry) return <Text color="fg.muted">No scoring contract is available for this selection.</Text>;
  const change = (mutate: (contract: ScoringContractSummary) => void) => update((next) => {
    const current = next.scoringContracts?.find((contract) => contract.scoringContractTemplateId === id);
    if (current) mutate(current);
  });
  const policy = (key: typeof POLICIES[number][0], mutate: (policy: ScoringPolicySummary) => void) => update((next) => {
    for (const contract of next.scoringContracts ?? []) if (contract[key].policyId === entry[key].policyId) mutate(contract[key]);
  });
  return <Stack gap={4}>
    <SelectField label={WORKBENCH_LABELS.scoringContract} value={id} options={contracts.map((contract) => ({ id: contract.scoringContractTemplateId,
      label: contract.displayName ?? `${contract.itemRuleIds.map((ruleId) => registryItemRuleName(snapshot, ruleId)).join(" / ")} · ${ITEM_FORMAT_LABELS[contract.itemFormatId] ?? "Item format"}` }))} onChange={setId} />
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <ReadOnlyField label="Used by item rules" value={entry.itemRuleIds.map((ruleId) => registryItemRuleName(snapshot, ruleId)).join(" / ")} />
      <ReadOnlyField label={WORKBENCH_LABELS.itemFormat} value={ITEM_FORMAT_LABELS[entry.itemFormatId] ?? WORKBENCH_LABELS.itemFormat} />
      <ReadOnlyField label="Scoring type" value={entry.scoringType} /><ReadOnlyField label="Contract status" value={entry.status} />
    </SimpleGrid>
    <TextListField label="Item-specific scoring requirements" values={entry.taskSpecificRequirements} disabled={disabled} onChange={(values) => change((contract) => { contract.taskSpecificRequirements = values; })} />
    <TextField label="Score cap or exclusion" value={entry.capOrExclusion ?? ""} disabled={disabled} onChange={(value) => change((contract) => { contract.capOrExclusion = value || undefined; })} />
    <SimpleGrid columns={{ base: 1, xl: 2 }} gap={3}>{POLICIES.map(([key, label]) => {
      const current = entry[key];
      const usedBy = contracts.filter((contract) => contract[key].policyId === current.policyId).length;
      return <Box key={key} borderWidth="1px" borderRadius="md" p={3}><Stack gap={3}>
        <Text fontWeight="medium">{label}</Text>
        {usedBy > 1 ? <Text fontSize="xs" color="fg.muted">Shared by {usedBy} scoring contracts; applying edits updates all of them.</Text> : null}
        <TextField label="Summary" value={current.summary} disabled={disabled || current.policyId === "notApplicable"} onChange={(value) => policy(key, (next) => { next.summary = value; })} />
        <TextListField label="Details" values={current.details} disabled={disabled || current.policyId === "notApplicable"} onChange={(values) => policy(key, (next) => { next.details = values; })} />
      </Stack></Box>;
    })}</SimpleGrid>
  </Stack>;
}
