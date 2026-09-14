import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

type Verdict = 'true' | 'false' | 'not-given';
const VERDICTS: Verdict[] = ['true', 'false', 'not-given'];

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below. For each statement, decide whether it agrees with the information in the text.',
  es: 'Lee el texto a continuación. Para cada afirmación, decide si concuerda con la información del texto.',
  zh: '请阅读下面的文章。判断每个陈述是否与文中信息一致。',
};

/** The "For teachers" panel is fixed — it describes the True or False
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS = 'This type of question tests your ability to recognize specific information given in the text.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short passages; true/false statements restate the text closely, not-given is unmentioned.\n' +
  'B1: Statements require a paraphrase or a small inference to judge.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Subtle wording distinguishes a false statement from one that is simply not given.\n' +
  'C2: Near-native passage; the distinction turns on implicit meaning.';
const NOTES =
  'Include a mix of true, false, and not-given statements. A statement is ' +
  '"not given" when the text neither confirms nor contradicts it, not when ' +
  'it is merely unlikely or debatable.';
const FORMAT_TEXT =
  'A student reads a passage, then decides for each statement whether it is ' +
  'True, False, or Not Given according to the text.';
const LENGTH_TEXT = 'Passage up to 250 words, with 4-8 statements.';

/**
 * A closed-choice True / False / Not Given judgment per statement, laid out
 * side by side (passage sticky on one side, statements on the other) so
 * both stay viewable at the same time — same UI/UX rationale as the other
 * reading tasks in this app. Correctness is a direct equality check.
 */
export default function IdentifyInformation({ data, body, id, languageSwitch }: TemplateProps<'identify-information'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<(Verdict | null)[]>(() => data.statements.map(() => null));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: data.statements.filter((s, i) => selections[i] === s.correct).length,
    total: data.statements.length,
  };

  const reset = () => {
    setSelections(data.statements.map(() => null));
    setSubmitted(false);
  };

  const verdictLabel = (v: Verdict) =>
    v === 'true' ? ui.labelTrue(instructionLanguage) : v === 'false' ? ui.labelFalse(instructionLanguage) : ui.labelNotGiven(instructionLanguage);

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
                {data.statements.map((s, i) => {
                  const chosen = selections[i];
                  const right = chosen === s.correct;
                  return (
                    <li key={i} className="question">
                      <Markdown
                        className="question-prompt"
                        lang={instructionLanguage}
                        dir={directionForLanguage(instructionLanguage)}
                      >
                        {s.text}
                      </Markdown>

                      <ul className="options">
                        {VERDICTS.map((v) => {
                          const isChosen = chosen === v;
                          const isKey = s.correct === v;
                          const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
                          return (
                            <li key={v}>
                              <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                                <input
                                  type="radio"
                                  name={`${id}-statement-${i}`}
                                  checked={isChosen}
                                  disabled={submitted}
                                  onChange={() =>
                                    setSelections((prev) => prev.map((sel, si) => (si === i ? v : sel)))
                                  }
                                />
                                <span>{verdictLabel(v)}</span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>

                      {submitted && (
                        <Feedback correct={right}>
                          {right ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                          {!right && s.explanation ? `: ${s.explanation}` : ''}
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
