import {
  Box,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useContext } from "react";

import { RegistryTextContext } from "./registry-reference-labels";

export interface FormOption {
  id: string;
  label: string;
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  disabled,
  translate = true,
}: {
  label: string;
  value: string;
  options: FormOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  translate?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  return (
    <Field.Root disabled={disabled}>
      <Field.Label>{label}</Field.Label>
      <NativeSelect.Root disabled={disabled}>
        <NativeSelect.Field value={value} onChange={(event) => { if (!disabled) onChange(event.target.value); }}>
          {options.map((option) => (
            <option key={option.id} value={option.id}>{translate ? displayText(option.label) : option.label}</option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </Field.Root>
  );
}

export function TextField({
  label,
  value,
  onChange,
  disabled,
  multiline,
  translate = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  translate?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  const displayValue = translate ? displayText(value) : value;
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      {multiline ? (
        <Textarea value={displayValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <Input value={displayValue} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
      )}
    </Field.Root>
  );
}

export function TextListField({
  label,
  values,
  onChange,
  disabled,
  help,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
  help?: string;
}) {
  const displayText = useContext(RegistryTextContext);
  const displayValues = values.map(displayText);
  // Preserve untouched source lines when editing translated legacy rules.
  const storedLines = (text: string) => {
    const usedIndices = new Set<number>();
    return text.split("\n").map((line, index) => {
      const sourceIndex = line === displayValues[index] && !usedIndices.has(index)
        ? index
        : displayValues.findIndex((value, candidate) => value === line && !usedIndices.has(candidate));
      if (sourceIndex < 0) return line;
      usedIndices.add(sourceIndex);
      return values[sourceIndex];
    });
  };
  return (
    <Field.Root>
      <Field.Label>{label}</Field.Label>
      <Textarea
        value={displayValues.join("\n")}
        disabled={disabled}
        onChange={(event) => onChange(storedLines(event.target.value))}
        onBlur={(event) => {
          const next = storedLines(event.target.value).map((value) => value.trim()).filter(Boolean);
          if (next.length !== values.length || next.some((value, index) => value !== values[index])) {
            onChange(next);
          }
        }}
      />
      {help ? <Field.HelperText>{help}</Field.HelperText> : null}
    </Field.Root>
  );
}

export function ToggleList({
  label,
  options,
  values,
  onChange,
  disabled,
}: {
  label: string;
  options: FormOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  const toggle = (id: string) => onChange(
    values.includes(id) ? values.filter((value) => value !== id) : [...values, id],
  );
  return (
    <Stack gap={2}>
      <Text fontSize="sm" fontWeight="medium">{label}</Text>
      <HStack gap={2} flexWrap="wrap">
        {options.map((option) => (
          <Button
            key={option.id}
            size="xs"
            variant={values.includes(option.id) ? "solid" : "outline"}
            colorPalette={values.includes(option.id) ? "teal" : undefined}
            disabled={disabled}
            onClick={() => toggle(option.id)}
          >
            {displayText(option.label)}
          </Button>
        ))}
      </HStack>
    </Stack>
  );
}

export function ReadOnlyField({ label, value }: { label: string; value: string }) {
  const displayText = useContext(RegistryTextContext);
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted">{label}</Text>
      <Text fontSize="sm" fontWeight="medium" overflowWrap="anywhere">{displayText(value) || "—"}</Text>
    </Box>
  );
}

export function InvalidSelections({ label, entries, onRemove, disabled }: {
  label: string;
  entries: Array<FormOption & { reason: string }>;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  if (!entries.length) return null;
  return (
    <Stack gap={2} borderWidth="1px" borderColor="red.300" borderRadius="md" p={3}>
      <Text fontWeight="medium" fontSize="sm" color="fg.error">{label}</Text>
      {entries.map((entry) => (
        <HStack key={entry.id} gap={3} justify="space-between" align="start">
          <Box>
            <Text fontSize="sm" fontWeight="medium">{displayText(entry.label)}</Text>
            <Text fontSize="xs" color="fg.error">{entry.reason}</Text>
          </Box>
          {!disabled ? <Button size="xs" variant="outline" colorPalette="red" aria-label={`Remove ${displayText(entry.label)}`} onClick={() => onRemove(entry.id)}>Remove</Button> : null}
        </HStack>
      ))}
    </Stack>
  );
}
