import { Box, Grid, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

export function DraftPreparationLayout({ candidatesFirst, requirementsNeedAttention, requirementsNeedRepair, requirements, generation, candidates }: {
  candidatesFirst: boolean;
  requirementsNeedAttention: boolean;
  requirementsNeedRepair: boolean;
  requirements: ReactNode;
  generation: ReactNode;
  candidates: ReactNode;
}) {
  if (candidatesFirst) return <Stack gap={4}>
    {candidates}
    <Box asChild borderWidth="1px" borderRadius="lg" p={4}><details open={requirementsNeedAttention || undefined}>
      <Text as="summary" cursor="pointer" fontWeight="medium">
        {requirementsNeedRepair ? "Repair generation requirements" : "Generation requirements"}
      </Text>
      <Box mt={4}>{requirements}</Box>
    </details></Box>
    <Box asChild borderWidth="1px" borderRadius="lg" p={4}><details open={requirementsNeedAttention || undefined}>
      <Text as="summary" cursor="pointer" fontWeight="medium">Generate more AI drafts</Text>
      <Stack mt={4} gap={3}>{generation}</Stack>
    </details></Box>
  </Stack>;
  return <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(320px, 0.75fr)" }} gap={6}>
    {requirements}
    <Stack gap={4} borderWidth="1px" borderRadius="xl" p={5} alignSelf="start">
      {generation}
      {candidates}
    </Stack>
  </Grid>;
}
