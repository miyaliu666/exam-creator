import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { percentage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** A, B, C... for the 0-based statement index. */
function letterFor(index: number): string {
  return String.fromCharCode(65 + index);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Play each short recording, then drag the statement that best matches what the speaker says into the box next to it. Not all statements will be used.',
  es: 'Reproduce cada grabación breve y arrastra la afirmación que mejor coincida con lo que dice el hablante hasta el recuadro de al lado. No se usarán todas las afirmaciones.',
  zh: '请播放每段简短录音，然后将与说话人内容最匹配的陈述拖到旁边的方框中。并非所有陈述都会被使用。',
};

/** The "For teachers" panel is fixed — it describes the Matching
 *  (Listening) task type itself, not any one exercise's content, so it
 *  must read the same no matter which language/level variant is
 *  currently selected. Only the Sample below it changes with the active
 *  variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to listen for detailed ' +
  'information, follow a short monologue from start to finish, and ' +
  'recognize how the facts in a recording connect to a single overall ' +
  'statement about it.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Short, simple monologues; statements are clearly about different topics.\n' +
  'B1: Distractor statements are true of the topic generally but wrong for that particular speaker.\n' +
  'B2: Same mechanic, denser or faster monologues.\n' +
  'C1: Matching requires synthesizing more than one detail, not a single stated fact.\n' +
  'C2: Near-native monologues; matching requires an inference beyond the literal statement.';
const NOTES =
  'Include more statements than speakers, so that some are never used, ' +
  'which prevents students from matching the last speaker by elimination ' +
  'alone. Exactly five speakers per exercise, each with their own ' +
  'distinct audio and play counter. A statement can be used in at most ' +
  'one box.';
const FORMAT_TEXT =
  'A student plays each of five short, related monologues and drags the ' +
  'statement that best matches what each speaker says from a shared bank ' +
  'into the box beside that speaker.';
const LENGTH_TEXT = 'Five recordings, each up to 30 seconds, with at least one more statement than there are speakers.';

/**
 * Five independent short monologues, each reduced to a compact play
 * button next to a drop target, matched against a shared bank of
 * statements shown alongside — the drag-and-drop mechanic from Drag to
 * Complete, applied per audio item. A statement is consumed from the bank
 * once placed and returned when its box is cleared; a click-based
 * fallback (select a bank statement, then select a box) covers the same
 * flow without requiring drag support.
 */
export default function ListeningMatching({ data, body, languageSwitch }: TemplateProps<'listening-matching'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [placed, setPlaced] = useState<Record<number, number>>({});
  const [active, setActive] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<number | 'bank' | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [plays, setPlays] = useState<number[]>(() => data.items.map(() => 0));
  const [submitted, setSubmitted] = useState(false);

  const available = data.statements.map((_, si) => si).filter((si) => !Object.values(placed).includes(si));
  const canSubmit = data.items.every((_, i) => placed[i] !== undefined);
  const score = {
    correct: data.items.filter((item, i) => placed[i] === item.correct).length,
    total: data.items.length,
  };

  const reset = () => {
    setPlaced({});
    setActive(null);
    setPlays(data.items.map(() => 0));
    setSubmitted(false);
  };

  const placeInBox = (index: number, statementIndex: number) => {
    setPlaced((prev) => {
      const next = { ...prev };
      if (dragSource !== null && dragSource !== 'bank') delete next[dragSource];
      next[index] = statementIndex;
      return next;
    });
  };

  const clearBox = (index: number) => {
    setPlaced((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
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
            <div className="reading-questions-col">
              {data.items.map((item, i) => {
                const filled = placed[i];
                const right = filled === item.correct;
                const showTranscript = item.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);
                return (
                  <div key={i}>
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

                    <button
                      type="button"
                      className={`statement-target ${filled !== undefined ? 'statement-filled' : ''} ${
                        submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''
                      } ${dropTarget === i ? 'blank-drop' : ''}`}
                      disabled={submitted}
                      draggable={!submitted && filled !== undefined}
                      onClick={() => {
                        if (submitted) return;
                        if (filled !== undefined) {
                          clearBox(i);
                        } else if (active !== null) {
                          placeInBox(i, active);
                          setActive(null);
                        }
                      }}
                      onDragStart={(e) => {
                        if (submitted || filled === undefined) return;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', String(filled));
                        setDragSource(i);
                      }}
                      onDragEnd={() => {
                        setDragSource(null);
                        setDropTarget(null);
                      }}
                      onDragOver={(e) => {
                        if (submitted) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTarget(i);
                      }}
                      onDragLeave={() => setDropTarget((t) => (t === i ? null : t))}
                      onDrop={(e) => {
                        if (submitted) return;
                        e.preventDefault();
                        const raw = e.dataTransfer.getData('text/plain');
                        if (raw !== '') placeInBox(i, Number(raw));
                        setDropTarget(null);
                        setDragSource(null);
                      }}
                    >
                      {filled !== undefined ? (
                        <>
                          <strong>{letterFor(filled)}</strong> {data.statements[filled]}
                        </>
                      ) : (
                        <span className="statement-target-placeholder">{ui.dropHere(instructionLanguage)}</span>
                      )}
                    </button>

                    {showTranscript && (
                      <details className="transcript" open={submitted}>
                        <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
                        <Markdown>{item.transcript!}</Markdown>
                      </details>
                    )}

                    {submitted && (
                      <Feedback correct={right}>
                        {right
                          ? ui.correct(instructionLanguage)
                          : ui.notQuiteExpected(
                              instructionLanguage,
                              `${letterFor(item.correct)}: ${data.statements[item.correct]}`,
                            )}
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

            <div
              className="passage"
              onDragOver={(e) => {
                if (submitted || dragSource === null || dragSource === 'bank') return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (submitted) return;
                e.preventDefault();
                if (typeof dragSource === 'number') clearBox(dragSource);
                setDragSource(null);
              }}
            >
              <div className="word-bank-head">
                <h3>{ui.statementBankHeading(instructionLanguage)}</h3>
                {!submitted && <span className="word-bank-hint">{ui.dragOrClickHintStatement(instructionLanguage)}</span>}
              </div>
              <ul className="statement-legend">
                {available.map((si) => (
                  <li
                    key={si}
                    className={active === si ? 'chip-active' : undefined}
                    draggable={!submitted}
                    onClick={() => !submitted && setActive(active === si ? null : si)}
                    onDragStart={(e) => {
                      if (submitted) return;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(si));
                      setDragSource('bank');
                    }}
                    onDragEnd={() => setDragSource(null)}
                  >
                    <strong>{letterFor(si)}</strong> {data.statements[si]}
                  </li>
                ))}
                {available.length === 0 && <li aria-hidden="true">—</li>}
              </ul>
            </div>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
