# Language Exam Item Creator

The Language Exam Item Creator follows a “publish rules first, generate with AI, then review and finalise with a human” model. The system has one signed-in user role rather than separate assessment-administrator and item-author roles. Rule maintenance, item creation, AI generation, human editing, and review are operations within one workflow.

## Product structure

The **Language Exam Item Creator** is available at `/language-items`. `Assessment Settings` sits beside `+ New item` and expands on the same page above the Item Bank. Its forms show business-facing names, while stable IDs are maintained internally.

Assessment Settings maintains and publishes Blueprint, Slot, Can-do, Domain, Context, A1 difficulty, language content, Exercise Template data contracts, scoring contracts, delivery rules, and review rules. New items read only the active published Registry. Every item pins the Registry version used at creation; editing, validation, AI, review, and export reread that pinned version, so later rule publications do not silently change existing items.

```text
Central-rule draft → validation → impact analysis → immutable publication

Slot → Item Format → one Primary Can-do → Domain → Context → A1 difficulty → Edit & Preview / AI candidates → human editing → validation → human review → Staging
```

Central-rule versions have `draft` or `published` status. Version identifiers are generated and maintained internally, without a version selector or label input. Drafts are editable; they must pass cross-Registry validation before publication, and published versions are immutable. Impact analysis distinguishes Slot × Item Format × Primary Can-do configurations and reports named rule and difficulty changes, together with the number of items pinned to the previous version. Unsaved settings are protected against navigation, refresh, sign-out, and background refetches.

New item contains only the six creation criteria. Outside clicks cannot dismiss it, and unfinished choices survive cancellation, navigation, and refresh for the current browser session. Creation opens Edit & Preview; a single summary records the chosen criteria, while context/difficulty changes and language targets/AI are separate operations.

Contexts are centrally extensible, not a fixed list: each has an automatic internal ID, a readable name, one Domain, compatible Can-dos, scope, and exclusions. New contexts start retired until configured and enabled; retired contexts are unavailable for new selections. Each configuration has complete Lower, Typical, and Upper A1 profiles, with validated defaults and ranges.

## Central-rule maintenance scope

| Category | Maintained content | Why it belongs in Assessment Settings |
| --- | --- | --- |
| Blueprint and Slots | Slot, Task Family, Item Format, skill, communicative activity, allowed Domain/Context, Renderer, and delivery policy | Defines what is measured and which item formats are permitted; individual items must not redefine it. |
| Can-do | Capability name, observable evidence, A1 boundary, and primary/supporting Can-do relationships | Keeps item evidence aligned with the measurement target. |
| Domain and Context | Personal, Public, Educational, and Occupational domains and their concrete contexts | Grounds domains in authentic, authorable micro-contexts and supports cascading selection. |
| Difficulty | Defaults and allowed ranges for Lower, Typical, and Upper A1 | Derives difficulty from input length, information points, support, distractors, and related factors instead of a subjective label. |
| Language Content | Vocabulary, Chinese characters, grammar, pragmatics, supported content, and their Can-do/Context applicability | Constrains A1 content and gives AI approved targets to reference. |
| Scoring | Scoring contracts, scoring points, rubrics, and invalid-response policies for each Slot × Item Format | Answers vary by item, but AI and individual authors must not rewrite scoring principles. |
| Schemas and Policies | Seven candidate-item data contracts, TaskPackage, review gates, and technical policies | Keeps editors, AI output, preview, review, and export on the same contracts. |

Publication validation checks unique IDs, cross-Registry references, at least one concrete allowed Context for every Slot × Domain, a matching scoring contract for every Slot × Item Format, and complete Exercise Template schemas for all seven formats. The current baseline includes the `D16 Complete basic registration and classroom exchanges` context for `S-A1-2 × Educational`, and automated tests verify that every Domain declared by a Slot resolves to a concrete Context.

## Item settings and rationale

0. **Item title**: Used for internal search, review, and version history; never shown to candidates.
1. **Slot, Item Format, and exactly one Primary Can-do**: Selects the measurement target from published configurations. Skill/activity are derived, and Task Family/scoring/delivery rules are locked to the selected configuration.
2. **Domain**: Selects the language-use domain from values allowed by the Slot.
3. **Context**: Selects a concrete micro-context from values allowed by both the Slot and Domain.
4. **A1 difficulty**: Selects Lower, Typical, or Upper A1 while remaining within the A1 range.
5. **Difficulty drivers**: Records input length, information-point count, support level, distractor similarity, independence, and inference requirements so difficulty can be explained and reviewed.
6. **Target vocabulary, Chinese characters, grammar, and pragmatics**: Defines the core content measured by the item. Supported content is recorded separately and must not be presented as a target.
7. **Information Points**: Lists the explicit information candidates must retrieve or express and can link each point to scoring evidence, aligning task requirements, answers, and scoring.
8. **Scoring Contract**: Displays the centrally locked scoring method. Authors edit only the item-specific answer for objective items; constructed-response rubrics stay locked, and AI cannot rewrite scoring policies.
9. **Author notes**: Records author intent, media follow-ups, and human-review reminders that candidates never see.

## Exercise Template integration

Seven templates are registered by Item Format and bind the human editor, AI output schema, and candidate-safe preview Renderer:

| Item Format | Exercise Template in the Workbench | Main author inputs |
| --- | --- | --- |
| `IF-SINGLE-SELECT` | single-select / multiple-choice / listening | Stimulus, question, options, correct answer |
| `IF-MATCHING` | match-columns | Instructions, left and right columns, correct matches |
| `IF-RESTRICTED-INPUT` | short-answer / listening-short-answer | Stimulus, question, response fields, accepted answers |
| `IF-FORM-ENTRY` | form-entry | Situation, instructions, form fields, accepted values |
| `IF-TYPED-MESSAGE` | guided-writing | Situation, recipient, purpose, required content, length |
| `IF-SPOKEN-SINGLE` | speaking | Situation, prompt, preparation/response time, required content |
| `IF-SPOKEN-MULTITURN` | spoken-multiturn | Situation, roles, turns, communicative functions |

“Integration” means consistent data contracts and item structure, not a pixel-for-pixel copy of an external Exercise Template sheet. Authors use a structured form produced by the TaskPackage adapter. Slot, Can-do, Domain, difficulty, scoring contract, review, and version metadata remain in controlled areas outside the template. Candidate preview contains only candidate-visible fields and excludes answers, scoring, author notes, and review records. Template semantics and required fields therefore remain consistent even though the Workbench UI does not—and should not—look identical to an original source sheet.

## AI-first, human-governed workflow

After rule fields are complete, AI generation is the primary path and manual authoring from scratch is the fallback. A run is persisted as `queued` before 1–5 independent candidate requests are issued in parallel. Every candidate undergoes deterministic server validation, and a failing candidate receives at most one focused repair. Run state, attempt counts, repair counts, and partial failures persist as `queued/running/partial/completed/failed`, so a server restart does not leave a task permanently running.

AI may generate only candidate-visible content and item-specific answer suggestions. It cannot modify the locked Slot, Can-do, Domain, Context, difficulty rules, scoring contract, or Registry version. A human selects a candidate, edits when needed, reruns validation, and completes review. AI pre-review cites only server-provided rule IDs and never approves, publishes, or exports an item automatically.

## Code and data locations

- `contracts/`: Compile-time data contracts such as TaskPackage.
- `registries/`: Machine-readable baselines for Blueprint, Can-do, Context, content, format, scoring, review, and delivery rules.
- `server/language_items/registry_store.rs`: Registry versioning, publication validation, and startup loading.
- `server/routes/language_assessment_settings.rs`: Central-rule administration API.
- `server/language_items/ai.rs`: Independent AI candidates, one repair attempt, and rule-constrained pre-review.
- `client/features/language-items/registry-settings-panel.tsx`: Central-rule versions, validation, impact, and publication UI.
- `client/features/language-items/registry-rule-editor.tsx`: Structured editor for Blueprint, Can-do, Context, difficulty, content, and scoring.
- `client/features/language-items/item-template-registry.tsx`: Fixed mapping between the seven item-format editors and Renderers.

Central rules are maintained through text fields, selects, multi-selects, numeric fields, and editable lists. JSON remains the server persistence and API transport format, but it is not the primary editor for business users. The seven Exercise Template JSON Schemas and TaskPackage Schema are technical contracts; Settings displays their coverage and stable IDs, but business forms cannot edit them directly.
