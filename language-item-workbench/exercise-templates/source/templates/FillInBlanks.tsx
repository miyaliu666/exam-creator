import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback } from '../components/Shell';
import {
  answerHint,
  answerValue,
  directionForLanguage,
  isCorrect,
  resolveMatching,
  seededShuffle,
} from '../lib/grading';
import { ui } from '../lib/i18n';

const BLANK = /_{3,}/g;

/** Splits "Ela ___ ao mercado" into ["Ela ", " ao mercado"] around each blank. */
function segments(text: string): string[] {
  return text.split(BLANK);
}

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Fill in each blank with the correct word: type it in, or drag it from the word bank if one is provided.',
  ar: 'أكمل كل فراغ بالكلمة الصحيحة: اكتبها أو اسحبها من بنك الكلمات إذا كان متوفرًا.',
  he: 'השלימו כל חלל במילה הנכונה: הקלידו אותה או גררו אותה מבנק המילים אם קיים.',
  'pt-BR': 'Complete cada lacuna com a palavra correta: digite-a ou arraste-a do banco de palavras, se houver.',
  uk: 'Заповніть кожен пропуск правильним словом: напишіть його або перетягніть зі списку слів.',
  es: 'Completa cada espacio con la palabra correcta: escríbela o arrástrala del banco de palabras si hay uno disponible.',
  zh: '用正确的词填写每个空格：输入进去，或者从词库中拖入（如果提供了词库）。',
};

/** The "For teachers" panel is fixed — it describes the Fill in the Blank
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. Unlike most other
 *  templates, the per-exercise `teacherNotes` (script rules, agreement
 *  cues) stay visible after submission — they're genuinely exercise-
 *  specific and don't duplicate anything in this fixed panel. */
const TEACHING_FOCUS =
  'This type of question tests knowledge of specific vocabulary or grammatical forms ' +
  'in context, e.g. selecting the correct word form to complete a sentence based on ' +
  'gender, number, person, or tense agreement.';
/** Paraphrases the CEFR's own "Vocabulary Range" and "Grammatical Accuracy"
 *  descriptor scales (Council of Europe, Structured overview of all CEFR
 *  scales, p.27-28) — this task type can test either. */
const LEVEL_NOTES =
  'A1: Simple structures (HAVE GOT, TO BE, present-simple routines) or routine-transaction vocabulary.\n' +
  'A2: Simple structures students are just meeting, or vocabulary needing no circumlocution.\n' +
  'B1: Structures applied with reasonable accuracy in familiar contexts (passive voice, reported speech).\n' +
  'B2: Broader structures (all main tenses, mixed conditionals, have/get something done) with more nuance.\n' +
  'C1: Structures where errors are rare and easy to overlook (inversion, all forms).\n' +
  'C2: Idiomatic or collocational structures beyond a standard grammar syllabus.';
const NOTES =
  "Each exercise's specific grading rules and language notes (script folding, " +
  'agreement cues, etc.) are shown below the answers after you submit.';
const FORMAT_TEXT =
  'A student fills each blank by typing the correct word, or by dragging it from a ' +
  'word bank when one is provided.';
const LENGTH_TEXT = 'Up to six short sentences per exercise (depending on the level).';

export default function FillInBlanks({ data, body, id, languageSwitch }: TemplateProps<'fill-in-blanks'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  // The full-width breakout (see .sample-box) overflows past the viewport on
  // purpose, then relies on the browser anchoring that overflow to the left —
  // which flips unreliably once an rtl exercise (Arabic, Hebrew) is involved.
  // Simplest fix: skip the breakout for rtl and keep the normal-width box.
  const isRtl = directionForLanguage(data.language) === 'rtl';

  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  // Drag-and-drop from the word bank into a blank. Native HTML5 DnD, same as
  // Ordering. Typing stays available as the keyboard/touch path.
  const [draggingWord, setDraggingWord] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const matching = useMemo(
    () => resolveMatching(data.language, data.matching),
    [data.language, data.matching],
  );

  const bank = useMemo(
    () => (data.wordBank ? seededShuffle(data.wordBank, id) : undefined),
    [data.wordBank, id],
  );

  const blanks = data.items.flatMap((item, i) =>
    item.answers.map((answer, b) => ({ key: `${i}-${b}`, answer })),
  );

  const score = {
    correct: blanks.filter(({ key, answer }) =>
      isCorrect(values[key] ?? '', answer, matching),
    ).length,
    total: blanks.length,
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      score={score}
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
        <h3 className="sample-heading" dir="ltr">Sample</h3>
        {languageSwitch && <div dir="ltr">{languageSwitch}</div>}
        <div className={`sample-box ${isRtl ? 'sample-box-normal-width' : ''}`} dir="ltr">
          <p
            className="sample-intro"
            lang={instructionLanguage}
            dir={directionForLanguage(instructionLanguage)}
          >
            {sampleIntro}
          </p>

          {/* The box above is pinned ltr so its full-width breakout math
              (anchored to its left edge) doesn't invert under rtl — only
              the actual exercise content flips direction below. */}
          <div lang={data.language} dir={directionForLanguage(data.language)}>
            {bank && (
              <div className="word-bank">
                <div className="word-bank-head">
                  <h3>{ui.wordBankHeading(instructionLanguage)}</h3>
                  {!submitted && (
                    <span className="word-bank-hint">{ui.dragOrTypeHint(instructionLanguage)}</span>
                  )}
                </div>
                <ul>
                  {bank.map((word) => (
                    <li
                      key={word}
                      // Resting appearance is untouched; `dragging` only dims the
                      // item while it is being carried.
                      className={draggingWord === word ? 'dragging' : undefined}
                      draggable={!submitted}
                      onDragStart={(e) => {
                        if (submitted) return;
                        e.dataTransfer.effectAllowed = 'copy';
                        // Firefox won't start a drag unless some data is set.
                        e.dataTransfer.setData('text/plain', word);
                        setDraggingWord(word);
                      }}
                      onDragEnd={() => {
                        setDraggingWord(null);
                        setDropTarget(null);
                      }}
                    >
                      {word}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ol className="blank-items">
              {data.items.map((item, i) => {
                const parts = segments(item.text);
                return (
                  <li key={i} className="blank-item">
                    <p className="blank-line">
                      {parts.map((part, p) => {
                        const answer = item.answers[p];
                        const key = `${i}-${p}`;
                        const value = values[key] ?? '';
                        const right = answer ? isCorrect(value, answer, matching) : false;
                        return (
                          // <bdi> isolates each text run so a blank dropped mid-sentence
                          // does not reorder the surrounding text in RTL scripts.
                          <span key={p}>
                            <bdi>{part}</bdi>
                            {p < parts.length - 1 && answer && (
                              <input
                                {...answerFieldProps}
                                className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''} ${
                                  dropTarget === key ? 'blank-drop' : ''
                                }`}
                                type="text"
                                value={value}
                                disabled={submitted}
                                size={Math.max([...answerValue(answer)].length, 6)}
                                aria-label={ui.blankAriaLabel(instructionLanguage, p + 1, i + 1)}
                                placeholder={answerHint(answer) ?? ''}
                                onChange={(e) => setValues({ ...values, [key]: e.target.value })}
                                onDragOver={(e) => {
                                  if (submitted) return;
                                  e.preventDefault(); // allow the drop
                                  e.dataTransfer.dropEffect = 'copy';
                                  setDropTarget(key);
                                }}
                                onDragLeave={() => setDropTarget((t) => (t === key ? null : t))}
                                onDrop={(e) => {
                                  if (submitted) return;
                                  // Handle it ourselves so the controlled value stays in sync
                                  // instead of the browser's native text-drop insertion.
                                  e.preventDefault();
                                  const word = e.dataTransfer.getData('text/plain');
                                  if (word) setValues({ ...values, [key]: word });
                                  setDropTarget(null);
                                  setDraggingWord(null);
                                }}
                              />
                            )}
                          </span>
                        );
                      })}
                    </p>
                    {submitted && (
                      <ul className="blank-answers">
                        {item.answers.map((answer, p) => {
                          const right = isCorrect(values[`${i}-${p}`] ?? '', answer, matching);
                          return (
                            <li key={p}>
                              <Feedback correct={right}>
                                {right ? answerValue(answer) : ui.answerWas(instructionLanguage, answerValue(answer))}
                              </Feedback>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ol>
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
