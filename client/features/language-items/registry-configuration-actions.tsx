import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { capabilityKey } from "./registry-capability";
import {
  addRegistryConfiguration, configurationBindings,
  removeRegistryConfiguration, compatibleConfigurationPrimaries, type UpdateRegistryConfiguration,
} from "./registry-configuration";
import { SelectField } from "./registry-form-controls";
import { registryCombinationName } from "./registry-reference-labels";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export function RegistryConfigurationActions({ snapshot, capability, update, disabled, onSelect, onRemoved }: {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  update: UpdateRegistryConfiguration;
  disabled: boolean;
  onSelect: (capability: RegistryCapability) => void;
  onRemoved?: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [primaryId, setPrimaryId] = useState("");
  const options = compatibleConfigurationPrimaries(snapshot, capability);
  const bindings = configurationBindings(snapshot, capability);
  const add = () => {
    const preview = structuredClone(snapshot);
    const created = addRegistryConfiguration(preview, capability, primaryId);
    if (!created) return;
    update((next) => { addRegistryConfiguration(next, capability, primaryId, created.itemRuleId); });
    onSelect(created);
    setAdding(false);
    setPrimaryId("");
  };
  const remove = () => {
    const replacement = snapshot.capabilities.find((entry) => capabilityKey(entry) !== capabilityKey(capability));
    if (!window.confirm(`Remove these item rules?\n${registryCombinationName(snapshot, capability)}\nTheir difficulty, review and language assessment rules are removed from this draft. The Can-do statement and published settings remain.`)) return;
    update((next) => { removeRegistryConfiguration(next, capability); });
    if (onRemoved) onRemoved(); else if (replacement) onSelect(replacement);
  };
  if (disabled) return null;
  return (
    <Stack gap={3}>
      {options.length ? <Button alignSelf="start" variant="outline" size="sm" onClick={() => setAdding((value) => !value)}>
        {adding ? "Cancel new item rules" : "Add item rules"}
      </Button> : null}
      {adding && options.length ? <HStack align="end" gap={3}>
        <Box flex="1"><SelectField label="Primary Can-do" value={primaryId}
          placeholder="Select Primary Can-do" options={options} onChange={setPrimaryId} /></Box>
        <Button size="sm" disabled={!bindings.scoringContract || !bindings.taskFamilyMatches || !options.some((entry) => entry.id === primaryId)} onClick={add}>Add item rules</Button>
      </HStack> : null}
      <Box as="details">
        <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Manage item rules</Text>
        <Button mt={3} size="sm" variant="outline" colorPalette="red" onClick={remove}>Remove these item rules</Button>
      </Box>
    </Stack>
  );
}
