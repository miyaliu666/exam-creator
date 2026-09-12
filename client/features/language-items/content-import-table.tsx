import { Box, Button, HStack, Input, Stack, Table, Text, Textarea } from "@chakra-ui/react";
import { useState, type ChangeEvent } from "react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import { IMPORT_FIELDS, type ContentImportRow, type ImportField, type validateContentImport } from "./content-import-model";
import { CONTENT_KIND_LABELS } from "./labels";

type Preview = ReturnType<typeof validateContentImport>[number];
const MAIN_FIELDS: ImportField[] = ["kind", "label", "meaning", "masteryScope", "canDoIds", "contextIds"];

function importDisplayValue(field: ImportField, value: string): string {
  if (!value.trim()) return value;
  if (field === "kind") return CONTENT_KIND_LABELS[value.trim().toLowerCase()]?.split(" / ").at(-1) ?? value;
  if (field === "masteryScope") return CONTENT_MASTERY_OPTIONS.find((option) => option.id.toLowerCase() === value.trim().toLowerCase())?.label ?? value;
  return value;
}

function ImportCell({ field, label, row, mode, invalid, disabled, onChange }: {
  field: ImportField;
  label: string;
  row: ContentImportRow;
  mode: "add" | "update";
  invalid: boolean;
  disabled: boolean;
  onChange: (row: ContentImportRow) => void;
}) {
  const props = {
    size: "sm" as const, "aria-label": `${label} · ${row.source}`, value: importDisplayValue(field, row.values[field]), disabled,
    "aria-invalid": invalid, borderColor: invalid ? "red.400" : undefined,
    placeholder: mode === "add" && ["masteryScope", "canDoIds", "contextIds"].includes(field) ? "Not restricted" : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...row, duplicateConfirmed: false, values: { ...row.values, [field]: event.target.value } }),
  };
  const multiline = !["id", "kind", "label", "masteryScope", "pinyin"].includes(field) || /[\r\n]/.test(row.values[field]);
  return multiline ? <Textarea {...props} rows={2} resize="vertical" /> : <Input {...props} />;
}

export function ContentImportTable({ previews, mode, disabled, onChange, onRemove }: {
  previews: Preview[];
  mode: "add" | "update";
  disabled: boolean;
  onChange: (row: ContentImportRow) => void;
  onRemove: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [allFields, setAllFields] = useState(false);
  const pageCount = Math.max(1, Math.ceil(previews.length / 20));
  const visiblePage = Math.min(page, pageCount - 1);
  const hasStructure = previews.some(({ entry, row }) => entry?.kind === "grammar" || row.values.pattern.trim());
  const fields = IMPORT_FIELDS.filter((field) => field.key !== "metadata" && (allFields || MAIN_FIELDS.includes(field.key) || field.key === "pattern" && hasStructure || mode === "update" && field.key === "id"));
  const labels = new Map(IMPORT_FIELDS.map((field) => [field.key, field.label]));
  return <Stack gap={3}>
    <HStack justify="space-between" flexWrap="wrap"><Text fontWeight="medium">Entries</Text><Button size="xs" variant="outline" onClick={() => setAllFields(!allFields)}>{allFields ? "Fewer fields" : "More fields"}</Button></HStack>
    <Box overflowX="auto" borderWidth="1px" borderRadius="md" maxH="lg">
      <Table.Root size="sm" minW={allFields ? "2600px" : hasStructure ? "1650px" : "1490px"}>
        <Table.Header><Table.Row><Table.ColumnHeader minW="230px">Row / Checks</Table.ColumnHeader>{fields.map((field) => <Table.ColumnHeader key={field.key} minW={field.key === "canDoIds" || field.key === "contextIds" ? "240px" : "160px"}>{field.label}</Table.ColumnHeader>)}<Table.ColumnHeader>Remove</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{previews.slice(visiblePage * 20, (visiblePage + 1) * 20).map(({ row, errors, duplicates, changes }) => <Table.Row key={row.id} verticalAlign="top" opacity={row.included ? 1 : 0.65}>
          <Table.Cell><Stack gap={2} minW="220px"><label><input type="checkbox" checked={row.included} disabled={disabled} onChange={(event) => onChange({ ...row, included: event.target.checked })} /> {row.source}</label>
            {errors.map((error, index) => <Text key={`${error.field}-${index}`} color="fg.error" fontSize="xs">{labels.get(error.field) ?? error.field}: {error.message}</Text>)}
            {duplicates.length ? <Stack gap={1}><Text fontSize="xs" color="fg.warning">Possible duplicate: {duplicates.join("; ")}</Text><label style={{ fontSize: 12 }}><input type="checkbox" disabled={disabled} checked={row.duplicateConfirmed} onChange={(event) => onChange({ ...row, duplicateConfirmed: event.target.checked })} /> Keep as a separate entry</label></Stack> : null}
            {mode === "update" && changes.length ? <details><summary style={{ fontSize: 12, cursor: "pointer" }}>{changes.length} field changes</summary><Stack gap={1} mt={1}>{changes.map((change) => <Text key={change.field} fontSize="xs" overflowWrap="anywhere">{labels.get(change.field)}: {importDisplayValue(change.field, change.before) || "Not provided"} → {importDisplayValue(change.field, change.after) || "Cleared"}</Text>)}</Stack></details> : null}
            {!errors.length && !duplicates.length ? <Text fontSize="xs" color="fg.success">Ready</Text> : null}
          </Stack></Table.Cell>
          {fields.map((field) => <Table.Cell key={field.key}><ImportCell field={field.key} label={field.label} row={row} mode={mode} disabled={disabled} invalid={errors.some((error) => error.field === field.key)} onChange={onChange} /></Table.Cell>)}
          <Table.Cell><Button size="xs" variant="outline" disabled={disabled} onClick={() => onRemove(row.id)}>Remove</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root>
    </Box>
    {pageCount > 1 ? <HStack justify="end"><Button size="sm" variant="outline" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous</Button><Text fontSize="sm">Page {visiblePage + 1} of {pageCount}</Text><Button size="sm" variant="outline" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next</Button></HStack> : null}
  </Stack>;
}
