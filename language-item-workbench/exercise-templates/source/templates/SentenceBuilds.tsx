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
    'You will hear three short phrases, in random order. Rearrange them and say the ' +
    'resulting sentence aloud. Recording begins automatically once the phrases finish ' +
    'playing.',
  es:
    'Escucharás tres frases cortas, en orden aleatorio. Ordénalas y di la oración ' +
    'resultante en voz alta. La grabación comienza automáticamente cuando terminan de ' +
    'reproducirse las frases.',
  zh: '你将听到三个顺序打乱的短语。请重新排列并大声说出组成的句子。短语播放结束后，录音将自动开始。',
};

/** The "For teachers" panel is fixed — it describes the Sentence Builds
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's mastery of sentence structure, in addition to their " +
  'pronunciation and fluency, by requiring them to construct and articulate entire ' +
  'sentences.';
/** Paraphrases the CEFR's own "Grammatical Accuracy" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: Very short, simple, high-frequency phrases that combine in only one order.\n' +
  'A2: Same mechanic, slightly richer phrase content.';
const NOTES =
  'Phrases/words in the audio should use dictionary form (infinitive verbs, ' +
  'masculine singular nouns, etc.). The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student hears three short phrases and rearranges them to make a sentence. The ' +
  'phrases are presented in a random order (excluding the original word order), and ' +
  'the student says a grammatical sentence made up of a rearrangement of the three ' +
  'given phrases. A student can also end the recording early using the Stop button.';
const TIME_TEXT = '15 seconds to answer and no time to prepare.';

/**
 * Listen-and-reorder task: the student hears three scrambled phrases once,
 * then must say them back rearranged into a grammatical sentence, within a
 * fixed time limit — there is no preparation time and no manual start/stop.
 * Where the browser supports speech recognition and `autoScore` is on, the
 * attempt is transcribed and scored word-by-word against the correct
 * sentence, same as the Read Aloud and Listen and Repeat tasks.
 */
export default function SentenceBuilds({ data, body, languageSwitch }: TemplateProps<'sentence-builds'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [phase, setPhase] = useState<'ready' | 'listening' | 'recording' | 'done'>('ready');
  const [answerLeft, setAnswerLeft] = useState(data.answerSeconds);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [result, setResult] = useState<ReadAloudResult | null>(null);
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
  // the instant the phrases finish playing, with no extra prompt delay.
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
      setResult(scoreReadAloud(data.target, transcript, data.language, data.matching));
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

          <audio ref={audioRef} src={data.promptAudio.src} onEnded={beginRecording} />

          <div className="recorder">
            {phase === 'ready' && (
              <button type="button" className="btn btn-primary" onClick={play}>
                {ui.playPhrases(instructionLanguage)}
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
              <p className="hint">{ui.hintSentenceBuilds(instructionLanguage)}</p>
            </div>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
