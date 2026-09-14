import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback, Markdown, MarkdownWithBlanks } from '../components/Shell';
import {
  answerValue,
  directionForLanguage,
  isCorrect,
  percentage,
  resolveMatching,
} from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. The word limit is
 *  interpolated per exercise, since it's a schema-level constraint, not a
 *  fixed rule of the task type. Wording depends on which of the five
 *  layouts (diagram / summary / notes / table / flow-chart) is active. */
const SAMPLE_INTRO: Record<string, Record<string, (maxWords?: number) => string>> = {
  diagram: {
    en: (maxWords) =>
      'Read the passage below, then complete the labels on the diagram.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Lee el texto a continuación y completa las etiquetas del diagrama.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请阅读下面的文章，然后完成图表上的标签。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  summary: {
    en: (maxWords) =>
      'Read the passage below, then complete the summary.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Lee el texto a continuación y completa el resumen.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请阅读下面的文章，然后完成摘要。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  notes: {
    en: (maxWords) =>
      'Read the passage below, then complete the notes.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Lee el texto a continuación y completa las notas.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请阅读下面的文章，然后完成笔记。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  table: {
    en: (maxWords) =>
      'Read the passage below, then complete the table.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Lee el texto a continuación y completa la tabla.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请阅读下面的文章，然后完成表格。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  'flow-chart': {
    en: (maxWords) =>
      'Read the passage below, then complete the flow chart.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Lee el texto a continuación y completa el diagrama de flujo.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请阅读下面的文章，然后完成流程图。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
};

/** The "For teachers" panel is fixed — it describes the Summary, Note,
 *  Table, Flow-chart, or Diagram Completion task type itself, not any one
 *  exercise's content, so it must read the same no matter which
 *  language/level variant is currently selected. Only the Sample below it
 *  changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to understand a detailed ' +
  'description in the text, and then relate that description to ' +
  'information given in a summary, a set of notes, a table, a flow chart, ' +
  'or a diagram.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A1: A single very simple label, from one short, familiar sentence.\n' +
  'A2: Two or three blanks, named in words close to the text.\n' +
  'B1: Several blanks; answers require linking a description to a term used elsewhere in the text.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Dense layout and passage; blanks require synthesizing details from more than one sentence.\n' +
  'C2: Near-native passage; blanks require an inference beyond the explicit wording.';
const NOTES =
  'Limit each answer to a short label (e.g. no more than two words), not a ' +
  'full sentence; add reasonable alternative wordings as answer ' +
  'alternatives. Choose the layout (summary, notes, table, flow chart, or ' +
  'diagram) that best fits how the information is structured in the ' +
  'passage.';
const FORMAT_TEXT =
  'A student reads a passage, then fills in the blanks of a summary, a set ' +
  'of notes, a table, a flow chart, or a diagram, based on the description ' +
  'given in the text.';
const LENGTH_TEXT = 'Passage up to 200 words, with 4-6 blanks.';

export default function DiagramLabel({ data, body, languageSwitch }: TemplateProps<'diagram-label'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const introForLayout = SAMPLE_INTRO[data.layout] ?? SAMPLE_INTRO.diagram;
  const sampleIntro = (introForLayout[instructionLanguage] ?? introForLayout.en)(data.maxWordsPerLabel);
  const dir = directionForLanguage(data.language);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = {
    correct: data.labels.filter((a, i) => isCorrect(values[i] ?? '', a, matching)).length,
    total: data.labels.length,
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
              {data.layout === 'diagram' && data.image ? (
                <>
                  <figure className="describe-image-figure">
                    <img src={data.image.src} alt={data.image.alt ?? ''} />
                    {data.image.credit && <p className="credit">{data.image.credit}</p>}
                  </figure>

                  <ol className="questions">
                    {data.labels.map((a, i) => {
                      const right = isCorrect(values[i] ?? '', a, matching);
                      return (
                        <li key={i} className="question">
                          <input
                            {...answerFieldProps}
                            type="text"
                            className={`dictation-input ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                            value={values[i] ?? ''}
                            disabled={submitted}
                            aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                            placeholder={ui.typeAnswerHere(instructionLanguage)}
                            lang={data.language}
                            dir={dir}
                            onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                          />
                          {submitted && (
                            <Feedback correct={right}>
                              {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, answerValue(a))}
                            </Feedback>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : (
                <>
                  <div className="passage no-accent">
                    <MarkdownWithBlanks
                      content={data.content ?? ''}
                      labels={data.labels}
                      values={values}
                      matching={matching}
                      submitted={submitted}
                      onChange={(i, value) => setValues((prev) => ({ ...prev, [i]: value }))}
                      lang={data.language}
                      dir={dir}
                    />
                  </div>

                  {submitted && (
                    <ol className="blank-answers">
                      {data.labels.map((a, i) => {
                        const right = isCorrect(values[i] ?? '', a, matching);
                        return (
                          <li key={i}>
                            <Feedback correct={right}>
                              {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, answerValue(a))}
                            </Feedback>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </>
              )}

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
