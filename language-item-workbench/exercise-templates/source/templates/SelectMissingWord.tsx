import { useState } from 'react';
import type { TemplateProps } from './types';
import { CompactAudioButton, ExerciseShell, Feedback } from '../components/Shell';
import { directionForLanguage } from '../lib/grading';
import { ui } from '../lib/i18n';

/** The Sample box's instruction line is generic UI copy, not authored
 *  content — translated here rather than per-exercise. Falls back to English. */
const SAMPLE_INTRO: Record<string, string> = {
  en: 'You will hear a recording. At the end of the recording, the last word or group of words has been replaced by a beep. Select the correct option to complete the recording.',
  es: 'Escucharás una grabación. Al final de la grabación, la última palabra o grupo de palabras ha sido reemplazada por un pitido. Selecciona la opción correcta para completar la grabación.',
  zh: '你将听到一段录音。在录音的结尾，最后一个词或一组词被替换成了提示音。请选择正确的选项来完成这段录音。',
};

/** The "For teachers" panel is fixed — it describes the Select Missing
 *  Word task type itself, not any one exercise's content, so it must read
 *  the same no matter which language/level variant is currently selected.
 *  Only the Sample below it changes with the active variant. */
const TEACHING_FOCUS =
  'This type of question tests your ability to infer a specific missing ' +
  'word or phrase from the meaning and context of a recording alone, ' +
  'since no transcript is shown and the word itself is never heard.';
/** Paraphrases the CEFR's own "Overall Listening Comprehension" descriptor
 *  scale (Council of Europe, Structured overview of all CEFR scales, p.8). */
const LEVEL_NOTES =
  'A2: Clearly different-topic options, strong contextual clues earlier in the recording, slow and clear.\n' +
  'B1: Natural pace; options are all plausible completions.\n' +
  'B2: Natural pace; options are equally plausible on the surface.\n' +
  'C1: Closely related options requiring subtle contextual weighing.\n' +
  'C2: Near-native nuance; options differ by connotation or register, not topic.';
const NOTES =
  'The beep should replace only the final word or short group of words, ' +
  'and the rest of the recording must supply enough context to infer the ' +
  'answer. Options should all fit the recording grammatically, but refer ' +
  'to different topics or contexts, so a student cannot guess correctly ' +
  'without understanding what was said.';
const FORMAT_TEXT =
  'A student hears a recording in which the final word or group of ' +
  'words has been replaced by a beep, and selects the option that ' +
  'correctly completes it.';
const LENGTH_TEXT = 'Recording up to 30 seconds, with 3-4 word or short-phrase options.';

/**
 * A single audio recording ending in a beep, with no transcript shown —
 * the student must infer the missing word or phrase from context alone,
 * then choose it from the options below. Distinct from Fill in the Blanks
 * (Listening), which shows the full transcript with the target word
 * spoken normally.
 */
export default function SelectMissingWord({ data, body, id, languageSwitch }: TemplateProps<'select-missing-word'>) {
  const instructionLanguage = data.instructionLanguage ?? data.language;
  const sampleIntro = SAMPLE_INTRO[instructionLanguage] ?? SAMPLE_INTRO.en;
  const dir = directionForLanguage(data.language);

  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [plays, setPlays] = useState(0);

  const correct = selected === data.correctIndex;

  const reset = () => {
    setSelected(null);
    setSubmitted(false);
    setPlays(0);
  };

  return (
    <ExerciseShell
      data={data}
      body={body}
      submitted={submitted}
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
            <dd>{FORMAT_TEXT}</dd>
          </div>
          <div className="meta-row">
            <dt>Length</dt>
            <dd>{LENGTH_TEXT}</dd>
          </div>
          <div className="meta-row">
            <dt>By level</dt>
            <dd>{LEVEL_NOTES}</dd>
          </div>
          <div className="meta-row">
            <dt>Notes</dt>
            <dd>{NOTES}</dd>
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

          <ul className="options">
            {data.options.map((opt, i) => {
              const isChosen = selected === i;
              const isKey = i === data.correctIndex;
              const state = !submitted ? '' : isKey ? 'option-key' : isChosen ? 'option-wrong' : '';
              return (
                <li key={i}>
                  <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                    <input
                      type="radio"
                      name={`${id}-select-missing-word`}
                      checked={isChosen}
                      disabled={submitted}
                      onChange={() => setSelected(i)}
                    />
                    <span lang={data.language} dir={dir}>
                      {opt}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>

          <div className="controls">
            <button className="btn btn-primary" onClick={() => setSubmitted(true)} disabled={submitted || selected === null}>
              {ui.checkAnswers(instructionLanguage)}
            </button>
            <button className="btn" onClick={reset}>
              {ui.reset(instructionLanguage)}
            </button>
          </div>

          {submitted && (
            <Feedback correct={correct}>
              {correct ? ui.correct(instructionLanguage) : ui.notQuite(instructionLanguage)}
              {data.explanation ? `: ${data.explanation}` : ''}
            </Feedback>
          )}
        </div>
      </section>
    </ExerciseShell>
  );
}
