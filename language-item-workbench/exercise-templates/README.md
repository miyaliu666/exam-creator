# Exercise template source integration

The catalog contains all 60 identities from the exercise-template source registry. Display names preserve `TYPE_LABELS` exactly, including capitalization and duplicate labels. `sourceSkill` and `sourceSupportedLevels` are source metadata; they do not grant an Assessment Settings binding or establish empirical difficulty.

Regenerate from a local checkout using:

```powershell
node language-item-workbench/exercise-templates/generate-catalog.cjs <source-project-directory>
```

Runtime code uses only vendored workspace files. `source-manifest.json` records original file hashes and identifies the adapted files. The source Zod schema remains unchanged. Its complete nested fields, defaults, constraints and refinements are executable in the author editor/preview. The generated Draft-07 schemas also encode the three source cross-field refinements for server validation.

`projection-policies.json` is the reviewed candidate/author field boundary. The generated catalog expands it into explicit private paths for every template. Candidate projection admits known schema fields only, then removes private paths and transforms answer-bearing ordering, pair relationships and partial-word encodings. Full author data remains in `authoringPackage.exerciseTemplate`; candidate data never recombines that data with protected answers.

The schema-driven editor preserves unknown fields. Authors can inspect retained field names and remove individual fields explicitly. Object/array changes preserve unrelated values; source validation does not silently rewrite the saved author document.

The authorized author preview loads all source template components inside a ShadowRoot. Markdown is sanitized with DOMPurify through a private Marked instance; the character helper resolves focus within the shadow tree. Styles are isolated and missing source font URLs are excluded. The preview starts explicitly and uses an authored snapshot, so editing does not restart recording interactions. Source practice feedback is available only there. The public candidate preview renders projected materials and response controls without answers; it does not establish formal examination delivery or scoring support.

Focused checks are in `tests/exercise-template-catalog.test.ts`, `tests/exercise-template-preview.test.tsx`, and the all-template cases in `tests/authoring-workflow.test.tsx`.
