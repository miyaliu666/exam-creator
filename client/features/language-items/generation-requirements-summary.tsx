import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";

import { normalizedInformationPoint } from "./information-points";
import { contentOptionLabel } from "./labels";
import type { RegistrySnapshot, TaskPackage } from "./types";

export function GenerationRequirementsSummary({ draft, registry }: {
  draft: Pick<TaskPackage, "content">;
  registry: RegistrySnapshot | undefined;
}) {
  const supportingRefs = draft.content.supportingContentRefs ?? [];
  return <Stack gap={4}>
    <Box>
      <Text fontWeight="medium" mb={2}>What this item should assess</Text>
      <HStack flexWrap="wrap" gap={2}>
        {draft.content.targetContentIds.length ? draft.content.targetContentIds.map((id) =>
          <Badge key={id} colorPalette="teal" whiteSpace="normal">{contentOptionLabel(id, registry)}</Badge>,
        ) : <Text color="fg.muted">—</Text>}
      </HStack>
    </Box>
    <Box>
      <Text fontWeight="medium" mb={2}>Key information</Text>
      {draft.content.requiredInformationPoints.length ? <Stack as="ol" gap={1} ps={5}>
        {draft.content.requiredInformationPoints.map((point, index) =>
          <Text as="li" key={index}>{normalizedInformationPoint(point, index).label || "—"}</Text>,
        )}
      </Stack> : <Text color="fg.muted">—</Text>}
    </Box>
    {supportingRefs.length ? <Box>
      <Text fontWeight="medium" mb={2}>Supporting material types</Text>
      <Stack gap={1}>{supportingRefs.map((id) => <Text key={id}>{contentOptionLabel(id, registry)}</Text>)}</Stack>
    </Box> : null}
  </Stack>;
}
