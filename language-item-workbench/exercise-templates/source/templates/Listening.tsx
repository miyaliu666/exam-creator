import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { percentage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { QuestionList, gradeQuestions, type Selections } from '../components/QuestionList';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'Listen to the recording, then answer the questions. You may replay the audio a limited number of times.',
  es: 'Escucha la grabación y luego responde las preguntas. Puedes reproducir el audio un número limitado de veces.',
  zh: '请听录音，然后回答问题。你可以重播音频有限的次数。',
  it: "Ascolta la registrazione, poi rispondi alle domande. Puoi risentire l'audio un numero limitato di volte.",
};

/** The tiered feedback message shown after submission — translated here
 *  since it's generic UI copy, not authored content. */
const FEEDBACK: Record<string, { perfect: string; partial: string; low: string }> = {
  en: {
    perfect: 'Perfect score: you caught every detail the questions were testing.',
    partial: 'Getting there: replay the recording and listen for the details each question points to.',
    low: 'Replay the recording and listen closely for the specific details each question is testing.',
  },
  es: {
    perfect: 'Puntuación perfecta: has captado todos los detalles que las preguntas evaluaban.',
    partial: 'Casi lo tienes: vuelve a escuchar la grabación y presta atención a los detalles de cada pregunta.',
    low: 'Vuelve a escuchar la grabación y presta mucha atención a los detalles específicos de cada pregunta.',
  },
  zh: {
    perfect: '满分：你抓住了题目考查的每一个细节。',
    partial: '接近了：请重新播放录音，注意每个问题指向的细节。',
    low: '请重新播放录音，仔细听每个问题所考查的具体细节。',
  },
};

/** The "For teachers" panel is fixed — it describes the Multiple Choice
 *  (Listening) task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests several listening skills, e.g. understanding specific ' +
  'details in a spoken exchange, following a short dialogue in real time, and ' +
  'identifying the correct answer among several distractors.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Clearly and slowly articulated speech on immediate-priority everyday topics; distractors differ obviously.\n' +
  'B1: Straightforward factual content in a familiar accent at natural-ish pace; one distractor closely resembles the answer.\n' +
  'B2: Natural pace, wider topics; distractors require noticing one specific detail rather than the general gist.\n' +
  'C1: Extended speech on abstract/complex topics, idiomatic language, unsignaled register shifts.\n' +
  'C2: Near-native rate and register; distractors turn on connotation or implication, not just stated fact.';
const NOTES =
  'The audio can be played only a limited number of times, so encourage students to ' +
  'read the questions before starting. The questions should be in the same order ' +
  'as the information in the audio. Include at least one distractor that closely ' +
  'resembles the correct answer, differing by a single key detail the student must ' +
  'catch.';
const FORMAT_TEXT =
  'A student listens to a recording, with a limited number of plays, and selects one ' +
  'correct answer per question.';
const TIME_TEXT = 'Recording up to 90 seconds (depending on the level). No preparation time.';

export default function Listening({ data, body, id, languageSwitch }: TemplateProps<'listening'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [selections, setSelections] = useState<Selections>({});
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const showTranscript =
    data.transcript !== undefined && (!data.revealTranscriptAfterSubmit || submitted);

  const score = gradeQuestions(data.questions, selections);
  const perfect = score.total > 0 && score.correct === score.total;
  const feedback = FEEDBACK[instructionLanguage] ?? FEEDBACK.en;
  // Tiered, content-relevant guidance instead of a flat pass/fail message.
  const feedbackMessage =
    score.total === 0
      ? null
      : perfect
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
        setSelections({});
        setSubmitted(false);
        setPlays(0);
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
            <dt>Time</dt>
            <dd>
              {TIME_TEXT}
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

          <QuestionList
            questions={data.questions}
            selections={selections}
            onChange={setSelections}
            submitted={submitted}
            idPrefix={id}
          />

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
            <button
              className="btn"
              onClick={() => {
                setSelections({});
                setSubmitted(false);
                setPlays(0);
              }}
            >
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && score.total > 0 && (
            <p className={`score ${percentage(score) >= 60 ? 'score-pass' : 'score-fail'}`}>
              {ui.scoreLine(instructionLanguage, score.correct, score.total, percentage(score))}
            </p>
          )}

          {submitted && feedbackMessage && <Feedback correct={perfect}>{feedbackMessage}</Feedback>}
        </div>
      </section>
    </ExerciseShell>
  );
}
