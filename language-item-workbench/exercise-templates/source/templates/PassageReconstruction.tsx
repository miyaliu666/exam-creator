import { useEffect, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

type Stage = 'reading' | 'writing';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to
 *  English. Differs by stage: the passage disappears once reading time
 *  runs out, so the instruction changes with it. */
const SAMPLE_INTRO_READING: Record<string, string> = {
  en: "Read the passage below. It will disappear once the time shown runs out, so read it carefully.",
  es: 'Lee el texto a continuación. Desaparecerá cuando se acabe el tiempo indicado, así que léelo con atención.',
  zh: '请阅读下面的文章。文章会在显示的时间结束后消失，请仔细阅读。',
};
const SAMPLE_INTRO_WRITING: Record<string, string> = {
  en: 'Now write what you remember from the passage, in your own words.',
  es: 'Ahora escribe lo que recuerdes del texto, con tus propias palabras.',
  zh: '现在请用自己的话写出你记得的文章内容。',
};

/** The "For teachers" panel is fixed — it describes the Passage
 *  Reconstruction task type itself, not any one exercise's content, so it
 *  must read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests memory and written reproduction: whether the student can ' +
  'reproduce the key points and details of a passage, using grammatically ' +
  'correct and well-organized writing, once it is no longer visible.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). */
const LEVEL_NOTES =
  'A2: Two or three simple, concrete facts to reproduce.\n' +
  'B1: Several connected details with a clear structure.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Numerous or abstract details requiring genuine synthesis, not word-for-word recall.\n' +
  'C2: Near-native density; reproduction must preserve nuance and register, not just facts.';
const NOTES =
  'Scoring should reward accurate reproduction of the key content and ' +
  'grammatical correctness, not verbatim matching of the original wording. ' +
  'Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student reads a passage for a fixed time, after which it is hidden, then ' +
  'writes what they can remember from it within a limited time.';
const LENGTH_TEXT = 'Passage up to 60 words to read; response length set per exercise.';

/**
 * Two-stage production task: the passage is shown with a reading countdown,
 * then automatically hidden and replaced with a writing area once time runs
 * out — there is no way to go back and re-read it, matching the real task's
 * memory-reconstruction premise.
 */
export default function PassageReconstruction({
  data,
  body,
  languageSwitch,
}: TemplateProps<'passage-reconstruction'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;

  const [stage, setStage] = useState<Stage>('reading');
  const [readingLeft, setReadingLeft] = useState(data.readSeconds);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // Reading countdown — reaching zero hides the passage and moves to writing.
  useEffect(() => {
    if (stage !== 'reading') return;
    if (readingLeft <= 0) {
      setStage('writing');
      return;
    }
    const t = setTimeout(() => setReadingLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, readingLeft]);

  const unit = data.countBy ?? (scriptForLanguage(data.language) === 'cjk' ? 'characters' : 'words');
  const count =
    unit === 'characters' ? countCharacters(text, data.language) : countWords(text, data.language);
  const tooShort = data.minWords !== undefined && count < data.minWords;

  const reset = () => {
    setStage('reading');
    setReadingLeft(data.readSeconds);
    setText('');
    setSubmitted(false);
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={count > 0}
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
          {stage === 'reading' ? (
            <>
              <p className="sample-intro" lang={instructionLanguage}>
                {(SAMPLE_INTRO_READING[instructionLanguage] ?? SAMPLE_INTRO_READING.en)}
              </p>
              <Markdown className="passage" lang={data.language}>
                {data.passage}
              </Markdown>
              <p className="prep">{ui.readingTime(instructionLanguage, readingLeft)}</p>
            </>
          ) : (
            <>
              <p className="sample-intro" lang={instructionLanguage}>
                {(SAMPLE_INTRO_WRITING[instructionLanguage] ?? SAMPLE_INTRO_WRITING.en)}
              </p>

              <textarea
                {...answerFieldProps}
                className="writing-area"
                rows={10}
                value={text}
                disabled={submitted}
                aria-label={ui.yourResponse(instructionLanguage)}
                placeholder={ui.writeResponseHere(instructionLanguage)}
                onChange={(e) => setText(e.target.value)}
              />

              <p className={`word-count ${tooShort ? 'word-count-off' : count > 0 ? 'word-count-ok' : ''}`}>
                {data.minWords !== undefined
                  ? ui.wordCountMinimum(instructionLanguage, count, unit, data.minWords)
                  : ui.wordCount(instructionLanguage, count, unit)}
              </p>

              <div className="controls">
                <button
                  className="btn btn-primary"
                  onClick={() => setSubmitted(true)}
                  disabled={submitted || count === 0}
                >
                  {ui.submitForReview(instructionLanguage)}
                </button>
                <button className="btn" onClick={reset}>
                  {ui.reset(instructionLanguage)}
                </button>
              </div>

              {submitted && data.sampleAnswer && (
                <details className="sample-answer" open>
                  <summary>{ui.modelAnswer(instructionLanguage)}</summary>
                  <Markdown>{data.sampleAnswer}</Markdown>
                </details>
              )}
            </>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
