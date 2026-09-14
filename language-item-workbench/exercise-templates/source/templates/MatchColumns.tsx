import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { seededShuffle } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Select an item on the left, then select its match on the right. Some items on the right may not have a match.',
  es: 'Selecciona un elemento de la izquierda y luego su pareja a la derecha. Algunos elementos de la derecha pueden no tener pareja.',
  zh: '先选择左边的一项，然后选择右边与之匹配的一项。右边的部分选项可能没有匹配项。',
};

/** The "For teachers" panel is fixed — it describes the Match the Columns
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests vocabulary or phrase recognition, e.g. matching each ' +
  'item in one column to its correct equivalent or pair in the other, with extra ' +
  'distractors to prevent elimination by exhaustion.';
/** Paraphrases the CEFR's own "Vocabulary Range" descriptor scale (Council
 *  of Europe, Structured overview of all CEFR scales, p.27). */
const LEVEL_NOTES =
  'A1: Very basic, concrete word pairs.\n' +
  'A2: Vocabulary for routine everyday transactions and basic needs.\n' +
  'B1: Vocabulary needed to express oneself on familiar everyday topics.\n' +
  'B2: Broader everyday vocabulary, less directly paired.\n' +
  "C1: Idiomatic expressions/collocations where the pairing isn't obvious from the surface form.\n" +
  'C2: Near-native idiom and collocation range.';
const NOTES =
  'Distractors in the right-hand column are extra items with no correct match; they ' +
  "exist so students can't solve the last pair by elimination alone.";
const FORMAT_TEXT =
  'A student selects an item on the left, then selects its match on the right; unused ' +
  'distractors in the right column have no correct pair.';
const LENGTH_TEXT = 'Up to eight pairs per exercise, plus a few distractors (depending on the level).';

/**
 * Click-to-pair matching: select a left item, then its partner on the right.
 * Uses selection rather than drag-and-drop so it works on touch and keyboard.
 */
export default function MatchColumns({ data, body, id, languageSwitch }: TemplateProps<'match-columns'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [pairing, setPairing] = useState<Record<number, string>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const rightItems = useMemo(
    () => seededShuffle([...data.pairs.map((p) => p.right), ...data.distractors], id),
    [data.pairs, data.distractors, id],
  );

  const takenBy = (right: string) =>
    Object.entries(pairing).find(([, r]) => r === right)?.[0];

  const choose = (right: string) => {
    if (submitted || activeLeft === null) return;
    const next = { ...pairing };
    const previous = takenBy(right);
    if (previous !== undefined) delete next[Number(previous)];
    next[activeLeft] = right;
    setPairing(next);
    setActiveLeft(null);
  };

  const score = {
    correct: data.pairs.filter((p, i) => pairing[i] === p.right).length,
    total: data.pairs.length,
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setPairing({});
        setActiveLeft(null);
        setSubmitted(false);
      }}
      hideMeta
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

          <div className="match-grid">
            <div className="match-column">
              <h3>{data.leftHeading}</h3>
              <ul>
                {data.pairs.map((pair, i) => {
                  const right = pairing[i];
                  const correct = right === pair.right;
                  return (
                    <li key={i}>
                      <button
                        className={`match-item ${activeLeft === i ? 'match-active' : ''} ${
                          submitted ? (correct ? 'match-correct' : 'match-wrong') : ''
                        }`}
                        disabled={submitted}
                        onClick={() => setActiveLeft(activeLeft === i ? null : i)}
                      >
                        <span className="match-label">{pair.left}</span>
                        {right && <span className="match-chip">{right}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="match-column">
              <h3>{data.rightHeading}</h3>
              <ul>
                {rightItems.map((right) => (
                  <li key={right}>
                    <button
                      className={`match-item ${takenBy(right) !== undefined ? 'match-used' : ''}`}
                      disabled={submitted || activeLeft === null}
                      onClick={() => choose(right)}
                    >
                      {right}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPairing({});
                setActiveLeft(null);
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && (
            <ul className="match-answers">
              {data.pairs.map((pair, i) => (
                <li key={i}>
                  <Feedback correct={pairing[i] === pair.right}>
                    {pair.left} → {pair.right}
                  </Feedback>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
