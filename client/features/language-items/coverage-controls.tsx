import { Box, NativeSelect, SimpleGrid, Stack, Text } from "@chakra-ui/react";

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

export function CoverageControls({ registry, versions, request, onChange }: {
  registry: RegistrySnapshot; versions: string[]; request: CoverageRequest; onChange: (update: Partial<CoverageRequest>) => void;
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
  const contentOptions = coverageContentOptions(registry);
  const optionGroups = coverageOptionGroups(registry);
  const pointLabel = request.role === "supporting" ? "Supporting material types" : request.role === "either" ? "Targets and material types" : "Assessment targets";
  const activeFilters = dimensions.filter(({ key }) => request.filters[key]);
  const versionOptions = [...new Set(versions)];
  const extraCount = activeFilters.length + request.excludedIds.length + Number(request.registryVersion !== versions[0]);
  return <Stack gap={4}>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <SelectField label="Inventory" value={request.scope} options={[{ id: "approved", label: "Approved items" }, { id: "drafts", label: "Drafts and pending review" }]} onChange={(scope) => onChange({ scope: scope as CoverageRequest["scope"], role: scope === "drafts" && request.role === "confirmed" ? "core" : request.role })} />
      <SelectField label="Count by" value={request.role} options={[
        { id: "core", label: "Planned assessment targets" },
        ...(request.scope === "approved" ? [{ id: "confirmed", label: "Confirmed assessment targets" }] : []),
        { id: "supporting", label: "Supporting material types (advanced)" }, { id: "either", label: "Targets and material types (advanced)" },
      ]} onChange={(role) => onChange({ role: role as CoverageRequest["role"] })} />
    </SimpleGrid>
    {request.role === "confirmed" && <Text fontSize="sm" color="fg.muted">Requires complete evidence of understanding or required production.</Text>}
    {(request.role === "supporting" || request.role === "either") && <Text fontSize="sm" color="fg.muted">Supporting types describe materials such as person names and place names. Their counts show material use, not assessed language ability.</Text>}
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
      <RegistryMultiSelect label={pointLabel} values={request.selectedIds} optionGroups={optionGroups}
        options={contentOptions.filter((option) => !request.excludedIds.includes(option.id))} onChange={(selectedIds) => onChange({ selectedIds })} />
      {request.pattern !== undefined ? <Text fontSize="sm">Match: selected-point pattern</Text> : <SelectField label="Match" value={request.matchMode} options={[
        { id: "all", label: request.selectedIds.length ? "All selected points" : "No language filter" },
        ...(request.selectedIds.length || request.matchMode === "any" ? [{ id: "any", label: "Any selected point" }] : []),
        { id: "exact", label: request.selectedIds.length ? "Only these points (no additional points)" : "No language points" },
      ]} onChange={(matchMode) => onChange({ matchMode: matchMode as CoverageRequest["matchMode"] })} />}
    </SimpleGrid>
    <Box as="details">
      <Box as="summary" cursor="pointer" fontWeight="medium">More filters{extraCount > 0 ? ` · ${extraCount} active` : ""}</Box>
      <Stack gap={4} mt={3}>
        <SimpleGrid columns={{ base: 1, md: 4 }} gap={3}>
          {dimensions.map(({ key, label, options }) => <SelectField key={key} label={label} value={request.filters[key] ?? ""} options={[{ id: "", label: "All" }, ...options]} onChange={(value) => onChange({ filters: { ...request.filters, [key]: value || undefined } })} />)}
        </SimpleGrid>
        <RegistryMultiSelect label="Exclude selected targets (optional)" values={request.excludedIds} optionGroups={optionGroups} options={contentOptions.filter((option) => !request.selectedIds.includes(option.id))} onChange={(excludedIds) => onChange({ excludedIds })} />
        <Text fontSize="xs" color="fg.muted">Choose registered entries to omit from the current count. This filters saved target or material assignments; it does not search the wording of the item.</Text>
        {versionOptions.length > 1 && <SelectField label="Assessment Settings version" value={request.registryVersion} options={versionOptions.map((id, index) => ({ id, label: index === 0 ? "Current" : id }))} onChange={(registryVersion) => onChange({ registryVersion, selectedIds: [], excludedIds: [], filters: {} })} />}
      </Stack>
    </Box>
    {extraCount > 0 && <Text fontSize="sm" color="fg.muted">{[
      ...activeFilters.map(({ key, label, options }) => `${label}: ${options.find((option) => option.id === request.filters[key])?.label ?? request.filters[key]}`),
      ...(request.excludedIds.length ? [`Excluded: ${request.excludedIds.map((id) => contentOptions.find((option) => option.id === id)?.label ?? id).join("; ")}`] : []),
      ...(request.registryVersion !== versions[0] ? [`Assessment Settings: ${request.registryVersion}`] : []),
    ].join(" · ")}</Text>}
  </Stack>;
}
