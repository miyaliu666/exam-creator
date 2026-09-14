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
    'You must answer this question. Write an essay summarizing and evaluating the ' +
    'key points from both texts in 240–280 words. Use your own words throughout as ' +
    'far as possible, and include your own ideas in your answer.',
  es:
    'Debes responder a esta pregunta. Escribe un ensayo que resuma y evalúe los ' +
    'puntos clave de ambos textos en 240 a 280 palabras. Usa tus propias palabras ' +
    'en la medida de lo posible, e incluye tus propias ideas en tu respuesta.',
  zh: '你必须回答这道题。请写一篇文章，用240至280字概括并评价两篇文本的要点。请尽量使用自己的语言，并在答案中加入自己的想法。',
};

/** The "For teachers" panel is fixed — it describes the Two-Text Essay task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests whether the student can summarize and evaluate two short texts, ' +
  'explain which point is more important, and support that opinion with reasons.';
/** Paraphrases the CEFR's own "Overall Written Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.23). Cambridge
 *  uses this task at C2 (Proficiency) only, unlike most of the other writing
 *  tasks in this app, which are pitched at C1 or below. */
const LEVEL_NOTES =
  'C2: Summarize and evaluate two sophisticated, contrasting texts; justify an opinion with reasons.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. Use two texts with a clear, contrasting viewpoint on a ' +
  'familiar topic, expressed in language sophisticated enough to require genuine ' +
  'summarizing and evaluating, not just copying.';
const FORMAT_TEXT =
  'A student reads two short texts, then writes an essay based on points included ' +
  'in them, explaining which of the two points is more important and giving ' +
  'reasons for their opinion.';
const LENGTH_TEXT = '240–280 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length. A human scores the rubric, same as the Writing
 * task.
 */
export default function TwoTextEssay({ data, body, languageSwitch }: TemplateProps<'two-text-essay'>) {
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

          {data.texts.map((t, i) => (
            <div className="passage" lang={instructionLanguage} key={i}>
              <h4>{t.title}</h4>
              <Markdown>{t.body}</Markdown>
            </div>
          ))}

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
