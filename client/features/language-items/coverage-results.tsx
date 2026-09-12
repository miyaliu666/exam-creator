import { Box, Button, HStack, Link, NativeSelect, Stack, Table, Text } from "@chakra-ui/react";

import { coverageContentOptions } from "./coverage-labels";
import { CoverageSetupGoal } from "./coverage-setup-goal";
import { CoverageSetupTable } from "./coverage-setup-table";
import { COVERAGE_SETUP_FIELDS, coverageAnalysisKey, type CoverageSetupGoalState } from "./coverage-setup-model";
import type { CoverageBatchSuggestion, CoverageFilters, CoverageRequest, CoverageResponse } from "./coverage-types";
import { DIFFICULTY_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, optionLabel, slotLabel } from "./labels";
import { itemStatusLabel } from "./item-status";
import type { RegistrySnapshot } from "./types";

export function CoverageResults({ data, request, registry, currentRegistry, accountScope, showItems, onItemsOpenChange, onInspect, onPlan, onChange, setupGoal, onSetupGoalChange }: {
  data: CoverageResponse; request: CoverageRequest; registry: RegistrySnapshot; onChange: (update: Partial<CoverageRequest>) => void;
  currentRegistry: RegistrySnapshot; accountScope: string; showItems: boolean;
  onInspect: (filters: CoverageFilters, scope: CoverageRequest["scope"]) => void;
  onPlan: (suggestion: CoverageBatchSuggestion) => void;
  setupGoal?: CoverageSetupGoalState;
  onSetupGoalChange: (goal: CoverageSetupGoalState | undefined) => void;
  onItemsOpenChange: (open: boolean) => void;
}) {
  const contentLabels = new Map(coverageContentOptions(registry).map((option) => [option.id, option.label]));
  const contentLabel = (id: string) => contentLabels.get(id) ?? `${id} (unresolved reference)`;
  const contentList = (ids: string[] | null | undefined) => ids == null ? "Unknown" : ids.map(contentLabel).join("; ") || "None";
  const dimensionLabel = (key: string, id: string) => {
    if (!id) return "Unknown";
    if (key === "contextId") return optionLabel(id, registry.contextOptions);
    if (key === "primaryCanDoId") return optionLabel(id, registry.canDoOptions);
    if (key === "blueprintSlotId") return slotLabel(id, registry);
    if (key === "difficultyBand") return DIFFICULTY_LABELS[id] ?? id;
    if (key === "itemFormatId") return ITEM_FORMAT_LABELS[id] ?? id;
    return id;
  };
  return <Stack gap={5}>
    <CoverageSetupTable data={data} request={request} registry={registry} onInspect={onInspect}
      onChooseGoal={(filters) => onSetupGoalChange(setupGoal && COVERAGE_SETUP_FIELDS.every((key) => filters[key] === setupGoal.filters[key])
        ? setupGoal : { queryKey: coverageAnalysisKey(request), filters, inputText: "", newItemText: "" })}
      goal={setupGoal ? { filters: setupGoal.filters, content: <CoverageSetupGoal key={JSON.stringify(setupGoal.filters)} request={request} filters={setupGoal.filters}
        registry={currentRegistry} accountScope={accountScope} onPlan={onPlan} onClose={() => onSetupGoalChange(undefined)} inputText={setupGoal.inputText} newItemText={setupGoal.newItemText}
        onInputTextChange={(inputText) => onSetupGoalChange({ ...setupGoal, inputText })}
        onNewItemTextChange={(newItemText) => onSetupGoalChange({ ...setupGoal, newItemText })}
        onInspectUnapproved={() => onInspect(setupGoal.filters, "drafts")} /> } : undefined} />
    <details open={showItems} onToggle={(event) => onItemsOpenChange(event.currentTarget.open)}>
      <Box as="summary" cursor="pointer" fontWeight="semibold">{request.scope === "approved" ? "Approved items" : "Unapproved items"} · {data.matchedCount}</Box>
      <Stack gap={2} mt={3}>
      <Box maxW="sm"><Text fontSize="sm" mb={1}>Item status</Text>
        <NativeSelect.Root size="sm"><NativeSelect.Field aria-label="Item status" value={request.scope}
          onChange={(event) => onChange({ scope: event.target.value as CoverageRequest["scope"], offset: 0 })}>
          <option value="approved">Approved items</option><option value="drafts">Unapproved items</option>
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      </Box>
      {data.unknownCount > 0 && <Text fontSize="xs" color="fg.muted">{data.unknownCount} items with unavailable target data excluded.</Text>}
      {data.items.length > 0 && <Box overflowX="auto">
        <Table.Root size="sm">
          <Table.Header><Table.Row>
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader>Skill / activity</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.context}</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.itemSetup}</Table.ColumnHeader>
            <Table.ColumnHeader>Assessment targets</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>{data.items.map((item) => <Table.Row key={item.id}>
            <Table.Cell>
              <Link href={`/language-items/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer" title={item.versionId ? "Open current item in a new tab; counts use the approved version" : "Open current item in a new tab"}>{item.title || "Untitled item"}</Link>
              <Text fontSize="xs" color="fg.muted">{item.versionId ? "Approved content" : itemStatusLabel(item.status)}</Text>
            </Table.Cell>
            <Table.Cell>{item.metadata.skill}<Text fontSize="xs">{[...new Set([item.metadata.activity, ...item.metadata.activities].filter(Boolean))].join(" / ") || "Unknown activity"}</Text></Table.Cell>
            <Table.Cell>{dimensionLabel("contextId", item.metadata.contextId)}<Text fontSize="xs">{WORKBENCH_LABELS.domain}: {item.metadata.domain || "Unknown"}</Text></Table.Cell>
            <Table.Cell>
              {slotLabel(item.metadata.blueprintSlotId, registry)}
              <Text fontSize="xs">{dimensionLabel("itemFormatId", item.metadata.itemFormatId)} · {dimensionLabel("difficultyBand", item.metadata.difficultyBand)}</Text>
              <Text fontSize="xs">{dimensionLabel("primaryCanDoId", item.metadata.primaryCanDoId)}</Text>
            </Table.Cell>
            <Table.Cell><Text fontSize="xs">{contentList(item.metadata.coreIds)}</Text></Table.Cell>
          </Table.Row>)}</Table.Body>
        </Table.Root>
      </Box>}
      {data.matchedCount === 0 && <Text fontSize="sm">No matching items.</Text>}
      {data.matchedCount > 0 && data.items.length === 0 && <HStack>
        <Text fontSize="sm">No items on this page.</Text>
        <Button size="xs" variant="outline" onClick={() => onChange({ offset: 0, pattern: request.pattern })}>First page</Button>
      </HStack>}
      {data.matchedCount > data.limit && <HStack justify="space-between">
        <Button size="xs" variant="outline" disabled={data.offset === 0} onClick={() => onChange({ offset: Math.max(0, data.offset - data.limit), pattern: request.pattern })}>Previous</Button>
        <Text fontSize="xs">{data.items.length ? `${data.offset + 1}–${Math.min(data.offset + data.items.length, data.matchedCount)} / ` : ""}{data.matchedCount} items</Text>
        <Button size="xs" variant="outline" disabled={data.offset + data.limit >= data.matchedCount} onClick={() => onChange({ offset: data.offset + data.limit, pattern: request.pattern })}>Next</Button>
      </HStack>}
    {request.selectedIds.length >= 2 && <Box as="details">
      <Box as="summary" cursor="pointer" fontWeight="semibold">Target combinations</Box>
      <Stack gap={3} mt={3}>
        {data.patterns.length > 0 && <Box overflowX="auto" maxH="80">
          <Table.Root size="sm" stickyHeader>
            <Table.Header><Table.Row>{request.selectedIds.map((id) => <Table.ColumnHeader key={id} minW="36">{contentLabel(id)}</Table.ColumnHeader>)}<Table.ColumnHeader>Items</Table.ColumnHeader></Table.Row></Table.Header>
            <Table.Body>{data.patterns.map((pattern) => <Table.Row key={JSON.stringify(pattern.presentIds)}>
              {request.selectedIds.map((id) => <Table.Cell key={id}>{pattern.presentIds.includes(id) ? "Included" : "Not included"}</Table.Cell>)}
              <Table.Cell><Button size="xs" variant="outline" aria-label={`Filter to pattern: present ${contentList(pattern.presentIds)}; absent ${contentList(request.selectedIds.filter((id) => !pattern.presentIds.includes(id)))}`} onClick={() => onChange({ pattern: pattern.presentIds })}>{pattern.count}</Button></Table.Cell>
            </Table.Row>)}</Table.Body>
          </Table.Root>
        </Box>}
      </Stack>
    </Box>}
      </Stack>
    </details>
  </Stack>;
}
