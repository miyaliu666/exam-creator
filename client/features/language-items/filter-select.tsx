import { Field, HStack, IconButton, NativeSelect } from "@chakra-ui/react";
import { X } from "lucide-react";
import { useContext, useRef } from "react";

import { RegistryTextContext } from "./registry-reference-labels";

export function FilterSelect({ label, value, options, onChange, disabled, placeholder = "No filter", translate = false, size = "sm", hideLabel = false }: {
  label: string;
  value: string;
  options: Array<{ id: string; label: string }>;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  translate?: boolean;
  size?: "sm" | "md";
  hideLabel?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  const selectRef = useRef<HTMLSelectElement>(null);
  return <Field.Root disabled={disabled} minW={0}>
    {!hideLabel && <Field.Label fontSize="sm">{label}</Field.Label>}
    <HStack gap={1} w="full" minW={0}>
      <NativeSelect.Root size={size} disabled={disabled} flex={1} minW={0}>
        <NativeSelect.Field ref={selectRef} aria-label={label} value={value} onChange={(event) => {
          if (!disabled && event.target.value) onChange(event.target.value);
        }}>
          <option value="" disabled hidden>{placeholder}</option>
          {value && !options.some((option) => option.id === value) && <option value={value} disabled>Unavailable selection</option>}
          {options.filter((option) => option.id !== "").map((option) => <option key={option.id} value={option.id}>
            {translate ? displayText(option.label) : option.label}
          </option>)}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      {value && <IconButton type="button" size={size} variant="ghost" disabled={disabled}
        aria-label={`Clear ${label} filter`} title={`Clear ${label} filter`} onClick={() => {
          if (disabled) return;
          onChange("");
          selectRef.current?.focus();
        }}><X size={16} /></IconButton>}
    </HStack>
  </Field.Root>;
}
