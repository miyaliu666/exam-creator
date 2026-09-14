import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Read the passage below. One sentence is missing from the middle, shown as a ' +
    'blank box. Select the option that best completes it.',
  es:
    'Lee el texto a continuación. Falta una frase en el medio, mostrada como un ' +
    'recuadro en blanco. Selecciona la opción que mejor lo completa.',
  zh: '请阅读下面的文章。文章中间缺少一句话，用一个空白框表示。请选出最能补全文章的选项。',
};

/** The "For teachers" panel is fixed — it describes the Complete the
 *  Passage task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests cohesion and coherence: whether the student can identify which ' +
  'sentence logically and grammatically continues the surrounding text, based on ' +
  'the ideas, connectors, and pronoun references on either side of the gap.';
/** Paraphrases the CEFR's own "Coherence" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.31). */
const LEVEL_NOTES =
  'A2: Short, simple sentences around the gap; distractors are clearly unrelated topically.\n' +
  'B1: Requires connecting pronouns or connectors across the gap.\n' +
  'B2: Same mechanic, denser surrounding text.\n' +
  'C1: Distractors are both grammatically and topically plausible, differing only in a subtle logical detail.\n' +
  'C2: Near-native cohesion; the wrong option differs only in register or logical nuance.';
const NOTES =
  'Only one option should fit both the meaning and the grammar/cohesion of the ' +
  'surrounding text; distractors should be plausible sentences on their own, but ' +
  'not fit the specific gap. UI/UX note: the passage (with the blank shown in ' +
  'place) and the question are shown side by side so both stay viewable at the ' +
  'same time.';
const FORMAT_TEXT =
  'A student reads a passage with one sentence missing from the middle, then ' +
  'selects, from several options, the sentence that best completes it.';
const LENGTH_TEXT = 'Passage up to 200 words, with one question.';

/**
 * A single passage with a visible gap in the middle + single multiple-choice
 * question, laid out side by side (passage sticky on one side, question on
 * the other) so both stay viewable at the same time — same UI/UX rationale
 * as the Reading, Identify the Idea, and Title the Passage tasks.
 */
export default function CompleteThePassage({
  data,
  body,
  id,
  languageSwitch,
}: TemplateProps<'complete-the-passage'>) {
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
                {data.passageBefore}
              </Markdown>
              <div className="sentence-blank">{ui.chooseASentence(instructionLanguage)}</div>
              <Markdown lang={data.language} dir={dir}>
                {data.passageAfter}
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
                          name={`${id}-complete-the-passage`}
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
