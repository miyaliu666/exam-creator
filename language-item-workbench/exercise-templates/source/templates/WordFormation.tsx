import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback } from '../components/Shell';
import { answerHint, answerValue, directionForLanguage, isCorrect, percentage, resolveMatching } from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She ___ to the store" into ["She ", " to the store"] around each blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the text below. Change the form of the word shown in capitals to complete each gap correctly.',
  es: 'Lee el texto a continuación. Cambia la forma de la palabra que aparece en mayúsculas para completar correctamente cada espacio.',
  zh: '请阅读下面的文章。改变括号中大写单词的形式，正确填补每个空白。',
};

/** The "For teachers" panel is fixed — it describes the Word Formation
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests knowledge of word formation: the student must change ' +
  'the form of a given prompt word (for example by adding a prefix or ' +
  'suffix, or changing its part of speech) to complete each gap ' +
  'correctly, drawing on both vocabulary range and grammatical accuracy.';
/** Paraphrases the CEFR's own "Vocabulary Range" and "Grammatical Accuracy"
 *  descriptor scales (Council of Europe, Structured overview of all CEFR
 *  scales, p.27-28). */
const LEVEL_NOTES =
  'A2: Simple, common prefixes/suffixes (happy → unhappy).\n' +
  'B1: Same range as A2, slightly less frequent transformations.\n' +
  'B2: Transformations that change part of speech (decide → decision).\n' +
  'C1: Less common or compound transformations (uncommon prefix, or prefix + suffix together).\n' +
  'C2: Rare or idiomatic derivations, register-dependent forms.';
const NOTES =
  'Prompt words are shown in capital letters, matching exam convention. ' +
  'Include a mix of transformation types across the exercise (changes of ' +
  'part of speech, negative prefixes, and plural or tense endings) rather ' +
  'than repeating the same pattern for every gap.';
const FORMAT_TEXT =
  'A student reads a text with several gaps. Each gap has a prompt word ' +
  'next to it, which the student must transform into the correct word to ' +
  'complete the gap.';
const LENGTH_TEXT = 'Up to eight gaps per exercise.';

/**
 * A free-text blank-filling task where each blank is paired with a prompt
 * word the student must transform, rather than a word bank or dropdown —
 * so correctness is checked with the same free-text matching used by
 * Sentence Completion, not an index comparison.
 */
export default function WordFormation({ data, body, languageSwitch }: TemplateProps<'word-formation'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const parts = segments(data.text);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = data.blanks.every((_, i) => (values[i] ?? '').trim() !== '');
  const score = {
    correct: data.blanks.filter((b, i) => isCorrect(values[i] ?? '', b.answer, matching)).length,
    total: data.blanks.length,
  };

  const reset = () => {
    setValues({});
    setSubmitted(false);
  };

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

          <p className="passage" lang={data.language} dir={dir}>
            {parts.map((part, i) => {
              const blank = data.blanks[i];
              const value = values[i] ?? '';
              const right = blank ? isCorrect(value, blank.answer, matching) : false;
              return (
                <span key={i}>
                  <bdi>{part}</bdi>
                  {blank && (
                    <>
                      <input
                        {...answerFieldProps}
                        type="text"
                        className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                        value={value}
                        disabled={submitted}
                        size={Math.max(answerValue(blank.answer).length, 6)}
                        aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                        placeholder={answerHint(blank.answer) ?? ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                      />
                      <span className="word-formation-prompt">{blank.prompt.toUpperCase()}</span>
                    </>
                  )}
                </span>
              );
            })}
          </p>

          {submitted && (
            <ol className="blank-answers">
              {data.blanks.map((b, i) => {
                const right = isCorrect(values[i] ?? '', b.answer, matching);
                return (
                  <li key={i}>
                    <Feedback correct={right}>
                      {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, answerValue(b.answer))}
                    </Feedback>
                  </li>
                );
              })}
            </ol>
          )}

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
        </div>
      </section>
    </ExerciseShell>
  );
}
