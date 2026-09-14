import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import {
  answerFieldProps,
  CompactAudioButton,
  ExerciseShell,
  Feedback,
  Markdown,
  MarkdownWithBlanks,
} from '../components/Shell';
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
 *  fixed rule of the task type. Wording depends on which of the seven
 *  layouts (diagram / plan / map / summary / notes / table / flow-chart) is
 *  active. */
const SAMPLE_INTRO: Record<string, Record<string, (maxWords?: number) => string>> = {
  diagram: {
    en: (maxWords) =>
      'Listen to the recording, then complete the labels on the diagram.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa las etiquetas del diagrama.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成图表上的标签。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  plan: {
    en: (maxWords) =>
      'Listen to the recording, then complete the labels on the plan.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa las etiquetas del plano.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成平面图上的标签。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  map: {
    en: (maxWords) =>
      'Listen to the recording, then complete the labels on the map.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa las etiquetas del mapa.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成地图上的标签。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  summary: {
    en: (maxWords) =>
      'Listen to the recording, then complete the summary.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa el resumen.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成摘要。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  notes: {
    en: (maxWords) =>
      'Listen to the recording, then complete the notes.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa las notas.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成笔记。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  table: {
    en: (maxWords) =>
      'Listen to the recording, then complete the table.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa la tabla.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成表格。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
  'flow-chart': {
    en: (maxWords) =>
      'Listen to the recording, then complete the flow chart.' +
      (maxWords ? ` You may use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
    es: (maxWords) =>
      'Escucha la grabación y completa el diagrama de flujo.' +
      (maxWords ? ` Puedes usar como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
    zh: (maxWords) => `请听录音，然后完成流程图。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
  },
};

/** The "For teachers" panel is fixed — it describes the Listening
 *  Completion task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question focuses on the main points a listener would ' +
  'naturally note down. It tests your ability to understand a spoken ' +
  'description of a place and relate it to a diagram, plan, or map, or to ' +
  'follow an explanation of facts and relate it to a summary, a set of ' +
  'notes, a table, or a flow chart.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A1: One or two blanks naming single everyday objects, stated once, very slowly.\n' +
  'A2: Simple diagram/plan/notes, two or three blanks, wording close to the recording.\n' +
  'B1: Several blanks; answers require linking a spoken description to a position or a term used elsewhere.\n' +
  'B2: Same mechanic, denser recording, labels less directly cued by the wording.\n' +
  'C1: Dense recording; blanks require following directions or synthesizing details from separate points.\n' +
  'C2: Near-native pace/register; blanks require inferring an implicit detail, not just a stated one.';
const NOTES =
  'Limit each answer to a short label (e.g. no more than two words), not a ' +
  'full sentence; add reasonable alternative wordings as answer ' +
  'alternatives. Choose the layout (diagram, plan, map, summary, notes, ' +
  'table, or flow chart) that best fits how the information is structured ' +
  'in the recording. The recording has its own play counter.';
const FORMAT_TEXT =
  'A student listens to a recording, with a limited number of plays, then ' +
  'fills in the blanks of a diagram, plan, map, summary, set of notes, ' +
  'table, or flow chart, based on the description given in the recording.';
const LENGTH_TEXT = 'Recording up to 90 seconds, with 4-6 blanks.';

const VISUAL_LAYOUTS = new Set(['diagram', 'plan', 'map']);

export default function ListeningDiagramLabel({
  data,
  body,
  languageSwitch,
}: TemplateProps<'listening-diagram-label'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const introForLayout = SAMPLE_INTRO[data.layout] ?? SAMPLE_INTRO.diagram;
  const sampleIntro = (introForLayout[instructionLanguage] ?? introForLayout.en)(data.maxWordsPerLabel);
  const dir = directionForLanguage(data.language);
  const isVisual = VISUAL_LAYOUTS.has(data.layout) && data.image !== undefined;

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const score = {
    correct: data.labels.filter((a, i) => isCorrect(values[i] ?? '', a, matching)).length,
    total: data.labels.length,
  };

  const showTranscript = data.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);

  const reset = () => {
    setValues({});
    setSubmitted(false);
    setPlays(0);
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

          <div className="matching-row">
            <CompactAudioButton
              media={data.audio}
              maxPlays={data.maxPlays}
              plays={plays}
              onPlay={() => setPlays((p) => p + 1)}
              lang={instructionLanguage}
            />
          </div>

          {isVisual && data.image ? (
            <div className="reading-columns">
              <div className="passage no-accent">
                <figure className="describe-image-figure">
                  <img src={data.image.src} alt={data.image.alt ?? ''} />
                  {data.image.credit && <p className="credit">{data.image.credit}</p>}
                </figure>
              </div>

              <div className="reading-questions-col">
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
              </div>
            </div>
          ) : (
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
          )}

          {!isVisual && submitted && (
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

          {showTranscript && (
            <details className="transcript" open={submitted}>
              <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
              <Markdown>{data.transcript!}</Markdown>
            </details>
          )}

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
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
