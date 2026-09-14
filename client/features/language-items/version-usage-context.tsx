import { Box, Button, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { getLanguageItemRegistry } from "./api";
import { optionLabel, DIFFICULTY_LABELS, exerciseLabel, WORKBENCH_LABELS } from "./labels";
import { registryDisplayText } from "./registry-display-text";
import type { LanguageItemVersion } from "./types";

export function VersionUsageContext({ version }: { version: LanguageItemVersion }) {
  const package_ = version.package;
  const registryVersion = package_.specVersions.registryBundleVersion;
  const registry = useQuery({ queryKey: ["language-item-registry", registryVersion], queryFn: () => getLanguageItemRegistry(registryVersion) });
  const context = registry.data?.contextOptions.find((entry) => entry.id === package_.content.contextId);
  const fields = [
    [WORKBENCH_LABELS.itemFormat, exerciseLabel(package_.itemFormatId, package_.content.primaryReportedSkill)],
    [WORKBENCH_LABELS.primaryCanDo, optionLabel(package_.content.primaryCanDoId, registry.data?.canDoOptions)],
    [WORKBENCH_LABELS.domain, package_.content.primaryDomain],
    [WORKBENCH_LABELS.context, context ? registryDisplayText(context.label) : package_.content.contextId || "No Context restriction"],
    [WORKBENCH_LABELS.difficulty, DIFFICULTY_LABELS[package_.content.difficultyBand] ?? package_.content.difficultyBand],
  ];
  return <Box as="details" borderWidth="1px" borderRadius="md" p={3}>
    <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Version {version.versionNumber} · saved {new Date(version.createdAt).toLocaleString("en-GB")}</Text>
    <Stack mt={3} gap={2}>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>{fields.map(([label, value]) => <Box key={label}><Text fontSize="xs" color="fg.muted">{label}</Text><Text fontSize="sm">{value}</Text></Box>)}</SimpleGrid>
      {registry.isError ? <Stack gap={1}><Text role="alert" fontSize="sm" color="fg.error">{registry.error.message}</Text><Button alignSelf="start" size="sm" variant="outline" onClick={() => void registry.refetch()}>Retry version settings</Button></Stack> : null}
    </Stack>
  </Box>;
}
