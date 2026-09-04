import { Badge, Box, Heading, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { ITEM_FORMAT_LABELS, SKILL_LABELS, optionLabel, slotLabel } from "./labels";
import type { RegistrySnapshot, TaskPackage } from "./types";

interface CapabilityContractPanelProps {
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
}

const ACTIVITY_LABELS: Record<string, string> = {
  Reception: "Reception",
  Production: "Production",
  Interaction: "Interaction",
  Mediation: "Mediation",
};

const FORMAT_STRUCTURE: Record<string, string> = {
  "IF-SINGLE-SELECT": "One stimulus, one question, and at least two options.",
  "IF-MATCHING": "At least two prompts matched with the available answers.",
  "IF-RESTRICTED-INPUT": "A short stimulus followed by fields for explicit information.",
  "IF-FORM-ENTRY": "Four to six short form fields.",
  "IF-TYPED-MESSAGE": "A short message with a specified recipient, purpose, and content points.",
  "IF-SPOKEN-SINGLE": "One short spoken response to a visible or audio prompt.",
  "IF-SPOKEN-MULTITURN": "A short fixed-path exchange with at least one prompt and response.",
};

export function CapabilityContractPanel({ draft, registry }: CapabilityContractPanelProps) {
  const capability = registry?.capabilities.find(
    (entry) =>
      entry.blueprintSlotId === draft.blueprintSlotId &&
      entry.itemFormatId === draft.itemFormatId,
  );

  if (!capability || !registry) {
    return (
      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <Text color="fg.error">The exam task and item format could not be loaded.</Text>
      </Box>
    );
  }

  const activities = capability.communicativeActivities?.length
    ? capability.communicativeActivities
    : [capability.communicativeActivity];

  return (
    <Stack borderWidth="1px" borderRadius="xl" p={5} gap={4}>
      <SimpleGrid minChildWidth="240px" gap={4}>
        <Box>
          <Text fontSize="sm" color="fg.muted">Exam task</Text>
          <Heading size="md" mt={1}>
            {slotLabel(draft.blueprintSlotId, registry, draft.itemFormatId)}
          </Heading>
        </Box>
        <Box>
          <Text fontSize="sm" color="fg.muted">Can-do</Text>
          <Text mt={1} fontWeight="semibold">
            {optionLabel(capability.primaryCanDoId, registry.canDoOptions)}
          </Text>
        </Box>
        <Box>
          <Text fontSize="sm" color="fg.muted">Item format</Text>
          <Text mt={1} fontWeight="semibold">
            {ITEM_FORMAT_LABELS[capability.itemFormatId] ?? capability.itemFormatId}
          </Text>
        </Box>
      </SimpleGrid>

      <HStack flexWrap="wrap">
        <Badge variant="outline">
          {SKILL_LABELS[capability.primaryReportedSkill] ?? capability.primaryReportedSkill}
        </Badge>
        {activities.filter(Boolean).map((activity) => (
          <Badge key={activity} variant="outline" colorPalette="purple">
            {ACTIVITY_LABELS[activity] ?? activity}
          </Badge>
        ))}
      </HStack>

      <Box as="details" borderTopWidth="1px" pt={3}>
        <Text as="summary" cursor="pointer" fontWeight="semibold">
          View capability boundary and authoring guidance
        </Text>
        <Stack mt={3} gap={3} fontSize="sm">
          <Box>
            <Text color="fg.muted">Required evidence</Text>
            <Text>{optionLabel(capability.primaryCanDoId, registry.canDoOptions)}</Text>
          </Box>
          <Box>
            <Text color="fg.muted">A1 boundary</Text>
            <Text>Use short, explicit language with strong contextual support and no complex inference.</Text>
          </Box>
          <Box>
            <Text color="fg.muted">Task structure</Text>
            <Text>{FORMAT_STRUCTURE[capability.itemFormatId] ?? "Use the registered exercise-template structure."}</Text>
          </Box>
          <Box>
            <Text color="fg.muted">Avoid</Text>
            <Text color="fg.warning">Do not add hidden requirements, unnecessary cultural knowledge, or language above A1.</Text>
          </Box>
          <Box>
            <Text color="fg.muted">Authoring reference</Text>
            <Text>Keep every required response unit explicit, observable, and consistent with the selected template.</Text>
          </Box>
        </Stack>
      </Box>
    </Stack>
  );
}
