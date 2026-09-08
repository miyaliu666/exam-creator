import type { CandidatePayload, EnglishTranslation } from "./types";

export interface TranslationRow {
  path: string;
  label: string;
  sourceText: string;
  englishText: string;
  status: "current" | "stale" | "missing";
}

const textLabels: Record<string, string> = {
  "/stimulus/text": "材料 / Stimulus",
  "/prompt": "题干 / Question",
  "/situation": "情境 / Situation",
  "/instructions": "作答要求 / Instructions",
  "/sourceMessage": "原始消息 / Source message",
  "/recipient": "接收者 / Recipient",
  "/purpose": "目的 / Purpose",
  "/visiblePromptText": "提示 / Prompt",
  "/roles/systemRole": "考官角色 / Examiner role",
  "/roles/candidateRole": "考生角色 / Candidate role",
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
    const labels: Record<string, string> = { options: "选项 / Option", leftItems: "左栏 / Left item", rightItems: "右栏 / Right item" };
    return `${labels[option[1]]} ${Number(option[2]) + 1}`;
  }
  const field = /^\/(responseFields|fields)\/(\d+)\/(label|placeholder)$/.exec(path);
  if (field) return `${field[1] === "fields" ? "表单项 / Form field" : "回答项 / Response field"} ${Number(field[2]) + 1}${field[3] === "placeholder" ? " · 占位提示 / Placeholder" : ""}`;
  const point = /^\/requiredContentPoints\/(\d+)\/description$/.exec(path);
  if (point) return `内容要点 / Content point ${Number(point[1]) + 1}`;
  const turn = /^\/paths\/(\d+)\/turns\/(\d+)\/(promptAudioRef|requiredFunctionIds\/\d+)$/.exec(path);
  if (turn && plainLanguage(sourceText)) return `对话 / Conversation ${Number(turn[1]) + 1} · ${turn[3] === "promptAudioRef" ? "提示 / Prompt" : "预期回答 / Expected action"} ${Number(turn[2]) + 1}`;
  if (path === "/promptAudioRef" && plainLanguage(sourceText)) return "口头提示 / Spoken prompt";
  if ((path === "/sourceProfile" || path.startsWith("/sourceProfile/")) && /\p{Alphabetic}/u.test(sourceText)
    && !path.split("/").slice(2).some((key) => /^(?:id|type|inputType|speaker)$|(?:Id|Ids|Ref|Refs)$/.test(key.replace(/~1/g, "/").replace(/~0/g, "~")))
    && !isReference(sourceText)) return "来源信息 / Source information";
  return undefined;
}

/** Only known human-text fields can become author translation rows. */
export function translationRows(payload: CandidatePayload, translations: readonly EnglishTranslation[] = []): TranslationRow[] {
  const rows: TranslationRow[] = [];
  function visit(value: unknown, path: string) {
    if (typeof value === "string" && value.trim()) {
      const label = fieldLabel(path, value);
      if (!label) return;
      const entries = translations.filter((entry) => entry.path === path);
      const current = entries.length === 1 && entries[0].sourceText === value && entries[0].englishText.trim() ? entries[0] : undefined;
      rows.push({ path, label, sourceText: value, englishText: current?.englishText ?? "", status: current ? "current" : entries.some((entry) => entry.sourceText !== value) || entries.length > 1 ? "stale" : "missing" });
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
