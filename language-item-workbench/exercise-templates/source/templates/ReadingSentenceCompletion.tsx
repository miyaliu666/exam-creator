import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import {
  answerHint,
  answerValue,
  directionForLanguage,
  isCorrect,
  percentage,
  resolveMatching,
} from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She ___ to the market" into ["She ", " to the market"] around the blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. The word limit is
 *  interpolated per exercise, since it's a schema-level constraint, not a
 *  fixed rule of the task type. */
const SAMPLE_INTRO: Record<string, (maxWords?: number) => string> = {
  en: (maxWords) =>
    'Read the passage below, then complete each sentence by choosing words from the text.' +
    (maxWords ? ` Use no more than ${maxWords} word${maxWords > 1 ? 's' : ''} for each answer.` : ''),
  es: (maxWords) =>
    'Lee el texto a continuación y completa cada oración usando palabras del texto.' +
    (maxWords ? ` Usa como máximo ${maxWords} palabra${maxWords > 1 ? 's' : ''} por respuesta.` : ''),
  zh: (maxWords) => `请阅读下面的文章，然后使用文中的词语完成每个句子。${maxWords ? `每个答案最多使用${maxWords}个词。` : ''}`,
};

/** The "For teachers" panel is fixed — it describes the Sentence Completion
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS = 'This type of question tests your ability to find detail and specific information in a text.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Stems reuse the same words as the passage.\n' +
  'B1: Stems require locating the right part of the passage among several similar details.\n' +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Stems distinguish the exact needed detail from closely related nearby information.\n' +
  'C2: Near-native passage; fine discrimination among closely related details.';
const NOTES = 'Each answer must be a word or short phrase copied directly from the passage, not a paraphrase.';
const FORMAT_TEXT =
  'A student reads a passage, then fills in a gap in each sentence by ' +
  'choosing words directly from the text.';
const LENGTH_TEXT = 'Passage up to 200 words, with 4-6 sentences to complete.';

/**
 * One inline blank per sentence stem, laid out side by side (passage sticky
 * on one side, sentences on the other) so both stay viewable at the same
 * time — same UI/UX rationale as the other reading tasks in this app.
 * Reuses the free-text matching mechanic from Short-answer Questions, but
 * the blank sits inside a sentence rather than below a separate prompt.
 */
export default function ReadingSentenceCompletion({
  data,
  body,
  languageSwitch,
}: TemplateProps<'reading-sentence-completion'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = (SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en)(data.maxWordsPerBlank);
  const dir = directionForLanguage(data.language);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = {
    correct: data.items.filter((item, i) => isCorrect(values[i] ?? '', item.answer, matching)).length,
    total: data.items.length,
  };

  const reset = () => {
    setValues({});
    setSubmitted(false);
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

          <div className="reading-columns">
            <div className="passage">
              <h3>{ui.passageLabel(instructionLanguage)}</h3>
              <Markdown lang={data.language} dir={dir}>
                {data.passage}
              </Markdown>
            </div>

            <div className="reading-questions-col">
              <ol className="blank-items" lang={data.language} dir={dir}>
                {data.items.map((item, i) => {
                  const parts = segments(item.text);
                  const value = values[i] ?? '';
                  const right = isCorrect(value, item.answer, matching);
                  return (
                    <li key={i} className="blank-item">
                      <p className="blank-line">
                        <bdi>{parts[0]}</bdi>
                        <input
                          {...answerFieldProps}
                          className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                          type="text"
                          value={value}
                          disabled={submitted}
                          size={Math.max([...answerValue(item.answer)].length, 6)}
                          aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                          placeholder={answerHint(item.answer) ?? ''}
                          onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                        />
                        <bdi>{parts[1]}</bdi>
                      </p>
                      {submitted && (
                        <Feedback correct={right}>
                          {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, answerValue(item.answer))}
                        </Feedback>
                      )}
                    </li>
                  );
                })}
              </ol>

              <div className="controls">
                <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
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
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
