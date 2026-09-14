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
    'Look at the picture below, then describe it in writing. You should aim to ' +
    'write 30–40 words.',
  es:
    'Observa la imagen a continuación y descríbela por escrito. Debes intentar ' +
    'escribir entre 30 y 40 palabras.',
  zh: '请看下面的图片，并用文字描述。请尽量写30至40字。',
};

/** The "For teachers" panel is fixed — it describes the Describe a Picture
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to use descriptive language. The " +
  'pictures shown include depictions of people, animals, and objects in a wide ' +
  'range of contexts.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). */
const LEVEL_NOTES =
  'A1: A single concrete, everyday object, person, or animal.\n' +
  'A2: A picture with a few related elements linked into a simple description.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled.';
const FORMAT_TEXT = 'A student sees an image on screen and describes it in writing.';
const LENGTH_TEXT = '30–40 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length and required phrases. A human scores the rubric,
 * same as the Writing task.
 */
export default function DescribePicture({ data, body, languageSwitch }: TemplateProps<'describe-picture'>) {
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

          <div className="describe-picture-layout">
            <figure className="describe-image-figure">
              <img src={data.image.src} alt={data.image.alt ?? ''} />
              {data.image.credit && <p className="credit">{data.image.credit}</p>}
            </figure>

            <div className="describe-picture-answer">
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

              <p className={`word-count ${tooShort || tooLong ? 'word-count-off' : ''}`}>
                {ui.wordCountTarget(instructionLanguage, count, unit, data.minWords, data.maxWords)}
              </p>

              <div className="controls">
                <button
                  className="btn btn-primary"
                  onClick={() => setSubmitted(true)}
                  disabled={submitted || count === 0}
                >
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
            </div>
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
