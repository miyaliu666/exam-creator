import { scriptForLanguage } from './grading';

/**
 * One button in the character-helper bar. `label` is what the student sees
 * (combining marks are shown on a dotted circle ◌ so they are visible), and
 * `insert` is the string actually put into the field.
 */
export type HelperKey = { label: string; insert: string };

const keys = (chars: string): HelperKey[] => [...chars].map((c) => ({ label: c, insert: c }));
const marks = (chars: string): HelperKey[] =>
  [...chars].map((c) => ({ label: `◌${c}`, insert: c }));

// Arabic harakat (tashkeel) and letters students often can't type directly.
const ARABIC =
  keys('أإآءؤئةى').concat(marks('ًٌٍَُِّْٰ'));

// Hebrew niqqud vowel points.
const HEBREW = keys('אהוי').concat(
  marks('ְִֵֶַָֹֻּׁׂ'),
);

const byLanguage: Record<string, HelperKey[]> = {
  fr: keys('àâæçéèêëîïôœùûüÿ'),
  de: keys('äöüßÄÖÜ'),
  es: keys('áéíóúñü¿¡'),
  pt: keys('áâãàçéêíóôõú'),
  it: keys('àèéìíòóù'),
  ru: keys('ёйъыэюяЁ'),
  uk: keys('іїєґІЇ'),
  be: keys('ёіўъЁ'),
  ar: ARABIC,
  fa: ARABIC.concat(keys('پچژگ')),
  ur: ARABIC.concat(keys('ٹڈڑںھ')),
  he: HEBREW,
};

/**
 * Characters worth offering for a language — accents, letters or diacritics a
 * student's physical keyboard may lack. Empty for languages typed via an IME
 * (Chinese, Japanese, Korean), which hides the bar entirely.
 */
export function helpersFor(language: string): HelperKey[] {
  const primary = language.toLowerCase().split('-')[0];
  if (byLanguage[primary]) return byLanguage[primary];
  // Fall back to a script-level default so unlisted RTL tags still get help.
  const script = scriptForLanguage(language);
  if (script === 'arabic') return ARABIC;
  if (script === 'hebrew') return HEBREW;
  return [];
}
