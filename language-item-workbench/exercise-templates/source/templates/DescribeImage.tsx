import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell } from '../components/Shell';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'In this task, an image is displayed on screen, which you are required to describe ' +
    'in 40 seconds. Recording begins automatically once the preparation time ends.',
  zh: '在此任务中，屏幕上会显示一张图片，你需要在40秒内对其进行描述。准备时间结束后，录音将自动开始。',
  es:
    'En esta tarea se muestra una imagen en la pantalla, que debes describir en 40 ' +
    'segundos. La grabación comienza automáticamente cuando termina el tiempo de ' +
    'preparación.',
};

/** The "For teachers" panel is fixed — it describes the Describe an Image
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to use descriptive language. The pictures " +
  'shown can include depictions of people, animals, and objects in a wide range of ' +
  'contexts.';
/** Paraphrases the CEFR's own "Overall Spoken Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.20). */
const LEVEL_NOTES =
  'A2: A single concrete, everyday object, person, or animal.\n' +
  'B1: A few related elements linked into a simple description.\n' +
  'B2: Fuller description with more elaboration.\n' +
  'C1: A busier scene with several people, actions, or objects, integrating sub-themes.\n' +
  'C2: Near-native description; nuanced, precise vocabulary, effortless integration of detail.';
const NOTES = 'The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student sees an image on screen. Once the preparation time ends, recording ' +
  'starts automatically and stops automatically when the time to answer runs out. ' +
  'A student can also end the recording early using the Stop button.';
const TIME_TEXT = '40 seconds to answer and 30 seconds to prepare.';

/**
 * Exam-style describe-the-image task: the student sees an image, gets a fixed
 * preparation window, then recording starts and stops automatically on fixed
 * timers — there is no manual start/stop, and no auto-scoring. A teacher
 * grades the recording afterwards against the rubric, like the Speaking task.
 */
export default function DescribeImage({ data, body, languageSwitch }: TemplateProps<'describe-image'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;

  const [phase, setPhase] = useState<'prep' | 'recording' | 'done'>('prep');
  const [prepLeft, setPrepLeft] = useState(data.preparationSeconds);
  const [answerLeft, setAnswerLeft] = useState(data.answerSeconds);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  // The mic is requested as soon as the page loads, so recording can start
  // the instant the preparation countdown reaches zero, with no extra prompt
  // delay in between.
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

  // Preparation countdown — reaching zero starts recording automatically.
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
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setSubmitted(false);
    setError(null);
    setPhase('prep');
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

          <figure className="describe-image-figure">
            <img src={data.image.src} alt={data.image.alt ?? ''} />
            {data.image.credit && <p className="credit">{data.image.credit}</p>}
          </figure>

          <div className="recorder">
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
