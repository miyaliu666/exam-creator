import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import {
  answerExplanation,
  answerValue,
  directionForLanguage,
  isCorrect,
  percentage,
  resolveMatching,
} from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below, then answer each question with a short factual answer.',
  es: 'Lee el texto a continuación y responde cada pregunta con una respuesta breve y concreta.',
  zh: '请阅读下面的文章，然后用简短的事实性答案回答每个问题。',
};

/** The "For teachers" panel is fixed — it describes the Short-answer
 *  Questions task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS = 'This type of question tests your ability to find and understand specific information in the text.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short, simple passage; the answer is stated in words close to the question.\n' +
  'B1: Answer requires linking two nearby details or a simple paraphrase.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Denser passage; answer requires synthesizing information from more than one part of the text.\n' +
  'C2: Near-native passage; answer requires an inference beyond the explicit statement.';
const NOTES =
  'Answers are graded as short factual responses (a word or short phrase), ' +
  'not full sentences; add reasonable alternative phrasings as answer ' +
  'alternatives. UI/UX note: the passage and questions are shown side by ' +
  'side so both stay viewable at the same time.';
const FORMAT_TEXT = 'A student reads a passage, then answers questions about factual details in the text.';
const LENGTH_TEXT = 'Passage up to 200 words, with 3-5 questions.';

export default function ShortAnswerQuestions({
  data,
  body,
  languageSwitch,
}: TemplateProps<'short-answer-questions'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = {
    correct: data.questions.filter((q, i) => isCorrect(values[i] ?? '', q.answer, matching)).length,
    total: data.questions.length,
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setValues({});
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
              <ol className="questions">
                {data.questions.map((q, i) => {
                  const right = isCorrect(values[i] ?? '', q.answer, matching);
                  const explanation = answerExplanation(q.answer);
                  return (
                    <li key={i} className="question">
                      <Markdown className="question-prompt" lang={instructionLanguage} dir={directionForLanguage(instructionLanguage)}>
                        {q.prompt}
                      </Markdown>
                      <input
                        {...answerFieldProps}
                        type="text"
                        className={`dictation-input ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                        value={values[i] ?? ''}
                        disabled={submitted}
                        aria-label={ui.yourAnswer(instructionLanguage)}
                        placeholder={ui.typeAnswerHere(instructionLanguage)}
                        lang={data.language}
                        dir={dir}
                        onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                      />
                      {submitted && (
                        <Feedback correct={right}>
                          {right
                            ? ui.correct(instructionLanguage)
                            : `${ui.notQuiteExpected(instructionLanguage, answerValue(q.answer))}${
                                explanation ? `: ${explanation}` : ''
                              }`}
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
