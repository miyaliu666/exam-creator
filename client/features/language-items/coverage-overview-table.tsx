import { Box, Button, HStack, Stack, Table, Text } from "@chakra-ui/react";

import { COVERAGE_OVERVIEW_PAGE_SIZE, type CoverageOverviewRow } from "./coverage-overview-model";

export function CoverageOverviewTable({ rows, total, offset, onPage, onInspect, onClearSearch, unknownTargets = false }: {
  rows: CoverageOverviewRow[]; total: number; offset: number;
  unknownTargets?: boolean;
  onPage: (offset: number) => void;
  onInspect: (id: string, scope: "approved" | "drafts") => void;
  onClearSearch: () => void;
}) {
  if (!total) return <Stack align="start" gap={2}>
    <Text role="status" color="fg.muted">No matching language content.</Text>
    <Button size="sm" variant="outline" onClick={onClearSearch}>Clear search</Button>
  </Stack>;
  const columns = [
    { key: "plannedCount", label: "Approved items", scope: "approved" },
    { key: "pendingCount", label: "Unapproved items", scope: "drafts" },
  ] as const;
  return <Stack gap={3}>
    <Box overflowX="auto">
      <Table.Root size="sm">
        <Table.Header><Table.Row>
          <Table.ColumnHeader minW="72">Language content</Table.ColumnHeader>
          {columns.map((column) => <Table.ColumnHeader key={column.key} minW="32" textAlign="end">{column.label}</Table.ColumnHeader>)}
        </Table.Row></Table.Header>
        <Table.Body>{rows.map((row) => <Table.Row key={row.id}>
          <Table.Cell>
            <Text fontSize="sm">{row.label}</Text>
            {row.plannedCount === 0 && row.pendingCount === 0 && <Text fontSize="xs" color="fg.muted">{unknownTargets ? "No recorded items" : "No items"}</Text>}
          </Table.Cell>
          {columns.map((column) => <Table.Cell key={column.key} textAlign="end">
            <Button size="xs" variant="plain" colorPalette="teal"
              aria-label={`${column.label}: ${row.label} · ${row[column.key]} items`}
              title="Find matching items"
              onClick={() => onInspect(row.id, column.scope)}>{row[column.key]}</Button>
          </Table.Cell>)}
        </Table.Row>)}</Table.Body>
      </Table.Root>
    </Box>
    <HStack justify="space-between">
      <Text fontSize="xs" color="fg.muted">{offset + 1}–{offset + rows.length} / {total}</Text>
      {total > COVERAGE_OVERVIEW_PAGE_SIZE && <HStack>
        <Button size="xs" variant="outline" disabled={offset === 0} onClick={() => onPage(Math.max(0, offset - COVERAGE_OVERVIEW_PAGE_SIZE))}>Previous</Button>
        <Button size="xs" variant="outline" disabled={offset + COVERAGE_OVERVIEW_PAGE_SIZE >= total} onClick={() => onPage(offset + COVERAGE_OVERVIEW_PAGE_SIZE)}>Next</Button>
      </HStack>}
    </HStack>
  </Stack>;
}
