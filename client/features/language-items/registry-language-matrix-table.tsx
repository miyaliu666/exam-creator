import { Box, Button, Stack, Table, Text } from "@chakra-ui/react";
import { useContext } from "react";

import { CONTENT_KIND_LABELS, ITEM_FORMAT_LABELS } from "./labels";
import { languageTargetLabel } from "./language-target-labels";
import { languageMatrixCell, type LanguageMatrixColumn } from "./registry-language-matrix-model";
import { RegistryTextContext, registrySlotName } from "./registry-reference-labels";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function RegistryLanguageMatrixTable({ entries, columns, snapshot, disabled, selectedCell, onOpenEntry, onOpenRule, onOpenItemRules }: {
  entries: ContentIdOption[];
  columns: LanguageMatrixColumn[];
  snapshot: RegistrySnapshot;
  disabled: boolean;
  selectedCell: string;
  onOpenEntry: (entry: ContentIdOption) => void;
  onOpenRule: (entry: ContentIdOption, column: LanguageMatrixColumn) => void;
  onOpenItemRules: (column: LanguageMatrixColumn) => void;
}) {
  const displayText = useContext(RegistryTextContext);
  return <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
    <Table.Root size="sm" tableLayout="fixed" minW={`${270 + columns.length * 210}px`}>
      <Table.Header><Table.Row>
        <Table.ColumnHeader width="270px">Language content</Table.ColumnHeader>
        {columns.map((column) => <Table.ColumnHeader key={column.key} width="210px" verticalAlign="top">
          <Stack gap={1}>
            <Text>{column.capability.primaryReportedSkill} · {displayText(column.context.label)}</Text>
            <Button variant="plain" colorPalette="teal" justifyContent="start" textAlign="left" p={0} h="auto" whiteSpace="normal" onClick={() => onOpenItemRules(column)}>
              {registrySlotName(snapshot, column.capability.blueprintSlotId)}
            </Button>
            <Text fontSize="xs" fontWeight="normal">{ITEM_FORMAT_LABELS[column.capability.itemFormatId] ?? column.capability.itemFormatId}</Text>
            <Text fontSize="xs" fontWeight="normal">{displayText(snapshot.canDoOptions.find((option) => option.id === column.capability.primaryCanDoId)?.label ?? "Missing Primary Can-do")}</Text>
          </Stack>
        </Table.ColumnHeader>)}
      </Table.Row></Table.Header>
      <Table.Body>{entries.map((entry) => {
        const display = languageTargetLabel(entry);
        return <Table.Row key={entry.id} verticalAlign="top">
          <Table.Cell><Stack gap={1}>
            <Button variant="plain" colorPalette="teal" justifyContent="start" textAlign="left" whiteSpace="normal" height="auto" p={0} onClick={() => onOpenEntry(entry)} aria-label={`${disabled ? "View" : "Edit"} ${display.primary}`}>{display.primary}</Button>
            <Text fontSize="xs" color="fg.muted">{CONTENT_KIND_LABELS[entry.kind]}</Text>
            <Text fontSize="sm">{entry.kind === "grammar" ? entry.pattern ?? display.pattern : entry.meaning}</Text>
            {display.english ? <Text fontSize="xs" color="fg.muted">{display.english}</Text> : null}
          </Stack></Table.Cell>
          {columns.map((column) => {
            const cell = languageMatrixCell(entry, column);
            const key = JSON.stringify([entry.id, column.key]);
            return <Table.Cell key={column.key} bg={selectedCell === key ? "bg.subtle" : undefined}>
              <Button variant="plain" colorPalette={cell.allowed ? "teal" : "gray"} p={0} h="auto" whiteSpace="normal" textAlign="left" justifyContent="start" onClick={() => onOpenRule(entry, column)} aria-label={`${disabled ? "View" : "Edit"} assessment rule for ${display.primary}, ${column.capability.primaryReportedSkill}, ${displayText(column.context.label)}, ${ITEM_FORMAT_LABELS[column.capability.itemFormatId]}, ${displayText(snapshot.canDoOptions.find((option) => option.id === column.capability.primaryCanDoId)?.label ?? "Missing Primary Can-do")}`}>
                <Stack gap={1} align="start"><Text>{cell.label}</Text><Text fontSize="xs" fontWeight="normal">{cell.detail}</Text></Stack>
              </Button>
            </Table.Cell>;
          })}
        </Table.Row>;
      })}</Table.Body>
    </Table.Root>
    {!entries.length ? <Text p={5} role="status">No language content matches these filters.</Text> : null}
    {!columns.length ? <Text p={5} role="status">No allowed Item rules and Context combinations match these filters.</Text> : null}
  </Box>;
}
