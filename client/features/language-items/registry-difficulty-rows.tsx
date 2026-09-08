import { Box, Grid, Input, NativeSelect, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { registryDisplayText } from "./registry-display-text";
import { difficultyChoiceState, independenceFieldState, setFixedDifficultyValue, setFixedInformationPoints, type ChoiceDimension } from "./registry-difficulty";
import type { DifficultyBandStandard } from "./types";

type ChangeStandard = (mutate: (standard: DifficultyBandStandard) => void) => void;

function DifficultyRow({ label, children }: { label: string; children: ReactNode }) {
  return <Grid templateColumns={{ base: "1fr", md: "minmax(150px, 0.7fr) minmax(220px, 1.8fr)" }} gap={{ base: 2, md: 4 }} alignItems="center" borderTopWidth="1px" py={3}>
    <Text fontWeight="medium" fontSize="sm">{label}</Text>
    <Box maxW="lg">{children}</Box>
  </Grid>;
}

export function DifficultyChoiceRow({ label, dimension, standard, change, disabled }: {
  label: string; dimension: ChoiceDimension; standard: DifficultyBandStandard; change: ChangeStandard; disabled: boolean;
}) {
  const { options, allowed, value, fixed, invalid } = difficultyChoiceState(standard, dimension);
  const savedValues = allowed.map(registryDisplayText).join(" / ");
  return <DifficultyRow label={label}>
    <Stack gap={1}>
      <NativeSelect.Root size="sm" disabled={disabled} invalid={invalid}>
        <NativeSelect.Field aria-label={label} aria-invalid={invalid} value={fixed ? value : "saved"}
          onChange={(event) => change((entry) => setFixedDifficultyValue(entry, dimension, event.target.value))}>
          {!fixed ? <option value="saved" disabled>{savedValues || "No saved value"} ({invalid ? "needs updating" : "saved range"})</option> : null}
          {options.map((option) => <option key={option} value={option}>{registryDisplayText(option)}</option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      {!fixed ? <Text fontSize="xs" color={invalid ? "fg.error" : "fg.muted"}>
        Saved default: {registryDisplayText(value)}. Choose one value to replace the saved range.
      </Text> : null}
    </Stack>
  </DifficultyRow>;
}

export function InformationPointsRow({ standard, change, disabled }: { standard: DifficultyBandStandard; change: ChangeStandard; disabled: boolean }) {
  const value = standard.defaultDrivers.informationPoints;
  const invalid = !Number.isInteger(value) || !Number.isInteger(standard.informationPointsMin) || !Number.isInteger(standard.informationPointsMax) ||
    standard.informationPointsMin < 1 || standard.informationPointsMax > 255 || standard.informationPointsMin > standard.informationPointsMax ||
    value < standard.informationPointsMin || value > standard.informationPointsMax;
  const fixed = standard.informationPointsMin === value && standard.informationPointsMax === value;
  return <DifficultyRow label="Information points">
    <Stack gap={1}>
      <Input size="sm" type="number" min={1} max={255} step={1} aria-label="Information points" aria-invalid={invalid} value={value} disabled={disabled}
        onChange={(event) => change((entry) => setFixedInformationPoints(entry, Number(event.target.value)))} />
      {!fixed ? <Text fontSize="xs" color="fg.muted">Saved range: {standard.informationPointsMin}–{standard.informationPointsMax}; default: {value}. Editing sets one fixed count.</Text> : null}
      {invalid ? <Text fontSize="xs" color="fg.error">Enter a whole number from 1 to 255 to replace the saved setting.</Text> : null}
    </Stack>
  </DifficultyRow>;
}

export function IndependenceRepair({ standard, change, disabled }: { standard: DifficultyBandStandard; change: ChangeStandard; disabled: boolean }) {
  const { invalid, options } = independenceFieldState(standard.defaultDrivers.independenceLevel);
  if (!invalid) return null;
  return <DifficultyRow label="Repair saved independence">
    <Stack gap={1}>
      <NativeSelect.Root size="sm" disabled={disabled} invalid>
        <NativeSelect.Field aria-label="Repair saved independence" aria-invalid value={standard.defaultDrivers.independenceLevel} onChange={(event) => change((entry) => {
          entry.defaultDrivers.independenceLevel = event.target.value as typeof entry.defaultDrivers.independenceLevel;
        })}>
          {options.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator />
      </NativeSelect.Root>
      <Text fontSize="xs" color="fg.error">This saved value is invalid. Choose a valid level before publishing.</Text>
    </Stack>
  </DifficultyRow>;
}
