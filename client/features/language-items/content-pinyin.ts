import type { ContentIdOption } from "./types";
import { contentLanguage } from "./content-language";

export function hasChineseContentName(entry: Pick<ContentIdOption, "kind" | "label" | "language">): boolean {
  return contentLanguage(entry) === "zh" && ["lexical", "character"].includes(entry.kind) && /\p{Script=Han}/u.test(entry.label);
}

export function canGenerateContentPinyin(entry: Pick<ContentIdOption, "kind" | "label" | "pinyin" | "language">): boolean {
  return hasChineseContentName(entry) && !entry.pinyin?.trim();
}

export async function generateMissingContentPinyin(entries: ContentIdOption[]): Promise<ContentIdOption[]> {
  if (!entries.some(canGenerateContentPinyin)) return entries;
  // Load the dictionary only for Chinese entries; conversion never sends content to a provider.
  const { pinyin } = await import("pinyin-pro");
  return entries.map((entry) => {
    if (!canGenerateContentPinyin(entry)) return entry;
    const generated = pinyin(entry.label.trim(), { toneType: "symbol", nonZh: "consecutive" }).trim();
    // An unrecognised character must remain editable rather than masquerade as generated pinyin.
    if (!generated || /\p{Script=Han}/u.test(generated)) return entry;
    return { ...entry, pinyin: generated };
  });
}
