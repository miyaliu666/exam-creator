import { Combobox, createListCollection, Field, Portal } from "@chakra-ui/react";
import { useState } from "react";

import { isValidCandidateCount, parseCandidateCount } from "./candidate-count";

const suggestions = createListCollection({ items: ["1", "2", "3", "5", "10", "20"] });

export function CandidateCountField({ value, disabled, onChange }: {
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const [input, setInput] = useState({ value, text: String(value) });
  // Preserve unfinished input while accepting externally restored or reset plans.
  if (input.value !== value) setInput({ value, text: String(value) });
  const changeInput = (text: string) => {
    const next = parseCandidateCount(text);
    setInput({ value: next, text });
    onChange(next);
  };
  const invalid = !isValidCandidateCount(value);
  return (
    <Field.Root w="210px" invalid={invalid} disabled={disabled}>
      <Field.Label>AI drafts per item</Field.Label>
      <Combobox.Root collection={suggestions} allowCustomValue selectionBehavior="preserve" disabled={disabled} invalid={invalid}
        value={isValidCandidateCount(value) ? [String(value)] : []} inputValue={input.text}
        openOnChange={false} onInputValueChange={({ inputValue }) => changeInput(inputValue)}
        onValueChange={({ value: selected }) => { if (selected[0]) changeInput(selected[0]); }}>
        <Combobox.Control>
          <Combobox.Input aria-label="AI drafts per item" inputMode="numeric" placeholder="Select or enter a count" />
          <Combobox.IndicatorGroup><Combobox.Trigger aria-label="Choose AI draft count" /></Combobox.IndicatorGroup>
        </Combobox.Control>
        <Portal><Combobox.Positioner><Combobox.Content>
          {suggestions.items.map((count) => <Combobox.Item key={count} item={count}>
            <Combobox.ItemText>{count}</Combobox.ItemText><Combobox.ItemIndicator />
          </Combobox.Item>)}
        </Combobox.Content></Combobox.Positioner></Portal>
      </Combobox.Root>
      <Field.HelperText>Generate alternatives for each item, then choose one to edit.</Field.HelperText>
      <Field.ErrorText>Enter a positive whole number.</Field.ErrorText>
    </Field.Root>
  );
}
