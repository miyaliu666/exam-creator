import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    "Read the scenario, then listen to each turn of the conversation. Each time it's " +
    'your turn to speak, choose the response that fits best. You may replay each ' +
    'recording a limited number of times.',
  es:
    'Lee el escenario y luego escucha cada turno de la conversación. Cada vez que sea ' +
    'tu turno de hablar, elige la respuesta que mejor encaje. Puedes volver a escuchar ' +
    'cada grabación un número limitado de veces.',
  zh: '请阅读情境说明，然后听对话的每一轮。每次轮到你发言时，选择最合适的回应。每段录音只能重播有限的次数。',
};

/** The "For teachers" panel is fixed — it describes the Listen and Respond
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to choose the most appropriate ' +
  'spoken response in context, using both the scenario and what the other ' +
  'speaker actually says to judge tone, register, and relevance.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Everyday scenarios (ordering, directions); responses differ in obvious meaning, slow and clear.\n' +
  'B1: Polite or indirect language; distractors are grammatically fine but socially a little off.\n' +
  'B2: Same mechanic, more natural pace and subtlety.\n' +
  'C1: Negotiation, disagreement, or professional register; subtly mismatched responses.\n' +
  'C2: Near-native pragmatics; distractors are wrong only in tone or implicature.';
const NOTES =
  'Each turn has its own distinct recording and play counter. Every ' +
  'response option should be grammatically correct on its own: the wrong ' +
  "ones should fail because they don't fit the situation, not because they " +
  'are broken language. Keep response options a similar length so the ' +
  "correct one isn't given away by length alone.";
const FORMAT_TEXT =
  'A student reads a scenario describing who they are talking with and ' +
  'why, then listens to the other speaker at each turn of the conversation ' +
  'and selects the written response that best continues it.';
const LENGTH_TEXT = 'Three or four turns per conversation, each recording up to 20 seconds, with 3-4 response options each.';

/**
 * A written-response counterpart to the Speaking respond-to-a-situation
 * tasks (Read and Speak, Respond Using Information): the student reads a
 * scenario, then at each turn of a simulated conversation hears the other
 * speaker's line and picks the response that best fits, rather than
 * recording their own. Each turn behaves like a standalone Select Missing
 * Word question, chained together under one shared scenario.
 */
export default function ListenAndRespond({
  data,
  body,
  id,
  languageSwitch,
}: TemplateProps<'listen-and-respond'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selections, setSelections] = useState<(number | null)[]>(() => data.turns.map(() => null));
  const [plays, setPlays] = useState<number[]>(() => data.turns.map(() => 0));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: data.turns.filter((turn, i) => selections[i] === turn.correctIndex).length,
    total: data.turns.length,
  };

  const reset = () => {
    setSelections(data.turns.map(() => null));
    setPlays(data.turns.map(() => 0));
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

          <Markdown className="prompt">{data.scenario}</Markdown>

          {data.turns.map((turn, i) => {
            const chosen = selections[i];
            const right = chosen === turn.correctIndex;
            const showTranscript = turn.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);
            return (
              <div key={i} className="picture-item">
                <div className="matching-row">
                  <span className="matching-row-number">{i + 1}.</span>
                  <CompactAudioButton
                    media={turn.audio}
                    maxPlays={data.maxPlays}
                    plays={plays[i]}
                    onPlay={() => setPlays((prev) => prev.map((p, pi) => (pi === i ? p + 1 : p)))}
                    lang={instructionLanguage}
                  />
                </div>

                <ul className="options">
                  {turn.options.map((opt, oi) => {
                    const isChosen = chosen === oi;
                    const isKey = turn.correctIndex === oi;
                    const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
                    return (
                      <li key={oi}>
                        <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                          <input
                            type="radio"
                            name={`${id}-listen-and-respond-${i}`}
                            checked={isChosen}
                            disabled={submitted}
                            onChange={() => setSelections((prev) => prev.map((s, si) => (si === i ? oi : s)))}
                          />
                          <span lang={data.language} dir={dir}>
                            {opt}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>

                {showTranscript && (
                  <details className="transcript" open={submitted}>
                    <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
                    <Markdown>{turn.transcript!}</Markdown>
                  </details>
                )}

                {submitted && (
                  <Feedback correct={right}>
                    {right ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
                    {turn.explanation ? `: ${turn.explanation}` : ''}
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
