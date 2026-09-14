import assert from "node:assert/strict";
import test from "node:test";
import { createExerciseTemplateDraft, EXERCISE_TEMPLATES, exerciseTemplateById, exerciseTemplateName, setExerciseTemplateField, validateExerciseTemplateData } from "../client/features/language-items/exercise-template-catalog";
import { projectExerciseTemplateCandidate } from "../client/features/language-items/exercise-template-projection";
import { exerciseLabel, ITEM_FORMAT_LABELS } from "../client/features/language-items/labels";

function projected(exerciseType: string, data: Record<string, unknown>) { return projectExerciseTemplateCandidate({ exerciseType, body: "Instructions", data }).data; }

test("item language takes precedence over shared exercise defaults", () => {
  const defaults = { language: "zh", title: "Retained title" };
  for (const language of ["zh", "en", "es"]) {
    const draft = createExerciseTemplateDraft("multiple-choice", defaults, language);
    assert.equal(draft.language, language);
    assert.equal(draft.title, defaults.title);
    assert.equal(draft.instructionLanguage, "en");
  }
  assert.equal(defaults.language, "zh");
});

test("all seven historical formats display exact source exercise names", () => {
  const sourceNames = new Set(EXERCISE_TEMPLATES.map(template => template.name));
  const historicalFormats = Object.keys(ITEM_FORMAT_LABELS).filter(id => id.startsWith("IF-"));
  assert.equal(historicalFormats.length, 7);
  for (const format of historicalFormats) {
    assert.ok(sourceNames.has(ITEM_FORMAT_LABELS[format]), format);
    for (const skill of [undefined, "Reading", "Listening", "Speaking", "Writing"]) assert.ok(sourceNames.has(exerciseLabel(format, skill)), `${format}: ${skill}`);
  }
  assert.equal(exerciseLabel("IF-FORM-ENTRY"), "Guided Writing");
  assert.equal(exerciseLabel("IF-SPOKEN-MULTITURN"), "Conversations");
});

test("all 60 source identities, exact names, source fields and independent projection policies are present", () => {
  assert.equal(EXERCISE_TEMPLATES.length, 60);
  assert.equal(new Set(EXERCISE_TEMPLATES.map(template => template.id)).size, 60);
  assert.equal(exerciseTemplateName("multiple-choice"), "Multiple choice");
  assert.equal(exerciseTemplateName("multiple-choice-single-answer"), "Multiple Choice");
  assert.equal(exerciseTemplateName("short-answer-questions"), "Short-answer Questions");
  assert.equal(exerciseTemplateName("listening-short-answer-questions"), "Short-answer Questions");
  for (const template of EXERCISE_TEMPLATES) {
    assert.ok(template.fields.some(field => field.key === "type" && field.values?.[0] === template.id));
    assert.ok(template.projection.privatePaths.includes("teacherNotes"));
    assert.equal(template.schema.type, "object");
  }
});

test("immutable field edits preserve unknown metadata, empty arrays, custom numeric values and other entries", () => {
  const original = { unknown: { preserve: true }, questions: [{ prompt: "Old", options: ["A", "B"], correct: 0, custom: "Retain" }, { prompt: "Second", custom: 13 }] };
  const edited = setExerciseTemplateField(original, ["questions", 0, "prompt"], "New") as typeof original;
  assert.equal(original.questions[0].prompt, "Old");
  assert.equal(edited.questions[0].prompt, "New");
  assert.deepEqual(edited.unknown, original.unknown);
  assert.equal(edited.questions[0].custom, "Retain");
  assert.deepEqual(edited.questions[1], original.questions[1]);
  assert.deepEqual(setExerciseTemplateField(edited, ["questions"], []), { ...edited, questions: [] });
  const draft = createExerciseTemplateDraft("listening", { maxPlays: 47, custom: { retain: "yes" }, tags: [] });
  assert.equal(draft.maxPlays, 47); assert.deepEqual(draft.tags, []); assert.deepEqual(draft.custom, { retain: "yes" });
});

test("source refinements are executable for diagram layouts and mixed answer cardinality", () => {
  const diagram = createExerciseTemplateDraft("diagram-label");
  assert.ok(validateExerciseTemplateData("diagram-label", diagram).length > 0);
  assert.deepEqual(validateExerciseTemplateData("diagram-label", { ...diagram, image: { src: "/image.png" } }), []);
  assert.ok(validateExerciseTemplateData("diagram-label", { ...diagram, layout: "table", image: { src: "/image.png" } }).length > 0);
  const multiple = createExerciseTemplateDraft("multiple-choice-single-answer");
  assert.ok(validateExerciseTemplateData("multiple-choice-single-answer", multiple).length > 0);
  const questions = (multiple.questions as Record<string, unknown>[]).map((question, index) => ({ ...question, correct: index === 4 ? [0, 2] : 0 }));
  assert.deepEqual(validateExerciseTemplateData("multiple-choice-single-answer", { ...multiple, questions }), []);
});

test("public questions exclude answers, transcript, feedback, unknown metadata and permit public response modes", () => {
  const data = projected("listening", { type: "listening", title: "Notice", audio: { src: "/notice.mp3", hidden: "SECRET" }, transcript: "SECRET", teacherNotes: "SECRET", unknown: "SECRET", questions: [{ prompt: "When?", options: ["One", "Two"], correct: [0, 1], explanation: "SECRET", custom: "SECRET" }] });
  assert.equal(JSON.stringify(data).includes("SECRET"), false);
  assert.deepEqual(data.questions, [{ prompt: "When?", options: ["One", "Two"], responseMode: "multiple" }]);
  assert.deepEqual(data.audio, { src: "/notice.mp3" });
});

test("matching and ordering projections discard encoded answer correspondence", () => {
  assert.deepEqual(projected("match-columns", { pairs: [{ left: "First", right: "Zulu" }, { left: "Second", right: "Alpha" }], distractors: ["Extra"] }), { leftItems: ["First", "Second"], rightItems: ["Alpha", "Extra", "Zulu"] });
  assert.deepEqual(projected("ordering", { items: ["Zulu", "Alpha"] }), { items: ["Alpha", "Zulu"] });
  assert.deepEqual(projected("build-a-sentence", { words: ["Zulu", "Alpha"] }), { words: ["Alpha", "Zulu"] });
  assert.deepEqual(projected("categorize", { categories: ["One", "Two"], items: [{ text: "Zulu", category: "One" }, { text: "Alpha", category: "Two" }] }), { categories: ["One", "Two"], items: [{ text: "Alpha" }, { text: "Zulu" }] });
});

test("typed label counts, masked letters and spoken hidden targets do not expose solutions", () => {
  assert.deepEqual(projected("diagram-label", { labels: ["SECRET", "OTHER"] }), { responseCount: 2 });
  assert.deepEqual(projected("listening-fill-in-blanks", { blanks: ["SECRET"] }), { responseCount: 1 });
  assert.deepEqual(projected("missing-letters", { text: "They {lack|2} {𠮷野|1}." }), { text: "They la__ 𠮷_." });
  assert.equal(projected("pronunciation", { target: "SECRET" }).target, undefined);
  assert.equal(projected("sentence-builds", { target: "SECRET" }).target, undefined);
  assert.equal(projected("read-aloud", { target: "Read me" }).target, "Read me");
});

test("every template projection rejects unknown fields at the public envelope", () => {
  for (const template of EXERCISE_TEMPLATES) {
    const data = createExerciseTemplateDraft(template.id);
    data.teacherNotes = "PRIVATE";
    data.privateExtension = { answer: "PRIVATE" };
    const candidate = projected(template.id, data);
    assert.equal(candidate.teacherNotes, undefined, template.id);
    assert.equal(candidate.privateExtension, undefined, template.id);
  }
  assert.equal(exerciseTemplateById("made-up"), undefined);
});
