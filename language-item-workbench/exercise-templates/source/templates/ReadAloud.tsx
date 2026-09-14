import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { scoreReadAloud, type ReadAloudResult } from '../lib/pronunciation';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'In this task, a written sentence is displayed. You are required to read it aloud, ' +
    'clearly, within the time limit provided. Recording begins automatically once the ' +
    'preparation time ends.',
  es:
    'En esta tarea se muestra una frase escrita. Debes leerla en voz alta, con claridad, ' +
    'dentro del tiempo límite indicado. La grabación comienza automáticamente cuando ' +
    'termina el tiempo de preparación.',
  zh:
    '在此任务中，屏幕上会显示一句话。你需要在规定的时间内清楚地朗读出来。准备时间结束后，' +
    '录音将自动开始。',
};

/** The "For teachers" panel is fixed — it describes the Read Aloud task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests pronunciation, intonation and stress, e.g. producing ' +
  'individual sounds clearly, following the sentence\'s natural rhythm, and placing ' +
  'stress on the right words when reading aloud under time pressure.';
/** Paraphrases the CEFR's own "Phonological Control" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: Very short sentence, simple high-frequency vocabulary.\n' +
  'A2: Short sentence, common vocabulary, straightforward stress.\n' +
  'B1: Stays clearly intelligible even with an occasional accent.\n' +
  'B2: Calls for clear, natural intonation.';
const NOTES = 'The maximum text length is 60 words. The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student sees a written sentence on screen. Once the preparation time ends, ' +
  'recording starts automatically and stops automatically when the time to answer ' +
  'runs out. A student can also end the recording early using the Stop button.';
const TIME_TEXT = '30 seconds to answer and 30 seconds to prepare.';

/**
 * Exam-style read-aloud task: the student sees the sentence, gets a fixed
 * preparation window, then recording starts and stops automatically on fixed
 * timers — there is no manual start/stop. Where the browser supports speech
 * recognition and `autoScore` is on, the attempt is transcribed and scored
 * word-by-word, same as the Pronunciation task; the score reflects which
 * words were recognized, not phoneme-level pronunciation, intonation or
 * stress, which the browser cannot judge.
 */
export default function ReadAloud({ data, body, languageSwitch }: TemplateProps<'read-aloud'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [phase, setPhase] = useState<'prep' | 'recording' | 'done'>('prep');
  const [prepLeft, setPrepLeft] = useState(data.preparationSeconds);
  const [answerLeft, setAnswerLeft] = useState(data.answerSeconds);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [result, setResult] = useState<ReadAloudResult | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [srSupported, setSrSupported] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const finalRef = useRef('');

  // Feature-detect only on the client — window is absent during server render.
  useEffect(() => {
    setSrSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

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

  const autoScoring = data.autoScore && srSupported;

  const beginRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      setError(ui.micUnavailable(instructionLanguage));
      setPhase('done');
      return;
    }

    if (autoScoring) {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Ctor) {
        const recognition = new Ctor();
        recognition.lang = data.language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let live = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const chunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) finalRef.current += chunk + ' ';
            else live += chunk;
          }
          setTranscript(finalRef.current.trim());
          setInterim(live);
        };
        recognition.onerror = (event) => {
          if (event.error !== 'no-speech' && event.error !== 'aborted') {
            setError(ui.speechRecognitionError(instructionLanguage, event.error));
          }
        };
        recognitionRef.current = recognition;
      }
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
    recognitionRef.current?.start();
    setPhase('recording');
  };

  const finishRecording = () => {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
    setInterim('');
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

  const submit = () => {
    if (autoScoring && transcript) {
      setResult(scoreReadAloud(data.target, transcript, data.language, data.matching));
    }
    setSubmitted(true);
  };

  const reset = () => {
    recorderRef.current?.stop();
    recognitionRef.current?.abort();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setTranscript('');
    setInterim('');
    finalRef.current = '';
    setResult(null);
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

  const passed = result ? (result.score / result.total) * 100 >= data.passThreshold : false;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={hasRecorded}
      onSubmit={submit}
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

          <blockquote className="prompt" lang={data.language} dir={dir}>
            {data.target}
          </blockquote>

          <div className="recorder">
            {phase === 'prep' && <p className="prep">{ui.preparationTime(instructionLanguage, prepLeft)}</p>}
            {phase === 'recording' && (
              <>
                <p className="prep">{ui.recording(instructionLanguage, answerLeft)}</p>
                <button type="button" className="btn" onClick={finishRecording}>
                  {ui.stopRecording(instructionLanguage)}
                </button>
                {autoScoring && (
                  <p className="pron-live" aria-live="polite">
                    {transcript} <span className="pron-interim">{interim}</span>
                  </p>
                )}
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

          {phase === 'done' && !autoScoring && (
            <p className="hint">
              {data.autoScore
                ? ui.autoScoreUnavailable(instructionLanguage)
                : ui.assessedByListening(instructionLanguage)}
            </p>
          )}

          <div className="controls">
            <button className="btn btn-primary" onClick={submit} disabled={submitted || !hasRecorded}>
              {autoScoring ? ui.checkPronunciation(instructionLanguage) : ui.submitForReview(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && result && (
            <div className="pron-result">
              <Feedback correct={passed}>
                {passed ? ui.passed(instructionLanguage) : ui.keepPractising(instructionLanguage)} (
                {ui.wordsRecognised(instructionLanguage, result.score, result.total)})
              </Feedback>
              <p className="pron-marks" lang={data.language} dir={dir}>
                {result.marks.map((m, i) => (
                  <span key={i} className={m.hit ? 'word-hit' : 'word-miss'}>
                    {m.word}{' '}
                  </span>
                ))}
              </p>
              {transcript && (
                <details className="transcript">
                  <summary>{ui.whatRecognizerHeard(instructionLanguage)}</summary>
                  <p lang={data.language} dir={dir}>
                    {transcript}
                  </p>
                </details>
              )}
              <p className="hint">{ui.hintReadAloud(instructionLanguage)}</p>
            </div>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
