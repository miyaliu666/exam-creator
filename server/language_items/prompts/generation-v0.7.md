# Chinese A1 Item Generation Prompt v0.7

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
- Use the supplied target-content meanings, structures, restrictions, and required information points directly.
- Each selected target's `assessmentRules`, when supplied, applies to this exact Blueprint slot, Item format, Primary Can-do, and Context combination. Use its `assessmentMode`, `communicativePurpose`, and `requiredEvidence` to design the material, prompt, response requirements, and answer relationship. `understanding` requires the response to depend on understanding the target; `controlledProduction` requires the specified target use in a constrained response; `freeProduction` requires communicative evidence in an independently produced response, rather than merely an optional opportunity to use the target.
- Treat `acceptableResponses`, `failurePatterns`, `prerequisites`, `validExamples`, and `invalidExamples` as this combination's assessment specification. Use acceptable responses and examples consistently with the locked scoring contract; avoid the failure patterns; keep prerequisites as supporting knowledge rather than silently replacing the selected assessment targets. Examples guide construction and do not authorize changing the item format or difficulty.
- A target label or the target's mere appearance in the material is not evidence that the item assesses it. Check whether the requested response actually depends on the required understanding or production and whether a learner can bypass it. Do not expose this assessment analysis or the internal rule fields to the candidate.
- `applicability: allowed` does not relax any pinned Can-do, Context, mastery scope, difficulty, scoring, or other central rule. An excluded combination must not be treated as allowed. If no matching assessment rule is supplied, preserve the existing target scopes and metadata without inventing an additional central rule.
- If all required targets cannot be assessed naturally within the locked constraints, do not force target labels into the text, silently delete targets, weaken the constraints, or claim successful assessment. Still return exactly one schema-conforming draft with internally consistent content and answers for application checks and independent review to inspect. Use only the existing output fields; do not invent a failure status, diagnostic field, or approval claim.
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

The server independently validates every candidate, including complete English translation coverage, before it can be adopted. Passing deterministic checks alone does not establish that every target was assessed or that the intended difficulty was achieved.
