import { correctIndices, selectionIsCorrect } from '../lib/grading';
import { ui } from '../lib/i18n';
import { answerFieldProps, Feedback, Markdown } from './Shell';

/**
 * A question is multiple-choice when it has `options`, and open-response
 * otherwise. Open questions are never auto-scored — they reveal `sampleAnswer`
 * after submission instead.
 */
export type Question = {
  prompt: string;
  options?: string[];
  correct?: number | number[];
  sampleAnswer?: string;
  explanation?: string;
};

export type Selections = Record<number, number[]>;
export type Written = Record<number, string>;

const isScorable = (q: Question): q is Question & { options: string[]; correct: number | number[] } =>
  q.options !== undefined && q.correct !== undefined;

/** Scores only the auto-gradable questions; open ones are excluded from the total. */
export function gradeQuestions(questions: Question[], selections: Selections) {
  let correct = 0;
  let total = 0;
  questions.forEach((q, i) => {
    if (!isScorable(q)) return;
    total++;
    if (selectionIsCorrect(selections[i] ?? [], q.correct)) correct++;
  });
  return { correct, total };
}

/**
 * Shared by multiple-choice, listening and reading. Renders radios for
 * single-answer questions, checkboxes when `correct` is an array, and a
 * textarea when the question has no options at all.
 */
export function QuestionList({
  questions,
  selections,
  onChange,
  written = {},
  onWrittenChange,
  submitted,
  idPrefix,
  language = 'en',
}: {
  questions: Question[];
  selections: Selections;
  onChange: (next: Selections) => void;
  written?: Written;
  onWrittenChange?: (next: Written) => void;
  submitted: boolean;
  idPrefix: string;
  language?: string;
}) {
  const toggle = (qi: number, oi: number, multi: boolean) => {
    if (submitted) return;
    const current = selections[qi] ?? [];
    const next = multi
      ? current.includes(oi)
        ? current.filter((x) => x !== oi)
        : [...current, oi]
      : [oi];
    onChange({ ...selections, [qi]: next });
  };

  return (
    <ol className="questions">
      {questions.map((q, qi) => {
        const open = q.options === undefined;
        const multi = q.correct !== undefined && correctIndices(q.correct).length > 1;
        const chosen = selections[qi] ?? [];
        const right = q.correct !== undefined && selectionIsCorrect(chosen, q.correct);

        return (
          <li key={qi} className="question">
            <Markdown className="question-prompt">{q.prompt}</Markdown>
            {multi && <p className="hint">{ui.selectAllThatApply(language)}</p>}

            {open ? (
              <textarea
                {...answerFieldProps}
                rows={3}
                className="open-answer"
                value={written[qi] ?? ''}
                disabled={submitted}
                aria-label={ui.answerToQuestionLabel(language, qi + 1)}
                placeholder={ui.typeAnswerHere(language)}
                onChange={(e) => onWrittenChange?.({ ...written, [qi]: e.target.value })}
              />
            ) : (
              <ul className="options">
                {q.options!.map((opt, oi) => {
                  const isChosen = chosen.includes(oi);
                  const isKey = q.correct !== undefined && correctIndices(q.correct).includes(oi);
                  const state = !submitted
                    ? ''
                    : isKey
                      ? 'option-key'
                      : isChosen
                        ? 'option-wrong'
                        : '';
                  return (
                    <li key={oi}>
                      <label className={`option ${isChosen ? 'option-chosen' : ''} ${state}`}>
                        <input
                          type={multi ? 'checkbox' : 'radio'}
                          name={`${idPrefix}-q${qi}`}
                          checked={isChosen}
                          disabled={submitted}
                          onChange={() => toggle(qi, oi, multi)}
                        />
                        <span>{opt}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}

            {submitted && !open && (
              <Feedback correct={right}>
                {right ? ui.correct(language) : ui.notQuite(language)}
                {q.explanation ? `: ${q.explanation}` : ''}
              </Feedback>
            )}
            {submitted && open && q.sampleAnswer && (
              <div className="sample-answer">
                <h4>{ui.sampleAnswerHeading(language)}</h4>
                <Markdown>{q.sampleAnswer}</Markdown>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
