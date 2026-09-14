import { useEffect, useRef, useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Markdown } from '../components/Shell';
import { ui } from '../lib/i18n';

/** The cues heading is generic UI copy, not authored content — translated
 *  here rather than per-exercise. Falls back to English. */
const CUES_HEADING: Record<string, string> = {
  en: 'Talk about',
  'pt-BR': 'Fale sobre',
  es: 'Hable sobre',
  zh: '谈一谈',
};

/** The "For teachers" panel is fixed — it describes the Speaking task type
 *  itself, not any one exercise's content, so it must read the same no
 *  matter which language/level variant is currently selected. Only the
 *  Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  "This task tests the student's ability to give opinions and information on " +
  'everyday topics and common experiences or situations, by answering a range of ' +
  'questions.';
/** Paraphrases the CEFR's own "Overall Spoken Production" descriptor scale
 *  (Council of Europe, Structured overview of all CEFR scales, p.20). */
const LEVEL_NOTES =
  'A2: Simple description as a short series of phrases linked into a list.\n' +
  'B1: Sustained, straightforward description of a familiar subject as a linear sequence of points.\n' +
  'B2: Fuller description with more elaboration between points.\n' +
  'C1: Detailed presentation integrating sub-themes and rounding off with a conclusion.\n' +
  'C2: Near-native presentation; nuanced structure and precise register throughout.';
const NOTES = 'Each topic should include 3–4 points. The answer can only be recorded once.';
const FORMAT_TEXT =
  'A student gets a card which asks them to talk about a particular topic. The card ' +
  'tells them what points to include in their talk, and instructs them to explain ' +
  'one aspect of the topic. Recording starts automatically once the preparation time ' +
  'ends, and the student stops it manually when finished.';
const TIME_TEXT = '2–3 minutes to answer and 60 seconds to prepare.';

/**
 * Production task. Records the student in-browser via MediaRecorder so they can
 * play themselves back against the model audio. Nothing is uploaded — the blob
 * lives in memory until the page is reset.
 */
export default function Speaking({ data, body, languageSwitch }: TemplateProps<'speaking'>) {
  const uiLang = data.instructionLanguage ?? data.language;
  const [prepLeft, setPrepLeft] = useState(data.preparationSeconds);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [modelPlays, setModelPlays] = useState(0);

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
        setError(ui.micUnavailable(uiLang));
      });
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = () => {
    const stream = streamRef.current;
    if (!stream) {
      setError(ui.micUnavailable(uiLang));
      return;
    }
    setError(null);
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      setRecordingUrl(URL.createObjectURL(blob));
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    recorder.start();
    recorderRef.current = recorder;
    setElapsed(0);
    setRecording(true);
  };

  // Preparation countdown — reaching zero starts recording automatically.
  useEffect(() => {
    if (prepLeft <= 0) {
      if (!recording && !recordingUrl) start();
      return;
    }
    const t = setTimeout(() => setPrepLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepLeft]);

  // Elapsed-time ticker while recording.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Release the object URL so repeated takes don't leak memory.
  useEffect(() => {
    return () => {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, [recordingUrl]);

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const prepping = prepLeft > 0;

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
      canSubmit={recordingUrl !== null}
      onSubmit={() => setSubmitted(true)}
      onReset={() => {
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        setRecordingUrl(null);
        setPrepLeft(data.preparationSeconds);
        setElapsed(0);
        setSubmitted(false);
        setModelPlays(0);
        setError(null);
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
          <Markdown className="sample-intro">{data.prompt}</Markdown>

          {data.cues.length > 0 && (
            <div className="cues">
              <h3>{CUES_HEADING[uiLang] ?? CUES_HEADING.en}</h3>
              <ul>
                {data.cues.map((cue) => (
                  <li key={cue}>{cue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="recorder">
            {prepping ? (
              <p className="prep">{ui.preparationTime(uiLang, prepLeft)}</p>
            ) : (
              recording && (
                <button className="btn btn-recording" onClick={stop} disabled={submitted}>
                  {ui.stopWithElapsed(uiLang, elapsed)}
                </button>
              )
            )}

            {error && <p className="error">{error}</p>}

            {recordingUrl && (
              <div className="playback">
                <h3>{ui.yourRecording(uiLang)}</h3>
                <audio controls src={recordingUrl} />
              </div>
            )}
          </div>

          {submitted && data.modelAudio && (
            <div className="model-audio">
              <h3>{ui.modelAnswer(uiLang)}</h3>
              <div className="matching-row">
                <CompactAudioButton
                  media={data.modelAudio}
                  plays={modelPlays}
                  onPlay={() => setModelPlays((p) => p + 1)}
                  lang={uiLang}
                />
              </div>
            </div>
          )}

          <div className="controls">
            <button
              className="btn btn-primary"
              onClick={() => setSubmitted(true)}
              disabled={submitted || recordingUrl === null}
            >
              {ui.submitForReview(uiLang)}
            </button>
            <button
              className="btn"
              onClick={() => {
                if (recordingUrl) URL.revokeObjectURL(recordingUrl);
                setRecordingUrl(null);
                setPrepLeft(data.preparationSeconds);
                setElapsed(0);
                setSubmitted(false);
                setModelPlays(0);
                setError(null);
              }}
            >
              {ui.reset(uiLang)}
            </button>
          </div>
        </div>
      </section>
    </ExerciseShell>
  );
}
