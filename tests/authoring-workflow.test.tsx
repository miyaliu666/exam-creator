import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { canSubmitDraft, initialEditorSection } from "../client/features/language-items/authoring-workflow";
import { ITEM_TEMPLATE_REGISTRY } from "../client/features/language-items/item-template-registry";
import { DraftCheckPanel } from "../client/features/language-items/draft-check-panel";
import { createExerciseTemplateDraft, EXERCISE_TEMPLATES } from "../client/features/language-items/exercise-template-catalog";
import { projectExerciseTemplateCandidate } from "../client/features/language-items/exercise-template-projection";
import type { CandidatePayload, LanguageItemStatus, TaskPackage, ValidationResult } from "../client/features/language-items/types";

const stimulus = { text: "", imageRefs: [], audioRef: null };
const productive = { situation: "", instructions: "" };
const points = [{ contentPointId: "P1", description: "" }];
const payloads: Record<string, CandidatePayload> = {
  "IF-SINGLE-SELECT": { stimulus, prompt: "", options: [{ optionId: "A", text: "", imageRef: null }, { optionId: "B", text: "", imageRef: null }], shuffleOptions: false },
  "IF-MATCHING": { stimulus, prompt: "", leftItems: [{ itemId: "L1", text: "", imageRef: null }], rightItems: [{ itemId: "R1", text: "", imageRef: null }], shuffleRightItems: true, allowRightItemReuse: false },
  "IF-RESTRICTED-INPUT": { stimulus, prompt: "", responseFields: [{ responseId: "F1", label: "答案", inputType: "shortText", maxLength: 12, placeholder: null }] },
  "IF-FORM-ENTRY": { ...productive, sourceProfile: null, fields: Array.from({ length: 4 }, (_, i) => ({ fieldId: `F${i + 1}`, label: "", inputType: "shortText", required: true, maxLength: 20, placeholder: null })) },
  "IF-TYPED-MESSAGE": { ...productive, sourceMessage: null, sourceMaterialRefs: [], recipient: "", purpose: "", requiredContentPoints: points, lengthGuidance: { countBy: "characters", minimum: 10, maximum: 40 } },
  "IF-SPOKEN-SINGLE": { ...productive, visiblePromptText: "", promptAudioRef: null, sourceMaterialRefs: [], recipient: null, purpose: null, preparationTimeSeconds: 20, responseTimeSeconds: 60, requiredContentPoints: points },
  "IF-SPOKEN-MULTITURN": { ...productive, roles: { systemRole: "Examiner", candidateRole: "Candidate" }, interactionMode: "fixed", startPathId: "PATH-1", routingRuleId: "fixed", paths: [{ pathId: "PATH-1", turns: [
    { turnId: "T1", speaker: "system", promptAudioRef: "", responseId: null, responseTimeSeconds: null, requiredFunctionIds: [] },
    { turnId: "T2", speaker: "candidate", promptAudioRef: null, responseId: "R1", responseTimeSeconds: 45, requiredFunctionIds: ["Provide personal information"] },
  ] }] },
};

for (const template of EXERCISE_TEMPLATES) {
  const document = { exerciseType: template.id, body: "", data: createExerciseTemplateDraft(template.id) };
  payloads[`EXERCISE:${template.id}`] = projectExerciseTemplateCandidate(document);
}

test("the registry retains seven legacy adapters and includes all sixty source templates", () => {
  assert.equal(ITEM_TEMPLATE_REGISTRY.length, 67);
  assert.equal(ITEM_TEMPLATE_REGISTRY.filter(template => template.itemFormatId.startsWith("EXERCISE:")).length, 60);
  assert.equal(ITEM_TEMPLATE_REGISTRY.filter(template => !template.itemFormatId.startsWith("EXERCISE:")).length, 7);
});

for (const template of ITEM_TEMPLATE_REGISTRY) {
  test(`${template.itemFormatId}: new scaffold starts at Prepare; authored question reopens in the editor`, () => {
    const payload = structuredClone(payloads[template.itemFormatId]);
    assert.ok(payload, "Every registered format needs a workflow fixture");
    assert.equal(initialEditorSection("draft", payload), "setup");
    assert.equal(initialEditorSection("draft", payload, true), "content");
    if ("exerciseType" in payload) payload.body = "Read the notice and answer the questions.";
    else if ("prompt" in payload) payload.prompt = "你叫什么名字？";
    else payload.situation = "你是新来的同学。";
    assert.equal(initialEditorSection("draft", payload), "content");
  });
  test(`${template.itemFormatId}: editor and preview render without removed technical controls`, () => {
    const payload = structuredClone(payloads[template.itemFormatId]);
    const authored = "exerciseType" in payload ? { exerciseType: payload.exerciseType, body: payload.body, data: createExerciseTemplateDraft(payload.exerciseType) } : undefined;
    const draft = { candidatePayload: payload, itemFormatId: template.itemFormatId, authoringPackage: { exerciseTemplate: authored }, content: { primaryReportedSkill: "Reading" }, scoringPackage: { correctOptionId: "A", correctMatches: {}, acceptedResponses: {}, scoringPoints: [] } } as unknown as TaskPackage;
    const Editor = template.Editor;
    const editor = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><Editor draft={draft} updateDraft={() => undefined} /></ChakraProvider>);
    const preview = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>{template.renderPreview(payload)}</ChakraProvider>);
    assert.ok(editor.includes("input") || editor.includes("textarea"));
    assert.ok(preview.length > 0);
    assert.doesNotMatch(editor, /Technical data|TaskPackage JSON|Save now|Save &amp; validate/);
    assert.doesNotMatch(preview, /Start recording|Start interaction|Provide personal information/);
  });
}

test("frozen and reviewed items open Check & submit, not a new-item step", () => {
  const statuses: LanguageItemStatus[] = ["readyForReview", "inReview", "needsRevision", "reviewBlocked", "rejected", "approvedForExport", "exportedToStaging"];
  for (const status of statuses) {
    assert.equal(initialEditorSection(status, payloads["IF-SINGLE-SELECT"]), "review");
    assert.equal(initialEditorSection(status, payloads["IF-SINGLE-SELECT"], true), "review");
  }
});

test("submission requires successful current checks and complete requirements; busy actions never submit", () => {
  const valid: ValidationResult = { valid: true, issues: [] };
  assert.equal(canSubmitDraft(null, 0, false), false);
  assert.equal(canSubmitDraft({ valid: false, issues: [] }, 0, false), false);
  assert.equal(canSubmitDraft(valid, 1, false), false);
  assert.equal(canSubmitDraft(valid, 0, true), false);
  assert.equal(canSubmitDraft(valid, 0, false), true);
});

test("checks combine setup and server errors once and give a route to fix each", () => {
  const issue = { path: "content.targetContentIds", message: "Choose a language target" };
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><DraftCheckPanel
    setupIssues={[issue]} checking={false} onCheck={() => undefined} onEdit={() => undefined}
    validation={{ valid: false, issues: [{ ...issue, code: "target", severity: "error", ruleRef: "target" }, { path: "candidatePayload.prompt", message: "Enter a question", code: "prompt", severity: "error", ruleRef: "prompt" }] }}
  /></ChakraProvider>);
  assert.equal(markup.split(issue.message).length - 1, 1);
  assert.match(markup, /Go to Prepare/);
  assert.match(markup, /Go to editor/);
  assert.doesNotMatch(markup, /Checks passed/);
});

test("item checks respect a busy workflow and cannot be duplicated while running", () => {
  for (const [disabled, checking] of [[false, false], [true, false], [false, true]]) {
    const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><DraftCheckPanel
      setupIssues={[]} disabled={disabled} checking={checking} onCheck={() => undefined} onEdit={() => undefined}
      validation={{ valid: true, issues: [] }}
    /></ChakraProvider>);
    const checkButton = markup.match(/<button\b[^>]*>/)?.[0];
    assert.ok(checkButton);
    assert.equal(/\bdisabled/.test(checkButton), disabled || checking);
    if (checking) assert.doesNotMatch(markup, /Checks passed/);
  }
});
