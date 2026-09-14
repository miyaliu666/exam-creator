import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { correctIndices, directionForLanguage, percentage, selectionIsCorrect } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below, then answer the five questions. Each question has one correct answer.',
  es: 'Lee el texto a continuación y responde las cinco preguntas. Cada pregunta tiene una única respuesta correcta.',
  zh: '请阅读下面的文章，然后回答五个问题。每个问题只有一个正确答案。',
};

/** The "For teachers" panel is fixed — it describes the Multiple Choice,
 *  Single Answer task type itself, not any one exercise's content, so it
 *  must read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests many different reading skills, including ' +
  'detailed understanding of specific points or general understanding of ' +
  'the main points of the text.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short, simple passage; distractors are clearly wrong.\n' +
  'B1: Some distractors are partially true, or drawn from a different part of the text.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Distractors require close, careful reading to rule out.\n' +
  'C2: Near-native passage; distractors differ by subtle implication.';
const NOTES =
  'Questions should be ordered to match the flow of information in the ' +
  'passage where possible, and should mix detail-specific and main-idea ' +
  'questions.';
const FORMAT_TEXT =
  'A student reads a passage, then answers five multiple-choice questions ' +
  'about it, each with four options. The first four questions have one ' +
  'correct answer each; the fifth has more than one correct answer.';
const LENGTH_TEXT =
  'Passage up to 250 words, with exactly 5 questions, each with 4 options: ' +
  'questions 1-4 have a single correct answer, question 5 has multiple.';

/**
 * Five single-choice questions about one passage, laid out side by side
 * (passage sticky on one side, questions on the other) so both stay
 * viewable at the same time — same UI/UX rationale as the other reading
 * tasks in this app.
 */
export default function MultipleChoiceSingleAnswer({
  data,
  body,
  id,
  languageSwitch,
}: TemplateProps<'multiple-choice-single-answer'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<number[][]>(() => data.questions.map(() => []));
  const [submitted, setSubmitted] = useState(false);

  const score = {
    correct: data.questions.filter((q, i) => selectionIsCorrect(selections[i], q.correct)).length,
    total: data.questions.length,
  };

  const reset = () => {
    setSelections(data.questions.map(() => []));
    setSubmitted(false);
  };

  const toggle = (qi: number, oi: number, multi: boolean) => {
    if (submitted) return;
    setSelections((prev) =>
      prev.map((sel, i) => {
        if (i !== qi) return sel;
        if (!multi) return [oi];
        return sel.includes(oi) ? sel.filter((x) => x !== oi) : [...sel, oi];
      }),
    );
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
                {data.questions.map((q, qi) => {
                  const multi = Array.isArray(q.correct);
                  const key = correctIndices(q.correct);
                  const chosen = selections[qi];
                  const right = selectionIsCorrect(chosen, q.correct);
                  return (
                    <li key={qi} className="question">
                      <Markdown
                        className="question-prompt"
                        lang={instructionLanguage}
                        dir={directionForLanguage(instructionLanguage)}
                      >
                        {q.prompt}
                      </Markdown>
                      {multi && <p className="hint">{ui.selectAllThatApply(instructionLanguage)}</p>}

                      <ul className="options">
                        {q.options.map((opt, oi) => {
                          const isChosen = chosen.includes(oi);
                          const isKey = key.includes(oi);
                          const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
                          return (
                            <li key={oi}>
                              <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                                <input
                                  type={multi ? 'checkbox' : 'radio'}
                                  name={`${id}-mcq-${qi}`}
                                  checked={isChosen}
                                  disabled={submitted}
                                  onChange={() => toggle(qi, oi, multi)}
                                />
                                <span lang={data.language} dir={dir}>
                                  {opt}
                                </span>
                              </label>
                            </li>
                          );
                        })}
                      </ul>

                      {submitted && (
                        <Feedback correct={right}>
                          {right ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                          {!right && q.explanation ? `: ${q.explanation}` : ''}
                        </Feedback>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="controls">
                <button
                  className="btn btn-primary"
                  onClick={() => setSubmitted(true)}
                  disabled={submitted || selections.some((s) => s.length === 0)}
                >
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
