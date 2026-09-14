import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Read the passage below, then choose the best title for it from the options ' +
    'given. All of the options may seem relevant, but only one fits the whole ' +
    'passage.',
  es:
    'Lee el texto a continuación y elige el mejor título entre las opciones ' +
    'dadas. Todas las opciones pueden parecer relevantes, pero solo una se ' +
    'ajusta a todo el texto.',
  zh: '请阅读下面的文章，然后从给出的选项中选出最合适的标题。所有选项可能都看起来相关，但只有一个能概括整篇文章。',
};

/** The "For teachers" panel is fixed — it describes the Title the Passage
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests global reading comprehension: whether the student can identify ' +
  'the main idea of a passage as a whole, rather than being drawn to a title that ' +
  'only fits part of it.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short, simple passage; incorrect titles describe something not in the text at all.\n' +
  'B1: One incorrect title captures a real but partial aspect of the passage.\n' +
  'B2: Same mechanic, denser passage.\n' +
  "C1: Several thematically close incorrect titles requiring weighing the whole text's emphasis.\n" +
  'C2: Near-native passage; titles differ by subtle framing or tone.';
const NOTES =
  'All options should seem relevant to the passage; only one should fit the ' +
  'whole passage rather than just part of it. UI/UX note: the passage and the ' +
  'question are shown side by side so both stay viewable at the same time.';
const FORMAT_TEXT =
  'A student reads a passage, then chooses the best title for it from several ' +
  'options, all of which may seem relevant.';
const LENGTH_TEXT = 'Passage up to 150 words, with one question.';

/**
 * A single passage + single multiple-choice question, laid out side by side
 * (passage sticky on one side, question on the other) so both stay viewable
 * at the same time — same UI/UX rationale as the Reading and Identify the
 * Idea tasks.
 */
export default function TitleThePassage({ data, body, id, languageSwitch }: TemplateProps<'title-the-passage'>) {
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
                          name={`${id}-title-the-passage`}
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
