/**
 * Word and character counting that works for scripts without inter-word spaces
 * (Chinese, Japanese). Uses `Intl.Segmenter` — dictionary-based segmentation
 * available in modern browsers and Node — falling back to whitespace splitting
 * where it is unavailable.
 */

const hasSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';

const cache = new Map<string, Intl.Segmenter>();

function segmenter(language: string, granularity: 'word' | 'grapheme'): Intl.Segmenter {
  const key = `${language}:${granularity}`;
  let seg = cache.get(key);
  if (!seg) {
    try {
      seg = new Intl.Segmenter(language, { granularity });
    } catch {
      // Invalid/unsupported locale tag — let the runtime pick a default.
      seg = new Intl.Segmenter(undefined, { granularity });
    }
    cache.set(key, seg);
  }
  return seg;
}

/** The word-like tokens of `text`, segmented for the given language. */
export function segmentWords(text: string, language: string): string[] {
  if (!hasSegmenter) return text.split(/\s+/).filter(Boolean);
  return [...segmenter(language, 'word').segment(text)]
    .filter((s) => s.isWordLike)
    .map((s) => s.segment);
}

export function countWords(text: string, language: string): number {
  return segmentWords(text, language).length;
}

/** Counts characters (graphemes), excluding whitespace — CEFR 字数-style counting. */
export function countCharacters(text: string, language: string): number {
  if (!hasSegmenter) return [...text.replace(/\s+/g, '')].length;
  return [...segmenter(language, 'grapheme').segment(text)].filter(
    (s) => !/^\s+$/.test(s.segment),
  ).length;
}
