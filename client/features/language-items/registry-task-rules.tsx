import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { ITEM_FORMAT_LABELS } from "./labels";
import { InvalidSelections, ReadOnlyField, TextField, TextListField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import { registryReferenceName } from "./registry-reference-labels";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export function RegistryTaskRules({ snapshot, capability, disabled, change }: {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  disabled: boolean;
  change: (mutate: (capability: RegistryCapability) => void) => void;
}) {
  const invalidSupporting = [...new Set(capability.supportingCanDoIds ?? [])].flatMap((id) => {
    const canDo = snapshot.canDoOptions.find((entry) => entry.id === id);
    const reason = !canDo ? "This Can-do no longer exists." : id === capability.primaryCanDoId ? "Primary Can-do cannot also be supporting." : null;
    return reason ? [{ id, label: canDo?.label ?? "Missing Can-do", reason }] : [];
  });
  return (
    <Box as="details" borderTopWidth="1px" pt={3}>
      <Text as="summary" cursor="pointer" fontWeight="medium">Task rules
        {invalidSupporting.length ? <Text as="span" color="fg.error" fontSize="sm"> · {invalidSupporting.length} {invalidSupporting.length === 1 ? "issue" : "issues"}</Text> : null}
      </Text>
      <Stack gap={4} pt={4}>
        <RegistryMultiSelect label="Supporting Can-do" options={snapshot.canDoOptions.filter((entry) => entry.id !== capability.primaryCanDoId)} values={capability.supportingCanDoIds ?? []} disabled={disabled} onChange={(values) => change((entry) => { entry.supportingCanDoIds = values; })} />
        <InvalidSelections label="Invalid supporting Can-do" entries={invalidSupporting} disabled={disabled} onRemove={(id) => change((entry) => { entry.supportingCanDoIds = entry.supportingCanDoIds?.filter((value) => value !== id); })} />
        <TextField label="Observable evidence" value={capability.observableEvidence} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.observableEvidence = value; })} />
        <TextField label="A1 boundary" value={capability.a1Boundary ?? ""} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.a1Boundary = value; })} />
        <TextField label="Task family coverage" value={capability.taskFamilyCoreBehavior ?? ""} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.taskFamilyCoreBehavior = value; })} />
        <TextField label="Task structure" value={capability.taskStructure} multiline disabled={disabled} onChange={(value) => change((entry) => { entry.taskStructure = value; })} />
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
          <TextField label="Valid reference task" value={capability.referenceTask} disabled={disabled} onChange={(value) => change((entry) => { entry.referenceTask = value; })} />
          <TextField label="Invalid reference task" value={capability.invalidReferenceTask ?? ""} disabled={disabled} onChange={(value) => change((entry) => { entry.invalidReferenceTask = value; })} />
        </SimpleGrid>
        <TextListField label="Prohibited uses" values={capability.prohibitedUses} disabled={disabled} onChange={(values) => change((entry) => { entry.prohibitedUses = values; })} />
        <Box as="details">
          <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Delivery rules</Text>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={3}>
            <ReadOnlyField label="Presentation" value={registryReferenceName(snapshot, capability.rendererId, `${ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Item"} presentation`)} />
            {Object.entries(capability.deliveryPolicyRefs ?? {}).map(([key, id]) => <ReadOnlyField key={key}
              label={({ navigationPolicyId: "Navigation", inputPolicyId: "Input", playbackPolicyId: "Playback", recordingPolicyId: "Recording", speakingRateProfileId: "Speaking rate", pauseProfileId: "Pauses" } as Record<string, string>)[key] ?? "Delivery rule"}
              value={registryReferenceName(snapshot, id, "Configured")} />)}
          </SimpleGrid>
        </Box>
      </Stack>
    </Box>
  );
}
