import { Box, Button, Stack, Table, Text } from "@chakra-ui/react";
import { useContext, useState } from "react";

import { contentMasteryLabel } from "./content-catalog-model";
import { CONTENT_KIND_LABELS } from "./labels";
import { languageTargetLabel } from "./language-target-labels";
import { RegistryTextContext } from "./registry-reference-labels";
import type { ContentIdOption, RegistrySnapshot } from "./types";

function ScopeNames({ ids, options }: { ids: string[]; options: Array<{ id: string; label: string; retired?: boolean }> }) {
  const [expanded, setExpanded] = useState(false);
  const displayText = useContext(RegistryTextContext);
  if (!ids.length) return <Text color="fg.muted" fontSize="sm">Not restricted</Text>;
  return <Stack gap={1}>
    {(expanded ? ids : ids.slice(0, 2)).map((id) => {
      const option = options.find((entry) => entry.id === id);
      return <Text key={id} fontSize="sm" color={!option || option.retired ? "fg.error" : undefined}>{option ? `${displayText(option.label)}${option.retired ? " · retired" : ""}` : "Unavailable reference"}</Text>;
    })}
    {ids.length > 2 ? <Button alignSelf="start" size="xs" variant="plain" colorPalette="teal" onClick={() => setExpanded(!expanded)}>{expanded ? "Show fewer" : `Show all ${ids.length}`}</Button> : null}
  </Stack>;
}

export function ContentCatalogTable({ entries, snapshot, onOpen, disabled, showCategory }: {
  entries: ContentIdOption[];
  snapshot: RegistrySnapshot;
  onOpen: (entry: ContentIdOption) => void;
  disabled: boolean;
  showCategory: boolean;
}) {
  return <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
    <Table.Root size="sm" tableLayout="fixed" minW="760px">
      <Table.Header><Table.Row>
        <Table.ColumnHeader width="31%">Entry</Table.ColumnHeader>
        <Table.ColumnHeader width="17%">Mastery scope</Table.ColumnHeader>
        <Table.ColumnHeader width="26%">Applicable Can-do</Table.ColumnHeader>
        <Table.ColumnHeader width="26%">Applicable Context</Table.ColumnHeader>
      </Table.Row></Table.Header>
      <Table.Body>{entries.map((entry) => {
        const display = languageTargetLabel(entry);
        const detail = entry.kind === "grammar" ? entry.pattern ?? display.pattern : entry.meaning;
        return <Table.Row key={entry.id} verticalAlign="top">
        <Table.Cell py={3}><Stack gap={1}>
          <Button justifyContent="start" height="auto" whiteSpace="normal" textAlign="left" variant="plain" p={0} colorPalette="teal" fontWeight="semibold" onClick={() => onOpen(entry)} aria-label={`${disabled ? "View" : "Edit"} ${display.primary}`}>{display.primary}</Button>
          {showCategory ? <Text fontSize="xs" color="fg.muted">{CONTENT_KIND_LABELS[entry.kind] ?? entry.kind}</Text> : null}
          {detail ? <Text fontSize="sm" color="fg.muted">{detail}</Text> : null}
          {entry.pinyin || display.english ? <Text fontSize="xs" color="fg.muted">{[entry.pinyin, display.english].filter(Boolean).join(" · ")}</Text> : null}
        </Stack></Table.Cell>
        <Table.Cell py={3}><Text fontSize="sm">{contentMasteryLabel(entry.masteryScope)}</Text></Table.Cell>
        <Table.Cell py={3}><ScopeNames ids={entry.canDoIds} options={snapshot.canDoOptions} /></Table.Cell>
        <Table.Cell py={3}><ScopeNames ids={entry.contextIds} options={snapshot.contextOptions} /></Table.Cell>
      </Table.Row>; })}</Table.Body>
    </Table.Root>
    {!entries.length ? <Text role="status" color="fg.muted" p={5}>No language content matches these filters.</Text> : null}
  </Box>;
}
