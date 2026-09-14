import type { Answer, MatchingOptions, Script } from './schema';

const DEFAULT_MATCHING: MatchingOptions = {
  caseSensitive: false,
  accentSensitive: false,
  punctuationSensitive: false,
};

/** Matching options with the script resolved, ready for `normalize`. */
export type EffectiveMatching = MatchingOptions & { script: Script };

/**
 * Infers the writing system from a BCP-47 tag. An explicit script subtag wins
 * (zh-Hans, sr-Cyrl); otherwise the primary language decides. Unknown → Latin.
 */
export function scriptForLanguage(language: string): Script {
  const lang = language.toLowerCase();
  if (/-han[st]|-hani/.test(lang)) return 'cjk';
  if (lang.includes('-cyrl')) return 'cyrillic';
  if (lang.includes('-latn')) return 'latin';
  if (lang.includes('-arab')) return 'arabic';
  if (lang.includes('-hebr')) return 'hebrew';

  const primary = lang.split('-')[0];
  const byLang: Record<string, Script> = {
    zh: 'cjk', ja: 'cjk', ko: 'cjk',
    ru: 'cyrillic', uk: 'cyrillic', be: 'cyrillic', bg: 'cyrillic', mk: 'cyrillic', sr: 'cyrillic',
    ar: 'arabic', fa: 'arabic', ur: 'arabic', ps: 'arabic',
    he: 'hebrew', yi: 'hebrew',
  };
  return byLang[primary] ?? 'latin';
}

/** Writing direction for a language, used to set `dir` on rendered content. */
export function directionForLanguage(language: string): 'ltr' | 'rtl' {
  const script = scriptForLanguage(language);
  return script === 'arabic' || script === 'hebrew' ? 'rtl' : 'ltr';
}

/** Fills in script (from `language` unless overridden) and the shared defaults. */
export function resolveMatching(
  language: string,
  matching: Partial<MatchingOptions> = {},
): EffectiveMatching {
  const script = matching.script ?? scriptForLanguage(language);
  return { ...DEFAULT_MATCHING, ...matching, script };
}

// Combining-mark ranges, targeted per script so we never strip a mark that
// forms a distinct letter in that script.
const LATIN_DIACRITIC = /\p{Diacritic}/gu;
const ARABIC_MARKS = /[ؐ-ؚـً-ٰٟۖ-ۭ]/g; // tashkeel + tatweel
const HEBREW_POINTS = /[֑-ׇֽֿׁׂׅׄ]/g; // niqqud + cantillation
// Latin, CJK and Arabic/Hebrew sentence punctuation, unioned so it is stripped
// regardless of script when punctuation is not significant.
const PUNCTUATION =
  /[.,!?;:'"¿¡«»“”‘’\-–—、。！？，；：「」『』（）〈〉《》【】・…،؟؛۔]/g;

const katakanaToHiragana = (s: string) =>
  s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

const foldArabicLetters = (s: string) =>
  s.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

/**
 * Normalizes an answer for comparison, applying script-aware leniency. Direct
 * callers that omit `script` get Latin behavior, preserving the original
 * contract; templates pass a resolved option set via `resolveMatching`.
 */
export function normalize(
  value: string,
  opts: Partial<MatchingOptions> & { script?: Script } = {},
): string {
  const o = { ...DEFAULT_MATCHING, script: 'latin' as Script, ...opts };
  let s = value.trim().replace(/\s+/g, ' ');

  switch (o.script) {
    case 'latin':
      if (!o.caseSensitive) s = s.toLocaleLowerCase();
      if (!o.accentSensitive) s = s.normalize('NFD').replace(LATIN_DIACRITIC, '');
      break;

    case 'cyrillic':
      // NFC keeps й/ё/ї composed; their marks are letters, never stripped.
      s = s.normalize('NFC');
      if (!o.caseSensitive) s = s.toLocaleLowerCase();
      if (o.foldYo) s = s.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
      break;

    case 'cjk':
      // Width/compatibility folding is almost always wanted; opt out with foldWidth:false.
      s = s.normalize(o.foldWidth === false ? 'NFC' : 'NFKC');
      if (o.foldKana) s = katakanaToHiragana(s);
      // CJK text has no significant inter-word spacing, unlike the scripts
      // above where a space separates words. Any space here is noise — a
      // stray IME artifact, an accidental keystroke, a copy-paste seam —
      // never part of the answer, so it is dropped rather than just
      // collapsed to one (which the shared final step below still does for
      // every other script, where spaces are meaningful).
      s = s.replace(/\s+/g, '');
      break;

    case 'arabic':
      s = s.normalize('NFC');
      if (o.stripHarakat !== false) s = s.replace(ARABIC_MARKS, '');
      if (o.foldAlef) s = foldArabicLetters(s);
      break;

    case 'hebrew':
      s = s.normalize('NFC');
      if (o.stripNiqqud !== false) s = s.replace(HEBREW_POINTS, '');
      break;
  }

  if (!o.punctuationSensitive) s = s.replace(PUNCTUATION, '');
  return s.replace(/\s+/g, ' ').trim();
}

export function answerValue(a: Answer): string {
  return typeof a === 'string' ? a : a.value;
}

export function answerAlternatives(a: Answer): string[] {
  return typeof a === 'string' ? [] : a.alternatives;
}

export function answerHint(a: Answer): string | undefined {
  return typeof a === 'string' ? undefined : a.hint;
}

export function answerExplanation(a: Answer): string | undefined {
  return typeof a === 'string' ? undefined : a.explanation;
}

/** True when `input` matches the answer or any of its alternatives. */
export function isCorrect(
  input: string,
  expected: Answer,
  opts?: Partial<MatchingOptions> & { script?: Script },
): boolean {
  const candidates = [answerValue(expected), ...answerAlternatives(expected)];
  const normalizedInput = normalize(input, opts);
  if (!normalizedInput) return false;
  return candidates.some((c) => normalize(c, opts) === normalizedInput);
}

export function correctIndices(correct: number | number[]): number[] {
  return Array.isArray(correct) ? correct : [correct];
}

/** Set-equality on selected option indices, so order of clicking is irrelevant. */
export function selectionIsCorrect(selected: number[], correct: number | number[]): boolean {
  const want = new Set(correctIndices(correct));
  if (selected.length !== want.size) return false;
  return selected.every((i) => want.has(i));
}

export type Score = { correct: number; total: number };

export function percentage({ correct, total }: Score): number {
  return total === 0 ? 0 : Math.round((correct / total) * 100);
}

/** Deterministic shuffle so a page looks the same across re-renders. */
export function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const next = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return Math.abs(h) / 2 ** 31;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
