import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Look at the picture below. Write one sentence about it using both of the ' +
    'given words. You can change the form of the words and use them in any order.',
  es:
    'Observa la imagen a continuación. Escribe una oración sobre ella usando las ' +
    'dos palabras dadas. Puedes cambiar la forma de las palabras y usarlas en ' +
    'cualquier orden.',
  zh: '请看下面的图片。使用给出的两个词写一句话。你可以改变词语的形式，并按任意顺序使用。',
};

/** The "For teachers" panel is fixed — it describes the Picture Sentence
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS = 'This task tests grammar and the relevance of the sentence to the picture.';
/** Paraphrases the CEFR's own "Grammatical Accuracy" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: A single concrete object/person/animal, with two very common, high-frequency words.\n' +
  'A2: A little more context, with two words that may need a simple form change.';
const NOTES = 'Autocorrect is disabled. The words can be used in any form and in any order.';
const FORMAT_TEXT =
  'A student writes one sentence about a picture, using two given words or ' +
  'phrases in any form or order.';
const LENGTH_TEXT = 'One sentence per picture.';

/**
 * Production task — not auto-graded. A student's sentence can use either
 * given word in any inflected form (tense, plural, etc.), so exact-match
 * checking isn't meaningful here; a human scores the rubric, same as the
 * Writing task.
 */
export default function PictureSentence({ data, body, languageSwitch }: TemplateProps<'picture-sentence'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const hasAnswer = value.trim().length > 0;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={hasAnswer}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setValue('');
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

          <figure className="describe-image-figure">
            <img src={data.image.src} alt={data.image.alt ?? ''} />
            {data.image.credit && <p className="credit">{data.image.credit}</p>}
          </figure>

          <div className="cues">
            <h3>{ui.useTheseWords(instructionLanguage)}</h3>
            <ul>
              {data.words.map((word, i) => (
                <li key={i}>{word}</li>
              ))}
            </ul>
          </div>

          <input
            {...answerFieldProps}
            type="text"
            className="dictation-input"
            value={value}
            disabled={submitted}
            aria-label={ui.yourAnswer(instructionLanguage)}
            placeholder={ui.typeSentenceHere(instructionLanguage)}
            onChange={(e) => setValue(e.target.value)}
            lang={data.language}
            dir={dir}
          />

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || !hasAnswer}>
              {ui.submitForReview(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setValue('');
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
