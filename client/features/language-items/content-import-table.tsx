import { Box, Button, HStack, Input, Stack, Table, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import { IMPORT_FIELDS, type ContentImportRow, type ImportField, type validateContentImport } from "./content-import-model";
import { CONTENT_KIND_LABELS } from "./labels";
import { contentLanguage, contentLanguageLabel } from "./content-language";

type Preview = ReturnType<typeof validateContentImport>[number];
const MAIN_FIELDS: ImportField[] = ["language", "level", "label", "meaning"];

function importDisplayValue(field: ImportField, value: string): string {
  if (!value.trim()) return value;
  if (field === "language") return contentLanguageLabel(value);
  if (field === "kind") return CONTENT_KIND_LABELS[value.trim().toLowerCase()]?.split(" / ").at(-1) ?? value;
  if (field === "masteryScope") return CONTENT_MASTERY_OPTIONS.find((option) => option.id.toLowerCase() === value.trim().toLowerCase())?.label ?? value;
  return value;
}

function ImportCell({ field, label, row, entry, mode, invalid, disabled, onChange }: {
  field: ImportField;
  label: string;
  row: ContentImportRow;
  entry: Preview["entry"];
  mode: "add" | "update";
  invalid: boolean;
  disabled: boolean;
  onChange: (row: ContentImportRow) => void;
}) {
  const props = {
    size: "sm" as const, "aria-label": `${label} · ${row.source}`, value: importDisplayValue(field, row.values[field]), disabled,
    "aria-invalid": invalid, borderColor: invalid ? "red.400" : undefined,
    placeholder: field === "meaning" && entry && contentLanguage(entry) === "en" ? "Optional" : mode === "add" && ["masteryScope", "canDoIds"].includes(field) ? "Not restricted" : undefined,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange({ ...row, duplicateConfirmed: false, values: { ...row.values, [field]: event.target.value } }),
  };
  const multiline = !["id", "language", "kind", "level", "label", "masteryScope", "pinyin"].includes(field) || /[\r\n]/.test(row.values[field]);
  return multiline ? <Textarea {...props} rows={2} resize="vertical" /> : <Input {...props} />;
}

export function ContentImportTable({ previews, mode, disabled, reviewOnly, reviewIds, pendingReviewIds, reviewRequest, onShowAll, onExcludeReview, onChange, onRemove }: {
  previews: Preview[];
  mode: "add" | "update";
  disabled: boolean;
  reviewOnly: boolean;
  reviewIds: string[];
  pendingReviewIds: string[];
  reviewRequest: number;
  onShowAll: () => void;
  onExcludeReview: () => void;
  onChange: (row: ContentImportRow) => void;
  onRemove: (id: string) => void;
}) {
  const [page, setPage] = useState(0);
  const [allFields, setAllFields] = useState(false);
  const reviewSet = new Set(reviewIds);
  // Keep reviewed rows in this view while their fields are being corrected.
  const displayed = reviewOnly ? previews.filter(({ row }) => row.included && reviewSet.has(row.id)) : previews;
  const pendingHere = pendingReviewIds.filter((id) => reviewSet.has(id)).length;
  const pageCount = Math.max(1, Math.ceil(displayed.length / 20));
  const visiblePage = Math.min(page, pageCount - 1);
  const tableSection = useRef<HTMLDivElement>(null);
  const scrollContainer = useRef<HTMLDivElement>(null);
  useEffect(() => { setPage(0); }, [reviewOnly, reviewRequest]);
  useEffect(() => { if (scrollContainer.current) scrollContainer.current.scrollTop = 0; }, [visiblePage, reviewOnly, reviewRequest]);
  useEffect(() => {
    if (!reviewRequest) return;
    tableSection.current?.focus({ preventScroll: true });
    tableSection.current?.scrollIntoView({ block: "start" });
  }, [reviewRequest]);
  const hasStructure = previews.some(({ entry, row }) => entry?.kind === "grammar" || row.values.pattern.trim());
  const hasPinyin = previews.some(({ entry, row }) => !!row.values.pinyin || row.sourceFields?.includes("pinyin") || entry && ["lexical", "character"].includes(entry.kind) && /\p{Script=Han}/u.test(entry.label));
  const hasCategories = new Set(previews.map(({ entry }) => entry?.kind)).size > 1 || previews.some(({ errors }) => errors.some(({ field }) => field === "kind"));
  const fields = IMPORT_FIELDS.filter((field) => allFields || MAIN_FIELDS.includes(field.key) || field.key === "pattern" && hasStructure || field.key === "pinyin" && hasPinyin || field.key === "kind" && hasCategories || mode === "update" && field.key === "id");
  const labels = new Map(IMPORT_FIELDS.map((field) => [field.key, field.label]));
  return <Stack gap={3} ref={tableSection} tabIndex={-1} aria-label={reviewOnly ? "Rows to review" : "Import entries"}>
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <HStack gap={2} flexWrap="wrap">
        <Text fontWeight="medium">{reviewOnly ? `Reviewing ${displayed.length} ${displayed.length === 1 ? "row" : "rows"} · ${pendingHere} ${pendingHere === 1 ? "needs" : "need"} attention` : `Entries (${previews.length})`}</Text>
        {reviewOnly ? <><Button size="xs" variant="outline" onClick={onShowAll}>Show all rows ({previews.length})</Button>{pendingHere ? <Button size="xs" variant="outline" disabled={disabled} onClick={onExcludeReview}>Exclude {pendingHere === 1 ? "1 unresolved row" : `${pendingHere} unresolved rows`}</Button> : null}</> : null}
      </HStack>
      <Button size="xs" variant="outline" onClick={() => setAllFields(!allFields)}>{allFields ? "Fewer fields" : "More fields"}</Button>
    </HStack>
    {reviewOnly && !pendingHere ? <Text role="status" fontSize="sm">All rows in this review have been resolved or excluded.</Text> : null}
    <Box ref={scrollContainer} overflowX="auto" borderWidth="1px" borderRadius="md" maxH="lg">
      <Table.Root size="sm" minW={allFields ? "2800px" : "920px"}>
        <Table.Header position="sticky" top={0} zIndex={1} bg="bg.panel"><Table.Row><Table.ColumnHeader minW="230px">Row / Checks</Table.ColumnHeader>{fields.map((field) => <Table.ColumnHeader key={field.key} minW={field.key === "canDoIds" ? "240px" : "160px"}>{field.label}</Table.ColumnHeader>)}<Table.ColumnHeader>Remove</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{displayed.slice(visiblePage * 20, (visiblePage + 1) * 20).map(({ row, entry, errors, duplicates, changes }) => <Table.Row key={row.id} verticalAlign="top" opacity={row.included ? 1 : 0.65}>
          <Table.Cell><Stack gap={2} minW="220px"><label><input type="checkbox" checked={row.included} disabled={disabled} onChange={(event) => onChange({ ...row, included: event.target.checked })} /> {row.source}</label>
            {errors.map((error, index) => <Text key={`${error.field}-${index}`} color="fg.error" fontSize="xs">{labels.get(error.field) ?? error.field}: {error.message}</Text>)}
            {duplicates.length ? <Stack gap={1}><Text fontSize="xs" color="fg.warning">Same name: {duplicates.join("; ")}</Text><label style={{ fontSize: 12 }}><input type="checkbox" disabled={disabled} checked={row.duplicateConfirmed} onChange={(event) => onChange({ ...row, duplicateConfirmed: event.target.checked })} /> Different meaning or use; keep as a separate entry</label></Stack> : null}
            {mode === "update" && changes.length ? <details><summary style={{ fontSize: 12, cursor: "pointer" }}>{changes.length} field changes</summary><Stack gap={1} mt={1}>{changes.map((change) => <Text key={change.field} fontSize="xs" overflowWrap="anywhere">{labels.get(change.field)}: {importDisplayValue(change.field, change.before) || "Not provided"} → {importDisplayValue(change.field, change.after) || "Cleared"}</Text>)}</Stack></details> : null}
            {!errors.length && !duplicates.length ? <Text fontSize="xs" color="fg.success">Ready</Text> : null}
          </Stack></Table.Cell>
          {fields.map((field) => <Table.Cell key={field.key}><ImportCell field={field.key} label={field.label} row={row} entry={entry} mode={mode} disabled={disabled} invalid={errors.some((error) => error.field === field.key)} onChange={onChange} /></Table.Cell>)}
          <Table.Cell><Button size="xs" variant="outline" disabled={disabled} onClick={() => onRemove(row.id)}>Remove</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root>
    </Box>
    {pageCount > 1 ? <HStack justify="end"><Button size="sm" variant="outline" disabled={!visiblePage} onClick={() => setPage(visiblePage - 1)}>Previous</Button><Text fontSize="sm">Page {visiblePage + 1} of {pageCount}</Text><Button size="sm" variant="outline" disabled={visiblePage + 1 >= pageCount} onClick={() => setPage(visiblePage + 1)}>Next</Button></HStack> : null}
  </Stack>;
}
