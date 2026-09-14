import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She ___ to the store" into ["She ", " to the store"] around each blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Fill the gaps in the text by choosing the correct word from each drop-down menu.',
  es: 'Completa los espacios del texto eligiendo la palabra correcta en cada menú desplegable.',
  zh: '请从每个下拉菜单中选择正确的单词，填补文章中的空白。',
};

/** The "For teachers" panel is fixed — it describes the Choose the Word
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests vocabulary and grammar knowledge as a closed-choice task: the ' +
  'student recognizes the correct word among a small set of options rather than ' +
  'producing it from memory.';
/** Paraphrases the CEFR's own "Vocabulary Range" and "Grammatical Accuracy"
 *  descriptor scales (Council of Europe, Structured overview of all CEFR
 *  scales, p.27-28). */
const LEVEL_NOTES =
  'A2: Options are clearly different in meaning.\n' +
  'B1: Options share a word family or part of speech; only one fits the context.\n' +
  'B2: Same mechanic, denser context.\n' +
  'C1: Options are all grammatically possible, differing only in collocation, register, or nuance.\n' +
  'C2: Near-native nuance; the distinction is idiom- or register-level.';
const NOTES =
  'Each dropdown should present exactly three options. Distractors may be ' +
  'grammatically incorrect, or they may be words with a similar meaning that ' +
  'are conventionally used in a different context.';
const FORMAT_TEXT =
  'A student fills each blank by choosing the correct word from a drop-down ' +
  'menu of options using context clues.';
const LENGTH_TEXT = 'Up to six blanks per exercise.';

/**
 * A closed-choice blank-filling task: each blank is a native <select> rather
 * than a typed answer, so there is nothing to normalize or fold — correctness
 * is a direct index comparison.
 */
export default function ChooseTheWord({ data, body, languageSwitch }: TemplateProps<'choose-the-word'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const parts = segments(data.text);

  const [selections, setSelections] = useState<(number | null)[]>(() => Array(data.blanks.length).fill(null));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: selections.filter((s, i) => s === data.blanks[i].correctIndex).length,
    total: data.blanks.length,
  };
  const perfect = score.correct === score.total;
  const feedbackMessage = perfect
    ? ui.blankFeedbackPerfect(instructionLanguage)
    : score.correct / score.total >= 0.5
      ? ui.blankFeedbackPartial(instructionLanguage)
      : ui.blankFeedbackLow(instructionLanguage);

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setSelections(Array(data.blanks.length).fill(null));
        setSubmitted(false);
      }}
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

          <p className="passage" lang={data.language} dir={dir}>
            {parts.map((part, i) => (
              <span key={i}>
                {part}
                {i < data.blanks.length && (
                  <select
                    className={`blank ${
                      submitted
                        ? selections[i] === data.blanks[i].correctIndex
                          ? 'blank-correct'
                          : 'blank-wrong'
                        : ''
                    }`}
                    value={selections[i] ?? ''}
                    disabled={submitted}
                    aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                    onChange={(e) => {
                      const value = e.target.value === '' ? null : Number(e.target.value);
                      setSelections((prev) => prev.map((s, si) => (si === i ? value : s)));
                    }}
                  >
                    <option value="" disabled>
                      {ui.selectPlaceholder(instructionLanguage)}
                    </option>
                    {data.blanks[i].options.map((opt, oi) => (
                      <option key={oi} value={oi}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}
              </span>
            ))}
          </p>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || !canSubmit}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setSelections(Array(data.blanks.length).fill(null));
                setSubmitted(false);
              }}
            >
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
