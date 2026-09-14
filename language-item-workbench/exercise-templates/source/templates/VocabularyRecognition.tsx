import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'You will see one word at a time. Decide whether each word is a real word or ' +
    'an invented one that only looks real.',
  es:
    'Verás una palabra a la vez. Decide si cada palabra es una palabra real o una ' +
    'inventada que solo lo parece.',
  zh: '你将逐个看到单词。请判断每个词是真实存在的词，还是只是看起来像真的、实际上是编造出来的词。',
};

/** The "For teachers" panel is fixed — it describes the Vocabulary
 *  Recognition task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests vocabulary breadth and word recognition: whether the student ' +
  'can distinguish real words from invented, language-like non-words.';
/** Paraphrases the CEFR's own "Vocabulary range" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.16). */
const LEVEL_NOTES =
  'A1: Very high-frequency words; non-words are clearly implausible.\n' +
  'A2: Same range as A1.\n' +
  'B1: Less frequent words; non-words follow normal spelling patterns closely.\n' +
  'B2: Same range as B1.\n' +
  'C1: Low-frequency or specialized words; non-words are hard to tell apart without real knowledge.\n' +
  'C2: Same range as C1, at the outer edge of vocabulary rarity.';
const NOTES =
  'This task consists of a set of 15-18 words. Invented words should look ' +
  'plausible: they should follow normal spelling and sound patterns rather than ' +
  'being random letter strings. Mix real and invented words throughout the set ' +
  'rather than grouping them.';
const FORMAT_TEXT =
  'A student sees one word at a time and decides whether it is a real word or an ' +
  'invented non-word; once answered, the student moves to the next word and ' +
  'cannot go back.';
const LENGTH_TEXT = '15-18 words per exercise.';

/**
 * Production task — auto-graded. Words are shown one at a time; each answer
 * is locked in immediately, matching the real "one at a time, no going back"
 * format of a lexical-decision vocabulary test.
 */
export default function VocabularyRecognition({
  data,
  body,
  languageSwitch,
}: TemplateProps<'vocabulary-recognition'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [answers, setAnswers] = useState<boolean[]>([]);
  const index = answers.length;
  const submitted = index >= data.words.length;

  const score = {
    correct: answers.filter((a, i) => a === data.words[i].isReal).length,
    total: data.words.length,
  };

  const answer = (choice: boolean) => {
    if (submitted) return;
    setAnswers((prev) => [...prev, choice]);
  };

  const reset = () => setAnswers([]);

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      onSubmit={() => {}}
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

          {!submitted ? (
            <div className="vocab-word-card">
              <p className="vocab-progress">{ui.wordProgress(instructionLanguage, index + 1, data.words.length)}</p>
              <p className="vocab-word" lang={data.language} dir={dir}>
                {data.words[index].word}
              </p>
              <div className="controls">
                <button className="btn btn-primary" onClick={() => answer(true)}>
                  {ui.realWord(instructionLanguage)}
                </button>
                <button className="btn" onClick={() => answer(false)}>
                  {ui.fakeWord(instructionLanguage)}
                </button>
              </div>
            </div>
          ) : (
            <>
              <ul className="vocab-review">
                {data.words.map((w, i) => {
                  const correct = answers[i] === w.isReal;
                  return (
                    <li key={i} className={correct ? 'ord-correct' : 'ord-wrong'}>
                      <span className="vocab-review-word" lang={data.language} dir={dir}>
                        {w.word}
                      </span>
                      <span className="vocab-review-note">
                        {correct
                          ? `${ui.yourGuess(instructionLanguage)}: ${
                              answers[i] ? ui.realWord(instructionLanguage) : ui.fakeWord(instructionLanguage)
                            }`
                          : w.isReal
                            ? ui.wasRealWord(instructionLanguage)
                            : ui.wasFakeWord(instructionLanguage)}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <p className={`word-count ${percentage(score) >= 60 ? 'word-count-ok' : 'word-count-off'}`}>
                {ui.scoreLine(instructionLanguage, score.correct, score.total, percentage(score))}
              </p>

              <div className="controls">
                <button className="btn" onClick={reset}>
                  {ui.reset(instructionLanguage)}
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
