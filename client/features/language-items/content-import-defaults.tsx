import { Button, Field, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import { SelectField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { ContentImportRow } from "./content-import-model";
import type { RegistrySnapshot } from "./types";

export function ContentImportDefaults({ snapshot, disabled, scopeDisabled = false, onApply }: {
  snapshot: RegistrySnapshot;
  disabled: boolean;
  scopeDisabled?: boolean;
  onApply: (values: Partial<ContentImportRow["values"]>) => void;
}) {
  const [mastery, setMastery] = useState("__keep");
  const [level, setLevel] = useState("");
  const [canDoMode, setCanDoMode] = useState("__keep");
  const [canDoIds, setCanDoIds] = useState<string[]>([]);
  const scopeOptions = [{ id: "__keep", label: "Keep each row's value" }, { id: "unrestricted", label: "Not restricted" }, { id: "selected", label: "Selected values" }];
  const hasChange = !!level.trim() || !scopeDisabled && (mastery !== "__keep" || canDoMode !== "__keep");
  const valid = scopeDisabled || canDoMode !== "selected" || !!canDoIds.length;
  const apply = () => {
    const values: Partial<ContentImportRow["values"]> = {};
    if (level.trim()) values.level = level.trim();
    if (!scopeDisabled && mastery !== "__keep") values.masteryScope = mastery || "Not restricted";
    if (!scopeDisabled && canDoMode !== "__keep") values.canDoIds = canDoMode === "unrestricted" ? "Not restricted" : canDoIds.join("; ");
    onApply(values);
  };
  return <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Set fields for included rows</summary><Stack gap={3} mt={3}>
    <Field.Root><Field.Label>Level for included rows</Field.Label><Input value={level} disabled={disabled} placeholder="Keep each row’s level" onChange={(event) => setLevel(event.target.value)} /></Field.Root>
    {scopeDisabled ? <Text fontSize="sm" color="fg.muted">Content scopes are unavailable for this selection.</Text> : <><SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <SelectField label="Mastery scope" value={mastery} options={[{ id: "__keep", label: "Keep each row's value" }, ...CONTENT_MASTERY_OPTIONS]} disabled={disabled} onChange={setMastery} />
      <SelectField label="Applicable Can-do" value={canDoMode} options={scopeOptions} disabled={disabled} onChange={setCanDoMode} />
    </SimpleGrid>
    {canDoMode === "selected" ? <RegistryMultiSelect label="Selected Can-do" options={snapshot.canDoOptions} values={canDoIds} disabled={disabled} onChange={setCanDoIds} /> : null}
    </>}
    <Button alignSelf="start" size="sm" variant="outline" disabled={disabled || !hasChange || !valid} onClick={apply}>Apply to included rows</Button>
  </Stack></details>;
}
