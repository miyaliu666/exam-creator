import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { directionForLanguage, isCorrect, resolveMatching, seededShuffle } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'You are answering a simple question. Type the words below in the correct ' +
    'order to form one clear, correct sentence.',
  es:
    'Estás respondiendo a una pregunta sencilla. Escribe las palabras de abajo en ' +
    'el orden correcto para formar una oración clara y correcta.',
  zh: '你在回答一个简单的问题。请按正确的顺序输入下面的词语，组成一句清楚、正确的句子。',
};

/** The "For teachers" panel is fixed — it describes the Build a Sentence task
 *  type itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's understanding of basic sentence structure and " +
  'word order, by requiring them to type a set of given words in the correct order ' +
  'to form a single, grammatically correct sentence that answers a question.';
/** Paraphrases the CEFR's own "Grammatical Accuracy" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: Three or four high-frequency words in a fixed, simple order (subject-verb-object).\n' +
  'A2: Five to seven words, possibly with a simple connector or short phrase.';
const NOTES = 'Grading ignores case and punctuation differences. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student sees a question and a set of scrambled words, then types the words in ' +
  'the correct order to form a grammatically correct sentence that answers the ' +
  'question.';
const LENGTH_TEXT = '3–7 words per sentence.';

/**
 * Word-order task: the student sees a question and the words needed to
 * answer it, scrambled for reference, then types the full sentence in the
 * correct order. Auto-graded as an exact match (after the usual case/
 * punctuation folding), same mechanism as Fill in the Blank.
 */
export default function BuildASentence({ data, body, id, languageSwitch }: TemplateProps<'build-a-sentence'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const shuffled = useMemo(() => seededShuffle(data.words, id), [data.words, id]);
  const target = data.words.join(' ');

  const [value, setValue] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const matching = useMemo(
    () => resolveMatching(data.language, data.matching),
    [data.language, data.matching],
  );
  const right = isCorrect(value, target, matching);

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={value.trim().length > 0}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        setValue('');
        setSubmitted(false);
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
          <p
            className="sample-intro"
            lang={instructionLanguage}
            dir={directionForLanguage(instructionLanguage)}
          >
            {sampleIntro}
          </p>

          <Markdown className="prompt">{data.question}</Markdown>

          <p className="word-scramble" lang={data.language} dir={dir}>
            {shuffled.join(' / ')}
          </p>

          <input
            {...answerFieldProps}
            type="text"
            className="dictation-input"
            value={value}
            disabled={submitted}
            aria-label={ui.yourAnswer(instructionLanguage)}
            placeholder={ui.typeSentenceHere(instructionLanguage)}
            onChange={(e) => setValue(e.target.value)}
            lang={data.language}
            dir={dir}
          />

          <div className="controls">
            <button
              className="btn btn-primary"
              onClick={() => setSubmitted(true)}
              disabled={submitted || value.trim().length === 0}
            >
              {ui.checkAnswer(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setValue('');
                setSubmitted(false);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && (
            <Feedback correct={right}>
              {right ? ui.correct(instructionLanguage) : ui.notQuiteExpected(instructionLanguage, target)}
            </Feedback>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
