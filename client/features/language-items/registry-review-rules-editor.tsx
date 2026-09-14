import { Button, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

import { generateRegistryReviewRules, previewRegistryReviewPlan } from "./api";
import { REVIEW_GATE_LABELS } from "./labels";
import { ReviewCustomRuleDialog } from "./review-custom-rule-dialog";
import { applyReviewRuleProposals, isLegacyPublishedReview, newReviewCustomRule, removeReviewCustomRule, reviewRuleProposals, reviewRuleRequestKey, reviewRuleSetForCapability, writeReviewRuleSet } from "./review-rule-model";
import { ReviewRuleProposals } from "./review-rule-proposals";
import { ReviewRulesTable } from "./review-rules-table";
import type { ReviewCustomRule, ReviewPlanPreview, ReviewRuleSuggestions } from "./review-rule-types";
import type { UpdateRegistry } from "./registry-rule-editor";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface RegistryReviewRulesEditorProps {
  snapshot: RegistrySnapshot;
  capability: RegistryCapability;
  registryVersionId: string;
  expectedRevision: number;
  update: UpdateRegistry;
  disabled: boolean;
  published?: boolean;
  onStagedDirtyChange?: (dirty: boolean) => void;
  onEditSource?: (sourceRef: string) => void;
}

export function RegistryReviewRulesEditor({ snapshot, capability, registryVersionId, expectedRevision, update, disabled, published = false, onStagedDirtyChange, onEditSource }: RegistryReviewRulesEditorProps) {
  const key = reviewRuleRequestKey(snapshot, capability, registryVersionId, expectedRevision);
  const liveKey = useRef(key);
  liveKey.current = key;
  const alive = useRef(true);
  const generationRequest = useRef(0);
  const [preview, setPreview] = useState<{ key: string; value: ReviewPlanPreview }>();
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [suggestions, setSuggestions] = useState<{ key: string; value: ReviewRuleSuggestions; baseline: ReviewCustomRule[] }>();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editing, setEditing] = useState<{ key: string; rule: ReviewCustomRule }>();
  const [sourceToOpen, setSourceToOpen] = useState<string>();
  const saved = reviewRuleSetForCapability(snapshot, capability);
  const legacyPublished = isLegacyPublishedReview(snapshot, capability, published);
  const ready = preview?.key === key;
  const current = ready ? preview.value : undefined;
  const pending = generating || !!suggestions || !!editing;
  const input = () => ({ versionId: registryVersionId, expectedRevision, snapshot, itemRuleId: capability.itemRuleId, itemFormatId: capability.itemFormatId, primaryCanDoId: capability.primaryCanDoId });
  useEffect(() => {
    if (legacyPublished) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setError("");
      void previewRegistryReviewPlan(input()).then((value) => { if (!cancelled) setPreview({ key, value }); })
        .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "Review rules could not be loaded."); });
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [key, refresh, legacyPublished]);
  useEffect(() => { onStagedDirtyChange?.(pending); }, [pending, onStagedDirtyChange]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; onStagedDirtyChange?.(false); }; }, [onStagedDirtyChange]);
  const generate = async () => {
    if (disabled || !current || pending) return;
    setGenerating(true); setError("");
    const request = ++generationRequest.current;
    const baseline = structuredClone(saved?.rules ?? []);
    try {
      const value = await generateRegistryReviewRules(input());
      if (!alive.current || request !== generationRequest.current) return;
      if (value.simulated || !["openai", "deepseek"].includes(value.provider)) throw new Error("Review rule suggestions require a real AI provider.");
      setSuggestions({ key, value, baseline }); setSelectedIds([]);
    } catch (failure) { if (alive.current && request === generationRequest.current) setError(failure instanceof Error ? failure.message : "AI suggestions could not be generated."); }
    finally { if (alive.current && request === generationRequest.current) setGenerating(false); }
  };
  const applyRule = (rule: ReviewCustomRule) => {
    if (disabled || !editing || editing.key !== liveKey.current || !current) return;
    update((next) => {
      const rules = [...(reviewRuleSetForCapability(next, capability)?.rules ?? [])];
      const index = rules.findIndex((entry) => entry.id === rule.id);
      if (index < 0) rules.push(rule); else rules[index] = rule;
      writeReviewRuleSet(next, capability, rules, current, false);
    }); setEditing(undefined);
  };
  const proposals = suggestions ? reviewRuleProposals(suggestions.value, suggestions.baseline) : [];
  const applySuggestions = () => {
    if (disabled || !suggestions || suggestions.key !== liveKey.current || !selectedIds.length) return;
    try {
      const rules = applyReviewRuleProposals(saved?.rules ?? [], suggestions.baseline, proposals, selectedIds);
      update((next) => writeReviewRuleSet(next, capability, rules, suggestions.value, true));
      setSuggestions(undefined); setSelectedIds([]);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Suggestions could not be applied."); }
  };
  const openSource = (id: string) => {
    generationRequest.current++; setGenerating(false); setSuggestions(undefined); setEditing(undefined); setSelectedIds([]); setSourceToOpen(undefined); onStagedDirtyChange?.(false); onEditSource?.(id);
  };
  const editSource = (id: string) => { if (pending) setSourceToOpen(id); else openSource(id); };
  if (legacyPublished) return <Stack gap={2} borderTopWidth="1px" pt={4}><Text fontWeight="semibold">Review rules</Text><Text fontSize="sm">Published items use the earlier review checks.</Text><Text fontSize="sm">{snapshot.requiredReviewGateIds.map((id) => REVIEW_GATE_LABELS[id] ?? "Required human review").join(" · ")}</Text></Stack>;
  return <Stack gap={4} borderTopWidth="1px" pt={4}>
    <HStack justify="space-between" flexWrap="wrap"><Text fontWeight="semibold">Review rules</Text><HStack flexWrap="wrap">
      <Button size="sm" variant="outline" loading={generating} disabled={disabled || !current || pending} onClick={() => void generate()}>Generate review rules</Button>
      <Button size="sm" variant="outline" disabled={disabled || !current || pending} onClick={() => setEditing({ key, rule: newReviewCustomRule() })}>Add review rule</Button>
    </HStack></HStack>
    {error ? <HStack><Text role="alert" color="fg.error">{error}</Text><Button size="sm" variant="outline" disabled={generating} onClick={() => setRefresh((value) => value + 1)}>Reload review rules</Button></HStack> : !ready ? <HStack><Spinner size="sm" /><Text>Loading review rules…</Text></HStack> : null}
    {sourceToOpen ? <Stack role="alert" borderWidth="1px" borderRadius="md" p={3}><Text>Discard unapplied review changes?</Text><HStack><Button size="sm" colorPalette="red" onClick={() => openSource(sourceToOpen)}>Discard and open source</Button><Button size="sm" variant="outline" onClick={() => setSourceToOpen(undefined)}>Keep editing</Button></HStack></Stack> : null}
    {current ? <>
      {saved && current.stale ? <Stack gap={2}>
        <Text fontSize="sm" color="fg.warning">Source settings changed.</Text>
        {current.sourceChanges.map((change) => <Text key={change.sourceRef} fontSize="sm">{change.label}: {change.change}</Text>)}
        {!disabled ? <Button size="sm" variant="outline" alignSelf="start" disabled={pending} onClick={() => update((next) => writeReviewRuleSet(next, capability, saved.rules, current, true))}>Use updated source rules</Button> : null}
      </Stack> : null}
      <ReviewRulesTable checks={current.plan.checks} sources={current.sources} disabled={disabled || pending} onEdit={(rule) => setEditing({ key, rule })} onRemove={(id) => {
        if (disabled || pending) return;
        update((next) => removeReviewCustomRule(next, capability, id, current));
      }} onEditSource={onEditSource ? editSource : undefined} />
    </> : null}
    {suggestions ? <ReviewRuleProposals proposals={proposals} sources={suggestions.value.sources} model={suggestions.value.model} selectedIds={selectedIds} disabled={disabled} stale={suggestions.key !== key} onSelect={setSelectedIds} onApply={applySuggestions} onDiscard={() => { setSuggestions(undefined); setSelectedIds([]); }} /> : null}
    {editing ? <ReviewCustomRuleDialog key={editing.rule.id} initial={editing.rule} sources={current?.sources ?? preview?.value.sources ?? []} disabled={disabled} stale={editing.key !== key} onApply={applyRule} onClose={() => setEditing(undefined)} /> : null}
  </Stack>;
}
