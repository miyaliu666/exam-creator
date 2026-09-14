import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useState } from "react";
import { produce } from "immer";

import { RegistryCanDoEditor } from "./registry-cando-editor";
import { RegistryContextEditor } from "./registry-context-editor";
import { RegistryScoringEditor } from "./registry-scoring-editor";
import { applySharedRegistryEdit, sharedRegistryImpact, type SharedRegistryEditorProps, type SharedRegistrySection } from "./registry-shared-edit-model";

export interface SharedRegistrySelection { section: SharedRegistrySection; selectedId?: string }
const TITLES = { contexts: "Contexts", canDo: "Can-do statement", scoring: "Scoring contracts" };

export function RegistrySharedEditDialog({ snapshot, update, disabled, section, selectedId, onClose, onStagedDirtyChange }: SharedRegistryEditorProps & SharedRegistrySelection & {
  onClose: () => void; onStagedDirtyChange?: (dirty: boolean) => void;
}) {
  const [initial] = useState(() => structuredClone(snapshot));
  const [staged, setStaged] = useState(() => structuredClone(snapshot));
  const [discardRequested, setDiscardRequested] = useState(false);
  const changed = JSON.stringify(staged) !== JSON.stringify(initial);
  const stale = JSON.stringify(snapshot) !== JSON.stringify(initial);
  const impacts = sharedRegistryImpact(initial, staged, section);
  const locked = disabled || stale;
  useEffect(() => { onStagedDirtyChange?.(changed); }, [changed, onStagedDirtyChange]);
  useEffect(() => () => onStagedDirtyChange?.(false), [onStagedDirtyChange]);
  const close = () => { if (changed) setDiscardRequested(true); else onClose(); };
  const apply = () => {
    if (locked || discardRequested) return;
    update((next) => { applySharedRegistryEdit(next, initial, staged, section); });
    onClose();
  };
  const editor = { snapshot: staged, disabled: locked || discardRequested, selectedId, update: (mutate: Parameters<SharedRegistryEditorProps["update"]>[0]) => setStaged((current) => produce(current, mutate)) };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside" size="xl">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>{TITLES[section]}</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        {stale ? <Text role="alert" color="fg.error">Settings changed while this editor was open. Copy your changes and reopen it.</Text> : null}
        {discardRequested ? <Stack role="alert" borderWidth="1px" borderRadius="md" p={3}>
          <Text>Discard unapplied changes?</Text>
          <HStack><Button size="sm" colorPalette="red" onClick={onClose}>Discard changes</Button><Button size="sm" variant="outline" onClick={() => setDiscardRequested(false)}>Keep editing</Button></HStack>
        </Stack> : null}
        {section === "contexts" ? <RegistryContextEditor {...editor} /> : section === "canDo" ? <RegistryCanDoEditor {...editor} /> : <RegistryScoringEditor {...editor} />}
        {impacts.length ? <Stack gap={1}><Text fontWeight="medium">Item rules needing repair</Text>{[...new Set(impacts)].map((impact) => <Text key={impact} fontSize="sm" color="fg.warning">{impact}</Text>)}</Stack> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>{disabled ? "Close" : "Cancel"}</Button>
        {!disabled ? <Button colorPalette="teal" disabled={locked || !changed || discardRequested} onClick={apply}>Apply to draft</Button> : null}
      </Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
