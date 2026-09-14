# Language Exam Item Creator

The Language Exam Item Creator follows a “publish rules first, generate with AI, then review and finalise with a human” model. The system has one signed-in user role rather than separate assessment-administrator and item-author roles. Rule maintenance, item creation, AI generation, human editing, and review are operations within one workflow.

## Product structure

Workbench terminology is shared across New items, Item Bank, editing, Assessment Settings, checks, and generated review summaries:

| UI term | Meaning |
| --- | --- |
| Item / Item Bank | An independent assessment item with its own draft, versions, and review state; Item Bank is the page for browsing and managing items. One item may contain several response fields or conversation turns. |
| Question | The prompt text inside a Workbench item. Legacy Exams retains its original Question and Question Set terminology. |
| Item format | The response structure, such as Single select or Matching. |
| Primary Can-do | The one primary ability target selected for an item. |
| Item rules | One saved configuration with a stable internal `itemRuleId`, a Primary Can-do, an Item format and reusable constraints. |
| Item setup | The five selections for an item: Primary Can-do, Item format, Domain, Context, and Difficulty. |
| Task family | The registered communicative behavior associated with the item rule and format. |
| Scoring contract | The registered scoring rules associated with the item rule and format. |
| Domain / Context / Difficulty | The language-use domain, concrete situation, and selected A1 difficulty band. |
| AI draft | One AI-generated alternative for an item. Generating several alternatives does not create several items. |
| Candidate | The exam taker; Candidate preview and Candidate instructions refer to the exam taker's content. |
| Generation job | Background work that creates and generates items, with its own progress and history. |
| AI preliminary review / Check / Review | Independent AI findings, deterministic checks, and human review have separate responsibilities. Serious AI findings block PR creation; a human makes the approval decision. |

Each Item rule has one stable internal `itemRuleId`, one Primary Can-do and one Item format. Task design, scoring, difficulty and Context applicability belong to that rule. Source Exercise Template names exactly match their source catalog; authors do not maintain a separate rule-position field. Shared frontend labels live in `client/features/language-items/labels.ts`.

The **Language Exam Item Creator** opens at **Item Bank**, `/language-items`. **New items**, **Generation jobs**, **Language coverage**, and **Assessment Settings** have independent pages. Assessment Settings shows business-facing names, while stable IDs are maintained internally.

Exams, Attempts, Exam Metrics and User Management retain their original interfaces and behavior. Workbench version use, pilot summaries and assembly manifests prepare data within the Workbench. Existing Staging exports remain available, but Staging-only Workbench exam records are not connected to the legacy generation endpoint, which reads its source exam from Production.

Assessment Settings maintains and publishes Can-do, Domain, Context, A1 difficulty, language content, Exercise Template data contracts, scoring contracts, delivery rules, and review rules. The rule definitions are shared across Chinese, English and Spanish; New items and Language coverage choose one assessed language to select its content and inventory. New items read only the active published Registry. Every item pins the Registry version used at creation; editing, validation, AI, review, and export reread that pinned version, so later rule publications do not silently change existing items.

```text
Central-rule draft → Save draft → Publish (automatic validation and confirmation)

Item Bank → New items → Item setup, quantity, and language targets
Generate N items → Generation jobs → Open item → Prepare → Use this draft
Write manually (one item) → Edit & preview
Edit & preview → Continue → Submit → automatic checks + AI preliminary review → human PR review → Staging
```

Central-rule versions have `draft` or `published` status. Version identifiers are generated and maintained internally, without a version selector or label input. Drafts are editable; they must pass cross-Registry validation before publication, and published versions are immutable. Impact analysis distinguishes Primary Can-do × Item Format configurations and reports named rule and difficulty changes, together with the number of items pinned to the previous version. Unsaved settings are protected against navigation, refresh, sign-out, and background refetches.

The toolbar shows saved/unsaved/in-use status, Save changes for draft persistence, and Use for new items for checked publication with confirmation. Publication requires ownership, the saved revision and the current published baseline. Historical pinned snapshots retain their original validation semantics.

See [Assessment Settings field and workflow guide](ASSESSMENT-SETTINGS.md) for every control, required relationship, and a worked example. The [review repository setup guide](review-repository/README.md) covers external review configuration.

After approval, [version use and pilot results](VERSION-USAGE.md) records immutable-version availability and manual pilot conclusions, links findings to revision drafts and provides a candidate-free assembly manifest. This preparation does not deploy or withdraw legacy exams.

New items combines the five Item setup criteria with Number of items and language targets. An empty plan opens Item setup; unfinished choices, quantities, and targets survive navigation and refresh for the current browser session. Each setup group defaults to one item. What this item should assess labels a single item's targets; Targets required in every item and Different targets for different items support multiple items. Preview each item's targets shows the allocation. AI drafts per item is a required field beside Number of items, defaults to one, and accepts a positive whole number. There is no name input or Options disclosure; new plans use automatically derived names, while existing saved plan names are preserved.

Generate 1 item / Generate N items opens Generation jobs. Opening a generated item shows its AI drafts in Prepare; Use this draft adopts one and opens Edit & preview. A one-item plan also offers Write manually, which saves the selected targets and opens Edit & preview directly, including for an empty manual draft. Requirements must be complete before later AI generation or submission. Existing authored drafts reopen Edit & preview. One Item setup summary records the chosen criteria and provides Edit item setup. Changes autosave, current checks gate submission, and optional rules/history stay in disclosures. See the [item creation and field guide](ITEM-CREATION.md) for all fields and the complete flow.

Edit item setup stages changes to Domain, Context, and Difficulty and previews their effect before Apply changes updates the draft. Cancel discards the staged selections. Primary Can-do, Item format, and the pinned Registry version remain fixed. Selecting a difficulty band applies its complete scheme from that pinned version of Assessment Settings; authors can read the requirements but cannot edit individual difficulty drivers or a difficulty rationale.

Applying setup changes preserves language targets, supporting content, every information point, candidate content, and answers. Incompatible selections and information-point counts appear as issues the author can repair. If the new scheme requires fewer information points, the author explicitly removes the excess entries; the system does not truncate authored content. Existing material and answers may need editing to fit the new requirements. Applying changed setup invalidates formal checks, so the saved draft must pass fresh checks before submission.

Contexts are centrally extensible, not a fixed list: each has an automatic internal ID, a readable name, one Domain, compatible Can-dos, scope, and exclusions. New contexts start retired until configured and enabled; retired contexts are unavailable for new selections. Each configuration has complete Lower, Typical, and Upper A1 profiles, with validated defaults and ranges.

## Central-rule maintenance scope

| Category | Maintained content | Why it belongs in Assessment Settings |
| --- | --- | --- |
| Item rules | Item rule, Task Family, Item Format, skill, communicative activity, allowed Domain/Context, Renderer, and delivery policy | Defines what is measured and which item formats are permitted; individual items must not redefine it. |
| Can-do | Capability name, observable evidence, A1 boundary, and primary/supporting Can-do relationships | Keeps item evidence aligned with the measurement target. |
| Domain and Context | Personal, Public, Educational, and Occupational domains and their concrete contexts | Grounds domains in authentic, authorable micro-contexts and supports cascading selection. |
| Difficulty | Defaults and allowed ranges for Lower, Typical, and Upper A1 | Derives difficulty from input length, information points, support, distractors, and related factors instead of a subjective label. |
| Language Content | Vocabulary, Chinese characters, grammar, pragmatics, supported content, and their Can-do/Context applicability | Constrains A1 content and gives AI approved targets to reference. |
| Scoring | Scoring contracts, scoring points, rubrics, and invalid-response policies for each Item rule × Item Format | Answers vary by item, but AI and individual authors must not rewrite scoring principles. |
| Schemas and Policies | Seven candidate-item data contracts, TaskPackage, review gates, and technical policies | Keeps editors, AI output, preview, review, and export on the same contracts. |

Publication validation checks unique Item rule IDs, compatible Can-do/format bindings, scoring-contract membership, Context and Domain scopes, complete A1 difficulty profiles and pinned template schemas. Shared scoring contracts and task families reference `itemRuleIds` arrays. All 60 source Exercise Templates and the seven existing Workbench adapters retain their separate authoring and delivery contracts.

## Item setup and authoring requirements

0. **Item title**: Used for internal search, review, and version history; never shown to candidates.
1. **Exactly one Primary Can-do and Item format**: Selects the measurement target from published Item rules. Skill/activity are derived, and Task family/scoring/delivery rules are locked to the selected configuration.
2. **Domain**: Selects the language-use domain from values allowed by the Item rule.
3. **Context**: Selects a concrete micro-context from values allowed by both the Item rule and Domain.
4. **A1 difficulty**: Selects Lower, Typical, or Upper A1 within the item's pinned rules. After creation, corrections go through Edit item setup and explicit Apply changes.
5. **Difficulty requirements**: Displays the selected band's complete central scheme, including input length, information-point count, support, distractor similarity, independence, and inference requirements. These are read-only authoring requirements; individual tuning and rationale inputs are absent.
6. **What this item should assess**: Selects the target vocabulary, Chinese characters, grammar, and pragmatics measured by the item. Supporting material types records background types separately.
7. **Key information**: Lists the explicit information candidates must retrieve or express and can link each point to scoring evidence. Information points in Assessment Settings specifies the required count; Key information supplies the actual content.
8. **Scoring contract**: Displays the centrally locked scoring method. Authors edit only the item-specific answer for objective items; constructed-response rubrics stay locked, and AI cannot rewrite scoring policies.
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

“Integration” means consistent data contracts and item structure, not a pixel-for-pixel copy of an external Exercise Template sheet. Authors use a structured form produced by the TaskPackage adapter. Item rule, Can-do, Domain, difficulty, scoring contract, review, and version metadata remain in controlled areas outside the template. Candidate preview contains only candidate-visible fields and excludes answers, scoring, author notes, and review records. Template semantics and required fields therefore remain consistent even though the Workbench UI does not—and should not—look identical to an original source sheet.

## AI-first, human-governed workflow

AI drafts per item defaults to one and accepts a positive whole number, with no 3- or 5-draft business cap. A run is persisted as `queued` before independent AI draft requests begin, with bounded concurrency. Every AI draft undergoes deterministic server validation, and a failing draft receives at most one focused repair. Run state, attempt counts, repair counts, and partial failures persist as `queued/running/partial/completed/failed`. Interrupted work retains available drafts; uncertain provider calls are not automatically replayed. Write manually creates one editable item without an AI call.

AI may generate only candidate-visible content and item-specific answer suggestions. It cannot modify the locked Item rule, Can-do, Domain, Context, difficulty rules, scoring contract, or Registry version. An author selects an AI draft, edits it and submits. Submission saves the current item, runs deterministic checks and an independent AI preliminary review, then creates a PR for another human reviewer. Serious AI findings, failed calls, simulated reports and stale content references block PR creation. The report is attached to the PR body; AI cites server-provided rule IDs and never approves human gates, publishes or exports an item automatically. Generation and preliminary review currently share the configured provider/model but use separate calls and prompts. This separation does not guarantee an unbiased judgment.

AI preliminary review first makes an independent answer attempt from the fields actually shown by the candidate preview. Saved answers, scoring, author notes/translations, language targets, intended information points and hidden response hints are withheld. A second call receives that unchanged observation alongside the saved item and pinned rules. The report retains the first response, alternatives, exact candidate-text evidence and limitations even if the second call fails. Disagreement alone is advisory; evidence of a material defect keeps the existing submission gates. Open responses can have multiple valid answers, and referenced media that has not been supplied as readable input is explicitly marked unavailable. The current protocol is required for new submissions, with old reports remaining readable. This normally adds one provider call per text-item pre-review; human review remains the final decision.

AI draft ordering is advisory: valid drafts appear first, followed by distinct candidate-visible content and fewer validation warnings. It is not a pedagogical quality score. Run details preserve observed timing, retries, provider request identifiers, and reported token usage; missing usage is not estimated. The offline seven-format regression baseline is synthetic, not a human-reviewed evaluation dataset or evidence of real-model quality.

## GitHub review operations

New submissions include the exact pinned Registry and TaskPackage/candidate schemas, a batch manifest, and an original-submission tag. The [review repository template](review-repository/README.md) validates reviewer changes against trusted submission assets without executing pull-request code. It must be installed in the review repository and combined with required checks and protected submission tags before relying on it as a merge gate.

Merged content creates a separate immutable approved version. The submitted version is retained, newer local drafts cannot be overwritten, and repeated or partly completed imports can be retried. Signed webhook deliveries are durable; transient failures are retried by a background worker, while validation/conflict failures require explicit recovery. This requires a configured webhook secret and an authenticated production deployment with a reachable HTTPS webhook endpoint. Local mock-auth development must not be exposed publicly.

## Code and data locations

- `contracts/`: Compile-time data contracts such as TaskPackage.
- `registries/`: Machine-readable baselines for Item rules, Can-do, Context, content, format, scoring, review, and delivery rules. The current bundle contains 21 rules with direct identities; archived inputs are isolated in `registries/legacy`.
- `server/language_items/registry_store.rs`: Registry versioning, publication validation, and startup loading.
- `server/routes/language_assessment_settings.rs`: Central-rule administration API.
- `server/language_items/ai.rs`: Independent AI drafts, one repair attempt, and rule-constrained AI feedback.
- `client/features/language-items/registry-settings-panel.tsx`: Minimal settings toolbar and structured rule sections.
- `client/features/language-items/use-registry-settings.ts`: Draft ownership, revision protection, validation, and publication confirmation.
- `client/features/language-items/registry-rule-editor.tsx`: Structured editor for Item rules, Can-do, Context, difficulty, content, and scoring.
- `client/features/language-items/item-template-registry.tsx`: Fixed mapping between the seven item-format editors and Renderers.

Central rules are maintained through text fields, selects, multi-selects, numeric fields, and editable lists. JSON remains the server persistence and API transport format, but it is not the primary editor for business users. The seven Exercise Template JSON Schemas and TaskPackage Schema are technical contracts; Settings displays their coverage and stable IDs, but business forms cannot edit them directly.
