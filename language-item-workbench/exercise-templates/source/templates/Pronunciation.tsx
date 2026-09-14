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
    'You will hear a sentence. Repeat it exactly as you hear it. You will hear the ' +
    'sentence only once.',
  fr:
    "Vous allez entendre une phrase. Répétez-la exactement telle que vous l'entendez. " +
    "Vous n'entendrez la phrase qu'une seule fois.",
  es:
    'Vas a escuchar una frase. Repítela exactamente como la escuchas. Solo vas a ' +
    'escuchar la frase una vez.',
  zh: '你将听到一句话。请准确地重复这句话。这句话只会播放一次。',
};

/** The "For teachers" panel is fixed — it describes the Listen and Repeat
 *  task type itself, not any one exercise's content, so it must read the
 *  same no matter which language/level variant is currently selected. Only
 *  the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests pronunciation, fluency, and accurate repetition of ' +
  'short spoken language. Because Repeat items require the student to organize speech ' +
  'into linguistic units, they assess mastery of phrase and sentence structure. Since ' +
  'the task requires repeating full sentences (rather than just words or phrases), it ' +
  'also offers a sample of fluency and pronunciation in continuous speech.';
/** Paraphrases the CEFR's own "Phonological Control" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.28). */
const LEVEL_NOTES =
  'A1: Very short (3–4 word) high-frequency phrase, simple sounds.\n' +
  'A2: Short sentence at the lower end of the range, simple everyday vocabulary.\n' +
  'B1: Mid-length sentence with a little more structure.\n' +
  'B2: Longer sentence that still fits comfortably in working memory.\n' +
  'C1: Upper-range sentence, lower-frequency vocabulary or a subordinate clause.\n' +
  'C2: The longest, most complex sentence in range, with natural connected-speech features.';
const NOTES =
  'Prompt length 3–9 seconds (sentences range in length from 3 to 15 words). The ' +
  'answer can only be recorded once.';
const FORMAT_TEXT =
  'A student hears a short spoken sentence once, then repeats it aloud from memory; ' +
  'no written text is shown. Recording starts automatically when the audio ends and ' +
  'stops automatically when the time to answer runs out. A student can also end ' +
  'the recording early using the Stop button.';
const TIME_TEXT = '15 seconds to answer and no time to prepare.';

/**
 * Listen-and-repeat task: the student hears a spoken sentence once, then
 * repeats it aloud from memory within a fixed time limit — there is no
 * written text at any point, and no manual start/stop for the recording.
 * Where the browser supports speech recognition and `autoScore` is on, the
 * attempt is transcribed and scored word-by-word against the target; the
 * score reflects reading accuracy, not phoneme-level pronunciation.
 */
export default function Pronunciation({ data, body, languageSwitch }: TemplateProps<'pronunciation'>) {
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
  // the instant the prompt audio finishes, with no extra prompt delay.
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
                {ui.playSentence(instructionLanguage)}
              </button>
            )}
            {phase === 'listening' && <p className="prep">{ui.listening(instructionLanguage)}</p>}
            {phase === 'recording' && <p className="prep">{ui.recording(instructionLanguage, answerLeft)}</p>}
            {phase === 'recording' && (
              <button type="button" className="btn" onClick={finishRecording}>
                {ui.stopRecording(instructionLanguage)}
              </button>
            )}
            {phase === 'recording' && autoScoring && (
              <p className="pron-live" aria-live="polite">
                {transcript} <span className="pron-interim">{interim}</span>
              </p>
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
                  <p lang={data.language} dir={dir}>{transcript}</p>
                </details>
              )}
              <p className="hint">{ui.hintPronunciation(instructionLanguage)}</p>
            </div>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
