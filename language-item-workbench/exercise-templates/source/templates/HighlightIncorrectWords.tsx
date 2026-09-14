import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage, percentage, scriptForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'A transcript of the recording is shown below. While listening, click every word in the transcript that is different from what is spoken.',
  es: 'A continuación se muestra la transcripción de la grabación. Mientras escuchas, haz clic en cada palabra de la transcripción que sea diferente de lo que se dice.',
  zh: '下面是录音的文字稿。请在听录音的同时，点击文字稿中与实际读音不同的每一个词。',
};

/** The "For teachers" panel is fixed — it describes the Highlight
 *  Incorrect Words task type itself, not any one exercise's content, so
 *  it must read the same no matter which language/level variant is
 *  currently selected. Only the Sample below it changes with the active
 *  variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to follow a recording closely ' +
  'enough to notice small discrepancies between what is written and what ' +
  'is actually said, rather than simply understanding the general meaning.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Clearly unrelated substitute words, spoken slowly.\n' +
  'B1: Substitutions from the same category (another day, another number), natural pace.\n' +
  'B2: Same-category substitutions, faster natural pace.\n' +
  'C1: Close synonyms or similar-sounding words in denser, faster speech.\n' +
  'C2: Near-native pace; substitutions are subtle register or connotation shifts.';
const NOTES =
  'Every altered word must remain grammatically valid in its position, so ' +
  'the mismatch can only be caught by listening, not by reading the ' +
  'transcript alone. Scoring counts how many of the actual mismatches the ' +
  'student correctly identifies; words wrongly flagged are marked but do ' +
  'not need to reduce the score.';
const FORMAT_TEXT =
  'A transcript of the recording appears on screen with a number of ' +
  'words changed from what is actually spoken. While listening, the ' +
  'student clicks every word in the transcript that differs from the ' +
  'recording.';
const LENGTH_TEXT = 'Recording up to 60 seconds, with 3-6 altered words.';

/**
 * A transcript rendered as individually clickable word spans, alongside a
 * play-limited recording whose true wording differs from the displayed
 * transcript at a few points — the student toggles the words they believe
 * were changed. Grading counts how many of the actual mismatches were
 * caught, using the same click-to-select mechanic as Highlight the Answer
 * but scored per word instead of per question.
 */
export default function HighlightIncorrectWords({
  data,
  body,
  languageSwitch,
}: TemplateProps<'highlight-incorrect-words'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const spaceBetweenWords = scriptForLanguage(data.language) !== 'cjk';

  const [selected, setSelected] = useState<number[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const incorrectSet = new Set(data.incorrectIndices);
  const score = {
    correct: data.incorrectIndices.filter((i) => selected.includes(i)).length,
    total: data.incorrectIndices.length,
  };

  const reset = () => {
    setSelected([]);
    setSubmitted(false);
    setPlays(0);
  };

  const toggleWord = (i: number) => {
    if (submitted) return;
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));
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
            {data.words.map((word, i) => {
              const isSelected = selected.includes(i);
              const isIncorrect = incorrectSet.has(i);
              const state = !submitted
                ? isSelected
                  ? 'word-selected'
                  : ''
                : isSelected && isIncorrect
                  ? 'word-correct'
                  : isSelected && !isIncorrect
                    ? 'word-wrong'
                    : !isSelected && isIncorrect
                      ? 'word-missed'
                      : '';
              return (
                <span
                  key={i}
                  className={`highlight-word ${spaceBetweenWords ? '' : 'highlight-word-tight'} ${state}`}
                  onClick={() => toggleWord(i)}
                >
                  {word}
                  {spaceBetweenWords && ' '}
                </span>
              );
            })}
          </p>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || selected.length === 0}>
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

          {submitted && (
            <Feedback correct={score.correct === score.total}>
              {score.correct === score.total ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
            </Feedback>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
