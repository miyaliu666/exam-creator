import type { CandidatePayload, EnglishTranslation } from "./types";
import { exerciseTemplateById, type ExerciseTemplateField } from "./exercise-template-catalog";

export interface TranslationRow {
  path: string;
  label: string;
  sourceText: string;
  englishText: string;
  status: "current" | "stale" | "missing";
}

const textLabels: Record<string, string> = {
  "/stimulus/text": "Stimulus",
  "/prompt": "Question",
  "/situation": "Situation",
  "/instructions": "Instructions",
  "/sourceMessage": "Source message",
  "/recipient": "Recipient",
  "/purpose": "Purpose",
  "/visiblePromptText": "Prompt",
  "/roles/systemRole": "Examiner role",
  "/roles/candidateRole": "Candidate role",
};

function isReference(value: string) {
  const text = value.trim();
  return /^[\\/]/.test(text) || /^[a-z][a-z\d+.-]*:/i.test(text)
    || /\.(?:mp3|wav|ogg|m4a|aac|mp4|webm|png|jpg|jpeg|gif|svg)(?:[?#].*)?$/i.test(text);
}

function plainLanguage(value: string) {
  return !isReference(value) && (/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{3134f}]/u.test(value)
    || value.trim().split(/\s+/).length > 1);
}

function fieldLabel(path: string, sourceText: string): string | undefined {
  if (textLabels[path]) return textLabels[path];
  const option = /^\/(options|leftItems|rightItems)\/(\d+)\/text$/.exec(path);
  if (option) {
    const labels: Record<string, string> = { options: "Option", leftItems: "Left item", rightItems: "Right item" };
    return `${labels[option[1]]} ${Number(option[2]) + 1}`;
  }
  const field = /^\/(responseFields|fields)\/(\d+)\/(label|placeholder)$/.exec(path);
  if (field) return `${field[1] === "fields" ? "Form field" : "Response field"} ${Number(field[2]) + 1}${field[3] === "placeholder" ? " · Placeholder" : ""}`;
  const point = /^\/requiredContentPoints\/(\d+)\/description$/.exec(path);
  if (point) return `Content point ${Number(point[1]) + 1}`;
  const turn = /^\/paths\/(\d+)\/turns\/(\d+)\/(promptAudioRef|requiredFunctionIds\/\d+)$/.exec(path);
  if (turn && plainLanguage(sourceText)) return `Conversation ${Number(turn[1]) + 1} · ${turn[3] === "promptAudioRef" ? "Prompt" : "Expected action"} ${Number(turn[2]) + 1}`;
  if (path === "/promptAudioRef" && plainLanguage(sourceText)) return "Spoken prompt";
  if ((path === "/sourceProfile" || path.startsWith("/sourceProfile/")) && /\p{Alphabetic}/u.test(sourceText)
    && !path.split("/").slice(2).some((key) => /^(?:id|type|inputType|speaker)$|(?:Id|Ids|Ref|Refs)$/.test(key.replace(/~1/g, "/").replace(/~0/g, "~")))
    && !isReference(sourceText)) return "Source information";
  return undefined;
}

/** Only known human-text fields can become author translation rows. */
export function translationRows(payload: CandidatePayload, translations: readonly EnglishTranslation[] = []): TranslationRow[] {
  const rows: TranslationRow[] = [];
  function addRow(path: string, label: string, value: string) {
    if (!value.trim()) return;
    const entries = translations.filter((entry) => entry.path === path);
    const current = entries.length === 1 && entries[0].sourceText === value && entries[0].englishText.trim() ? entries[0] : undefined;
    rows.push({ path, label, sourceText: value, englishText: current?.englishText ?? "", status: current ? "current" : entries.some((entry) => entry.sourceText !== value) || entries.length > 1 ? "stale" : "missing" });
  }
  if ("exerciseType" in payload) {
    const template = exerciseTemplateById(payload.exerciseType);
    if (!template) return rows;
    if (payload.body.trim()) addRow("/body", "Exercise body", payload.body);
    const technical = new Set(["type", "level", "language", "instructionLanguage", "src", "countBy", "layout", "responseMode"]);
    const escaped = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
    function visitField(field: ExerciseTemplateField, value: unknown, path: string, policyPath: string, label: string) {
      if (technical.has(field.key) || template!.projection.privatePaths.includes(policyPath)) return;
      if (field.type === "string") {
        if (typeof value === "string" && value.trim() && !isReference(value)) addRow(path, label, value);
      } else if (field.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
        const object = value as Record<string, unknown>;
        for (const child of field.properties ?? []) visitField(child, object[child.key], `${path}/${escaped(child.key)}`, `${policyPath}.${child.key}`, `${label} · ${child.label}`);
      } else if (field.type === "array" && Array.isArray(value) && field.element) {
        value.forEach((entry, index) => visitField(field.element!, entry, `${path}/${index}`, `${policyPath}.*`, `${label} ${index + 1}`));
      } else if (field.type === "union") {
        const variant = field.variants?.find(entry => entry.type === "array" ? Array.isArray(value) : entry.type === "object" ? !!value && typeof value === "object" && !Array.isArray(value) : typeof value === entry.type);
        if (variant) visitField(variant, value, path, policyPath, label);
      }
    }
    for (const field of template.fields) visitField(field, payload.data[field.key], `/data/${escaped(field.key)}`, field.key, field.label);
    // These public values replace source fields that encode private correspondence or order.
    const synthetic: Record<string, [string, string][]> = {
      "independent-columns": [["leftItems", "Left item"], ["rightItems", "Right item"]],
      "unordered-items": [["items", "Item"]],
      "unordered-words": [["words", "Word"]],
    };
    for (const [key, label] of synthetic[template.projection.transform] ?? []) {
      const values = payload.data[key];
      if (Array.isArray(values)) values.forEach((value, index) => { if (typeof value === "string" && value.trim() && !isReference(value)) addRow(`/data/${key}/${index}`, `${label} ${index + 1}`, value); });
    }
    if (template.projection.transform === "masked-letters" && typeof payload.data.text === "string" && !/\{[^|{}]+\|\d+\}/.test(payload.data.text) && !isReference(payload.data.text)) addRow("/data/text", "Text", payload.data.text);
    return rows;
  }
  function visit(value: unknown, path: string) {
    if (typeof value === "string" && value.trim()) {
      const label = fieldLabel(path, value);
      if (!label) return;
      addRow(path, label, value);
    } else if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}/${index}`));
    } else if (value && typeof value === "object") {
      Object.entries(value).forEach(([key, entry]) => visit(entry, `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`));
    }
  }
  visit(payload, "");
  return rows;
}

export function updateEnglishTranslation(payload: CandidatePayload, translations: readonly EnglishTranslation[] | undefined, path: string, englishText: string): EnglishTranslation[] {
  const row = translationRows(payload).find((entry) => entry.path === path);
  if (!row) return [...(translations ?? [])];
  return [...(translations ?? []).filter((entry) => entry.path !== path), { path, sourceText: row.sourceText, englishText }];
}
