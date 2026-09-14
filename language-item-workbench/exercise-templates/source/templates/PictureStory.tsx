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
    'Look at the three pictures below, in order, then write a short story based on ' +
    'them. You should aim to write at least 35 words.',
  es:
    'Observa las tres imágenes a continuación, en orden, y luego escribe una ' +
    'historia corta basada en ellas. Debes intentar escribir al menos 35 palabras.',
  zh: '请按顺序看下面的三张图片，然后根据它们写一个小故事。请尽量写至少35字。',
};

/** The "For teachers" panel is fixed — it describes the Picture Story task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests whether the student can build a coherent short narrative from a ' +
  'sequence of picture prompts.';
/** Paraphrases the CEFR's own "Creative Writing" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.25). Cambridge
 *  uses this task at A2 (Flyers) only. */
const LEVEL_NOTES =
  'A2: Three pictures, a very simple, clearly linear sequence of everyday events.';
const NOTES = 'Writing fewer than the word minimum loses the mark, regardless of content. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student writes a short story based on three picture prompts, using them in order.';
const LENGTH_TEXT = 'A minimum of 35 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length. A human scores the rubric, same as the Writing
 * task.
 */
export default function PictureStory({ data, body, languageSwitch }: TemplateProps<'picture-story'>) {
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

          <div className="picture-story-images">
            {data.images.map((image, i) => (
              <figure className="describe-image-figure" key={i}>
                <img src={image.src} alt={image.alt ?? ''} />
                {image.credit && <p className="credit">{image.credit}</p>}
              </figure>
            ))}
          </div>

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
