import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback } from '../components/Shell';
import { answerValue, directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { scoreShortAnswer } from '../lib/pronunciation';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'You will hear a question. Please give a simple and short answer. Often just one ' +
    'or a few words is enough.',
  es:
    'Escucharás una pregunta. Da una respuesta simple y corta. A menudo, basta con una ' +
    'palabra o unas pocas palabras.',
  zh: '你会听到一个问题。请给出简单而简短的回答。通常只需要一两个词就足够了。',
};

/** The "For teachers" panel is fixed — it describes the Answer Short
 *  Question task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to understand a simple spoken " +
  'question and respond quickly with an appropriate short answer, drawing on basic ' +
  'vocabulary and general knowledge.';
/** This task is intentionally scoped to A1–A2, unlike most other templates'
 *  full CEFR spread — see the Notes below. */
const LEVEL_NOTES =
  'A1: Very common, concrete everyday vocabulary; quick recognition and retrieval.\n' +
  'A2: Same mechanic, slightly broader everyday vocabulary.';
const NOTES = 'Prompt length 3–9 seconds. The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student hears a short spoken question once, then answers immediately with one ' +
  'word or a few words. Recording starts automatically once the question finishes ' +
  'playing and stops automatically when the time to answer runs out. A student ' +
  'can also end the recording early using the Stop button.';
const TIME_TEXT = '10 seconds to answer and no time to prepare.';

/**
 * Listen-and-answer task: the student hears a short factual question once,
 * then answers immediately with a word or short phrase, within a fixed time
 * limit — there is no preparation time and no manual start/stop. Where the
 * browser supports speech recognition and `autoScore` is on, the transcribed
 * answer is checked against the expected answer (and its alternatives) as a
 * substring match, tolerating filler words around the actual answer.
 */
export default function AnswerShortQuestion({
  data,
  body,
  languageSwitch,
}: TemplateProps<'answer-short-question'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [phase, setPhase] = useState<'ready' | 'listening' | 'recording' | 'done'>('ready');
  const [answerLeft, setAnswerLeft] = useState(data.answerSeconds);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [result, setResult] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [srSupported, setSrSupported] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
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
  // the instant the question finishes playing, with no extra prompt delay.
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

  const play = () => {
    if (phase !== 'ready') return;
    setError(null);
    setTranscript('');
    setInterim('');
    finalRef.current = '';
    setPhase('listening');
    audioRef.current?.play();
  };

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
      setResult(scoreShortAnswer(transcript, data.correctAnswer, data.language, data.matching));
    }
    setSubmitted(true);
  };

  const reset = () => {
    recorderRef.current?.stop();
    recognitionRef.current?.abort();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    setRecordingUrl(null);
    setTranscript('');
    setInterim('');
    finalRef.current = '';
    setResult(null);
    setSubmitted(false);
    setError(null);
    setPhase('ready');
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

          <audio ref={audioRef} src={data.promptAudio.src} onEnded={beginRecording} />

          <div className="recorder">
            {phase === 'ready' && (
              <button type="button" className="btn btn-primary" onClick={play}>
                {ui.playQuestion(instructionLanguage)}
              </button>
            )}
            {phase === 'listening' && <p className="prep">{ui.listening(instructionLanguage)}</p>}
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
              {autoScoring ? ui.checkAnswer(instructionLanguage) : ui.submitForReview(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && result !== null && (
            <div className="pron-result">
              <Feedback correct={result}>
                {result
                  ? ui.correct(instructionLanguage)
                  : ui.notQuiteExpected(instructionLanguage, answerValue(data.correctAnswer))}
              </Feedback>
              {transcript && (
                <details className="transcript">
                  <summary>{ui.whatRecognizerHeard(instructionLanguage)}</summary>
                  <p lang={data.language} dir={dir}>
                    {transcript}
                  </p>
                </details>
              )}
            </div>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
