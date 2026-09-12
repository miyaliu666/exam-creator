import { Stack } from "@chakra-ui/react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import { InvalidSelections, SelectField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentEntryScopes({ entry, snapshot, onChange, disabled }: {
  entry: ContentIdOption;
  snapshot: RegistrySnapshot;
  onChange: (entry: ContentIdOption) => void;
  disabled: boolean;
}) {
  const invalidCanDo = entry.canDoIds.filter((id) => !snapshot.canDoOptions.some((option) => option.id === id)).map((id) => ({ id, label: "Unavailable Can-do", reason: "This Can-do no longer exists." }));
  const invalidContexts = entry.contextIds.flatMap((id) => {
    const option = snapshot.contextOptions.find((context) => context.id === id);
    return !option || option.retired ? [{ id, label: option?.label ?? "Unavailable Context", reason: option?.retired ? "This Context is retired." : "This Context no longer exists." }] : [];
  });
  return <Stack gap={4}>
    <SelectField label="Mastery scope" value={entry.masteryScope ?? ""} options={[...CONTENT_MASTERY_OPTIONS, ...(entry.masteryScope && !CONTENT_MASTERY_OPTIONS.some((option) => option.id === entry.masteryScope) ? [{ id: entry.masteryScope, label: "Unknown mastery scope" }] : [])]} disabled={disabled} onChange={(value) => onChange({ ...entry, masteryScope: value || null })} />
    <RegistryMultiSelect label="Applicable Can-do" emptyLabel="Not restricted" maxVisibleSelections={3} options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(canDoIds) => onChange({ ...entry, canDoIds })} />
    <InvalidSelections label="Unavailable Can-do" entries={invalidCanDo} disabled={disabled} onRemove={(id) => onChange({ ...entry, canDoIds: entry.canDoIds.filter((value) => value !== id) })} />
    <RegistryMultiSelect label="Applicable Context" emptyLabel="Not restricted" maxVisibleSelections={3} options={snapshot.contextOptions.filter((option) => !option.retired)} values={entry.contextIds} disabled={disabled} onChange={(contextIds) => onChange({ ...entry, contextIds })} />
    <InvalidSelections label="Unavailable Context" entries={invalidContexts} disabled={disabled} onRemove={(id) => onChange({ ...entry, contextIds: entry.contextIds.filter((value) => value !== id) })} />
  </Stack>;
}
