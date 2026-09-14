import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise, and used only when an
 *  exercise doesn't set its own `instructions`. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Write your response below, aiming for the target length.',
  ja: '下のプロンプトについて、目標の長さで返答を書いてください。',
};

/** The "For teachers" panel is fixed — it describes the Writing task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests several writing skills, e.g. organizing ideas into a coherent ' +
  'structure, using a register and vocabulary appropriate to the task, and ' +
  'covering all the required content points.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). */
const LEVEL_NOTES =
  'A1: A few simple words or phrases about a very familiar topic (name, age, family).\n' +
  'A2: Simple phrases and sentences linked with basic connectors (and, but, because).\n' +
  'B1: Straightforward connected text, a linear sequence of shorter elements.\n' +
  'B2: Clear, detailed text that synthesizes information from multiple sources.';
const NOTES =
  'This task should ask about something personal to the student (an experience, ' +
  'a routine, a person or place they know), not an abstract issue or their ' +
  'opinion on one. Writing fewer than the word minimum loses the mark, ' +
  'regardless of content. Autocorrect is disabled. If a time limit is added to ' +
  'this task, it should be ' +
  '10 minutes.';
const FORMAT_TEXT = 'A student writes a response to a prompt within a target length.';
const LENGTH_TEXT = 'A minimum of 150 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length and required phrases. A human scores the rubric.
 */
export default function Writing({ data, body, languageSwitch }: TemplateProps<'writing'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = data.instructions ?? SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // CJK curricula count characters (字数); everyone else counts words. Both use
  // Intl.Segmenter so languages without spaces are handled correctly.
  const unit = data.countBy ?? (scriptForLanguage(data.language) === 'cjk' ? 'characters' : 'words');
  const count =
    unit === 'characters' ? countCharacters(text, data.language) : countWords(text, data.language);
  const tooShort = data.minWords !== undefined && count < data.minWords;
  const tooLong = data.maxWords !== undefined && count > data.maxWords;

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

          <Markdown className="prompt">{data.prompt}</Markdown>

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

          <p className={`word-count ${tooShort || tooLong ? 'word-count-off' : ''}`}>
            {data.maxWords !== undefined
              ? ui.wordCountTarget(instructionLanguage, count, unit, data.minWords ?? 0, data.maxWords)
              : data.minWords !== undefined
                ? ui.wordCountMinimum(instructionLanguage, count, unit, data.minWords)
                : ui.wordCount(instructionLanguage, count, unit)}
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
