import { Button, Dialog, Field, HStack, Stack, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";

import { prepareReviewCustomRule, reviewCustomRuleIssues } from "./review-rule-model";
import { InvalidSelections, TextField } from "./registry-form-controls";
import { RegistryMultiSelect } from "./registry-multi-select";
import type { ReviewCustomRule, ReviewRuleSource } from "./review-rule-types";

export function ReviewCustomRuleDialog({ initial, sources, disabled, stale, onApply, onClose }: {
  initial: ReviewCustomRule;
  sources: ReviewRuleSource[];
  disabled: boolean;
  stale: boolean;
  onApply: (rule: ReviewCustomRule) => void;
  onClose: () => void;
}) {
  const [rule, setRule] = useState(() => structuredClone(initial));
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const next = prepareReviewCustomRule(rule);
  const issues = reviewCustomRuleIssues(next, sources);
  const changed = JSON.stringify(rule) !== JSON.stringify(initial);
  const locked = disabled || stale;
  const close = () => { if (changed) setConfirmDiscard(true); else onClose(); };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} size="lg" scrollBehavior="inside">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Supplementary review rule</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        {confirmDiscard ? <Stack role="alert" borderWidth="1px" borderRadius="md" p={3}><Text>Discard unapplied rule changes?</Text><HStack><Button size="sm" colorPalette="red" onClick={onClose}>Discard changes</Button><Button size="sm" variant="outline" onClick={() => setConfirmDiscard(false)}>Keep editing</Button></HStack></Stack> : null}
        {stale ? <Text role="alert" color="fg.error">Settings changed while this rule was open. Copy your edits and reopen the rule.</Text> : null}
        <TextField label="Name" value={rule.title} translate={false} disabled={locked} onChange={(title) => setRule({ ...rule, title })} />
        <TextField label="Pass criteria" value={rule.criterion} translate={false} multiline disabled={locked} onChange={(criterion) => setRule({ ...rule, criterion })} />
        <Field.Root><Field.Label>Required evidence</Field.Label><Textarea value={rule.requiredEvidence.join("\n")} disabled={locked} placeholder="One per line" onChange={(event) => setRule({ ...rule, requiredEvidence: event.target.value.split("\n") })} /></Field.Root>
        <RegistryMultiSelect label="Sources" emptyLabel="Select source settings" options={sources.map((source) => ({ id: source.id, label: source.label }))} values={rule.sourceRefs} disabled={locked} onChange={(sourceRefs) => setRule({ ...rule, sourceRefs })} />
        <InvalidSelections label="Unavailable sources" entries={rule.sourceRefs.filter((id) => !sources.some((source) => source.id === id)).map((id) => ({ id, label: "Unavailable source", reason: "This source is no longer in the selected Item rules." }))} disabled={locked} onRemove={(id) => setRule({ ...rule, sourceRefs: rule.sourceRefs.filter((value) => value !== id) })} />
        <label><input type="checkbox" checked={rule.required} disabled={locked} onChange={(event) => setRule({ ...rule, required: event.target.checked })} /> Required for submission</label>
        {issues.map((issue) => <Text key={issue} role="status" fontSize="sm" color="fg.warning">{issue}</Text>)}
      </Stack></Dialog.Body>
      <Dialog.Footer><Button variant="outline" onClick={close}>Cancel</Button><Button colorPalette="teal" disabled={locked || !!issues.length} onClick={() => { if (!locked && !issues.length) onApply(next); }}>Apply rule</Button></Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
