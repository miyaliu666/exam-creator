import {
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import type {
  FormEntryCandidatePayload,
  MatchingCandidatePayload,
  RestrictedInputCandidatePayload,
  SpokenMultiturnCandidatePayload,
  SpokenSingleCandidatePayload,
  TypedMessageCandidatePayload,
} from "./types";

function PreviewFrame({ children }: { children: React.ReactNode }) {
  return (
    <Box borderWidth="1px" borderRadius="lg" p={5} bg="bg.subtle">
      <Text fontSize="xs" color="fg.muted" mb={3}>Candidate preview</Text>
      <Stack gap={4}>{children}</Stack>
    </Box>
  );
}

export function MatchingPreview({ payload }: { payload: MatchingCandidatePayload }) {
  return (
    <PreviewFrame>
      {payload.stimulus.audioRef ? <audio controls src={payload.stimulus.audioRef} style={{ width: "100%" }} /> : null}
      {payload.stimulus.text ? <Text fontSize="lg">{payload.stimulus.text}</Text> : null}
      <Heading size="md">{payload.prompt || "(Prompt not entered)"}</Heading>
      {payload.leftItems.map((left) => (
        <HStack key={left.itemId} justify="space-between">
          <Text>{left.text || "(Empty item)"}</Text>
          <NativeSelect.Root maxW="220px"><NativeSelect.Field defaultValue=""><option value="">Select</option>{payload.rightItems.map((right) => <option key={right.itemId}>{right.text || "(Empty item)"}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        </HStack>
      ))}
    </PreviewFrame>
  );
}

export function RestrictedInputPreview({ payload }: { payload: RestrictedInputCandidatePayload }) {
  return (
    <PreviewFrame>
      {payload.stimulus.audioRef ? <audio controls src={payload.stimulus.audioRef} style={{ width: "100%" }} /> : null}
      {payload.stimulus.text ? <Text fontSize="lg">{payload.stimulus.text}</Text> : null}
      <Heading size="md">{payload.prompt || "(Prompt not entered)"}</Heading>
      {payload.responseFields.map((field) => <Field.Root key={field.responseId}><Field.Label>{field.label || "Answer"}</Field.Label><Input maxLength={field.maxLength ?? undefined} placeholder={field.placeholder ?? undefined} /></Field.Root>)}
    </PreviewFrame>
  );
}

export function FormEntryPreview({ payload }: { payload: FormEntryCandidatePayload }) {
  return (
    <PreviewFrame>
      <Heading size="md">{payload.situation || "(Situation not entered)"}</Heading>
      <Text>{payload.instructions}</Text>
      {payload.fields.map((field) => <Field.Root key={field.fieldId} required={field.required}><Field.Label>{field.label || "(Untitled field)"}</Field.Label><Input maxLength={field.maxLength ?? undefined} placeholder={field.placeholder ?? undefined} /></Field.Root>)}
    </PreviewFrame>
  );
}

export function TypedMessagePreview({ payload }: { payload: TypedMessageCandidatePayload }) {
  return (
    <PreviewFrame>
      <Heading size="md">{payload.situation || "(Situation not entered)"}</Heading>
      {payload.sourceMessage ? <Box borderWidth="1px" borderRadius="md" p={3}>{payload.sourceMessage}</Box> : null}
      <Text>{payload.instructions}</Text>
      <Text>To: {payload.recipient || "—"} · Purpose: {payload.purpose || "—"}</Text>
      <Stack as="ul" pl={5}>{payload.requiredContentPoints.map((point) => <Text as="li" key={point.contentPointId}>{point.description || "(Empty content point)"}</Text>)}</Stack>
      <Textarea placeholder={`Write ${payload.lengthGuidance.minimum}–${payload.lengthGuidance.maximum} characters`} />
    </PreviewFrame>
  );
}

export function SpokenSinglePreview({ payload }: { payload: SpokenSingleCandidatePayload }) {
  return (
    <PreviewFrame>
      <Heading size="md">{payload.situation || "(Situation not entered)"}</Heading>
      <Text>{payload.instructions}</Text>
      <Box borderWidth="1px" borderRadius="md" p={4}>{payload.visiblePromptText || payload.promptAudioRef || "(Prompt not entered)"}</Box>
      <Text color="fg.muted">Preparation: {payload.preparationTimeSeconds}s · Response: {payload.responseTimeSeconds}s</Text>
      <Button colorPalette="red" alignSelf="start">Start recording</Button>
    </PreviewFrame>
  );
}

export function SpokenMultiturnPreview({ payload }: { payload: SpokenMultiturnCandidatePayload }) {
  const path = payload.paths.find((entry) => entry.pathId === payload.startPathId) ?? payload.paths[0];
  return (
    <PreviewFrame>
      <Heading size="md">{payload.situation || "(Situation not entered)"}</Heading>
      <Text>{payload.instructions}</Text>
      {path?.turns.map((turn) => (
        <Box key={turn.turnId} borderWidth="1px" borderRadius="md" p={3} alignSelf={turn.speaker === "system" ? "start" : "end"} maxW="80%">
          <Text fontSize="xs" color="fg.muted">{turn.speaker === "system" ? payload.roles.systemRole : payload.roles.candidateRole}</Text>
          <Text>{turn.speaker === "system" ? turn.promptAudioRef || "(Empty prompt)" : turn.requiredFunctionIds.join(", ") || "Respond"}</Text>
        </Box>
      ))}
      <Button colorPalette="red" alignSelf="start">Start interaction</Button>
    </PreviewFrame>
  );
}
