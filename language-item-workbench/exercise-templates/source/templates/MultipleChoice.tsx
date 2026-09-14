import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { percentage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { QuestionList, gradeQuestions, type Selections } from '../components/QuestionList';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Choose the best option for each question. Some questions may have more than one correct answer: select all that apply.',
  es: 'Elige la mejor opción para cada pregunta. Algunas preguntas pueden tener más de una respuesta correcta: selecciona todas las que correspondan.',
  zh: '为每道题选择最佳答案。有些题目可能有一个以上的正确答案：请选出所有符合的选项。',
};

/** The "For teachers" panel is fixed — it describes the Multiple Choice task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests vocabulary precision, e.g. recognizing correct ' +
  'collocations, distinguishing appropriate register, and selecting the most precise ' +
  'word for a given context.';
/** Paraphrases the CEFR's own "Vocabulary Range"/"Vocabulary Control"
 *  descriptor scales (Council of Europe, Structured overview of all CEFR
 *  scales, p.27). */
const LEVEL_NOTES =
  'A1: Very basic, high-frequency vocabulary with obviously distinct options.\n' +
  'A2: Routine everyday-transaction vocabulary, clearly distinct options.\n' +
  'B1: Vocabulary needing a little circumlocution on everyday topics.\n' +
  'B2: Varied formulations as distractors; a lexical gap, not an obviously wrong answer, causes hesitation.\n' +
  'C1: Idiomatic expressions and register-appropriate collocations, subtly wrong distractors.\n' +
  'C2: Near-native precision; distractors differ only by connotation or register.';
const NOTES =
  'Multi-select questions switch to checkboxes automatically wherever the answer key ' +
  'is an array; partial selections score zero for that question.';
const FORMAT_TEXT =
  'A student selects one (or, when marked, multiple) correct options per question.';
const LENGTH_TEXT = 'Up to six questions per exercise (depending on the level).';

export default function MultipleChoice({ data, body, id, languageSwitch }: TemplateProps<'multiple-choice'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [selections, setSelections] = useState<Selections>({});
  const [submitted, setSubmitted] = useState(false);

  const score = gradeQuestions(data.questions, selections);
  const perfect = score.total > 0 && score.correct === score.total;
  // Tiered, content-relevant guidance instead of a flat pass/fail message.
  const feedbackMessage =
    score.total === 0
      ? null
      : perfect
        ? ui.mcFeedbackPerfect(instructionLanguage)
        : score.correct / score.total >= 0.5
          ? ui.mcFeedbackPartial(instructionLanguage)
          : ui.mcFeedbackLow(instructionLanguage);

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setSelections({});
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
            <dd>
              {FORMAT_TEXT}
            </dd>
          </div>
          <div className="meta-row">
            <dt>Length</dt>
            <dd>
              {LENGTH_TEXT}
            </dd>
          </div>
          <div className="meta-row">
            <dt>By level</dt>
            <dd>
              {LEVEL_NOTES}
            </dd>
          </div>
          <div className="meta-row">
            <dt>Notes</dt>
            <dd>
              {NOTES}
            </dd>
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

          {data.passage && <Markdown className="passage">{data.passage}</Markdown>}

          <QuestionList
            questions={data.questions}
            selections={selections}
            onChange={setSelections}
            submitted={submitted}
            idPrefix={id}
            language={instructionLanguage}
          />

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setSelections({});
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

          {submitted && feedbackMessage && <Feedback correct={perfect}>{feedbackMessage}</Feedback>}
        </div>
      </section>
    </ExerciseShell>
  );
}
