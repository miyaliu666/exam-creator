import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell } from '../components/Shell';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'In this task, you will listen to a question and then respond by speaking for up ' +
    'to 90 seconds. You have 20 seconds to prepare, and you can listen to the question ' +
    'twice in total.',
  es:
    'En esta tarea, escucharás una pregunta y luego responderás hablando durante hasta ' +
    '90 segundos. Tienes 20 segundos para prepararte, y puedes escuchar la pregunta ' +
    'dos veces en total.',
  zh:
    '在这个任务中，你会听到一个问题，然后用最多90秒的时间口头回答。你有20秒的准备时间，' +
    '这个问题最多可以听两次。',
};

/** The "For teachers" panel is fixed — it describes the Listen and Answer
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests comprehension, fluency, and the ability to organize ' +
  'ideas in spontaneous spoken language. Because the student must respond to a ' +
  'genuine question rather than a scripted prompt, it assesses real-time listening ' +
  'comprehension and the ability to formulate a coherent answer under time pressure. ' +
  'Since the task requires answering with original content, rather than repeating or ' +
  'describing something fixed, it also offers a sample of spontaneous fluency and ' +
  'clarity of expression.';
/** Paraphrases the CEFR's own "Overall Spoken Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.20). */
const LEVEL_NOTES =
  'A2: Simple, factual, everyday questions.\n' +
  'B1: Questions inviting a short opinion or explanation on a familiar topic.\n' +
  'B2: Questions requiring a reasoned opinion with supporting detail.\n' +
  'C1: Abstract or nuanced questions requiring a well-organized, persuasive response.\n' +
  'C2: Near-native question complexity; spontaneous, precise, nuanced response.';
const NOTES =
  'Question is up to 15 seconds. The question can be played up to twice in total. The ' +
  'answer can only be recorded once.';
const FORMAT_TEXT =
  'A student hears a spoken question, which can be played twice in total, then has a ' +
  'short preparation time before answering. Recording starts automatically when the ' +
  'preparation time ends and stops automatically when the time to answer runs out. ' +
  'A student can also end the recording early using the Stop button.';
const TIME_TEXT = '90 seconds to answer and 20 seconds to prepare.';

/**
 * Exam-style listen-then-speak task: the student hears a spoken question
 * (with a limited number of replays), gets a fixed preparation window, then
 * recording starts and stops automatically on fixed timers. Replaying the
 * question pauses the preparation countdown rather than resetting it — the
 * clock resumes exactly where it left off once the replay finishes. There is
 * no auto-scoring: a free spoken answer can't be matched against a fixed
 * target, so a teacher assesses the recording afterwards.
 */
export default function ListenAndSpeak({ data, body, languageSwitch }: TemplateProps<'listen-and-speak'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [phase, setPhase] = useState<'ready' | 'listening' | 'prep' | 'recording' | 'done'>('ready');
  const [plays, setPlays] = useState(0);
  const [prepLeft, setPrepLeft] = useState(data.preparationSeconds);
  const [answerLeft, setAnswerLeft] = useState(data.answerSeconds);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // The mic is requested as soon as the page loads, so recording can start
  // the instant preparation time ends, with no extra prompt delay.
  useEffect(() => {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
      })
      .catch(() => {
        setError(ui.micUnavailable(instructionLanguage));
      });
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  const beginRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      setError(ui.micUnavailable(instructionLanguage));
      setPhase('done');
      return;
    }
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      setRecordingUrl(URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType })));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    setPhase('recording');
  };

  const finishRecording = () => {
    recorderRef.current?.stop();
    setPhase('done');
  };

  // Playing or replaying the question is available before recording starts.
  // Switching to 'listening' pauses the prep countdown below (it only ticks
  // while phase === 'prep'); it resumes right where it left off once this
  // play ends and phase returns to 'prep'.
  const play = () => {
    if (phase !== 'ready' && phase !== 'prep') return;
    if (plays >= data.maxPlays) return;
    setError(null);
    setPlays((p) => p + 1);
    setPhase('listening');
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play();
    }
  };

  // Preparation countdown — reaching zero starts recording automatically.
  // Only ticks while phase is 'prep', so a replay (phase 'listening') pauses
  // it without losing the remaining time.
  useEffect(() => {
    if (phase !== 'prep') return;
    if (prepLeft <= 0) {
      beginRecording();
      return;
    }
    const t = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, prepLeft]);

  // Answer countdown while recording — reaching zero stops it automatically.
  useEffect(() => {
    if (phase !== 'recording') return;
    if (answerLeft <= 0) {
      finishRecording();
      return;
    }
    const t = setTimeout(() => setAnswerLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, answerLeft]);

  const hasRecorded = recordingUrl !== null;
  const playsLeft = data.maxPlays - plays;
  const canPlay = (phase === 'ready' || phase === 'prep') && playsLeft > 0;

  const reset = () => {
    recorderRef.current?.stop();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setSubmitted(false);
    setError(null);
    setPhase('ready');
    setPlays(0);
    setPrepLeft(data.preparationSeconds);
    setAnswerLeft(data.answerSeconds);
    if (!streamRef.current) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;
        })
        .catch(() => {
          setError(ui.micUnavailable(instructionLanguage));
        });
    }
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={hasRecorded}
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

          <audio ref={audioRef} src={data.promptAudio.src} onEnded={() => setPhase('prep')} />

          <div className="recorder">
            {canPlay && (
              <button type="button" className="btn btn-primary" onClick={play}>
                {plays === 0 ? ui.playQuestion(instructionLanguage) : ui.replayQuestion(instructionLanguage)}
              </button>
            )}
            {plays > 0 && (
              <p className="audio-plays">
                {playsLeft > 0
                  ? ui.playsRemaining(instructionLanguage, playsLeft, data.maxPlays)
                  : ui.noPlaysRemaining(instructionLanguage)}
              </p>
            )}
            {phase === 'listening' && <p className="prep">{ui.listening(instructionLanguage)}</p>}
            {phase === 'prep' && <p className="prep">{ui.preparationTime(instructionLanguage, prepLeft)}</p>}
            {phase === 'recording' && (
              <>
                <p className="prep">{ui.recording(instructionLanguage, answerLeft)}</p>
                <button type="button" className="btn" onClick={finishRecording}>
                  {ui.stopRecording(instructionLanguage)}
                </button>
              </>
            )}
            {error && <p className="error">{error}</p>}

            {recordingUrl && (
              <div className="playback">
                <h3>{ui.yourRecording(instructionLanguage)}</h3>
                <audio controls src={recordingUrl} />
              </div>
            )}
          </div>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || !hasRecorded}>
              {ui.submitForReview(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
