import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import { capabilityKey } from "./registry-capability";
import { addRegistryConfiguration, configurationBindings, compatibleConfigurationPrimaries } from "./registry-configuration";
import { SelectField } from "./registry-form-controls";
import { registryCombinationName } from "./registry-reference-labels";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { RegistryCapability } from "./types";

export function RegistryNewRulesDialog({ snapshot, update, disabled, onClose, onCreated, onStagedDirtyChange }: SharedRegistryEditorProps & {
  onClose: () => void; onCreated: (capability: RegistryCapability) => void; onStagedDirtyChange?: (dirty: boolean) => void;
}) {
  const [initial] = useState(() => JSON.stringify(snapshot));
  const [templateKey, setTemplateKey] = useState("");
  const [primaryId, setPrimaryId] = useState("");
  const [discardRequested, setDiscardRequested] = useState(false);
  const changed = !!templateKey || !!primaryId;
  const stale = initial !== JSON.stringify(snapshot);
  const template = snapshot.capabilities.find((entry) => capabilityKey(entry) === templateKey);
  const options = template ? compatibleConfigurationPrimaries(snapshot, template) : [];
  const bindings = template ? configurationBindings(snapshot, template) : undefined;
  const valid = !disabled && !stale && !discardRequested && !!template && !!bindings?.scoringContract && bindings.taskFamilyMatches && options.some((entry) => entry.id === primaryId);
  useEffect(() => { onStagedDirtyChange?.(changed); }, [changed, onStagedDirtyChange]);
  useEffect(() => () => onStagedDirtyChange?.(false), [onStagedDirtyChange]);
  const close = () => { if (changed) setDiscardRequested(true); else onClose(); };
  const add = () => {
    if (!valid || !template) return;
    const preview = structuredClone(snapshot);
    const created = addRegistryConfiguration(preview, template, primaryId);
    if (!created) return;
    update((next) => { addRegistryConfiguration(next, template, primaryId, created.itemRuleId); });
    onClose(); onCreated(created);
  };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} size="lg">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Add item rules</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        {stale ? <Text role="alert" color="fg.error">Settings changed. Reopen Add item rules to use the current definitions.</Text> : null}
        {discardRequested ? <Stack role="alert" borderWidth="1px" borderRadius="md" p={3}>
          <Text>Discard the new item rule selection?</Text><HStack><Button size="sm" colorPalette="red" onClick={onClose}>Discard selection</Button><Button size="sm" variant="outline" onClick={() => setDiscardRequested(false)}>Keep editing</Button></HStack>
        </Stack> : null}
        <SelectField label="Existing item rules" value={templateKey} placeholder="Select registered rules" options={snapshot.capabilities.map((entry) => ({ id: capabilityKey(entry), label: registryCombinationName(snapshot, entry) }))} disabled={disabled || stale} onChange={(value) => { setTemplateKey(value); setPrimaryId(""); }} />
        {template ? <SelectField label="Primary Can-do" value={primaryId} placeholder="Select Primary Can-do" options={options} disabled={disabled || stale} onChange={setPrimaryId} /> : null}
        {!snapshot.capabilities.length ? <Text color="fg.warning">No existing item rules are available to copy. Add a Can-do and exercise template configuration in Item rules.</Text>
          : template && !options.length ? <Text color="fg.warning">No compatible Primary Can-do is available. Edit Can-do statements before adding these item rules.</Text> : null}
        {template && (!bindings?.scoringContract || !bindings.taskFamilyMatches) ? <Text color="fg.error">Repair the selected scoring contract and Task family bindings first.</Text> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>Cancel</Button><Button colorPalette="teal" disabled={!valid} onClick={add}>Add item rules</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
