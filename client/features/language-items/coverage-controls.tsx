import { Box, Button, HStack, NativeSelect, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { DIFFICULTY_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, optionLabel, slotLabel } from "./labels";
import { coverageContentOptions, coverageOptionGroups } from "./coverage-labels";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { CoverageFilters, CoverageRequest } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: Array<{ id: string; label: string }>; onChange: (value: string) => void;
}) {
  return <Box><Text fontSize="sm" mb={1}>{label}</Text><NativeSelect.Root size="sm"><NativeSelect.Field aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Box>;
}

export function CoverageControls({ registry, versions, request, onChange, overview = false }: {
  registry: RegistrySnapshot; versions: string[]; request: CoverageRequest; onChange: (update: Partial<CoverageRequest>) => void; overview?: boolean;
}) {
  const capabilities = registry.capabilities;
  const unique = (values: string[]) => [...new Set(values)].sort().map((id) => ({ id, label: id }));
  const dimensions: Array<{ key: keyof CoverageFilters; label: string; options: Array<{ id: string; label: string }> }> = [
    { key: "skill", label: "Skill", options: unique(capabilities.map((value) => value.primaryReportedSkill)) },
    { key: "activity", label: "Communicative activity", options: unique(capabilities.flatMap((value) => value.communicativeActivities?.length ? value.communicativeActivities : [value.communicativeActivity])) },
    { key: "domain", label: WORKBENCH_LABELS.domain, options: unique(registry.allowedDomains) },
    { key: "contextId", label: WORKBENCH_LABELS.context, options: registry.contextOptions.map(({ id }) => ({ id, label: optionLabel(id, registry.contextOptions) })) },
    { key: "blueprintSlotId", label: WORKBENCH_LABELS.blueprintSlot, options: unique(capabilities.map((value) => value.blueprintSlotId)).map(({ id }) => ({ id, label: slotLabel(id, registry) })) },
    { key: "primaryCanDoId", label: WORKBENCH_LABELS.primaryCanDo, options: registry.canDoOptions.map(({ id }) => ({ id, label: optionLabel(id, registry.canDoOptions) })) },
    { key: "difficultyBand", label: WORKBENCH_LABELS.difficulty, options: registry.difficultyBands.map((id) => ({ id, label: DIFFICULTY_LABELS[id] ?? id })) },
    { key: "itemFormatId", label: WORKBENCH_LABELS.itemFormat, options: unique(capabilities.map((value) => value.itemFormatId)).map(({ id }) => ({ id, label: ITEM_FORMAT_LABELS[id] ?? id })) },
  ];
  const targetIds = new Set(registry.contentIdOptions.filter((option) => option.kind !== "supported").map((option) => option.id));
  const contentOptions = coverageContentOptions(registry).filter((option) => targetIds.has(option.id));
  const optionGroups = coverageOptionGroups(registry).filter((group) => group.id !== "supported");
  const versionOptions = [versions[0], ...[...new Set(versions)].filter((id) => id !== versions[0]).sort()]
    .map((id, index) => ({ id, label: index === 0 ? "Current" : `Previous version ${index}` }));
  const hasMoreFilters = dimensions.some(({ key }) => !!request.filters[key]) ||
    (!overview && request.excludedIds.length > 0) || request.registryVersion !== versions[0];
  const contentLabel = (id: string) => contentOptions.find((option) => option.id === id)?.label ?? `${id} (unresolved reference)`;
  const contentList = (ids: string[]) => ids.map(contentLabel).join("; ") || "None";
  return <Stack gap={4}>
    {!overview && <>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
      <RegistryMultiSelect label="Language targets" values={request.selectedIds} optionGroups={optionGroups}
        options={contentOptions.filter((option) => !request.excludedIds.includes(option.id))} onChange={(selectedIds) => onChange({ selectedIds })} />
      {request.pattern === undefined && <SelectField label="Match" value={request.matchMode} options={[
        { id: "all", label: request.selectedIds.length ? "All selected targets" : "No language filter" },
        ...(request.selectedIds.length > 1 || request.matchMode === "any" ? [{ id: "any", label: "Any selected target" }] : []),
        { id: "exact", label: request.selectedIds.length ? "Exactly these targets" : "No assessment targets" },
      ]} onChange={(matchMode) => onChange({ matchMode: matchMode as CoverageRequest["matchMode"] })} />}
    </SimpleGrid>
    {request.pattern !== undefined && <Stack gap={1} bg="bg.muted" borderRadius="md" p={3}>
      <HStack justify="space-between" align="start">
        <Text fontSize="sm" fontWeight="medium">Target combination</Text>
        <Button size="xs" variant="outline" onClick={() => onChange({ pattern: undefined })}>Clear combination</Button>
      </HStack>
      <Text fontSize="sm">Includes: {contentList(request.pattern)}</Text>
      <Text fontSize="sm">Excludes: {contentList(request.selectedIds.filter((id) => !request.pattern?.includes(id)))}</Text>
    </Stack>}
    </>}
    <details open={hasMoreFilters || undefined}>
      <Box as="summary" cursor="pointer" fontWeight="medium">More filters</Box>
      <Stack gap={4} mt={3}>
        <SimpleGrid columns={{ base: 1, md: 4 }} gap={3}>
          {dimensions.map(({ key, label, options }) => <SelectField key={key} label={label} value={request.filters[key] ?? ""} options={[{ id: "", label: "All" }, ...options]} onChange={(value) => onChange({ filters: { ...request.filters, [key]: value || undefined } })} />)}
        </SimpleGrid>
        {!overview && <RegistryMultiSelect label="Exclude targets" values={request.excludedIds} optionGroups={optionGroups} options={contentOptions.filter((option) => !request.selectedIds.includes(option.id))} onChange={(excludedIds) => onChange({ excludedIds })} />}
        {versionOptions.length > 1 && <SelectField label="Assessment Settings version" value={request.registryVersion} options={versionOptions} onChange={(registryVersion) => onChange({ registryVersion, selectedIds: [], excludedIds: [], filters: {} })} />}
      </Stack>
    </details>
  </Stack>;
}
