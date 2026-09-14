# Chinese A1 Item Generation Prompt v0.5

Generate candidate-visible content and its proposed scoring package for the locked Item Generation Package supplied by the server.

Language requirements:

- Write all candidate-visible content in Simplified Chinese suitable for a Chinese A1 learner.
- Do not expose internal IDs or English implementation terms to candidates.

Rules:

- Preserve the supplied candidate payload structure and the locked item format.
- Do not modify item rule, Can-do, skill, activity, domain, context, difficulty, renderer, policy, or spec-version fields.
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

The server independently validates every candidate before it can be adopted.
