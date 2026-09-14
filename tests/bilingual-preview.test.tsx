import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { AuthorPreview } from "../client/features/language-items/author-preview";
import { translationRows, updateEnglishTranslation } from "../client/features/language-items/english-translations";
import { ITEM_TEMPLATE_REGISTRY } from "../client/features/language-items/item-template-registry";
import { CandidateRenderer } from "../client/features/language-items/renderer-registry";
import { createExerciseTemplateDraft, EXERCISE_TEMPLATES, type ExerciseTemplateField } from "../client/features/language-items/exercise-template-catalog";
import { projectExerciseTemplateCandidate } from "../client/features/language-items/exercise-template-projection";
import type { CandidatePayload, EnglishTranslation, SingleSelectCandidatePayload } from "../client/features/language-items/types";

const stimulus = { text: "请看时间表。", imageRefs: [], audioRef: null };
const productive = { situation: "你是新同学。", instructions: "请介绍自己。" };
const points = [{ contentPointId: "P1", description: "说出姓名。" }];
const payloads: Record<string, CandidatePayload> = {
  "IF-SINGLE-SELECT": { stimulus, prompt: "几点上课？", options: [{ optionId: "A", text: "九点", imageRef: null }, { optionId: "B", text: "十点", imageRef: null }], shuffleOptions: false },
  "IF-MATCHING": { stimulus, prompt: "请配对。", leftItems: [{ itemId: "L1", text: "早上", imageRef: null }], rightItems: [{ itemId: "R1", text: "早上好", imageRef: null }], shuffleRightItems: true, allowRightItemReuse: false },
  "IF-RESTRICTED-INPUT": { stimulus, prompt: "你叫什么名字？", responseFields: [{ responseId: "F1", label: "姓名", inputType: "shortText", maxLength: 12, placeholder: "请输入姓名" }] },
  "IF-FORM-ENTRY": { ...productive, sourceProfile: { person: { name: "王明", details: { "home/address": "北京" }, personId: "PRIVATE-ID" } }, fields: [{ fieldId: "F1", label: "姓名", inputType: "shortText", required: true, maxLength: 20, placeholder: "请输入姓名" }] },
  "IF-TYPED-MESSAGE": { ...productive, sourceMessage: "你好！", sourceMaterialRefs: [], recipient: "同学", purpose: "问好", requiredContentPoints: points, lengthGuidance: { countBy: "characters", minimum: 10, maximum: 40 } },
  "IF-SPOKEN-SINGLE": { ...productive, visiblePromptText: "你叫什么名字？", promptAudioRef: "请介绍你自己。", sourceMaterialRefs: [], recipient: "同学", purpose: "问好", preparationTimeSeconds: 20, responseTimeSeconds: 60, requiredContentPoints: points },
  "IF-SPOKEN-MULTITURN": { ...productive, roles: { systemRole: "老师", candidateRole: "学生" }, interactionMode: "fixed", startPathId: "PATH-1", routingRuleId: "fixed", paths: [{ pathId: "PATH-1", turns: [
    { turnId: "T1", speaker: "system", promptAudioRef: "你叫什么名字？", responseId: null, responseTimeSeconds: null, requiredFunctionIds: [] },
    { turnId: "T2", speaker: "candidate", promptAudioRef: null, responseId: "R1", responseTimeSeconds: 45, requiredFunctionIds: ["说出姓名。", "PF-A1-001"] },
  ] }] },
};

function filledField(field: ExerciseTemplateField): unknown {
  if (field.type === "string") return field.key === "src" ? "/media/example.mp3" : "请阅读材料。";
  if (field.type === "object") return Object.fromEntries((field.properties ?? []).map(child => [child.key, filledField(child)]));
  if (field.type === "array") return field.element ? Array.from({ length: Math.max(1, field.minItems ?? 0) }, () => filledField(field.element!)) : [];
  if (field.type === "union") return field.variants?.[0] ? filledField(field.variants[0]) : "";
  return field.default ?? field.values?.[0] ?? (field.type === "boolean" ? false : 0);
}
for (const template of EXERCISE_TEMPLATES) {
  const data = { ...createExerciseTemplateDraft(template.id), ...Object.fromEntries(template.fields.map(field => [field.key, filledField(field)])), type: template.id, language: "zh", instructionLanguage: "en", title: "阅读材料", level: "A1" };
  payloads[`EXERCISE:${template.id}`] = projectExerciseTemplateCandidate({ exerciseType: template.id, body: "请根据材料完成任务。", data });
}

for (const template of ITEM_TEMPLATE_REGISTRY) {
  test(`${template.itemFormatId}: bilingual author view includes each text field; candidate renderer has no English metadata`, () => {
    const payload = payloads[template.itemFormatId];
    const rows = translationRows(payload);
    const translations = rows.map((row, index) => ({ path: row.path, sourceText: row.sourceText, englishText: `Author-only English ${index}` }));
    assert.ok(rows.length > 1);
    const original = structuredClone(payload);
    const author = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AuthorPreview rendererId={template.rendererId} payload={payload} englishTranslations={translations} /></ChakraProvider>);
    const candidate = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><CandidateRenderer rendererId={template.rendererId} payload={payload} /></ChakraProvider>);
    for (const translation of translations) assert.ok(author.includes(translation.englishText));
    assert.match(author, /Bilingual/);
    assert.doesNotMatch(author, /\/candidatePayload|\/options\/|\/paths\//);
    assert.doesNotMatch(candidate, /Author-only English|englishTranslations|Bilingual/);
    assert.deepEqual(payload, original);
  });
}

test("edited/reordered Chinese never shows a previous English translation as current", () => {
  const payload = structuredClone(payloads["IF-SINGLE-SELECT"]) as SingleSelectCandidatePayload;
  const translations: EnglishTranslation[] = [
    { path: "/options/0/text", sourceText: "九点", englishText: "Nine o'clock" },
    { path: "/options/1/text", sourceText: "十点", englishText: "Ten o'clock" },
  ];
  payload.options.reverse();
  const rows = translationRows(payload, translations).filter((row) => row.path.startsWith("/options/"));
  assert.ok(rows.every((row) => row.status === "stale" && row.englishText === ""));
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AuthorPreview rendererId="REN-SINGLE-SELECT" payload={payload} englishTranslations={translations} /></ChakraProvider>);
  assert.match(markup, /Translation needs updating/);
  assert.doesNotMatch(markup, /Nine o|Ten o/);
  const updated = updateEnglishTranslation(payload, translations, "/options/0/text", "Ten o'clock");
  assert.equal(translationRows(payload, updated).find((row) => row.path === "/options/0/text")?.status, "current");
  assert.equal(updated.find((row) => row.path === "/options/0/text")?.sourceText, "十点");
  assert.equal(translations[0].sourceText, "九点");
});

test("malformed, duplicate, private, ID and media translation fields are excluded", () => {
  const payload = payloads["IF-SPOKEN-MULTITURN"];
  const paths = translationRows(payload).map((row) => row.path);
  assert.ok(paths.includes("/paths/0/turns/0/promptAudioRef"));
  assert.ok(paths.includes("/paths/0/turns/1/requiredFunctionIds/0"));
  assert.ok(!paths.includes("/paths/0/turns/1/requiredFunctionIds/1"));
  assert.ok(!paths.some((path) => /speaker|turnId|pathId|routingRuleId/.test(path)));
  const duplicate = { path: "/situation", sourceText: "你是新同学。", englishText: "OLD ENGLISH" };
  assert.equal(translationRows(payload, [duplicate, duplicate]).find((row) => row.path === "/situation")?.englishText, "");
  assert.deepEqual(updateEnglishTranslation(payload, [], "/reviewPackage/notes", "PRIVATE ENGLISH"), []);
  const sourceProfile = translationRows(payloads["IF-FORM-ENTRY"]);
  assert.ok(sourceProfile.some((row) => row.path === "/sourceProfile/person/details/home~1address"));
  assert.ok(!sourceProfile.some((row) => row.sourceText === "PRIVATE-ID"));
});

test("legacy untranslated items keep their original candidate preview", () => {
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><AuthorPreview rendererId="REN-SINGLE-SELECT" payload={payloads["IF-SINGLE-SELECT"]} /></ChakraProvider>);
  assert.match(markup, /几点上课/);
  assert.doesNotMatch(markup, /Bilingual|Translation unavailable/);
});

test("generic translations collect nested public content while excluding answers, source metadata and unknown fields", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "listening", body: "请听录音。", data: { title: "课程通知", language: "zh", level: "A1", audio: { src: "/notice.mp3", alt: "课程通知录音" }, transcript: "PRIVATE_TRANSCRIPT", teacherNotes: "PRIVATE_NOTES", questions: [{ prompt: "几点上课？", options: ["九点", "十点"], correct: 0, explanation: "PRIVATE_EXPLANATION" }] } });
  payload.data.transcript = "PRIVATE_TRANSCRIPT";
  payload.data.unknown = "PRIVATE_EXTENSION";
  const rows = translationRows(payload);
  for (const path of ["/body", "/data/title", "/data/audio/alt", "/data/questions/0/prompt", "/data/questions/0/options/0", "/data/questions/0/options/1"]) assert.ok(rows.some(row => row.path === path), path);
  assert.ok(!rows.some(row => /correct|explanation|transcript|unknown|\/src$|\/language$|\/level$/.test(row.path)));
  assert.ok(!rows.some(row => row.sourceText.includes("PRIVATE")));
  assert.deepEqual(updateEnglishTranslation(payload, [], "/data/transcript", "Leaked answer"), []);
});

test("generic translations follow projected ordering and reject stale nested text", () => {
  const payload = projectExerciseTemplateCandidate({ exerciseType: "match-columns", body: "", data: { pairs: [{ left: "早上", right: "早上好" }, { left: "晚上", right: "晚上好" }] } });
  assert.equal(translationRows(payload).length, 4);
  const path = "/data/rightItems/0";
  const translated = updateEnglishTranslation(payload, [], path, "Good morning");
  (payload.data.rightItems as string[])[0] = "再见";
  assert.equal(translationRows(payload, translated).find(row => row.path === path)?.status, "stale");
  assert.equal(translationRows(payload, translated).find(row => row.path === path)?.englishText, "");
  assert.ok(!translationRows(payload).some(row => row.path.includes("pairs")));
});
