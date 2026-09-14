import { SimpleGrid, Stack } from "@chakra-ui/react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import type { BulkScopeMode, ContentBulkChanges } from "./content-bulk-model";
import { SelectField, TextField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { RegistrySnapshot } from "./types";

export function ContentBulkFields({ changes, snapshot, disabled, scopeDisabled = false, onChange }: {
  changes: ContentBulkChanges;
  snapshot: RegistrySnapshot;
  disabled: boolean;
  scopeDisabled?: boolean;
  onChange: (changes: ContentBulkChanges) => void;
}) {
  const scopeOptions = [{ id: "keep", label: "Keep existing values" }, { id: "unrestricted", label: "Not restricted" }, { id: "selected", label: "Replace with selected values" }];
  return <Stack gap={4}>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <SelectField label="Level" value={changes.levelMode} options={[{ id: "keep", label: "Keep existing levels" }, { id: "set", label: "Set level" }, { id: "clear", label: "Clear level" }]} disabled={disabled} onChange={(value) => onChange({ ...changes, levelMode: value as ContentBulkChanges["levelMode"] })} />
      {changes.levelMode === "set" ? <TextField label="New level" value={changes.level} translate={false} disabled={disabled} onChange={(level) => onChange({ ...changes, level })} /> : null}
      {!scopeDisabled ? <>
        <SelectField label="Mastery scope" value={changes.mastery} options={[{ id: "__keep", label: "Keep existing values" }, ...CONTENT_MASTERY_OPTIONS]} disabled={disabled} onChange={(mastery) => onChange({ ...changes, mastery })} />
        <SelectField label="Applicable Can-do" value={changes.canDoMode} options={scopeOptions} disabled={disabled} onChange={(value) => onChange({ ...changes, canDoMode: value as BulkScopeMode })} />
      </> : null}
    </SimpleGrid>
    {changes.canDoMode === "selected" ? <RegistryMultiSelect label="Selected Can-do" options={snapshot.canDoOptions} values={changes.canDoIds} disabled={disabled} onChange={(canDoIds) => onChange({ ...changes, canDoIds })} /> : null}
  </Stack>;
}
