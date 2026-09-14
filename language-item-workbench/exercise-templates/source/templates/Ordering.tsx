import { useMemo, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage, percentage, seededShuffle } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: "The lines below have been placed in random order. Restore the original order by dragging each line to its correct position, or by using the arrow buttons.",
  fr: "Les lignes ci-dessous ont été placées dans un ordre aléatoire. Rétablissez l'ordre original en faisant glisser chaque ligne à sa position correcte, ou en utilisant les flèches.",
  es:
    'Las líneas de abajo se han colocado en un orden aleatorio. Restablece el orden ' +
    'original arrastrando cada línea a su posición correcta, o usando los botones de flecha.',
  zh: '下面的句子被随机打乱了顺序。请通过拖动每一行到正确的位置，或使用箭头按钮，恢复原来的顺序。',
};

/** The "For teachers" panel is fixed — it describes the Reorder task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests several reading skills, e.g. recognition of cohesive ' +
  'devices such as connectors and pronoun references that link sentences together, ' +
  'or the ability to reconstruct the logical and chronological sequence of a text.';
/** Paraphrases the CEFR's own "Coherence" descriptor scale (Council of
 *  Europe, Structured overview of all CEFR scales, p.31) for A2/B1/C1. */
const LEVEL_NOTES =
  'A2: Short items linked by simple connectors (and, but, because).\n' +
  'B1: A series of shorter, discrete elements forming one connected, linear sequence.\n' +
  'B2: Longer items, more varied cohesive devices.\n' +
  'C1: Items requiring controlled organizational patterns and cohesive devices to rebuild smooth flow.\n' +
  'C2: Near-native text; reordering relies on subtle rhetorical or discourse-level cues.';
const NOTES =
  'None of the text boxes are fixed in place, including the first and last; every ' +
  'box is shuffled, so its position in the scrambled list never hints at where it belongs.';
const FORMAT_TEXT =
  'A student needs to restore the correct order of the text by selecting and dragging the text boxes.';
const LENGTH_TEXT = 'Text up to 150 words.';

/**
 * Reorder shuffled items into the author's original sequence. Primary interaction
 * is drag-and-drop (native HTML5 DnD, so items stay inside the list and never fly
 * off — only the browser's drag ghost tracks the cursor). The up/down buttons are
 * kept as a keyboard- and touch-accessible fallback.
 */
export default function Ordering({ data, body, id, languageSwitch }: TemplateProps<'ordering'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const shuffled = useMemo(() => seededShuffle(data.items, id), [data.items, id]);
  const [order, setOrder] = useState<string[]>(shuffled);
  const [submitted, setSubmitted] = useState(false);
  const dragFrom = useRef<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (submitted || to < 0 || to >= order.length || from === to) return;
    setOrder((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const onDragStart = (i: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (submitted) return;
    dragFrom.current = i;
    setDragging(i);
    e.dataTransfer.effectAllowed = 'move';
    // Firefox won't start a drag unless some data is set.
    e.dataTransfer.setData('text/plain', String(i));
  };

  const onDragOver = (i: number) => (e: React.DragEvent<HTMLLIElement>) => {
    if (submitted || dragFrom.current === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const from = dragFrom.current;
    if (from === i) return;
    move(from, i); // live reorder as you hover
    dragFrom.current = i;
    setDragging(i);
    setDragOver(i);
  };

  const onDragEnd = () => {
    dragFrom.current = null;
    setDragging(null);
    setDragOver(null);
  };

  const score = {
    correct: order.filter((item, i) => item === data.items[i]).length,
    total: data.items.length,
  };
  const perfect = score.correct === score.total;
  // Tiered, content-relevant guidance instead of a flat pass/fail message —
  // still doesn't reveal the correct order, just where to look for cues.
  const feedbackMessage = perfect
    ? ui.orderingFeedbackPerfect(instructionLanguage)
    : score.correct / score.total >= 0.5
      ? ui.orderingFeedbackPartial(instructionLanguage)
      : ui.orderingFeedbackLow(instructionLanguage);

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setOrder(shuffled);
        setSubmitted(false);
        onDragEnd();
      }}
      hideMeta
      hideTeacherNotes
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
          <p
            className="sample-intro"
            lang={instructionLanguage}
            dir={directionForLanguage(instructionLanguage)}
          >
            {sampleIntro}
          </p>

          <ol className={`ordering ordering-${data.layout}`}>
            {order.map((item, i) => {
              const stateClass = submitted
                ? item === data.items[i]
                  ? 'ord-correct'
                  : 'ord-wrong'
                : '';
              const dndClass = `${dragging === i ? 'ord-dragging' : ''} ${
                dragOver === i && dragging !== i ? 'ord-over' : ''
              }`;
              return (
                <li
                  key={item}
                  className={`${stateClass} ${dndClass}`.trim()}
                  draggable={!submitted}
                  onDragStart={onDragStart(i)}
                  onDragOver={onDragOver(i)}
                  onDragEnd={onDragEnd}
                  onDrop={(e) => e.preventDefault()}
                >
                  <span className="ord-grip" aria-hidden="true">⠿</span>
                  <span className="ord-text">{item}</span>
                  <span className="ord-controls">
                    <button
                      className="btn btn-small"
                      aria-label={ui.moveItemEarlier(instructionLanguage, item)}
                      disabled={submitted || i === 0}
                      onClick={() => move(i, i - 1)}
                    >
                      ↑
                    </button>
                    <button
                      className="btn btn-small"
                      aria-label={ui.moveItemLater(instructionLanguage, item)}
                      disabled={submitted || i === order.length - 1}
                      onClick={() => move(i, i + 1)}
                    >
                      ↓
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="controls">
            <button
              className="btn btn-primary"
              onClick={() => setSubmitted(true)}
              disabled={submitted}
            >
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setOrder(shuffled);
                setSubmitted(false);
                onDragEnd();
              }}
            >
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
