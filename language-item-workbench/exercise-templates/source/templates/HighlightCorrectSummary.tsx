import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Listen to each recording, then choose the paragraph that best summarizes it. You may replay each recording a limited number of times.',
  es: 'Escucha cada grabación y elige el párrafo que mejor la resuma. Puedes volver a escuchar cada grabación un número limitado de veces.',
  zh: '请听每段录音，然后选择最能概括其内容的段落。每段录音只能重播有限的次数。',
};

/** The "For teachers" panel is fixed — it describes the Highlight Correct
 *  Summary task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to grasp the overall gist of ' +
  'a recording, rather than just isolated details, recognizing a genuine ' +
  'summary of the whole recording as distinct from a paragraph that is ' +
  'accurate but too narrow, too broad, or subtly wrong.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Short everyday-topic recordings; wrong summaries describe something never mentioned.\n' +
  'B1: Incorrect summaries each capture one real detail while missing the overall point.\n' +
  'B2: Same mechanic, denser recording and options.\n' +
  'C1: Denser recordings; wrong options misstate or exaggerate a detail.\n' +
  'C2: Near-native register; distractors turn on emphasis or nuance rather than a checkable fact.';
const NOTES =
  'Exactly three recordings per exercise, each with its own distinct audio ' +
  'and play counter, and exactly three summary options each. The two ' +
  'incorrect options should each be plausible in a different way: one ' +
  'that fixates on a single supporting detail, and one that overstates or ' +
  'misstates something the recording said, rather than two variations on ' +
  'the same flaw. Keep all three options a similar length; a correct ' +
  'answer that is noticeably longer or shorter than the distractors gives ' +
  'the answer away without listening.';
const FORMAT_TEXT =
  'A student listens to a short recording, then selects the paragraph ' +
  'that best summarizes its overall content from three options; this is ' +
  'repeated for three separate recordings.';
const LENGTH_TEXT = 'Three recordings, each up to 45 seconds, with exactly 3 paragraph-length options each.';

/**
 * Three independent recordings, each with its own play-limited audio
 * player and a set of three paragraph-length summary options — the
 * listening counterpart to Title the Passage/Identify the Idea, extended
 * to multiple items the way Dictation and Listen and Choose the Picture
 * give each item its own distinct audio.
 */
export default function HighlightCorrectSummary({
  data,
  body,
  id,
  languageSwitch,
}: TemplateProps<'highlight-correct-summary'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<(number | null)[]>(() => data.items.map(() => null));
  const [plays, setPlays] = useState<number[]>(() => data.items.map(() => 0));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: data.items.filter((item, i) => selections[i] === item.correctIndex).length,
    total: data.items.length,
  };

  const reset = () => {
    setSelections(data.items.map(() => null));
    setPlays(data.items.map(() => 0));
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

          {data.items.map((item, i) => {
            const chosen = selections[i];
            const right = chosen === item.correctIndex;
            const showTranscript = item.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);
            return (
              <div key={i} className="picture-item">
                <div className="matching-row">
                  <span className="matching-row-number">{i + 1}.</span>
                  <CompactAudioButton
                    media={item.audio}
                    maxPlays={data.maxPlays}
                    plays={plays[i]}
                    onPlay={() => setPlays((prev) => prev.map((p, pi) => (pi === i ? p + 1 : p)))}
                    lang={instructionLanguage}
                  />
                </div>

                <ul className="options">
                  {item.options.map((opt, oi) => {
                    const isChosen = chosen === oi;
                    const isKey = item.correctIndex === oi;
                    const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
                    return (
                      <li key={oi}>
                        <label className={`option option-paragraph ${isChosen ? 'option-chosen' : ''} ${state}`}>
                          <input
                            type="radio"
                            name={`${id}-highlight-correct-summary-${i}`}
                            checked={isChosen}
                            disabled={submitted}
                            onChange={() => setSelections((prev) => prev.map((s, si) => (si === i ? oi : s)))}
                          />
                          <Markdown lang={data.language} dir={dir}>
                            {opt}
                          </Markdown>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {showTranscript && (
                  <details className="transcript" open={submitted}>
                    <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
                    <Markdown>{item.transcript!}</Markdown>
                  </details>
                )}

                {submitted && (
                  <Feedback correct={right}>
                    {right ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                    {item.explanation ? `: ${item.explanation}` : ''}
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
