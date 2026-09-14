import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, CompactAudioButton, ExerciseShell, Feedback } from '../components/Shell';
import { answerHint, answerValue, directionForLanguage, isCorrect, percentage, resolveMatching } from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She ___ to the store" into ["She ", " to the store"] around each blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Listen to the recording. The transcript below has some words missing: type the missing word in each gap.',
  es: 'Escucha la grabación. En la transcripción de abajo faltan algunas palabras: escribe la palabra que falta en cada espacio.',
  zh: '请听录音。下面的文字稿中有一些词语缺失，请在每个空白处填写缺失的词语。',
};

/** The "For teachers" panel is fixed — it describes the Listening Fill in
 *  the Blanks task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to follow a recording closely ' +
  'enough to recover specific missing words, combining listening ' +
  'comprehension with accurate spelling.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A1: One or two blanks, single very common words, stated clearly, slow pace.\n' +
  'A2: Words stressed clearly in the recording and stated only once, on an everyday topic.\n' +
  'B1: Natural pace, familiar factual topic.\n' +
  'B2: Natural pace, less redundancy in the surrounding text to lean on.\n' +
  'C1: Extended speech on an abstract or complex topic, unsignaled register shifts.\n' +
  'C2: Near-native density; blanks are idiomatic or collocational, not single recoverable words.';
const NOTES =
  'The transcript shown to students must match the audio exactly. Blanked ' +
  'words should be recoverable from the recording itself, not guessable ' +
  'from the surrounding text alone. Autocorrect is disabled.';
const FORMAT_TEXT =
  "A student listens to a recording while reading its transcript on " +
  'screen; the transcript has some words replaced with blanks, and the ' +
  'student types the missing word in each gap.';
const LENGTH_TEXT = 'Transcript up to 100 words, with 4-8 blanks.';

/**
 * Free-text blanks embedded in a full transcript, played back through a
 * play-limited recording — combines the inline-blank mechanic from Word
 * Formation with the audio player from Dictation/Multiple Choice
 * (Listening), rather than hiding the transcript like Dictation does.
 */
export default function ListeningFillInBlanks({
  data,
  body,
  languageSwitch,
}: TemplateProps<'listening-fill-in-blanks'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const parts = segments(data.text);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const canSubmit = data.blanks.every((_, i) => (values[i] ?? '').trim() !== '');
  const score = {
    correct: data.blanks.filter((b, i) => isCorrect(values[i] ?? '', b, matching)).length,
    total: data.blanks.length,
  };

  const reset = () => {
    setValues({});
    setSubmitted(false);
    setPlays(0);
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
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
          <p className="sample-intro" lang={instructionLanguage}>
            {sampleIntro}
          </p>

          <div className="matching-row">
            <CompactAudioButton
              media={data.audio}
              maxPlays={data.maxPlays}
              plays={plays}
              onPlay={() => setPlays((p) => p + 1)}
              lang={instructionLanguage}
            />
          </div>

          <p className="passage" lang={data.language} dir={dir}>
            {parts.map((part, i) => {
              const blank = data.blanks[i];
              const value = values[i] ?? '';
              const right = blank !== undefined ? isCorrect(value, blank, matching) : false;
              return (
                <span key={i}>
                  <bdi>{part}</bdi>
                  {blank !== undefined && (
                    <input
                      {...answerFieldProps}
                      type="text"
                      className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                      value={value}
                      disabled={submitted}
                      size={Math.max(answerValue(blank).length, 6)}
                      aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                      placeholder={answerHint(blank) ?? ''}
                      onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                    />
                  )}
                </span>
              );
            })}
          </p>

          {submitted && (
            <ol className="blank-answers">
              {data.blanks.map((b, i) => {
                const right = isCorrect(values[i] ?? '', b, matching);
                return (
                  <li key={i}>
                    <Feedback correct={right}>
                      {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, answerValue(b))}
                    </Feedback>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || !canSubmit}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && (
            <p className={`score ${percentage(score) >= 60 ? 'score-pass' : 'score-fail'}`}>
              {ui.scoreLine(instructionLanguage, score.correct, score.total, percentage(score))}
            </p>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
