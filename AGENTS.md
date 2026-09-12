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
- Creation keeps the six setup fields, quantity and language targets visible. What this item should assess labels single-item targets; Targets required in every item labels shared multi-item targets. Different targets for different items retains the existing rotating-target allocation; Preview each item's targets must match the backend's per-item assignments. New items has no name input or Options disclosure: new plans derive names from Blueprint slots, while existing saved plan names remain intact. AI drafts per item is a required, always-visible field (default one), beside Number of items for a single setup and shared once above legacy multi-setup plans. Each new plan uses one shared setup; different setups are submitted separately through New items. Coverage suggestions initialize an empty plan or replace the current setup, quantity and targets only after Apply suggestion; they never append another group. Existing multi-group browser plans remain editable and submittable without truncation or automatic idempotency-key changes, but cannot grow. Generation jobs identifies each job by name and creation time, shows the six setup fields and required targets once per group, and limits rows to item identity, additional targets and generation state. Internal batch and item IDs stay in data and navigation, without visible ID labels. A queued job with a running child displays Generating; job progress and assigned targets do not imply approval or confirmed language use.
- A single-group, one-item plan also offers Write manually, including when no language targets are selected. Manual creation saves selected required and distributed targets and opens Edit & preview via `start=manual`, without another Prepare/manual-choice step. Once creation returns an item ID, a failed target save retains an account-scoped recovery record for the current browser session, including after refresh or leaving and returning. Retrying the same setup reuses that draft; Open unfinished draft also remains available. Empty manual drafts still need complete requirements before generation or submission. Existing candidates lead Prepare; generated requirements are a read-only summary, with editable repair only for missing or incompatible targets, supporting refs or information points, including formal-check errors. A repair remains editable until the next AI run; ordinary title or content edits do not unlock it. Requirements and regeneration remain disclosures, automatically opened when the saved requirements need attention. The item workspace omits prompt controls and History & item details while keeping durable records. Adopting opens Edit & preview, and Continue opens Submit; Submit for review saves the latest content, runs deterministic checks and independent AI preliminary review, and creates the PR only after both succeed. Batch links become available after the queued run is durable; Continue can recover an uncreated item only after confirming no AI run exists. Individual generation waits for successful run-history loading and rechecks active runs before queueing; loading failures expose a retry outside the disclosures.
- Language coverage lives independently at `/language-items/coverage` and counts each item's saved core language targets, using its latest approved content separately from mutable/frozen unapproved work. Item status offers Approved items and Unapproved items inside the item-details disclosure, alongside its nested Target combinations; both use the selected inventory. Changing Item status resets only item pagination and preserves the active combination and setup goal. Unapproved includes drafts, review, needs-revision, review-blocked and rejected content, not only work awaiting review. Archived/deleted records are excluded; an item with approved content and a current revision may count in both inventories. There is no Count by, Confirmed, or supporting-material mode. Queries stay within one Registry version and support ALL/ANY/exact/excluded targets and disjoint Target combinations using Included/Not included; exclusions apply before counts so drilldown matches. More filters and item details are disclosures; remove the separate Item counts by attribute display and global Item count goal. Planning starts only from a setup row's Set goal, through the existing New items handoff; generation, evidence and review requirements remain independent.
- Each Coverage visit, including browser reload or leaving and returning, checks Current Registry and opens the complete, unfiltered Overview; do not restore Coverage analysis from browser-session storage. Initialize each view with that Registry and independent filters: opening Find items directly starts with Current and all default values, without inheriting Overview filters. Preserve each view's own Registry, eight item filters and analysis during view switches; later Registry publications do not change either analysis automatically. The page hierarchy is view controls and Refresh, the Language content overview with four metrics, one Filters section with Category and Search language content plus More filters and an internal Reset action, then Coverage by language content with Sort by and the table. Remove the unrelated full-inventory Approved items / Unapproved items summary line. Refresh refetches all active Coverage queries for that account, including an open setup goal, without clearing filters or inputs. The independent browser-session handoff of a Coverage suggestion to New items remains unchanged.
- Find items leads its results with Coverage by item setup: each row is one complete Blueprint slot × Context × Domain × Difficulty × Item format × Primary Can-do grouping, with Approved items and Unapproved items side by side. The Coverage API aggregates the full language query and eight item filters before pagination, independently of the selected Item status; do not infer these joint counts from separate attribute totals or the current item page. Item details start collapsed and use the selected inventory name and matched count as their heading. Clicking a setup row's count narrows its six setup filters, preserves the language selection, ALL/ANY/exact mode, exclusions, active Target combination, Registry and any Skill/activity filters, switches Item status to the clicked column, and opens item details on their first page. Back to item setups restores the preceding query and both setup-goal inputs. Set goal queries that row independently: Desired approved item count defines the target, Approved item shortfall subtracts only approved items, and New items to plan starts blank and requires an explicit integer from 1 to 50 no greater than the shortfall. Never automatically deduct unapproved items or equate the shortfall with a creation quantity; View N unapproved items opens their details for inspection. The Coverage suggestion preview labels the handed-off quantity New items planned. Both raw inputs survive view/status changes, pagination, Refresh and failed-query retries; actual query-meaning changes or Reset clear the goal. If setupCounts is explicitly empty and all six selected setup fields are complete and compatible, show that one setup with 0/0 counts and Set goal. An already-open goal row remains available if a successful refresh returns no matches for that row, even when other rows remain. Do not infer zero from missing statistics or synthesize an initial goal row from incomplete or incompatible selected settings. Missing setup fields display Unknown and disable that row's Set goal.
- Overview joins sparse target counts to the pinned Registry's complete non-supporting language directory, preserving zero-count entries. Category and Search jointly scope Total and three disjoint counts with percentages: Has approved items (approved > 0 even with unapproved items), Unapproved items only (approved = 0 and unapproved > 0), and No items (both zero). They sum to Total across all matching content, not just the current page; no content filters means the whole directory. Sort and numeric pagination change display only. Eight item filters change item counts and classifications but never remove zero-item content or shrink the directory to Context-compatible entries. Entries count stable IDs, including distinct meanings and categories, not item totals or text occurrences. Row-level Approved items and Unapproved items stay side by side and may both be nonzero; add No items only for zero/zero, without a status column or availability dropdown. Do not restore duplicate summaries, fixed explanations or evidence-confirmation displays. When saved target data is actually unknown, show a short warning and use No recorded items; use Only unapproved items recorded if approved target data is unknown. An empty target array is known empty, and missing author evidence is unrelated. Normal generation/submission needs at least one vocabulary, grammar, character or pragmatics target, not one from every category; unfinished manual drafts may temporarily have none.
- Only an explicit Overview count drilldown copies its Registry and eight item filters into a new Find items query, replacing language selections, Item status, goal and pagination so the list matches the clicked count. The copied filters are independent; subsequent Find items changes do not alter Overview. Reset inside Filters clears only the current view and its filters, returning that view to the visit's Current Registry. Overview edits, resets and version changes preserve all Find items selections, combinations and goals; Find items changes preserve Overview filters and table state. Within the current view, changed language conditions, version or item attributes invalidate its goals/combinations and reset pagination; Item status changes preserve goals/combinations and reset only item pagination. Version changes clear only that view's language selections, filters, combinations, goals and table state; Find items preserves Item status and resets Match to All. Clear search changes only the search. Filters remain mounted independently of successful coverage data, retaining available controls during loading and query errors; missing settings may disable dependent controls but must leave recovery actions available. Never render missing or failed statistics as zero. More filters has no active-count badge or duplicate summary; selected filters, exclusions or a historical version initially expand it and users can collapse it. An active Target combination and Clear combination live in Filters so failed queries can still be cleared; its count table stays inside item details. Target categories preserve selections. Approved-result links open the current item workspace with a tooltip noting approved-version counting; no fixed result guidance or duplicate single-target counts.
- Append-only `LanguageItemEvidence` records author observations and source/originality notes. A normalized `evidenceContentHash` ignores freezing/review bookkeeping while still binding observations to authored content; immutable versions carry this optional hash, and legacy versions without it remain unknown. Confirmed coverage counts fully reviewed core targets required for understanding or production, not merely declared targets or optional opportunities. Evidence is author-only metadata and does not replace existing review gates.
- Assessment Settings includes a free reference-link directory; external corpora are not imported or used as RAG automatically. Exam Creator retains assembly responsibility; new single-select Staging exports expose namespaced skill/activity/Can-do/format/target/supporting tags to existing tag quotas. The other six formats' formal delivery and empirical calibration remain separate work.
- The Workbench has one authenticated user role. Central-rule maintenance, item setup, AI generation, editing, validation, and review are workflow operations rather than separate author/assessment-admin roles; record ownership still protects mutable drafts from unrelated users.
- AI drafts per item uses a shared editable dropdown in New items and individual regeneration. Authors may select a suggested count or enter a positive whole number; there is no 3/5-candidate business cap. Preserve custom saved counts, validate integer representability, and bound concurrent provider calls without truncating the requested total. Pausing a batch stops new candidate calls after active calls finish; an interrupted item retains available candidates with an explicit partial-result message, and Resume proceeds to pending independent items. Remaining candidates on a partial item require explicit individual generation, never automatic replay.
- Central Blueprint, Can-do, Domain/Context, A1 difficulty, language-content, scoring, schema, review, and delivery rules are maintained on the independent `/language-items/assessment-settings` page, opened from Item Bank navigation alongside New items. The toolbar exposes status, Save draft, and Publish only; publication automatically validates and requires confirmation. Drafts must validate before publication, published versions are immutable, and every new item pins the active version.
- Settings separates Item rules from reusable Rule libraries. Item rules identifies one Blueprint slot × Item format × Primary Can-do combination and its reusable central rules; the fields and fixed Lower/Typical/Upper A1 tabs share that selection. Item setup identifies a specific item's six selections, adding Domain, Context, and Difficulty. Compact searchable multi-selects show selected values; Detailed rules and Delivery rules are disclosures. Navigating to Context management preserves the selected Item rules, and hiding inapplicable controls must not silently rewrite saved rules.
- Assessment Settings opens Rules overview and also offers Language content matrix alongside Item rules and Rule libraries. Both tables derive from the same snapshot: overview rows are saved Item rules × Context bindings, including incomplete or incompatible draft bindings with repair feedback; actions open the exact configuration, difficulty level, Context library entry or corresponding matrix column. Matrix rows preserve stable language-entry identities and their meanings/structures, with exact Item rules × valid Context columns (four columns and twenty entries per page), scoped filters and selected cells retained when returning from editing. Entry names open the existing entry editor; cells open a staged Language assessment rule dialog with applicability, assessment mode, communicative purpose, required evidence, acceptable responses, failure patterns, prerequisites and valid/invalid examples. Allowed never widens existing Can-do, Context or mastery scopes; excluded narrows only that exact combination, and absent assessment rules retain existing Not restricted semantics. Apply to draft participates in unsaved-change protection before Save draft and confirmed Publish; published snapshots and existing items remain immutable. Generation v0.7 and independent preliminary-review requests receive only matching combination assessment rules. These rule inputs do not imply empirical difficulty calibration or a new autonomous AI calibration pipeline.
- Difficulty editing uses one value for Input length, Information points, Contextual support, and conditional Distractor similarity (Single select/Matching); explicit edits set matching defaults and singleton ranges and regenerate the description from the current structured defaults, while saved ranges, descriptions, and independence remain unchanged on read, with repair controls for invalid legacy values and no routine Definition or Independence editor.
- Assessment Settings manages version identifiers internally and displays named rules. Configurations bind Slot × Item Format × exactly one Primary Can-do, derive skill/activity, allow centrally maintained active Contexts, and require Lower/Typical/Upper A1 profiles. New-item selections survive dismissal and refresh within the browser session; the dialog has six criteria and no Blueprint slot search. Generated items open Prepare (existing candidates or language targets and key information), followed by Edit & preview and Submit; manual creation opens Edit & preview directly. Changes autosave; unsaved navigation/sign-out/refresh are guarded, edits invalidate checks, and submission requires current successful checks. A single Item setup summary provides Edit item setup; fixed scoring rules and optional fields remain in disclosures; the draft workspace omits evidence forms, optional AI feedback controls and history. Raw TaskPackage JSON is not an authoring control. See `language-item-workbench/ITEM-CREATION.md` for field meanings.
- Edit item setup stages Domain, Context, and Difficulty changes in a dialog with an impact preview; Cancel discards those staged selections and Apply changes explicitly updates the draft. Blueprint slot, Item format, Primary Can-do, and the pinned Registry version stay fixed. The selected difficulty band uses its complete scheme from the item's pinned Assessment Settings, displayed read-only without author-facing difficulty tuning or rationale inputs. Setup changes preserve all language targets, supporting content, information points, candidate content, and answers. Surface incompatibilities as repairable issues; authors explicitly remove excess information points when the new scheme requires fewer, never silently truncate them. Applying changed setup invalidates formal checks, and existing content must be checked again. Later Settings publications apply only to new items.
- Registry draft writes preserve authored values; only legacy reads hydrate absent metadata. Published legacy snapshots retain their original validation semantics. Publication checks ownership, draft revision, and the current published baseline; incompatible Contexts, invalid bindings, shared-policy conflicts, and incomplete difficulty profiles block publication.
- Language content is a searchable directory table with staged single-entry editing and unified Excel/Markdown/pasted-table import. Entries retain meanings, grammar patterns, pinyin, English glosses, examples, usage restrictions, sources, notes and unknown metadata. New settings drafts may enrich unchanged bundled entries by stable ID; published snapshots are never enriched with new content rules on read. Import defaults to adding entries; updating requires explicit mode and existing IDs, blank updates preserve fields, explicit clearing is separate, and missing file rows never delete entries. Imports and editor changes apply to the settings draft before Save draft and Publish; staged edits participate in navigation, refresh and sign-out protection.
- Language content keeps Category, name, Meaning (vocabulary) or Structure (grammar), Mastery scope, Applicable Can-do and Applicable Context in the entry form. Scope selections are direct, with empty values visibly Not restricted; new/imported entries default to unrestricted scopes, while blank import updates preserve existing scopes. Pinyin, English meaning, examples, restrictions, sources and notes live under Details; English meaning is the display label for the existing englishGloss field. Same-category names, including known bundled display aliases, reveal existing entries before adding; exact name/meaning-or-structure duplicates block new or identity-changing entries, while distinct meanings require confirmation and existing duplicate records remain editable. Changes to compared entries invalidate duplicate confirmation. Category changes preserve authored metadata. Keep Import, More fields, More filters and concise field labels; do not reintroduce scope-gating dropdowns, duplicate entry-creation controls or routine tutorial prose.
- Workbench AI runs, exports, and audit events use append-only records; GitHub PR commits are the configured submission-history and human-review authority, and merged files are revalidated before replacing the same item's current approved content
- Submit for review saves current edits, checks deterministic rules, runs an independent AI preliminary review, and creates the PR only when there are no serious AI findings. Generation and review share the configured provider/model but use separate prompts and calls; no separate agent service is required. Reports pin exact content hashes, draft revisions or immutable version identities, owner and Registry specs. Failed, simulated, malformed, stale or hashless reports cannot authorize PR creation. Repeated submission of unchanged content reuses a successful current-prompt draft report, including blocking findings. PR bodies and submission audit details reference the report; AI does not approve human gates. Author evidence/source forms and manual optional AI feedback controls are absent from the draft workflow, while stored records remain intact.
- Workbench item record state is independent from content/review status: owners can archive, soft-delete, and restore items while immutable versions, PR links, exports, and audits remain intact
- Workbench version use is independent from approval and record state. Append-only `LanguageItemVersionUsageEvents` pin immutable version/content/Registry identities and record Unreleased, Pilot, Live, Suspended or Retired decisions and manual pilot summaries. Owners of active records can write with revision and idempotency protection; missing statistics remain unknown. Live requires the latest explicit release conclusion and a fresh release after suspension, never an automatic threshold. Version use and pilot results appears only in Submit after an approved version or prior use record exists; new drafts and first pending-review versions have no panel. Step switches preserve unsaved pilot forms. Existing use history stays visible if approval is lost, with withdrawal actions still available. No use-state action deploys or withdraws legacy exams. See `language-item-workbench/VERSION-USAGE.md`.
- A revision must not replace an existing mutable draft. Optional `usageEventId` links a same-version revise/retest pilot conclusion to its revision audit. New drafts reset empirical observations while preserving intended difficulty and immutable source history. The assembly manifest is an allowlisted, candidate-free metadata snapshot of a frozen version and current Workbench availability; it excludes answers, authored content and notes and is not a delivery package.
- Item Bank supports owner-only row selection and select-all within the current filters, with bulk archive, recoverable deletion, and restoration. Filter/account changes clear selections; bulk calls reuse the owner-protected item endpoints with bounded concurrency, retain failed selections for retry, and confirm deletion once with the selected count.
- Seven Item Formats are authorable and previewable: single select, matching, restricted input, form entry, typed message, spoken single, and spoken multiturn
- A single fixed template registry binds each Item Format to its authoring editor and candidate-safe renderer; canonical TaskPackage metadata, scoring, delivery, and review partitions remain outside the candidate template
- Language content separates core target refs from supporting context refs; structured information points can reference item-level scoring points, while registry scoring policy stays locked and author-visible
- Workbench capability snapshots expose author-readable Can-do evidence, all communicative activities, Task Family/reference constraints, Slot × Item Format delivery policy, and complete scoring-contract summaries; locked rules remain visible to every author
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

- Workbench UI field names are centralized in `client/features/language-items/labels.ts`: Blueprint slot, Item format, Primary Can-do, Domain, Context, and Difficulty. Item rules is the reusable Blueprint slot × Item format × Primary Can-do combination and its central rules; Item setup adds Domain, Context, and Difficulty for one item. Use Item Bank with this capitalization, New items for the shared creation entry, Detailed rules for its disclosure, Item structure for content organization, and Valid item example / Invalid item example for examples. Task family and Scoring contract are distinct references. Do not label Blueprint slot as Exam task or bare Slot. Use the central Blueprint slot display name consistently, with legacy capability-title fallback.
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
- `POST /api/language-assessment/registry/drafts/{version_id}/validate` - Validate cross-Registry references and template coverage
- `GET /api/language-assessment/registry/drafts/{version_id}/impact` - Compare a draft with the active Registry
- `POST /api/language-assessment/registry/drafts/{version_id}/publish` - Publish and activate an immutable Registry version
- `GET|POST /api/language-items` - List items or create one from a required `blueprintSlotId` + allowed `itemFormatId` pair
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
