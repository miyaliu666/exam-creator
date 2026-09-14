// AUTO-GENERATED reference data for the sidebar's "search by skill + level"
// feature (App.tsx) and the skill badge on the exercise page. SKILL_FOR_TYPE
// mirrors the one skill each type is actually used for in practice (see the
// analysis in schema.ts's `Skill` doc comment); LEVEL_SUPPORT mirrors the
// per-level breakdown baked into each template's own LEVEL_NOTES constant.
// If either changes (a template's guidance, or which skill a type is used
// for), update the matching entry here too so search stays accurate.
import { exerciseTypes, type ExerciseType, type Skill } from './schema';

/** The one skill each exercise type is used for. Omitted entries (currently
 *  just `fill-in-blanks`, used for both vocabulary and grammar drills) have
 *  no single skill — see `Skill`'s doc comment in schema.ts. */
export const SKILL_FOR_TYPE: Partial<Record<ExerciseType, Skill>> = {
  listening: 'listening',
  dictation: 'listening',
  'listening-diagram-label': 'listening',
  'listening-short-answer-questions': 'listening',
  'listen-and-choose-picture': 'listening',
  'listening-fill-in-blanks': 'listening',
  'highlight-correct-summary': 'listening',
  'select-missing-word': 'listening',
  'highlight-incorrect-words': 'listening',
  'listening-matching': 'listening',
  'listen-and-respond': 'listening',
  'short-answer-questions': 'reading',
  'identify-idea': 'reading',
  'title-the-passage': 'reading',
  'complete-the-passage': 'reading',
  'choose-the-word': 'reading',
  'matching-headings': 'reading',
  'identify-information': 'reading',
  'matching-sentence-endings': 'reading',
  'reading-sentence-completion': 'reading',
  'word-formation': 'reading',
  'highlight-the-answer': 'reading',
  'diagram-label': 'reading',
  'multiple-choice-single-answer': 'reading',
  'missing-letters': 'reading',
  'drag-to-complete': 'reading',
  ordering: 'reading',
  'passage-reconstruction': 'grammar',
  writing: 'writing',
  'describe-picture': 'writing',
  'picture-sentence': 'writing',
  'picture-story': 'writing',
  'two-text-essay': 'writing',
  'situational-writing': 'writing',
  'report-writing': 'writing',
  'opinion-essay': 'writing',
  'answer-an-email': 'writing',
  'summarize-text': 'writing',
  'guided-writing': 'writing',
  'build-a-sentence': 'writing',
  speaking: 'speaking',
  pronunciation: 'speaking',
  'read-aloud': 'speaking',
  'describe-image': 'speaking',
  summary: 'speaking',
  'listen-and-speak': 'speaking',
  'sentence-builds': 'speaking',
  'answer-short-question': 'speaking',
  conversations: 'speaking',
  'express-opinion': 'speaking',
  'read-and-speak': 'speaking',
  'respond-using-information': 'speaking',
  'argument-evaluation': 'speaking',
  'sentence-completion': 'vocabulary',
  'multiple-choice': 'vocabulary',
  'match-columns': 'vocabulary',
  'image-label': 'vocabulary',
  categorize: 'grammar',
  'vocabulary-recognition': 'vocabulary',
  // 'fill-in-blanks' intentionally has no entry — see the comment above.
};

const CORE_SIDEBAR_SKILLS = new Set<Skill>(['listening', 'reading', 'writing', 'speaking']);

/** Which sidebar skill group each task type belongs to, derived from
 *  `SKILL_FOR_TYPE`. Vocabulary and grammar (and `fill-in-blanks`, which has
 *  no skill at all) all fall under "other", the sidebar's "Curriculum"
 *  group — the menu only names the four core skills. */
export const TYPE_SKILL: Record<ExerciseType, 'listening' | 'reading' | 'writing' | 'speaking' | 'other'> =
  Object.fromEntries(
    exerciseTypes.map((t) => {
      const skill = SKILL_FOR_TYPE[t];
      return [t, skill && CORE_SIDEBAR_SKILLS.has(skill) ? skill : 'other'];
    }),
  ) as Record<ExerciseType, 'listening' | 'reading' | 'writing' | 'speaking' | 'other'>;

/** CEFR levels each task type's own "By level" guidance says it supports. */
export const LEVEL_SUPPORT: Record<ExerciseType, string[]> = {
  'listening': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'dictation': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'listening-diagram-label': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'listening-short-answer-questions': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'listen-and-choose-picture': ['A1', 'A2'],
  'listening-fill-in-blanks': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'highlight-correct-summary': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'select-missing-word': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'highlight-incorrect-words': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'listening-matching': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'listen-and-respond': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'short-answer-questions': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'identify-idea': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'title-the-passage': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'complete-the-passage': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'choose-the-word': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'matching-headings': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'identify-information': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'matching-sentence-endings': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'reading-sentence-completion': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'word-formation': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'highlight-the-answer': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'diagram-label': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'multiple-choice-single-answer': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'missing-letters': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'drag-to-complete': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'ordering': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'passage-reconstruction': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'writing': ['A1', 'A2', 'B1', 'B2'],
  'describe-picture': ['A1', 'A2'],
  'picture-sentence': ['A1', 'A2'],
  'picture-story': ['A2'],
  'two-text-essay': ['C2'],
  'situational-writing': ['B1', 'B2', 'C1', 'C2'],
  'report-writing': ['B2', 'C1', 'C2'],
  'opinion-essay': ['B1', 'B2', 'C1', 'C2'],
  'answer-an-email': ['A1', 'A2', 'B1', 'B2', 'C1'],
  'summarize-text': ['B1', 'B2', 'C1', 'C2'],
  'guided-writing': ['A1', 'A2', 'B1'],
  'speaking': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'pronunciation': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'read-aloud': ['A1', 'A2', 'B1', 'B2'],
  'describe-image': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'summary': ['B2', 'C1', 'C2'],
  'listen-and-speak': ['A2', 'B1', 'B2', 'C1', 'C2'],
  'sentence-builds': ['A1', 'A2'],
  'answer-short-question': ['A1', 'A2'],
  'conversations': ['A1', 'A2', 'B1'],
  'express-opinion': ['B1', 'B2', 'C1', 'C2'],
  'read-and-speak': ['B1', 'B2', 'C1', 'C2'],
  'respond-using-information': ['B1', 'B2', 'C1', 'C2'],
  'argument-evaluation': ['B2', 'C1', 'C2'],
  'fill-in-blanks': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'sentence-completion': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'multiple-choice': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'match-columns': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'image-label': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'categorize': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'vocabulary-recognition': ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
  'build-a-sentence': ['A1', 'A2'],
};
