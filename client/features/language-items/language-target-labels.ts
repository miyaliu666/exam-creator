import { CHARACTER_GLOSSES, LEXICAL_GLOSSES } from "./language-target-glosses.ts";
import { LANGUAGE_TARGET_RULE_LABELS } from "./language-target-rule-labels.ts";

interface LanguageTargetOption {
  id: string;
  kind: string;
  label: string;
  englishGloss?: string;
  pattern?: string;
  meaning?: string;
  pinyin?: string;
}

export interface LanguageTargetLabel {
  primary: string;
  english?: string;
  pattern?: string;
}

function legacyTargetLabel(option: LanguageTargetOption): LanguageTargetLabel {
  const label = option.label.trim();
  const form = label.split(" · ")[0];
  const glosses = option.kind === "lexical" ? LEXICAL_GLOSSES
    : option.kind === "character" ? CHARACTER_GLOSSES : undefined;
  const bundledId = option.kind === "lexical" ? /^LEX-A1-\d{4}$/.test(option.id) : /^CHAR-A1-\d{4}$/.test(option.id);
  if (bundledId && glosses && Object.hasOwn(glosses, form)) {
    return { primary: label, english: glosses[form] };
  }
  const rule = LANGUAGE_TARGET_RULE_LABELS.find((entry) =>
    entry.id === option.id && [entry.chinese, entry.english].includes(form));
  if (rule) return { primary: rule.chinese, english: rule.english, pattern: rule.pattern };
  // A renamed or custom rule must keep its authored meaning instead of inheriting a stale gloss.
  return { primary: option.label };
}

export function languageTargetLabel(option: LanguageTargetOption): LanguageTargetLabel {
  const result = legacyTargetLabel(option);
  // Explicit metadata, including a cleared field, takes precedence over bundled display hints.
  if (option.englishGloss !== undefined) {
    if (option.englishGloss.trim()) result.english = option.englishGloss.trim();
    else delete result.english;
  }
  if (option.pattern !== undefined) {
    if (option.pattern.trim()) result.pattern = option.pattern.trim();
    else delete result.pattern;
  }
  return result;
}

export function languageTargetDisplayText(option: LanguageTargetOption): string {
  const { primary, english, pattern } = languageTargetLabel(option);
  return [primary, option.meaning, english, pattern].filter(Boolean).join(" / ");
}

export function languageTargetMatchesSearch(option: LanguageTargetOption, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase();
  return !normalized || [languageTargetDisplayText(option), option.meaning, option.pinyin].filter(Boolean).join(" / ").toLocaleLowerCase().includes(normalized);
}
