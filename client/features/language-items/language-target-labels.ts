import { CHARACTER_GLOSSES, LEXICAL_GLOSSES } from "./language-target-glosses.ts";
import { LANGUAGE_TARGET_RULE_LABELS } from "./language-target-rule-labels.ts";

interface LanguageTargetOption {
  id: string;
  kind: string;
  label: string;
}

export interface LanguageTargetLabel {
  primary: string;
  english?: string;
  pattern?: string;
}

export function languageTargetLabel(option: LanguageTargetOption): LanguageTargetLabel {
  const label = option.label.trim();
  const form = label.split(" · ")[0];
  const glosses = option.kind === "lexical" ? LEXICAL_GLOSSES
    : option.kind === "character" ? CHARACTER_GLOSSES : undefined;
  if (glosses && Object.hasOwn(glosses, form)) {
    return { primary: label, english: glosses[form] };
  }
  const rule = LANGUAGE_TARGET_RULE_LABELS.find((entry) =>
    entry.id === option.id && [entry.chinese, entry.english].includes(form));
  if (rule) return { primary: rule.chinese, english: rule.english, pattern: rule.pattern };
  // A renamed or custom rule must keep its authored meaning instead of inheriting a stale gloss.
  return { primary: option.label };
}

export function languageTargetDisplayText(option: LanguageTargetOption): string {
  const { primary, english, pattern } = languageTargetLabel(option);
  return [primary, english, pattern].filter(Boolean).join(" / ");
}

export function languageTargetMatchesSearch(option: LanguageTargetOption, search: string): boolean {
  const normalized = search.trim().toLocaleLowerCase();
  return !normalized || languageTargetDisplayText(option).toLocaleLowerCase().includes(normalized);
}
