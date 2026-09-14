import { Box, Button, HStack } from "@chakra-ui/react";
import { useState } from "react";

import { SelectField, TextField, type FormOption } from "./registry-form-controls";

export function RegistryEntryPicker({ label, id, name, options, disabled, multiline, editLabel, viewLabel, addLabel, onSelect, onRename, onAdd }: {
  label: string; id: string; name?: string; options: FormOption[]; disabled?: boolean; multiline?: boolean;
  editLabel: string; viewLabel?: string; addLabel: string; onSelect: (id: string) => void; onRename: (name: string) => void; onAdd: () => void;
}) {
  const [editing, setEditing] = useState(!disabled && name !== undefined && !name.trim());
  const canToggle = name !== undefined && (editing || !disabled || !!viewLabel);
  return <HStack align="end" gap={3} flexWrap="wrap">
    <Box flex="1" minW="min(100%, 16rem)">
      {editing && name !== undefined
        ? <TextField label={label} value={name} multiline={multiline} disabled={disabled} onChange={onRename} />
        : <SelectField label={label} value={id} options={options} onChange={onSelect} />}
    </Box>
    {canToggle || !disabled ? <HStack>
      {canToggle ? <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>{editing ? "Done" : disabled ? viewLabel : editLabel}</Button> : null}
      {!disabled ? <Button size="sm" variant="outline" onClick={onAdd}>{addLabel}</Button> : null}
    </HStack> : null}
  </HStack>;
}
