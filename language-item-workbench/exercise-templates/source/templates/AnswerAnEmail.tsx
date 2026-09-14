import { useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Markdown } from '../components/Shell';
import { scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { countCharacters, countWords } from '../lib/segment';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the email below, then write a reply covering the points listed. You should aim to write 80–120 words.',
  es:
    'Lee el correo a continuación y escribe una respuesta que cubra los puntos ' +
    'indicados. Debes intentar escribir entre 80 y 120 palabras.',
  zh: '请阅读下面的邮件，然后写一封回复，涵盖列出的要点。请尽量写80至120字。',
};

/** The "For teachers" panel is fixed — it describes the Answer an Email task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests clear, appropriate written communication, focusing on the ' +
  "quality and variety of the student's sentences, vocabulary, and organization.";
/** Paraphrases the CEFR's own "Correspondence" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.24). */
const LEVEL_NOTES =
  'A1: Reply using a few simple words or phrases about a familiar topic.\n' +
  'A2: Simple phrases and sentences with basic connectors.\n' +
  'B1: Straightforward connected reply, a linear sequence.\n' +
  'B2: Clear, detailed reply that synthesizes information from multiple sources.\n' +
  'C1: Nuanced, professionally toned reply; precise register and more complex structures.';
const NOTES =
  'Writing fewer than the word minimum loses the mark, regardless of content. ' +
  'Autocorrect is disabled. If a time limit is added to this task, it should be ' +
  '10 minutes.';
const FORMAT_TEXT =
  'A student reads an email and writes a reply covering 2-3 given points, within ' +
  'a target length.';
const LENGTH_TEXT = '80–120 words.';

/**
 * Production task — not auto-graded. The renderer checks only what a machine
 * can check honestly: length and required phrases. A human scores the rubric.
 */
export default function AnswerAnEmail({ data, body, languageSwitch }: TemplateProps<'answer-an-email'>) {
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

          {data.context && (
            <p className="email-context" lang={instructionLanguage}>
              {data.context}
            </p>
          )}

          <div className="passage email-received" lang={instructionLanguage}>
            <p className="email-meta">
              <strong>{ui.emailFrom(instructionLanguage)}:</strong> {data.email.from}
            </p>
            <p className="email-meta">
              <strong>{ui.emailSubject(instructionLanguage)}:</strong> {data.email.subject}
            </p>
            <Markdown>{data.email.body}</Markdown>
          </div>

          <p className="email-points">{ui.yourEmailShould(instructionLanguage, data.points)}</p>

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
