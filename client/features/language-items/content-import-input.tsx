import { Button, Field, HStack, Input, Stack, Textarea } from "@chakra-ui/react";

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
    <HStack align="end" flexWrap="wrap" gap={4}>
      {allowDefaultCategory ? <SelectField label="Category for blank cells" value={kind} disabled={busy} options={[{ id: "lexical", label: "Vocabulary" }, { id: "grammar", label: "Grammar" }, { id: "character", label: "Characters" }, { id: "pragmatics", label: "Pragmatic functions" }, { id: "supported", label: "Supporting material types" }]} onChange={onKind} /> : null}
      <Field.Root><Field.Label>File (.xlsx, .md, .tsv, .txt)</Field.Label><Input type="file" accept=".xlsx,.md,.markdown,.tsv,.txt" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) onFile(file); event.target.value = ""; }} /></Field.Root>
    </HStack>
    <Field.Root><Field.Label>Paste table or names</Field.Label><Textarea rows={4} value={text} disabled={busy} onChange={(event) => onText(event.target.value)} /></Field.Root>
    <Button alignSelf="start" size="sm" variant="outline" disabled={busy || !text.trim()} onClick={onParse}>Read pasted input</Button>
  </Stack>;
}
