import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English.
 *  The word-count target is interpolated per exercise, since Cambridge sets a
 *  different range at each level (see LENGTH_TEXT) — and no maximum at B1. */
const SAMPLE_INTRO: Record<string, (min: number, max: number | undefined) => string> = {
  en: (min, max) =>
    max !== undefined
      ? `Choose one of the tasks below, then write your response in ${min}–${max} words, in an appropriate style.`
      : `Choose one of the tasks below, then write your response in at least ${min} words, in an appropriate style.`,
  es: (min, max) =>
    max !== undefined
      ? `Elige una de las tareas a continuación y escribe tu respuesta en ${min} a ${max} palabras, en un estilo apropiado.`
      : `Elige una de las tareas a continuación y escribe tu respuesta en al menos ${min} palabras, en un estilo apropiado.`,
  zh: (min, max) =>
    max !== undefined
      ? `请从下面的任务中选择一项，然后用${min}至${max}字写出你的回答，风格要恰当。`
      : `请从下面的任务中选择一项，然后至少用${min}字写出你的回答，风格要恰当。`,
};

/** The "For teachers" panel is fixed — it describes the Situational Writing
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests whether the student can write in a register and format ' +
  'appropriate to a specific text type, while covering the content points required ' +
  'by the context, topic, purpose, and target reader.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). Cambridge
 *  uses this task at B1 (Preliminary), B2 (First), C1 (Advanced), and C2
 *  (Proficiency), each with its own word count (see LENGTH_TEXT) and expected
 *  sophistication of register. */
const LEVEL_NOTES =
  'B1: One text type/register, straightforward content points (about 100 words).\n' +
  'B2: Content points needing more organization (140–190 words).\n' +
  'C1: More sophisticated register and content (220–260 words).\n' +
  'C2: Most demanding register and content sophistication (280–320 words).';
const NOTES = 'Writing fewer than the word minimum loses the mark, regardless of content. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student chooses one task from a choice of text types (letter/email, ' +
  'proposal, report, or review), each specifying a context, topic, purpose, and ' +
  'target reader, then writes a response to it.';
const LENGTH_TEXT = '100 words at B1; 140–190 words at B2; 220–260 words at C1; 280–320 words at C2.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length. A human scores the rubric, same as the Writing
 * task.
 */
export default function SituationalWriting({ data, body, languageSwitch }: TemplateProps<'situational-writing'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = (SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en)(data.minWords, data.maxWords);

  const [selected, setSelected] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);

  // CJK curricula count characters (字数); everyone else counts words. Both use
  // Intl.Segmenter so languages without spaces are handled correctly.
  const unit = data.countBy ?? (scriptForLanguage(data.language) === 'cjk' ? 'characters' : 'words');
  const count =
    unit === 'characters' ? countCharacters(text, data.language) : countWords(text, data.language);
  const tooShort = count < data.minWords;
  const tooLong = data.maxWords !== undefined && count > data.maxWords;

  const option = selected !== null ? data.options[selected] : null;

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

          {option === null ? (
            <div className="situational-options">
              {data.options.map((opt, i) => (
                <div className="passage" lang={instructionLanguage} key={i}>
                  <h4>{opt.textType}</h4>
                  <Markdown>{opt.prompt}</Markdown>
                  <button type="button" className="btn btn-primary" onClick={() => setSelected(i)}>
                    {ui.answerThisQuestion(instructionLanguage)}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="passage" lang={instructionLanguage}>
                <h4>{option.textType}</h4>
                <Markdown>{option.prompt}</Markdown>
              </div>

              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  setSelected(null);
                  setText('');
                  setSubmitted(false);
                }}
                disabled={submitted}
              >
                {ui.changeQuestion(instructionLanguage)}
              </button>

              <textarea
                {...answerFieldProps}
                className="writing-area"
                rows={16}
                value={text}
                disabled={submitted}
                aria-label={ui.yourResponse(instructionLanguage)}
                placeholder={ui.writeResponseHere(instructionLanguage)}
                onChange={(e) => setText(e.target.value)}
              />

              <p className={`word-count ${tooShort || tooLong ? 'word-count-off' : ''}`}>
                {data.maxWords !== undefined
                  ? ui.wordCountTarget(instructionLanguage, count, unit, data.minWords, data.maxWords)
                  : ui.wordCountMinimum(instructionLanguage, count, unit, data.minWords)}
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

              {submitted && option.sampleAnswer && (
                <details className="sample-answer" open>
                  <summary>{ui.modelAnswer(instructionLanguage)}</summary>
                  <Markdown>{option.sampleAnswer}</Markdown>
                </details>
              )}
            </>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
