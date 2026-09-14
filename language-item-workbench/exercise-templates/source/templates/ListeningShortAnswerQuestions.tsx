import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import {
  answerExplanation,
  answerValue,
  directionForLanguage,
  isCorrect,
  percentage,
  resolveMatching,
} from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'Listen to the recording, then answer each question with a short factual answer ' +
    '(a place, price, time, or similar detail). You may replay the recording a ' +
    'limited number of times.',
  es:
    'Escucha la grabación y luego responde cada pregunta con una respuesta breve y ' +
    'concreta (un lugar, un precio, una hora u otro detalle similar). Puedes volver ' +
    'a escuchar la grabación un número limitado de veces.',
  zh: '请听录音，然后用简短的事实性答案（如地点、价格、时间等细节）回答每个问题。你可以重播录音有限的次数。',
};

/** The "For teachers" panel is fixed — it describes the Listening
 *  Short-answer Questions task type itself, not any one exercise's content,
 *  so it must read the same no matter which language/level variant is
 *  currently selected. Only the Sample below it changes with the active
 *  variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to listen for specific factual ' +
  'details in a recording, such as places, prices, or times, and note them ' +
  'down accurately.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A1: Single-word or number answers (e.g. a name, a number), stated once, very slowly.\n' +
  'A2: Short recordings; each answer is a single word or number, stated clearly and slowly.\n' +
  'B1: Natural pace; one nearby similar-sounding detail to avoid confusing with the answer.\n' +
  'B2: Natural pace; answer requires picking the right detail among similar-sounding distractors.\n' +
  'C1: Denser recording; answer requires combining two related details mentioned at different points.\n' +
  'C2: Near-native pace; answer requires an inference the recording implies but never states directly.';
const NOTES =
  'Answers are graded as short factual responses (a word, number, or short ' +
  'phrase), not full sentences, matched exactly against the answer and its ' +
  'listed alternatives. Avoid exact clock times as an answer (e.g. "9am") ' +
  'since students can write them in too many equally valid formats to list ' +
  'exhaustively; prefer facts with a small, predictable set of phrasings ' +
  '(a name, a price, a day, a single number) instead. Questions should ' +
  'follow the same order as the information in the recording.';
const FORMAT_TEXT =
  'A student listens to a recording, with a limited number of plays, then ' +
  'answers questions about specific factual details mentioned in it.';
const LENGTH_TEXT = 'Recording up to 90 seconds, with 3-5 questions.';

/**
 * The listening counterpart to (reading) Short-answer Questions: instead of
 * a passage to search, the student listens to a play-limited recording and
 * writes a short factual answer to each question, same free-text grading as
 * the reading version.
 */
export default function ListeningShortAnswerQuestions({
  data,
  body,
  languageSwitch,
}: TemplateProps<'listening-short-answer-questions'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const matching = useMemo(() => resolveMatching(data.language, data.matching), [data.language, data.matching]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const score = {
    correct: data.questions.filter((q, i) => isCorrect(values[i] ?? '', q.answer, matching)).length,
    total: data.questions.length,
  };

  const showTranscript = data.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);

  const reset = () => {
    setValues({});
    setSubmitted(false);
    setPlays(0);
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

          <div className="matching-row">
            <CompactAudioButton
              media={data.audio}
              maxPlays={data.maxPlays}
              plays={plays}
              onPlay={() => setPlays((p) => p + 1)}
              lang={instructionLanguage}
            />
          </div>

          <ol className="questions">
            {data.questions.map((q, i) => {
              const right = isCorrect(values[i] ?? '', q.answer, matching);
              const explanation = answerExplanation(q.answer);
              return (
                <li key={i} className="question">
                  <Markdown className="question-prompt" lang={instructionLanguage} dir={directionForLanguage(instructionLanguage)}>
                    {q.prompt}
                  </Markdown>
                  <input
                    {...answerFieldProps}
                    type="text"
                    className={`dictation-input ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
                    value={values[i] ?? ''}
                    disabled={submitted}
                    aria-label={ui.yourAnswer(instructionLanguage)}
                    placeholder={ui.typeAnswerHere(instructionLanguage)}
                    lang={data.language}
                    dir={dir}
                    onChange={(e) => setValues((prev) => ({ ...prev, [i]: e.target.value }))}
                  />
                  {submitted && (
                    <Feedback correct={right}>
                      {right
                        ? ui.correct(instructionLanguage)
                        : `${ui.notQuiteExpected(instructionLanguage, answerValue(q.answer))}${
                            explanation ? `: ${explanation}` : ''
                          }`}
                    </Feedback>
                  )}
                </li>
              );
            })}
          </ol>

          {showTranscript && (
            <details className="transcript" open={submitted}>
              <summary>{ui.transcriptLabel(instructionLanguage)}</summary>
              <Markdown>{data.transcript!}</Markdown>
            </details>
          )}

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
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
