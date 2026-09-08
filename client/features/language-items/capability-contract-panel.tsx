import { Box, SimpleGrid, Text } from "@chakra-ui/react";

import { DIFFICULTY_LABELS, DOMAIN_LABELS, ITEM_FORMAT_LABELS } from "./labels";
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
        <Text color="fg.error">The exam task and item format could not be loaded.</Text>
      </Box>
    );
  }

  const context = registry.contextOptions.find((entry) => entry.id === draft.content.contextId);
  const primaryCanDo = registry.canDoOptions.find((entry) => entry.id === capability.primaryCanDoId);
  const fields = [
    ["Exam task", registryDisplayText(capability.title)],
    ["Item format", ITEM_FORMAT_LABELS[draft.itemFormatId] ?? "Unavailable"],
    ["Primary Can-do", primaryCanDo ? registryDisplayText(primaryCanDo.label) : "Unavailable"],
    ["Domain", DOMAIN_LABELS[draft.content.primaryDomain] ?? "Unavailable"],
    ["Context", context ? registryDisplayText(context.label) : "Unavailable"],
    ["Difficulty", DIFFICULTY_LABELS[draft.content.difficultyBand] ?? "Unavailable"],
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
