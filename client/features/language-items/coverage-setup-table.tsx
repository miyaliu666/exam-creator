import { Box, Button, Stack, Table, Text } from "@chakra-ui/react";
import { Fragment, type ReactNode } from "react";

import { COVERAGE_SETUP_FIELDS, completeCoverageSetup, coverageSetupRows } from "./coverage-setup-model";
import type { CoverageFilters, CoverageRequest, CoverageResponse } from "./coverage-types";
import { DIFFICULTY_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, optionLabel } from "./labels";
import type { RegistrySnapshot } from "./types";
import { NO_CONTEXT_FILTER } from "./coverage-context";

export function CoverageSetupTable({ data, request, registry, onInspect, onChooseGoal, goal }: {
  data: CoverageResponse; request: CoverageRequest; registry: RegistrySnapshot;
  onInspect: (filters: CoverageFilters, scope: CoverageRequest["scope"]) => void;
  onChooseGoal: (filters: CoverageFilters) => void;
  goal?: { filters: CoverageFilters; content: ReactNode };
}) {
  const rows = coverageSetupRows(data, request, registry);
  const visibleRows = rows && goal && !rows.some((row) => COVERAGE_SETUP_FIELDS.every((key) => row.filters[key] === goal.filters[key]))
    ? [...rows, { filters: goal.filters, approvedCount: 0, pendingCount: 0 }] : rows;
  const fields = ["primaryCanDoId", "itemFormatId", "contextId", "domain", "difficultyBand"] as const;
  const names = [WORKBENCH_LABELS.primaryCanDo, WORKBENCH_LABELS.itemFormat, WORKBENCH_LABELS.context, WORKBENCH_LABELS.domain, WORKBENCH_LABELS.difficulty];
  const label = (key: typeof COVERAGE_SETUP_FIELDS[number], value: string | undefined) => {
    if (!value) return "Unknown";
    if (key === "contextId") return value === NO_CONTEXT_FILTER ? "No predefined Context" : optionLabel(value, registry.contextOptions);
    if (key === "primaryCanDoId") return optionLabel(value, registry.canDoOptions);
    if (key === "difficultyBand") return DIFFICULTY_LABELS[value] ?? value;
    if (key === "itemFormatId") return ITEM_FORMAT_LABELS[value] ?? value;
    return value;
  };
  return <Stack as="section" aria-label="Item setup coverage" borderWidth="1px" borderRadius="lg" p={4} gap={3} minW={0}>
    <Text as="h3" fontWeight="semibold">Coverage by item setup</Text>
    {visibleRows === undefined ? <Text role="alert" fontSize="sm">Item setup counts are unavailable. Try Refresh.</Text> : visibleRows.length === 0 ?
      <Text fontSize="sm">No matching item setups.</Text> : <Box overflowX="auto">
        <Table.Root size="sm" aria-label="Coverage by item setup">
          <Table.Header><Table.Row>
            {names.map((name) => <Table.ColumnHeader key={name}>{name}</Table.ColumnHeader>)}
            <Table.ColumnHeader textAlign="end">Approved items</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="end">Unapproved items</Table.ColumnHeader>
            <Table.ColumnHeader>Item count goal</Table.ColumnHeader>
          </Table.Row></Table.Header>
          <Table.Body>{visibleRows.map((row) => <Fragment key={JSON.stringify(COVERAGE_SETUP_FIELDS.map((key) => row.filters[key]))}><Table.Row>
            {fields.map((key) => <Table.Cell key={key} maxW="60">{label(key, row.filters[key])}{key === "primaryCanDoId" ? <Text fontSize="xs" color="fg.muted">{row.filters.itemRuleId ? registry.capabilities.find((entry) => entry.itemRuleId === row.filters.itemRuleId)?.observableEvidence : "Unknown item rules"}</Text> : null}</Table.Cell>)}
            <Table.Cell textAlign="end"><Button size="xs" variant="plain" colorPalette="teal" disabled={!completeCoverageSetup(row.filters)} aria-label={`View ${row.approvedCount} approved items`} onClick={() => onInspect(row.filters, "approved")}>{row.approvedCount}</Button></Table.Cell>
            <Table.Cell textAlign="end"><Button size="xs" variant="plain" colorPalette="teal" disabled={!completeCoverageSetup(row.filters)} aria-label={`View ${row.pendingCount} unapproved items`} onClick={() => onInspect(row.filters, "drafts")}>{row.pendingCount}</Button></Table.Cell>
            <Table.Cell><Button size="xs" variant="outline" disabled={!completeCoverageSetup(row.filters)} onClick={() => onChooseGoal(row.filters)}>Set goal</Button></Table.Cell>
          </Table.Row>{goal && COVERAGE_SETUP_FIELDS.every((key) => row.filters[key] === goal.filters[key]) &&
            <Table.Row bg="bg.muted"><Table.Cell colSpan={8}>{goal.content}</Table.Cell></Table.Row>}
          </Fragment>)}</Table.Body>
        </Table.Root>
      </Box>}
    {((data.approvedUnknownCount ?? (request.scope === "approved" ? data.unknownCount : 0)) > 0 || data.pendingUnknownCount > 0) &&
      <Text fontSize="sm" color="fg.muted">Unavailable target data excluded: {data.approvedUnknownCount ?? (request.scope === "approved" ? data.unknownCount : 0)} approved items; {data.pendingUnknownCount} unapproved items.</Text>}
  </Stack>;
}
