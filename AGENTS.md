# Exam Creator Project

AI agent and contributor guide for the Exam Creator full-stack application.

## Overview

Exam Creator is a Rust (Axum) + React (Vite + TypeScript) application for creating, generating, moderating, and attempting exams with multiple choice and dialogue question sets. MongoDB backend with Prisma schema typing and WebSocket support for real-time collaboration.

**Key Features:**

- Exam configuration with question sets, tag quotas, timing, and passing criteria
- Exam generation from question pools with user attempt tracking
- GitHub OAuth (or mock auth in debug) with session management
- Real-time collaboration via WebSockets (exam state sync, user presence)
- Moderation workflow with approval/denial/feedback
- Language Exam Item Creator with integrated versioned Assessment Settings, seven registered item formats, AI draft generation, deterministic validation, human review, and idempotent Staging export

## Repository Structure

```
client/          React + TypeScript SPA (Vite, Chakra UI)
server/          Rust Axum backend
  ├── main.rs    Entry point
  ├── app.rs     Router, CORS, sessions, OAuth setup
  ├── config.rs  Environment variables
  ├── routes/    HTTP handlers (exams, attempts, moderations, users, auth, websocket)
  ├── extractor/ WebSocket handlers & auth extractor
  ├── database/  DB helpers, Prisma bridging
  ├── state.rs   Shared in-memory state (ClientSync)
  ├── errors.rs  Unified error handling
  └── language_items/ Versioned Registry store, domain, validation, and AI provider boundary
prisma/          Schema & JS client generation
public/          Static assets
language-item-workbench/
  ├─ contracts/  Compile-time Workbench data contracts
  └─ registries/ Versioned Workbench business-rule and payload registries
docs/            Local-only planning and product documentation (gitignored)
index.html       Frontend entry
Dockerfile       Multi-stage build (bun + cargo chef + distroless)
sample.env       Environment variable template
```

**Tech Stack:**

- Frontend: React 19, TanStack Router, React Query, Chakra UI, Immer
- Backend: Axum, tower-sessions, MongoDB driver, oauth2
- Build: Vite, Bun, cargo-chef

## Development Commands

**Frontend:**

- `bun install` or `npm install` - Install dependencies
- `bun run dev` - Start Vite dev server at `http://127.0.0.1:8001` (port 8001)
- `bun run build` - Type-check + production build
- `bun run preview` - Preview production build

**Backend:**

- Assessment Settings uses one state-dependent primary action: Edit settings for published snapshots, Save changes for unsaved/staged edits, and Use for new items for saved drafts. Staged edits must apply or cancel first; cross-view pending edits expose Return to unapplied edits. Explicit Reload saved draft / Start from published settings discards confirmed local editor state; ordinary saves preserve the view. Load failures and absent settings provide retry without overwriting edits. Keep validation success inside the publication confirmation only. Source-rule Availability is distinct from publication; shared definitions have one overview action. Language entry dialogs use Apply to draft, and excluded assessment combinations hide irrelevant fields without clearing saved values.

- English vocabulary Meaning is optional in imports, entry editing, Registry draft saves and publication; blank import updates preserve existing meanings, and explicit clearing remains available. Other languages keep their existing meaning requirements.

- Language content Directory supports explicit `language: zh | en | es` with language counts, vocabulary/grammar filtering, examples and entry details. Missing legacy language means Chinese without rewriting stored snapshots. Imports accept a Language column or an Add-only default and offer original, uncalibrated English/Spanish sample previews. Duplicate identity includes language; existing IDs cannot change effective language. Item rules, Can-do, Context, difficulty and scoring are shared across Chinese, English and Spanish; New items and Coverage select one language and restrict targets, statistics, generation and checks to it. Each item saves its immutable effective language; missing legacy item language means Chinese. Preserve staged Apply to draft / Save changes / confirmed publication and pinned legacy snapshots.

- `cargo run` - Run server (requires env vars, uses `docker` feature by default)
- `cargo build --release` - Production build
- `cargo fmt` - Format code
- `cargo clippy` - Lint

**Prisma:**

- `npx prisma generate` - Generate client (auto-run in Docker)

**Local Dev Workflow:**

1. Start MongoDB (local or Atlas)
2. Set environment variables (see sample.env)
3. Terminal A: `cargo run` (server)
4. Terminal B: `bun run dev` (frontend)

## Environment Variables

**Required:**

- `COOKIE_KEY` - 64-byte session key
- `MONGODB_URI_PRODUCTION` - MongoDB connection string
- `MONGODB_URI_STAGING` - MongoDB connection string

**Conditionally Required (unless `MOCK_AUTH=true` in debug):**

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

**Conditionally Required (when using a real Language Item AI provider):**

- `LANGUAGE_ITEM_AI_MODEL`
- `DEEPSEEK_API_KEY` when `LANGUAGE_ITEM_AI_PROVIDER=deepseek`
- `OPENAI_API_KEY` when `LANGUAGE_ITEM_AI_PROVIDER=openai`

**Conditionally Required (when GitHub review is enabled):**

- `GITHUB_REVIEW_TOKEN` - fine-grained token with Contents and Pull requests read/write access
- `GITHUB_REVIEW_REPOSITORY` - private review repository in `owner/repository` form
- `GITHUB_REVIEW_WEBHOOK_SECRET` when automatic merged-PR synchronization is enabled

**Optional (with defaults):**

- `PORT` (8080) - Server port
- `ALLOWED_ORIGINS` (`http://127.0.0.1:{PORT}`) - CORS origins (CSV)
- `GITHUB_REDIRECT_URL` (`http://127.0.0.1:{PORT}/auth/callback/github`)
- `MOCK_AUTH` (false) - Bypass OAuth (debug only)
- `LANGUAGE_ITEM_AI_PROVIDER` (`deterministic-mock`) - Use offline mock, `deepseek`, or `openai`
- `DEEPSEEK_BASE_URL` (`https://api.deepseek.com`) - DeepSeek Chat Completions API base URL
- `OPENAI_BASE_URL` (`https://api.openai.com/v1`) - Responses API base URL
- `GITHUB_REVIEW_ENABLED` (`false`) - Use GitHub pull requests as the human-review authority
- `GITHUB_REVIEW_BASE_BRANCH` (`main`) - Review repository target branch
- `GITHUB_REVIEW_API_BASE_URL` (`https://api.github.com`) - GitHub API base URL
- `REQUEST_BODY_SIZE_LIMIT` (5 \* 2^20 bytes) - ~5 MiB
- `REQUEST_TIMEOUT_IN_MS` (11000; increase for real AI calls)
- `SESSION_TTL_IN_S` (7200)

**Update `sample.env` when adding/modifying env vars.**

## Architecture

**Backend:**

- Source Exercise Template integration uses `language-item-workbench/exercise-templates/` for all 60 canonical source names, recursive field metadata, source schemas and author-preview renderers. Preserve source names exactly, including capitalization and duplicate names; use separate source-skill information to distinguish duplicate names. All interface labels, descriptions and validation messages are English; authored target-language content remains in its original language.
- New Assessment Settings rules use `exerciseTemplateRules`: one Primary Can-do × Exercise Template row with allowed Domains, optional Context restrictions, task requirements, three difficulty profiles, scoring, supplementary review criteria and template defaults. Item rules opens this table and the full template library, with Basic settings, Difficulty, Scoring and Review detail tabs; existing rules retain their authored task and scoring requirements under distinct Item rule IDs. Keep the two top-level Item rules and Language content tabs and staged Apply to draft / Save changes / confirmed Use for new items protections.
- New items selects Can-do before Exercise template. Every configuration has one canonical `itemRuleId`; source configurations use their rule ID directly and `EXERCISE:<source-type>` identifies the template. Rule IDs bind one exact Primary Can-do and format, and shared scoring contracts and task families reference explicit `itemRuleIds` arrays. Empty allowed Contexts means no registered Context restriction; Domain remains required. New Settings drafts remove language-entry Context restrictions and exact-combination assessment exceptions. Published snapshots and existing items retain their pinned rules.
- Current TaskPackage contracts use version `0.2`. Retired identity keys are accepted only at explicit storage/archive and browser-session migration boundaries; current models, APIs and UI expose `itemRuleId`. The offline database command preflights all records, verifies original frozen hashes, backs up exact BSON, preserves immutable evidence and rejects active or uncertain generation work. Stop every database writer before applying it; see `ITEM-RULE-MIGRATION.md`. It never publishes settings, approves content or replays provider calls.
- Source template item fields use a schema-driven editor, with full answer-bearing data in `authoringPackage.exerciseTemplate` and only an allowlisted, structurally answer-safe projection in `candidatePayload`. AI candidates carry separate `proposedExerciseTemplate` author data. Server validation verifies the private source schema and candidate projection; matching, ordering, categories and missing letters need structural answer isolation. Interactive source practice renderers are loaded only for Author preview, with sanitized Markdown, English instructions and isolated styles. Candidate preview and independent answering never receive the private source data. Source practice support does not establish formal exam delivery or empirical calibration.

- Axum with tower-sessions (MemoryStore - not production-ready for multi-node)
- MongoDB via official driver + custom domain models
- Tracing for structured logging
- CORS via `ALLOWED_ORIGINS`
- GitHub OAuth via oauth2 crate
- WebSocket state in `Arc<Mutex<ClientSync>>` with 5-min cleanup task
- Static file serving: Built frontend (`dist/`) served by Rust server
- Local debug startup with `MOCK_AUTH=true` automatically creates or reuses the Local User session before opening the home page. Failed session initialization shows a retryable connection error rather than Sign in. Keep the shared React Query client independent of the route tree to avoid circular module initialization.
- Workbench canonical data uses dedicated collections in the Staging MongoDB database and is independent of the user's database-environment setting
- Bulk authoring uses durable `LanguageItemBatchGenerationJobs`, pinned Registry snapshots, stable child/item/run identities, bounded workers and renewable leases. A batch contains independent draft items with separate AI candidates; it never adopts or approves candidates automatically. Pause finishes an in-flight provider call; recovery does not replay uncertain calls. Required and rotating targets must pass the same task, Context and mastery constraints as single-item creation.
- The Workbench home at `/language-items` is Item Bank, containing item browsing, filters and navigation. New items is the single creation entry at `/language-items/new`; one shared setup and quantity form handles one or multiple items, defaults new groups to one item, and preserves existing saved quantities and targets. An empty plan opens Item setup directly. Generate 1 item / Generate N items opens the independent Generation jobs page at `/language-items/batches?batchId=...`; progress, pause/resume and history stay there instead of on the home page. The newest completed job retains its expanded item list. A `batchId` direct link separately fetches the requested job when it is absent from the latest 100 jobs, with independent progress polling and explicit load-error/retry feedback.
- Creation keeps the five author-facing setup fields, quantity and language targets visible. What this item should assess labels single-item targets; Targets required in every item labels shared multi-item targets. Different targets for different items retains the existing rotating-target allocation; Preview each item's targets must match the backend's per-item assignments. New items has no name input or Options disclosure: new plans derive names from their exercise templates, while existing saved plan names remain intact. AI drafts per item is a required, always-visible field (default one), beside Number of items for a single setup and shared once above legacy multi-setup plans. Each new plan uses one shared setup; different setups are submitted separately through New items. Coverage suggestions initialize an empty plan or replace the current setup, quantity and targets only after Apply suggestion; they never append another group. Existing multi-group browser plans remain editable and submittable without truncation or automatic idempotency-key changes, but cannot grow. Generation jobs identifies each job by name and creation time, shows the five author-facing setup fields and required targets once per group, and limits rows to item identity, additional targets and generation state. Internal batch and item IDs stay in data and navigation, without visible ID labels. A queued job with a running child displays Generating; job progress and assigned targets do not imply approval or confirmed language use.
- A single-group, one-item plan also offers Write manually, including when no language targets are selected. Manual creation saves selected required and distributed targets and opens Edit & preview via `start=manual`, without another Prepare/manual-choice step. Once creation returns an item ID, a failed target save retains an account-scoped recovery record for the current browser session, including after refresh or leaving and returning. Retrying the same setup reuses that draft; Open unfinished draft also remains available. Empty manual drafts still need complete requirements before generation or submission. Existing candidates lead Prepare; generated requirements are a read-only summary, with editable repair only for missing or incompatible targets, supporting refs or information points, including formal-check errors. A repair remains editable until the next AI run; ordinary title or content edits do not unlock it. Requirements and regeneration remain disclosures, automatically opened when the saved requirements need attention. The item workspace omits prompt controls and History & item details while keeping durable records. Adopting opens Edit & preview, and Continue opens Submit; Submit for review saves the latest content, runs deterministic checks and independent AI preliminary review, and creates the PR only after both succeed. Batch links become available after the queued run is durable; Continue can recover an uncreated item only after confirming no AI run exists. Individual generation waits for successful run-history loading and rechecks active runs before queueing; loading failures expose a retry outside the disclosures.
- Language coverage lives independently at `/language-items/coverage` and counts each item's saved core language targets, using its latest approved content separately from mutable/frozen unapproved work. Item status offers Approved items and Unapproved items inside the always-visible item results section, alongside its nested Target combinations; both use the selected inventory. Changing Item status resets only item pagination and preserves the active combination and setup goal. Unapproved includes drafts, review, needs-revision, review-blocked and rejected content, not only work awaiting review. Archived/deleted records are excluded; an item with approved content and a current revision may count in both inventories. There is no Count by, Confirmed, or supporting-material mode. Queries stay within one Registry version and support ALL/ANY/exact/excluded targets and disjoint Target combinations using Included/Not included; exclusions apply before counts so drilldown matches. More filters and Target combinations are disclosures; item results and Item status remain visible; remove the separate Item counts by attribute display and global Item count goal. Planning starts only from a setup row's Set goal, through the existing New items handoff; generation, evidence and review requirements remain independent.
- Each Coverage visit, including browser reload or leaving and returning, checks Current Registry and opens the complete, unfiltered Overview; do not restore Coverage analysis from browser-session storage. Initialize each view with that Registry and independent filters: opening Find items directly starts with Current and all default values, without inheriting Overview filters. Preserve each view's own Registry, eight item filters and analysis during view switches; later Registry publications do not change either analysis automatically. The page hierarchy is view controls and Refresh, the Language content overview with four metrics, one Filters section with Category and Search language content plus More filters and an internal Reset action, then Coverage by language content with Sort by and the table. Remove the unrelated full-inventory Approved items / Unapproved items summary line. Refresh refetches all active Coverage queries for that account, including an open setup goal, without clearing filters or inputs. The independent browser-session handoff of a Coverage suggestion to New items remains unchanged.
- Find items leads its results with Coverage by item setup: each row is one complete Item rule × Context × Domain × Difficulty grouping, with Approved items and Unapproved items side by side. The Coverage API aggregates the full language query and eight item filters before pagination, independently of the selected Item status; do not infer these joint counts from separate attribute totals or the current item page. Coverage by item setup and Items are separate sibling panels with matching borders, padding and heading levels. The Items panel stays expanded and starts with one compact row containing its Items title, the Approved items / Unapproved items selector and matched item count, followed by the result list or empty state. Keep the accessible Item status label but omit its visible label and the repeated inventory heading. Clicking a setup row's count narrows its complete setup filters, preserves the language selection, ALL/ANY/exact mode, exclusions, active Target combination, Registry and any Skill/activity filters, switches Item status to the clicked column, and shows item results on their first page. Back to item setups restores the preceding query and both setup-goal inputs. Set goal queries that row independently: Desired approved item count defines the target, Approved item shortfall subtracts only approved items, and New items to plan starts blank and requires an explicit integer from 1 to 50 no greater than the shortfall. Never automatically deduct unapproved items or equate the shortfall with a creation quantity; View N unapproved items opens their details for inspection. The Coverage suggestion preview labels the handed-off quantity New items planned. Both raw inputs survive view/status changes, pagination, Refresh and failed-query retries; actual query-meaning changes or Reset clear the goal. If setupCounts is explicitly empty and the rule identity and five selected setup fields are complete and compatible, show that one setup with 0/0 counts and Set goal. An already-open goal row remains available if a successful refresh returns no matches for that row, even when other rows remain. Do not infer zero from missing statistics or synthesize an initial goal row from incomplete or incompatible selected settings. Missing setup fields display Unknown and disable that row's Set goal.
- Overview joins sparse target counts to the pinned Registry's non-supporting language directory. With no setup filters, retain the complete directory. With setup filters, retain entries eligible for at least one compatible Item rules × Context × Difficulty combination satisfying all eight filters together, using the same Context, Can-do, mastery and exact-combination restrictions as item creation. Keep eligible entries with zero items; never derive directory membership from existing item counts. Category and Search further scope Total and three disjoint counts with percentages: With approved items (approved > 0 even with unapproved items), With unapproved items only (approved = 0 and unapproved > 0), and Without items (both zero). These metrics and Coverage by language content use the same filtered directory and sum to Total across all matching content, not just the current page. Incompatible setup conditions show zero matching content and explicit no-compatible-setup feedback; distinguish this from a valid setup with no eligible language content and from unavailable statistics. Sort and numeric pagination change display only. Entries count stable IDs, including distinct meanings and categories, not item totals or text occurrences. Row-level Approved items and Unapproved items stay side by side and may both be nonzero; add No items only for zero/zero, without a status column or availability dropdown. Do not restore duplicate summaries, fixed explanations or evidence-confirmation displays. When saved target data is actually unknown, show a short warning and use No recorded items; use Only unapproved items recorded if approved target data is unknown. An empty target array is known empty, and missing author evidence is unrelated. Normal generation/submission needs at least one vocabulary, grammar, character or pragmatics target, not one from every category; unfinished manual drafts may temporarily have none.
- Only an explicit Overview count drilldown copies its Registry and eight item filters into a new Find items query, replacing language selections, Item status, goal and pagination so the list matches the clicked count. The copied filters are independent; subsequent Find items changes do not alter Overview. Reset inside Filters clears only the current view and its filters, returning that view to the visit's Current Registry. Overview edits, resets and version changes preserve all Find items selections, combinations and goals; Find items changes preserve Overview filters and table state. Within the current view, changed language conditions, version or item attributes invalidate its goals/combinations and reset pagination; Item status changes preserve goals/combinations and reset only item pagination. Version changes clear only that view's language selections, filters, combinations, goals and table state; Find items preserves Item status and resets Match to All. Clear search changes only the search. Filters remain mounted independently of successful coverage data, retaining available controls during loading and query errors; missing settings may disable dependent controls but must leave recovery actions available. Never render missing or failed statistics as zero. More filters has no active-count badge or duplicate summary; selected filters, exclusions or a historical version initially expand it and users can collapse it. An active Target combination and Clear combination live in Filters so failed queries can still be cleared; its count table stays inside item details. Target categories preserve selections. Approved-result links open the current item workspace with a tooltip noting approved-version counting; no fixed result guidance or duplicate single-target counts.
- Append-only `LanguageItemEvidence` records author observations and source/originality notes. A normalized `evidenceContentHash` ignores freezing/review bookkeeping while still binding observations to authored content; immutable versions carry this optional hash, and legacy versions without it remain unknown. Confirmed coverage counts fully reviewed core targets required for understanding or production, not merely declared targets or optional opportunities. Evidence is author-only metadata and does not replace existing review gates.
- Reference-source records and API remain available, but Assessment Settings has no Reference sources entry; external corpora are not imported or used as RAG automatically. Exam Creator retains assembly responsibility; new single-select Staging exports expose namespaced skill/activity/Can-do/format/target/supporting tags to existing tag quotas. The other six formats' formal delivery and empirical calibration remain separate work.
- The Workbench has one authenticated user role. Central-rule maintenance, item setup, AI generation, editing, validation, and review are workflow operations rather than separate author/assessment-admin roles; record ownership still protects mutable drafts from unrelated users.
- Workbench filter dropdowns list concrete values only. Represent an unset filter with a hidden, disabled No filter placeholder and a separate accessible clear action after selection; keep the unfiltered default and reset behavior. Preserve meaningful matching operators and authored scope choices such as Not restricted separately from the absence of a filter.
- AI drafts per item uses a shared editable dropdown in New items and individual regeneration. Authors may select a suggested count or enter a positive whole number; there is no 3/5-candidate business cap. Preserve custom saved counts, validate integer representability, and bound concurrent provider calls without truncating the requested total. Pausing a batch stops new candidate calls after active calls finish; an interrupted item retains available candidates with an explicit partial-result message, and Resume proceeds to pending independent items. Remaining candidates on a partial item require explicit individual generation, never automatic replay.
- Central Item rule, Can-do, Domain/Context, A1 difficulty, language-content, scoring, schema, review, and delivery rules are maintained on the independent `/language-items/assessment-settings` page, opened from Item Bank navigation alongside New items. The toolbar separates plain-text status from actions: Saved · Not applied, Unsaved changes (including unapplied dialog edits), or In use for new items for the active publication. Save changes appears only for unsaved or staged edits and stores the draft without activating it. Use for new items checks the saved draft and requires confirmation with Confirm and use settings; ownership, staged-edit, stale-baseline and remote-conflict guards remain in force. Saved drafts have one action, and save/publication success updates the status without duplicate notices. Drafts must validate before publication, published versions are immutable, and every new item pins the active version.
- Assessment Settings has exactly two top-level tabs: Item rules and Language content. Item rules opens one Can-do and Exercise template configuration per row, with the full template library alongside it. Source configuration details use Basic settings, Difficulty, Scoring and Review tabs; shared Can-do definitions use staged dialogs. Existing configurations retain their exact saved identity and full difficulty, Context and review editors under Existing item rules. Back to item rules preserves overview filters. Language content is one Directory: a rule's View content action opens it filtered to eligible entries, with New entry and Import on the same page. There is no By Context or Assessment requirements UI. Reference sources, Change history and Published limitations have no Settings UI; retain their records, snapshot fields and APIs, and do not fetch unused audit history. Item setup has five author selections: Can-do, Exercise template, Domain, optional Context and Difficulty. Hiding inapplicable controls must not silently rewrite saved rules.
- Item rules overview lists all matching source configurations without pagination, with Can-do, Exercise template, Allowed Domains, Difficulty, Scoring and Actions columns. Search, Can-do and Exercise template filters lead; More filters contains Skill and Domain. Edit opens staged details; Copy creates an independent rule identity; Remove deletes only that configuration and its exact dependent bindings. Existing rules retain distinct task/scoring requirements and shared-definition membership. Difficulty profiles apply across the rule's allowed Contexts with explicit editing scope. Incomplete or incompatible saved data remains repairable, historical difficulty ranges remain intact, and all edits participate in global Save changes and confirmed Use for new items.
- The Settings rule overview and Language content Directory derive from the same snapshot. Overview retains incomplete or incompatible draft bindings with repair feedback. View content uses the selected Item rule and optional Context to show compatible entries by language, Can-do and mastery. New entries, imports and bulk edits never add entry-level Context restrictions or exact-combination assessment rules. Draft creation and saving strip those obsolete fields; old published snapshots and pinned item validation continue to interpret them historically. Apply to draft participates in unsaved-change protection before global Save changes and confirmed Use for new items. Design rules and AI judgments do not establish empirical difficulty or language mastery.
- New Registry drafts use `settingsSchemaVersion: 3` and automatically derive fixed review checks for every Item rules combination, without an enable action or empty ruleset. Fixed source requirements are read-only and always required; Edit source returns to the related setting. Authors can add/edit/remove supplementary criteria and evidence. Generate review rules uses the current unsaved snapshot with the configured real provider and returns per-rule differences for explicit selection; unselected suggestions and unmentioned manual rules remain unchanged. Suggestions and row edits have staged/readonly/stale protection, followed by global Save changes / Use for new items. Existing supplementary rules retain source fingerprints until the author explicitly reviews and accepts updated sources; stale sources block publication. Old published snapshots remain immutable, and legacy versions without a saved ruleset keep prior review semantics.
- Difficulty editing uses one value for Input length, Information points, Contextual support, and conditional Distractor similarity (Single select/Matching); explicit edits set matching defaults and singleton ranges and regenerate the description from the current structured defaults, while saved ranges, descriptions, and independence remain unchanged on read, with repair controls for invalid legacy values and no routine Definition or Independence editor.
- Assessment Settings manages version identifiers internally and displays named rules. Configurations bind one Exercise template and exactly one Primary Can-do, derive skill/activity, allow centrally maintained active Contexts, and require Lower/Typical/Upper A1 profiles. New-item selections survive dismissal and refresh within the browser session; the dialog selects Can-do, Exercise template, Domain, optional Context and Difficulty. Generated items open Prepare (existing candidates or language targets and key information), followed by Edit & preview and Submit; manual creation opens Edit & preview directly. Changes autosave; unsaved navigation/sign-out/refresh are guarded, edits invalidate checks, and submission requires current successful checks. A single Item setup summary provides Edit item setup; fixed scoring rules and optional fields remain in disclosures; the draft workspace omits evidence forms, optional AI feedback controls and history. Raw TaskPackage JSON is not an authoring control. See `language-item-workbench/ITEM-CREATION.md` for field meanings.
- Edit item setup stages Domain, Context, and Difficulty changes in a dialog with an impact preview; Cancel discards those staged selections and Apply changes explicitly updates the draft. The Item rule identity, Exercise template, Primary Can-do and pinned Registry version stay fixed. The selected difficulty band uses its complete scheme from the item's pinned Assessment Settings, displayed read-only without author-facing difficulty tuning or rationale inputs. Setup changes preserve all language targets, supporting content, information points, candidate content, and answers. Surface incompatibilities as repairable issues; authors explicitly remove excess information points when the new scheme requires fewer, never silently truncate them. Applying changed setup invalidates formal checks, and existing content must be checked again. Later Settings publications apply only to new items.
- Registry draft writes preserve authored values; only legacy reads hydrate absent metadata. Published legacy snapshots retain their original validation semantics. Publication checks ownership, draft revision, and the current published baseline; incompatible Contexts, invalid bindings, shared-policy conflicts, and incomplete difficulty profiles block publication.
- Language content is a searchable directory table with staged single-entry editing and unified Excel/Markdown/pasted-table import. Entries retain optional source Level labels, meanings, grammar patterns, pinyin, English glosses, examples, usage restrictions, sources, notes and unknown metadata. Level is free single-line metadata and does not change item Difficulty or language compatibility. Basic vocabulary templates contain Level, Name and Meaning plus optional Pinyin; common Level and Translation headers map directly to level and meaning. Worksheet names supply default categories without synthetic columns, and unambiguous imports open editable previews directly. Missing Chinese vocabulary/character pinyin is generated locally in the preview, preserving supplied values and explicit update clears; authors can edit it. New settings drafts may enrich unchanged bundled entries by stable ID; published snapshots are never enriched with new content rules on read. Import defaults to adding entries; updating requires explicit mode and existing IDs, blank updates preserve fields, explicit clearing is separate, and missing file rows never delete entries. Imports and editor changes apply to the settings draft before Save changes and Use for new items; staged edits participate in navigation, refresh and sign-out protection.
- Language content supports explicit current-page or all-filtered row selection and staged bulk editing of Level, mastery, Can-do and Context scopes, plus missing pinyin. Bulk fields default to Keep; clearing Level and removing scope restrictions are explicit actions. Show proposed changes before Apply to draft and reject stale snapshots, including changes during pinyin generation. Preserve unrelated fields and unknown metadata. Selection clears when the filters or editable Registry change; bulk changes retain the existing Save changes and Use for new items workflow.
- Language-content import explains all disabled Add/Update conditions in the fixed footer, with one adjacent Review rows action. Same-name rows requiring meaning/structure confirmation remain distinct from validation errors. Review rows collects included errors and unconfirmed same-name rows across the entire preview before pagination, retains fields while corrections are made, and allows explicit exclusion of only unresolved rows in that review. Excluded rows remain in All rows and never delete saved entries; confirmations for unchanged comparison groups stay intact. Keep bulk selection next to preview counts and review controls next to the review heading. Collapse completed input after the first preview; Add more input reopens it without losing staged values, and pending text or column mapping stays expanded.
- Language content keeps Category, name, optional Level, Meaning (vocabulary) or Structure (grammar), Mastery scope, Applicable Can-do and Applicable Context in the entry form. Empty Can-do values mean Not restricted; Context uses the explicit all/selected/exclusions semantics above. New/imported entries default to unrestricted scopes, while blank import updates preserve existing scopes. Pinyin, English meaning, examples, restrictions, sources and notes live under Details; English meaning is the display label for the existing englishGloss field. Same-category names, including known bundled display aliases, reveal existing entries before adding; exact name/meaning-or-structure duplicates block new or identity-changing entries, while distinct meanings require confirmation and existing duplicate records remain editable. Changes to compared entries invalidate duplicate confirmation. Category changes preserve authored metadata. Keep Import, More fields, More filters and concise labels; avoid duplicate entry-creation controls or routine tutorial prose.
- Workbench AI runs, exports, and audit events use append-only records; GitHub PR commits are the configured submission-history and human-review authority, and merged files are revalidated before replacing the same item's current approved content
- AI preliminary review first attempts the item in a separate call using only its item format and candidate-visible payload, withholding saved answers, scoring, author metadata, translations, targets and intended information points. The unchanged independent response, alternatives, exact candidate-text evidence and limitations are retained with the content-bound review, including when the later answer-revealed review fails. The second call compares that observation with the saved answer and pinned rules; disagreement alone is advisory, while established defects retain existing submission gates. Open responses are not required to have a unique answer. Unavailable referenced media produces an explicit incomplete attempt, and simulation never counts as real review. Legacy reports remain readable but cannot authorize new submissions without the current protocol; human review retains the final decision.
- Submit for review saves current edits, checks deterministic rules, runs independent AI preliminary review, and creates the PR only after required checks pass and no serious AI findings remain. Modern review plans include the item's actual Context, Difficulty and each language target; immutable per-check results report pass, fail or insufficientEvidence with quoted candidate/scoring evidence. The server validates plan identity, result coverage, sources and exact evidence; required failures or insufficient evidence block submission, while optional supplementary results remain advisory. Reports cannot be edited to remove a block. Generation and review share the configured provider/model but use separate prompts and calls. Reports pin exact content hashes, draft revisions or immutable version identities, owner and Registry specs. Failed, simulated, malformed, stale or hashless reports cannot authorize PR creation. Repeated submission of unchanged content reuses a current-prompt report, including blocking results. Legacy reports without a checklist retain their findings semantics. PR bodies and audit details reference the report; AI does not approve human gates or establish empirical difficulty. Author evidence/source forms and optional AI feedback controls remain absent; stored records remain intact.
- Workbench item record state is independent from content/review status: owners can archive, soft-delete, and restore items while immutable versions, PR links, exports, and audits remain intact
- Workbench version use is independent from approval and record state. Append-only `LanguageItemVersionUsageEvents` pin immutable version/content/Registry identities and record Unreleased, Pilot, Live, Suspended or Retired decisions and manual pilot summaries. Owners of active records can write with revision and idempotency protection; missing statistics remain unknown. Live requires the latest explicit release conclusion and a fresh release after suspension, never an automatic threshold. Version use and pilot results appears only in Submit after an approved version or prior use record exists; new drafts and first pending-review versions have no panel. Step switches preserve unsaved pilot forms. Existing use history stays visible if approval is lost, with withdrawal actions still available. No use-state action deploys or withdraws legacy exams. See `language-item-workbench/VERSION-USAGE.md`.
- A revision must not replace an existing mutable draft. Optional `usageEventId` links a same-version revise/retest pilot conclusion to its revision audit. New drafts reset empirical observations while preserving intended difficulty and immutable source history. The assembly manifest is an allowlisted, candidate-free metadata snapshot of a frozen version and current Workbench availability; it excludes answers, authored content and notes and is not a delivery package.
- Item Bank supports owner-only row selection and select-all within the current filters, with bulk archive, recoverable deletion, and restoration. Filter/account changes clear selections; bulk calls reuse the owner-protected item endpoints with bounded concurrency, retain failed selections for retry, and confirm deletion once with the selected count.
- Seven Item Formats are authorable and previewable: single select, matching, restricted input, form entry, typed message, spoken single, and spoken multiturn
- A single fixed template registry binds each Item Format to its authoring editor and candidate-safe renderer; canonical TaskPackage metadata, scoring, delivery, and review partitions remain outside the candidate template
- Language content separates core target refs from supporting context refs; structured information points can reference item-level scoring points, while registry scoring policy stays locked and author-visible
- Workbench capability snapshots expose author-readable Can-do evidence, all communicative activities, Task Family/reference constraints, Item rule delivery policy, and complete scoring-contract summaries; locked rules remain visible to every author
- Language-content compatibility is enforced on both client and server by context, primary/supporting Can-do, and receptive/productive mastery scope; saved candidate previews are reread through the candidate-safe preview API
- Workbench AI defaults to a deterministic offline provider. DeepSeek uses server-side Chat Completions JSON mode; OpenAI uses Responses API structured outputs with `store: false`. Candidate calls are independent and run asynchronously after a durable `queued` record is created; invalid candidates receive at most one focused repair, and final state is persisted as `partial`, `completed`, or `failed`.
- New items exposes View AI prompt using the same server request builders as generation, with per-item and per-AI-draft selection. The item workspace does not repeat prompt previews or recorded-prompt controls. Preview is read-only and never calls the provider; saved-item preview checks ownership and revision. Owner-visible generation history records the actual initial, retry, and repair request bodies without credentials; missing legacy records and offline simulation never imply a sent prompt. Prompt snapshots that would push a run past its storage budget are omitted with an explicit reason while preserving generated drafts and telemetry.
- OpenAI requests explicitly use `text.format.strict: false` because pinned Registry schemas contain optional fields and dynamic answer maps. Schema guidance is best effort; application parsing and deterministic validation remain authoritative. Do not rewrite published schemas or claim strict API schema guarantees.
- New AI runs persist a complete `generationSetupSnapshot` of their authoring requirements; client availability and server adoption compare it with the current draft, show Earlier requirements, and reject adoption when those requirements changed. Title and candidate-content edits are excluded from that comparison. Legacy runs without a snapshot compare only their recorded fields and cannot detect every historical difficulty-profile change; do not claim equivalent legacy coverage.
- Candidate ordering uses validity, visible-content duplication, and validation warnings, not an AI quality score. AI runs retain observed provider timing, request IDs, and reported token usage; `server/language_items/evals/` is a synthetic offline mechanical baseline, not a human-rated dataset.
- GitHub submissions carry pinned Registry/schema assets and an original-submission tag. The trusted-base CI template lives in `language-item-workbench/review-repository/`; external required-check and tag protection setup is necessary. Merged imports preserve submission snapshots, compare locked settings, create separate approved versions, and cannot overwrite newer drafts. A configured signed-webhook worker retries durable transient failures; blocked validation/conflict failures require explicit recovery.
- Candidate-private metadata is rejected recursively on save, generation, merge, and candidate preview, including nested form source profiles. Technical custom-Context schema upgrades run only on draft creation/save; published schemas remain pinned.
- Language targets display Chinese with English glosses and accept searches in either language without changing canonical Registry labels. AI generation keeps candidate content Chinese and returns separate `englishTranslations` for authors/reviewers; adoption persists them in `authoringPackage`. Each translation pins its source text and candidate-relative JSON pointer, so edited Chinese never displays a stale English translation as current. Candidate APIs and candidate-facing exports exclude author translations; internal Staging archives retain the complete TaskPackage. Legacy Registry schemas remain immutable; review validation checks the optional author metadata independently before validating the remaining package against a legacy schema.

**WebSockets:**

- `/ws/exam/{exam_id}` - Collaborative exam editing (not fully implemented)
- `/ws/users` - User presence tracking

**Data Model:**

- Prisma schema for JS types
- Rust uses custom domain models
- `construct_attempt` in `config.rs` enriches attempts with submission times and selected answers

## Code Style

**TypeScript:**

- Strict mode enabled (`tsconfig.json`)
- PascalCase for components, camelCase for variables/functions
- Avoid `any`, prefer explicit types
- Functional components, hooks for side effects
- React Query for server data
- Immer for immutable state updates
- Keep components < 200 LOC

**Rust:**

- Use `?` for error propagation via `errors.rs`
- Thin route handlers, delegate logic to modules
- Async-only (no blocking I/O)
- Run `cargo fmt` and `cargo clippy`

**General:**

- Keep application interface controls in English independently of browser locale: use the shared FilePicker for file inputs and explicit English locales for Workbench timestamps. Preserve authored target-language content, source names and import header aliases.

- Workbench UI field names are centralized in `client/features/language-items/labels.ts`: Exercise template, Primary Can-do, Domain, Context and Difficulty. Item rules stores the reusable Can-do and template configuration under `itemRuleId`; Item setup adds Domain, Context and Difficulty for one item. Preserve source Exercise Template names exactly. Internal rule IDs are references, not an additional authoring dimension. Task family and Scoring contract remain distinct shared references.
- Use Item for a complete assessment item within the Workbench and Question for its prompt text. Preserve internal `Question`, `QuestionSet`, `numberOfQuestions`, `TaskPackage`, `taskId`, API routes, database fields, and published schemas. Item rules, Item setup, and Generation job identify different concepts; do not call an individual item a task.
- Keep Exams, Attempts, Exam Metrics, and User Management at their pre-Workbench behavior and terminology, including Question, Question Type Config, Tag Config, Back to Dashboard, Logout, and online-user displays. Workbench terminology and lifecycle features are scoped to Language Exam Item Creator. Retain shared authentication, routing, database registration, and dependency compatibility needed to run the Workbench. Legacy exam generation reads its source exam from Production as before; Workbench Staging-only exports are not automatically connected to that generation flow.
- Use AI preliminary review for the automatic pre-submission AI check, AI feedback for other advisory AI results, Check / Checks for deterministic checks, Review for human item review, and Moderation for exam-attempt moderation. Use Write manually consistently. Historical logs and planning records retain their original wording; current guides must match current controls.
- Settings actions use Add item rules, Cancel new item rules, Manage item rules, and Remove these item rules. Keep the existing legacy exam-assembly control names unchanged.
- Call AI-generated alternatives AI drafts in author-facing controls, status, history, and generation feedback. Reserve Candidate for the exam taker and candidate-facing content; preserve canonical API/data names.
- Document "why" not "what" in comments
- Match existing code style
- Check dependencies before use (package.json/Cargo.toml)
- Group imports: external, internal, assets

## API Endpoints

**Exams:**

- `GET /api/exams` - List exams
- `POST /api/exams` - Create exam
- `GET /api/exams/{exam_id}` - Get exam
- `PUT /api/exams/{exam_id}` - Update exam
- `PUT /api/exams/{exam_id}/seed/staging` - Seed to staging
- `PUT /api/exams/{exam_id}/seed/production` - Seed to production

**Attempts:**

- `GET /api/attempts` - List attempts
- `GET /api/attempts/{attempt_id}` - Get attempt
- `PATCH /api/attempts/{attempt_id}/moderation` - Update moderation status

**Exam Challenges:**

- `GET /api/exam-challenges/{exam_id}` - Get challenges
- `PUT /api/exam-challenges/{exam_id}` - Update challenges

**Users:**

- `GET /api/users` - List users (auth required)
- `GET /api/users/search` - Get user with all their attempts and moderations by one of `user_id`, `attempt_id`, `moderation_id`, `username`, or `email` query params
- `GET /api/users/session` - Current session user
- `PUT /api/users/session/settings` - Update user settings
- `GET /auth/login/dev/status` - Report whether local multi-identity dev login is enabled
- `POST /auth/login/dev` - Create/login a local test identity (debug + `MOCK_AUTH=true` only)

**State:**

- `PUT /api/state/exams/{exam_id}` - Discard exam state

**Language Items:**

- `GET|POST /api/language-item-batches` - List or queue owner-controlled, idempotent bulk generation (up to 50 independent items)
- `GET /api/language-item-batches/{batch_id}` - Get durable per-item generation progress
- `POST /api/language-item-batches/{batch_id}/control` - Pause or resume pending bulk work
- `POST /api/language-item-coverage/query` - Query declared/confirmed language coverage, intersections, dimensions, and explicit inventory goals
- `GET|POST /api/language-items/{item_id}/evidence` - Read latest or append content-bound author observations and material sources
- `GET /api/language-assessment/registry/active` - Get the active published central-rule snapshot
- `GET /api/language-assessment/registry/versions` - List Registry draft and published versions
- `GET /api/language-assessment/registry/versions/{version_id}` - Get a complete Registry version
- `POST /api/language-assessment/registry/drafts` - Create a draft cloned from the active Registry
- `PUT /api/language-assessment/registry/drafts/{version_id}` - Save a Registry draft with revision checking
- `POST /api/language-assessment/registry/drafts/{version_id}/review-plan` - Preview the selected Item rules' derived checks and source changes without saving or calling AI; published snapshots are read-only
- `POST /api/language-assessment/registry/drafts/{version_id}/review-rule-suggestions` - Generate supplementary checks from the owner's current draft input with revision protection; suggestions require explicit per-rule application
- `POST /api/language-assessment/registry/drafts/{version_id}/validate` - Validate cross-Registry references and template coverage
- `GET /api/language-assessment/registry/drafts/{version_id}/impact` - Compare a draft with the active Registry
- `POST /api/language-assessment/registry/drafts/{version_id}/publish` - Use for new items and activate an immutable Registry version
- `GET|POST /api/language-items` - List items or create one from a required `itemRuleId` with matching format and Can-do
- `GET /api/language-items/registry` - Get the implemented registry capability snapshot
- `GET /api/language-items/registry/{registry_version}` - Get the published Registry snapshot pinned by an existing item
- `GET /api/language-items/ai-provider` - Get the active AI provider/model status without credentials
- `GET /api/language-items/github-review/status` - Get GitHub review configuration status without credentials
- `POST /api/language-items/github-review/batches` - Require per-item aiReviewRunIds and expectedRevisions, verify successful real AI reports without serious findings against exact draft/version content, validate drafts, create submission snapshots, commit 1–50 items, and create a review PR; drafts lock only after PR creation succeeds
- `POST /api/language-items/github-review/batches/{batch_id}/sync` - Sync PR review/merge state and replace each item's current content with the revalidated merged file
- `GET /api/language-items/{item_id}` - Get an item and mutable draft
- `PUT /api/language-items/{item_id}/record-state` - Archive or restore an owner-controlled item without changing its content lifecycle
- `DELETE /api/language-items/{item_id}` - Soft-delete an owner-controlled item into the recoverable Workbench recycle bin
- `GET /api/language-items/{item_id}/preview` - Get candidate-safe preview data only
- `PUT /api/language-items/{item_id}/draft` - Save a draft with revision checking
- `POST /api/language-items/{item_id}/validate` - Validate the saved draft
- `GET|POST /api/language-items/{item_id}/versions` - List or freeze immutable versions
- `GET /api/language-item-review-queue` - List items whose latest frozen version awaits review
- `GET /api/language-items/{item_id}/audit` - Query item audit history
- `GET /api/language-items/{item_id}/exports` - Query item export mappings
- `GET /api/language-items/{item_id}/usage` - List immutable-version approval and usage summaries
- `GET|POST /api/language-items/{item_id}/versions/{version_id}/usage` - Read paginated use history or append a version-bound status change / manual pilot result
- `GET /api/language-items/{item_id}/versions/{version_id}/assembly-manifest` - Read candidate-free assembly metadata and current Workbench availability
- `GET|POST /api/language-items/{item_id}/ai-runs` - List AI runs or queue idempotent independent candidate generation
- `GET /api/language-items/{item_id}/ai-prompt` - Preview the owner's saved draft request with revision and AI draft ordinal checking, without generation
- `POST /api/language-item-batches/ai-prompt` - Preview one item and AI draft from a proposed generation plan without creating or queueing work
- `GET|POST /api/language-items/{item_id}/ai-review` - List or run content-bound independent AI preliminary review on a mutable draft, optionally requiring expectedRevision
- `GET|POST /api/language-item-versions/{version_id}/ai-review` - List or run isolated AI feedback
- `GET /api/language-item-versions/{version_id}/diff` - Compare a frozen TaskPackage with its prior frozen version
- `GET|POST /api/language-item-versions/{version_id}/reviews` - List or record review gates
- `GET /api/language-items/{item_id}/review-discussions` - List review discussions and resolution history
- `POST /api/language-item-versions/{version_id}/review-discussions` - Open a discussion or blocking change request
- `POST /api/language-item-review-discussions/{discussion_id}/events` - Reply, mark addressed, resolve, or reopen
- `POST /api/language-item-versions/{version_id}/revise` - Start a new mutable draft from a frozen version
- `POST /api/language-item-versions/{version_id}/exports/staging` - Idempotent Staging export
- `POST /api/language-item-versions/{version_id}/exports/production` - Explicitly rejected in MVP

**Auth:**

- `GET /auth/login/github` - Initiate OAuth
- `GET /auth/github` - OAuth callback
- `DELETE /auth/logout` - Logout

**Health:**

- `GET /status/ping` - Health check

**WebSockets:**

- `/ws/exam/{exam_id}` - Collaborative exam editing (not fully implemented)
- `/ws/users` - User presence tracking

## Security

- Explicit shared-workspace deployments may set `PUBLIC_ACCESS=true` and `PUBLIC_USER_EMAIL` to an existing production author. This mode opens a random, secure-cookie session automatically, omits sign-in/sign-out controls, and disables GitHub OAuth routes. Every visitor uses that one configured author; clients cannot select an identity, and existing record ownership remains enforced. Default deployments keep their existing authentication. Release cookies still require HTTPS, including public-IP deployments. Public-session recovery must preserve mounted editors, and WebSocket reconnects must obtain a fresh one-time token.
- `compose.aliyun.yml` supports a single application instance and private, authenticated MongoDB behind host Nginx HTTPS. Deployment settings and credentials stay outside source control; see `DEPLOYMENT-ALIYUN.md`. Build on a separate machine for small-memory hosts, and migrate the configured application database without temporary login sessions.
- The deployment at `8.210.43.194` additionally protects the complete HTTPS app/API/WebSocket surface with Nginx HTTP Basic authentication. Nginx consumes that Authorization header before forwarding cookie-authenticated app requests. Only the HTTP ACME challenge directory is public; other HTTP requests redirect to HTTPS. Keep the short-lived IP certificate renewal timer enabled and deployment credentials/data under ignored local docs or the private server directory. See `DEPLOYMENT-8210.md`.

- Public cloud deployment uses the existing Docker frontend/backend service under one HTTPS origin, with `railway.json` and `DEPLOYMENT.md`. Keep one always-running instance; in-memory collaboration/OAuth state and startup recovery do not support overlapping replicas. Use external MongoDB databases, production GitHub OAuth and the existing admitted-user list. `SUPABASE_URL` and `SUPABASE_KEY` remain required for the legacy exam analytics integration. `SENTRY_DSN` is optional in both debug and release; supplied DSNs must validate.
- Default Railway releases upload the reviewed local dev source using the CLI and `.railwayignore`, without installing the Railway GitHub App or granting repository access. The upload allowlist covers Docker build inputs and excludes secrets, caches and local artifacts. Choose the publication source explicitly when the worktree has unrelated changes; local uploads include saved uncommitted files. The application's own GitHub OAuth login and review repository integration remain separate.
- GitHub OAuth state is session-bound, expires after ten minutes, and is consumed before token exchange, including failed validation. Both OAuth and authentication cookies use SameSite=Lax and are Secure in release builds; local debug HTTP remains usable.

- Never commit secrets (use `.gitignore` for `.env`)
- `COOKIE_KEY` must be exactly 64 bytes
- Enforce `ALLOWED_ORIGINS` (no wildcard credentials)
- GitHub OAuth redirect must match app config
- Validate user input server-side
- Replace MemoryStore for production (use Redis/DB-backed store)
- Rate limiting not implemented (consider tower-governor)

## Performance

- Offload CPU-heavy tasks to `tokio::task::spawn_blocking`
- Add MongoDB indexes for frequently queried fields
- MemoryStore has O(n) memory growth - migrate early
- Monitor frontend bundle size, code-split routes if needed

## Adding Features

1. Update `prisma/schema.prisma` if data model changes, run `npx prisma generate`
2. Add/update Rust route handler in `server/routes/`, register in `app.rs`
3. Extend frontend types (`client/types/`) and queries (`client/utils/fetch.ts`)
4. Implement React components
5. Run `cargo clippy`, `cargo fmt`, and `tsc` to verify
6. Update `sample.env` if new env vars added
7. Update this file and `CHANGELOG.md`

## Open Items

- Add automated tests (frontend + backend) and CI
- Replace MemoryStore with Redis for production
- Implement rate limiting and stronger WebSocket auth
- Add E2E exam generation tests
- Schema versioning/migration strategy

## Agent Expectations

- Respect env var constraints (COOKIE_KEY length, required secrets)
- Start real-AI backends in a normal or already-approved network-enabled environment; child services can inherit a restricted agent shell's network limits. Restart the backend after proxy or launch-environment changes. An unauthenticated API response verifies connectivity only; verify generation separately before reporting it restored. See README.md for the OpenAI connectivity check.
- Run `tsc` before shipping code changes
- After every UI change, immediately apply it to the running page and verify it in the browser. Proactively run the application build, restart affected services when needed, and refresh the page before handoff; do not wait for the user to request a rebuild or refresh.
- Avoid `any` or `unsafe` without justification
- No sweeping refactors
- Update this file when changing architecture, env vars, or major modules
- Update `CHANGELOG.md` with planning and implementation notes
