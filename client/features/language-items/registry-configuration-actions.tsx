import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { capabilityKey } from "./registry-capability";
import {
  addRegistryConfiguration, configurationBindings, configurationSiblings,
  removeRegistryConfiguration, unusedConfigurationPrimaries, type UpdateRegistryConfiguration,
} from "./registry-configuration";
import { SelectField } from "./registry-form-controls";
import { registryCombinationName } from "./registry-reference-labels";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export function RegistryConfigurationActions({ snapshot, capability, update, disabled, onSelect }: {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  update: UpdateRegistryConfiguration;
  disabled: boolean;
  onSelect: (capability: RegistryCapability) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [primaryId, setPrimaryId] = useState("");
  const options = unusedConfigurationPrimaries(snapshot, capability);
  const siblings = configurationSiblings(snapshot, capability);
  const bindings = configurationBindings(snapshot, capability);
  const add = () => {
    const preview = { ...snapshot, capabilities: [...snapshot.capabilities],
      capabilityDifficultyProfileSets: [...(snapshot.capabilityDifficultyProfileSets ?? [])] };
    const created = addRegistryConfiguration(preview, capability, primaryId);
    if (!created) return;
    update((next) => { addRegistryConfiguration(next, capability, primaryId); });
    onSelect(created);
    setAdding(false);
    setPrimaryId("");
  };
  const remove = () => {
    const replacement = siblings.find((entry) => capabilityKey(entry) !== capabilityKey(capability));
    if (!replacement || !window.confirm(`Remove this configuration?\n${registryCombinationName(snapshot, capability)}\nThe Can-do library entry will remain.`)) return;
    update((next) => { removeRegistryConfiguration(next, capability); });
    onSelect(replacement);
  };
  if (disabled) return null;
  return (
    <Stack gap={3}>
      {options.length ? <Button alignSelf="start" variant="outline" size="sm" onClick={() => setAdding((value) => !value)}>
        {adding ? "Cancel new configuration" : "Add configuration"}
      </Button> : null}
      {adding && options.length ? <HStack align="end" gap={3}>
        <Box flex="1"><SelectField label="Primary Can-do" value={primaryId}
          options={[{ id: "", label: "Select" }, ...options]} onChange={setPrimaryId} /></Box>
        <Button size="sm" disabled={!bindings.scoringContract || !bindings.taskFamilyMatches || !options.some((entry) => entry.id === primaryId)} onClick={add}>Add configuration</Button>
      </HStack> : null}
      {siblings.length > 1 ? <Box as="details">
        <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Manage configuration</Text>
        <Button mt={3} size="sm" variant="outline" colorPalette="red" onClick={remove}>Remove this configuration</Button>
      </Box> : null}
    </Stack>
  );
}
