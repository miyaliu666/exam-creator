import { useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Read each section of the passage below, then choose the heading that best matches it from the drop-down menu. Not all headings will be used.',
  es: 'Lee cada sección del texto a continuación y elige en el menú desplegable el título que mejor la describa. No se usarán todos los títulos.',
  zh: '请阅读下面文章的每一部分，然后从下拉菜单中选择与之最匹配的标题。并非所有标题都会被使用。',
};

/** The "For teachers" panel is fixed — it describes the Matching Headings
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to identify the general topic ' +
  'of a paragraph (or section) and to recognize the difference between the ' +
  'main idea and a supporting idea.';
/** Paraphrases the CEFR's own "Overall Reading Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.10). */
const LEVEL_NOTES =
  'A2: Short sections; headings are clearly about different topics.\n' +
  'B1: Some distractor headings describe a supporting detail rather than the main idea.\n' +
  'B2: Same mechanic, denser sections.\n' +
  'C1: Dense sections; distractor headings are plausible paraphrases that miss the overall point.\n' +
  'C2: Near-native passage; headings differ only by emphasis or tone.';
const NOTES =
  'Include more headings than sections, so that some headings are never ' +
  'used, which prevents students from matching the last section by ' +
  'elimination alone.';
const FORMAT_TEXT =
  'A student reads a passage split into labeled sections, then chooses the ' +
  'best-fitting heading for each section from a shared drop-down list of ' +
  'headings.';
const LENGTH_TEXT = '3-6 sections per exercise, with at least one more heading than there are sections.';

/**
 * One heading drop-down per passage section, laid out side by side (passage
 * sticky on one side, headings on the other) so both stay viewable at the
 * same time — same UI/UX rationale as the other reading tasks in this app.
 * Correctness is a direct index comparison, same as Choose the Word.
 */
export default function MatchingHeadings({ data, body, id, languageSwitch }: TemplateProps<'matching-headings'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<(number | null)[]>(() => Array(data.sections.length).fill(null));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: selections.filter((s, i) => s === data.sections[i].correct).length,
    total: data.sections.length,
  };

  const reset = () => {
    setSelections(Array(data.sections.length).fill(null));
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
              {data.sections.map((s, i) => (
                <div key={i} className={i > 0 ? 'passage-section' : undefined}>
                  <h4 className="passage-section-label">{s.label}</h4>
                  <Markdown lang={data.language} dir={dir}>
                    {s.text}
                  </Markdown>
                </div>
              ))}
            </div>

            <div className="reading-questions-col">
              <ol className="questions">
                {data.sections.map((s, i) => {
                  const right = selections[i] === s.correct;
                  return (
                    <li key={i} className="question">
                      <p className="question-prompt">
                        <strong>{s.label}</strong>
                      </p>
                      <select
                        className={`blank blank-block ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                        value={selections[i] ?? ''}
                        disabled={submitted}
                        name={`${id}-heading-${i}`}
                        aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${s.label}`}
                        onChange={(e) => {
                          const value = e.target.value === '' ? null : Number(e.target.value);
                          setSelections((prev) => prev.map((sel, si) => (si === i ? value : sel)));
                        }}
                      >
                        <option value="" disabled>
                          {ui.selectPlaceholder(instructionLanguage)}
                        </option>
                        {data.headings.map((h, hi) => (
                          <option key={hi} value={hi}>
                            {h}
                          </option>
                        ))}
                      </select>

                      {submitted && (
                        <Feedback correct={right}>
                          {right
                            ? ui.correct(instructionLanguage)
                            : ui.notQuiteExpected(instructionLanguage, data.headings[s.correct])}
                        </Feedback>
                      )}
                    </li>
                  );
                })}
              </ol>

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
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
