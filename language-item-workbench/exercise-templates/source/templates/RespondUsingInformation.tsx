import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { ExerciseShell, Feedback, Markdown } from '../components/Shell';
import { answerValue, directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';
import { scoreShortAnswer } from '../lib/pronunciation';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en:
    'You will answer three short questions based on information provided on screen. ' +
    'You will have 60 seconds to read the information before the questions begin, ' +
    'then a short time to prepare and respond to each question.',
  es:
    'Responderás tres preguntas cortas basadas en la información que aparece en ' +
    'pantalla. Tendrás 60 segundos para leer la información antes de que comiencen ' +
    'las preguntas, y luego un breve tiempo para prepararte y responder cada pregunta.',
  zh:
    '你将根据屏幕上提供的信息回答三个简短的问题。在问题开始之前，你有60秒的时间阅读信息，' +
    '之后每个问题会有一小段准备和回答的时间。',
};

/** The "For teachers" panel is fixed — it describes the Respond Using
 *  Information task type itself, not any one exercise's content, so it must
 *  read the same no matter which language/level variant is currently
 *  selected. Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This task tests pronunciation, intonation and stress, grammar, vocabulary, ' +
  'cohesion, and the relevance and completeness of content.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'B1: A simple schedule; select the right entry.\n' +
  'B2: Denser information requiring some inference (combining two details).\n' +
  'C1: A complex, multi-part reference document; synthesizing information across sections.\n' +
  'C2: Near-native document; nuanced synthesis and precise spoken response under time pressure.';
const NOTES =
  'Every question can only be recorded once. By convention, the final question is ' +
  'played twice; earlier questions are played once.';
const FORMAT_TEXT =
  'A student answers three short questions based on information provided (e.g. a ' +
  'schedule, notice or timetable). A student can also end each recording early ' +
  'using the Stop button.';
const TIME_TEXT = '60 seconds to read the information, then 3 seconds to prepare and 15–30 seconds to answer each question.';

type Stage = 'reading' | 'listening' | 'prep' | 'recording' | 'review';

/**
 * Multi-question listen-and-answer task: the student reads a shared
 * reference document (a schedule, notice, etc.) for a fixed time, then
 * answers a sequence of short questions about it — each one played (once or
 * twice, per that question's `plays`), followed by a short fixed
 * preparation window, then automatic recording for a fixed answer time.
 * There is no manual start/stop for any recording. Where the browser
 * supports speech recognition and `autoScore` is on, each transcribed answer
 * is checked against its expected answer (and alternatives) as a substring
 * match, same as the Answer Short Question and Conversations tasks.
 */
export default function RespondUsingInformation({
  data,
  body,
  languageSwitch,
}: TemplateProps<'respond-using-information'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);
  const total = data.questions.length;

  const [stage, setStage] = useState<Stage>('reading');
  const [qIndex, setQIndex] = useState(0);
  const current = data.questions[qIndex];

  const [readingLeft, setReadingLeft] = useState(data.readingSeconds);
  const [playCount, setPlayCount] = useState(0);
  const [prepLeft, setPrepLeft] = useState(current.preparationSeconds);
  const [answerLeft, setAnswerLeft] = useState(current.answerSeconds);

  const [recordingUrls, setRecordingUrls] = useState<(string | null)[]>(() => total > 0 ? Array(total).fill(null) : []);
  const [transcripts, setTranscripts] = useState<string[]>(() => Array(total).fill(''));
  const [results, setResults] = useState<(boolean | null)[]>(() => Array(total).fill(null));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [srSupported, setSrSupported] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const finalRef = useRef('');
  const recordingQIndexRef = useRef(0);

  // Feature-detect only on the client — window is absent during server render.
  useEffect(() => {
    setSrSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  // The mic is requested as soon as the page loads, so recording can start
  // the instant each question's preparation time ends, with no extra prompt
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
      recordingUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const autoScoring = data.autoScore && srSupported;

  // Reading countdown — reaching zero moves on to the first question.
  useEffect(() => {
    if (stage !== 'reading') return;
    if (readingLeft <= 0) {
      setStage('listening');
      return;
    }
    const t = setTimeout(() => setReadingLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [stage, readingLeft]);

  // Preparation countdown for the current question — reaching zero starts
  // recording automatically.
  useEffect(() => {
    if (stage !== 'prep') return;
    if (prepLeft <= 0) {
      beginRecording();
      return;
    }
    const t = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, prepLeft]);

  const playQuestion = () => {
    if (stage !== 'listening' || playCount > 0) return;
    setError(null);
    setPlayCount(1);
    audioRef.current?.play();
  };

  // The current question finished playing — either play it again (some
  // questions, e.g. the last, are heard twice) or move on to preparation.
  const handleAudioEnded = () => {
    if (playCount < current.plays) {
      setPlayCount((p) => p + 1);
      audioRef.current?.play();
      return;
    }
    setPrepLeft(current.preparationSeconds);
    setStage('prep');
  };

  const beginRecording = () => {
    const stream = streamRef.current;
    if (!stream) {
      setError(ui.micUnavailable(instructionLanguage));
      setStage(qIndex >= total - 1 ? 'review' : 'listening');
      return;
    }

    recordingQIndexRef.current = qIndex;
    finalRef.current = '';

    if (autoScoring) {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (Ctor) {
        const recognition = new Ctor();
        recognition.lang = data.language;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalRef.current += event.results[i][0].transcript + ' ';
          }
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
    const thisQIndex = qIndex;
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const url = URL.createObjectURL(new Blob(chunksRef.current, { type: recorder.mimeType }));
      setRecordingUrls((prev) => {
        const next = [...prev];
        next[thisQIndex] = url;
        return next;
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    recognitionRef.current?.start();
    setStage('recording');
  };

  const finishRecording = () => {
    recorderRef.current?.stop();
    recognitionRef.current?.stop();
    const finishedIndex = recordingQIndexRef.current;
    const heard = finalRef.current.trim();
    setTranscripts((prev) => {
      const next = [...prev];
      next[finishedIndex] = heard;
      return next;
    });

    if (finishedIndex >= total - 1) {
      setStage('review');
      return;
    }
    const nextIndex = finishedIndex + 1;
    const nextQuestion = data.questions[nextIndex];
    setQIndex(nextIndex);
    setPlayCount(0);
    setPrepLeft(nextQuestion.preparationSeconds);
    setAnswerLeft(nextQuestion.answerSeconds);
    setStage('listening');

    // Re-acquire the mic for the next question's recording.
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
      })
      .catch(() => {
        setError(ui.micUnavailable(instructionLanguage));
      });
  };

  // Answer countdown while recording — reaching zero stops it automatically.
  useEffect(() => {
    if (stage !== 'recording') return;
    if (answerLeft <= 0) {
      finishRecording();
      return;
    }
    const t = setTimeout(() => setAnswerLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, answerLeft]);

  const allRecorded = recordingUrls.every((u) => u !== null);

  const submit = () => {
    if (autoScoring) {
      setResults(
        data.questions.map((q, i) => scoreShortAnswer(transcripts[i], q.correctAnswer, data.language, data.matching)),
      );
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
    recordingUrls.forEach((url) => {
      if (url) URL.revokeObjectURL(url);
    });
    setRecordingUrls(Array(total).fill(null));
    setTranscripts(Array(total).fill(''));
    setResults(Array(total).fill(null));
    setSubmitted(false);
    setError(null);
    setQIndex(0);
    setPlayCount(0);
    setReadingLeft(data.readingSeconds);
    setPrepLeft(data.questions[0].preparationSeconds);
    setAnswerLeft(data.questions[0].answerSeconds);
    setStage('reading');
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
      canSubmit={stage === 'review' && allRecorded}
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

          <Markdown className="prompt">{data.info}</Markdown>

          {stage === 'reading' && <p className="prep">{ui.readingTime(instructionLanguage, readingLeft)}</p>}

          {stage !== 'reading' && (
            <div className="recorder">
              <p className="hint">
                {ui.questionOf(instructionLanguage, Math.min(qIndex, total - 1) + 1, total)}
              </p>

              {(stage === 'listening' || stage === 'prep' || stage === 'recording') && (
                <audio ref={audioRef} src={current.promptAudio.src} onEnded={handleAudioEnded} />
              )}

              {stage === 'listening' && playCount === 0 && (
                <button type="button" className="btn btn-primary" onClick={playQuestion}>
                  {ui.playQuestion(instructionLanguage)}
                </button>
              )}
              {stage === 'listening' && playCount > 0 && <p className="prep">{ui.listening(instructionLanguage)}</p>}
              {stage === 'prep' && <p className="prep">{ui.preparationTime(instructionLanguage, prepLeft)}</p>}
              {stage === 'recording' && (
                <>
                  <p className="prep">{ui.recording(instructionLanguage, answerLeft)}</p>
                  <button type="button" className="btn" onClick={finishRecording}>
                    {ui.stopRecording(instructionLanguage)}
                  </button>
                </>
              )}
              {error && <p className="error">{error}</p>}
            </div>
          )}

          {stage === 'review' && (
            <div className="pron-result">
              {recordingUrls.map((url, i) =>
                url ? (
                  <div className="playback" key={i}>
                    <h3>{ui.yourAnswerTo(instructionLanguage, i + 1)}</h3>
                    <audio controls src={url} />
                    {submitted && results[i] !== null && (
                      <Feedback correct={results[i] as boolean}>
                        {results[i]
                          ? ui.correct(instructionLanguage)
                          : ui.notQuiteExpected(instructionLanguage, answerValue(data.questions[i].correctAnswer))}
                      </Feedback>
                    )}
                    {submitted && transcripts[i] && (
                      <details className="transcript">
                        <summary>{ui.whatRecognizerHeard(instructionLanguage)}</summary>
                        <p lang={data.language} dir={dir}>
                          {transcripts[i]}
                        </p>
                      </details>
                    )}
                  </div>
                ) : null,
              )}
            </div>
          )}

          <div className="controls">
            <button
              className="btn btn-primary"
              onClick={submit}
              disabled={submitted || stage !== 'review' || !allRecorded}
            >
              {autoScoring ? ui.checkAnswers(instructionLanguage) : ui.submitForReview(instructionLanguage)}
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
