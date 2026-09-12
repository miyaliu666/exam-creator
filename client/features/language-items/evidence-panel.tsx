import { Badge, Box, Button, HStack, NativeSelect, Spinner, Stack, Text, Textarea } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getItemEvidence, saveItemEvidence, type EvidenceFields, type EvidenceView, type LanguageRelation } from "./evidence-api";
import { EvidenceSources } from "./evidence-sources";
import { contentOptionLabel } from "./labels";
import type { RegistrySnapshot, TaskPackage } from "./types";

const RELATIONS: Record<LanguageRelation, string> = {
  unknown: "Not checked", understanding: "Required to understand the answer", requiredProduction: "Explicitly required in the response",
  opportunity: "Opportunity to use", supporting: "Supporting content", notDemonstrated: "Not demonstrated by this item",
};
interface Props { itemId: string; revision: number; draft: TaskPackage; registry: RegistrySnapshot; disabled: boolean; onDirtyChange: (dirty: boolean) => void }

export function ItemEvidencePanel(props: Props) {
  const query = useQuery({ queryKey: ["language-item-evidence", props.itemId, props.revision], queryFn: () => getItemEvidence(props.itemId), placeholderData: (previous) => previous });
  return <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
    <Text as="summary" cursor="pointer" fontWeight="medium">Language evidence and sources</Text>
    <Stack mt={4} gap={3}>
      <Text fontSize="sm" color="fg.muted">The author records what the item actually assesses. These observations support review and coverage; they do not approve the item.</Text>
      {query.isPending ? <Spinner size="sm" /> : query.isError ? <Text role="alert" color="fg.error">{query.error.message}</Text> :
        <EvidenceForm key={query.data.record?.id ?? "new"} {...props} disabled={props.disabled || query.isPlaceholderData} view={query.data} />}
    </Stack>
  </Box>;
}

function EvidenceForm({ view, ...props }: Props & { view: EvidenceView }) {
  const ids = [...new Set([...props.draft.content.targetContentIds, ...(props.draft.content.supportingContentRefs ?? [])])];
  const [form, setForm] = useState<EvidenceFields>(() => ({
    targets: ids.map((id) => view.record?.targets.find((entry) => entry.targetContentId === id) ?? { targetContentId: id, relation: "unknown", evidence: "" }),
    sources: view.record?.sources ?? [], qualityNotes: view.record?.qualityNotes ?? "", originalityNotes: view.record?.originalityNotes ?? "",
  }));
  const [dirty, setDirty] = useState(false);
  const cache = useQueryClient();
  const save = useMutation({ mutationFn: () => saveItemEvidence(props.itemId, { ...form, expectedRevision: props.revision }), onSuccess: (saved) => {
    setDirty(false); props.onDirtyChange(false);
    cache.setQueryData(["language-item-evidence", props.itemId, props.revision], saved);
    void cache.invalidateQueries({ queryKey: ["language-coverage"] });
  } });
  useEffect(() => { props.onDirtyChange(dirty); return () => props.onDirtyChange(false); }, [dirty, props.onDirtyChange]);
  const update = (patch: Partial<EvidenceFields>) => { setForm((previous) => ({ ...previous, ...patch })); setDirty(true); };
  const disabled = props.disabled || save.isPending;
  return <Stack gap={4}>
    <HStack flexWrap="wrap"><Badge colorPalette={view.current && !dirty ? "teal" : "orange"}>{dirty ? "Unsaved observations" : view.current ? "Recorded for this content" : view.record ? "Content changed · review again" : "Not yet recorded"}</Badge>
      {view.record ? <Text fontSize="sm" color="fg.muted">{view.record.reviewedBy} · {new Date(view.record.createdAt).toLocaleString()}</Text> : null}</HStack>
    {!view.current && view.record ? <Text fontSize="sm" color="fg.warning">Earlier observations are shown for reference. Check them against the current item before saving again.</Text> : null}
    {form.targets.map((target, index) => {
      const option = props.registry.contentIdOptions.find((entry) => entry.id === target.targetContentId);
      const label = option ? contentOptionLabel(option.id, props.registry) : "Language point unavailable in these settings";
      const change = (patch: Partial<typeof target>) => update({ targets: form.targets.map((entry, i) => i === index ? { ...entry, ...patch } : entry) });
      return <Stack key={target.targetContentId} gap={2} borderTopWidth="1px" pt={3}>
        <Text fontSize="sm" fontWeight="medium">{label}</Text>
        <NativeSelect.Root disabled={disabled}><NativeSelect.Field aria-label={`Relationship for ${label}`} value={target.relation} onChange={(event) => change({ relation: event.target.value as LanguageRelation })}>
          {Object.entries(RELATIONS).map(([id, text]) => <option key={id} value={id}>{text}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        <Textarea aria-label={`Evidence for ${label}`} placeholder="Where is it used, and why does answering depend on it? Explain alternatives for open responses." value={target.evidence} maxLength={4000} disabled={disabled} onChange={(event) => change({ evidence: event.target.value })} />
      </Stack>;
    })}
    {!form.targets.length ? <Text fontSize="sm">Select language targets in Prepare before recording their relationships.</Text> : null}
    <EvidenceSources values={form.sources} disabled={disabled} onChange={(sources) => update({ sources })} />
    <Box><Text fontSize="sm" fontWeight="medium" mb={1}>Answer and item quality</Text><Textarea aria-label="Answer and item quality notes" value={form.qualityNotes} maxLength={8000} disabled={disabled} placeholder="Answer evidence, plausible distractors, acceptable responses, scoring and unnecessary background knowledge" onChange={(event) => update({ qualityNotes: event.target.value })} /></Box>
    <Box><Text fontSize="sm" fontWeight="medium" mb={1}>Originality review</Text><Textarea aria-label="Originality review notes" value={form.originalityNotes} maxLength={8000} disabled={disabled} placeholder="How this item was created, sources checked and the scope of comparison" onChange={(event) => update({ originalityNotes: event.target.value })} /></Box>
    {save.isError ? <Text role="alert" color="fg.error">{save.error.message}</Text> : null}
    {!props.disabled ? <Button alignSelf="start" variant="outline" loading={save.isPending} disabled={disabled || (!dirty && view.current)} onClick={() => save.mutate()}>Save author observations</Button> : null}
  </Stack>;
}
