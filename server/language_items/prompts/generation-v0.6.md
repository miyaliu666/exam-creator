# Chinese A1 Item Generation Prompt v0.6

Generate Chinese candidate-visible content, its proposed scoring package, and separate English translations for the author and reviewer, using the locked Item Generation Package supplied by the server.

Language requirements:

- Write all candidate-visible content in Simplified Chinese suitable for a Chinese A1 learner. Candidates must never see English translations or internal implementation terms.
- Return `englishTranslations` beside `candidatePayload` and `proposedScoringPackage`. Never put translations, English glosses, or bilingual annotations inside candidatePayload, its strings, nested objects, or sourceProfile.
- Each translation has `path` (an absolute RFC6901 JSON pointer relative to candidatePayload), `sourceText` (the exact unchanged Chinese source string), and `englishText` (a faithful, nonempty English translation containing no Chinese text). Escape `~` as `~0` and `/` as `~1` in path segments. Use array positions, not object IDs.
- Translate every nonempty human-text field in the final generated payload: stimulus.text, prompt, options[].text, leftItems[].text, rightItems[].text, responseFields[].label/placeholder, fields[].label/placeholder, situation, instructions, sourceMessage, recipient, purpose, visiblePromptText, requiredContentPoints[].description, roles.systemRole/candidateRole, and nested human-text values in sourceProfile.
- Also translate promptAudioRef and paths[].turns[].promptAudioRef when they contain examiner wording rather than an audio reference, and paths[].turns[].requiredFunctionIds[] when they contain natural-language expected actions rather than registry IDs.
- Do not translate IDs, enums, numeric-only profile data, URLs, media references, technical reference fields, or scoring answers. One translation per field; identical source strings in different fields each require their own path. Optional absent/empty fields need no translation.
- `currentTranslationSourceFields` describes the supplied payload only. Recompute translation coverage against the final generated payload, including every new option or field. On repair, update both source text snapshots and English translations to match the repaired payload.

Rules:

- Preserve the supplied candidate payload structure and the locked item format.
- Do not modify slot, Can-do, skill, activity, domain, context, difficulty, renderer, policy, or spec-version fields.
- Use the supplied target-content labels and required information points directly.
- Keep Upper A1 inside A1; do not add cultural knowledge, complex inference, or artificial ambiguity.
- Return exactly one candidate matching the supplied output schema. Each request is an independent candidate call.
- Follow `variationFocus` to diversify surface details without changing the construct.
- When `repairValidationIssues` is non-null and non-empty, make one focused repair that resolves those issues without changing locked constraints.
- `proposedScoringPackage.scoringContractTemplateId` must equal the supplied scoring package template ID.
- For selected-response tasks, every answer must reference an existing option or match ID.
- For restricted input, supply at least one acceptable response per response field.
- For productive writing and speaking, preserve the supplied rubric ID.
- Keep randomized-order flags false so review covers the delivered order.
- Do not include rationale, approval claims, personal data, or reviewer language.

The server independently validates every candidate, including complete English translation coverage, before it can be adopted.
