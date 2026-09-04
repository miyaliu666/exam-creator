import {
  Badge,
  Button,
  Checkbox,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";

import type {
  MatchingCandidatePayload,
  RestrictedInputCandidatePayload,
  SingleSelectCandidatePayload,
  TaskPackage,
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

function nextId(prefix: string, ids: string[]) {
  let index = ids.length + 1;
  while (ids.includes(`${prefix}${index}`)) index += 1;
  return `${prefix}${index}`;
}

function moveItem<T>(items: T[], index: number, offset: -1 | 1) {
  const destination = index + offset;
  if (destination < 0 || destination >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(destination, 0, item);
}

function recalculateMaxRawScore(next: TaskPackage) {
  next.scoringPackage.maxRawScore = (next.scoringPackage.scoringPoints ?? [])
    .reduce((total, point) => total + point.points, 0);
}

function StimulusFields({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as SingleSelectCandidatePayload;
  const isListening = draft.content.primaryReportedSkill === "Listening";
  return (
    <>
      <Field.Root
        invalid={validationMessages(validationIssues, "candidatePayload.stimulus", true).length > 0}
      >
        <Field.Label>{isListening ? "Audio transcript" : "Reading stimulus"}</Field.Label>
        <Textarea
          value={payload.stimulus.text ?? ""}
          onChange={(event) => updateDraft((next) => {
            (next.candidatePayload as SingleSelectCandidatePayload).stimulus.text = event.target.value;
          })}
        />
        <FieldValidationMessages
          issues={validationIssues}
          path="candidatePayload.stimulus"
          includeDescendants
        />
      </Field.Root>
      {isListening ? (
        <Field.Root>
          <Field.Label>Audio file URL</Field.Label>
          <Input
            type="url"
            value={payload.stimulus.audioRef ?? ""}
            onChange={(event) =>
              updateDraft((next) => {
                (next.candidatePayload as SingleSelectCandidatePayload).stimulus.audioRef =
                  event.target.value || null;
              })
            }
          />
        </Field.Root>
      ) : null}
      <Field.Root
        invalid={validationMessages(validationIssues, "candidatePayload.prompt").length > 0}
      >
        <Field.Label>Question</Field.Label>
        <Textarea
          value={payload.prompt}
          onChange={(event) => updateDraft((next) => {
            (next.candidatePayload as SingleSelectCandidatePayload).prompt = event.target.value;
          })}
        />
        <FieldValidationMessages issues={validationIssues} path="candidatePayload.prompt" />
      </Field.Root>
    </>
  );
}

export function SingleSelectEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as SingleSelectCandidatePayload;
  return (
    <Stack gap={4}>
      <StimulusFields draft={draft} updateDraft={updateDraft} validationIssues={validationIssues} />
      <HStack justify="space-between">
        <Text fontWeight="bold">Options</Text>
        <Button size="sm" variant="outline" onClick={() => updateDraft((next) => {
          const current = next.candidatePayload as SingleSelectCandidatePayload;
          const optionId = nextId("O", current.options.map((entry) => entry.optionId));
          current.options.push({ optionId, text: "", imageRef: null });
        })}><Plus size={15} /> Add</Button>
      </HStack>
      {payload.options.map((option, index) => (
        <HStack key={option.optionId}>
          <Badge minW="42px">{option.optionId}</Badge>
          <Field.Root
            invalid={validationMessages(validationIssues, `candidatePayload.options.${index}`, true).length > 0}
          >
            <Input value={option.text ?? ""} aria-label={`Option ${index + 1}`} onChange={(event) => updateDraft((next) => {
              (next.candidatePayload as SingleSelectCandidatePayload).options[index].text = event.target.value;
            })} />
            <FieldValidationMessages
              issues={validationIssues}
              path={`candidatePayload.options.${index}`}
              includeDescendants
            />
          </Field.Root>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Move option ${index + 1} up`}
            disabled={index === 0}
            onClick={() => updateDraft((next) => {
              moveItem(
                (next.candidatePayload as SingleSelectCandidatePayload).options,
                index,
                -1,
              );
            })}
          ><ArrowUp size={15} /></Button>
          <Button
            size="xs"
            variant="ghost"
            aria-label={`Move option ${index + 1} down`}
            disabled={index === payload.options.length - 1}
            onClick={() => updateDraft((next) => {
              moveItem(
                (next.candidatePayload as SingleSelectCandidatePayload).options,
                index,
                1,
              );
            })}
          ><ArrowDown size={15} /></Button>
          <Button size="sm" variant="ghost" colorPalette="red" disabled={payload.options.length <= 2} onClick={() => updateDraft((next) => {
            const current = next.candidatePayload as SingleSelectCandidatePayload;
            const removed = current.options.splice(index, 1)[0];
            if (next.scoringPackage.correctOptionId === removed.optionId) next.scoringPackage.correctOptionId = current.options[0]?.optionId;
          })}><Trash2 size={16} /></Button>
        </HStack>
      ))}
      <Field.Root
        invalid={validationMessages(validationIssues, "scoringPackage.correctOptionId").length > 0}
      >
        <Field.Label>Correct answer</Field.Label>
        <NativeSelect.Root><NativeSelect.Field value={draft.scoringPackage.correctOptionId ?? ""} onChange={(event) => updateDraft((next) => {
          next.scoringPackage.correctOptionId = event.target.value;
        })}>
          {payload.options.map((option) => <option key={option.optionId} value={option.optionId}>{option.optionId} — {option.text || "Empty"}</option>)}
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        <FieldValidationMessages issues={validationIssues} path="scoringPackage.correctOptionId" />
      </Field.Root>
      <Checkbox.Root checked={payload.shuffleOptions} onCheckedChange={(details) => updateDraft((next) => {
        (next.candidatePayload as SingleSelectCandidatePayload).shuffleOptions = details.checked === true;
      })}>
        <Checkbox.HiddenInput /><Checkbox.Control /><Checkbox.Label>Randomize options on delivery</Checkbox.Label>
      </Checkbox.Root>
    </Stack>
  );
}

export function MatchingEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as MatchingCandidatePayload;
  return (
    <Stack gap={4}>
      <StimulusFields draft={draft} updateDraft={updateDraft} validationIssues={validationIssues} />
      <HStack justify="space-between"><Text fontWeight="bold">Matching pairs</Text><Button size="sm" variant="outline" onClick={() => updateDraft((next) => {
        const current = next.candidatePayload as MatchingCandidatePayload;
        const leftId = nextId("L", current.leftItems.map((entry) => entry.itemId));
        const rightId = nextId("R", current.rightItems.map((entry) => entry.itemId));
        current.leftItems.push({ itemId: leftId, text: "", imageRef: null });
        current.rightItems.push({ itemId: rightId, text: "", imageRef: null });
        (next.scoringPackage.correctMatches ??= {})[leftId] = rightId;
        (next.scoringPackage.scoringPoints ??= []).push({
          scoringPointId: `SP-${leftId}`,
          description: `Correct match for ${leftId}`,
          points: 1,
          normalizationPolicyId: "NORM-NONE-v0.1",
        });
        recalculateMaxRawScore(next);
      })}><Plus size={15} /> Add pair</Button></HStack>
      {payload.leftItems.map((left, index) => (
        <HStack key={left.itemId} align="end">
          <Field.Root invalid={validationMessages(validationIssues, `candidatePayload.leftItems.${index}`, true).length > 0}><Field.Label>{left.itemId} prompt</Field.Label><Input value={left.text ?? ""} onChange={(event) => updateDraft((next) => {
            (next.candidatePayload as MatchingCandidatePayload).leftItems[index].text = event.target.value;
          })} /><FieldValidationMessages issues={validationIssues} path={`candidatePayload.leftItems.${index}`} includeDescendants /></Field.Root>
          <Field.Root invalid={validationMessages(validationIssues, `candidatePayload.rightItems.${index}`, true).length > 0}><Field.Label>{payload.rightItems[index]?.itemId ?? "Answer"}</Field.Label><Input value={payload.rightItems[index]?.text ?? ""} onChange={(event) => updateDraft((next) => {
            const current = next.candidatePayload as MatchingCandidatePayload;
            if (current.rightItems[index]) current.rightItems[index].text = event.target.value;
          })} /><FieldValidationMessages issues={validationIssues} path={`candidatePayload.rightItems.${index}`} includeDescendants /></Field.Root>
          <Field.Root maxW="150px" invalid={validationMessages(validationIssues, "scoringPackage.correctMatches", true).length > 0}><Field.Label>Answer</Field.Label><NativeSelect.Root><NativeSelect.Field value={draft.scoringPackage.correctMatches?.[left.itemId] ?? ""} onChange={(event) => updateDraft((next) => {
            (next.scoringPackage.correctMatches ??= {})[left.itemId] = event.target.value;
          })}>{payload.rightItems.map((right) => <option key={right.itemId} value={right.itemId}>{right.itemId}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root><FieldValidationMessages issues={validationIssues} path="scoringPackage.correctMatches" includeDescendants /></Field.Root>
          <Button size="xs" mb={1} variant="ghost" aria-label={`Move matching pair ${index + 1} up`} disabled={index === 0} onClick={() => updateDraft((next) => {
            const current = next.candidatePayload as MatchingCandidatePayload;
            moveItem(current.leftItems, index, -1);
            moveItem(current.rightItems, index, -1);
          })}><ArrowUp size={15} /></Button>
          <Button size="xs" mb={1} variant="ghost" aria-label={`Move matching pair ${index + 1} down`} disabled={index === payload.leftItems.length - 1} onClick={() => updateDraft((next) => {
            const current = next.candidatePayload as MatchingCandidatePayload;
            moveItem(current.leftItems, index, 1);
            moveItem(current.rightItems, index, 1);
          })}><ArrowDown size={15} /></Button>
          <Button size="sm" variant="ghost" colorPalette="red" disabled={payload.leftItems.length <= 2} onClick={() => updateDraft((next) => {
            const current = next.candidatePayload as MatchingCandidatePayload;
            const removedLeft = current.leftItems.splice(index, 1)[0];
            const removedRight = current.rightItems.splice(index, 1)[0];
            delete next.scoringPackage.correctMatches?.[removedLeft.itemId];
            Object.entries(next.scoringPackage.correctMatches ?? {}).forEach(([key, value]) => {
              if (value === removedRight?.itemId) (next.scoringPackage.correctMatches ??= {})[key] = current.rightItems[0]?.itemId ?? "";
            });
            next.scoringPackage.scoringPoints = (next.scoringPackage.scoringPoints ?? [])
              .filter((point) => point.scoringPointId !== `SP-${removedLeft.itemId}`);
            recalculateMaxRawScore(next);
          })}><Trash2 size={16} /></Button>
        </HStack>
      ))}
    </Stack>
  );
}

export function RestrictedInputEditor({ draft, updateDraft, validationIssues }: EditorProps) {
  const payload = draft.candidatePayload as RestrictedInputCandidatePayload;
  return (
    <Stack gap={4}>
      <StimulusFields draft={draft} updateDraft={updateDraft} validationIssues={validationIssues} />
      <HStack justify="space-between"><Text fontWeight="bold">Response fields</Text><Button size="sm" variant="outline" onClick={() => updateDraft((next) => {
        const current = next.candidatePayload as RestrictedInputCandidatePayload;
        const responseId = nextId("F", current.responseFields.map((entry) => entry.responseId));
        current.responseFields.push({ responseId, label: "Answer", inputType: "shortText", maxLength: 12, placeholder: null });
        (next.scoringPackage.acceptedResponses ??= {})[responseId] = [];
        (next.scoringPackage.scoringPoints ??= []).push({
          scoringPointId: `SP-${responseId}`,
          description: "Answer",
          points: 1,
          normalizationPolicyId: "NORM-SHORT-CORE-TEXT-v0.1",
        });
        recalculateMaxRawScore(next);
      })}><Plus size={15} /> Add</Button></HStack>
      {payload.responseFields.map((field, index) => (
        <HStack key={field.responseId} align="end">
          <Badge mb={2}>{field.responseId}</Badge>
          <Field.Root invalid={validationMessages(validationIssues, `candidatePayload.responseFields.${index}`, true).length > 0}><Field.Label>Field label</Field.Label><Input value={field.label ?? ""} onChange={(event) => updateDraft((next) => {
            (next.candidatePayload as RestrictedInputCandidatePayload).responseFields[index].label = event.target.value;
          })} /><FieldValidationMessages issues={validationIssues} path={`candidatePayload.responseFields.${index}`} includeDescendants /></Field.Root>
          <Field.Root invalid={validationMessages(validationIssues, `scoringPackage.acceptedResponses.${field.responseId}`, true).length > 0}><Field.Label>Accepted answers (separate with /)</Field.Label><Input value={(draft.scoringPackage.acceptedResponses?.[field.responseId] ?? []).join(" / ")} onChange={(event) => updateDraft((next) => {
            (next.scoringPackage.acceptedResponses ??= {})[field.responseId] = event.target.value.split("/").map((value) => value.trim()).filter(Boolean);
          })} /><FieldValidationMessages issues={validationIssues} path={`scoringPackage.acceptedResponses.${field.responseId}`} includeDescendants /></Field.Root>
          <Button size="xs" mb={1} variant="ghost" aria-label={`Move response field ${index + 1} up`} disabled={index === 0} onClick={() => updateDraft((next) => {
            moveItem((next.candidatePayload as RestrictedInputCandidatePayload).responseFields, index, -1);
          })}><ArrowUp size={15} /></Button>
          <Button size="xs" mb={1} variant="ghost" aria-label={`Move response field ${index + 1} down`} disabled={index === payload.responseFields.length - 1} onClick={() => updateDraft((next) => {
            moveItem((next.candidatePayload as RestrictedInputCandidatePayload).responseFields, index, 1);
          })}><ArrowDown size={15} /></Button>
          <Button size="sm" mb={1} variant="ghost" colorPalette="red" disabled={payload.responseFields.length <= 1} onClick={() => updateDraft((next) => {
            const removed = (next.candidatePayload as RestrictedInputCandidatePayload).responseFields.splice(index, 1)[0];
            delete next.scoringPackage.acceptedResponses?.[removed.responseId];
            next.scoringPackage.scoringPoints = (next.scoringPackage.scoringPoints ?? [])
              .filter((point) => point.scoringPointId !== `SP-${removed.responseId}`);
            recalculateMaxRawScore(next);
          })}><Trash2 size={16} /></Button>
        </HStack>
      ))}
    </Stack>
  );
}
