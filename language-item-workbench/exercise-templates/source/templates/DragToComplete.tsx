import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { percentage, seededShuffle } from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "She works ___ a bank" into ["She works ", " a bank"] around each gap. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Drag words from the bank below to fill in the gaps in the text.',
  es: 'Arrastra palabras del banco de abajo para completar los espacios del texto.',
  zh: '请从下面的词库中拖动单词，填补文章中的空白。',
};

/** The "For teachers" panel is fixed — it describes the Drag to Complete
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests reading comprehension and vocabulary in context: whether the ' +
  'student can identify which word from a shared bank fits each gap in a ' +
  'passage, based on grammar and meaning.';
/** Paraphrases the CEFR's own "Vocabulary Range" and "Grammatical Accuracy"
 *  descriptor scales (Council of Europe, Structured overview of all CEFR
 *  scales, p.27-28). */
const LEVEL_NOTES =
  'A2: Bank size equals the number of gaps; each word is clearly distinct.\n' +
  "B1: One or two extra distractor words that are plausible but don't fit any gap.\n" +
  'B2: Same mechanic, denser passage.\n' +
  'C1: Dense passage; several distractors share a word family with the correct answers.\n' +
  'C2: Near-native passage; distractors differ only by register or collocation.';
const NOTES =
  'The word bank may include extra words that do not belong in any gap. Each ' +
  'word in the bank should be usable in at most one gap.';
const FORMAT_TEXT =
  'A student drags words from a word bank into the gaps in a passage; a placed ' +
  'word can be dragged back to the bank to undo it.';
const LENGTH_TEXT = 'Passage up to 120 words, with 4-6 gaps.';

/**
 * Drag-and-drop cloze: words are consumed from the bank as they're placed and
 * returned when a gap is cleared. A click-based fallback (select a bank word,
 * then select a gap; select a filled gap to clear it) covers the same flow
 * without requiring drag support.
 */
export default function DragToComplete({ data, body, id, languageSwitch }: TemplateProps<'drag-to-complete'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const parts = segments(data.text);
  const bank = useMemo(() => seededShuffle(data.wordBank, id), [data.wordBank, id]);

  const [placed, setPlaced] = useState<Record<number, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [dragSource, setDragSource] = useState<number | 'bank' | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const available = bank.filter((w) => !Object.values(placed).includes(w));
  const canSubmit = data.answers.every((_, i) => placed[i] !== undefined);
  const score = {
    correct: data.answers.filter((a, i) => placed[i] === a).length,
    total: data.answers.length,
  };
  const perfect = score.correct === score.total;
  const feedbackMessage = perfect
    ? ui.dragFeedbackPerfect(instructionLanguage)
    : score.correct / score.total >= 0.5
      ? ui.dragFeedbackPartial(instructionLanguage)
      : ui.dragFeedbackLow(instructionLanguage);

  const reset = () => {
    setPlaced({});
    setActive(null);
    setSubmitted(false);
  };

  const placeInGap = (index: number, word: string) => {
    setPlaced((prev) => {
      const next = { ...prev };
      if (dragSource !== null && dragSource !== 'bank') delete next[dragSource];
      next[index] = word;
      return next;
    });
  };

  const clearGap = (index: number) => {
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

          <div lang={data.language}>
            <p className="passage">
              {parts.map((part, i) => (
                <span key={i}>
                  {part}
                  {i < data.answers.length && (
                    <button
                      type="button"
                      className={`blank blank-target ${
                        submitted
                          ? placed[i] === data.answers[i]
                            ? 'blank-correct'
                            : 'blank-wrong'
                          : ''
                      } ${dropTarget === i ? 'blank-drop' : ''}`}
                      disabled={submitted}
                      draggable={!submitted && placed[i] !== undefined}
                      aria-label={`${ui.selectPlaceholder(instructionLanguage)} ${i + 1}`}
                      onClick={() => {
                        if (submitted) return;
                        if (placed[i] !== undefined) {
                          clearGap(i);
                        } else if (active !== null) {
                          placeInGap(i, active);
                          setActive(null);
                        }
                      }}
                      onDragStart={(e) => {
                        if (submitted || placed[i] === undefined) return;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', placed[i]);
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
                        const word = e.dataTransfer.getData('text/plain');
                        if (word) placeInGap(i, word);
                        setDropTarget(null);
                        setDragSource(null);
                      }}
                    >
                      {placed[i] ?? ''}
                    </button>
                  )}
                </span>
              ))}
            </p>

            <div
              className="word-bank"
              onDragOver={(e) => {
                if (submitted || dragSource === null || dragSource === 'bank') return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={(e) => {
                if (submitted) return;
                e.preventDefault();
                if (typeof dragSource === 'number') clearGap(dragSource);
                setDragSource(null);
              }}
            >
              <div className="word-bank-head">
                <h3>{ui.wordBankHeading(instructionLanguage)}</h3>
                {!submitted && <span className="word-bank-hint">{ui.dragOrClickHint(instructionLanguage)}</span>}
              </div>
              <ul>
                {available.map((word) => (
                  <li
                    key={word}
                    className={active === word ? 'chip-active' : undefined}
                    draggable={!submitted}
                    onClick={() => !submitted && setActive(active === word ? null : word)}
                    onDragStart={(e) => {
                      if (submitted) return;
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', word);
                      setDragSource('bank');
                    }}
                    onDragEnd={() => setDragSource(null)}
                  >
                    {word}
                  </li>
                ))}
                {available.length === 0 && <li aria-hidden="true">—</li>}
              </ul>
            </div>
          </div>

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

          {submitted && <Feedback correct={perfect}>{feedbackMessage}</Feedback>}
        </div>
      </section>
    </ExerciseShell>
  );
}
