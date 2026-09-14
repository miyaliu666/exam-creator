import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Listen to each short dialogue, then choose the picture it matches. You may replay each recording a limited number of times.',
  es: 'Escucha cada diálogo breve y elige la imagen que corresponde. Puedes volver a escuchar cada grabación un número limitado de veces.',
  zh: '请听每段简短对话，然后选择与之相符的图片。每段录音只能重播有限的次数。',
};

/** The "For teachers" panel is fixed — it describes the Listen and Choose
 *  the Picture task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to identify key information in ' +
  'a short spoken exchange and connect it to a visual representation, ' +
  'without relying on written text.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8),
 *  pitched at its lowest bands since this task is designed for A1-A2. */
const LEVEL_NOTES =
  'A1: One very short, high-frequency exchange; picture options are visually very distinct.\n' +
  'A2: One- or two-line dialogue; picture options share a category, so the specific detail must be caught.';
const NOTES =
  'Each recording can be played only a limited number of times, so ' +
  'encourage students to look at the picture options before starting. ' +
  'Exactly five dialogues per exercise.';
const FORMAT_TEXT = 'A student listens to five short dialogues and chooses the picture each one matches.';
const LENGTH_TEXT = 'Five short dialogues (one or two lines each), each with 2-4 picture options.';

/**
 * Five independent short-dialogue listening items, each with its own
 * play-limited audio player and a row of clickable picture options —
 * distinct from Multiple Choice (Listening), which uses one longer
 * recording shared across several text-based questions.
 */
export default function ListenAndChoosePicture({
  data,
  body,
  languageSwitch,
}: TemplateProps<'listen-and-choose-picture'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [selections, setSelections] = useState<(number | null)[]>(() => data.items.map(() => null));
  const [plays, setPlays] = useState<number[]>(() => data.items.map(() => 0));
  const [submitted, setSubmitted] = useState(false);

  const canSubmit = selections.every((s) => s !== null);
  const score = {
    correct: data.items.filter((item, i) => selections[i] === item.correct).length,
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

                <div className="picture-choices">
                  {item.options.map((opt, oi) => {
                    const isChosen = chosen === oi;
                    const isKey = item.correct === oi;
                    const state = !submitted ? '' : isKey ? 'picture-key' : isChosen ? 'picture-wrong' : '';
                    return (
                      <button
                        key={oi}
                        type="button"
                        className={`picture-choice ${isChosen ? 'picture-chosen' : ''} ${state}`}
                        disabled={submitted}
                        onClick={() => setSelections((prev) => prev.map((s, si) => (si === i ? oi : s)))}
                      >
                        <img src={opt.src} alt={opt.alt ?? ''} />
                      </button>
                    );
                  })}
                </div>

                {showTranscript && (
                  <details className="transcript" open={submitted}>
                    <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
                    <Markdown lang={data.language}>{item.transcript!}</Markdown>
                  </details>
                )}

                {submitted && (
                  <Feedback correct={chosen === item.correct}>
                    {chosen === item.correct ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
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
