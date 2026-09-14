import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown, Rubric } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the situation below, then write a short, informal note that covers every point listed. Type your response in the box below.',
  es:
    'Lee la situación a continuación y escribe una nota breve e informal que cubra ' +
    'todos los puntos indicados. Escribe tu respuesta en el cuadro de abajo.',
  zh: '请阅读下面的情境，然后写一张简短、非正式的便条，涵盖列出的所有要点。请在下面的方框中输入你的回答。',
};

/** The "For teachers" panel is fixed — it describes the Guided Writing task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to write a short, informal note that " +
  'covers specific pieces of information, using simple, direct language.';
/** Paraphrases the CEFR's own "Correspondence" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.24). */
const LEVEL_NOTES =
  'A1: Simple everyday scenario, two or three very concrete points (a time, a place).\n' +
  'A2: A scenario where each point needs a little more detail, such as a reason or suggestion.\n' +
  'B1: A scenario where the points require connected, multi-clause sentences.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. Add 3-4 content points.';
const FORMAT_TEXT =
  'A student writes a short, informal note of 25 words or more that covers each of ' +
  'the given content points.';
const LENGTH_TEXT = '25 words or more.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: response length against the minimum. A human scores
 * the rubric, including whether every content point was covered, same as
 * the Writing task.
 */
export default function GuidedWriting({ data, body, languageSwitch }: TemplateProps<'guided-writing'>) {
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

          <Markdown className="prompt no-accent">{data.prompt}</Markdown>

          <div className="cues">
            <h3>{data.pointsHeading}</h3>
            <ul>
              {data.points.map((point, i) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </div>

          <textarea
            {...answerFieldProps}
            className="writing-area"
            rows={6}
            value={text}
            disabled={submitted}
            aria-label={ui.yourResponse(instructionLanguage)}
            placeholder={ui.writeResponseHere(instructionLanguage)}
            onChange={(e) => setText(e.target.value)}
          />

          <p className={`word-count ${tooShort ? 'word-count-off' : count > 0 ? 'word-count-ok' : ''}`}>
            {ui.wordCountMinimum(instructionLanguage, count, unit, data.minWords)}
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
