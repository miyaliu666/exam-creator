import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell } from '../components/Shell';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'You will hear an audio extract once. After a short preparation time, summarize ' +
    'the key points in your own words. Recording begins automatically once the ' +
    'preparation time ends.',
  es:
    'Escucharás un extracto de audio una sola vez. Después de un breve tiempo de ' +
    'preparación, resume los puntos clave con tus propias palabras. La grabación ' +
    'comienza automáticamente cuando termina el tiempo de preparación.',
  zh: '你将听一次音频片段。经过短暂的准备时间后，用你自己的话总结要点。准备时间结束后，录音将自动开始。',
};

/** The "For teachers" panel is fixed — it describes the Summary task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to identify and summarize the " +
  'key points of an audio extract (e.g. a meeting or tutorial) concisely and ' +
  'accurately in their own words.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'B2: A longer extract with less explicit signaling between points.\n' +
  'C1: Abstract or specialized content, a natural, unsignaled structure.\n' +
  'C2: Near-native extract; dense, fast, idiomatic content requiring full synthesis.';
const NOTES = 'Prompt length up to 90 seconds. The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student listens once to an audio extract of a meeting or tutorial in which four ' +
  'key points are given, then has a short preparation time before summarizing those ' +
  'points aloud. Recording starts automatically when the preparation time ends and ' +
  'stops automatically when the time to answer runs out. A student can also end ' +
  'the recording early using the Stop button.';
const TIME_TEXT = '40 seconds to answer and 10 seconds to prepare.';

/**
 * Exam-style summarize-the-audio task: the student hears an extract once,
 * gets a short fixed preparation window, then recording starts and stops
 * automatically on fixed timers — there is no manual start/stop, and no
 * auto-scoring (a free summary can't be matched against a fixed answer). A
 * teacher assesses the recording afterwards, like the Describe an Image task.
 */
export default function Summary({ data, body, languageSwitch }: TemplateProps<'summary'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [phase, setPhase] = useState<'ready' | 'listening' | 'prep' | 'recording' | 'done'>('ready');
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

  const play = () => {
    if (phase !== 'ready') return;
    setError(null);
    setPhase('listening');
    audioRef.current?.play();
  };

  // Preparation countdown after the audio ends — reaching zero starts
  // recording automatically.
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
            {phase === 'ready' && (
              <button type="button" className="btn btn-primary" onClick={play}>
                {ui.playExtract(instructionLanguage)}
              </button>
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
