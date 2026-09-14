import { Button, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { DIFFICULTY_LEVELS, DIFFICULTY_OPTIONS, setFixedDifficultyValue, setFixedInformationPoints, setDistractorsNotApplicable } from "./registry-difficulty";
import { registryDisplayText } from "./registry-display-text";
import { SelectField } from "./registry-form-controls";
import type { DifficultyBandStandard } from "./types";

export function ExerciseSettingsDifficulty({ standards, baseline, disabled, onChange }: {
  standards: DifficultyBandStandard[]; baseline: DifficultyBandStandard[]; disabled: boolean;
  onChange: (standards: DifficultyBandStandard[]) => void;
}) {
  const [level, setLevel] = useState("LowerA1");
  const standard = standards.find((entry) => entry.id === level);
  const change = (mutate: (entry: DifficultyBandStandard) => void) => {
    if (disabled) return;
    const next = structuredClone(standards);
    const selected = next.find((entry) => entry.id === level);
    if (selected) { mutate(selected); onChange(next); }
  };
  return <Stack gap={4}>
    <Text fontSize="sm" color="fg.muted">These profiles apply to this Can-do and exercise template across its allowed Domains and Contexts.</Text>
    <HStack gap={2} role="tablist" aria-label="Difficulty bands">
      {DIFFICULTY_LEVELS.map((entry) => <Button key={entry.id} role="tab" size="sm" aria-selected={level === entry.id} variant={level === entry.id ? "subtle" : "outline"} onClick={() => setLevel(entry.id)}>{entry.label}</Button>)}
    </HStack>
    {standard ? <>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <SelectField label="Input length" value={standard.defaultDrivers.inputLength} placeholder="Select input length" disabled={disabled}
          options={DIFFICULTY_OPTIONS.inputLength.map((id) => ({ id, label: registryDisplayText(id) }))}
          onChange={(value) => change((entry) => setFixedDifficultyValue(entry, "inputLength", value))} />
        <Stack gap={1}><Text fontSize="sm">Information points</Text><Input aria-label="Information points" type="number" min={1} step={1} disabled={disabled} value={standard.defaultDrivers.informationPoints}
          onChange={(event) => { const value = Number(event.target.value); if (Number.isSafeInteger(value) && value >= 1) change((entry) => setFixedInformationPoints(entry, value)); }} /></Stack>
        <SelectField label="Contextual support" value={standard.defaultDrivers.supportLevel} placeholder="Select support" disabled={disabled}
          options={DIFFICULTY_OPTIONS.supportLevel.map((id) => ({ id, label: registryDisplayText(id) }))}
          onChange={(value) => change((entry) => setFixedDifficultyValue(entry, "supportLevel", value))} />
        <SelectField label="Distractor similarity" value={standard.defaultDrivers.distractorSimilarity} placeholder="Select similarity" disabled={disabled}
          options={DIFFICULTY_OPTIONS.distractorSimilarity.map((id) => ({ id, label: registryDisplayText(id) }))}
          onChange={(value) => change((entry) => value === "notApplicable" ? setDistractorsNotApplicable(entry) : setFixedDifficultyValue(entry, "distractorSimilarity", value))} />
      </SimpleGrid>
      <Text fontSize="sm">{registryDisplayText(standard.description)}</Text>
      {(standard.informationPointsMin !== standard.informationPointsMax || standard.allowedInputLengths.length > 1 || standard.allowedSupportLevels.length > 1 || standard.allowedDistractorSimilarities.length > 1) ?
        <Text fontSize="sm" color="fg.muted">This saved profile includes ranges. Editing a field sets one fixed value for that field; untouched ranges stay in place.</Text> : null}
    </> : <Stack gap={3}>
      <Text role="alert" color="fg.error">This difficulty profile is missing.</Text>
      <Button alignSelf="start" size="sm" disabled={disabled || !baseline.some((entry) => entry.id === level)} onClick={() => {
        const restored = baseline.find((entry) => entry.id === level);
        if (restored) onChange([...standards, structuredClone(restored)]);
      }}>Add profile from defaults</Button>
    </Stack>}
  </Stack>;
}
