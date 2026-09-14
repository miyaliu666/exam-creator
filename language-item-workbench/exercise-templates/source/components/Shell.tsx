import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Answer, Exercise, Media } from '../lib/schema';
import { SKILL_FOR_TYPE } from '../lib/levelSupport';
import {
  answerValue,
  directionForLanguage,
  isCorrect,
  percentage,
  type EffectiveMatching,
  type Score,
} from '../lib/grading';
import { CharacterHelper } from './CharacterHelper';
import { ui } from '../lib/i18n';

const markdown = new Marked({ gfm: true, breaks: true });
// Workbench content is authored/AI-generated: sanitize HTML and URL attributes.
function renderMarkdown(content: string): string {
  return DOMPurify.sanitize(markdown.parse(content) as string, { USE_PROFILES: { html: true }, ADD_ATTR: ['data-blank-index'] });
}

/**
 * Props for every field a student types an answer into. `dir="auto"` aligns
 * typed RTL text correctly; the browser's spellcheck/autocorrect/autocapitalize
 * are off so it never "fixes" a foreign-language answer, and autocomplete is
 * off so the browser never suggests a previously-typed answer (its own or
 * another exercise's) instead of what the student actually recalls.
 */
export const answerFieldProps = {
  dir: 'auto',
  spellCheck: false,
  autoCorrect: 'off',
  autoCapitalize: 'off',
  autoComplete: 'off',
} as const;

/**
 * Renders an author-written markdown string. Content is sanitized before rendering.
 * `lang`/`dir` let a block set its own direction — so English instructions
 * inside an RTL exercise still read left-to-right. Pass `dir="auto"` to let the
 * bidi algorithm decide from the text when the language is not known.
 */
export function Markdown({
  children,
  className,
  lang,
  dir,
}: {
  children: string;
  className?: string;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
}) {
  return (
    <div
      className={`md ${className ?? ''}`}
      lang={lang}
      dir={dir}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(children) as string }}
    />
  );
}

/**
 * Renders author-written markdown whose numbered `(1)`, `(2)`... markers
 * become live, focus-preserving text inputs in place — inside a table cell,
 * a note's bullet, a summary paragraph, wherever the marker sits — instead
 * of a separate numbered answer list below the content.
 *
 * The markdown is parsed to HTML once (it doesn't depend on what the student
 * types), with each marker replaced by an empty `<span data-blank-index>`
 * before parsing; `marked` passes that raw HTML straight through. A layout
 * effect then locates those spans in the mounted DOM and portals a real
 * `<input>` into each one. Because the surrounding HTML never re-renders
 * while typing (only the portaled input's own props change), the student's
 * cursor position is never disturbed — the usual risk with rebuilding
 * `dangerouslySetInnerHTML` content on every keystroke.
 */
export function MarkdownWithBlanks({
  content,
  labels,
  values,
  matching,
  submitted,
  onChange,
  lang,
  dir,
}: {
  content: string;
  labels: Answer[];
  values: Record<number, string>;
  matching?: Partial<EffectiveMatching>;
  submitted: boolean;
  onChange: (index: number, value: string) => void;
  lang?: string;
  dir?: 'ltr' | 'rtl' | 'auto';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slots, setSlots] = useState<HTMLElement[]>([]);

  const html = useMemo(() => {
    const withSlots = content.replace(
      /\((\d+)\)/g,
      (_match, num: string) => `<span data-blank-index="${Number(num) - 1}"></span>`,
    );
    return renderMarkdown(withSlots) as string;
  }, [content]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    setSlots(container ? Array.from(container.querySelectorAll<HTMLElement>('[data-blank-index]')) : []);
  }, [html]);

  return (
    <>
      <div ref={containerRef} className="md" lang={lang} dir={dir} dangerouslySetInnerHTML={{ __html: html }} />
      {slots.map((node) => {
        const index = Number(node.dataset.blankIndex);
        const label = labels[index];
        if (label === undefined) return null;
        const right = isCorrect(values[index] ?? '', label, matching);
        return createPortal(
          <input
            {...answerFieldProps}
            type="text"
            className={`blank ${submitted ? (right ? 'blank-correct' : 'blank-wrong') : ''}`}
            value={values[index] ?? ''}
            disabled={submitted}
            size={Math.max(answerValue(label).length, 4)}
            aria-label={`${ui.selectPlaceholder(lang ?? 'en')} ${index + 1}`}
            lang={lang}
            dir={dir}
            onChange={(e) => onChange(index, e.target.value)}
          />,
          node,
          `blank-${index}`,
        );
      })}
    </>
  );
}

/**
 * Common chrome for every exercise: metadata header, instructions, the
 * template's own body, then the submit/reset controls and score.
 */
export function ExerciseShell({
  data,
  body,
  children,
  onSubmit,
  onReset,
  submitted,
  score,
  submitLabel = 'Check answers',
  canSubmit = true,
  characterHelper = false,
  hideMeta = false,
  hideTeacherNotes = false,
  titleExtra,
  hideFooter = false,
}: {
  data: Exercise;
  body: string;
  children: ReactNode;
  onSubmit: () => void;
  onReset: () => void;
  submitted: boolean;
  score?: Score;
  submitLabel?: string;
  canSubmit?: boolean;
  /** Show the special-character bar (templates with text entry opt in). */
  characterHelper?: boolean;
  /** Hide the level/language/skill/type badges and the hashtag list. */
  hideMeta?: boolean;
  /** Suppress the post-submission "Teacher notes" aside — for templates that
   *  already show teacherNotes in their own teacher-facing section, where
   *  showing it again to the student after submitting would be a leak. */
  hideTeacherNotes?: boolean;
  /** Rendered inline next to the title (e.g. an edit-mode toggle). */
  titleExtra?: ReactNode;
  /** Suppress the default submit/reset footer — for templates that render
   *  their own controls inline (e.g. inside their own sample panel). */
  hideFooter?: boolean;
}) {
  // Instructions may be in a different language than the exercise (e.g. English
  // guidance for an Arabic task), so they set their own direction.
  const instructionLanguage = data.instructionLanguage ?? data.language;
  return (
    // lang drives font selection (Han unification) and dir mirrors the layout
    // for Arabic/Hebrew. Both are scoped here so the app chrome stays LTR.
    <article className="exercise" lang={data.language} dir={directionForLanguage(data.language)}>
      <header className="exercise-header">
        {!hideMeta && (
          <div className="badges">
            <span className="badge badge-level">{data.level}</span>
            <span className="badge">{data.language}</span>
            {SKILL_FOR_TYPE[data.type] && <span className="badge">{SKILL_FOR_TYPE[data.type]}</span>}
            <span className="badge badge-type">{data.type}</span>
            {data.estimatedMinutes && <span className="badge">{data.estimatedMinutes} min</span>}
          </div>
        )}
        <div className="title-row" lang="en" dir="ltr">
          <h1>{data.title}</h1>
          {titleExtra}
        </div>
        {!hideMeta && data.tags.length > 0 && (
          <p className="tags">{data.tags.map((t) => `#${t}`).join('  ')}</p>
        )}
      </header>

      {body && (
        <Markdown
          className="instructions"
          lang={instructionLanguage}
          dir={directionForLanguage(instructionLanguage)}
        >
          {body}
        </Markdown>
      )}

      {characterHelper && !submitted && <CharacterHelper language={data.language} />}

      <div className="exercise-body">{children}</div>

      {!hideFooter && (
        <footer className="exercise-footer">
          <div className="controls">
            <button className="btn btn-primary" onClick={onSubmit} disabled={!canSubmit || submitted}>
              {submitLabel}
            </button>
            <button className="btn" onClick={onReset}>
              Reset
            </button>
          </div>
          {submitted && score && (
            <p className={`score ${percentage(score) >= 60 ? 'score-pass' : 'score-fail'}`}>
              {score.correct} / {score.total} correct ({percentage(score)}%)
            </p>
          )}
        </footer>
      )}

      {!hideTeacherNotes && submitted && data.teacherNotes && (
        <aside className="teacher-notes">
          <h3>Teacher notes</h3>
          {/* No language metadata for notes — let the text decide its direction. */}
          <Markdown dir="auto">{data.teacherNotes}</Markdown>
        </aside>
      )}
    </article>
  );
}

export function Feedback({ correct, children }: { correct: boolean; children?: ReactNode }) {
  return (
    <p className={`feedback ${correct ? 'feedback-correct' : 'feedback-wrong'}`}>
      <span aria-hidden="true">{correct ? '✓' : '✗'}</span>
      <span>{children ?? (correct ? 'Correct' : 'Not quite')}</span>
    </p>
  );
}

/** Audio player that can enforce the author's `maxPlays` limit. */
export function AudioPlayer({
  media,
  maxPlays,
  plays,
  onPlay,
  lang = 'en',
}: {
  media: Media;
  maxPlays?: number;
  plays: number;
  onPlay: () => void;
  lang?: string;
}) {
  const exhausted = maxPlays !== undefined && plays >= maxPlays;
  return (
    <div className="audio">
      <audio
        controls
        src={media.src}
        onPlay={(e) => {
          if (exhausted) {
            e.currentTarget.pause();
            return;
          }
          onPlay();
        }}
      >
        {media.alt}
      </audio>
      {maxPlays !== undefined && (
        <p className="audio-plays">
          {exhausted ? ui.noPlaysRemaining(lang) : ui.playsRemaining(lang, maxPlays - plays, maxPlays)}
        </p>
      )}
      {media.credit && <p className="credit">{media.credit}</p>}
    </div>
  );
}

/**
 * A play-only audio control: no scrubber, timer, or volume — just a button
 * and a compact plays-remaining counter, for layouts where the full
 * AudioPlayer's native control bar would take up too much space (e.g. one
 * row per item in a list of several short recordings).
 */
export function CompactAudioButton({
  media,
  maxPlays,
  plays,
  onPlay,
  lang,
}: {
  media: Media;
  maxPlays?: number;
  plays: number;
  onPlay: () => void;
  lang: string;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const exhausted = maxPlays !== undefined && plays >= maxPlays;

  return (
    <>
      <audio
        ref={ref}
        src={media.src}
        onPlay={(e) => {
          if (exhausted) {
            e.currentTarget.pause();
            return;
          }
          setIsPlaying(true);
          onPlay();
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        className={`btn-play ${isPlaying ? 'btn-play-active' : ''}`}
        disabled={exhausted || isPlaying}
        aria-label={ui.playLabel(lang)}
        onClick={() => ref.current?.play()}
      >
        {isPlaying ? '♪' : '▶'}
      </button>
      {maxPlays !== undefined && (
        <span className="compact-plays">
          {isPlaying
            ? ui.nowPlaying(lang)
            : exhausted
              ? ui.noPlaysRemaining(lang)
              : ui.playsRemaining(lang, maxPlays - plays, maxPlays)}
        </span>
      )}
    </>
  );
}

export function Rubric({ rows }: { rows: { criterion: string; descriptor?: string; points: number }[] }) {
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.points, 0);
  return (
    <div className="rubric">
      <h3>Assessment rubric</h3>
      <table>
        <thead>
          <tr>
            <th>Criterion</th>
            <th>What we look for</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.criterion}>
              <td>{r.criterion}</td>
              <td>{r.descriptor ?? '-'}</td>
              <td>{r.points}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td>{total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
