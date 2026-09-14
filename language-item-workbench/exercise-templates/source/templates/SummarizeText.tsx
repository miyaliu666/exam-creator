import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown, Rubric } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below and summarize it. Type your response in the box at the bottom of the screen.',
  es: 'Lee el pasaje a continuación y resúmelo. Escribe tu respuesta en el cuadro en la parte inferior de la pantalla.',
  zh: '请阅读下面的短文并进行归纳总结。请在屏幕底部的方框中输入你的回答。',
};

/** The "For teachers" panel is fixed — it describes the Text Summary task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to identify the main idea of a " +
  'written passage and express it concisely and accurately in their own words.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'B1: Short passage on a familiar topic with one clear main idea.\n' +
  'B2: Longer passage with some supporting detail to condense.\n' +
  'C1: Dense or academic passage; weighing several competing points.\n' +
  'C2: Near-native passage; concise synthesis that preserves nuance and emphasis.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. If a time limit is added to this task, it should be ' +
  '10 minutes.';
const FORMAT_TEXT =
  'A student reads a passage, then writes a summary of it within a target word count.';
const LENGTH_TEXT = '25–50 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: word count against the target range. A human scores
 * the rubric, same as the Writing task.
 */
export default function SummarizeText({ data, body, languageSwitch }: TemplateProps<'summarize-text'>) {
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
  const tooLong = count > data.maxWords;

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

          <Markdown className="prompt">{data.passage}</Markdown>

          <textarea
            {...answerFieldProps}
            className="writing-area"
            rows={4}
            value={text}
            disabled={submitted}
            aria-label={ui.yourSummary(instructionLanguage)}
            placeholder={ui.writeSummaryHere(instructionLanguage)}
            onChange={(e) => setText(e.target.value)}
          />

          <p
            className={`word-count ${tooShort ? 'word-count-off' : tooLong ? 'word-count-over' : ''}`}
          >
            {ui.wordCountTarget(instructionLanguage, count, unit, data.minWords, data.maxWords)}
          </p>
          {tooShort && count > 0 && (
            <p className="error">{ui.belowWordMinimum(instructionLanguage, data.minWords, unit)}</p>
          )}

          <Rubric rows={data.rubric} />

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
