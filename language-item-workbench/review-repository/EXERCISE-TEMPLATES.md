# Exercise Template review packages

All sixty Exercise Template types use `EXERCISE:<source-type>` as their format. Display names come from the pinned source catalog. The original seven format contracts remain supported.

A generic submission pins these files alongside its Registry snapshot:

```text
task-package-exercise-<source-type>.schema.json
exercise-<source-type>.schema.json
```

`authoringPackage.exerciseTemplate` contains the complete source document, including answers, explanations, transcripts and other private fields. `candidatePayload` contains only the public projection. Reviewers can correct the full source; edits to public material must update the candidate projection consistently. Private answers never belong in candidate data.

The validator derives both canonical schemas from the protected submission's snapshot and compares them to the submitted assets. It validates the full source schema, exact public projection, answer-index bounds, configured response scoring units, Domain and optional Context restrictions, and language-content scope. It continues to enforce immutable identities, source records, rule assets and batch boundaries. Per-response units follow the pinned template's response structure; exact-match and rubric configurations use their configured whole-task unit.

Deploy the entire updated template, including `scripts/exercise-template-checks.mjs`, through the review repository's trusted maintenance process before reviewing generic submissions. Ordinary item PRs cannot update validator scripts. This workspace change does not publish the template to a remote review repository.

Run the standalone regression suite with `npm test`. Test fixtures are self-contained; they do not read the parent application's source catalog at runtime.
