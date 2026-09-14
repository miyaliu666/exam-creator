import { Box, Button, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";

import { contentMasteryLabel } from "./content-catalog-model";
import { languageTargetLabel } from "./language-target-labels";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentBulkPreview({ entries, original, snapshot }: { entries: ContentIdOption[]; original: ContentIdOption[]; snapshot: RegistrySnapshot }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(entries.length / 20));
  const visiblePage = Math.min(page, pageCount - 1);
  const names = (ids: string[]) => ids.map((id) => snapshot.canDoOptions.find((option) => option.id === id)?.label ?? id).join("; ") || "Not restricted";
  const values = (entry: ContentIdOption): Array<[string, string]> => [
    ["Level", entry.level || "Not set"], ["Mastery scope", contentMasteryLabel(entry.masteryScope)],
    ["Can-do", names(entry.canDoIds)], ["Pinyin", entry.pinyin || "Not set"],
  ];
  return <Stack gap={2}>
    <Text fontWeight="medium">Preview · {entries.length} {entries.length === 1 ? "entry" : "entries"} will change</Text>
    <Box maxH="64" overflow="auto" borderWidth="1px" borderRadius="md"><Table.Root size="sm">
      <Table.Header><Table.Row><Table.ColumnHeader>Entry</Table.ColumnHeader><Table.ColumnHeader>Changes</Table.ColumnHeader></Table.Row></Table.Header>
      <Table.Body>{entries.slice(visiblePage * 20, (visiblePage + 1) * 20).map((entry) => {
        const before = new Map(values(original.find((candidate) => candidate.id === entry.id)!));
        return <Table.Row key={entry.id}><Table.Cell verticalAlign="top">{languageTargetLabel(entry).primary}</Table.Cell><Table.Cell><Stack gap={1}>{values(entry).filter(([key, value]) => before.get(key) !== value).map(([key, value]) => <Text fontSize="sm" key={key}>{key}: {before.get(key)} → {value}</Text>)}</Stack></Table.Cell></Table.Row>;
      })}</Table.Body>
    </Table.Root></Box>
    {pageCount > 1 ? <HStack justify="end"><Button size="xs" variant="outline" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous changes</Button><Text fontSize="sm">{visiblePage + 1} / {pageCount}</Text><Button size="xs" variant="outline" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next changes</Button></HStack> : null}
  </Stack>;
}
