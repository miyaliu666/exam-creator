import { Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { IMPORT_FIELDS, type ContentImportTable } from "./content-import-model";
import { SelectField } from "./registry-form-controls";

export function ContentImportMapping({ tables, disabled, onChange, onApply, onDiscard }: {
  tables: ContentImportTable[];
  disabled: boolean;
  onChange: (tables: ContentImportTable[]) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return <Stack gap={3} borderWidth="1px" borderRadius="lg" p={4}>
    <Text fontWeight="semibold">Column mapping</Text>
    {tables.map((table, tableIndex) => <Stack gap={2} key={`${table.source}-${tableIndex}`}>
      <Text fontSize="sm" fontWeight="medium">{table.source} · {table.rows.length} rows</Text>
      <SimpleGrid columns={{ base: 1, md: 3, xl: 4 }} gap={3}>{table.headers.map((header, column) => <Stack key={`${column}-${header}`} gap={1}>
        <SelectField label={header || `Column ${column + 1}`} value={table.mapping[column]} options={[{ id: "", label: "Ignore column" }, ...IMPORT_FIELDS.map((field) => ({ id: field.key, label: field.label }))]} disabled={disabled} onChange={(value) => onChange(tables.map((source, index) => index === tableIndex ? { ...source, mapping: source.mapping.map((field, fieldIndex) => fieldIndex === column ? value as typeof field : field) } : source))} />
        <Text fontSize="xs" color="fg.muted" overflowWrap="anywhere">{table.rows[0]?.cells[column]?.slice(0, 100) || "Empty sample"}</Text>
      </Stack>)}</SimpleGrid>
    </Stack>)}
    <HStack><Button size="sm" colorPalette="teal" disabled={disabled} onClick={onApply}>Preview rows</Button><Button size="sm" variant="outline" disabled={disabled} onClick={onDiscard}>Discard input</Button></HStack>
  </Stack>;
}
