import { Button, Dialog, Field, SimpleGrid, Stack, Text, Textarea } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import {
  CONTENT_ASSESSMENT_LIST_FIELDS, contentAssessmentModeOptions, contentAssessmentRuleBaseline,
  contentAssessmentRuleIssues, contentAssessmentRuleKey, contentAssessmentRuleScopeConflicts,
  createContentAssessmentRule, getContentAssessmentRule, prepareContentAssessmentRule,
} from "./content-assessment-rules";
import { ITEM_FORMAT_LABELS, WORKBENCH_LABELS, optionLabel, slotLabel } from "./labels";
import { languageTargetDisplayText } from "./language-target-labels";
import { ReadOnlyField, SelectField, TextField } from "./registry-form-controls";
import type { ContentAssessmentRule, ContentIdOption, RegistryCapability, RegistrySnapshot } from "./types";

export interface ContentAssessmentRuleDialogProps {
  entry: ContentIdOption;
  capability: RegistryCapability;
  contextId: string;
  snapshot: RegistrySnapshot;
  disabled: boolean;
  onApply: (rule: ContentAssessmentRule | null) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export function ContentAssessmentRuleDialog({ entry, capability, contextId, snapshot, disabled, onApply, onClose, onDirtyChange }: ContentAssessmentRuleDialogProps) {
  const [initial] = useState(() => ({
    entry: structuredClone(entry), capability: structuredClone(capability), contextId,
    rule: createContentAssessmentRule(entry, capability, contextId),
    hasSavedRule: !!getContentAssessmentRule(entry, capability, contextId),
    baseline: contentAssessmentRuleBaseline(entry, capability, contextId, { ...snapshot, contentIdOptions: [entry], capabilities: [capability] }),
  }));
  const [rule, setRule] = useState(() => structuredClone(initial.rule));
  const [confirmation, setConfirmation] = useState<"discard" | "remove" | null>(null);
  const changed = JSON.stringify(rule) !== JSON.stringify(initial.rule);
  const stale = entry.id !== initial.entry.id
    || contentAssessmentRuleKey({ ...capability, contextId }) !== contentAssessmentRuleKey(initial.rule)
    || !snapshot.contextOptions.some((context) => context.id === initial.contextId)
    || contentAssessmentRuleBaseline(initial.entry, initial.capability, initial.contextId, snapshot) !== initial.baseline;
  const locked = disabled || stale;
  const scopeConflicts = contentAssessmentRuleScopeConflicts(initial.entry, initial.capability, initial.contextId);
  const issues = contentAssessmentRuleIssues(rule, initial.capability);
  const modes = contentAssessmentModeOptions(initial.capability);
  const invalidMode = !!rule.assessmentMode && !modes.some((option) => option.id === rule.assessmentMode);
  useEffect(() => { onDirtyChange?.(changed); }, [changed, onDirtyChange]);
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);
  const close = () => {
    if (changed) setConfirmation("discard");
    else onClose();
  };
  const apply = () => {
    if (locked) return;
    onApply(prepareContentAssessmentRule(rule, initial.rule));
  };
  const remove = () => {
    if (locked || !initial.hasSavedRule) return;
    setConfirmation("remove");
  };
  return <Dialog.Root open closeOnInteractOutside={false} onOpenChange={({ open }) => !open && close()} scrollBehavior="inside" size="lg">
    <Dialog.Backdrop /><Dialog.Positioner><Dialog.Content>
      <Dialog.Header><Dialog.Title>Language assessment rule</Dialog.Title></Dialog.Header>
      <Dialog.Body><Stack gap={4}>
        <Text fontWeight="medium">{languageTargetDisplayText(initial.entry)}</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
          <ReadOnlyField label={WORKBENCH_LABELS.blueprintSlot} value={slotLabel(initial.capability.blueprintSlotId, snapshot, initial.capability.itemFormatId)} />
          <ReadOnlyField label={WORKBENCH_LABELS.itemFormat} value={ITEM_FORMAT_LABELS[initial.capability.itemFormatId] ?? initial.capability.itemFormatId} />
          <ReadOnlyField label={WORKBENCH_LABELS.primaryCanDo} value={optionLabel(initial.capability.primaryCanDoId, snapshot.canDoOptions)} />
          <ReadOnlyField label={WORKBENCH_LABELS.context} value={optionLabel(initial.contextId, snapshot.contextOptions)} />
        </SimpleGrid>
        {stale ? <Text role="alert" color="fg.error">This entry, Item rules or Context changed or was removed. Copy any unsaved edits, then reopen the rule.</Text> : null}
        <SelectField label="Applicability" value={rule.applicability} options={[{ id: "allowed", label: "Allowed within entry scope" }, { id: "excluded", label: "Excluded for this combination" }]} disabled={locked} onChange={(value) => setRule({ ...rule, applicability: value as ContentAssessmentRule["applicability"] })} />
        {scopeConflicts.length ? <Stack role="status" gap={1}>
          {scopeConflicts.map((issue) => <Text key={issue} fontSize="sm" color="fg.warning">{issue}</Text>)}
          <Text fontSize="sm">Allowed cannot widen the entry scope. Close this dialog and use Edit entry to review its scope.</Text>
        </Stack> : null}
        <SelectField label="Assessment mode" value={rule.assessmentMode ?? ""} options={[
          { id: "", label: "Not specified" }, ...modes,
          ...(invalidMode ? [{ id: rule.assessmentMode!, label: `${rule.assessmentMode} (incompatible with this skill)` }] : []),
        ]} disabled={locked} onChange={(value) => setRule({ ...rule, assessmentMode: value ? value as ContentAssessmentRule["assessmentMode"] : null })} />
        <TextField label="Communicative purpose" value={rule.communicativePurpose} multiline translate={false} disabled={locked} onChange={(communicativePurpose) => setRule({ ...rule, communicativePurpose })} />
        {CONTENT_ASSESSMENT_LIST_FIELDS.map(({ key, label }) => <Field.Root key={key}>
          <Field.Label>{label}</Field.Label>
          <Textarea value={rule[key].join("\n")} disabled={locked} placeholder={disabled ? "Not provided" : "One per line"} onChange={(event) => setRule({ ...rule, [key]: event.target.value.split("\n") })} />
        </Field.Root>)}
        {issues.length ? <Stack role="status" gap={1}>
          <Text fontWeight="medium" fontSize="sm">Incomplete rule{disabled ? "" : " — you can apply it to the draft"}</Text>
          {issues.map((issue) => <Text key={issue} fontSize="sm" color="fg.warning">{issue}</Text>)}
        </Stack> : null}
        {disabled && changed ? <Text role="alert" color="fg.warning">Read-only. Unsaved changes are retained.</Text> : null}
      </Stack></Dialog.Body>
      <Dialog.Footer flexWrap="wrap">
        {confirmation ? <>
          <Text role="alert" fontSize="sm" flexBasis="100%">{confirmation === "remove" ? "Remove this rule and discard any edits? The entry's Can-do, Context and Mastery scope will apply." : "Discard the unapplied changes to this rule?"}</Text>
          <Button variant="outline" onClick={() => setConfirmation(null)}>Keep editing</Button>
          <Button colorPalette="red" disabled={confirmation === "remove" && locked} onClick={() => confirmation === "remove" ? onApply(null) : onClose()}>{confirmation === "remove" ? "Remove rule" : "Discard changes"}</Button>
        </> : <>
          {!disabled && initial.hasSavedRule ? <Button variant="plain" colorPalette="red" disabled={stale} onClick={remove}>Remove rule; use entry scope</Button> : null}
          <Button variant="outline" onClick={close}>{disabled ? "Close" : "Cancel"}</Button>
          {!disabled ? <Button colorPalette="teal" disabled={stale || (initial.hasSavedRule && !changed)} onClick={apply}>Apply to draft</Button> : null}
        </>}
      </Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
