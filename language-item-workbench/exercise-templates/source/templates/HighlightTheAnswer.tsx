import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage, selectionIsCorrect } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read the passage below. Select which question you are answering, then click the sentence in the passage that answers it.',
  es: 'Lee el texto a continuación. Selecciona qué pregunta estás respondiendo y luego haz clic en la oración del texto que la responde.',
  zh: '请阅读下面的文章。选择你要回答的问题，然后点击文章中能回答该问题的句子。',
};

/** The "For teachers" panel is fixed — it describes the Highlight the
 *  Answer task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to locate the exact part of ' +
  'the passage that answers a specific question, rather than to produce ' +
  'or choose a paraphrase of the answer.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short passages; the answer sentence reuses the wording of the question.\n' +
  "B1: Must rule out nearby sentences on a similar topic that don't answer the question.\n" +
  'B2: Same mechanic, denser passage.\n' +
  'C1: The answer is only clear after reading the surrounding sentences for context.\n' +
  'C2: Near-native passage; the answer requires resolving an implicit reference.';
const NOTES =
  'Split the passage into sentence-length spans in `passage`; each ' +
  "question's `correct` field lists the 0-based span index (or indices) " +
  'that together answer it. Exactly two questions per exercise.';
const FORMAT_TEXT =
  'A student is shown a passage and two questions, and highlights the ' +
  'sentence in the passage that answers each one.';
const LENGTH_TEXT = 'Passage of 4-8 sentences, with exactly 2 questions.';

/**
 * The passage doubles as the answer surface: clicking a sentence toggles
 * it into the currently active question's highlighted set. Two questions
 * only (per the task's format), distinguished by two highlight colors so
 * both stay visible at once. Correctness is set-equality on span indices,
 * same mechanic as the checkbox "select all that apply" question in
 * Multiple Choice.
 */
export default function HighlightTheAnswer({ data, body, languageSwitch }: TemplateProps<'highlight-the-answer'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [active, setActive] = useState(0);
  const [selections, setSelections] = useState<number[][]>(() => data.questions.map(() => []));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s.length > 0);
  const score = {
    correct: data.questions.filter((q, i) => selectionIsCorrect(selections[i], q.correct)).length,
    total: data.questions.length,
  };

  const reset = () => {
    setSelections(data.questions.map(() => []));
    setSubmitted(false);
    setActive(0);
  };

  const toggleSpan = (spanIndex: number) => {
    if (submitted) return;
    setSelections((prev) =>
      prev.map((sel, qi) => {
        if (qi !== active) return sel;
        return sel.includes(spanIndex) ? sel.filter((x) => x !== spanIndex) : [...sel, spanIndex];
      }),
    );
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

          <div className="passage" lang={data.language} dir={dir}>
            {data.passage.map((sentence, si) => {
              const inA = selections[0].includes(si);
              const inB = selections[1].includes(si);
              return (
                <span
                  key={si}
                  className={`highlight-span ${inA ? 'highlight-a' : ''} ${inB ? 'highlight-b' : ''}`}
                  onClick={() => toggleSpan(si)}
                >
                  {sentence}{' '}
                </span>
              );
            })}
          </div>

          {data.questions.map((q, qi) => {
            const right = selectionIsCorrect(selections[qi], q.correct);
            const preview = selections[qi]
              .slice()
              .sort((a, b) => a - b)
              .map((i) => data.passage[i])
              .join(' ');
            return (
              <div key={qi} className={`highlight-question ${active === qi && !submitted ? 'active' : ''}`}>
                <button
                  type="button"
                  className={`btn ${active === qi ? 'active' : ''}`}
                  onClick={() => setActive(qi)}
                  disabled={submitted}
                >
                  <span className={`highlight-swatch ${qi === 0 ? 'highlight-a' : 'highlight-b'}`} />
                  {ui.questionLabel(instructionLanguage, qi + 1)}
                </button>
                <Markdown
                  className="question-prompt"
                  lang={instructionLanguage}
                  dir={directionForLanguage(instructionLanguage)}
                >
                  {q.prompt}
                </Markdown>
                <p className="highlight-preview">{ui.highlightedPreview(instructionLanguage, preview)}</p>
                {submitted && (
                  <Feedback correct={right}>
                    {right ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                    {!right && q.explanation ? `: ${q.explanation}` : ''}
                  </Feedback>
                )}
              </div>
            );
          })}

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
