import { useMemo, useState } from 'react';
import type { TemplateProps } from './types';
import { answerFieldProps, CompactAudioButton, ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage, isCorrect, normalize, percentage, resolveMatching } from '../lib/grading';
import { segmentWords } from '../lib/segment';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Listen to the recording, then type each sentence exactly as you hear it.',
  es: 'Escucha la grabación y escribe cada oración exactamente como la oigas.',
  zh: '请听录音，然后逐句准确地输入你听到的内容。',
};

/** The tiered feedback message shown after submission — translated here
 *  since it's generic UI copy, not authored content. */
const FEEDBACK: Record<string, { perfect: string; partial: string; low: string }> = {
  en: {
    perfect: 'Perfect transcription: every word matched.',
    partial: 'Getting there: listen again for the words underlined in red below.',
    low: 'Play the recording again and listen closely for the words underlined in red below.',
  },
  es: {
    perfect: 'Transcripción perfecta: todas las palabras coinciden.',
    partial: 'Casi lo tienes: vuelve a escuchar las palabras subrayadas en rojo abajo.',
    low: 'Vuelve a reproducir la grabación y escucha con atención las palabras subrayadas en rojo abajo.',
  },
  zh: {
    perfect: '完美转写：每个词都正确。',
    partial: '接近了：请再听一次下面标红的词。',
    low: '请重新播放录音，仔细听下面标红的词。',
  },
};

/** The "For teachers" panel is fixed — it describes the Dictation task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests several listening skills, e.g. accurate transcription ' +
  'of spoken sentences, recognition of individual words at natural speed, and correct ' +
  'spelling of what is heard.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A1: One very short, high-frequency sentence (e.g. a greeting or name), spoken very slowly.\n' +
  'A2: Short everyday sentences, clearly and slowly articulated.\n' +
  'B1: Natural pace, familiar factual topics.\n' +
  'B2: Slightly longer or faster sentences, everyday register.\n' +
  'C1: Abstract or idiomatic sentences, register shifts not explicitly signaled.\n' +
  'C2: Near-native pace, low-frequency vocabulary or idiom, minimal redundancy to lean on.';
const NOTES =
  'Each sentence has its own distinct recording and play counter. ' +
  'Punctuation and capitalization are not scored: only word-level ' +
  'transcription accuracy counts toward the result. Autocorrect is disabled.';
const FORMAT_TEXT =
  'A student listens to a separate short recording for each sentence, ' +
  'with a limited number of plays per recording, and types the sentence ' +
  'exactly as heard.';
const LENGTH_TEXT = '3-4 sentences, each 3-5 seconds long. No preparation time.';

/**
 * Word-level diff so the student sees which words they missed. Words are found
 * with `Intl.Segmenter`, so scripts without spaces (Chinese, Japanese) get a
 * real per-word diff instead of one all-or-nothing token.
 */
function diffWords(
  input: string,
  expected: string,
  language: string,
  opts: Parameters<typeof normalize>[1],
) {
  const inputWords = new Set(segmentWords(input, language).map((w) => normalize(w, opts)));
  return segmentWords(expected, language).map((word) => ({
    word,
    hit: inputWords.has(normalize(word, opts)),
  }));
}

export default function Dictation({ data, body, languageSwitch }: TemplateProps<'dictation'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [values, setValues] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState<number[]>(() => data.segments.map(() => 0));

  const matching = useMemo(
    () => resolveMatching(data.language, data.matching),
    [data.language, data.matching],
  );

  const graded = data.segments.map((seg, i) => isCorrect(values[i] ?? '', seg.answer, matching));
  const score = { correct: graded.filter(Boolean).length, total: data.segments.length };
  const perfect = score.correct === score.total;
  const feedback = FEEDBACK[instructionLanguage] ?? FEEDBACK.en;
  // Tiered, content-relevant guidance instead of a flat pass/fail message.
  const feedbackMessage = perfect
    ? feedback.perfect
    : score.correct / score.total >= 0.5
      ? feedback.partial
      : feedback.low;

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
        setPlays(data.segments.map(() => 0));
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

          <ol className="dictation">
            {data.segments.map((seg, i) => (
              <li key={i}>
                <div className="matching-row">
                  <span className="matching-row-number">{i + 1}.</span>
                  <CompactAudioButton
                    media={seg.audio}
                    maxPlays={data.maxPlays}
                    plays={plays[i]}
                    onPlay={() => setPlays((prev) => prev.map((p, pi) => (pi === i ? p + 1 : p)))}
                    lang={instructionLanguage}
                  />
                </div>
                <textarea
                  {...answerFieldProps}
                  className={`dictation-input ${submitted ? (graded[i] ? 'blank-correct' : 'blank-wrong') : ''}`}
                  rows={2}
                  value={values[i] ?? ''}
                  disabled={submitted}
                  aria-label={`Segment ${i + 1}`}
                  placeholder={seg.hint ?? ui.typeAnswerHere(instructionLanguage)}
                  onChange={(e) => setValues({ ...values, [i]: e.target.value })}
                />
                {submitted && (
                  <>
                    <Feedback correct={graded[i]} />
                    <p className="dictation-key">
                      {diffWords(values[i] ?? '', seg.answer, data.language, matching).map((w, j) => (
                        <span key={j} className={w.hit ? 'word-hit' : 'word-miss'}>
                          {w.word}{' '}
                        </span>
                      ))}
                    </p>
                  </>
                )}
              </li>
            ))}
          </ol>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button
              className="btn"
              onClick={() => {
                setValues({});
                setSubmitted(false);
                setPlays(data.segments.map(() => 0));
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
