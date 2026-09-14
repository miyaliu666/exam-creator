export const CONTENT_LANGUAGE_OPTIONS = [
  { id: "zh", label: "Chinese" },
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
] as const;

export type ContentLanguage = typeof CONTENT_LANGUAGE_OPTIONS[number]["id"];

const LANGUAGE_ALIASES: Record<string, ContentLanguage> = {
  zh: "zh", chinese: "zh", 中文: "zh", 汉语: "zh", 漢語: "zh", "zh-cn": "zh", "zh-hans": "zh",
  en: "en", english: "en", 英语: "en", 英語: "en",
  es: "es", spanish: "es", español: "es", espanol: "es", 西班牙语: "es", 西班牙語: "es",
};

export function parseContentLanguage(input: string): ContentLanguage | undefined {
  const key = input.trim().toLowerCase();
  return Object.hasOwn(LANGUAGE_ALIASES, key) ? LANGUAGE_ALIASES[key] : undefined;
}

export function contentLanguage(entry: { language?: unknown }): string {
  // Existing registries predate the language field and contain Chinese content.
  if (entry.language === undefined) return "zh";
  const value = typeof entry.language === "string" ? entry.language.trim() : String(entry.language);
  return parseContentLanguage(value) ?? value;
}

export function contentLanguageLabel(value: string): string {
  const code = parseContentLanguage(value);
  return CONTENT_LANGUAGE_OPTIONS.find((option) => option.id === code)?.label ?? (value || "Unknown language");
}
