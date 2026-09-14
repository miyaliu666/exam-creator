import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import type {
  ContentPoint,
  FormEntryCandidatePayload,
  SpokenMultiturnCandidatePayload,
  SpokenSingleCandidatePayload,
  TaskPackage,
  TypedMessageCandidatePayload,
  ValidationIssue,
} from "./types";
import {
  FieldValidationMessages,
  validationMessages,
} from "./validation-feedback";

interface EditorProps {
  draft: TaskPackage;
  updateDraft: (mutate: (next: TaskPackage) => void) => void;
  validationIssues?: ValidationIssue[];
}

function moveItem<T>(items: T[], index: number, offset: -1 | 1) {
  const destination = index + offset;
  if (destination < 0 || destination >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(destination, 0, item);
}

function normalizationForInputType(inputType: string) {
  if (inputType === "number") return "NORM-NUMBER-v0.1";
  if (inputType === "date") return "NORM-DATE-v0.1";
  if (inputType === "time") return "NORM-TIME-v0.1";
  return "NORM-SHORT-CORE-TEXT-v0.1";
}

function recalculateMaxRawScore(next: TaskPackage) {
  next.scoringPackage.maxRawScore = (next.scoringPackage.scoringPoints ?? [])
    .reduce((total, point) => total + point.points, 0);
}

function BaseFields({
  situation,
  instructions,
  onSituation,
  onInstructions,
  validationIssues,
}: {
  situation: string;
  instructions: string;
  onSituation: (value: string) => void;
  onInstructions: (value: string) => void;
  validationIssues?: ValidationIssue[];
}) {
  return (
    <>
      <Field.Root invalid={validationMessages(validationIssues, "candidatePayload.situation").length > 0}>
        <Field.Label>Situation</Field.Label>
        <Textarea aria-label="Situation" placeholder="Example: You are meeting a new colleague on your first day at work." value={situation} onChange={(event) => onSituation(event.target.value)} />
        <FieldValidationMessages issues={validationIssues} path="candidatePayload.situation" />
      </Field.Root>
      <Field.Root invalid={validationMessages(validationIssues, "candidatePayload.instructions").length > 0}>
        <Field.Label>Candidate instructions</Field.Label>
        <Textarea aria-label="Candidate instructions" placeholder="Example: Answer the questions, then ask your colleague one related question." value={instructions} onChange={(event) => onInstructions(event.target.value)} />
        <FieldValidationMessages issues={validationIssues} path="candidatePayload.instructions" />
      </Field.Root>
    </>
  );
}

function ContentPoints({
  points,
  onChange,
  validationIssues,
}: {
  points: ContentPoint[];
  onChange: (points: ContentPoint[]) => void;
  validationIssues?: ValidationIssue[];
}) {
  const path = "candidatePayload.requiredContentPoints";
  return (
    <Stack gap={2}>
      <HStack justify="space-between"><Text fontWeight="bold">Required response content</Text><Button size="sm" variant="outline" onClick={() => onChange([...points, { contentPointId: `P${points.length + 1}`, description: "" }])}><Plus size={15} /> Add requirement</Button></HStack>
      {points.map((point, index) => (
        <HStack key={`${point.contentPointId}-${index}`}>
          <Badge>{index + 1}</Badge>
          <Field.Root invalid={validationMessages(validationIssues, `${path}.${index}`, true).length > 0}>
            <Input aria-label={`Response requirement ${index + 1}`} placeholder="Example: Include a name, meeting time, or request." value={point.description} onChange={(event) => onChange(points.map((entry, entryIndex) => entryIndex === index ? { ...entry, description: event.target.value } : entry))} />
            <FieldValidationMessages issues={validationIssues} path={`${path}.${index}`} includeDescendants />
          </Field.Root>
          <Button size="xs" variant="ghost" aria-label={`Move content point ${index + 1} up`} disabled={index === 0} onClick={() => {
            const next = [...points];
            moveItem(next, index, -1);
            onChange(next);
          }}><ArrowUp size={15} /></Button>
          <Button size="xs" variant="ghost" aria-label={`Move content point ${index + 1} down`} disabled={index === points.length - 1} onClick={() => {
            const next = [...points];
            moveItem(next, index, 1);
            onChange(next);
          }}><ArrowDown size={15} /></Button>
          <Button size="sm" variant="ghost" colorPalette="red" disabled={points.length <= 1} onClick={() => onChange(points.filter((_, entryIndex) => entryIndex !== index))}><Trash2 size={16} /></Button>
        </HStack>
      ))}
      <FieldValidationMessages issues={validationIssues} path={path} />
    </Stack>
  );
}

export function FormEntryEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as FormEntryCandidatePayload;
  return (
    <Stack gap={4}>
      <BaseFields situation={payload.situation} instructions={payload.instructions} validationIssues={validationIssues} onSituation={(value) => updateDraft((next) => { (next.candidatePayload as FormEntryCandidatePayload).situation = value; })} onInstructions={(value) => updateDraft((next) => { (next.candidatePayload as FormEntryCandidatePayload).instructions = value; })} />
      <HStack justify="space-between"><Text fontWeight="bold">Form fields (4–6)</Text><Button size="sm" variant="outline" disabled={payload.fields.length >= 6} onClick={() => updateDraft((next) => {
        const current = next.candidatePayload as FormEntryCandidatePayload;
        let fieldNumber = current.fields.length + 1;
        while (current.fields.some((field) => field.fieldId === `F${fieldNumber}`)) fieldNumber += 1;
        const fieldId = `F${fieldNumber}`;
        current.fields.push({ fieldId, label: "", inputType: "shortText", required: true, maxLength: 20, placeholder: null });
        (next.scoringPackage.acceptedResponses ??= {})[fieldId] = [];
        (next.scoringPackage.scoringPoints ??= []).push({
          scoringPointId: `SP-${fieldId}`,
          description: `Form field ${fieldId}`,
          points: 1,
          normalizationPolicyId: "NORM-SHORT-CORE-TEXT-v0.1",
        });
        recalculateMaxRawScore(next);
      })}><Plus size={15} /> Add</Button></HStack>
      {payload.fields.map((field, index) => (
        <Stack key={`${field.fieldId}-${index}`} borderWidth="1px" borderRadius="lg" p={4} gap={3}>
          <HStack justify="space-between">
            <Badge>{field.fieldId}</Badge>
            <HStack>
              <Button size="xs" variant="ghost" aria-label={`Move form field ${index + 1} up`} disabled={index === 0} onClick={() => updateDraft((next) => { moveItem((next.candidatePayload as FormEntryCandidatePayload).fields, index, -1); })}><ArrowUp size={15} /></Button>
              <Button size="xs" variant="ghost" aria-label={`Move form field ${index + 1} down`} disabled={index === payload.fields.length - 1} onClick={() => updateDraft((next) => { moveItem((next.candidatePayload as FormEntryCandidatePayload).fields, index, 1); })}><ArrowDown size={15} /></Button>
              <Button size="xs" variant="ghost" colorPalette="red" aria-label={`Delete form field ${index + 1}`} disabled={payload.fields.length <= 4} onClick={() => updateDraft((next) => {
                const removed = (next.candidatePayload as FormEntryCandidatePayload).fields.splice(index, 1)[0];
                delete next.scoringPackage.acceptedResponses?.[removed.fieldId];
                next.scoringPackage.scoringPoints = (next.scoringPackage.scoringPoints ?? []).filter((point) => point.scoringPointId !== `SP-${removed.fieldId}`);
                recalculateMaxRawScore(next);
              })}><Trash2 size={16} /></Button>
            </HStack>
          </HStack>
          <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
            <Field.Root invalid={validationMessages(validationIssues, `candidatePayload.fields.${index}`, true).length > 0}><Field.Label>Field label</Field.Label><Input value={field.label} onChange={(event) => updateDraft((next) => { (next.candidatePayload as FormEntryCandidatePayload).fields[index].label = event.target.value; })} /><FieldValidationMessages issues={validationIssues} path={`candidatePayload.fields.${index}`} includeDescendants /></Field.Root>
            <Field.Root><Field.Label>Input type</Field.Label><NativeSelect.Root><NativeSelect.Field value={field.inputType} onChange={(event) => updateDraft((next) => {
              (next.candidatePayload as FormEntryCandidatePayload).fields[index].inputType = event.target.value;
              const scoringPoint = next.scoringPackage.scoringPoints?.find((point) => point.scoringPointId === `SP-${field.fieldId}`);
              if (scoringPoint) scoringPoint.normalizationPolicyId = normalizationForInputType(event.target.value);
            })}><option value="shortText">Short text</option><option value="typedChinese">Target-language text</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option></NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>
            <Field.Root><Field.Label>Accepted values / criteria (separate with /)</Field.Label><Input value={(draft.scoringPackage.acceptedResponses?.[field.fieldId] ?? []).join(" / ")} onChange={(event) => updateDraft((next) => {
              (next.scoringPackage.acceptedResponses ??= {})[field.fieldId] = event.target.value.split("/").map((value) => value.trim()).filter(Boolean);
            })} /></Field.Root>
            <Checkbox.Root alignSelf="end" mb={2} checked={field.required} onCheckedChange={(details) => updateDraft((next) => { (next.candidatePayload as FormEntryCandidatePayload).fields[index].required = details.checked === true; })}><Checkbox.HiddenInput /><Checkbox.Control /><Checkbox.Label>Required field</Checkbox.Label></Checkbox.Root>
          </SimpleGrid>
        </Stack>
      ))}
    </Stack>
  );
}

export function TypedMessageEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as TypedMessageCandidatePayload;
  return (
    <Stack gap={4}>
      <BaseFields situation={payload.situation} instructions={payload.instructions} validationIssues={validationIssues} onSituation={(value) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).situation = value; })} onInstructions={(value) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).instructions = value; })} />
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
        <Field.Root invalid={validationMessages(validationIssues, "candidatePayload.recipient").length > 0}><Field.Label>Recipient</Field.Label><Input value={payload.recipient} onChange={(event) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).recipient = event.target.value; })} /><FieldValidationMessages issues={validationIssues} path="candidatePayload.recipient" /></Field.Root>
        <Field.Root invalid={validationMessages(validationIssues, "candidatePayload.purpose").length > 0}><Field.Label>Writing purpose</Field.Label><Input value={payload.purpose} onChange={(event) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).purpose = event.target.value; })} /><FieldValidationMessages issues={validationIssues} path="candidatePayload.purpose" /></Field.Root>
      </SimpleGrid>
      <Field.Root><Field.Label>Source message (optional)</Field.Label><Textarea value={payload.sourceMessage ?? ""} onChange={(event) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).sourceMessage = event.target.value || null; })} /></Field.Root>
      <ContentPoints points={payload.requiredContentPoints} validationIssues={validationIssues} onChange={(points) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).requiredContentPoints = points; })} />
      <Box as="details"><Text as="summary" cursor="pointer" fontSize="sm">Length limits</Text><HStack mt={3}>
        <Field.Root><Field.Label>Minimum characters</Field.Label><Input type="number" value={payload.lengthGuidance.minimum} onChange={(event) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).lengthGuidance.minimum = Number(event.target.value); })} /></Field.Root>
        <Field.Root><Field.Label>Maximum characters</Field.Label><Input type="number" value={payload.lengthGuidance.maximum} onChange={(event) => updateDraft((next) => { (next.candidatePayload as TypedMessageCandidatePayload).lengthGuidance.maximum = Number(event.target.value); })} /></Field.Root>
      </HStack></Box>
    </Stack>
  );
}

export function SpokenSingleEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as SpokenSingleCandidatePayload;
  return (
    <Stack gap={4}>
      <BaseFields situation={payload.situation} instructions={payload.instructions} validationIssues={validationIssues} onSituation={(value) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).situation = value; })} onInstructions={(value) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).instructions = value; })} />
      <Field.Root invalid={validationMessages(validationIssues, "candidatePayload", true).some(() => !payload.visiblePromptText && !payload.promptAudioRef)}><Field.Label>Candidate-visible prompt</Field.Label><Textarea value={payload.visiblePromptText ?? ""} onChange={(event) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).visiblePromptText = event.target.value || null; })} /><FieldValidationMessages issues={validationIssues} path="candidatePayload" /></Field.Root>
      <Box as="details"><Text as="summary" cursor="pointer" fontSize="sm">Timing · {payload.preparationTimeSeconds}s preparation / {payload.responseTimeSeconds}s response</Text><SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={3}>
        <Field.Root><Field.Label>Preparation time (seconds)</Field.Label><Input type="number" value={payload.preparationTimeSeconds} onChange={(event) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).preparationTimeSeconds = Number(event.target.value); })} /></Field.Root>
        <Field.Root><Field.Label>Response time (seconds)</Field.Label><Input type="number" value={payload.responseTimeSeconds} onChange={(event) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).responseTimeSeconds = Number(event.target.value); })} /></Field.Root>
      </SimpleGrid></Box>
      <ContentPoints points={payload.requiredContentPoints} validationIssues={validationIssues} onChange={(points) => updateDraft((next) => { (next.candidatePayload as SpokenSingleCandidatePayload).requiredContentPoints = points; })} />
    </Stack>
  );
}

export function SpokenMultiturnEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as SpokenMultiturnCandidatePayload;
  const path = payload.paths.find((entry) => entry.pathId === payload.startPathId) ?? payload.paths[0];
  return (
    <Stack gap={4}>
      <BaseFields situation={payload.situation} instructions={payload.instructions} validationIssues={validationIssues} onSituation={(value) => updateDraft((next) => { (next.candidatePayload as SpokenMultiturnCandidatePayload).situation = value; })} onInstructions={(value) => updateDraft((next) => { (next.candidatePayload as SpokenMultiturnCandidatePayload).instructions = value; })} />
      <Box as="details"><Text as="summary" cursor="pointer" fontSize="sm">Conversation roles · {payload.roles.systemRole} / {payload.roles.candidateRole}</Text><SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={3}>
        <Field.Root><Field.Label>Examiner role</Field.Label><Input value={payload.roles.systemRole} onChange={(event) => updateDraft((next) => { (next.candidatePayload as SpokenMultiturnCandidatePayload).roles.systemRole = event.target.value; })} /></Field.Root>
        <Field.Root><Field.Label>Candidate role</Field.Label><Input value={payload.roles.candidateRole} onChange={(event) => updateDraft((next) => { (next.candidatePayload as SpokenMultiturnCandidatePayload).roles.candidateRole = event.target.value; })} /></Field.Root>
      </SimpleGrid></Box>
      <HStack justify="space-between"><Text fontWeight="bold">Conversation</Text><Button size="sm" variant="outline" onClick={() => updateDraft((next) => {
        const current = next.candidatePayload as SpokenMultiturnCandidatePayload;
        const currentPath = current.paths.find((entry) => entry.pathId === current.startPathId) ?? current.paths[0];
        const index = currentPath.turns.length + 1;
        currentPath.turns.push({ turnId: `T${index}`, speaker: "system", promptAudioRef: "", responseId: null, responseTimeSeconds: null, requiredFunctionIds: [] });
        currentPath.turns.push({ turnId: `T${index + 1}`, speaker: "candidate", promptAudioRef: null, responseId: `R${Math.ceil((index + 1) / 2)}`, responseTimeSeconds: 45, requiredFunctionIds: [""] });
      })}><Plus size={15} /> Add exchange</Button></HStack>
      {path?.turns.map((turn, index) => (
        <HStack key={`${turn.turnId}-${index}`} align="end">
          <Field.Root invalid={validationMessages(validationIssues, `candidatePayload.paths.0.turns.${index}`, true).length > 0}><Field.Label>{turn.speaker === "system" ? "Examiner prompt" : "Expected candidate action"}</Field.Label><Input aria-label={`${turn.speaker === "system" ? "Examiner prompt" : "Expected candidate action"} ${index + 1}`} placeholder={turn.speaker === "system" ? "Example: 你叫什么名字？ (or an audio reference)" : "Example: Give their name / Ask the other person’s name"} value={turn.speaker === "system" ? turn.promptAudioRef ?? "" : turn.requiredFunctionIds.join(" / ")} onChange={(event) => updateDraft((next) => {
            const current = next.candidatePayload as SpokenMultiturnCandidatePayload;
            const currentPath = current.paths.find((entry) => entry.pathId === current.startPathId) ?? current.paths[0];
            if (turn.speaker === "system") currentPath.turns[index].promptAudioRef = event.target.value;
            else currentPath.turns[index].requiredFunctionIds = event.target.value.split("/").map((value) => value.trim()).filter(Boolean);
          })} /><FieldValidationMessages issues={validationIssues} path={`candidatePayload.paths.0.turns.${index}`} includeDescendants /></Field.Root>
          <Button size="sm" mb={1} variant="ghost" colorPalette="red" aria-label={`Delete conversation turn ${index + 1}`} disabled={(path?.turns.length ?? 0) <= 2} onClick={() => updateDraft((next) => {
            const current = next.candidatePayload as SpokenMultiturnCandidatePayload;
            const currentPath = current.paths.find((entry) => entry.pathId === current.startPathId) ?? current.paths[0];
            currentPath.turns.splice(index, 1);
          })}><Trash2 size={16} /></Button>
        </HStack>
      ))}
    </Stack>
  );
}
