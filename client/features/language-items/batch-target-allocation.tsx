import { Box, Table, Text } from "@chakra-ui/react";

import type { BatchGroup } from "./batch-api";
import { allocatedBatchTargets } from "./batch-plan";
import { contentOptionLabel } from "./labels";
import { languageTargetLabel } from "./language-target-labels";
import type { RegistrySnapshot } from "./types";

export function BatchTargetAllocation({ group, registry, itemOffset }: { group: BatchGroup; registry: RegistrySnapshot; itemOffset: number }) {
  const rows = allocatedBatchTargets(group);
  if (!group.rotatingTargetContentIds.length || !rows.length) return null;
  return <Box as="details">
    <Text as="summary" cursor="pointer" fontSize="sm">Preview each item's targets</Text>
    <Box mt={3} maxH="80" overflow="auto"><Table.Root size="sm"><Table.Header><Table.Row>
      <Table.ColumnHeader>Item</Table.ColumnHeader><Table.ColumnHeader>Targets this item should assess</Table.ColumnHeader>
    </Table.Row></Table.Header><Table.Body>{rows.map((ids, index) => <Table.Row key={index}>
      <Table.Cell whiteSpace="nowrap">Item {itemOffset + index + 1}</Table.Cell>
      <Table.Cell>{ids.map((id, targetIndex) => {
        const option = registry.contentIdOptions.find((entry) => entry.id === id);
        return <Text as="span" key={id} title={contentOptionLabel(id, registry)}>
          {targetIndex ? " · " : ""}{option ? languageTargetLabel(option).primary : "Unavailable target"}
        </Text>;
      })}</Table.Cell>
    </Table.Row>)}</Table.Body></Table.Root></Box>
  </Box>;
}
