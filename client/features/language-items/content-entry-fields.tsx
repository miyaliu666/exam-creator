import { Field, SimpleGrid, Stack, Textarea } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { CONTENT_KIND_LABELS } from "./labels";
import { SelectField, TextField } from "./registry-form-controls";
import type { ContentIdOption, RegistrySnapshot } from "./types";

function ContentLines({ label, values, disabled, onChange }: { label: string; values: string[]; disabled: boolean; onChange: (values: string[]) => void }) {
  return <Field.Root><Field.Label>{label}</Field.Label><Textarea value={values.join("\n")} disabled={disabled} onChange={(event) => onChange(event.target.value.split("\n"))} placeholder={disabled ? "Not provided" : "One per line"} /></Field.Root>;
}

export function ContentEntryFields({ entry, snapshot, isNew, disabled, onChange, children }: {
  entry: ContentIdOption;
  snapshot: RegistrySnapshot;
  isNew: boolean;
  disabled: boolean;
  onChange: (entry: ContentIdOption) => void;
  children?: ReactNode;
}) {
  const kinds = [...new Set(["lexical", "grammar", "character", "pragmatics", "supported", ...snapshot.contentIdOptions.map((candidate) => candidate.kind)])];
  const text = (key: "label" | "meaning" | "pattern" | "pinyin" | "englishGloss" | "restrictions" | "notes") => (value: string) => onChange({ ...entry, [key]: value });
  return <Stack gap={4}>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <SelectField label="Category" value={entry.kind} options={kinds.map((id) => ({ id, label: CONTENT_KIND_LABELS[id] ?? id }))} disabled={disabled || !isNew} onChange={(kind) => onChange({ ...entry, kind })} />
      <TextField label={entry.kind === "lexical" ? "Word or phrase *" : entry.kind === "grammar" ? "Grammar name *" : "Name *"} value={entry.label} translate={false} disabled={disabled} onChange={text("label")} />
    </SimpleGrid>
    {children}
    {entry.kind === "lexical" ? <TextField label={`Meaning${isNew || entry.meaning !== undefined ? " *" : ""}`} value={entry.meaning ?? ""} translate={false} multiline disabled={disabled} onChange={text("meaning")} /> : null}
    {entry.kind === "grammar" ? <TextField label={`Structure${isNew || entry.pattern !== undefined ? " *" : ""}`} value={entry.pattern ?? ""} translate={false} disabled={disabled} onChange={text("pattern")} /> : null}
  </Stack>;
}

export function ContentEntryDetails({ entry, disabled, onChange }: {
  entry: ContentIdOption;
  disabled: boolean;
  onChange: (entry: ContentIdOption) => void;
}) {
  return <Stack gap={4} mt={4}>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      {entry.kind === "lexical" || entry.kind === "character" || entry.pinyin !== undefined ? <TextField label="Pinyin" value={entry.pinyin ?? ""} translate={false} disabled={disabled} onChange={(pinyin) => onChange({ ...entry, pinyin })} /> : null}
      <TextField label="English meaning" value={entry.englishGloss ?? ""} translate={false} disabled={disabled} onChange={(englishGloss) => onChange({ ...entry, englishGloss })} />
    </SimpleGrid>
    {entry.kind !== "lexical" && entry.meaning !== undefined ? <TextField label="Meaning" value={entry.meaning} translate={false} multiline disabled={disabled} onChange={(meaning) => onChange({ ...entry, meaning })} /> : null}
    {entry.kind !== "grammar" && entry.pattern !== undefined ? <TextField label="Structure" value={entry.pattern} translate={false} disabled={disabled} onChange={(pattern) => onChange({ ...entry, pattern })} /> : null}
    <ContentLines label="Examples" values={entry.examples ?? []} disabled={disabled} onChange={(examples) => onChange({ ...entry, examples })} />
    <TextField label="Usage restrictions" value={entry.restrictions ?? ""} translate={false} multiline disabled={disabled} onChange={(restrictions) => onChange({ ...entry, restrictions })} />
    <ContentLines label="Sources" values={entry.sources ?? []} disabled={disabled} onChange={(sources) => onChange({ ...entry, sources })} />
    <TextField label="Notes" value={entry.notes ?? ""} translate={false} multiline disabled={disabled} onChange={(notes) => onChange({ ...entry, notes })} />
  </Stack>;
}
