import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** A, B, C... for the 0-based ending index. */
function letterFor(index: number): string {
  return String.fromCharCode(65 + index);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below, then complete each sentence with the correct ending from the drop-down menu. Not all endings will be used.',
  es: 'Lee el texto a continuación y completa cada oración con la terminación correcta del menú desplegable. No se usarán todas las terminaciones.',
  zh: '请阅读下面的文章，然后从下拉菜单中为每个句子选择正确的结尾。并非所有结尾都会被使用。',
};

/** The "For teachers" panel is fixed — it describes the Matching Sentence
 *  Endings task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS = 'This type of question tests your ability to understand the main ideas in the text.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short starters; endings are clearly about different ideas.\n' +
  'B1: A distractor ending is true of the passage generally but wrong for that particular starter.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Endings are grammatically plausible for more than one starter; meaning alone decides.\n' +
  'C2: Near-native passage; endings differ by subtle logical fit only.';
const NOTES =
  'Include more endings than starters, so that some endings are never used, ' +
  'which prevents students from matching the last starter by elimination ' +
  'alone. Distractor endings should be grammatically compatible with more ' +
  'than one starter so guessing from grammar alone is unreliable.';
const FORMAT_TEXT =
  'A student reads a passage, then completes each numbered sentence starter ' +
  'by choosing the best-fitting ending from a shared drop-down list of ' +
  'lettered endings.';
const LENGTH_TEXT = '3-6 sentence starters per exercise, with at least one more ending than there are starters.';

/**
 * One ending drop-down per sentence starter, laid out side by side (passage
 * sticky on one side, starters on the other) so both stay viewable at the
 * same time — same UI/UX rationale as the other reading tasks in this app.
 * Correctness is a direct index comparison, same as Matching Headings.
 */
export default function MatchingSentenceEndings({
  data,
  body,
  id,
  languageSwitch,
}: TemplateProps<'matching-sentence-endings'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<(number | null)[]>(() => Array(data.starters.length).fill(null));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: selections.filter((s, i) => s === data.starters[i].correct).length,
    total: data.starters.length,
  };

  const reset = () => {
    setSelections(Array(data.starters.length).fill(null));
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

          <div className="reading-columns">
            <div className="passage">
              <h3>{ui.passageLabel(instructionLanguage)}</h3>
              <Markdown lang={data.language} dir={dir}>
                {data.passage}
              </Markdown>
            </div>

            <div className="reading-questions-col">
              <ol className="questions">
                {data.starters.map((s, i) => {
                  const right = selections[i] === s.correct;
                  return (
                    <li key={i} className="question">
                      <Markdown
                        className="question-prompt"
                        lang={instructionLanguage}
                        dir={directionForLanguage(instructionLanguage)}
                      >
                        {s.text}
                      </Markdown>
                      <select
                        className={`blank blank-block ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                        value={selections[i] ?? ''}
                        disabled={submitted}
                        name={`${id}-ending-${i}`}
                        aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : Number(e.target.value);
                          setSelections((prev) => prev.map((sel, si) => (si === i ? value : sel)));
                        }}
                      >
                        <option value="" disabled>
                          {ui.selectPlaceholder(instructionLanguage)}
                        </option>
                        {data.endings.map((end, ei) => (
                          <option key={ei} value={ei}>
                            {letterFor(ei)}: {end}
                          </option>
                        ))}
                      </select>

                      {submitted && (
                        <Feedback correct={right}>
                          {right
                            ? ui.correct(instructionLanguage)
                            : ui.notQuiteExpected(
                                instructionLanguage,
                                `${letterFor(s.correct)}: ${data.endings[s.correct]}`,
                              )}
                        </Feedback>
                      )}
                    </li>
                  );
                })}
              </ol>

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
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
