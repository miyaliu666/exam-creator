import { z } from 'zod';

/**
 * Every exercise page shares this envelope. Template-specific fields are
 * merged on top of it by each `*Schema` below.
 */
export const CEFR = z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);

/**
 * Writing systems that need different answer-matching rules. Inferred from the
 * exercise `language` (see `scriptForLanguage`) unless `matching.script` says
 * otherwise. Stripping "diacritics" is right for Latin, meaning-destroying for
 * Cyrillic, and irrelevant for CJK — hence the split.
 */
export const SCRIPTS = ['latin', 'cyrillic', 'cjk', 'arabic', 'hebrew'] as const;
export type Script = (typeof SCRIPTS)[number];

/**
 * Which curriculum skill an exercise belongs to. No longer authored per page:
 * every exercise type has exactly one skill in practice (see
 * `SKILL_FOR_TYPE` in `levelSupport.ts`, the single source of truth), so it's
 * derived from `type` instead of asked for in the builder. The one type that
 * doesn't fit one skill, `fill-in-blanks` (used for both vocabulary and
 * grammar drills), simply has no entry there and gets no skill badge/search
 * term — both values landed in the same sidebar group anyway.
 */
export const SKILLS = ['reading', 'listening', 'writing', 'speaking', 'vocabulary', 'grammar'] as const;
export type Skill = (typeof SKILLS)[number];

const base = z.object({
  type: z.string(),
  title: z.string(),
  level: CEFR,
  /** BCP-47 tag of the language being taught, e.g. "pt-BR", "fr", "de". */
  language: z.string().describe('BCP-47 language tag of the language being taught, e.g. "pt-BR", "fr", "de".'),
  /** Language the instructions are written in. Defaults to the target language. */
  instructionLanguage: z.string().optional().describe('Language the on-screen instructions/labels are written in. Leave unset to use the target language.'),
  tags: z.array(z.string()).default([]),
  /** Minutes the exercise is expected to take. */
  estimatedMinutes: z.number().int().positive().optional().describe('Minutes the exercise is expected to take.'),
  /** Shown after the student submits, regardless of score. */
  teacherNotes: z.string().optional().describe('Shown to the student after they submit, regardless of score.'),
  /** Arbitrary shared id: every page with the same `variantGroup` is offered
   *  as a "Try in other language" option on the others, swapped in place with
   *  no navigation. Only one member of the group gets a sidebar entry. */
  variantGroup: z.string().optional()
    .describe('Give the same id to two or more pages (usually the same exercise in different languages) to offer them as "Try in other language" swaps on each other. Only one member of the group appears in the sidebar.'),
  /** Short, human-written label for the sidebar menu — falls back to a
   *  generic name for the exercise type, then to `title`, when unset. */
  menuLabel: z.string().optional().describe('Label shown in the sidebar menu. Falls back to a generic name for the exercise type, then to Title, when unset.'),
});

/**
 * Answer-matching options, honored by `grading.ts`. The three booleans apply
 * to every script; the rest are per-script folds that are safe to leave unset —
 * each script applies sensible defaults based on the exercise language.
 */
const matching = z.object({
  caseSensitive: z.boolean().default(false).describe('Require the exact same upper/lower case as the stored answer.'),
  /** Latin only: when false (default) "cafe" matches "café". Ignored for scripts
   *  where marks form distinct letters (Cyrillic й/ё, etc.). */
  accentSensitive: z.boolean().default(false)
    .describe('Latin scripts only: when off (default), "cafe" matches "café". Has no effect on scripts where marks form distinct letters (Cyrillic й/ё, etc.).'),
  punctuationSensitive: z.boolean().default(false).describe('Require the exact same punctuation as the stored answer.'),
  /** Override the auto-detected script. Normally inferred from `language`. */
  script: z.enum(SCRIPTS).optional()
    .describe('Overrides the writing system auto-detected from `language`. Only set this if the exercise language is misdetected.'),
  /** CJK: fold full/half-width and compatibility forms (ﾃｽﾄ = テスト). Default on. */
  foldWidth: z.boolean().optional()
    .describe('CJK only: treat full-width and half-width forms as equal (ﾃｽﾄ = テスト). On by default.'),
  /** Japanese: treat katakana and hiragana as equal (ト = と). Default off. */
  foldKana: z.boolean().optional()
    .describe('Japanese only: treat katakana and hiragana as equal (ト = と). Off by default.'),
  /** Russian: treat ё and е as equal. Default off — they are distinct letters. */
  foldYo: z.boolean().optional()
    .describe('Russian only: treat ё and е as equal. Off by default, since they are technically distinct letters.'),
  /** Arabic: strip harakat/tashkeel vowel marks, which students usually omit. Default on. */
  stripHarakat: z.boolean().optional()
    .describe('Arabic only: ignore harakat/tashkeel vowel marks, which students usually omit when typing. On by default.'),
  /** Arabic: fold alef variants, taa marbuta, alef maqsura (أإآ→ا, ة→ه, ى→ي). Default off. */
  foldAlef: z.boolean().optional()
    .describe('Arabic only: treat alef variants, taa marbuta, and alef maqsura as their base letter (أإآ→ا, ة→ه, ى→ي). Off by default.'),
  /** Hebrew: strip niqqud vowel points. Default on. */
  stripNiqqud: z.boolean().optional()
    .describe('Hebrew only: ignore niqqud vowel points, which students usually omit when typing. On by default.'),
});

/** A string answer plus any number of equally-correct alternatives. */
const answer = z.union([
  z.string(),
  z.object({
    value: z.string(),
    alternatives: z.array(z.string()).default([]),
    hint: z.string().optional(),
    explanation: z.string().optional(),
  }),
]);

const media = z.object({
  src: z.string().describe('Path to the file under `public/media/`, e.g. "/media/example.mp3" or "/media/example.svg".'),
  /** Shown to screen readers and used as a fallback caption. */
  alt: z.string().optional().describe('Shown to screen readers and used as a fallback caption.'),
  credit: z.string().optional().describe('Optional attribution shown under the image/audio, e.g. for a photo\'s source.'),
});

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const fillInBlanksSchema = base.extend({
  type: z.literal('fill-in-blanks'),
  /** Optional shuffled bank of options shown above the text. */
  wordBank: z.array(z.string()).optional()
    .describe('Optional shuffled bank of options shown above the text, e.g. so students pick rather than recall freely.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  items: z
    .array(
      z.object({
        /** Use `___` (3+ underscores) to mark each blank. */
        text: z.string().describe('Use `___` (3 or more underscores) to mark each blank.'),
        answers: z.array(answer).min(1).describe('One or more accepted answers for this item\'s blank(s), in the order the blanks appear.'),
      }),
    )
    .min(1),
});

export const sentenceCompletionSchema = base.extend({
  type: z.literal('sentence-completion'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  items: z
    .array(
      z.object({
        /** Use `___` (3+ underscores) to mark the single blank. */
        text: z.string().describe('Use `___` (3 or more underscores) to mark the single blank.'),
        answer: answer,
      }),
    )
    .min(1),
});

export const multipleChoiceSchema = base.extend({
  type: z.literal('multiple-choice'),
  /** Optional stimulus shown above every question. */
  passage: z.string().optional().describe('Optional stimulus shown above every question.'),
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        options: z.array(z.string()).min(2),
        /** 0-based index, or array of indices for multi-answer questions. */
        correct: z.union([z.number().int(), z.array(z.number().int())])
          .describe('0-based index into `options` of the correct answer (the first option is 0). For a question with more than one correct option, use an array of indices instead, e.g. [0, 2].'),
        explanation: z.string().optional(),
      }),
    )
    .min(1),
});

export const matchColumnsSchema = base.extend({
  type: z.literal('match-columns'),
  leftHeading: z.string().default('A'),
  rightHeading: z.string().default('B'),
  pairs: z.array(z.object({ left: z.string(), right: z.string() })).min(2)
    .describe('Each correct left/right pair. The left column is shown in order; the right column is shuffled for display.'),
  /** Extra right-hand items with no match, to defeat elimination strategies. */
  distractors: z.array(z.string()).default([])
    .describe('Extra right-hand items with no matching left-hand item, so the last pair can\'t be guessed by elimination.'),
});

export const imageLabelSchema = base.extend({
  type: z.literal('image-label'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  items: z
    .array(
      z.object({
        image: media,
        prompt: z.string().optional(),
        answers: z.array(answer).min(1)
          .describe('One or more accepted labels for this image (typed answers, not multiple choice).'),
      }),
    )
    .min(1),
});

export const listeningSchema = base.extend({
  type: z.literal('listening'),
  audio: media.describe('The recording the student listens to before answering.'),
  transcript: z.string().optional().describe('The recording\'s transcript, shown to the student only after they submit (see revealTranscriptAfterSubmit).'),
  /** Hide the transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide the transcript until the student has submitted their answers.'),
  maxPlays: z.number().int().positive().optional().describe('How many times the recording may be played. Leave unset for unlimited.'),
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        options: z.array(z.string()).min(2),
        correct: z.union([z.number().int(), z.array(z.number().int())])
          .describe('0-based index into `options` of the correct answer (the first option is 0). For a question with more than one correct option, use an array of indices instead, e.g. [0, 2].'),
        explanation: z.string().optional(),
      }),
    )
    .min(1),
});

export const dictationSchema = base.extend({
  type: z.literal('dictation'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** How many times each sentence's own audio may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times each sentence\'s own audio may be played. Leave unset for unlimited.'),
  /** 3-4 sentences, each with its own distinct audio (about 3-5 seconds
   *  long), which the student transcribes. */
  segments: z
    .array(z.object({ audio: media, answer: z.string(), hint: z.string().optional() }))
    .min(3)
    .max(4)
    .describe('3-4 sentences, each with its own distinct audio (about 3-5 seconds long), which the student transcribes by typing what they hear.'),
});

const rubricRow = z.object({
  criterion: z.string().describe('What this row scores, e.g. "Task achievement", "Grammar and vocabulary".'),
  descriptor: z.string().optional().describe('What a strong response looks like for this criterion, shown to the student or teacher.'),
  /** Weight out of the total score. */
  points: z.number().positive().default(1).describe('Weight of this row out of the exercise\'s total score.'),
});

export const writingSchema = base.extend({
  type: z.literal('writing'),
  prompt: z.string().describe('The writing task the student responds to.'),
  /** Overrides the Sample box's generic intro line (e.g. a word-count
   *  reminder, formatting constraints) with exercise-specific instructions.
   *  Falls back to the generic intro when unset. */
  instructions: z.string().optional()
    .describe('Overrides the generic "write your answer" intro line with exercise-specific instructions (e.g. a word-count reminder, formatting constraints). Leave unset to use the generic line.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().optional().describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().optional().describe('Maximum length of the response, in the same unit as the minimum.'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const describePictureSchema = base.extend({
  type: z.literal('describe-picture'),
  /** The picture the student describes in writing. */
  image: media.describe('The picture the student describes in writing.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().default(30).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().default(40).describe('Maximum length of the response, in the same unit as the minimum.'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const pictureSentenceSchema = base.extend({
  type: z.literal('picture-sentence'),
  /** A real photo (not an illustration) the sentence must be relevant to. */
  image: media.describe('A real photo (not an illustration) the sentence must be relevant to.'),
  /** The two words/phrases the student must use, in any form or order. */
  words: z.array(z.string()).length(2)
    .describe('Exactly two words/phrases the student must use somewhere in their sentence, in any form or order.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const pictureStorySchema = base.extend({
  type: z.literal('picture-story'),
  /** Three real photos, in order, that the story is based on. */
  images: z.array(media).length(3)
    .describe('Exactly three real photos, in the order the story should follow.'),
  /** Count unit for the minimum below. Defaults to characters for CJK, words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the minimum length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). There is no maximum. */
  minWords: z.number().int().positive().default(35).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const twoTextEssaySchema = base.extend({
  type: z.literal('two-text-essay'),
  /** The two short stimulus texts the essay must summarize, evaluate, and compare. */
  texts: z
    .array(
      z.object({
        title: z.string(),
        body: z.string(),
      }),
    )
    .length(2)
    .describe('Exactly two short stimulus texts the essay must summarize, evaluate, and compare against each other.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().default(240).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().default(280).describe('Maximum length of the response, in the same unit as the minimum.'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const situationalWritingSchema = base.extend({
  type: z.literal('situational-writing'),
  /** The text-type options the student can choose from; only one is answered. */
  options: z
    .array(
      z.object({
        /** The text type this option asks for, e.g. "Proposal", "Email", "Review". */
        textType: z.string().describe('The text type this option asks for, e.g. "Proposal", "Email", "Review". Shown as the option\'s heading.'),
        prompt: z.string(),
        sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
      }),
    )
    .min(2),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().default(220).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). Cambridge sets no
   *  maximum at B1 — leave unset for that level. */
  maxWords: z.number().int().positive().optional().describe('Maximum length of the response, in the same unit as the minimum.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
});

export const reportWritingSchema = base.extend({
  type: z.literal('report-writing'),
  /** The graph, table, chart, or diagram the student describes. */
  image: media.describe('The graph, table, chart, or diagram the student describes in writing.'),
  /** The specific instruction for this exercise's visual (varies per chart). */
  prompt: z.string().describe('The specific instruction for this exercise\'s visual, e.g. what to compare or highlight.'),
  /** Count unit for the minimum below. Defaults to characters for CJK, words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the minimum length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). There is no maximum. */
  minWords: z.number().int().positive().default(150).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const opinionEssaySchema = base.extend({
  type: z.literal('opinion-essay'),
  /** The issue/question the student states, explains, and supports an opinion on. */
  prompt: z.string().describe('The issue or question the student states, explains, and supports an opinion on.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().default(200).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().default(300).describe('Maximum length of the response, in the same unit as the minimum.'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const answerAnEmailSchema = base.extend({
  type: z.literal('answer-an-email'),
  /** Brief framing sentence introducing the email below, e.g. who it's from
   *  and why. Optional — the email itself usually makes this clear. */
  context: z.string().optional()
    .describe('Brief framing sentence introducing the email below, e.g. who it\'s from and why. Usually unnecessary — the email itself makes this clear.'),
  /** The email the student must reply to. */
  email: z.object({
    from: z.string(),
    subject: z.string(),
    body: z.string(),
  }).describe('The email the student must reply to.'),
  /** The 2-3 points the student's reply must cover. */
  points: z.array(z.string()).min(2).max(3)
    .describe('The 2-3 points the student\'s reply must cover, shown as a checklist.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). */
  minWords: z.number().int().positive().default(80).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().default(120).describe('Maximum length of the response, in the same unit as the minimum.'),
  /** Phrases/structures the student is expected to use. */
  mustInclude: z.array(z.string()).default([])
    .describe('Phrases or structures the student is expected to use somewhere in their answer.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const summarizeTextSchema = base.extend({
  type: z.literal('summarize-text'),
  /** The passage the student reads before summarizing it. */
  passage: z.string().describe('The passage the student reads before summarizing it.'),
  /** Count unit for the min/max targets below. Defaults to characters for CJK,
   *  words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the min/max length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`); writing under this
   *  loses the mark regardless of content. */
  minWords: z.number().int().positive().default(25).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  /** Maximum length in the chosen unit (see `countBy`). */
  maxWords: z.number().int().positive().default(50).describe('Maximum length of the response, in the same unit as the minimum.'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const guidedWritingSchema = base.extend({
  type: z.literal('guided-writing'),
  /** The scenario the student writes about (e.g. "Write an email to..."). */
  prompt: z.string().describe('The scenario the student writes about, e.g. "Write an email to...".'),
  /** Content points the response should cover, shown as a bullet list below the prompt. */
  points: z.array(z.string()).min(1)
    .describe('Content points the response should cover, shown as a bullet list below the prompt.'),
  /** Heading shown above the content points (e.g. "In your email:", "In your note:"). */
  pointsHeading: z.string().default('Include:')
    .describe('Heading shown above the content points, e.g. "In your email:", "In your note:".'),
  /** Count unit for the minimum below. Defaults to characters for CJK, words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the minimum length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length in the chosen unit (see `countBy`). There is no maximum. */
  minWords: z.number().int().positive().default(25).describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const passageReconstructionSchema = base.extend({
  type: z.literal('passage-reconstruction'),
  /** The passage the student reads, then must reproduce from memory. */
  passage: z.string().describe('The passage the student reads, then must reproduce from memory word-for-word.'),
  /** Seconds allowed to read the passage before it's hidden. */
  readSeconds: z.number().int().positive().default(30)
    .describe('Seconds the student is given to read the passage before it\'s hidden and they must reproduce it.'),
  /** Count unit for the minimum below. Defaults to characters for CJK, words otherwise. */
  countBy: z.enum(['words', 'characters']).optional()
    .describe('Whether the minimum length below is counted in words or characters. Leave unset to default to characters for CJK languages, words otherwise.'),
  /** Minimum length of the reconstruction, in the chosen unit. There is no maximum. */
  minWords: z.number().int().positive().optional().describe('Minimum length of the response, in the unit set by countBy (words or characters).'),
  rubric: z.array(rubricRow).default([])
    .describe('Optional scoring criteria shown to the teacher/student — this is not auto-graded, since free writing can\'t be checked by exact match.'),
  sampleAnswer: z.string().optional()
    .describe('A model answer, shown to the student only after they submit — not used for grading.'),
});

export const speakingSchema = base.extend({
  type: z.literal('speaking'),
  prompt: z.string().describe('The topic or question the student speaks about.'),
  /** Seconds the student gets to think before recording. */
  preparationSeconds: z.number().int().nonnegative().default(0)
    .describe('Seconds the student gets to think before recording starts. 0 means recording is available immediately.'),
  targetSeconds: z.number().int().positive().optional()
    .describe('Suggested speaking length shown to the student, e.g. as "aim for about 1 minute". Not enforced automatically.'),
  /** Model audio the student can compare against, revealed after recording. */
  modelAudio: media.optional()
    .describe('Model audio the student can compare their own recording against, revealed only after they record.'),
  cues: z.array(z.string()).default([])
    .describe('Optional prompt words/phrases shown to the student while they speak, to guide what to cover.'),
});

export const multipleChoiceSingleAnswerSchema = base.extend({
  type: z.literal('multiple-choice-single-answer'),
  /** The passage the student reads before answering. */
  passage: z.string().describe('The passage the student reads before answering.'),
  /** Exactly 5 questions, each with exactly 4 options. The first four each
   *  have one correct answer; the fifth has more than one (checkboxes). */
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        options: z.array(z.string()).length(4).describe('Exactly 4 candidate options.'),
        /** 0-based index (single answer) or indices (multiple answers) into `options`. */
        correct: z.union([z.number().int().min(0).max(3), z.array(z.number().int().min(0).max(3)).min(2)])
          .describe('For questions 1-4: a single 0-based index into `options` (the first option is 0). For question 5 only: an array of 2+ indices, since it has more than one correct option and renders as checkboxes.'),
        explanation: z.string().optional()
          .describe('Optional explanation shown after submission.'),
      }),
    )
    .length(5)
    .describe('Exactly 5 questions, each with exactly 4 options. Questions 1-4 each have one correct answer; question 5 has more than one (rendered as checkboxes).')
    .refine(
      // Guard on qs.length: the builder's live preview validates on every
      // keystroke, including while the author has filled in fewer than 5
      // questions (clean() drops still-empty draft questions from the
      // array). qs[4] is only safe to read once .length(5) has already
      // passed — otherwise this refine ran first and qs[4] is undefined.
      (qs) =>
        qs.length !== 5 ||
        (qs.slice(0, 4).every((q) => typeof q.correct === 'number') && Array.isArray(qs[4]?.correct)),
      {
        message:
          'The first four questions must have a single correct answer (a number); the fifth must have ' +
          'multiple correct answers (an array of at least two).',
      },
    ),
});

export const diagramLabelSchema = base
  .extend({
    type: z.literal('diagram-label'),
    /** Answer-matching options, shared across all labels. */
    matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
    /** The descriptive passage the student reads to determine each label. */
    passage: z.string().describe('The descriptive passage the student reads to work out each label.'),
    /** Which visual format this completion task uses. Defaults to 'diagram'
     *  for backward compatibility with existing diagram-only content. */
    layout: z.enum(['diagram', 'summary', 'notes', 'table', 'flow-chart']).default('diagram')
      .describe('Which visual format this task uses. "diagram" needs an image with numbered callouts (fill in `image`); every other value needs Markdown text with numbered markers like "(1)" instead (fill in `content`).'),
    /** The diagram image; numbered callouts are baked into the image
     *  itself. Required when `layout` is 'diagram'. */
    image: media.optional()
      .describe('The diagram image, with numbered callouts baked into the image itself. Required when layout is "diagram"; unused otherwise.'),
    /** Markdown content — a summary paragraph, a note outline, a pipe
     *  table, or a flow chart drawn with an arrow-separated list — with
     *  numbered blank markers like "(1)" showing where each label belongs.
     *  Required when `layout` is not 'diagram'. */
    content: z.string().optional()
      .describe('Markdown text (a summary paragraph, a note outline, a pipe table, or an arrow-separated flow chart) with numbered blank markers like "(1)" showing where each label belongs. Required when layout is anything other than "diagram".'),
    /** Maximum words allowed per label answer, shown as an instruction (e.g. 2). */
    maxWordsPerLabel: z.number().int().positive().optional()
      .describe('Maximum words allowed per label answer, shown to the student as an instruction (e.g. "ONE WORD ONLY").'),
    /** One answer per numbered position, in order. */
    labels: z.array(answer).min(1)
      .describe('One answer per numbered position (1), (2), ... in order, matching the callouts/markers in the image or content.'),
  })
  .refine((d) => (d.layout === 'diagram' ? !!d.image : !!d.content), {
    message: "`image` is required when `layout` is 'diagram'; `content` is required for every other layout.",
  });

export const listeningDiagramLabelSchema = base
  .extend({
    type: z.literal('listening-diagram-label'),
    /** Answer-matching options, shared across all labels. */
    matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
    /** The recording the student listens to for the answers. */
    audio: media.describe('The recording the student listens to for the answers.'),
    /** How many times the recording may be played. */
    maxPlays: z.number().int().positive().optional()
      .describe('How many times the recording may be played. Leave unset for unlimited.'),
    transcript: z.string().optional().describe('The recording\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
    /** Hide the transcript until the student has submitted. */
    revealTranscriptAfterSubmit: z.boolean().default(true)
      .describe('Hide the transcript until the student has submitted their answers.'),
    /** Which visual format this completion task uses. Defaults to 'diagram'
     *  for backward compatibility with existing diagram-only content. */
    layout: z.enum(['diagram', 'plan', 'map', 'summary', 'notes', 'table', 'flow-chart']).default('diagram')
      .describe('Which visual format this task uses. "diagram"/"plan"/"map" need an image with numbered callouts (fill in `image`); every other value needs Markdown text with numbered markers like "(1)" instead (fill in `content`).'),
    /** The diagram/plan/map image; numbered callouts are baked into the
     *  image itself. Required when `layout` is 'diagram', 'plan', or 'map'. */
    image: media.optional()
      .describe('The diagram/plan/map image, with numbered callouts baked into the image itself. Required when layout is "diagram", "plan", or "map"; unused otherwise.'),
    /** Markdown content — a summary paragraph, a note outline, a pipe
     *  table, or a flow chart drawn with an arrow-separated list — with
     *  numbered blank markers like "(1)" showing where each label belongs.
     *  Required when `layout` is not 'diagram', 'plan', or 'map'. */
    content: z.string().optional()
      .describe('Markdown text (a summary paragraph, a note outline, a pipe table, or an arrow-separated flow chart) with numbered blank markers like "(1)" showing where each label belongs. Required unless layout is "diagram", "plan", or "map".'),
    /** Maximum words allowed per label answer, shown as an instruction (e.g. 2). */
    maxWordsPerLabel: z.number().int().positive().optional()
      .describe('Maximum words allowed per label answer, shown to the student as an instruction (e.g. "ONE WORD ONLY").'),
    /** One answer per numbered position, in order. */
    labels: z.array(answer).min(1)
      .describe('One answer per numbered position (1), (2), ... in order, matching the callouts/markers in the image or content.'),
  })
  .refine((d) => (['diagram', 'plan', 'map'].includes(d.layout) ? !!d.image : !!d.content), {
    message:
      "`image` is required when `layout` is 'diagram', 'plan', or 'map'; `content` is required for every other layout.",
  });

export const shortAnswerQuestionsSchema = base.extend({
  type: z.literal('short-answer-questions'),
  /** The passage the student reads to find the answers. */
  passage: z.string().describe('The passage the student reads to find the answers.'),
  /** Answer-matching options, shared across all questions. */
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** Factual-detail questions, each auto-graded against its own answer. */
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        answer,
      }),
    )
    .min(1)
    .describe('Factual-detail questions, each auto-graded against its own typed answer.'),
});

export const listeningShortAnswerQuestionsSchema = base.extend({
  type: z.literal('listening-short-answer-questions'),
  /** The recording the student listens to for the answers. */
  audio: media.describe('The recording the student listens to for the answers.'),
  /** How many times the recording may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times the recording may be played. Leave unset for unlimited.'),
  transcript: z.string().optional().describe('The recording\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
  /** Hide the transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide the transcript until the student has submitted their answers.'),
  /** Answer-matching options, shared across all questions. */
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** Factual-detail questions (places, prices, times), each auto-graded
   *  against its own answer. Should follow the same order as the recording. */
  questions: z
    .array(
      z.object({
        prompt: z.string(),
        answer,
      }),
    )
    .min(3)
    .max(5)
    .describe('3-5 factual-detail questions (places, prices, times), each auto-graded against its own typed answer. Keep them in the same order the recording answers them.'),
});

export const identifyIdeaSchema = base.extend({
  type: z.literal('identify-idea'),
  /** The passage the student reads before answering the question. */
  passage: z.string().describe('The passage the student reads before answering the question.'),
  /** The question posed about the passage — usually fixed wording like
   *  "Select the idea that is expressed in the passage." */
  question: z.string()
    .describe('The question posed about the passage — usually fixed wording like "Select the idea that is expressed in the passage."'),
  /** The options; exactly one is correct. */
  options: z.array(z.string()).min(2).describe('The candidate answers; exactly one is correct.'),
  /** 0-based index into `options` of the correct answer. */
  correctIndex: z.number().int().nonnegative()
    .describe('0-based index into `options` of the correct answer (the first item is 0).'),
  explanation: z.string().optional(),
});

export const titleThePassageSchema = base.extend({
  type: z.literal('title-the-passage'),
  /** The passage the student reads before choosing a title. */
  passage: z.string().describe('The passage the student reads before choosing a title.'),
  /** The question posed — usually fixed wording like "Choose the best title
   *  for the text below." */
  question: z.string()
    .describe('The question posed — usually fixed wording like "Choose the best title for the text below."'),
  /** The candidate titles; exactly one fits the whole passage. */
  options: z.array(z.string()).min(2).describe('The candidate titles; exactly one fits the whole passage.'),
  /** 0-based index into `options` of the correct answer. */
  correctIndex: z.number().int().nonnegative()
    .describe('0-based index into `options` of the correct answer (the first item is 0).'),
  explanation: z.string().optional(),
});

export const completeThePassageSchema = base.extend({
  type: z.literal('complete-the-passage'),
  /** Passage text before the missing sentence. */
  passageBefore: z.string().describe('Passage text before the missing sentence.'),
  /** Passage text after the missing sentence. */
  passageAfter: z.string().describe('Passage text after the missing sentence, continuing directly from where it would resume.'),
  /** The question posed — usually fixed wording like "Select the best
   *  sentence to complete the passage." */
  question: z.string()
    .describe('The question posed — usually fixed wording like "Select the best sentence to complete the passage."'),
  /** Candidate sentences; exactly one correctly completes the passage. */
  options: z.array(z.string()).min(2)
    .describe('Candidate sentences to slot between passageBefore and passageAfter; exactly one correctly completes the passage.'),
  /** 0-based index into `options` of the correct answer. */
  correctIndex: z.number().int().nonnegative()
    .describe('0-based index into `options` of the correct answer (the first item is 0).'),
  explanation: z.string().optional(),
});

export const chooseTheWordSchema = base.extend({
  type: z.literal('choose-the-word'),
  /** The passage text with each blank marked using `___` (3+ underscores),
   *  same convention as Fill in the Blank. */
  text: z.string()
    .describe('The passage text with each blank marked using `___` (3 or more underscores), same convention as Fill in the Blank.'),
  /** One entry per blank, in the same order as the blanks in `text`. */
  blanks: z
    .array(
      z.object({
        /** The dropdown's options, in the order shown. */
        options: z.array(z.string()).min(2).describe('The dropdown\'s options, in the order shown.'),
        /** 0-based index into `options` of the correct answer. */
        correctIndex: z.number().int().nonnegative()
          .describe('0-based index into `options` of the correct answer (the first item is 0).'),
      }),
    )
    .min(1)
    .describe('One entry per blank, in the same order as the blanks appear in `text`.'),
});

export const matchingHeadingsSchema = base.extend({
  type: z.literal('matching-headings'),
  /** The candidate headings, in the order shown in each dropdown. Should
   *  include at least one distractor beyond one-per-section. */
  headings: z.array(z.string()).min(3)
    .describe('The candidate headings, in the order shown in each dropdown. Include at least one distractor beyond one-per-section, so matching can\'t be solved by elimination.'),
  /** The passage split into labeled sections (e.g. "Section A"). */
  sections: z
    .array(
      z.object({
        label: z.string().describe('The section\'s label, e.g. "Section A".'),
        text: z.string().describe('This section\'s text.'),
        /** 0-based index into `headings` of the correct answer. */
        correct: z.number().int().nonnegative()
          .describe('0-based index into `headings` of the correct answer (the first item is 0).'),
      }),
    )
    .min(2)
    .describe('The passage split into labeled sections, e.g. "Section A", "Section B".'),
});

export const identifyInformationSchema = base.extend({
  type: z.literal('identify-information'),
  /** The passage the student reads before judging each statement. */
  passage: z.string().describe('The passage the student reads before judging each statement.'),
  /** Statements to judge against the passage, each auto-graded against a
   *  fixed True / False / Not given answer. */
  statements: z
    .array(
      z.object({
        text: z.string().describe('The statement to judge as true, false, or not given.'),
        correct: z.enum(['true', 'false', 'not-given'])
          .describe('Whether the statement is true, false, or not addressed by the passage ("not-given").'),
        explanation: z.string().optional()
          .describe('Optional explanation shown after submission, e.g. quoting the part of the passage that decides it.'),
      }),
    )
    .min(2)
    .describe('Statements to judge against the passage, each auto-graded against a fixed true/false/not-given answer.'),
});

export const matchingSentenceEndingsSchema = base.extend({
  type: z.literal('matching-sentence-endings'),
  /** The passage the sentence starters are based on. */
  passage: z.string().describe('The passage the sentence starters are based on.'),
  /** The candidate endings, in the order shown in each dropdown (labeled
   *  A, B, C... in the UI). Should include at least one distractor beyond
   *  one-per-starter. */
  endings: z.array(z.string()).min(3)
    .describe('The candidate endings, in the order shown in each dropdown (labeled A, B, C... in the UI). Include at least one distractor beyond one-per-starter.'),
  /** The first half of each sentence, numbered in the UI. */
  starters: z
    .array(
      z.object({
        text: z.string().describe('The first half of this sentence, ending where the correct ending would continue it.'),
        /** 0-based index into `endings` of the correct answer. */
        correct: z.number().int().nonnegative()
          .describe('0-based index into `endings` of the correct answer (the first item is 0).'),
      }),
    )
    .min(2)
    .describe('The first half of each sentence, numbered in the UI. Each is matched to one candidate ending above.'),
});

export const readingSentenceCompletionSchema = base.extend({
  type: z.literal('reading-sentence-completion'),
  /** Answer-matching options, shared across all items. */
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** The passage the student reads to find each answer. */
  passage: z.string().describe('The passage the student reads to find each answer.'),
  /** Maximum words allowed per blank, shown as an instruction (e.g. 1). */
  maxWordsPerBlank: z.number().int().positive().optional()
    .describe('Maximum words allowed per blank, shown to the student as an instruction (e.g. "NO MORE THAN 1 WORD").'),
  /** Sentence stems based on the passage, each with exactly one blank
   *  marked with `___` (3+ underscores), completed using words taken
   *  directly from the passage. */
  items: z
    .array(
      z.object({
        text: z.string().describe('This sentence stem, with `___` (3 or more underscores) marking the single blank.'),
        answer,
      }),
    )
    .min(1)
    .describe('Sentence stems based on the passage, each with exactly one blank, completed using words taken directly from the passage.'),
});

export const wordFormationSchema = base.extend({
  type: z.literal('word-formation'),
  /** Answer-matching options, shared across all blanks. */
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** The passage text with each gap marked using `___` (3+ underscores). */
  text: z.string().describe('The passage text with each gap marked using `___` (3 or more underscores).'),
  /** One entry per blank, in the same order as the blanks in `text`. */
  blanks: z
    .array(
      z.object({
        /** The prompt word shown next to the gap (conventionally in
         *  capitals), which the student must transform — e.g. by adding a
         *  prefix/suffix or changing its part of speech — to complete the
         *  gap correctly. */
        prompt: z.string()
          .describe('The prompt word shown next to the gap (conventionally in capitals), which the student transforms — e.g. by adding a prefix/suffix or changing its part of speech — to fill the gap correctly.'),
        answer: answer.describe('The transformed form of `prompt` that correctly fills this gap.'),
      }),
    )
    .min(1)
    .describe('One entry per blank, in the same order as the blanks appear in `text`.'),
});

export const highlightTheAnswerSchema = base.extend({
  type: z.literal('highlight-the-answer'),
  /** The passage, split into clickable spans (e.g. one sentence per span)
   *  that the student clicks to "highlight" as their answer. */
  passage: z.array(z.string()).min(2)
    .describe('The passage, split into clickable spans (e.g. one sentence per array item) that the student clicks to "highlight" as their answer. Each item becomes one clickable unit — split however you want the click targets to be.'),
  /** Exactly two questions, each answered by highlighting one or more
   *  spans in the passage. */
  questions: z
    .array(
      z.object({
        prompt: z.string().describe('The question, answered by highlighting one or more spans.'),
        /** 0-based indices into `passage` that together form the correct
         *  highlighted answer. */
        correct: z.array(z.number().int().nonnegative()).min(1)
          .describe('0-based indices into `passage` (the first span is 0) that together form the correct highlighted answer, e.g. [1, 3] if spans 2 and 4 are correct.'),
        explanation: z.string().optional()
          .describe('Optional explanation shown after submission.'),
      }),
    )
    .length(2)
    .describe('Exactly two questions, each answered by highlighting one or more spans in the passage.'),
});

export const listenAndChoosePictureSchema = base.extend({
  type: z.literal('listen-and-choose-picture'),
  /** How many times each dialogue's audio may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times each dialogue\'s audio may be played. Leave unset for unlimited.'),
  /** Hide each dialogue's transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide each dialogue\'s transcript until the student has submitted their answers.'),
  /** Exactly five short dialogues, each answered by picking the matching picture. */
  items: z
    .array(
      z.object({
        audio: media.describe('This item\'s dialogue audio.'),
        transcript: z.string().optional().describe('This item\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
        /** The picture options; exactly one matches the dialogue. */
        options: z.array(media).min(2).describe('The picture options; exactly one matches the dialogue.'),
        /** 0-based index into `options` of the correct picture. */
        correct: z.number().int().nonnegative()
          .describe('0-based index into `options` of the correct picture (the first item is 0).'),
      }),
    )
    .length(5)
    .describe('Exactly five short dialogues, each answered by picking the matching picture.'),
});

export const listeningFillInBlanksSchema = base.extend({
  type: z.literal('listening-fill-in-blanks'),
  audio: media.describe('The recording the student listens to for the answers.'),
  /** How many times the recording may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times the recording may be played. Leave unset for unlimited.'),
  /** Answer-matching options, shared across all blanks. */
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** The transcript of the recording, with each missing word marked using
   *  `___` (3+ underscores). Must match the audio exactly. */
  text: z.string()
    .describe('The transcript of the recording, with each missing word marked using `___` (3 or more underscores). Must match the audio exactly, blanks included.'),
  /** One answer per blank, in the same order as the blanks in `text`. */
  blanks: z.array(answer).min(1)
    .describe('One answer per blank, in the same order the blanks appear in `text`.'),
});

export const highlightCorrectSummarySchema = base.extend({
  type: z.literal('highlight-correct-summary'),
  /** How many times each recording may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times each recording may be played. Leave unset for unlimited.'),
  /** Hide each transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide each recording\'s transcript until the student has submitted their answers.'),
  /** Exactly three short recordings, each with its own distinct audio and
   *  answered by picking the paragraph that best summarizes it. */
  items: z
    .array(
      z.object({
        audio: media.describe('This item\'s recording.'),
        transcript: z.string().optional().describe('This item\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
        /** Exactly three paragraph-length candidate summaries. */
        options: z.array(z.string()).length(3).describe('Exactly three paragraph-length candidate summaries.'),
        /** 0-based index into `options` of the correct answer. */
        correctIndex: z.number().int().nonnegative()
          .describe('0-based index into `options` of the correct answer (the first item is 0).'),
        explanation: z.string().optional()
          .describe('Optional explanation shown after submission.'),
      }),
    )
    .length(3)
    .describe('Exactly three short recordings, each with its own distinct audio and answered by picking the paragraph that best summarizes it.'),
});

export const selectMissingWordSchema = base.extend({
  type: z.literal('select-missing-word'),
  /** The recording; the final word or group of words is replaced by a
   *  beep, so no transcript with a blank is shown on screen. */
  audio: media
    .describe('The recording; its final word or group of words should be replaced by a beep — no transcript with a blank is shown on screen, so the student answers by ear alone.'),
  /** How many times the recording may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times the recording may be played. Leave unset for unlimited.'),
  /** The candidate words/phrases; exactly one correctly completes the recording. */
  options: z.array(z.string()).min(2)
    .describe('The candidate words/phrases; exactly one correctly completes the recording where the beep is.'),
  /** 0-based index into `options` of the correct answer. */
  correctIndex: z.number().int().nonnegative()
    .describe('0-based index into `options` of the correct answer (the first item is 0).'),
  explanation: z.string().optional()
    .describe('Optional explanation shown after submission.'),
});

export const highlightIncorrectWordsSchema = base.extend({
  type: z.literal('highlight-incorrect-words'),
  audio: media.describe('The recording. Its wording differs from the on-screen transcript (words) at the positions listed in incorrectIndices.'),
  /** How many times the recording may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times the recording may be played. Leave unset for unlimited.'),
  /** The transcript shown on screen, split into individual word tokens
   *  (each carrying its own trailing punctuation). Some do not match what
   *  is actually spoken in the recording. */
  words: z.array(z.string()).min(6)
    .describe('The transcript shown on screen, split one word per array item (each word keeps its own trailing punctuation). Some words here must NOT match what the audio actually says — those positions go in incorrectIndices below. The builder\'s editor for this field lets you paste the transcript as plain text and click words instead of building this array by hand.'),
  /** 0-based indices into `words` that do not match the audio. */
  incorrectIndices: z.array(z.number().int().nonnegative()).min(1)
    .describe('0-based positions into `words` (the first word is 0) that were changed from what the recording actually says, e.g. [2, 7] if the 3rd and 8th words on screen are the altered ones.'),
});

export const listeningMatchingSchema = base.extend({
  type: z.literal('listening-matching'),
  /** How many times each speaker's audio may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times each speaker\'s audio may be played. Leave unset for unlimited.'),
  /** Hide each transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide each speaker\'s transcript until the student has submitted their answers.'),
  /** The shared pool of candidate statements; should include more
   *  statements than speakers so some are never used. */
  statements: z.array(z.string()).min(6)
    .describe('The shared pool of candidate statements every speaker picks from. Include more statements than speakers (items below) so some are never used, defeating elimination.'),
  /** Exactly five short monologues, each matched to one statement from
   *  the shared pool above. */
  items: z
    .array(
      z.object({
        audio: media.describe('This speaker\'s recording.'),
        transcript: z.string().optional().describe('This item\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
        /** 0-based index into `statements` of the correct answer. */
        correct: z.number().int().nonnegative()
          .describe('0-based index into `statements` of the correct answer (the first item is 0).'),
      }),
    )
    .length(5)
    .describe('Exactly five short monologues, each matched to one statement from the shared pool above.'),
});

export const listenAndRespondSchema = base.extend({
  type: z.literal('listen-and-respond'),
  /** Sets up who the student is talking with and for what purpose, before
   *  the conversation begins. */
  scenario: z.string()
    .describe('Sets up who the student is talking with and for what purpose, shown before the conversation begins.'),
  /** How many times each turn's audio may be played. */
  maxPlays: z.number().int().positive().optional()
    .describe('How many times each turn\'s audio may be played. Leave unset for unlimited.'),
  /** Hide each turn's transcript until the student has submitted. */
  revealTranscriptAfterSubmit: z.boolean().default(true)
    .describe('Hide each turn\'s transcript until the student has submitted their answers.'),
  /** Three or four turns of the conversation; each time it's the student's
   *  turn, they hear the other speaker's line and pick the response that
   *  best continues it. */
  turns: z
    .array(
      z.object({
        audio: media.describe('This turn\'s audio — the other speaker\'s line the student responds to.'),
        transcript: z.string().optional().describe('This item\'s transcript, shown only after the student submits (unless revealTranscriptAfterSubmit is off).'),
        /** 3-4 candidate written responses. */
        options: z.array(z.string()).min(3).describe('3-4 candidate written responses to this turn.'),
        /** 0-based index into `options` of the correct answer. */
        correctIndex: z.number().int().nonnegative()
          .describe('0-based index into `options` of the correct answer (the first item is 0).'),
        explanation: z.string().optional()
          .describe('Optional explanation shown after submission.'),
      }),
    )
    .min(3)
    .max(4)
    .describe('Three or four turns of the conversation; each time it\'s the student\'s turn, they hear the other speaker\'s line and pick the response that best continues it.'),
});

export const missingLettersSchema = base.extend({
  type: z.literal('missing-letters'),
  /** Optional heading shown above the passage. */
  passageTitle: z.string().optional().describe('Optional heading shown above the passage.'),
  /** The passage text. The first and last sentences should be plain text.
   *  Partial words in between are marked `{word|given}`, where `word` is the
   *  full correct word and `given` is how many of its leading letters are
   *  already shown to the student (e.g. `{lack|2}` shows "la" pre-filled and
   *  asks the student to type "ck"). */
  text: z.string()
    .describe('The passage text. Keep the first and last sentences plain text. Mark partial words in between as `{word|given}` — `word` is the full correct word, `given` is how many of its leading letters are shown, e.g. `{lack|2}` pre-fills "la" and asks the student to type "ck".'),
});

export const dragToCompleteSchema = base.extend({
  type: z.literal('drag-to-complete'),
  /** The passage text with each gap marked using `___` (3+ underscores),
   *  same convention as Fill in the Blank. */
  text: z.string()
    .describe('The passage text with each gap marked using `___` (3 or more underscores), same convention as Fill in the Blank.'),
  /** The correct word for each gap, in order. */
  answers: z.array(z.string()).min(1)
    .describe('The correct word for each gap, in the same order the gaps appear in `text`.'),
  /** The full word bank shown below the passage (shuffled for display) —
   *  may include extra distractor words not used by any gap. */
  wordBank: z.array(z.string()).min(1)
    .describe('The full word bank the student drags from (shuffled for display). Should include every word in `answers`, and may add extra distractor words not used by any gap.'),
});

export const orderingSchema = base.extend({
  type: z.literal('ordering'),
  /** Items in their CORRECT order; the UI shuffles them for the student. */
  items: z.array(z.string()).min(2)
    .describe('Items in their CORRECT order — write them out correctly, the app shuffles them for the student to reorder.'),
  /** "sentence" reorders words inline; "list" reorders stacked blocks. */
  layout: z.enum(['sentence', 'list']).default('list')
    .describe('"sentence": items are words/phrases reordered inline, forming one sentence. "list": items are stacked as separate blocks (e.g. steps in a process).'),
});

export const vocabularyRecognitionSchema = base.extend({
  type: z.literal('vocabulary-recognition'),
  /** Words shown one at a time; each marked whether it's a real English word
   *  or an invented, English-like non-word. */
  words: z
    .array(
      z.object({
        word: z.string().describe('The word (real or invented) shown to the student.'),
        isReal: z.boolean()
          .describe('True if this is a real word in the target language; false if it\'s an invented, plausible-looking non-word.'),
      }),
    )
    .min(2)
    .describe('Words shown to the student one at a time; for each, they judge whether it\'s a real word or an invented, real-looking non-word. Mix real and invented entries.'),
});

export const buildASentenceSchema = base.extend({
  type: z.literal('build-a-sentence'),
  /** The question the scrambled words must be typed out to answer. */
  question: z.string().describe('The question or prompt the student answers by typing out the full sentence built from the scrambled words.'),
  /** The words, in their CORRECT order; shown to the student scrambled, as a
   *  typing reference — the student types the full sentence, not the words. */
  words: z.array(z.string()).min(2)
    .describe('The words in their CORRECT order — write them out correctly, the app shuffles them for display. The student sees them scrambled as a reference and types out the full sentence (not drag-and-drop).'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
});

export const categorizeSchema = base.extend({
  type: z.literal('categorize'),
  categories: z.array(z.string()).min(2)
    .describe('The category names the student sorts items into, shown as the drop targets/columns.'),
  items: z.array(z.object({
    text: z.string().describe('The item\'s text, shown shuffled among all items.'),
    category: z.string().describe('Must exactly match one of the strings in `categories` above — this is the item\'s correct category.'),
  })).min(2)
    .describe('Items to sort, shown shuffled. Each item\'s `category` must exactly match one of the `categories` above.'),
});

export const pronunciationSchema = base.extend({
  type: z.literal('pronunciation'),
  /** The sentence the student hears and must repeat. Never shown as text. */
  target: z.string().min(1)
    .describe('The sentence the student must repeat, used only to auto-score their recording — it is never shown as text on screen, since this is a listen-and-repeat task.'),
  /** The spoken prompt the student hears once before repeating it. */
  promptAudio: media.describe('The spoken recording of `target`, which the student hears once before repeating it.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(15)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Auto-score with the browser's speech recognition where available.
   *  When off (or unsupported), the task is record-and-self-assess. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available. When off (or unsupported in the student\'s browser), the task becomes record-and-self-assess instead.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** Percentage of target words that must be recognized to pass. */
  passThreshold: z.number().int().min(0).max(100).default(70)
    .describe('Percentage of words in target/the correct answer that speech recognition must catch for auto-scoring to mark it correct.'),
});

export const readAloudSchema = base.extend({
  type: z.literal('read-aloud'),
  /** The sentence displayed on screen for the student to read aloud. */
  target: z.string().min(1)
    .describe('The sentence displayed on screen for the student to read aloud; also used to auto-score their recording.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(30)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(30)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Auto-score with the browser's speech recognition where available.
   *  When off (or unsupported), the task is record-and-self-assess. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available. When off (or unsupported in the student\'s browser), the task becomes record-and-self-assess instead.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** Percentage of target words that must be recognized to pass. */
  passThreshold: z.number().int().min(0).max(100).default(70)
    .describe('Percentage of words in target/the correct answer that speech recognition must catch for auto-scoring to mark it correct.'),
});

export const describeImageSchema = base.extend({
  type: z.literal('describe-image'),
  image: media.describe('The image the student describes aloud.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(30)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(40)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

export const summarySchema = base.extend({
  type: z.literal('summary'),
  /** The audio extract (meeting/tutorial) the student listens to once before summarizing it. */
  promptAudio: media
    .describe('The audio extract (e.g. a meeting or tutorial) the student listens to once before summarizing it aloud.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(10)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(40)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

export const listenAndSpeakSchema = base.extend({
  type: z.literal('listen-and-speak'),
  /** The spoken question the student responds to. */
  promptAudio: media.describe('The spoken question the student responds to.'),
  /** Total times the question can be played (the first play plus any replays). */
  maxPlays: z.number().int().positive().default(2)
    .describe('Total times the question can be played, counting the first play plus any replays.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(20)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(90)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

export const sentenceBuildsSchema = base.extend({
  type: z.literal('sentence-builds'),
  /** The three phrases, in the scrambled order the audio presents them. */
  phrases: z.array(z.string()).length(3)
    .describe('Exactly three phrases, written in the same (scrambled) order the audio reads them out — not the correct sentence order.'),
  /** The correct grammatical sentence formed by rearranging the phrases. */
  target: z.string().min(1)
    .describe('The correct grammatical sentence formed by rearranging `phrases` into order, used to auto-score the student\'s spoken answer.'),
  /** The audio reading out the three scrambled phrases. */
  promptAudio: media.describe('The audio reading out the three phrases in the scrambled order given in `phrases`.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(15)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Auto-score with the browser's speech recognition where available. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available, checked against correctAnswer/target.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
  /** Percentage of target words that must be recognized to pass. */
  passThreshold: z.number().int().min(0).max(100).default(70)
    .describe('Percentage of words in target/the correct answer that speech recognition must catch for auto-scoring to mark it correct.'),
});

export const answerShortQuestionSchema = base.extend({
  type: z.literal('answer-short-question'),
  /** The spoken question the student responds to. */
  promptAudio: media.describe('The spoken question the student responds to.'),
  /** The expected short answer (with any accepted alternatives). */
  correctAnswer: answer.describe('The expected short spoken answer, auto-scored against what speech recognition hears (see autoScore).'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(10)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Auto-score with the browser's speech recognition where available. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available, checked against correctAnswer/target.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
});

export const conversationsSchema = base.extend({
  type: z.literal('conversations'),
  /** The two-speaker conversation followed immediately by the examiner's
   *  comprehension question, as one continuous clip. */
  promptAudio: media
    .describe('The two-speaker conversation followed immediately by the examiner\'s comprehension question, all as one continuous audio clip.'),
  /** The expected short answer (with any accepted alternatives). */
  correctAnswer: answer.describe('The expected short spoken answer, auto-scored against what speech recognition hears (see autoScore).'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(10)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Auto-score with the browser's speech recognition where available. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available, checked against correctAnswer/target.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
});

export const expressOpinionSchema = base.extend({
  type: z.literal('express-opinion'),
  /** The topic the student gives their opinion on. */
  prompt: z.string().describe('The topic the student gives their spoken opinion on.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(60)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(120)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

export const readAndSpeakSchema = base.extend({
  type: z.literal('read-and-speak'),
  /** The situation description the student reads. */
  prompt: z.string().describe('The situation description the student reads before responding aloud.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(40)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(90)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

const respondQuestion = z.object({
  /** The spoken question the student responds to. */
  promptAudio: media.describe('The spoken question the student responds to.'),
  /** The expected short answer (with any accepted alternatives). */
  correctAnswer: answer.describe('The expected short spoken answer, auto-scored against what speech recognition hears (see autoScore).'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(3)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(15)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
  /** Total times this question's audio plays before preparation begins
   *  (the last question in a set is often heard twice; others once). */
  plays: z.number().int().positive().default(1)
    .describe('Total times this question\'s audio plays before preparation begins. The last question in a set is often heard twice; earlier ones usually once.'),
});

export const respondUsingInformationSchema = base.extend({
  type: z.literal('respond-using-information'),
  /** The reference material (schedule, notice, etc.) the student reads
   *  before the questions begin, and can refer back to throughout. */
  info: z.string()
    .describe('The reference material (schedule, notice, etc., written as Markdown) the student reads before the questions begin, and can refer back to throughout.'),
  /** Seconds to read the reference material before the first question begins. */
  readingSeconds: z.number().int().nonnegative().default(60)
    .describe('Seconds given to read the reference material before the first question begins.'),
  /** One or more short questions, answered in sequence. */
  questions: z.array(respondQuestion).min(1)
    .describe('One or more short spoken questions, asked and answered in sequence.'),
  /** Auto-score with the browser's speech recognition where available. */
  autoScore: z.boolean().default(true)
    .describe('Auto-score using the browser\'s speech recognition where available, checked against correctAnswer/target.'),
  matching: matching.default({})
    .describe('Fine-tune how a typed answer is matched (case, accents, punctuation, script-specific folding). Leave unset to use sensible defaults for the exercise language.'),
});

export const argumentEvaluationSchema = base.extend({
  type: z.literal('argument-evaluation'),
  /** The statement the student must argue for and against before concluding. */
  prompt: z.string().describe('The statement the student must argue for and against before giving their own conclusion, spoken aloud.'),
  /** Seconds to silently prepare before recording starts automatically. */
  preparationSeconds: z.number().int().nonnegative().default(60)
    .describe('Seconds the student silently prepares before recording starts automatically.'),
  /** Seconds allowed to answer; recording stops automatically when this runs out. */
  answerSeconds: z.number().int().positive().default(180)
    .describe('Seconds allowed to record an answer; recording stops automatically once this runs out.'),
});

export const schemas = {
  'fill-in-blanks': fillInBlanksSchema,
  'sentence-completion': sentenceCompletionSchema,
  'multiple-choice': multipleChoiceSchema,
  'match-columns': matchColumnsSchema,
  'image-label': imageLabelSchema,
  listening: listeningSchema,
  dictation: dictationSchema,
  writing: writingSchema,
  'picture-sentence': pictureSentenceSchema,
  'picture-story': pictureStorySchema,
  'two-text-essay': twoTextEssaySchema,
  'situational-writing': situationalWritingSchema,
  'describe-picture': describePictureSchema,
  'report-writing': reportWritingSchema,
  'opinion-essay': opinionEssaySchema,
  'answer-an-email': answerAnEmailSchema,
  'summarize-text': summarizeTextSchema,
  'guided-writing': guidedWritingSchema,
  speaking: speakingSchema,
  'passage-reconstruction': passageReconstructionSchema,
  ordering: orderingSchema,
  'drag-to-complete': dragToCompleteSchema,
  'missing-letters': missingLettersSchema,
  'choose-the-word': chooseTheWordSchema,
  'identify-idea': identifyIdeaSchema,
  'short-answer-questions': shortAnswerQuestionsSchema,
  'listening-short-answer-questions': listeningShortAnswerQuestionsSchema,
  'matching-headings': matchingHeadingsSchema,
  'identify-information': identifyInformationSchema,
  'matching-sentence-endings': matchingSentenceEndingsSchema,
  'reading-sentence-completion': readingSentenceCompletionSchema,
  'word-formation': wordFormationSchema,
  'highlight-the-answer': highlightTheAnswerSchema,
  'listen-and-choose-picture': listenAndChoosePictureSchema,
  'listening-fill-in-blanks': listeningFillInBlanksSchema,
  'highlight-correct-summary': highlightCorrectSummarySchema,
  'select-missing-word': selectMissingWordSchema,
  'highlight-incorrect-words': highlightIncorrectWordsSchema,
  'listening-matching': listeningMatchingSchema,
  'listen-and-respond': listenAndRespondSchema,
  'diagram-label': diagramLabelSchema,
  'listening-diagram-label': listeningDiagramLabelSchema,
  'multiple-choice-single-answer': multipleChoiceSingleAnswerSchema,
  'title-the-passage': titleThePassageSchema,
  'complete-the-passage': completeThePassageSchema,
  'vocabulary-recognition': vocabularyRecognitionSchema,
  'build-a-sentence': buildASentenceSchema,
  categorize: categorizeSchema,
  pronunciation: pronunciationSchema,
  'read-aloud': readAloudSchema,
  'describe-image': describeImageSchema,
  summary: summarySchema,
  'listen-and-speak': listenAndSpeakSchema,
  'sentence-builds': sentenceBuildsSchema,
  'answer-short-question': answerShortQuestionSchema,
  conversations: conversationsSchema,
  'express-opinion': expressOpinionSchema,
  'read-and-speak': readAndSpeakSchema,
  'respond-using-information': respondUsingInformationSchema,
  'argument-evaluation': argumentEvaluationSchema,
} as const;

export type ExerciseType = keyof typeof schemas;
export type Exercise = { [K in ExerciseType]: z.infer<(typeof schemas)[K]> }[ExerciseType];
export type ExerciseOf<K extends ExerciseType> = z.infer<(typeof schemas)[K]>;
export type Answer = z.infer<typeof answer>;
export type Media = z.infer<typeof media>;
export type MatchingOptions = z.infer<typeof matching>;
export type RubricRow = z.infer<typeof rubricRow>;

export const exerciseTypes = Object.keys(schemas) as ExerciseType[];
