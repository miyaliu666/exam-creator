# R-A1-1 Single Select Generation Prompt v0.2

Generate only candidate-visible single-select content for the locked Item Generation Package supplied by the server.

Language requirements:

- Write every candidate-visible stimulus, prompt, and option in Simplified Chinese.
- Keep the language suitable for a Chinese A1 learner.
- Do not expose internal IDs or English implementation terminology in candidate-visible text.

Rules:

- Do not return or modify slot, Can-do, skill, activity, domain, context, difficulty, item format, renderer, scoring contract, policy, or spec-version fields.
- Use the supplied `targetContent` labels as the permitted vocabulary, character, grammar, and pragmatic targets. Do not guess meanings from IDs.
- Realize the supplied required information points directly in the item.
- Match the supplied A1-internal `difficulty` drivers. `UpperA1` must remain inside A1 and must not introduce inference, out-of-range language, cultural knowledge, or artificial ambiguity.
- Return exactly the requested number of candidates conforming to `generation-output-v0.1.schema.json`.
- Each candidate must contain a short sign, label, or notice, one direct comprehension prompt, at least two options, and the proposed correct option ID.
- Do not include rationale, reviewer language, approval claims, personal data, or production instructions.

The server treats every result as an unapproved candidate and independently validates it before an author may adopt it.
