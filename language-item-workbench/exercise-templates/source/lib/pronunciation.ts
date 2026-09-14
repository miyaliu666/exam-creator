import { answerAlternatives, answerValue, normalize, resolveMatching } from './grading';
import { segmentWords } from './segment';
import type { Answer, MatchingOptions } from './schema';

export type WordMark = { word: string; hit: boolean };
export type ReadAloudResult = { score: number; total: number; marks: WordMark[] };

/**
 * Speech recognition commonly "smart formats" spoken numbers and clock times
 * into digit form — "nine o'clock" is heard as "9:00", "ocho" as "8", "九" as
 * "9" — even when the student said exactly what the target asked for.
 * Comparing word-for-word against a spelled-out target would then mark a
 * correct reading wrong (issue #5), so both sides are passed through this
 * per-language canonicalization before comparison. Covers the small numbers
 * (clock hours, simple quantities) actually used in this repo's content, not
 * full numeral parsing — extend the tables below if a new language/range
 * needs it. Keys are post-`normalize()` forms (lowercased, punctuation
 * stripped), since that's what callers pass in.
 */
const NUMBER_WORDS: Record<string, Record<string, string>> = {
  en: {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
    eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50',
  },
  es: {
    cero: '0', uno: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6',
    siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12',
    trece: '13', catorce: '14', quince: '15', veinte: '20', treinta: '30',
  },
  zh: {
    零: '0', 一: '1', 二: '2', 两: '2', 三: '3', 四: '4', 五: '5', 六: '6', 七: '7',
    八: '8', 九: '9', 十: '10', 十一: '11', 十二: '12',
  },
};

/** Words meaning "on the hour" (:00) in a spoken time. Only needed for
 *  languages (English) whose digit form fuses the hour and minutes into one
 *  "H:MM"-shaped token instead of keeping a separate word for it — Spanish
 *  and Chinese clock times digitize the hour in place and leave the rest of
 *  the phrase as-is, so they need no equivalent entry here. */
const HOUR_MARKER: Record<string, string> = {
  en: 'oclock', // normalize() strips the apostrophe from "o'clock"
};

function canonicalizeNumberWord(word: string, language: string): string {
  const primary = language.toLowerCase().split('-')[0];
  const numbers = NUMBER_WORDS[primary];
  if (numbers && word in numbers) return numbers[word];
  if (HOUR_MARKER[primary] === word) return '00';
  return word;
}

/**
 * Indices of `a` that participate in a longest common subsequence with `b`.
 * Used to align the target words against what the recognizer heard, tolerating
 * dropped, inserted and misheard words.
 */
function lcsTargetIndices(a: string[], b: string[]): number[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const indices: number[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      indices.push(i);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return indices;
}

/**
 * Scores a read-aloud attempt: what fraction of the target's words the speech
 * recognizer heard, in order. Comparison is script-aware (same normalization
 * and segmentation as typed answers), so accents/harakat/width fold the same
 * way. This measures reading accuracy, not phoneme-level pronunciation.
 */
export function scoreReadAloud(
  target: string,
  heard: string,
  language: string,
  matching?: Partial<MatchingOptions>,
): ReadAloudResult {
  const opts = resolveMatching(language, matching);
  const targetWords = segmentWords(target, language);
  const targetNorm = targetWords.map((w) => canonicalizeNumberWord(normalize(w, opts), language));
  const heardNorm = segmentWords(heard, language).map((w) =>
    canonicalizeNumberWord(normalize(w, opts), language),
  );

  const matched = new Set(lcsTargetIndices(targetNorm, heardNorm));
  const marks = targetWords.map((word, i) => ({ word, hit: matched.has(i) }));
  return { score: matched.size, total: targetWords.length, marks };
}

/**
 * True when a short spoken answer (transcribed by speech recognition)
 * contains the expected answer or one of its alternatives. Uses a substring
 * check rather than exact equality, so filler words around the actual answer
 * ("um, a waiter") don't count against the student the way they would for a
 * full read-aloud attempt.
 */
export function scoreShortAnswer(
  heard: string,
  expected: Answer,
  language: string,
  matching?: Partial<MatchingOptions>,
): boolean {
  const opts = resolveMatching(language, matching);
  const normalizedHeard = normalize(heard, opts);
  if (!normalizedHeard) return false;
  const candidates = [answerValue(expected), ...answerAlternatives(expected)];
  return candidates.some((c) => {
    const norm = normalize(c, opts);
    return norm.length > 0 && normalizedHeard.includes(norm);
  });
}
