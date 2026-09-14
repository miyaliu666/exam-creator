import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Look at the visual information below, then describe it in your own words. ' +
    'You should aim to write at least 150 words.',
  es:
    'Observa la información visual a continuación y descríbela con tus propias ' +
    'palabras. Debes intentar escribir al menos 150 palabras.',
  zh: '请查看下面的图表信息，并用自己的话描述。请尽量写至少150字。',
};

/** The "For teachers" panel is fixed — it describes the Report Writing task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests whether the student can give a well-organized overview of " +
  'visual information using language that is appropriate in its register and style.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). */
const LEVEL_NOTES =
  'B2: A chart or graph with a small number of clear trends.\n' +
  'C1: A denser chart, table, or diagram with multiple data series to prioritize.\n' +
  'C2: Near-native register; synthesizing and evaluating significance across complex or multiple visuals.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. If a time limit is added to this task, it should be ' +
  '20 minutes.';
const FORMAT_TEXT =
  'A student describes visual information (a graph, table, chart, or diagram) in ' +
  'their own words.';
const LENGTH_TEXT = 'A minimum of 150 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length and required phrases. A human scores the rubric,
 * same as the Writing task.
 */
export default function ReportWriting({ data, body, languageSwitch }: TemplateProps<'report-writing'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // CJK curricula count characters (字数); everyone else counts words. Both use
  // Intl.Segmenter so languages without spaces are handled correctly.
  const unit = data.countBy ?? (scriptForLanguage(data.language) === 'cjk' ? 'characters' : 'words');
  const count =
    unit === 'characters' ? countCharacters(text, data.language) : countWords(text, data.language);
  const tooShort = count < data.minWords;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={count > 0}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setText('');
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

          <Markdown className="prompt no-accent">{data.prompt}</Markdown>

          <figure className="describe-image-figure">
            <img src={data.image.src} alt={data.image.alt ?? ''} />
            {data.image.credit && <p className="credit">{data.image.credit}</p>}
          </figure>

          <textarea
            {...answerFieldProps}
            className="writing-area"
            rows={14}
            value={text}
            disabled={submitted}
            aria-label={ui.yourResponse(instructionLanguage)}
            placeholder={ui.writeResponseHere(instructionLanguage)}
            onChange={(e) => setText(e.target.value)}
          />

          <p className={`word-count ${tooShort ? 'word-count-off' : count > 0 ? 'word-count-ok' : ''}`}>
            {ui.wordCountMinimum(instructionLanguage, count, unit, data.minWords)}
          </p>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || count === 0}>
              {ui.submitForReview(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setText('');
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && data.sampleAnswer && (
            <details className="sample-answer" open>
              <summary>{ui.modelAnswer(instructionLanguage)}</summary>
              <Markdown>{data.sampleAnswer}</Markdown>
            </details>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
