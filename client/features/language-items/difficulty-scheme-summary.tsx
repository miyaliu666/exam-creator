import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { DIFFICULTY_LABELS } from "./labels";
import { registryDisplayText } from "./registry-display-text";
import type { DifficultyProfile } from "./types";

export function DifficultySchemeSummary({ difficulty }: { difficulty: DifficultyProfile | undefined }) {
  if (!difficulty) return <Text color="fg.error">The difficulty scheme could not be loaded.</Text>;
  const drivers = difficulty.drivers;
  const fields = [
    ["Input length", registryDisplayText(drivers.inputLength)],
    ["Key information required", String(drivers.informationPoints)],
    ["Contextual support", registryDisplayText(drivers.supportLevel)],
    ["Distractor similarity", registryDisplayText(drivers.distractorSimilarity)],
    ["Independence", registryDisplayText(drivers.independenceLevel)],
    ["Inference required", drivers.inferenceRequired ? "Yes" : "No"],
  ];
  return <Stack gap={3} fontSize="sm">
    <Text fontWeight="medium">{DIFFICULTY_LABELS[difficulty.intendedBand] ?? difficulty.intendedBand} requirements</Text>
    <Text color="fg.muted">This item uses a complete difficulty scheme. Maintain its rules in Assessment Settings.</Text>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      {fields.map(([label, value]) => <Box key={label}><Text fontSize="xs" color="fg.muted">{label}</Text><Text>{value}</Text></Box>)}
    </SimpleGrid>
    {difficulty.rationale.map((line, index) => <Text key={index} color="fg.muted">{registryDisplayText(line)}</Text>)}
  </Stack>;
}
