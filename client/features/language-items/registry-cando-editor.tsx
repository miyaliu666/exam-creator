import { Button, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { SKILL_LABELS } from "./labels";
import { RegistryEntryPicker } from "./registry-entry-picker";
import { SelectField } from "./registry-form-controls";
import { canDoReferenceCount, registryNameExists, type SharedRegistryEditorProps } from "./registry-shared-edit-model";

const ACTIVITIES = ["Reception", "Production", "Interaction", "Mediation"];

export function RegistryCanDoEditor({ snapshot, update, disabled, selectedId }: SharedRegistryEditorProps) {
  const [id, setId] = useState(selectedId ?? snapshot.canDoOptions[0]?.id ?? "");
  const entry = snapshot.canDoOptions.find((option) => option.id === id);
  const change = (field: "label" | "primarySkill" | "activity", value: string) => update((next) => {
    const current = next.canDoOptions.find((option) => option.id === id);
    if (current) current[field] = value;
  });
  const add = () => {
    const createdId = `A1-CUSTOM-${crypto.randomUUID()}`;
    update((next) => { next.canDoOptions.push({ id: createdId, label: "", primarySkill: "Reading", activity: "Reception" }); });
    setId(createdId);
  };
  const remove = () => {
    if (!entry || canDoReferenceCount(snapshot, id) || !window.confirm("Delete this unused Can-do statement?")) return;
    update((next) => { if (!canDoReferenceCount(next, id)) next.canDoOptions = next.canDoOptions.filter((option) => option.id !== id); });
    setId(snapshot.canDoOptions.find((option) => option.id !== id)?.id ?? "");
  };
  return <Stack gap={4}>
    <RegistryEntryPicker key={id} label="Can-do statement" id={id} name={entry?.label}
      options={snapshot.canDoOptions.map((option) => ({ id: option.id, label: option.label || "New Can-do statement" }))}
      disabled={disabled} multiline editLabel="Edit statement" viewLabel="View statement" addLabel="Add Can-do statement" onSelect={setId} onAdd={add}
      onRename={(value) => change("label", value)} />
    {entry ? <>
      {!entry.label.trim() ? <Text fontSize="sm" color="fg.error">Enter a Can-do statement.</Text> : registryNameExists(snapshot.canDoOptions, entry.label, id) ? <Text fontSize="sm" color="fg.error">A Can-do with this name already exists.</Text> : null}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <SelectField label="Primary skill" value={entry.primarySkill ?? ""} placeholder="Select skill" options={Object.entries(SKILL_LABELS).map(([id, label]) => ({ id, label }))} disabled={disabled} onChange={(value) => change("primarySkill", value)} />
        <SelectField label="Activity" value={entry.activity ?? ""} placeholder="Select activity" options={ACTIVITIES.map((id) => ({ id, label: id }))} disabled={disabled} onChange={(value) => change("activity", value)} />
      </SimpleGrid>
      {canDoReferenceCount(snapshot, id) ? <Text fontSize="sm" color="fg.muted">Used by {canDoReferenceCount(snapshot, id)} rule or language records.</Text>
        : !disabled ? <Button alignSelf="start" size="sm" variant="outline" colorPalette="red" onClick={remove}>Delete unused</Button> : null}
    </> : <Text color="fg.muted">No Can-do statements configured.</Text>}
  </Stack>;
}
