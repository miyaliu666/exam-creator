import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import type { BatchGroup, CreateBatchInput } from "./batch-api";
import { useBatchDraft } from "./batch-draft";
import { coverageSuggestionSetup, setupMatchesCoverageSuggestion } from "./batch-coverage-suggestion";
import { BatchGroupCard } from "./batch-group-card";
import { CandidateCountField } from "./candidate-count-field";
import { GenerationPromptButton } from "./generation-prompt-button";
import { batchPlanIssues, batchRequest, BATCH_ITEM_LIMIT } from "./batch-plan";
import { NewLanguageItemDialog, type NewLanguageItemSelection } from "./new-language-item-dialog";
import { contentOptionLabel } from "./labels";
import { contentLanguage, contentLanguageLabel } from "./content-language";
import type { CoverageBatchSuggestion } from "./coverage-types";
import type { RegistrySnapshot } from "./types";

export function BatchCreatePanel({ registry, scope, pending, error, suggestion, showHeading = true, onSuggestionUsed, onCreate, onWriteManually, onClose }: {
  registry: RegistrySnapshot;
  scope: string;
  pending: boolean;
  error: Error | null;
  suggestion?: CoverageBatchSuggestion;
  showHeading?: boolean;
  onSuggestionUsed: () => void;
  onCreate: (input: CreateBatchInput, onSuccess: () => void) => void;
  onWriteManually?: (input: CreateBatchInput, onSuccess: () => void) => void;
  onClose: () => void;
}) {
  const { draft, update, reset } = useBatchDraft(scope, registry.bundleVersion);
  const [editing, setEditing] = useState<{ index: number; key: string; initialSelection?: Partial<BatchGroup>; suggestion?: CoverageBatchSuggestion } | null>(() => {
    const initialSelection = suggestion ? coverageSuggestionSetup(suggestion, registry) : undefined;
    return !draft.groups.length && (!suggestion || initialSelection) ? {
      index: 0, key: scope, initialSelection, suggestion,
    } : null;
  });
  const [setupError, setSetupError] = useState<Error | null>(null);
  const issues = batchPlanIssues(draft.groups, registry, draft.candidatesPerItem);
  const stale = draft.registryVersion !== registry.bundleVersion;
  const total = draft.groups.reduce((sum, group) => sum + group.itemCount, 0);
  const aiDraftCount = <CandidateCountField value={draft.candidatesPerItem} disabled={pending}
    onChange={(candidatesPerItem) => update({ candidatesPerItem })} />;
  const manualIssues = batchPlanIssues(draft.groups, registry, draft.candidatesPerItem, false);
  const canWriteManually = !!onWriteManually && total === 1 && draft.groups.length === 1 && !manualIssues.length;
  const suggestionSetup = suggestion ? coverageSuggestionSetup(suggestion, registry) : undefined;
  const editingSuggestionUnavailable = !!editing?.suggestion && !coverageSuggestionSetup(editing.suggestion, registry);
  const editGroup = (index: number, source?: CoverageBatchSuggestion) => {
    if (pending || (draft.groups.length > 0 && index >= draft.groups.length) || (source && draft.groups.length > 1)) return;
    const key = `${scope}:batch-group:${crypto.randomUUID()}`;
    const group = source ? coverageSuggestionSetup(source, registry) : draft.groups[index];
    if (source && !group) return;
    setSetupError(null);
    setEditing({ index, key, initialSelection: group, suggestion: source });
  };
  const selectSetup = (selection: NewLanguageItemSelection) => {
    if (!editing || pending || editingSuggestionUnavailable || (draft.groups.length > 0 && editing.index >= draft.groups.length)) return;
    if (editing.suggestion && !setupMatchesCoverageSuggestion(editing.suggestion, selection, registry)) {
      setSetupError(new Error("Choose a setup within the coverage suggestion's dimensions that supports all its targets. You can dismiss the suggestion to plan a different scope."));
      return;
    }
    const previous = draft.groups.at(editing.index);
    const suggested = editing.suggestion ? coverageSuggestionSetup(editing.suggestion, registry) : {};
    const next: BatchGroup = { itemCount: 1, requiredTargetContentIds: [], rotatingTargetContentIds: [], ...previous, ...suggested, ...selection };
    if (previous && !editing.suggestion && contentLanguage(previous) !== contentLanguage(selection)) {
      next.requiredTargetContentIds = [];
      next.rotatingTargetContentIds = [];
    }
    update({ groups: previous ? draft.groups.map((group, index) => index === editing.index ? next : group) : [next] });
    setEditing(null);
    if (editing.suggestion) onSuggestionUsed();
  };
  return (
    <Box borderWidth="1px" borderColor="teal.muted" borderRadius="xl" p={5} bg="bg.subtle">
      <Stack gap={5}>
        {showHeading ? <HStack justify="space-between" align="start">
          <Text fontWeight="bold" fontSize="lg">New items</Text>
          <Button size="sm" variant="ghost" disabled={pending} onClick={onClose}>Close</Button>
        </HStack> : null}
        {suggestion ? <Box borderWidth="1px" borderRadius="md" p={3}><Stack gap={2}>
          <Text fontWeight="semibold">New items planned: {suggestion.desiredCount}</Text>
          <Text fontSize="sm">Language: {contentLanguageLabel(contentLanguage(suggestion.filters))}</Text>
          <Text fontSize="sm">{suggestion.targetContentIds.map((id) => contentOptionLabel(id, registry)).join("; ")}</Text>
          {suggestion.desiredCount > BATCH_ITEM_LIMIT ? <Text fontSize="sm" color="fg.muted">Maximum {BATCH_ITEM_LIMIT} items per generation job.</Text> : null}
          <HStack><Button size="sm" variant="outline" disabled={pending || !suggestionSetup || draft.groups.length > 1}
            onClick={() => editGroup(0, suggestion)}>Use suggested setup</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={onSuggestionUsed}>Dismiss suggestion</Button></HStack>
          {draft.groups.length > 1 ? <Text fontSize="sm" color="fg.muted">To apply this suggestion, remove setups until only one remains.</Text> : null}
          {suggestion.registryVersion !== registry.bundleVersion ? <Text color="fg.warning" fontSize="sm">Settings changed. Refresh the coverage analysis before using this suggestion.</Text> : null}
          {suggestion.registryVersion === registry.bundleVersion && !suggestionSetup ? <Text color="fg.warning" fontSize="sm">No item setup currently supports all these targets within the selected coverage dimensions. Review the filters and Assessment Settings before planning this combination.</Text> : null}
        </Stack></Box> : null}
        {stale ? <Box borderWidth="1px" borderColor="border.warning" borderRadius="md" p={3}><Text color="fg.warning" fontSize="sm">Assessment Settings changed since this plan was saved. Review the setup and targets before using the current settings.</Text>
          <Button mt={2} size="sm" variant="outline" disabled={pending} onClick={() => update({ registryVersion: registry.bundleVersion })}>Review with current settings</Button></Box> : null}
        {draft.groups.length > 1 ? <Text fontSize="sm" color="fg.muted">Saved plan · {draft.groups.length} item setups</Text> : null}
        {draft.groups.length !== 1 ? aiDraftCount : null}
        {draft.groups.map((group, index) => <BatchGroupCard key={index} group={group} index={index} itemOffset={draft.groups.slice(0, index).reduce((sum, entry) => sum + entry.itemCount, 0)} grouped={draft.groups.length > 1} registry={registry} disabled={pending}
          aiDraftCount={draft.groups.length === 1 ? aiDraftCount : undefined}
          onEditSetup={() => editGroup(index)} onRemove={() => update({ groups: draft.groups.filter((_, groupIndex) => groupIndex !== index) })}
          onChange={(next) => update({ groups: draft.groups.map((entry, groupIndex) => groupIndex === index ? next : entry) })} />)}
        {!draft.groups.length ? <Button alignSelf="start" variant="outline" disabled={pending} onClick={() => editGroup(0)}>Add item setup</Button> : null}
        {draft.candidatesPerItem > 1 && total > 0 ? <Text fontSize="sm">{draft.candidatesPerItem} AI drafts per item · {total * draft.candidatesPerItem} AI drafts total</Text> : null}
        {draft.groups.length ? (canWriteManually ? manualIssues : issues).map((issue) => <Text key={issue} color="fg.error" fontSize="sm">{issue}</Text>) : null}
        {canWriteManually && issues.length ? <Text color="fg.muted" fontSize="sm">AI generation requires language targets.</Text> : null}
        {error ? <Text role="alert" color="fg.error">{error.message}</Text> : null}
        <HStack flexWrap="wrap">
          <Button colorPalette="teal" loading={pending} disabled={pending || stale || issues.length > 0}
            onClick={() => onCreate(batchRequest(draft, registry), reset)}>{total ? `Generate ${total} ${total === 1 ? "item" : "items"}` : "Generate items"}</Button>
          <GenerationPromptButton source={{ kind: "batch", plan: batchRequest(draft, registry) }} scope={scope}
            candidateCount={draft.candidatesPerItem} disabled={pending || stale || issues.length > 0} />
          {canWriteManually ? <Button variant="outline" disabled={pending || stale}
            onClick={() => onWriteManually?.(batchRequest(draft, registry), reset)}>Write manually</Button> : null}
        </HStack>
      </Stack>
      {editing ? <NewLanguageItemDialog key={editing.key} open draftScope={editing.key} registry={registry} isPending={false} initialSelection={editing.initialSelection}
        error={editingSuggestionUnavailable ? new Error("The coverage suggestion is no longer compatible with the current Assessment Settings. Close this setup and refresh the coverage analysis.") : setupError}
        title={editing.index < draft.groups.length ? "Edit item setup" : "Item setup"}
        actionLabel={editing.suggestion ? "Apply suggestion" : editing.index < draft.groups.length ? "Apply setup" : "Continue"}
        onClose={() => {
          setEditing(null);
          if (editing.suggestion) onSuggestionUsed();
          else if (!draft.groups.length) onClose();
        }} onCreate={selectSetup} /> : null}
    </Box>
  );
}
