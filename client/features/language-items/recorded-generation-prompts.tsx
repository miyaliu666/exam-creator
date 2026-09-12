import { Button, Dialog, NativeSelect, Portal, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { GenerationPromptViewer } from "./generation-prompt-viewer";
import type { AiGenerationRun } from "./types";

export function RecordedGenerationPrompts({ run }: { run: AiGenerationRun }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const calls = run.providerCalls ?? [];
  const call = calls[selected];
  return <>
    <Button alignSelf="start" size="sm" variant="outline" onClick={() => setOpen(true)}>Prompt sent to AI</Button>
    <Dialog.Root open={open} onOpenChange={({ open: next }) => setOpen(next)} size="xl" scrollBehavior="inside" lazyMount unmountOnExit>
      <Portal><Dialog.Backdrop /><Dialog.Positioner><Dialog.Content maxW="1100px" mx={3}>
        <Dialog.Header><Dialog.Title>Recorded AI prompt</Dialog.Title></Dialog.Header>
        <Dialog.Body><Stack gap={4}>
          <Text fontSize="sm">{run.model} · Prompt version {run.promptVersion}</Text>
          {run.provider === "deterministic-mock" ? <Text>Offline simulator: no prompt was sent to an AI provider.</Text> : <>
            <Text fontSize="sm" color="fg.muted">Request content recorded for this run, including any repair attempts. A recorded request does not confirm the provider received it.</Text>
            {calls.length > 0 ? <NativeSelect.Root><NativeSelect.Field aria-label="Recorded AI request" value={selected} onChange={(event) => setSelected(Number(event.target.value))}>
              {calls.map((entry, index) => <option key={index} value={index}>Request {index + 1} · AI draft {entry.candidateOrdinal} · {entry.phase === "repair" ? "Repair" : "Initial generation"}</option>)}
            </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root> : null}
            {call?.requestBody ? <GenerationPromptViewer key={`${run.id}-${selected}`} requestBody={call.requestBody} />
              : <Text>{call?.requestBodyUnavailableReason ?? (run.status === "queued" || run.status === "running" ? "Recorded prompts will be available when this run finishes." : "The prompt was not recorded for this request. Historical prompts cannot be reconstructed from current settings.")}</Text>}
          </>}
        </Stack></Dialog.Body>
        <Dialog.Footer><Button variant="outline" onClick={() => setOpen(false)}>Close</Button></Dialog.Footer>
      </Dialog.Content></Dialog.Positioner></Portal>
    </Dialog.Root>
  </>;
}
