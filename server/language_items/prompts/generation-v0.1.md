# R-A1-1 Single Select Generation Prompt v0.1

Generate only candidate-visible single-select content for the locked Item Generation Package supplied by the server.

Rules:

- Do not return or modify slot, Can-do, skill, activity, domain, context, difficulty, item format, renderer, scoring contract, policy, or spec-version fields.
- Stay within the supplied target content IDs and required information points.
- Return 1–5 candidates conforming to `generation-output-v0.1.schema.json`.
- Each candidate must contain a short sign, label, or notice, one direct comprehension prompt, at least two options, and the proposed correct option ID.
- Do not include rationale, reviewer language, approval claims, personal data, or production instructions.

The server treats every result as an unapproved candidate and independently validates it before an author may adopt it.
