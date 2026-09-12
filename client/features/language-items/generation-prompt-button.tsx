import { Button, Dialog, Field, HStack, Input, NativeSelect, Portal, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { getGenerationPrompt, type GenerationPromptSource } from "./generation-prompt-api";
import { validPromptOrdinal } from "./generation-prompt-model";
import { GenerationPromptViewer } from "./generation-prompt-viewer";
import { BATCH_ITEM_LIMIT } from "./batch-plan";

interface GenerationPromptButtonProps {
  source: GenerationPromptSource;
  scope: string;
  candidateCount: number;
  disabled?: boolean;
}

export function GenerationPromptButton(props: GenerationPromptButtonProps) {
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" disabled={props.disabled} onClick={() => setOpen(true)}>View AI prompt</Button>
    {open ? <GenerationPromptDialog {...props} onClose={() => setOpen(false)} /> : null}
  </>;
}

function GenerationPromptDialog({ source, scope, candidateCount, disabled = false, onClose }: GenerationPromptButtonProps & { onClose: () => void }) {
  const [itemIndex, setItemIndex] = useState(0);
  const [ordinalText, setOrdinalText] = useState("1");
  const total = source.kind === "batch" ? source.plan.groups.reduce((sum, group) => sum + group.itemCount, 0) : 1;
  const validTotal = Number.isSafeInteger(total) && total > 0 && total <= BATCH_ITEM_LIMIT;
  const unavailable = disabled || !validTotal;
  const selectedIndex = Math.min(itemIndex, Math.max(0, total - 1));
  const ordinal = validPromptOrdinal(ordinalText, candidateCount);
  const query = useQuery({
    queryKey: ["language-item-generation-prompt", scope, source, selectedIndex, ordinal],
    queryFn: ({ signal }) => getGenerationPrompt(source, selectedIndex, ordinal!, signal),
    enabled: !unavailable && ordinal !== undefined,
    retry: false, staleTime: 0, gcTime: 0,
  });
  return <Dialog.Root open onOpenChange={({ open }) => { if (!open) onClose(); }} size="xl" scrollBehavior="inside" lazyMount unmountOnExit>
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content maxW="1100px" mx={3}>
        <Dialog.Header><Dialog.Title>AI prompt preview</Dialog.Title></Dialog.Header>
        <Dialog.Body><Stack gap={4}>
          <HStack align="end" flexWrap="wrap">
            {validTotal && total > 1 ? <Field.Root maxW="200px"><Field.Label>Item</Field.Label><NativeSelect.Root>
              <NativeSelect.Field aria-label="Prompt item" value={selectedIndex} onChange={(event) => setItemIndex(Number(event.target.value))}>
                {Array.from({ length: total }, (_, index) => <option key={index} value={index}>Item {index + 1}</option>)}
              </NativeSelect.Field><NativeSelect.Indicator />
            </NativeSelect.Root></Field.Root> : null}
            {candidateCount > 1 ? <Field.Root maxW="220px"><Field.Label>AI draft (1–{candidateCount})</Field.Label>
              <Input aria-label="Prompt AI draft" inputMode="numeric" value={ordinalText} onChange={(event) => setOrdinalText(event.target.value)} />
            </Field.Root> : null}
          </HStack>
          {unavailable ? <Text role="status">Complete the requirements and wait for changes to be saved to preview the current prompt.</Text>
            : ordinal === undefined ? <Text role="alert" color="fg.error">Enter an AI draft number from 1 to {candidateCount}.</Text>
              : query.isFetching ? <Text role="status">Loading AI prompt…</Text>
                : query.isError ? <Stack><Text role="alert" color="fg.error">{query.error.message}</Text>
                  <Button variant="outline" alignSelf="start" onClick={() => { void query.refetch(); }}>Retry prompt preview</Button></Stack>
                  : query.data ? <>
                    <Text fontSize="sm">{query.data.model} · Prompt version {query.data.promptVersion}</Text>
                    {query.data.sendsToProvider ? <GenerationPromptViewer key={JSON.stringify(query.data.requestBody)} requestBody={query.data.requestBody} />
                      : <Text>Offline simulator: no prompt is sent to an AI provider.</Text>}
                  </> : null}
        </Stack></Dialog.Body>
        <Dialog.Footer><Button variant="outline" onClick={onClose}>Close</Button></Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>;
}
