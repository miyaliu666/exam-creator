import { Badge, Box, Button, Stack, Table, Text } from "@chakra-ui/react";
import { useContext, useState } from "react";

import { contentMasteryLabel } from "./content-catalog-model";
import { contentLanguage, contentLanguageLabel } from "./content-language";
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

export function ContentCatalogTable({ entries, snapshot, onOpen, disabled, showCategory, selectedIds = [], onSelect, onSelectPage }: {
  entries: ContentIdOption[];
  snapshot: RegistrySnapshot;
  onOpen: (entry: ContentIdOption) => void;
  disabled: boolean;
  showCategory: boolean;
  selectedIds?: string[];
  onSelect?: (id: string, selected: boolean) => void;
  onSelectPage?: (selected: boolean) => void;
}) {
  return <Box overflowX="auto" borderWidth="1px" borderRadius="lg">
    <Table.Root size="sm" tableLayout="fixed" minW="760px">
      <Table.Header><Table.Row>
        {onSelect ? <Table.ColumnHeader width="44px"><input type="checkbox" aria-label="Select entries on this page" disabled={disabled || !entries.length} checked={!!entries.length && entries.every((entry) => selectedIds.includes(entry.id))} onChange={(event) => onSelectPage?.(event.target.checked)} /></Table.ColumnHeader> : null}
        <Table.ColumnHeader width="34%">Entry</Table.ColumnHeader>
        <Table.ColumnHeader width="30%">Example</Table.ColumnHeader>
        <Table.ColumnHeader width="9%">Level</Table.ColumnHeader>
        <Table.ColumnHeader width="27%">Content scope</Table.ColumnHeader>
      </Table.Row></Table.Header>
      <Table.Body>{entries.map((entry) => {
        const display = languageTargetLabel(entry);
        const detail = entry.kind === "grammar" ? entry.pattern ?? display.pattern : entry.meaning;
        return <Table.Row key={entry.id} verticalAlign="top">
        {onSelect ? <Table.Cell py={3}><input type="checkbox" aria-label={`Select ${display.primary}${entry.meaning ? ` · ${entry.meaning}` : ""}`} disabled={disabled} checked={selectedIds.includes(entry.id)} onChange={(event) => onSelect(entry.id, event.target.checked)} /></Table.Cell> : null}
        <Table.Cell py={3}><Stack gap={1}>
          <Badge alignSelf="start" colorPalette="teal" size="xs">{contentLanguageLabel(contentLanguage(entry))}</Badge>
          <Button justifyContent="start" height="auto" whiteSpace="normal" textAlign="left" variant="plain" p={0} colorPalette="teal" fontWeight="semibold" onClick={() => onOpen(entry)} aria-label={`${disabled ? "View" : "Edit"} ${display.primary}`}>{display.primary}</Button>
          {showCategory ? <Text fontSize="xs" color="fg.muted">{CONTENT_KIND_LABELS[entry.kind] ?? entry.kind}</Text> : null}
          {detail ? <Text fontSize="sm" color="fg.muted">{detail}</Text> : null}
          {entry.pinyin || display.english ? <Text fontSize="xs" color="fg.muted">{[entry.pinyin, display.english].filter(Boolean).join(" · ")}</Text> : null}
        </Stack></Table.Cell>
        <Table.Cell py={3}><Text fontSize="sm" whiteSpace="pre-wrap" lang={contentLanguage(entry)} color={entry.examples?.length ? undefined : "fg.muted"}>{entry.examples?.[0] || "No examples recorded"}</Text>{(entry.examples?.length ?? 0) > 1 ? <Button size="xs" variant="plain" p={0} mt={1} colorPalette="teal" onClick={() => onOpen(entry)}>View all {entry.examples!.length} examples</Button> : null}</Table.Cell>
        <Table.Cell py={3}><Text fontSize="sm" color={entry.level ? undefined : "fg.muted"}>{entry.level || "Not set"}</Text></Table.Cell>
        <Table.Cell py={3}><Stack gap={2}><Text fontSize="sm">{contentMasteryLabel(entry.masteryScope)}</Text><details><summary style={{ cursor: "pointer", fontSize: "0.875rem" }}>Applicable Can-do</summary><Stack mt={2}><ScopeNames ids={entry.canDoIds} options={snapshot.canDoOptions} /></Stack></details></Stack></Table.Cell>
      </Table.Row>; })}</Table.Body>
    </Table.Root>
    {!entries.length ? <Text role="status" color="fg.muted" p={5}>No language content matches these filters.</Text> : null}
  </Box>;
}
