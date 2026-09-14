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
    'Read the question below, then write an essay that states, explains, and ' +
    'supports your opinion. You should aim to write 200–300 words.',
  es:
    'Lee la pregunta a continuación y escribe un ensayo que exprese, explique y ' +
    'respalde tu opinión. Debes intentar escribir entre 200 y 300 palabras.',
  zh: '请阅读下面的问题，写一篇文章陈述、解释并支持你的观点。请尽量写200至300字。',
};

/** The "For teachers" panel is fixed — it describes the Opinion Essay task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests whether the student's opinion is supported with reasons " +
  'and/or examples, as well as their grammar, vocabulary, and organization.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). */
const LEVEL_NOTES =
  'B1: A familiar issue, straightforward opinion with one or two reasons.\n' +
  'B2: An issue requiring a reasoned opinion with supporting examples.\n' +
  'C1: An abstract or controversial issue, nuanced and well-organized argument.\n' +
  'C2: Near-native argument; sophisticated organization, precise register, fine shades of meaning.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. If a time limit is added to this task, it should be ' +
  '30 minutes.';
const FORMAT_TEXT =
  'A student writes an essay in response to a question that asks them to state, ' +
  'explain, and support their opinion on an issue.';
const LENGTH_TEXT = '200–300 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length and required phrases. A human scores the rubric.
 */
export default function OpinionEssay({ data, body, languageSwitch }: TemplateProps<'opinion-essay'>) {
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

          <Markdown className="prompt">{data.prompt}</Markdown>

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
            {ui.wordCountTarget(instructionLanguage, count, unit, data.minWords, data.maxWords)}
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
