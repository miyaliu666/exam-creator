import { Button, Field, HStack, SimpleGrid, Stack, Textarea } from "@chakra-ui/react";

import { FilePicker } from "../../components/ui/file-picker";
import { SelectField } from "./registry-form-controls";

export function ContentImportInput({ text, kind, busy, allowDefaultCategory, onText, onKind, onParse, onFile }: {
  text: string;
  kind: string;
  busy: boolean;
  allowDefaultCategory: boolean;
  onText: (text: string) => void;
  onKind: (kind: string) => void;
  onParse: () => void;
  onFile: (file: File) => void;
}) {
  return <Stack gap={3}>
    <SimpleGrid columns={{ base: 1, md: allowDefaultCategory ? 2 : 1 }} alignItems="end" gap={3}>
      {allowDefaultCategory ? <SelectField label="Import category" value={kind} disabled={busy} options={[{ id: "lexical", label: "Vocabulary" }, { id: "grammar", label: "Grammar" }, { id: "character", label: "Characters" }, { id: "pragmatics", label: "Pragmatic functions" }, { id: "supported", label: "Supporting material types" }]} onChange={onKind} /> : null}
      <FilePicker label="File (.xlsx, .md, .tsv, .txt)" accept=".xlsx,.md,.markdown,.tsv,.txt" disabled={busy} resetAfterSelect onFile={onFile} />
    </SimpleGrid>
    <Field.Root>
      <HStack gap={3} flexWrap="wrap">
        <Field.Label>Paste table or names</Field.Label>
        <Button size="xs" variant="outline" disabled={busy || !text.trim()} onClick={onParse}>Read pasted input</Button>
      </HStack>
      <Textarea rows={3} value={text} disabled={busy} placeholder={kind === "grammar" ? "Level    Name    Structure" : "Level    Name    Meaning"} onChange={(event) => onText(event.target.value)} />
    </Field.Root>
  </Stack>;
}
