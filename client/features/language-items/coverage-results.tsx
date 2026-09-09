import { Box, Button, HStack, Link, SimpleGrid, Stack, Table, Text } from "@chakra-ui/react";

import { coverageContentOptions } from "./coverage-labels";
import type { CoverageRequest, CoverageResponse } from "./coverage-types";
import { DIFFICULTY_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, optionLabel, slotLabel } from "./labels";
import type { RegistrySnapshot } from "./types";

export function CoverageResults({ data, request, registry, onChange }: {
  data: CoverageResponse; request: CoverageRequest; registry: RegistrySnapshot; onChange: (update: Partial<CoverageRequest>) => void;
}) {
  const contentLabels = new Map(coverageContentOptions(registry).map((option) => [option.id, option.label]));
  const contentLabel = (id: string) => contentLabels.get(id) ?? `${id} (unresolved reference)`;
  const contentList = (ids: string[] | null | undefined) => ids == null ? "Unknown" : ids.map(contentLabel).join("; ") || "None";
  const absentIds = request.selectedIds.filter((id) => !request.pattern?.includes(id));
  const dimensionLabel = (key: string, id: string) => {
    if (!id) return "Unknown";
    if (key === "contextId") return optionLabel(id, registry.contextOptions);
    if (key === "primaryCanDoId") return optionLabel(id, registry.canDoOptions);
    if (key === "blueprintSlotId") return slotLabel(id, registry);
    if (key === "difficultyBand") return DIFFICULTY_LABELS[id] ?? id;
    if (key === "itemFormatId") return ITEM_FORMAT_LABELS[id] ?? id;
    return id;
  };
  const dimensionNames: Record<string, string> = { skill: "Skill", activity: "Communicative activity", domain: WORKBENCH_LABELS.domain, contextId: WORKBENCH_LABELS.context, blueprintSlotId: WORKBENCH_LABELS.blueprintSlot, primaryCanDoId: WORKBENCH_LABELS.primaryCanDo, difficultyBand: WORKBENCH_LABELS.difficulty, itemFormatId: WORKBENCH_LABELS.itemFormat };
  return <Stack gap={5}>
    <Stack gap={2}>
      <Text fontWeight="semibold">Matching items · {data.matchedCount}</Text>
      <Text fontSize="xs" color="fg.muted">
        Active items · {request.scope === "approved" ? "Latest approved content" : "Unapproved drafts and revisions"}
        {data.unknownCount > 0 && ` · ${data.unknownCount} items with unknown coverage excluded`}
      </Text>
      {request.pattern !== undefined && <Stack gap={1} bg="bg.muted" borderRadius="md" p={3}>
        <HStack justify="space-between" align="start">
          <Text fontSize="sm" fontWeight="medium">Selected-point pattern filter</Text>
          <Button size="xs" variant="outline" onClick={() => onChange({ pattern: undefined })}>Clear pattern</Button>
        </HStack>
        <Text fontSize="sm">Present: {contentList(request.pattern)}</Text>
        <Text fontSize="sm">Absent: {contentList(absentIds)}</Text>
      </Stack>}
      {data.items.length > 0 && <Box overflowX="auto">
        <Table.Root size="sm">
          <Table.Header><Table.Row>
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader>Skill / activity</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.context}</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.taskConfiguration}</Table.ColumnHeader>
            <Table.ColumnHeader>Language points</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>{data.items.map((item) => <Table.Row key={item.id}>
            <Table.Cell>
              <Link href={`/language-items/${encodeURIComponent(item.id)}`} target="_blank" rel="noopener noreferrer" title="Open current item in a new tab">{item.title || "Untitled item"}</Link>
              <Text fontSize="xs" color="fg.muted">{item.versionId ? "Approved" : item.status}</Text>
            </Table.Cell>
            <Table.Cell>{item.metadata.skill}<Text fontSize="xs">{[...new Set([item.metadata.activity, ...item.metadata.activities].filter(Boolean))].join(" / ") || "Unknown activity"}</Text></Table.Cell>
            <Table.Cell>{dimensionLabel("contextId", item.metadata.contextId)}<Text fontSize="xs">{item.metadata.domain}</Text></Table.Cell>
            <Table.Cell>
              {slotLabel(item.metadata.blueprintSlotId, registry)}
              <Text fontSize="xs">{dimensionLabel("itemFormatId", item.metadata.itemFormatId)} · {dimensionLabel("difficultyBand", item.metadata.difficultyBand)}</Text>
              <Text fontSize="xs">{dimensionLabel("primaryCanDoId", item.metadata.primaryCanDoId)}</Text>
            </Table.Cell>
            <Table.Cell>
              {request.role === "either" ? <>
                <Text fontSize="xs">Core: {contentList(item.metadata.coreIds)}</Text>
                <Text fontSize="xs">Supporting: {contentList(item.metadata.supportingIds)}</Text>
              </> : <Text fontSize="xs">{contentList(request.role === "confirmed" ? item.metadata.confirmedIds : request.role === "supporting" ? item.metadata.supportingIds : item.metadata.coreIds)}</Text>}
            </Table.Cell>
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
    </Stack>
    {request.selectedIds.length >= 2 && <Box as="details">
      <Box as="summary" cursor="pointer" fontWeight="semibold">Language-point counts and intersections</Box>
      <Stack gap={3} mt={3}>
        <Text fontSize="xs" color="fg.muted">Counts use {data.knownCount} items with known coverage before language filters; patterns show present (✓) and absent (—) selected points, ignoring other points.</Text>
        <HStack flexWrap="wrap" gap={4}>{data.termCounts.map((term) => <Text key={term.id} fontSize="sm">{contentLabel(term.id)} · {term.count}</Text>)}</HStack>
        {data.patterns.length > 0 && <Box overflowX="auto" maxH="80">
          <Table.Root size="sm" stickyHeader>
            <Table.Header><Table.Row>{request.selectedIds.map((id) => <Table.ColumnHeader key={id} minW="36">{contentLabel(id)}</Table.ColumnHeader>)}<Table.ColumnHeader>Items</Table.ColumnHeader></Table.Row></Table.Header>
            <Table.Body>{data.patterns.map((pattern) => <Table.Row key={JSON.stringify(pattern.presentIds)}>
              {request.selectedIds.map((id) => <Table.Cell key={id} aria-label={pattern.presentIds.includes(id) ? "Present" : "Absent"}>{pattern.presentIds.includes(id) ? "✓" : "—"}</Table.Cell>)}
              <Table.Cell><Button size="xs" variant="outline" aria-label={`Filter to pattern: present ${contentList(pattern.presentIds)}; absent ${contentList(request.selectedIds.filter((id) => !pattern.presentIds.includes(id)))}`} onClick={() => onChange({ pattern: pattern.presentIds })}>{pattern.count}</Button></Table.Cell>
            </Table.Row>)}</Table.Body>
          </Table.Root>
        </Box>}
      </Stack>
    </Box>}
    {data.matchedCount > 0 && <Box as="details">
      <Box as="summary" cursor="pointer" fontWeight="semibold">Breakdown by task and context</Box>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4} mt={3}>
        {Object.entries(data.breakdowns).map(([key, entries]) => <Stack key={key} gap={1}>
          <Text fontWeight="medium">{dimensionNames[key] ?? key}</Text>
          {entries.map((entry) => <Text key={entry.id} fontSize="sm">{dimensionLabel(key, entry.id)} · {entry.count}</Text>)}
        </Stack>)}
      </SimpleGrid>
      <Text fontSize="xs" color="fg.muted" mt={2}>An item may count in multiple communicative activities.</Text>
    </Box>}
  </Stack>;
}
