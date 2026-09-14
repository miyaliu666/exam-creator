import { Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { DOMAIN_LABELS, WORKBENCH_LABELS } from "./labels";
import { RegistryEntryPicker } from "./registry-entry-picker";
import { InvalidSelections, SelectField, TextField, TextListField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import { registryNameExists, type SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { RegistryContext } from "./types";

export function RegistryContextEditor({ snapshot, update, disabled, selectedId }: SharedRegistryEditorProps) {
  const [id, setId] = useState(selectedId || snapshot.contextOptions[0]?.id || "");
  const entry = snapshot.contextOptions.find((option) => option.id === id);
  const change = (mutate: (context: RegistryContext) => void) => update((next) => {
    const current = next.contextOptions.find((option) => option.id === id);
    if (current) mutate(current);
  });
  const add = () => {
    const createdId = `CTX-CUSTOM-${crypto.randomUUID()}`;
    update((next) => { next.contextOptions.push({ id: createdId, label: "", primaryDomains: [], canDoIds: [], scope: "", exclusions: [], retired: true }); });
    setId(createdId);
  };
  const canRestore = entry && entry.label.trim() && !registryNameExists(snapshot.contextOptions, entry.label, id)
    && entry.scope.trim() && entry.primaryDomains.length === 1 && snapshot.allowedDomains.includes(entry.primaryDomains[0])
    && entry.canDoIds.some((canDoId) => snapshot.canDoOptions.some((option) => option.id === canDoId));
  const usedBy = snapshot.capabilities.filter((capability) => !capability.itemFormatId.startsWith("EXERCISE:") && capability.allowedContextIds.includes(id)).length
    + (snapshot.exerciseTemplateRules ?? []).filter((rule) => rule.allowedContextIds.includes(id)).length;
  return <Stack gap={4}>
    <RegistryEntryPicker key={id} label={WORKBENCH_LABELS.context} id={id} name={entry?.label}
      options={snapshot.contextOptions.map((context) => ({ id: context.id, label: `${context.label || "New Context"}${context.retired ? " · retired" : ""}` }))}
      disabled={disabled} editLabel="Rename" addLabel="Add Context" onSelect={setId} onAdd={add}
      onRename={(value) => change((context) => { context.label = value; })} />
    {entry ? <>
      {!entry.label.trim() ? <Text fontSize="sm" color="fg.error">Enter a Context name.</Text> : registryNameExists(snapshot.contextOptions, entry.label, id) ? <Text fontSize="sm" color="fg.error">A Context with this name already exists.</Text> : null}
      <SelectField label="Primary Domain" value={entry.primaryDomains.length === 1 ? entry.primaryDomains[0] : ""} placeholder="Select Domain" options={snapshot.allowedDomains.map((id) => ({ id, label: DOMAIN_LABELS[id] ?? id }))} disabled={disabled}
        onChange={(value) => change((context) => { context.primaryDomains = [value]; })} />
      {entry.primaryDomains.length > 1 ? <Text role="alert" color="fg.error">This Context has multiple Domains. Select one Domain.</Text> : null}
      {entry.primaryDomains.length === 1 && !snapshot.allowedDomains.includes(entry.primaryDomains[0]) ? <Text role="alert" color="fg.error">This Context has an unavailable Domain. Select one Domain.</Text> : null}
      <RegistryMultiSelect label="Compatible Primary Can-do" options={snapshot.canDoOptions} values={entry.canDoIds} disabled={disabled} onChange={(values) => change((context) => { context.canDoIds = values; })} />
      <InvalidSelections label="Invalid compatible Can-do" entries={entry.canDoIds.filter((canDoId) => !snapshot.canDoOptions.some((option) => option.id === canDoId)).map((id) => ({ id, label: "Missing Can-do", reason: "This Can-do no longer exists." }))} disabled={disabled}
        onRemove={(canDoId) => change((context) => { context.canDoIds = context.canDoIds.filter((value) => value !== canDoId); })} />
      <TextField label="Scope and boundary" value={entry.scope} multiline disabled={disabled} onChange={(value) => change((context) => { context.scope = value; })} />
      <TextListField label="Explicit exclusions" values={entry.exclusions} disabled={disabled} onChange={(values) => change((context) => { context.exclusions = values; })} />
      <HStack justify="space-between"><Text fontSize="sm" color="fg.muted">Used by {usedBy} item rule sets</Text>
        {!disabled ? <Button size="sm" variant="outline" colorPalette={entry.retired ? "teal" : "orange"} disabled={entry.retired && !canRestore} onClick={() => change((context) => { context.retired = !context.retired; })}>{entry.retired ? "Restore Context" : "Retire Context"}</Button> : null}
      </HStack>
    </> : <Text color="fg.muted">No Contexts configured.</Text>}
  </Stack>;
}
