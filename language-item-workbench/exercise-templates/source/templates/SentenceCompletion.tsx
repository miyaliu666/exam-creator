import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback } from '../components/Shell';
import {
  answerHint,
  answerValue,
  directionForLanguage,
  isCorrect,
  resolveMatching,
} from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She ___ to the market" into ["She ", " to the market"] around the blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Complete each sentence with a single appropriate word.',
  es: 'Completa cada oración con una sola palabra adecuada.',
  zh: '请用一个恰当的词填写每个句子的空白处。',
};

/** The "For teachers" panel is fixed — it describes the Sentence Completion
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task draws on interpretation, inference, lexical selection and ' +
  "morphological encoding, and as such reflects the student's mastery of vocabulary " +
  'in use.';
/** Paraphrases the CEFR's own "Vocabulary Range" descriptor scale (Council
 *  of Europe, Structured overview of all CEFR scales, p.27). */
const LEVEL_NOTES =
  'A1: Everyday vocabulary (personal info, daily routines), one unambiguous correct word.\n' +
  'A2: Same range, slightly broader everyday vocabulary.\n' +
  'B1: Context determines the right word among a small set of plausible options.\n' +
  'B2: Lexical inference or a specific collocation required.\n' +
  'C1: Precise register or a morphological derivation needed.\n' +
  'C2: Idiom-level or highly register-sensitive lexical choice.';
const NOTES =
  'Each sentence has exactly one blank. Multiple acceptable answers can be set as ' +
  'alternatives. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student reads a sentence with one word missing and types a word that ' +
  'completes it correctly and appropriately.';
const LENGTH_TEXT = 'Up to six sentences per exercise (depending on the level).';

export default function SentenceCompletion({ data, body, languageSwitch }: TemplateProps<'sentence-completion'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const matching = useMemo(
    () => resolveMatching(data.language, data.matching),
    [data.language, data.matching],
  );

  const score = {
    correct: data.items.filter((item, i) => isCorrect(values[i] ?? '', item.answer, matching)).length,
    total: data.items.length,
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setValues({});
        setSubmitted(false);
      }}
      hideMeta
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
          <p className="sample-intro" lang={instructionLanguage} dir={directionForLanguage(instructionLanguage)}>
            {sampleIntro}
          </p>

          <ol className="blank-items" lang={data.language} dir={dir}>
            {data.items.map((item, i) => {
              const parts = segments(item.text);
              const value = values[i] ?? '';
              const right = isCorrect(value, item.answer, matching);
              return (
                <li key={i} className="blank-item">
                  <p className="blank-line">
                    <bdi>{parts[0]}</bdi>
                    <input
                      {...answerFieldProps}
                      className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                      type="text"
                      value={value}
                      disabled={submitted}
                      size={Math.max([...answerValue(item.answer)].length, 6)}
                      aria-label={ui.blankNumberLabel(instructionLanguage, i + 1)}
                      placeholder={answerHint(item.answer) ?? ''}
                      onChange={(e) => setValues({ ...values, [i]: e.target.value })}
                    />
                    <bdi>{parts[1]}</bdi>
                  </p>
                  {submitted && (
                    <Feedback correct={right}>
                      {right ? answerValue(item.answer) : ui.answerWas(instructionLanguage, answerValue(item.answer))}
                    </Feedback>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setValues({});
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
