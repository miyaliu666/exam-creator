import { useMemo, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

const TOKEN = /\{([^|{}]+)\|(\d+)\}/g;

type Part = { type: 'text'; value: string } | { type: 'word'; full: string; given: number };

/** Splits "... they {lack|2} knowledge ..." into text/word parts, in order. */
function parseParts(text: string): Part[] {
  const parts: Part[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
    parts.push({ type: 'word', full: m[1], given: Number(m[2]) });
    lastIndex = m.index! + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
  return parts;
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Type the missing letters to complete the passage below. The first and last ' +
    'sentences are complete; some words in between are missing letters, shown as ' +
    'empty boxes.',
  es:
    'Escribe las letras que faltan para completar el texto a continuación. La ' +
    'primera y la última frase están completas; a algunas palabras intermedias ' +
    'les faltan letras, mostradas como casillas vacías.',
  zh: '请填入缺失的字母，补全下面的文章。第一句和最后一句是完整的；中间部分的一些单词缺少字母，用空白框表示。',
};

/** The "For teachers" panel is fixed — it describes the Type the Missing
 *  Letters task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests reading comprehension and vocabulary knowledge: whether the ' +
  'student can infer a missing word from context and spell it correctly, using ' +
  'the surrounding sentence and the letters already given as clues.';
/** Paraphrases the CEFR's own "Vocabulary Range" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.16). */
const LEVEL_NOTES =
  'A1: Nearly all letters given; one letter missing from a very common word.\n' +
  'A2: Most letters given, one or two missing.\n' +
  'B1: A larger portion missing, requiring more inference from context.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Lower-frequency vocabulary; most of the word completed from context and given letters.\n' +
  'C2: Rare or specialized vocabulary, inferred almost entirely from context.';
const NOTES =
  'Only words in the sentences between the first and last should have missing ' +
  'letters. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student reads a short passage in which the first and last sentences are ' +
  'complete, but some words in the sentences between them are missing letters; ' +
  'the student types the missing letters to complete each word.';
const LENGTH_TEXT = 'Passage up to 100 words, with 6-10 missing words.';

/**
 * Each partial word is rendered as given (pre-filled, disabled) letter boxes
 * followed by empty single-character inputs for the missing letters. Typing
 * a character auto-advances focus to the next box within the same word.
 */
export default function MissingLetters({ data, body, languageSwitch }: TemplateProps<'missing-letters'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const parts = useMemo(() => parseParts(data.text), [data.text]);
  const words = useMemo(() => parts.filter((p): p is Extract<Part, { type: 'word' }> => p.type === 'word'), [parts]);

  const [answers, setAnswers] = useState<string[][]>(() =>
    words.map((w) => Array(w.full.length - w.given).fill('')),
  );
  const [submitted, setSubmitted] = useState(false);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const canSubmit = answers.every((letters) => letters.every((c) => c !== ''));
  const score = {
    correct: words.filter((w, i) => answers[i].join('').toLowerCase() === w.full.slice(w.given).toLowerCase()).length,
    total: words.length,
  };
  const perfect = score.correct === score.total;
  const feedbackMessage = perfect
    ? ui.missingLettersFeedbackPerfect(instructionLanguage)
    : score.correct / score.total >= 0.5
      ? ui.missingLettersFeedbackPartial(instructionLanguage)
      : ui.missingLettersFeedbackLow(instructionLanguage);

  const reset = () => {
    setAnswers(words.map((w) => Array(w.full.length - w.given).fill('')));
    setSubmitted(false);
  };

  let wordIndex = -1;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      onSubmit={() => setSubmitted(true)}
      onReset={reset}
      hideMeta
      hideTeacherNotes
      hideFooter
    >
      <section className="teacher-panel" lang="en" dir="ltr">
        <p className="teacher-intro">{TEACHING_FOCUS}</p>
        <dl className="teacher-meta">
          <div className="meta-row">
            <dt>Format</dt>
            <dd>{FORMAT_TEXT}</dd>
          </div>
          <div className="meta-row">
            <dt>Length</dt>
            <dd>{LENGTH_TEXT}</dd>
          </div>
          <div className="meta-row">
            <dt>By level</dt>
            <dd>{LEVEL_NOTES}</dd>
          </div>
          <div className="meta-row">
            <dt>Notes</dt>
            <dd>{NOTES}</dd>
          </div>
        </dl>
      </section>

      <section className="student-panel" lang="en">
        <h3 className="sample-heading">Sample</h3>
        {languageSwitch}
        <div className="sample-box">
          <p className="sample-intro" lang={instructionLanguage}>
            {sampleIntro}
          </p>

          <div className="passage" lang={data.language}>
            {data.passageTitle && <h3>{data.passageTitle}</h3>}
            <p>
              {parts.map((part, i) => {
                if (part.type === 'text') return <span key={i}>{part.value}</span>;

                wordIndex += 1;
                const wi = wordIndex;
                const w = part;
                const givenLetters = w.full.slice(0, w.given).split('');
                const blankCount = w.full.length - w.given;
                const wordCorrect =
                  submitted && answers[wi].join('').toLowerCase() === w.full.slice(w.given).toLowerCase();

                return (
                  <span className="letter-word" key={i}>
                    {givenLetters.map((ch, gi) => (
                      <span className="letter-box letter-given" key={`g${gi}`} aria-hidden="true">
                        {ch}
                      </span>
                    ))}
                    {Array.from({ length: blankCount }).map((_, li) => (
                      <input
                        key={`b${li}`}
                        ref={(el) => {
                          inputRefs.current[`${wi}-${li}`] = el;
                        }}
                        type="text"
                        inputMode="text"
                        maxLength={1}
                        className={`letter-box ${submitted ? (wordCorrect ? 'letter-correct' : 'letter-wrong') : ''}`}
                        value={answers[wi][li]}
                        disabled={submitted}
                        aria-label={`${w.full}, ${ui.selectPlaceholder(instructionLanguage)} ${li + 1}`}
                        onChange={(e) => {
                          const char = e.target.value.slice(-1);
                          setAnswers((prev) => {
                            const next = prev.map((row) => [...row]);
                            next[wi][li] = char;
                            return next;
                          });
                          if (char && inputRefs.current[`${wi}-${li + 1}`]) {
                            inputRefs.current[`${wi}-${li + 1}`]!.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !answers[wi][li] && inputRefs.current[`${wi}-${li - 1}`]) {
                            inputRefs.current[`${wi}-${li - 1}`]!.focus();
                          }
                        }}
                      />
                    ))}
                  </span>
                );
              })}
            </p>
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || !canSubmit}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && (
            <p className={`score ${percentage(score) >= 60 ? 'score-pass' : 'score-fail'}`}>
              {ui.scoreLine(instructionLanguage, score.correct, score.total, percentage(score))}
            </p>
          )}

          {submitted && <Feedback correct={perfect}>{feedbackMessage}</Feedback>}
        </div>
      </section>
    </ExerciseShell>
  );
}
