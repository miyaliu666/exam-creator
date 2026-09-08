import { Box, SimpleGrid, Text } from "@chakra-ui/react";

import { DIFFICULTY_LABELS, DOMAIN_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, slotLabel } from "./labels";
import { capabilityForDraft } from "./registry-capability";
import { registryDisplayText } from "./registry-display-text";
import type { RegistrySnapshot, TaskPackage } from "./types";

interface CapabilityContractPanelProps {
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
}

export function CapabilityContractPanel({ draft, registry }: CapabilityContractPanelProps) {
  const capability = capabilityForDraft(registry, draft);

  if (!capability || !registry) {
    return (
      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <Text color="fg.error">The blueprint slot and item format could not be loaded.</Text>
      </Box>
    );
  }

  const context = registry.contextOptions.find((entry) => entry.id === draft.content.contextId);
  const primaryCanDo = registry.canDoOptions.find((entry) => entry.id === capability.primaryCanDoId);
  const fields = [
    [WORKBENCH_LABELS.blueprintSlot, slotLabel(draft.blueprintSlotId, registry)],
    [WORKBENCH_LABELS.itemFormat, ITEM_FORMAT_LABELS[draft.itemFormatId] ?? "Unavailable"],
    [WORKBENCH_LABELS.primaryCanDo, primaryCanDo ? registryDisplayText(primaryCanDo.label) : "Unavailable"],
    [WORKBENCH_LABELS.domain, DOMAIN_LABELS[draft.content.primaryDomain] ?? "Unavailable"],
    [WORKBENCH_LABELS.context, context ? registryDisplayText(context.label) : "Unavailable"],
    [WORKBENCH_LABELS.difficulty, DIFFICULTY_LABELS[draft.content.difficultyBand] ?? "Unavailable"],
  ];

  return (
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3} borderWidth="1px" borderRadius="lg" p={4}>
      {fields.map(([label, value]) => (
        <Box key={label}>
          <Text fontSize="xs" color="fg.muted">{label}</Text>
          <Text fontSize="sm" fontWeight="medium">{value}</Text>
        </Box>
      ))}
    </SimpleGrid>
  );
}
