import { Box, Button, Dialog, Field, NativeSelect, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { isContentOptionCompatible } from "./content-compatibility";
import { DifficultySchemeSummary } from "./difficulty-scheme-summary";
import { applyItemSetup, itemSetupSelection, selectedDifficulty, type ItemSetupSelection } from "./item-setup";
import { contentOptionLabel, DOMAIN_LABELS, WORKBENCH_LABELS } from "./labels";
import { capabilityForDraft, contextsForCapability, difficultyStandardsForCapability } from "./registry-capability";
import { registryDisplayText } from "./registry-display-text";
import type { RegistrySnapshot, TaskPackage } from "./types";

export function ItemSetupDialog({ draft, registry, onApply, onClose }: {
  draft: TaskPackage;
  registry: RegistrySnapshot;
  onApply: (selection: ItemSetupSelection) => void;
  onClose: () => void;
}) {
  const [selection, setSelection] = useState(() => itemSetupSelection(draft));
  const capability = capabilityForDraft(registry, draft);
  const contexts = contextsForCapability(registry, capability);
  const domains = registry.allowedDomains.filter((domain) => contexts.some((context) => context.primaryDomains.includes(domain)));
  const allowedContexts = contexts.filter((context) => context.primaryDomains.includes(selection.domain));
  const standards = difficultyStandardsForCapability(registry, capability);
  const valid = allowedContexts.some((context) => context.id === selection.contextId) && standards.some((standard) => standard.id === selection.difficultyBand);
  const changed = JSON.stringify(selection) !== JSON.stringify(itemSetupSelection(draft));
  const preview = structuredClone(draft);
  if (standards.some((standard) => standard.id === selection.difficultyBand)) applyItemSetup(preview, selection, registry);
  const difficulty = selectedDifficulty(preview, registry);
  const incompatible = [...draft.content.targetContentIds, ...(draft.content.supportingContentRefs ?? [])].filter((id) => {
    const entry = registry.contentIdOptions.find((option) => option.id === id);
    return !entry || !isContentOptionCompatible(entry, capability, selection.contextId);
  });
  const expectedPoints = difficulty?.drivers.informationPoints ?? 1;
  const fields = [
    { label: WORKBENCH_LABELS.domain, key: "domain" as const, options: domains.map((value) => ({ value, label: DOMAIN_LABELS[value] ?? value })) },
    { label: WORKBENCH_LABELS.context, key: "contextId" as const, options: allowedContexts.map((entry) => ({ value: entry.id, label: registryDisplayText(entry.label) })) },
    { label: WORKBENCH_LABELS.difficulty, key: "difficultyBand" as const, options: standards.map((entry) => ({ value: entry.id, label: registryDisplayText(entry.label) })) },
  ];
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && onClose()} scrollBehavior="inside">
    <Dialog.Backdrop />
    <Dialog.Positioner><Dialog.Content maxW="xl">
      <Dialog.Header><Dialog.Title>Edit item setup</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        <Text fontSize="sm" color="fg.muted">Correct this item's selections using its published assessment rules. Changes take effect when you apply them.</Text>
        {fields.map(({ label, key, options }) => <Field.Root key={key}>
          <Field.Label>{label}</Field.Label>
          <NativeSelect.Root><NativeSelect.Field aria-label={label} value={selection[key]} onChange={(event) => {
            const value = event.target.value;
            setSelection((current) => ({ ...current, [key]: value,
              ...(key === "domain" && !contexts.some((context) => context.id === current.contextId && context.primaryDomains.includes(value)) ? { contextId: "" } : {}),
            }));
          }}>
            {!options.some((option) => option.value === selection[key]) ? <option value={selection[key]} disabled>{selection[key] ? "Unavailable selection" : `Select ${label.toLowerCase()}`}</option> : null}
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        </Field.Root>)}
        <Box borderWidth="1px" borderRadius="lg" p={4}><DifficultySchemeSummary difficulty={difficulty} /></Box>
        {changed ? <Stack role="status" borderWidth="1px" borderRadius="lg" p={4} gap={2} fontSize="sm">
          <Text fontWeight="semibold">Review the effect of these changes</Text>
          <Text>Your item text, answers, language targets, and key information will be kept. Review them against the new selections and run checks again.</Text>
          {incompatible.length ? <Text color="fg.warning">Language content to resolve in Prepare: {incompatible.map((id) => contentOptionLabel(id, registry)).join(", ")}.</Text> : null}
          {draft.content.requiredInformationPoints.length !== expectedPoints ? <Text color="fg.warning">The scheme requires {expectedPoints} information point{expectedPoints === 1 ? "" : "s"}; you have {draft.content.requiredInformationPoints.length}. Add missing information or explicitly remove extra points in Prepare.</Text> : null}
        </Stack> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={onClose}>Cancel</Button><Button colorPalette="teal" disabled={!valid || !changed} onClick={() => onApply(selection)}>Apply changes</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
