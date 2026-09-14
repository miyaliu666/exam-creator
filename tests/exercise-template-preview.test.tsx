import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExerciseTemplateCandidatePreview } from "../client/features/language-items/exercise-template-candidate-preview";
import { ExerciseTemplateEditor } from "../client/features/language-items/exercise-template-editor";
import { createExerciseTemplateDraft, setExerciseTemplateField } from "../client/features/language-items/exercise-template-catalog";
import { projectExerciseTemplateCandidate } from "../client/features/language-items/exercise-template-projection";

test("exercise editor inherits item language and leaves mismatches for explicit repair", () => {
  const value = createExerciseTemplateDraft("multiple-choice");
  const before = structuredClone(value);
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateEditor exerciseType="multiple-choice" itemLanguage="es" value={value} onChange={() => assert.fail("render must not rewrite saved data")} /></ChakraProvider>);
  assert.match(markup, /Language:.*Spanish/);
  assert.match(markup, /Use Spanish/);
  assert.deepEqual(value, before);
});

test("SSR candidate preview escapes executable markup and never receives author feedback", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "multiple-choice", body: '<script>alert("BODY")</script>', data: {
    title: "Question", passage: '<img src=x onerror="alert(1)"><script>alert(2)</script>',
    teacherNotes: "PRIVATE_NOTES", questions: [{ prompt: "Which?", options: ["One", "Two"], correct: 1, explanation: "PRIVATE_EXPLANATION" }],
  } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  assert.doesNotMatch(markup, /<script|<img[^>]+onerror=/);
  assert.doesNotMatch(markup, /PRIVATE_NOTES|PRIVATE_EXPLANATION/);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 2);
});

test("question radio groups remain independent across nested rows", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "multiple-choice", body: "", data: { questions: [
    { prompt: "First?", options: ["A", "B"], correct: 0 }, { prompt: "Second?", options: ["C", "D"], correct: 1 },
  ] } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  const names = [...markup.matchAll(/<input[^>]+name="([^"]+)"/g)].map(match => match[1]);
  assert.equal(names.length, 4);
  assert.equal(names[0], names[1]);
  assert.equal(names[2], names[3]);
  assert.notEqual(names[0], names[2]);
});

test("highlight answers renders independent span selections without revealing either answer set", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "highlight-the-answer", body: "", data: {
    passage: ["The first lesson starts at nine.", "The lesson is in room two.", "Lunch starts at twelve."],
    questions: [{ prompt: "When is the first lesson?", correct: [0], explanation: "PRIVATE_SINGLE" }, { prompt: "What are the lesson arrangements?", correct: [0, 1], explanation: "PRIVATE_MULTIPLE" }],
  } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 6);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 0);
  assert.doesNotMatch(markup, /PRIVATE_SINGLE|PRIVATE_MULTIPLE|checked=""|placeholder="Your answer"/);
  for (const question of ["When is the first lesson?", "What are the lesson arrangements?"]) assert.ok(markup.includes(question));
  const names = [...markup.matchAll(/<input[^>]+name="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(names.slice(0, 3)).size, 1);
  assert.equal(new Set(names.slice(3)).size, 1);
  assert.notEqual(names[0], names[3]);
});

test("highlight incorrect words offers every word as an unchecked selection beside the recording", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "highlight-incorrect-words", body: "", data: {
    audio: { src: "/recording.mp3" }, words: ["The", "train", "leaves", "at", "nine", "today."], incorrectIndices: [1, 4],
  } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 6);
  assert.match(markup, /<audio[^>]+src="\/recording.mp3"/);
  assert.match(markup, /Select the words that do not match the recording/);
  assert.doesNotMatch(markup, /incorrectIndices|checked=""/);
});

test("mixed single and multiple nested source questions retain their distinct controls", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "multiple-choice", body: "", data: { questions: [
    { prompt: "Choose one.", options: ["A", "B"], correct: 0 }, { prompt: "Choose all that apply.", options: ["C", "D", "E"], correct: [0, 2] },
  ] } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  assert.equal((markup.match(/type="radio"/g) ?? []).length, 2);
  assert.equal((markup.match(/type="checkbox"/g) ?? []).length, 3);
  assert.doesNotMatch(markup, /checked=""/);
});

test("private answer unions never become public content or prefilled responses", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "fill-in-blanks", body: "", data: { items: [
    { text: "The lesson starts at ___.", answers: ["PRIVATE_STRING"] },
    { text: "The lesson is in room ___.", answers: [{ value: "PRIVATE_VALUE", alternatives: ["PRIVATE_ALTERNATIVE"], explanation: "PRIVATE_EXPLANATION" }] },
  ] } });
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateCandidatePreview payload={payload} /></ChakraProvider>);
  assert.doesNotMatch(markup, /PRIVATE_STRING|PRIVATE_VALUE|PRIVATE_ALTERNATIVE|PRIVATE_EXPLANATION/);
  assert.equal((markup.match(/placeholder="Your answer"/g) ?? []).length, 2);
});

test("retained fields are visible and explicitly removable without a JSON editor", () => {
  const original = { ...createExerciseTemplateDraft("multiple-choice"), legacyScoring: { keep: true }, questions: [{ prompt: "Question", options: ["A", "B"], correct: 0, oldField: "Retained value" }] };
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ExerciseTemplateEditor exerciseType="multiple-choice" value={original} mode="defaults" onChange={() => undefined} /></ChakraProvider>);
  assert.match(markup, /Retained fields/);
  assert.match(markup, /Remove retained field legacyScoring/);
  assert.match(markup, /Remove retained field oldField/);
  assert.doesNotMatch(markup, /JSON editor|TaskPackage JSON/);
  const edited = setExerciseTemplateField(original, ["legacyScoring"], undefined) as Record<string, unknown>;
  assert.equal(edited.legacyScoring, undefined);
  assert.deepEqual(original.legacyScoring, { keep: true });
  assert.deepEqual(edited.questions, original.questions);
});
