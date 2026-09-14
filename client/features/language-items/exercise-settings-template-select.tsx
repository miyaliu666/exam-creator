import { Button, Field, HStack, NativeSelect } from "@chakra-ui/react";
import { EXERCISE_TEMPLATES } from "./exercise-template-catalog";

/** Source names remain exact; source skill groups distinguish names used by several templates. */
export function ExerciseSettingsTemplateSelect({ value, onChange, disabled, filter = false }: {
  value: string; onChange: (value: string) => void; disabled?: boolean; filter?: boolean;
}) {
  const groups = [...new Set(EXERCISE_TEMPLATES.map((entry) => entry.sourceSkill ?? "Other"))];
  return <Field.Root disabled={disabled}><Field.Label>Exercise template</Field.Label><HStack width="full">
    <NativeSelect.Root disabled={disabled} flex={1}><NativeSelect.Field aria-label="Exercise template" value={value} onChange={(event) => { if (!disabled && event.target.value) onChange(event.target.value); }}>
      <option value="" hidden disabled>{filter ? "No filter" : "Select exercise template"}</option>
      {value && !EXERCISE_TEMPLATES.some((entry) => entry.id === value) ? <option value={value} disabled>Unavailable template</option> : null}
      {groups.map((group) => <optgroup key={group} label={group}>{EXERCISE_TEMPLATES.filter((entry) => (entry.sourceSkill ?? "Other") === group).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</optgroup>)}
    </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    {filter && value ? <Button size="sm" variant="ghost" aria-label="Clear Exercise template filter" disabled={disabled} onClick={() => onChange("")}>Clear</Button> : null}
  </HStack></Field.Root>;
}
