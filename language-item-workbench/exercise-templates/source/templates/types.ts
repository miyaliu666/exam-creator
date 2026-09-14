import type { ReactNode } from 'react';
import type { ExerciseOf, ExerciseType } from '../lib/schema';

/** Every template component receives exactly this. */
export type TemplateProps<K extends ExerciseType> = {
  /** Stable id derived from the markdown file path — use it to seed shuffles. */
  id: string;
  data: ExerciseOf<K>;
  /** Markdown body below the frontmatter. */
  body: string;
  /** The "Try in other language" control, when this exercise has variants —
   *  most templates ignore it (ExerciseRenderer shows it above the page by
   *  default); a template can render it inline instead by placing it itself. */
  languageSwitch?: ReactNode;
};
