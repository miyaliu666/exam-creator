import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { seededShuffle } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Select an item from the pool, then select the category it belongs to.',
  es: 'Selecciona una expresión del grupo y después la categoría a la que pertenece.',
  zh: '从词库中选择一个词，然后选择它所属的类别。',
};

/** The "For teachers" panel is fixed — it describes the Categorize task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests grammatical categorization, e.g. sorting words or ' +
  'phrases into the correct grammatical class, verb, or usage category based on ' +
  'contextual cues.';
/** Paraphrases the CEFR's own "Grammatical Accuracy" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: Extremely simple, obvious categories.\n' +
  'A2: Simple structures with clear-cut, basic distinctions.\n' +
  'B1: Distinctions students can apply with reasonable accuracy in familiar contexts.\n' +
  'B2: Finer distinctions than B1, still generally reliable.\n' +
  'C1: Subtle distinctions where mistakes are rare and easy to overlook.\n' +
  'C2: Near-native subtlety; distinctions rely on register or usage nuance.';
const NOTES =
  'Items can be moved between categories, or removed back to the pool, at any point ' +
  "before submitting; nothing is locked in until then.";
const FORMAT_TEXT =
  'A student selects an item from the pool, then selects the category it belongs to; ' +
  'items can be removed from a category by clicking them again.';
const LENGTH_TEXT = 'Up to nine items across two or three categories (depending on the level).';

/** Sort a shuffled pool of items into the author's named buckets. */
export default function Categorize({ data, body, id, languageSwitch }: TemplateProps<'categorize'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const pool = useMemo(() => seededShuffle(data.items.map((i) => i.text), id), [data.items, id]);
  const [placed, setPlaced] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const keyFor = (text: string) => data.items.find((i) => i.text === text)!.category;
  const unplaced = pool.filter((text) => !(text in placed));

  const score = {
    correct: data.items.filter((i) => placed[i.text] === i.category).length,
    total: data.items.length,
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setPlaced({});
        setActive(null);
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

          <div className="pool">
            {unplaced.map((text) => (
              <button
                key={text}
                className={`chip ${active === text ? 'chip-active' : ''}`}
                disabled={submitted}
                onClick={() => setActive(active === text ? null : text)}
              >
                {text}
              </button>
            ))}
            {unplaced.length === 0 && <p className="hint">{ui.allItemsPlaced(instructionLanguage)}</p>}
          </div>

          <div className="categories">
            {data.categories.map((category) => (
              <div key={category} className="category">
                <button
                  className="category-head"
                  disabled={submitted || active === null}
                  onClick={() => {
                    if (active === null) return;
                    setPlaced({ ...placed, [active]: category });
                    setActive(null);
                  }}
                >
                  {category}
                </button>
                <ul>
                  {Object.entries(placed)
                    .filter(([, c]) => c === category)
                    .map(([text]) => (
                      <li key={text}>
                        <button
                          className={`chip ${
                            submitted ? (keyFor(text) === category ? 'chip-correct' : 'chip-wrong') : ''
                          }`}
                          disabled={submitted}
                          onClick={() => {
                            const next = { ...placed };
                            delete next[text];
                            setPlaced(next);
                          }}
                          title={ui.removeLabel(instructionLanguage)}
                        >
                          {text}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setPlaced({});
                setActive(null);
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && score.correct < score.total && (
            <ul className="match-answers">
              {data.items
                .filter((i) => placed[i.text] !== i.category)
                .map((i) => (
                  <li key={i.text}>
                    <Feedback correct={false}>
                      {i.text} → {i.category}
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
