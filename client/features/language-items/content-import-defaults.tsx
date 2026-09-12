import { Button, SimpleGrid, Stack } from "@chakra-ui/react";
import { useState } from "react";

import { CONTENT_MASTERY_OPTIONS } from "./content-catalog-model";
import { SelectField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { ContentImportRow } from "./content-import-model";
import type { RegistrySnapshot } from "./types";

export function ContentImportDefaults({ snapshot, disabled, onApply }: {
  snapshot: RegistrySnapshot;
  disabled: boolean;
  onApply: (values: Partial<ContentImportRow["values"]>) => void;
}) {
  const [mastery, setMastery] = useState("__keep");
  const [canDoMode, setCanDoMode] = useState("__keep");
  const [contextMode, setContextMode] = useState("__keep");
  const [canDoIds, setCanDoIds] = useState<string[]>([]);
  const [contextIds, setContextIds] = useState<string[]>([]);
  const scopeOptions = [{ id: "__keep", label: "Keep each row's value" }, { id: "unrestricted", label: "Not restricted" }, { id: "selected", label: "Selected values" }];
  const hasChange = mastery !== "__keep" || canDoMode !== "__keep" || contextMode !== "__keep";
  const valid = (canDoMode !== "selected" || !!canDoIds.length) && (contextMode !== "selected" || !!contextIds.length);
  const apply = () => {
    const values: Partial<ContentImportRow["values"]> = {};
    if (mastery !== "__keep") values.masteryScope = mastery || "Not restricted";
    if (canDoMode !== "__keep") values.canDoIds = canDoMode === "unrestricted" ? "Not restricted" : canDoIds.join("; ");
    if (contextMode !== "__keep") values.contextIds = contextMode === "unrestricted" ? "Not restricted" : contextIds.join("; ");
    onApply(values);
  };
  return <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Set scopes for included rows</summary><Stack gap={3} mt={3}>
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      <SelectField label="Mastery scope" value={mastery} options={[{ id: "__keep", label: "Keep each row's value" }, ...CONTENT_MASTERY_OPTIONS]} disabled={disabled} onChange={setMastery} />
      <SelectField label="Applicable Can-do" value={canDoMode} options={scopeOptions} disabled={disabled} onChange={setCanDoMode} />
      <SelectField label="Applicable Context" value={contextMode} options={scopeOptions} disabled={disabled} onChange={setContextMode} />
    </SimpleGrid>
    {canDoMode === "selected" ? <RegistryMultiSelect label="Selected Can-do" options={snapshot.canDoOptions} values={canDoIds} disabled={disabled} onChange={setCanDoIds} /> : null}
    {contextMode === "selected" ? <RegistryMultiSelect label="Selected Contexts" options={snapshot.contextOptions.filter((entry) => !entry.retired)} values={contextIds} disabled={disabled} onChange={setContextIds} /> : null}
    <Button alignSelf="start" size="sm" variant="outline" disabled={disabled || !hasChange || !valid} onClick={apply}>Apply to included rows</Button>
  </Stack></details>;
}
