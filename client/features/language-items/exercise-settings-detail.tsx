import { Box, Button, HStack, SimpleGrid, Stack, Text, Textarea } from "@chakra-ui/react";
import { produce } from "immer";
import { useEffect, useMemo, useState } from "react";

import { exerciseTemplateById, exerciseTemplateName } from "./exercise-template-catalog";
import { ExerciseSettingsTemplateSelect } from "./exercise-settings-template-select";
import { ExerciseTemplateEditor } from "./exercise-template-editor";
import { ExerciseSettingsDifficulty } from "./exercise-settings-difficulty";
import { applyExerciseRule, canRefreshExerciseRuleBaseline, exerciseRuleIssues, EXERCISE_SCORING_METHODS } from "./exercise-settings-model";
import { DOMAIN_LABELS, SKILL_LABELS } from "./labels";
import { registryDisplayText } from "./registry-display-text";
import { SelectField, TextField, ToggleList } from "./registry-form-controls";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { ExerciseTemplateRule } from "./types";

const TABS = [{ id: "basic", label: "Basic settings" }, { id: "difficulty", label: "Difficulty" }, { id: "scoring", label: "Scoring" }, { id: "review", label: "Review" }] as const;

export function ExerciseSettingsDetail({ snapshot, update, disabled, rule, isNew, onClose, onStagedDirtyChange, onEditCanDo }: SharedRegistryEditorProps & {
  rule: ExerciseTemplateRule; isNew: boolean; onClose: () => void; onStagedDirtyChange: (dirty: boolean) => void; onEditCanDo: (id: string) => void;
}) {
  const [initial, setInitial] = useState(() => structuredClone(snapshot));
  const [original] = useState(() => structuredClone(rule));
  const [staged, setStaged] = useState(() => structuredClone(rule));
  const [tab, setTab] = useState<string>("basic");
  const [discardRequested, setDiscardRequested] = useState(false);
  const stale = JSON.stringify(initial) !== JSON.stringify(snapshot);
  const changed = JSON.stringify(staged) !== JSON.stringify(original);
  const dirty = changed || isNew;
  const locked = disabled || stale || discardRequested;
  const issues = useMemo(() => exerciseRuleIssues(snapshot, staged), [snapshot, staged]);
  const template = exerciseTemplateById(staged.exerciseType);
  const canDo = snapshot.canDoOptions.find((entry) => entry.id === staged.primaryCanDoId);
  const change = (mutate: (entry: ExerciseTemplateRule) => void) => { if (!locked) setStaged((current) => produce(current, mutate)); };
  const close = () => { if (dirty) setDiscardRequested(true); else onClose(); };
  useEffect(() => {
    // A clean rule can follow shared-definition edits without forcing it to reopen.
    // Staged changes and changes to this exact rule keep the original conflict guard.
    if (stale && canRefreshExerciseRuleBaseline(snapshot, original, dirty)) setInitial(structuredClone(snapshot));
  }, [snapshot, original, dirty, stale]);
  useEffect(() => { onStagedDirtyChange(dirty); }, [dirty, onStagedDirtyChange]);
  useEffect(() => () => onStagedDirtyChange(false), [onStagedDirtyChange]);
  const contexts = snapshot.contextOptions.filter((entry) => staged.allowedContextIds.includes(entry.id)
    || (!entry.retired && entry.primaryDomains.length === 1 && staged.allowedDomains.includes(entry.primaryDomains[0]) && entry.canDoIds.includes(staged.primaryCanDoId)));

  return <Stack gap={4}>
    <HStack justify="space-between" flexWrap="wrap" gap={3}>
      <Button size="sm" variant="outline" onClick={close}>Back to item rules</Button>
      {changed && !isNew ? <Text fontSize="sm" color="fg.muted">Unapplied changes</Text> : null}
    </HStack>
    <Stack gap={1}>
      <Text as="h3" fontSize="xl" fontWeight="semibold">{template ? exerciseTemplateName(staged.exerciseType) : "New item rules"}</Text>
      <Text>{canDo ? registryDisplayText(canDo.label) : "Choose a Can-do and exercise template."}</Text>
    </Stack>
    {stale ? <Text role="alert" color="fg.error">Settings changed while these rules were open. Copy your changes and reopen the rules before applying.</Text> : null}
    {discardRequested ? <Stack role="alert" p={3} borderWidth="1px" borderRadius="md">
      <Text>Discard unapplied changes to these item rules?</Text>
      <HStack><Button size="sm" colorPalette="red" onClick={onClose}>Discard changes</Button><Button size="sm" variant="outline" onClick={() => setDiscardRequested(false)}>Keep editing</Button></HStack>
    </Stack> : null}
    <HStack gap={2} borderBottomWidth="1px" pb={3} flexWrap="wrap" role="tablist" aria-label="Item rule details">
      {TABS.map((entry) => <Button key={entry.id} size="sm" role="tab" aria-selected={tab === entry.id} variant={tab === entry.id ? "subtle" : "ghost"} onClick={() => setTab(entry.id)}>{entry.label}</Button>)}
    </HStack>
    <Box hidden={tab !== "basic"} role="tabpanel" aria-label="Basic settings"><Stack gap={4}>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}>
        <SelectField label="Can-do" value={staged.primaryCanDoId} placeholder="Select Can-do" options={snapshot.canDoOptions.map((entry) => ({ id: entry.id, label: registryDisplayText(entry.label) }))}
          disabled={locked} onChange={(value) => change((entry) => { entry.primaryCanDoId = value; })} />
        <ExerciseSettingsTemplateSelect value={staged.exerciseType} disabled={locked || !isNew}
          onChange={(value) => change((entry) => { entry.exerciseType = value; })} />
      </SimpleGrid>
      {canDo ? <HStack justify="space-between" gap={3} flexWrap="wrap">
        <Text fontSize="sm">{SKILL_LABELS[canDo.primarySkill ?? ""] ?? canDo.primarySkill ?? "Skill not set"} · {canDo.activity ?? "Activity not set"}</Text>
        <Button size="xs" variant="outline" onClick={() => onEditCanDo(canDo.id)} disabled={dirty}>{disabled ? "View Can-do definition" : "Edit Can-do definition"}</Button>
      </HStack> : null}
      {template ? <Text fontSize="sm" color="fg.muted">{template.description}</Text> : null}
      <ToggleList label="Allowed Domains" options={[...new Set([...snapshot.allowedDomains, ...staged.allowedDomains])].map((id) => ({ id, label: DOMAIN_LABELS[id] ?? id }))} values={staged.allowedDomains} disabled={locked}
        onChange={(values) => change((entry) => { entry.allowedDomains = values; })} />
      <TextField label="Task requirements and evidence of success" multiline translate={false} value={staged.taskRequirements} disabled={locked}
        onChange={(value) => change((entry) => { entry.taskRequirements = value; })} />
      <SelectField label="Availability" value={staged.enabled ? "enabled" : "disabled"} options={[{ id: "enabled", label: "Enabled for new items" }, { id: "disabled", label: "Disabled for new items" }]} disabled={locked}
        onChange={(value) => change((entry) => { entry.enabled = value === "enabled"; })} />
      <details><Text as="summary" cursor="pointer">Optional Context restrictions</Text><Stack mt={3} gap={3}>
        <Text fontSize="sm" color="fg.muted">With no Context selected, authors describe a scene within an allowed Domain. Select reusable Contexts only when their restrictions are needed.</Text>
        <ToggleList label="Allowed Contexts" options={contexts.map((entry) => ({ id: entry.id, label: registryDisplayText(entry.label) }))} values={staged.allowedContextIds} disabled={locked}
          onChange={(values) => change((entry) => { entry.allowedContextIds = values; })} />
        {staged.allowedContextIds.filter((id) => !snapshot.contextOptions.some((entry) => entry.id === id)).map((id) => <HStack key={id}><Text color="fg.error">Unavailable Context</Text><Button size="xs" disabled={locked} onClick={() => change((entry) => { entry.allowedContextIds = entry.allowedContextIds.filter((value) => value !== id); })}>Remove unavailable Context</Button></HStack>)}
      </Stack></details>
      {template ? <details><Text as="summary" cursor="pointer">Template field defaults</Text><Stack mt={3} gap={3}>
        <Text fontSize="sm" color="fg.muted">Set optional starting values for new items. Required candidate content can remain unset here and is completed during authoring.</Text>
        <ExerciseTemplateEditor exerciseType={staged.exerciseType} mode="defaults" value={staged.defaults} readOnly={locked}
          onChange={(values) => change((entry) => { entry.defaults = values; })} />
      </Stack></details> : null}
    </Stack></Box>
    <Box hidden={tab !== "difficulty"} role="tabpanel" aria-label="Difficulty"><ExerciseSettingsDifficulty standards={staged.difficultyStandards} baseline={snapshot.difficultyStandards} disabled={locked}
      onChange={(values) => change((entry) => { entry.difficultyStandards = values; })} /></Box>
    <Box hidden={tab !== "scoring"} role="tabpanel" aria-label="Scoring"><Stack gap={4}>
      <SelectField label="Scoring method" value={staged.scoring.method} placeholder="Select method" options={[...EXERCISE_SCORING_METHODS]} disabled={locked}
        onChange={(value) => change((entry) => { entry.scoring.method = value as ExerciseTemplateRule["scoring"]["method"]; })} />
      <TextField label="Scoring criteria" multiline translate={false} value={staged.scoring.criteria} disabled={locked} onChange={(value) => change((entry) => { entry.scoring.criteria = value; })} />
      <TextField label="Normalization and equivalent responses" multiline translate={false} value={staged.scoring.normalizationPolicy} disabled={locked} onChange={(value) => change((entry) => { entry.scoring.normalizationPolicy = value; })} />
      <Text fontSize="sm" color="fg.muted">Define points, partial credit and success standards here. Candidate answer keys are authored for each item.</Text>
    </Stack></Box>
    <Box hidden={tab !== "review"} role="tabpanel" aria-label="Review"><Stack gap={4}>
      <Text fontWeight="medium">Fixed checks</Text>
      <Stack borderWidth="1px" borderRadius="md" p={3} gap={2}>
        <Text fontSize="sm">The exercise uses the selected template structure.</Text>
        <Text fontSize="sm">The task meets the Can-do, allowed Domain, Context restrictions and difficulty profile.</Text>
        <Text fontSize="sm">The response provides evidence for the scoring criteria.</Text>
      </Stack>
      <HStack justify="space-between"><Text fontWeight="medium">Supplementary review criteria</Text><Button size="sm" variant="outline" disabled={locked} onClick={() => change((entry) => { entry.reviewCriteria.push(""); })}>Add criterion</Button></HStack>
      {staged.reviewCriteria.map((criterion, index) => <HStack key={index} align="start">
        <Textarea aria-label={`Review criterion ${index + 1}`} value={criterion} disabled={locked} onChange={(event) => change((entry) => { entry.reviewCriteria[index] = event.target.value; })} />
        <Button size="sm" variant="outline" disabled={locked} aria-label={`Remove review criterion ${index + 1}`} onClick={() => change((entry) => { entry.reviewCriteria.splice(index, 1); })}>Remove</Button>
      </HStack>)}
      {!staged.reviewCriteria.length ? <Text fontSize="sm" color="fg.muted">No supplementary criteria.</Text> : null}
    </Stack></Box>
    {issues.length ? <Stack gap={1} borderWidth="1px" borderRadius="md" p={3} role="status"><Text fontSize="sm" fontWeight="medium">Complete these settings</Text>{issues.map((issue) => <Text key={issue} fontSize="sm" color="fg.error">{issue}</Text>)}</Stack> : null}
    <HStack justify="end" position="sticky" bottom={0} bg="bg" borderTopWidth="1px" py={3} zIndex={1}>
      <Button variant="outline" onClick={close}>{disabled ? "Close" : "Cancel"}</Button>
      {!disabled ? <Button colorPalette="teal" disabled={locked || !dirty || issues.length > 0} onClick={() => {
        if (locked || issues.length) return;
        update((next) => { applyExerciseRule(next, initial, staged); });
        onClose();
      }}>Apply to draft</Button> : null}
    </HStack>
  </Stack>;
}
