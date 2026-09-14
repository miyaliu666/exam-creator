# Changelog

## [Unreleased]

### Multilingual item creation and coverage

- use one shared set of Item rules, Can-do, Context, difficulty and scoring settings for Chinese, English and Spanish; select the assessed language in New items and each Coverage view
- keep language targets, item inventory and coverage suggestions within the selected language, and save each new item's language for generation, checks and review without rewriting legacy Chinese items or pinned Registry snapshots
- keep one shared rule set across the three content languages and validate target language through server and independent review checks; new settings use rule-level Context and assessment requirements

### Assessment Settings workflow cleanup

- audit the settings, language eligibility, generation and review relationships; replace outdated instructions with a concise guide to the current two-tab workflow
- consolidate shared-definition actions and repeated labels, distinguish per-rule Availability from publication, and use Apply to draft consistently for language-entry edits
- show the next global action for each state, keep successful validation in its confirmation, and provide a direct return to unapplied edits after switching views
- recover failed loads with an explicit retry and reset staged editors after confirmed draft reload/restart while preserving views during normal saves
- avoid locking an unchanged rule after editing a shared Can-do, and hide irrelevant assessment fields for excluded combinations while preserving authored values
- replace By Context and Assessment requirements with a direct View content path from Item rules to compatible content, including New entry and Import
- clear obsolete per-entry Context restrictions and per-combination assessment exceptions in new drafts and on draft save while preserving pinned historical snapshots

### English interface controls

- render import and spoken-response file pickers with English Choose file / No file selected text, preserving file filters, disabled states and repeat import selection
- remove the remaining mixed-language language-target search placeholder, translate reference link labels, and use English Workbench timestamps independently of the browser locale
- keep speaking-preview cue headings in the interface language and translate session errors and generated batch preparation guidance to English while preserving authored target-language content

### Multilingual language content

- make Meaning optional for English vocabulary imports and entry editing, including explicit update clears while blank updates preserve existing meanings
- browse Chinese, English and Spanish vocabulary and grammar with language totals, per-entry language labels, meanings/structures, example previews and readable entry details
- add explicit language to entry creation and Excel/Markdown/pasted imports, with original English and Spanish demonstration previews; retain staged import, save and publication protections
- keep legacy entries Chinese without rewriting snapshots, distinguish duplicates by language, and preserve stable entry languages

### Item rule identity migration

- remove Blueprint slot as an application entity and configuration dimension; use one `itemRuleId` across settings, item creation, saved drafts, generation jobs, coverage, validation, assembly and review
- give every historical format and Primary Can-do combination its own deterministic rule ID, preserving distinct task requirements, difficulty profiles and shared scoring contracts
- migrate saved browser plans and mutable database records through explicit legacy boundaries; keep original immutable review evidence verifiable and prevent uncertain generation calls from being replayed

### Release preparation

- deploy the validated image and a session-free application database snapshot to 8.210.43.194 with SSH key access, Docker Compose, IP HTTPS, HTTP Basic authentication and automated certificate renewal

- validate the current workspace with frontend, Rust and review-validator checks and a Linux release image; keep local exports and release artifacts out of Git
- point the main deployment guide to the existing Alibaba Cloud configuration and identify the missing configuration files in the alternative Railway notes

### Planning

- prepare the complete dev application for a public, always-running Railway Docker service with external MongoDB and existing GitHub user admission

- add independent answering before answer-revealed AI preliminary review, preserving human authorship and final review authority
- prepare the Workbench for version-aware assembly and pilot feedback before connecting legacy exam delivery; separate review approval, version use and record management
- restore the previously deferred Language coverage overview with full-directory denominators, saved assessment-target coverage, separate approved/unapproved inventory and item drilldown
- consolidate the two Language content discussions into a field and workflow audit, with browser import/update/export/publication verification, isolated backend diagnostics, and explicit gaps for duplicate enforcement, AI reference data and historical occurrence counting
- audit Language content field dependencies, duplicate identity, scope defaults, import parity and actual AI use; simplify the authoring surface and align its wording with the Item workbench
- simplify New items to one shared setup per new plan; create different configurations separately and retain saved multi-setup plans without losing their quantities, targets or retry identities
- audit project terminology across authoring, assessment rules, coverage, exam assembly, API feedback, and review summaries; record concept boundaries, inconsistent status and quantity labels, and proposed naming in local documentation
- turn Language content into a browsable vocabulary/grammar catalog with staged single-entry editing and one shared Excel, Markdown and pasted-table import workflow; keep new data inside versioned Assessment Settings drafts
- remove internal generation-job/item IDs from routine progress displays and use AI drafts for generated alternatives, reserving Candidate for exam takers
- clarify assessment targets, background material types, allocation labels, and the limits of automatic text-occurrence checks
- allow authors to select or enter the AI candidate quantity per item without the former batch/single-item caps
- support bulk Item bank management through visible owner-only selections and existing recoverable record-state actions, with explicit deletion confirmation and independent failure handling
- audit creation field meanings, target allocation, generation progress and recovery boundaries; record the detailed flow and verification status in local documentation
- audit Language coverage field meanings, inventory counts, query transitions, and creation handoff; keep the detailed rationale in local documentation
- record the accepted formal-exam purpose, four skills/activities/domains, free reference sources, one author role, and the implementation and validation plan for bulk authoring and language coverage
- consolidate the product proposal for batch item authoring, language coverage and intersections, evidence-backed assessment rules, originality review, and existing exam-assembly responsibilities; record open product decisions without implementation design

### Added

- add explicit shared-workspace deployment with automatic sessions for one configured existing author, no sign-in step, secure release cookies, and recovery that preserves mounted editors
- add an Alibaba Cloud deployment configuration with private authenticated MongoDB, bounded container memory, IP HTTPS, and local-data migration instructions; refresh one-time WebSocket tokens when reconnecting

- integrate all 60 Exercise Template source names and schemas, nested field editing, a searchable template library, and isolated interactive author previews with sanitized Markdown
- add Can-do × Exercise Template settings with Domain scope, optional Context restrictions, difficulty profiles, scoring and supplementary review criteria; preserve staged editing and versioned publication
- connect source-template author data, answer-safe candidate projections and AI generation/adoption to the item workflow while retaining legacy item configurations

- add Railway deployment configuration, release setup instructions and container build support for the current Node/Bun toolchain
- default to local Railway source uploads with an explicit build-input allowlist, avoiding the Railway GitHub App's bundled repository write permissions
- generate Prisma explicitly in CI and verify the complete container on dev pushes as well as main and manual runs
- validate session-bound GitHub OAuth state with expiry and replay protection, and apply HTTPS-safe session cookie settings in release builds
- allow release startup without optional Sentry configuration while retaining validation of supplied DSNs

- add a candidate-only independent answer stage to AI preliminary review, with immutable answers, alternatives, exact-text evidence and explicit media limitations; compare the saved observation with authored answers in a separate call, retain it on later failure, and expose it in the workbench and GitHub review report
- require the current two-stage review protocol for new submissions while retaining historical reports and existing deterministic, rule-based and human review gates
- add Context-based language eligibility editing with staged before/after previews, explicit all/selected/exclusion scopes, and safe removal of the last selected Context
- derive required review plans by default in new schema-version-2 settings; add editable supplementary rules, real-AI suggestions with per-rule adoption, source-change review and immutable per-check evidence/results that block submission when required criteria fail or lack evidence
- add optional source Level metadata to language content and selected-row bulk draft editing of level, mastery and applicability, with local generation of missing Chinese pinyin and stale-edit protection
- add immutable-version use states, append-only manual pilot summaries with explicit conclusions and timing definitions, and revision/idempotency protected history
- add a metadata-only assembly manifest for a selected frozen version, including current Workbench availability without answer keys or exam deployment
- add a default Coverage overview based on the complete language-content directory, with category/search-scoped totals, Chinese/English search, count sorting and direct approved/unapproved counts for every matching entry, retaining zero-item content
- add a searchable Language content table with mastery, Can-do and Context filters, entry details, single-entry creation, reusable import templates and filtered exports
- add Excel and Markdown file import plus editable pasted-table input with field mapping, per-row validation, explicit applicability, duplicate review and ID-based update previews
- add Item bank checkboxes, filtered select-all, selected counts, bulk archive/delete/restore, a recoverable-delete confirmation, and per-item failure feedback with failed selections retained for retry
- add durable bulk item generation with reusable task groups, fixed and rotating targets, pinned rules, idempotent child/run identities, pause/resume, bounded workers, and restart recovery without replaying uncertain model calls
- add language-coverage exploration by item dimensions, ALL/ANY/exact/excluded targets, disjoint intersections and item drilldown; explicit inventory goals can prepare compatible bulk plans while keeping approved, pending and unknown counts separate
- add append-only author observations and source/originality notes bound to reviewed content; confirmed coverage follows the exact approved content while legacy evidence remains unknown
- add a free reference-source directory in Assessment Settings, with purpose and reuse limits and no automatic corpus import
- add the Chinese A1 Language Exam Item Creator with seven item formats, 15 Blueprint slots, and 21 allowed slot/format combinations
- add versioned Assessment Settings for Blueprint, Can-do, Context, difficulty, language content, scoring, review, and delivery rules; each item pins its published Registry version
- add structured authoring, candidate-safe previews, deterministic validation, immutable item versions, and audit history
- add asynchronous AI candidate generation with offline mock, DeepSeek and OpenAI providers, generation-setup snapshots, bounded repair, and provider telemetry
- add Chinese-English target search and author/reviewer translations while keeping candidate-facing content separate
- add GitHub PR submission and review, pinned validation assets, merged-content revalidation, and signed-webhook synchronization with retries
- add review discussions, owner-controlled archive/delete/restore operations, and idempotent Staging export
- add frontend, Rust, and review-validator regression tests and CI checks
- document local startup, item creation, Assessment Settings, and review-repository setup

### Changed

- make existing Assessment Settings rules the clear editing entry: simplify default filters to search/Skill/Can-do, group shared definitions in a menu, replace detail navigation selectors with a fixed identity, expose Context scope edits, and keep save/use actions visible
- open rule details at the requested section, retain filters on return, and expose the three Language content views directly with their editing purpose

- present Assessment Settings Item rules as all matching Can-do × Blueprint slot × format × Context × single Domain × difficulty rows, with dependent filters and exact detail navigation; retain slot-specific task/scoring designs and show Context/Domain pairs in the editor
- replace inferred configuration-readiness messaging with specific repair issues, preserve backend-valid historical difficulty ranges, and explain shared difficulty scope and the central save/publication mapping workflow

- apply Overview setup filters to both the eligible language-content directory and its coverage totals; preserve eligible content with no items and explain incompatible setup combinations instead of leaving the full category count unchanged

- remove selectable catch-all rows from Workbench coverage, Item Bank and Assessment Settings filters; use an unset placeholder and individual clear actions while preserving unfiltered results and meaningful scope choices

- clarify Assessment Settings with a separate plain-text saved/unsaved status, Save changes only when needed, and Use for new items with an explicit confirmation; include unapplied dialog edits in the unsaved status and remove duplicate success notices

- present Coverage by item setup and Items as separate peer panels; keep Items expanded with its title, compact status selector and matched count on one row, without duplicate status labels
- compact the language-content import preview: place one Review rows action beside the fixed-footer warning, group selection with counts, and collapse completed input while keeping additional input and pending mapping accessible
- explain every disabled language-content import action beside its button; add a paginated review view for off-page errors and unconfirmed same-name rows, with explicit reversible exclusion and preserved unrelated confirmations
- simplify vocabulary imports to level, name and meaning with optional pinyin, recognize common Level/Translation headers, infer worksheet categories without extra columns, and keep scope fields optional behind expanded controls; use minimal Excel/Markdown templates while retaining full-field exports
- consolidate Assessment Settings into Item rules and Language content tabs, with combination details, difficulty, Context language content and review rules on one page and shared definitions in staged dialogs; retain overview filters, exact navigation and one Save draft / Publish workflow
- remove Reference sources, Change history and Published limitations from Assessment Settings UI, use Can-do statement, and stop fetching unused settings history while retaining existing reference, audit and limitation data and APIs; preserve old published review semantics
- rename the Language coverage overview metrics to With approved items, With unapproved items only and Without items; preserve their counts and percentages, row-level No items and qualified unknown-data labels
- remove the internal-name input and Options disclosure from New items; derive names automatically and show the required AI drafts per item control alongside the item quantity, retaining existing saved plan names and custom counts
- combine saved-content checks, independent AI preliminary review and PR creation into one Submit for review action; block serious AI findings and failed/stale/simulated reports, bind submissions to exact reports and revisions, and attach findings to PR bodies without approving human gates
- remove author evidence/source forms and optional AI feedback controls from the submission page; show actual check failures and disabled reasons, and preserve successful checks without resetting them during a no-change refresh
- make generated-item requirements read-only with an explicit repair path for missing or incompatible targets and information; remove prompt and history panels from the item workspace, and show version use only in Check & submit for approved versions or existing use records
- remove routine guidance from New items target fields, AI draft count, coverage suggestions and prompt preview; label the optional name as Internal name while preserving validation and generation controls
- restore pre-Workbench terminology, navigation and online-user displays in Exams, Attempts, Exam Metrics and User Management; restore the legacy generation source lookup and original user-route test layout, keeping Workbench features and required shared infrastructure
- protect existing mutable drafts from revision replacement, link pilot revise/retest conclusions to revision audit records, reset empirical observations for new drafts, and refresh editor content/revision after review synchronization
- start every Coverage visit and browser reload with Current Registry and the complete Overview; keep analysis only during the current visit, including view switches and drilldown returns, while Refresh preserves the current query and the separate New items suggestion handoff remains unchanged
- keep Overview and Find items Registry versions and More filters independent; direct view switches restore each view's own defaults or analysis, edits and resets affect only the current view, and only explicit Overview count drilldown copies its scope into a new Find items query
- group Coverage results jointly by all six Item setup fields with approved/unapproved counts aggregated across the full query; setup-count drilldown preserves language matching and opens the item list, while Back to item setups restores the query and both goal inputs
- restrict Coverage planning to a setup row's Set goal, separating Desired approved item count, Approved item shortfall and an explicit New items to plan quantity of 1–50 bounded by the shortfall; let authors inspect unapproved items without automatically subtracting them or treating the full shortfall as a generation quantity
- label the Coverage suggestion handoff quantity New items planned instead of presenting it as the full approved-item gap
- retain both Coverage setup-goal inputs through view and item-status switches, pagination and failed-query retries; Refresh refetches all active Coverage queries for the account, including the open row goal
- show one zero-count Coverage setup row only when all six selected fields are compatible and the API explicitly returns empty setup counts; missing statistics, incomplete and incompatible setups never imply zero coverage
- simplify Coverage to saved assessment targets and Approved items / Unapproved items, including all unapproved lifecycle states; remove Count by, confirmation displays, supporting-material options, repeated category summaries and the generic creation shortcut, retaining explicit Item count goal planning through the existing New items handoff
- unify Coverage terminology as Language content and show Total with three disjoint counts and percentages in one overview box: Has approved items, Unapproved items only and No items; scope all metrics to Category and Search together, retain both row-level item counts, remove in Assessment Settings from labels and keep numeric pagination
- organize Coverage as view navigation, overview metrics, one Filters section with Category, Search, More filters and Reset, then Coverage by language content with sorting; remove the full-inventory summary line and keep all content metrics scoped to the filters without removing zero-item content
- retain Coverage filters and recovery actions during loading and failed queries, keep active target combinations and their clear action in Filters, retain row-goal inputs for recovery, and qualify zero/only-unapproved classifications when target records are actually unknown
- show Coverage availability directly in two count columns without an Item availability filter or status column; use Clear search and remove fixed teaching text, duplicate counts, active-filter badges and summaries while exposing selected filters in the controls
- simplify Language content to direct scope selection, category/name search and optional More filters; move reference fields under Details, use Meaning / Structure / English meaning consistently, and remove redundant import controls and tutorial text
- default new language-content scopes to Not restricted, including blank import scopes; retain existing settings on read and preserve blank update semantics
- unify Workbench author-facing terminology around Item, Item Bank, Item rules and Item setup; align AI feedback, manual authoring, setup-group errors and current operation guides while preserving data and API names and the legacy modules' labels
- share item lifecycle labels across the bank, editor and coverage results, distinguish review blockers and rejection from GitHub-specific causes, and label coverage selections and results as language targets and assessment targets
- resolve GitHub review titles and Blueprint slot/Can-do names from the submitted version's pinned Registry, with legacy name fallbacks
- remove Add another setup from New items; coverage suggestions apply to the current setup after explicit confirmation instead of appending a group, while saved multi-setup plans and historical generation jobs remain supported
- preserve language-content meanings, grammar patterns, pinyin, English glosses, examples, restrictions, sources, notes and additional metadata in settings snapshots; enrich new settings drafts from matching bundled source entries without changing published snapshots
- remove visible batch and item IDs from Generation jobs while retaining names, creation times, item numbers and navigation; rename AI-generation candidates to AI drafts across creation, progress, Prepare and generation history, including saved generation feedback
- remove the unnecessary planned-assessment-target explanation from Language coverage
- clarify single-item, shared and distributed target labels and saved-target coverage; add selection-category filters that preserve selections and query meaning, and separate grammar/pragmatics review from vocabulary/character text-occurrence checks
- share an editable candidate-count dropdown across New items and individual regeneration; accept positive whole-number quantities, preserve custom saved counts, and remove backend truncation while bounding concurrent provider calls
- lead Find items with Coverage by item setup and replace separate attribute breakdowns; place Item status and Target combinations inside item details, preserve goals and combinations when changing status, and remove the global inventory-goal entry
- make Item bank the Workbench home, with item browsing and filters; move Generation jobs and Language coverage to independent pages
- unify New item and Bulk create into New items: shared six-field setup, quantity defaulting to one, language targets, and Generate 1 item / Generate N items; preserve saved plans and pass coverage suggestions to the creation page within the browser session
- keep creation focused on setup, quantity and targets; move the optional name and candidates per item into Options and derive blank names from Blueprint slots
- label additional targets Different targets for different items and add Preview each item's targets using the existing per-item allocation algorithm
- offer Write manually for one-item plans, save selected targets and open Edit & preview directly, and permit an empty manual draft while retaining generation and submission requirements
- distinguish generation jobs by name and creation time; show shared setup and required targets once per group, with per-item numbers, additional targets and generation state; remove repeated quantity and selection instructions
- retain the newest completed generation job with expanded results, and prioritize saved candidates while keeping requirement editing and regeneration in disclosures
- enrich new single-select Staging exports with skill, activity, Can-do, format and language-target tags for the existing Exam Creator tag-quota assembly logic
- organize authoring as Prepare → Edit & preview → Check & submit, with autosave, unsaved-change protection, and current validation required for submission
- use one authenticated Workbench role while retaining draft ownership checks
- apply staged Domain, Context, and Difficulty corrections through Edit item setup, preserving authored content and requiring explicit conflict repair
- simplify Assessment Settings with named configurations, searchable selections, fixed A1 difficulty tabs, and explicit publication
- lock scoring policy and complete difficulty schemes to the item's pinned Registry version
- use English Workbench controls and Chinese candidate content, with shared field labels and readable rule names
- use one fixed editor and candidate renderer per item format; remove the separate R-A1-1 Assemble workflow
- serve frontend development on IPv4 loopback port 8001 and align development configuration
- use repository-local Prisma schemas and a consistent Debian base for Docker builds
- keep development process reports local while retaining operational guides

### Fixed

- show one Context or Can-do identity control in Assessment Settings, with explicit Rename / Edit statement actions and direct name entry for new definitions; keep required dropdown prompts hidden and unselectable while preserving meaningful filter choices and incomplete saved values
- prevent Add Context and Add Can-do statement from crashing their staged editor by keeping their Immer updates mutation-only
- detect same-category names before adding language content, including bundled display aliases; block exact new duplicates, require confirmation for distinct meanings, retain editing of legacy duplicates and invalidate confirmations when the compared content changes
- exclude local-only docs from Vite file watching so locked temporary backend executables do not crash the frontend preview
- preserve custom candidate quantities on blur and refresh; stop unsent candidate calls when a batch is paused, retain available results as explicit partial work, and report result-persistence failures as terminal failures instead of leaving runs active
- keep local startup on automatic Local User sign-in, show retryable connection errors when the backend is unavailable, and isolate the shared query client from route initialization so the home page loads without circular-import errors
- release Item bank action buttons after record-state requests settle and prevent overlapping row/bulk changes
- align client information-point validation messages with server wording so the same issue is not displayed twice
- display Generating when a queued job already has a running child, without presenting generation completion as review approval
- reset coverage goals when query meaning changes, apply exclusions before intersection counts and drilldown, validate compatible task setup and target limits before planning new items, and clear a coverage suggestion when its setup is canceled
- retain an account-scoped browser-session recovery record after manual creation returns an item ID, so a failed target save can reuse the same draft on retry after refresh or returning to New items; expose Open unfinished draft
- resolve Generation jobs `batchId` direct links by separately fetching requested jobs outside the latest 100, preserving their progress polling and showing explicit loading errors with retry
- explicitly select non-strict OpenAI JSON Schema output for pinned schemas with optional fields and dynamic answer maps, preventing provider-side `invalid_json_schema` errors while retaining application validation
- publish batch item links only after the queued AI run is durable, and allow Continue to recover failed creation steps only when no prior AI run exists
- wait for AI run history before enabling generation, recheck active runs before creating more candidates, and expose a retry when history cannot load
- document recovery from inherited agent-shell network restrictions by restarting the backend in a network-enabled environment, and distinguish unauthenticated API connectivity checks from successful AI generation
- prevent stale Registry publication, silent rule normalization, and overwriting newer drafts during GitHub synchronization
- reject invalid content bindings, candidate-private metadata, stale AI adoption, and incompatible difficulty configurations
- preserve original submission snapshots, pinned legacy validation behavior, and locked scoring during generation and review
- honor session expiry, handle unauthenticated responses, and retain local mock-login cookies on the current host
- avoid no-op draft revisions in React Strict Mode and ignore locked Rust build files in Vite's Windows watcher

### TODO

- Add React error boundaries at appropriate component levels to catch and handle component errors gracefully
- moderations
  - filter by user id
  - find by attempt id
  - find by moderation id
  - filter by exam id
  - view of whether or not moderation record has been handled (challengesAwarded)
  - ability to set as "pending" again
    - probably not possible, because of async services
- change users editing to not timeout
  - consider using actions (e.g. mouse/keyboard events) to continue sessions
- client: add keyboard shortcuts to toggle attempt moderation stats
- events
  - captions opened
    - vertical lines overlayed on answer graph
- client: show all events on graph

## [6.9.0] - 2026-08-04

### Added

- add deduplicate user page and rest

### Fixed

- client: fetch mock type error

## [6.8.0] - 2026-08-03

### Added

- client: add moderation score

## [6.7.3] - 2026-07-22

### Fixed

- add sentry metric for attempt moderation time

## [6.7.2] - 2026-07-17

### Fixed

- server: add sentry metrics

## [6.7.1] - 2026-07-16

### Fixed

- server: no sentry error on unauthorized user login attempt

### Internal

- server: add sentry request/response tracing per request

## [6.7.0] - 2026-07-16

### Added

- client: adjust edit-attempt stats to prioritize useful data
- client: add median, refactor stats for edit-attempt

### Fixed

- client: improve edit-attempt chart visuals

## [6.6.0] - 2026-07-11

### Added

- client: add y-axis zoom to attempt moderation

### Fixed

- client: reduce opacity of focus edges

### Internal

- .github: fix version bump types
- .github: add internal changelog header
- add mock data

## [6.5.2] - 2026-07-10

### Changed

- remove websocket request info log
- add roadmap + changelog auto

### Fixed

- keep delete-undo toast alive across navigation and drop post-delete 404s
  - Pending-delete state moves to module scope so the countdown toast survives leaving the page. After the grace period, caches referencing the deleted attempt/moderation are purged and stale lists filtered, and the server treats cancel/already-deleted as no-ops instead of 404/errors.
- remove question tooltip

## [6.5.0] - 2026-07-09

### Added

- client: many more attempt analytics graphs

## [6.4.0] - 2026-07-09

### Added

- client: zoom brush to attempt analytics graph

## [6.3.0] - 2026-07-09

### Added

- remove attempt and moderation record
  - client: delete attempt + moderation from user page with 10s undo window
  - server: `DELETE /api/attempts/{attempt_id}` (removes attempt and its moderation)
- search by user (email, id, or username)
- user management page (`/users`): get all attempts and moderations for a user by user id, attempt id, moderation id, username, or email
- client: "Manage User" button on edit attempt page (navigates to `/users` by attempt id)
- client: toaster provider

### Changed

- client: persist attempts filter and sort in URL search params
- client: sync users page search from URL params
- client: `Header` uses provided `description` prop

### Fixed

- client: card title truncation with ellipsis
- server: correct error message for non-existent generated exam

### Removed

- server: `GET /api/prisma/users/{user_id}`

## [6.2.1] - 2026-07-07

### Fixed

- client: reconnect websockets on backoff
- client: wrap dialog content in positioner provider

## [6.2.0] - 2026-05-13

### Added

- cumulative line graph
- attempt metrics scaffold

## [6.1.0] - 2026-03-20

### Added

- unfocussed time before last submission
- moderation status + feedback to attempts view

## [6.0.1] - 2026-02-09

### Fixed

- server: add moderation date for manually moderated attempts

## [6.0.0] - 2026-02-05

### Changed

- client: migrated to ChakraUI v3

### Fixed

- server: sort events by timestamp

### Chore

- update docr cleanup action

## [5.2.0] - 2026-01-29

### Added

- client: focus time popover
- client: vertically sizable attempt chart

## [5.1.2] - 2026-01-28

### Fixed

- client: attempt chart tooltip

## [5.1.1] - 2026-01-28

### Fixed

- client: keyboard shortcuts correctly initialised
- client: navigate to next attempt after moderation

## [5.1.0] - 2026-01-22

### Added

- client: sort order for moderations
- server: moderations sort by submission time
- client: attempt events
- server: supabase connection with attempts
- events
  - question navigation
    - when a question is visited on new graph
  - application focus
    - blur/focus as vertical lines overlayed on answer graph

### Fixed

- client: deserialization accounting for nested objects

## [5.0.1] - 2025-12-20

### Fixed

- client: generation question frequency ignore deprecated
- client: add attempt id to stats cache key

## [5.0.0] - 2025-12-19

### Changed

- client: handle deprecated generations

### Added

- client: sort attempt question submissions by time
- client: toggle to show question submission time diff
- client: toggle to show question submission frequency curve
- client: collapsible exam config view

## [4.2.0] - 2025-12-18

### Added

- client: enabled exam note to be multi-line

## [4.1.0] - 2025-12-18

### Added

- client: moderation feedback on edit attempt page

## [4.0.0] - 2025-12-17

### Changed

- server: adjust generation algorithm to handle sets with more than enough questions
  - for question sets with more than enough questions, without help from a tag config, the algorithm got stuck in a loop
- client: size of margin in exam edit

## [3.15.0] - 2025-12-12

### Added

- client: human-readable time to attempt moderations

### Changed

- client: normalize difficulty calculation

## [3.14.0] - 2025-12-11

### Added

- client: attempt start time
- client: number of total attempts by user
- server: `/api/attempts/user/{user_id}/count`

## [3.13.1] - 2025-12-09

### Fixed

- client: correct question determination uses generation

## [3.13.0] - 2025-12-05

### Added

- exam metrics sort questions by difficulty, time spent, % correct, and how many submitted the question
- question difficulty by time spent on question and correctness

### Fixed

- server: only show exam metrics for attempts that have moderations

## [3.12.1] - 2025-12-04

### Fixed

- server: stop sending invalid config errors to sentry

## [3.12.0] - 2025-12-03

### Added

- server: answer text not empty validation
- client: previous user attempt stats in moderation view

### Refactored

- client: increase widths on large screens

## [3.11.0] - 2025-11-28

### Added

- client: filter in exam metrics to remove _poor_ attempts
- client: normal distribution curve

## [3.10.1] - 2025-11-28

### Fixed

- server: recalculate tag config solutions in cases where one question resolves multiple configs
- server: only store attempt sample cache for 2 hours

## [3.10.0] - 2025-11-27

### Added

- add exam attempt moderation stats to landing

## [3.9.0] - 2025-11-26

### Added

- client: add distribution curve to exam metrics for time to complete

### Chore

- add gha release

## [3.8.0] - 2025-11-26

### Added

- client: navigate to next attempt on moderation
- client: add shortcut keys for moderation actions

### Fixed

- client: infinite scroll `hasNextPage` logic

## [3.7.0] - 2025-11-25

### Added

- Add exam metrics:
  - How many times a question is incorrectly answered
  - Average time taken to complete
  - Average time per question

### Chore

- update deps

## [3.6.0] - 2025-11-25

### Added

- Add infinite scroll to attempts/moderation page
- client: add human-readable time for attempts
- client: add average time per question

## [3.5.1] - 2025-11-24

### Fixed

- client: cache attempt by id queries, and render as loaded

## [3.5.0] - 2025-11-24

### Added

- server: sentry integration for traces

### Fixed

- client: for multi-fetch queries, only show error for failed fetch

## [3.4.0] - 2025-11-14

### Added

- client: `exam.config.passingPercent` input field

## [3.3.0] - 2025-11-07

### Fixed

- on page refresh, remain on same page instead of redirecting to `/`
- client: show loader on protected routes while auth is being checked

### Added

- dev: ability to signup and login as multiple users

### Changed

- renamed `moderations/` route to `attempts/`

## [3.2.0] - 2025-10-30

### Refactor

- client: use `window.setTimeout` instead of `setTimeout` for correct type in browser
- server: add docs for env vars
- server: log error for mock auth user insertion

### Fixed

- server: use request timeout, set to `11s` to account for generation stream of `10s`

### Chore

- use bookworm image for GH CI build and release

## [3.1.0] - 2025-10-24

### Chore

- use bun image instead of node

### Added

- server: on save exam, call endpoint to validate exam config
- client: if generation fails (timesout without any generations), show error messages
- server: stream all generation error messages to client

## [3.0.0] - 2025-10-23

### Added

- client: generations info with improved cache refetching

### React Compiler

- use `babel-plugin-react-compiler` for auto memoization of components

### Generation Variability

- Variability
  - difference in number / total
- How to handle comparisons between 2+ generations
  - [x] How common is a question (e.g. in 10% of generations)
  - [x] Maximum question variability and minimum question variability
  - [x] Maximum answer variability and minimum answer variability
- Show variability in Exam Page
- [x] highlight sets/questions/answers that are not in any generations

For the sets A and B, the variability is the ratio of the size of the symmetric difference to the size of the union:

$$
\text{variability} = \frac{|A \Delta B|}{|A \cup B|} = \frac{|A - B| + |B - A|}{|A \cup B|}
$$

> NOTE:
> Generations have to be the same size.

### Changed

- client: move generation button to within exam edit page

### Fixed

- client: stop refetching queries on window focus

## [2.3.0] - 2025-10-18

### Added

- server: timeout for exam generations of 10s
- client: inform user of generation timeout

## [2.2.0] - 2025-10-16

### Refactored

- remove deprecated database fields now that migration has been run

### Added

- client: staging and production generate options
- server: `PUT /api/generations/exams/{exam_id}/staging`
- server: `PUT /api/generations/exams/{exam_id}/production`

### Removed

- server: `PUT /api/exams/{exam_id}/generate`

## [2.1.0] - 2025-10-15

### Changed (non-breaking)

- client: remove odd prismjs languages for list of 58
- client: use Rolldown bundler version of Vitejs
- client: use advanced bundling options for smaller chunks

### Added

- client: generate exams button
- server: `POST /api/exams/{exam_id}/generate`
  - body: `{ count: u16 }`

### Fixed

- client: split `UsersWebSocketContext` into `UsersWebSocketUsersContext` and `UsersWebSocketActivityContext` to prevent unnecessary page re-renders on user presence updates. Pages that only send activity updates (e.g., edit views) now subscribe only to the activity context.

### Dev

- replace `vite` rollup with rolldown version

## [2.0.5] - 2025-10-06

### Fixed

- client: only parse ISO 8601 strings to Date in `_recursiveDeserialize`

## [2.0.4] - 2025-10-04

### Fixed

- server: fix prisma deserialization ident name `ExamEnvironmentExamConfig` -> `ExamEnvironmentConfig`

## [2.0.3] - 2025-10-04

### Fixed

- server: handle `f64` in `ExamEnvironmentExamConfig`

## [2.0.2] - 2025-10-04

### Fixed

- server: deserialize `ExamCreatorExam` from BSON document manually in try_into

## [2.0.1] - 2025-10-04

### Fixed

- server: deserialize `ExamCreatorExam` from BSON document

## [2.0.0] - 2025-10-04

### Added

- server: `PUT /api/exams/{exam_id}/seed/production`
- client: seed exam to production modal and button
- client: exam seed location badges
- server: `GET /api/exams`
  - `{ exam: ExamCreatorExam, databaseEnvironments: ("Staging" | "Production")[] }[]`
- client: attempt moderation approve/deny
- client: tooltips for more information
- server: `PATCH /api/attempts/{attempt_id}/moderation`
  - body: `{ attemptId: string, status: "Approved" | "Denied" }`
- client: filter moderation records by status

### Fixed

- i64 vs f64 vs Int / Int64 / Double
- server: attempt construction `id` from `examId` to `attemptId`
- client: total number of exam questions calculation
- server: deserialization of `startTimeInMS` and `submissionTimeInMS` to f64

### Changed

- use `DateTime` fields
- use `totalTimeInS` and `retakeTimeInS`
- client: remove database status component from unrelated pages

## [1.5.0] - 2025-09-23

### Added

- client: exam name and passing percent to moderation card
- client: sql syntax highlighting
  - Enable all languages

## [1.4.1] - 2025-09-22

### Fixed

- server: database environment can be unset

## [1.4.0] - 2025-09-22

### Added

- client: database environment setting
- server: `PUT /api/users/session/settings`

### Fixed

- client: toast when exam is saved to temp collection

## [1.3.1] - 2025-09-21

### Fixed

- server: seed exam challenge map to staging

## [1.3.0] - 2025-09-21

### Added

- client: seed exams to staging and production db
- server: `PUT /api/exams/{exam_id}/seed/staging`

## [1.2.0] - 2025-09-20

### Added

- client: attempt moderation viewing
- server: `GET /api/attempts`

## [1.1.0] - 2025-09-19

### Added

- server: `GET|PUT /api/exam-challenges/{exam_id}`
- client: exam-challenge map input fields

### Refactored

- server: split into modules (9861dcc)

## [1.0.0] - 2025-08-08

### Added

- client: question number table (06161d4)
- export & selection for exams (feat 0.8.0 -> carried forward)

### Fixed

- client: prevent deprecated badge from overflowing card (2725c6c)
- client: adjust prism imports to use script (e153c24)

### Changed

- Dependencies updated for 1.0.0 release (27b4616)

## [0.8.0] - 2025-07-25

### Added

- exam selection and export (9efb889)

### Fixed

- github info name optional (0.7.2 -> see below) ensured forward compatibility

### Breaking Changes

None new in this version (see 0.7.x).

## [0.7.2] - 2025-07-24

### Fixed

- allow github info name to be optional (ee9c8c3)

### Breaking Changes

None in this patch release.

## [0.7.0 - 0.7.1]\* - 2025-07-01 to 2025-07-23

(\*Exact sub-version tags not recorded in commit messages; grouped for clarity.)

### Added

- attempt moderation workflow (fc3c0fa, b9bc1fb)
- client: prerequisites input (b53e9aa)
- client: deprecated controls (3e8681a)
- client: improved audio controls (bd0a287)
- server: structured error handling with `thiserror`, timeout & body size limits (4af6043)

### Fixed

- server: 404 route handling (e912c24)
- client: content overflow issues (878d2fe)
- client: logout flow (df9ddf0)
- client: add content type header (7055561)
- server: improve checks & handle SIGINT, CORS (98bb8f8)

### Breaking Changes

- server: session `expires_at` type adjusted for DB TTL (00c7a46)
- auth: addressed auth errors (6b1d134)
- prerequisites: deserialization added; new errors; prisma update (7b438e1)

### Developer Experience / Chore

- remove unused code (a281e33)
- exams projection & improved logs (569cac1)
- env var messaging improvements (641e6b2)
- mock auth improvements & parity (df8235a, 9852959)
- additional logging (6c4782c, b0d5871, 59afb01)
- add more docs (468a65c)
- CI / GitHub workflow tweaks (79dfebe)
- container image & build tweaks (4713a42, 716fae0, e519ed4, b14c4ec, 64804b6, c02ced9)
- CORS simplification & sample.env fix (4200d12)
- image cleanup automation (189cf6c)

### Initial

- Minimum viable product commit (1fd231d)
