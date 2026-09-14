import { Box, Button, HStack, Input, SimpleGrid, Stack, Table, Text } from "@chakra-ui/react";
import { useMemo, useState } from "react";

import { EXERCISE_TEMPLATES, exerciseTemplateById, type ExerciseTemplateField } from "./exercise-template-catalog";
import { FilterSelect } from "./filter-select";
import { registryDisplayText } from "./registry-display-text";
import type { RegistrySnapshot } from "./types";

function fieldRows(fields: ExerciseTemplateField[], parent = ""): Array<{ key: string; field: ExerciseTemplateField }> {
  return fields.flatMap((field) => {
    const key = parent ? `${parent} / ${field.label}` : field.label;
    return [{ key, field }, ...fieldRows(field.properties ?? [], key), ...fieldRows(field.element?.properties ?? [], `${key} / Item`)];
  });
}

export function ExerciseSettingsLibrary({ snapshot, disabled, onConfigure }: {
  snapshot: RegistrySnapshot; disabled: boolean; onConfigure: (exerciseType: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [skill, setSkill] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const selected = exerciseTemplateById(selectedId);
  const rules = snapshot.exerciseTemplateRules ?? [];
  const rows = useMemo(() => EXERCISE_TEMPLATES.filter((entry) => (!skill || entry.sourceSkill === skill)
    && `${entry.name} ${entry.description} ${entry.sourceSkill ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())), [search, skill]);

  return <Stack gap={4}>
    {selected ? <>
      <Button alignSelf="start" variant="outline" size="sm" onClick={() => setSelectedId("")}>Back to exercise templates</Button>
      <HStack justify="space-between" gap={3} flexWrap="wrap"><Text as="h3" fontSize="lg" fontWeight="semibold">{selected.name}</Text>
        <Button size="sm" colorPalette="teal" disabled={disabled} onClick={() => onConfigure(selected.id)}>Add item rules</Button></HStack>
      <Text>{selected.description}</Text>
      <Text fontSize="sm" color="fg.muted">Source skill: {selected.sourceSkill ?? "Not specified"} · Source levels: {selected.sourceSupportedLevels.join(", ") || "Not specified"}</Text>
      <Text fontSize="sm">The template name and fields follow Exercise Template. Add item rules to configure its Can-do, Domains, difficulty and scoring.</Text>
      <Box overflowX="auto" borderWidth="1px" borderRadius="md"><Table.Root size="sm" aria-label="Exercise template fields">
        <Table.Header><Table.Row><Table.ColumnHeader>Field</Table.ColumnHeader><Table.ColumnHeader>Type</Table.ColumnHeader><Table.ColumnHeader>Required</Table.ColumnHeader><Table.ColumnHeader>Description</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{fieldRows(selected.fields).map(({ key, field }, index) => <Table.Row key={`${key}-${index}`}>
          <Table.Cell>{key}</Table.Cell><Table.Cell>{field.type}</Table.Cell><Table.Cell>{field.required ? "Yes" : "No"}</Table.Cell><Table.Cell>{field.description || "No additional constraints."}{field.values?.length ? ` Allowed values: ${field.values.join(", ")}.` : ""}</Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root></Box>
      <Stack gap={2}><Text fontWeight="medium">Configured Can-do statements</Text>
        {rules.filter((entry) => entry.exerciseType === selected.id).map((entry) => <Text key={entry.id} fontSize="sm">{registryDisplayText(snapshot.canDoOptions.find((canDo) => canDo.id === entry.primaryCanDoId)?.label ?? "Missing Can-do")}</Text>)}
        {!rules.some((entry) => entry.exerciseType === selected.id) ? <Text fontSize="sm" color="fg.muted">No Can-do is configured for this template yet.</Text> : null}
      </Stack>
    </> : <>
      <Stack gap={1}><Text as="h3" fontSize="lg" fontWeight="semibold">Exercise templates</Text><Text fontSize="sm" color="fg.muted">All {EXERCISE_TEMPLATES.length} templates from Exercise Template. Source names stay unchanged.</Text></Stack>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <Stack gap={1}><Text fontSize="sm">Search exercise templates</Text><Input aria-label="Search exercise templates" value={search} onChange={(event) => setSearch(event.target.value)} /></Stack>
        <FilterSelect label="Source skill" value={skill} options={[...new Set(EXERCISE_TEMPLATES.map((entry) => entry.sourceSkill).filter((entry): entry is string => !!entry))].map((id) => ({ id, label: id }))} onChange={setSkill} />
      </SimpleGrid>
      <Text fontSize="sm" color="fg.muted">{rows.length} templates</Text>
      <Box overflowX="auto" borderWidth="1px" borderRadius="md"><Table.Root size="sm" aria-label="Exercise template library">
        <Table.Header><Table.Row><Table.ColumnHeader>Exercise template</Table.ColumnHeader><Table.ColumnHeader>Source skill</Table.ColumnHeader><Table.ColumnHeader>Source levels</Table.ColumnHeader><Table.ColumnHeader>Can-do rules</Table.ColumnHeader><Table.ColumnHeader>Actions</Table.ColumnHeader></Table.Row></Table.Header>
        <Table.Body>{rows.map((entry) => <Table.Row key={entry.id}>
          <Table.Cell><Button variant="plain" size="sm" colorPalette="teal" p={0} whiteSpace="normal" textAlign="left" onClick={() => setSelectedId(entry.id)}>{entry.name}</Button></Table.Cell>
          <Table.Cell>{entry.sourceSkill ?? "Not specified"}</Table.Cell><Table.Cell>{entry.sourceSupportedLevels.join(", ") || "Not specified"}</Table.Cell>
          <Table.Cell>{rules.filter((rule) => rule.exerciseType === entry.id).length}</Table.Cell>
          <Table.Cell><Button size="xs" variant="outline" disabled={disabled} onClick={() => onConfigure(entry.id)}>Add item rules</Button></Table.Cell>
        </Table.Row>)}</Table.Body>
      </Table.Root></Box>
      {!rows.length ? <Text>No exercise templates match these filters.</Text> : null}
    </>}
  </Stack>;
}
