import { Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { IMPORT_FIELDS, type ContentImportTable } from "./content-import-model";
import { SelectField } from "./registry-form-controls";

export function ContentImportMapping({ tables, disabled, onChange, onApply, onDiscard }: {
  tables: ContentImportTable[];
  disabled: boolean;
  onChange: (tables: ContentImportTable[]) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  return <Stack gap={3} borderWidth="1px" borderRadius="lg" p={4}>
    <HStack justify="space-between"><Text fontWeight="semibold">Match remaining columns</Text><Button size="xs" variant="outline" onClick={() => setShowAll(!showAll)}>{showAll ? "Remaining columns" : "All columns"}</Button></HStack>
    {tables.map((table, tableIndex) => <Stack gap={2} key={`${table.source}-${tableIndex}`}>
      <Text fontSize="sm" fontWeight="medium">{table.source} · {table.rows.length} rows</Text>
      {!showAll ? <Text fontSize="xs" color="fg.muted">Recognized: {table.mapping.flatMap((field, column) => field && field !== "__ignore" && table.mapping.filter((value) => value === field).length === 1 ? [`${table.headers[column]} → ${IMPORT_FIELDS.find(({ key }) => key === field)?.label}`] : []).join(" · ") || "None"}</Text> : null}
      <SimpleGrid columns={{ base: 1, md: 3, xl: 4 }} gap={3}>{table.headers.map((header, column) => showAll || !table.mapping[column] || table.mapping.filter((field) => field === table.mapping[column]).length > 1 ? <Stack key={`${column}-${header}`} gap={1}>
        <SelectField label={header || `Column ${column + 1}`} value={table.mapping[column]} options={[{ id: "", label: "Choose field" }, { id: "__ignore", label: "Ignore column" }, ...IMPORT_FIELDS.map((field) => ({ id: field.key, label: field.label }))]} disabled={disabled} onChange={(value) => onChange(tables.map((source, index) => index === tableIndex ? { ...source, mapping: source.mapping.map((field, fieldIndex) => fieldIndex === column ? value as typeof field : field) } : source))} />
        <Text fontSize="xs" color="fg.muted" overflowWrap="anywhere">{table.rows[0]?.cells[column]?.slice(0, 100) || "Empty sample"}</Text>
      </Stack> : null)}</SimpleGrid>
    </Stack>)}
    <HStack><Button size="sm" colorPalette="teal" disabled={disabled} onClick={onApply}>Preview rows</Button><Button size="sm" variant="outline" disabled={disabled} onClick={onDiscard}>Discard input</Button></HStack>
  </Stack>;
}
