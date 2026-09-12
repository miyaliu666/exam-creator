import { Box, Button, Flex, Input, NativeSelect, Stack, Table, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";

import { SKILL_LABELS, WORKBENCH_LABELS } from "./labels";
import { DIFFICULTY_LEVELS } from "./registry-difficulty";
import { registryDisplayText } from "./registry-display-text";
import { filterRegistryOverviewRows, registryRulesOverviewRows, type RegistryOverviewDifficulty, type RegistryOverviewFilters } from "./registry-rules-overview-model";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface RegistryRulesOverviewProps {
  snapshot: RegistrySnapshot;
  onEditRules: (capability: RegistryCapability, contextId?: string, difficultyLevel?: string) => void;
  onViewContent: (capability: RegistryCapability, contextId: string) => void;
  onEditContext: (contextId: string) => void;
  selectedRowKey?: string;
  onSelectedRowChange?: (key: string) => void;
  disabled?: boolean;
}

function DifficultyCell({ difficulty, onOpen, disabled }: { difficulty: RegistryOverviewDifficulty; onOpen: () => void; disabled: boolean }) {
  return <Stack gap={1}>
    <Button size="xs" alignSelf="start" variant="plain" colorPalette="teal" p={0} onClick={onOpen}
      aria-label={`${disabled ? "View" : "Edit"} ${difficulty.label} rules`}>{difficulty.label}</Button>
    {difficulty.lines.map((line) => <Text key={line} fontSize="xs">{line}</Text>)}
    {difficulty.issues.map((issue) => <Text key={issue} fontSize="xs" color="fg.error">{issue}</Text>)}
  </Stack>;
}

const PAGE_SIZE = 10;

export function RegistryRulesOverview({ snapshot, onEditRules, onViewContent, onEditContext, selectedRowKey, onSelectedRowChange, disabled = false }: RegistryRulesOverviewProps) {
  const [filters, setFilters] = useState<RegistryOverviewFilters>({ query: "", skill: "", contextId: "" });
  const [page, setPage] = useState(1);
  const rows = useMemo(() => registryRulesOverviewRows(snapshot), [snapshot]);
  const filtered = useMemo(() => filterRegistryOverviewRows(rows, filters), [rows, filters]);
  const skills = [...new Set(rows.map((row) => row.capability.primaryReportedSkill))];
  const contexts = [...new Map(rows.filter((row) => row.contextId).map((row) => [row.contextId, row.contextName])).entries()];
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const changeFilter = (key: keyof RegistryOverviewFilters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  return <Stack gap={4}>
    <Flex gap={3} flexWrap="wrap" alignItems="end">
      <Stack gap={1} flex="1" minW="220px"><Text fontSize="sm">Search item rules</Text>
        <Input size="sm" aria-label="Search item rules" value={filters.query} onChange={(event) => changeFilter("query", event.target.value)} />
      </Stack>
      <Stack gap={1} minW="150px"><Text fontSize="sm">Skill</Text>
        <NativeSelect.Root size="sm"><NativeSelect.Field aria-label="Overview Skill" value={filters.skill} onChange={(event) => changeFilter("skill", event.target.value)}>
          <option value="">All skills</option>{skills.map((skill) => <option key={skill} value={skill}>{SKILL_LABELS[skill] ?? registryDisplayText(skill)}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      </Stack>
      <Stack gap={1} minW="220px" maxW="sm"><Text fontSize="sm">{WORKBENCH_LABELS.context}</Text>
        <NativeSelect.Root size="sm"><NativeSelect.Field aria-label="Overview Context" value={filters.contextId} onChange={(event) => changeFilter("contextId", event.target.value)}>
          <option value="">All Contexts</option>{contexts.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      </Stack>
      <Button size="sm" variant="outline" onClick={() => { setFilters({ query: "", skill: "", contextId: "" }); setPage(1); }}>Reset filters</Button>
    </Flex>
    <Box overflow="auto" maxH="65vh" borderWidth="1px" borderRadius="lg">
      <Table.Root size="sm" minW="1390px" tableLayout="fixed" stickyHeader aria-label="Item rules overview">
        <Table.Header><Table.Row>
          <Table.ColumnHeader width="180px">{WORKBENCH_LABELS.blueprintSlot}</Table.ColumnHeader>
          <Table.ColumnHeader width="120px">Skill / Activity</Table.ColumnHeader>
          <Table.ColumnHeader width="110px">{WORKBENCH_LABELS.itemFormat}</Table.ColumnHeader>
          <Table.ColumnHeader width="180px">{WORKBENCH_LABELS.primaryCanDo}</Table.ColumnHeader>
          <Table.ColumnHeader width="185px">{WORKBENCH_LABELS.domain} / {WORKBENCH_LABELS.context}</Table.ColumnHeader>
          <Table.ColumnHeader width="140px">Language content</Table.ColumnHeader>
          {DIFFICULTY_LEVELS.map((level) => <Table.ColumnHeader key={level.id} width="165px">{level.label}</Table.ColumnHeader>)}
        </Table.Row></Table.Header>
        <Table.Body>{visible.map((row) => {
          const selected = () => onSelectedRowChange?.(row.key);
          const openRules = (level?: string) => { selected(); onEditRules(row.capability, row.contextId || undefined, level); };
          return <Table.Row key={row.key} verticalAlign="top" bg={selectedRowKey === row.key ? "bg.muted" : undefined}>
            <Table.Cell><Stack gap={2}><Text fontWeight="medium">{row.slotName}</Text>
              <Button size="xs" variant="plain" colorPalette="teal" alignSelf="start" p={0} onClick={() => openRules()}>{disabled ? "View item rules" : "Edit item rules"}</Button>
              {row.issues.length ? <Box><Text fontSize="xs" fontWeight="medium" color="fg.error">Needs attention</Text>{row.issues.map((issue) => <Text key={issue} fontSize="xs" color="fg.error">{issue}</Text>)}</Box> : null}
            </Stack></Table.Cell>
            <Table.Cell><Text>{row.skillName}</Text><Text fontSize="xs" color="fg.muted">{row.activityName}</Text></Table.Cell>
            <Table.Cell>{row.formatName}</Table.Cell>
            <Table.Cell>{row.canDoName}</Table.Cell>
            <Table.Cell><Stack gap={1}><Text fontSize="xs" color="fg.muted">{row.domainName}</Text>
              {row.context ? <Button size="sm" variant="plain" height="auto" justifyContent="start" whiteSpace="normal" textAlign="left" colorPalette="teal" p={0}
                onClick={() => { selected(); onEditContext(row.contextId); }} aria-label={`${disabled ? "View" : "Edit"} Context ${row.contextName}`}>{row.contextName}</Button> : <Text>{row.contextName}</Text>}
            </Stack></Table.Cell>
            <Table.Cell><Stack gap={1}>
              <Text fontSize="sm">{row.contentCount === null ? "Unavailable" : `${row.contentCount} eligible entries`}</Text>
              {row.contextId ? <Button alignSelf="start" size="xs" variant="plain" colorPalette="teal" p={0} onClick={() => { selected(); onViewContent(row.capability, row.contextId); }}>View language content</Button> : null}
            </Stack></Table.Cell>
            {row.difficulties.map((difficulty) => <Table.Cell key={difficulty.id}><DifficultyCell difficulty={difficulty} disabled={disabled} onOpen={() => openRules(difficulty.id)} /></Table.Cell>)}
          </Table.Row>;
        })}</Table.Body>
      </Table.Root>
      {!rows.length ? <Text p={5} color="fg.muted">No item rules yet. Open Item rules to add a configuration.</Text>
        : !filtered.length ? <Text p={5} role="status" color="fg.muted">No item rules match these filters.</Text> : null}
    </Box>
    <Flex gap={3} justifyContent="space-between" alignItems="center" flexWrap="wrap">
      <Text fontSize="sm" color="fg.muted">{filtered.length} {filtered.length === 1 ? "combination" : "combinations"}</Text>
      <Flex gap={2} alignItems="center"><Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <NativeSelect.Root size="sm" width="auto"><NativeSelect.Field aria-label="Item rules page" value={currentPage} onChange={(event) => setPage(Number(event.target.value))}>
          {Array.from({ length: pages }, (_, index) => <option key={index + 1} value={index + 1}>Page {index + 1} of {pages}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        <Button size="sm" variant="outline" disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </Flex>
    </Flex>
  </Stack>;
}
