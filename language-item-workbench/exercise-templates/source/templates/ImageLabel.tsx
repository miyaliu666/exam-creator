import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback } from '../components/Shell';
import { CharacterHelper } from '../components/CharacterHelper';
import { answerHint, answerValue, isCorrect, resolveMatching } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Look at each image and type the word it shows.',
  fr: 'Regardez chaque image et écrivez le mot correspondant.',
  es: 'Mira cada imagen y escribe la palabra que representa.',
  zh: '看每张图片，写出图片所表示的单词。',
};

/** The "For teachers" panel is fixed — it describes the Label the Images
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests recall of concrete vocabulary, e.g. naming an object ' +
  'shown in an image, including any required grammatical article or determiner.';
/** Paraphrases the CEFR's own "Vocabulary Range" descriptor scale (Council
 *  of Europe, Structured overview of all CEFR scales, p.27). */
const LEVEL_NOTES =
  'A1: Extremely common, concrete object or animal vocabulary.\n' +
  'A2: Concrete everyday objects and situations, common words.\n' +
  'B1: Labels needing a little circumlocution or a wider everyday vocabulary.\n' +
  'B2: Broader vocabulary range still tied to concrete images.\n' +
  'C1: Less common or specialized vocabulary.\n' +
  'C2: Rare or technical vocabulary requiring precise naming.';
const NOTES =
  'Accepted answers can include multiple forms per item (e.g. with or without an ' +
  'article); set these as alternatives on each answer.';
const FORMAT_TEXT =
  'A student types the word each image depicts; alternative spellings or forms can ' +
  'be accepted per exercise.';
const LENGTH_TEXT = 'Up to eight images per exercise (depending on the level).';

/** A grid of images; the student types the word each one depicts. */
export default function ImageLabel({ data, body, languageSwitch }: TemplateProps<'image-label'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const matching = useMemo(
    () => resolveMatching(data.language, data.matching),
    [data.language, data.matching],
  );

  const graded = data.items.map((item, i) =>
    item.answers.some((a) => isCorrect(values[i] ?? '', a, matching)),
  );

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={{ correct: graded.filter(Boolean).length, total: data.items.length }}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setValues({});
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

          {!submitted && <CharacterHelper language={data.language} />}

          <div className="image-grid">
            {data.items.map((item, i) => (
              <figure key={i} className="image-card">
                <img src={item.image.src} alt={submitted ? (item.image.alt ?? '') : ''} />
                <figcaption>
                  {item.prompt && <p className="image-prompt">{item.prompt}</p>}
                  <input
                    {...answerFieldProps}
                    type="text"
                    className={`blank ${submitted ? (graded[i] ? 'blank-correct' : 'blank-wrong') : ''}`}
                    value={values[i] ?? ''}
                    disabled={submitted}
                    aria-label={item.prompt ?? ui.imageLabelFallback(instructionLanguage, i + 1)}
                    placeholder={answerHint(item.answers[0]) ?? ui.typeTheWord(instructionLanguage)}
                    onChange={(e) => setValues({ ...values, [i]: e.target.value })}
                  />
                  {submitted && (
                    <Feedback correct={graded[i]}>
                      {graded[i] ? ui.correct(instructionLanguage) : ui.answerWas(instructionLanguage, answerValue(item.answers[0]))}
                    </Feedback>
                  )}
                  {item.image.credit && <p className="credit">{item.image.credit}</p>}
                </figcaption>
              </figure>
            ))}
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setValues({});
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
