import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below, then select the idea that is expressed in it.',
  es: 'Lee el texto a continuación y selecciona la idea que se expresa en él.',
  zh: '请阅读下面的文章，然后选出文章中表达的观点。',
};

/** The "For teachers" panel is fixed — it describes the Identify the Idea
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests reading comprehension: whether the student can identify which ' +
  "idea is actually expressed in a passage, as opposed to plausible-sounding " +
  "statements the passage doesn't support.";
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short, simple passage; distractors are clearly unrelated to the text.\n' +
  "B1: Passage connects two or three details; distractors sound plausible but aren't actually stated.\n" +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Dense passage; distractors require careful, close reading to rule out.\n' +
  'C2: Passage with implicit meaning; distractors resemble a genuine (but wrong) implication.';
const NOTES =
  'Only one idea should be directly and clearly expressed in the passage; the ' +
  'other options should be plausible but not stated, or should contradict the ' +
  'passage. UI/UX note: the passage and the question are shown side by side ' +
  'so both stay viewable at the same time.';
const FORMAT_TEXT =
  'A student reads a passage, then selects, from several options, the one idea ' +
  'that is actually expressed in it.';
const LENGTH_TEXT = 'Passage up to 150 words, with one question.';

/**
 * A single passage + single multiple-choice question, laid out side by side
 * (passage sticky on one side, question on the other) so both stay viewable
 * at the same time — same UI/UX rationale as the Reading task.
 */
export default function IdentifyIdea({ data, body, id, languageSwitch }: TemplateProps<'identify-idea'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const correct = selected === data.correctIndex;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setSelected(null);
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

          <div className="reading-columns">
            <div className="passage">
              <h3>{ui.passageLabel(instructionLanguage)}</h3>
              <Markdown lang={data.language} dir={dir}>
                {data.passage}
              </Markdown>
            </div>

            <div className="reading-questions-col">
              <div className="question-prompt">
                <p lang={instructionLanguage} dir={directionForLanguage(instructionLanguage)}>
                  {data.question}
                </p>
              </div>

              <ul className="options">
                {data.options.map((opt, i) => {
                  const isChosen = selected === i;
                  const isKey = i === data.correctIndex;
                  const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
                  return (
                    <li key={i}>
                      <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                        <input
                          type="radio"
                          name={`${id}-identify-idea`}
                          checked={isChosen}
                          disabled={submitted}
                          onChange={() => setSelected(i)}
                        />
                        <span lang={data.language} dir={dir}>
                          {opt}
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>

              <div className="controls">
                <button
                  className="btn btn-primary"
                  onClick={() => setSubmitted(true)}
                  disabled={submitted || selected === null}
                >
                  {ui.checkAnswers(instructionLanguage)}
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    setSelected(null);
                    setSubmitted(false);
                  }}
                >
                  {ui.reset(instructionLanguage)}
                </button>
              </div>

              {submitted && (
                <Feedback correct={correct}>
                  {correct ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                  {data.explanation ? `: ${data.explanation}` : ''}
                </Feedback>
              )}
            </div>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
