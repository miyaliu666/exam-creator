import { Button, HStack, Stack, Tabs, Text } from "@chakra-ui/react";

import { difficultyStandardsForCapability } from "./registry-capability";
import {
  changeDifficultyStandard, DIFFICULTY_LEVELS, hasApplicableDistractors, restoreMissingDifficultyLevels,
  selectedDifficultyStandard, setDistractorsNotApplicable, usesDistractors,
} from "./registry-difficulty";
import { DifficultyChoiceRow, IndependenceRepair, InformationPointsRow } from "./registry-difficulty-rows";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "./types";

interface RegistryDifficultyEditorProps {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  update: (mutate: (next: RegistrySnapshot) => void) => void;
  disabled: boolean;
  selectedLevel: string;
  onSelectLevel: (level: string) => void;
}

export function RegistryDifficultyEditor({ snapshot, capability, update, disabled, selectedLevel, onSelectLevel }: RegistryDifficultyEditorProps) {
  const standards = difficultyStandardsForCapability(snapshot, capability);
  const standard = selectedDifficultyStandard(snapshot, capability, selectedLevel);
  const missingLevels = DIFFICULTY_LEVELS.filter(({ id }) => !standards.some((entry) => entry.id === id));
  const canRestore = missingLevels.some(({ id }) => snapshot.difficultyStandards.some((entry) => entry.id === id));
  const invalidDistractors = !usesDistractors(capability.itemFormatId) && standards.some(hasApplicableDistractors);
  const change = (mutate: (entry: DifficultyBandStandard) => void) => update((next) => changeDifficultyStandard(next, capability, selectedLevel, mutate));
  return <Stack gap={3}>
    {missingLevels.length ? <HStack gap={3} flexWrap="wrap">
      <Text fontSize="sm" color="fg.error">Missing settings: {missingLevels.map(({ label }) => label).join(", ")}.</Text>
      <Button size="sm" variant="outline" disabled={disabled || !canRestore} onClick={() => update((next) => restoreMissingDifficultyLevels(next, capability))}>
        {standards.length ? "Restore missing levels" : "Create difficulty settings"}
      </Button>
    </HStack> : null}
    {invalidDistractors ? <HStack gap={3} flexWrap="wrap">
      <Text fontSize="sm" color="fg.error">This item format has no distractors, but its saved difficulty settings include them.</Text>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => update((next) => {
        for (const entry of standards) changeDifficultyStandard(next, capability, entry.id, setDistractorsNotApplicable);
      })}>Set distractors to not applicable</Button>
    </HStack> : null}
    <Tabs.Root value={selectedLevel} onValueChange={({ value }) => onSelectLevel(value)} size="sm" variant="line">
      <Tabs.List aria-label="A1 difficulty level">
        {DIFFICULTY_LEVELS.map(({ id, label }) => <Tabs.Trigger key={id} value={id}>{label}</Tabs.Trigger>)}
      </Tabs.List>
      {DIFFICULTY_LEVELS.map(({ id }) => <Tabs.Content key={id} value={id} pt={3}>
        {standard && id === selectedLevel ? <>
          <DifficultyChoiceRow label="Input length" dimension="inputLength" standard={standard} change={change} disabled={disabled} />
          <InformationPointsRow standard={standard} change={change} disabled={disabled} />
          <DifficultyChoiceRow label="Contextual support" dimension="supportLevel" standard={standard} change={change} disabled={disabled} />
          {usesDistractors(capability.itemFormatId) ? <DifficultyChoiceRow label="Distractor similarity" dimension="distractorSimilarity" standard={standard} change={change} disabled={disabled} /> : null}
          <IndependenceRepair standard={standard} change={change} disabled={disabled} />
          {standard.defaultDrivers.inferenceRequired ? <HStack gap={3} flexWrap="wrap" pb={3}>
            <Text fontSize="sm" color="fg.error">Complex inference is not allowed at A1.</Text>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => change((entry) => { entry.defaultDrivers.inferenceRequired = false; })}>Remove inference requirement</Button>
          </HStack> : null}
        </> : null}
      </Tabs.Content>)}
    </Tabs.Root>
  </Stack>;
}
