# Changelog

## [Unreleased]

- render shipped legacy Registry names and rule descriptions in English throughout Assessment Settings without rewriting saved versions or Chinese vocabulary; preserve unchanged list fields on focus/blur
- require proactive builds and running-page verification after code updates
- remove online-user initial avatars from headers, dashboard cards, exam cards, and moderation views
- automatically enter the app with the local Workbench identity when debug mock authentication is enabled, while preserving production authentication

### Added

- add a versioned Assessment Settings backend for draft, validation, impact analysis, immutable publication, audit, and runtime loading of Blueprint, Can-do, Domain/Context, difficulty, content, scoring, schema, review, and delivery rules
- add durable asynchronous AI candidate runs with idempotency keys, independent per-candidate provider calls, one deterministic-error repair pass, partial-success tracking, restart recovery, and client polling
- add publication validation for all seven classified Exercise Template schemas and complete Slot × Domain × Context coverage; add the missing `S-A1-2 × Educational → D16` mapping in the provisional Registry
- relocate versioned Workbench registries and compile-time contracts under `language-item-workbench/`; keep planning and software documentation local-only
- rename the product-facing workbench title to `Language Exam Item Creator`
- add Language Exam Item Creator software requirements, architecture, implementation plan, and strict TaskPackage contract
- add registry-backed `R-A1-1` single-select authoring, revision-safe autosave, constraint validation, safe candidate preview, locked immutable versions, content hashes, and revision workflow
- add deterministic provider-neutral AI candidate generation/adoption plus independent Draft/Version AI review with versioned prompts and output schemas
- add review queue and append-only human gates with four decisions, field/rule references, and `ApprovedForExport` lifecycle
- add compensating, idempotent Staging export to canonical handoff plus legacy Exam Creator/Environment collections, including source-to-legacy ID mappings and generator smoke coverage
- add Workbench database indexes, API routes, dashboard entry, item list, editor, registry guidance, audit history, and export history UI
- add MVP acceptance report and exercise-template clean-room adoption record
- add Phase 2B immutable TaskPackage version diffs, reviewer Before/After UI, and candidate renderer registry dispatch for editor and AI previews
- add Phase 2C task-oriented Chinese Workbench navigation, workflow sections, human-readable registry labels, and bounded content search
- add optional Phase 2D DeepSeek and OpenAI Responses API providers with structured outputs, server-only credentials, deterministic revalidation, failure runs, and offline mock fallback
- add Phase 2E local test identities, visible current identity, and per-gate latest-actor attribution
- add platform-native review discussions with replies, addressed/resolved/reopened states, reviewer confirmation, audit events, and unresolved change-request export blocking
- add private GitHub review-repository integration with atomic item batches, pull-request creation, review-state synchronization, merged-content revalidation/import, and audit links
- add all seven registered Chinese A1 Item Formats across creation, authoring, candidate preview, deterministic validation, mock/DeepSeek generation, freezing, GitHub review, and Workbench Staging export
- add a dependency-free GitHub Action template that validates item identities, format structure, scoring separation, and review manifests
- add Slot-first creation for all 15 A1 Blueprint Slots and all 21 allowed Slot/Item-Format combinations, with server-locked Can-do, renderer, scoring, delivery, domain and context contracts
- add author-visible scoring contracts in both authoring stages, including policy explanations, immutable/editable separation, task-specific criteria, rubric, version, and current item scoring coverage
- add complete author-facing capability briefs with all communicative activities, supporting Can-dos, evidence, A1 boundaries, Task Family behavior, delivery rules, prohibitions, and valid/invalid reference tasks
- add deterministic information-point suggestions plus server-confirmed Candidate Preview round trips and field-level validation feedback
- add a single fixed Item-Format template registry that binds all seven authoring editors and candidate-safe renderers while retaining the complete Workbench TaskPackage contract
- add structured information points with type and scoring-point linkage, separate supporting-content references, and author-editable item scoring points with automatic total-score calculation
- add owner-controlled active, archived, and recoverable deleted item states with audit history, Workbench filters, restore actions, and exclusion from review queues
- add signed GitHub pull-request webhooks with durable delivery records and idempotent automatic merge synchronization, while retaining manual PR sync as a recovery path
- add Registry audit-history APIs/UI, unsaved-change protection, and add/retire/delete controls for central Blueprint, Can-do, and Context rules
- add pull-request CI for frontend type/build checks and Rust formatting, checking, and tests

### Changed

- remove Rule version and Version label from Assessment Settings; manage bounded version identifiers internally while retaining validation, impact review, and immutable publication
- configure Slot × Item Format × exactly one Primary Can-do using business names, derived skill/activity, extensible domain-scoped contexts, and three complete per-configuration A1 difficulty profiles
- limit New item to six creation criteria, preserve unfinished selections for the browser session, prevent outside-click dismissal, and open created drafts directly in Edit & Preview with a single criteria summary
- protect unsaved Assessment Settings changes across navigation, refresh, sign-out, and background data refetches
- keep Assessment Settings beside `+ New item` inside `/language-items`, show business names instead of internal Registry IDs, and replace raw Registry JSON editing with structured fields
- remove the R-A1-1 Assemble workflow feature, its client UI/API, server routes, persistence bindings, and legacy assembly adapter; complete-exam composition remains outside Language Exam Item Creator
- limit free-text item search to title and Item ID while fixed categories remain explicit dropdown filters
- use one authenticated Workbench role across central-rule maintenance, item creation, AI generation, editing, validation, and review; remove the application-level prohibition on reviewing or opening change requests for one's own item
- make the active published Registry the source for new items while preserving each item's pinned Registry version for validation, AI generation, review gates, and export
- make AI generation the primary queued workflow and keep manual item entry as a fallback; AI remains limited to candidate content and answer proposals while people select, edit, validate, review, publish, and export
- make validated drafts directly submittable to GitHub review, keep editing and AI regeneration available until PR creation succeeds, and lock only after successful PR creation
- use the item title plus English capability/checklist context in review PRs; import merged GitHub edits back into the same logical item/current version while Git commits preserve the original submission snapshot
- use English-only Workbench chrome, generated draft titles, and pull-request metadata; replace Slot, Can-do, and Item Format codes with business names in reviewer-facing PR summaries while retaining canonical codes inside machine-validated item files
- treat the checked-in exercise-template catalog as the primary question-structure source through TaskPackage adapters, remove parallel `TPL-A1-*` identities, and add form-entry and spoken-multiturn template coverage
- simplify authoring pages and the item list by hiding internal readiness/delivery labels and low-value operational metadata; keep capability details in a disclosure and low-frequency item actions in a menu
- make language-content choices depend on Slot, Can-do, skill, mastery scope, format, and context, and add candidate-text coverage hints
- replace editable per-item scoring policy with a concise author-visible answer/scoring summary; scoring points, totals, normalization, rubrics, and benchmark references are regenerated from the locked registry contract on save and AI adoption

- use repository-local Prisma schemas for reproducible Rust type generation
- allow Staging generation to load Staging-only Workbench smoke exams while preserving production fallback for existing exams
- keep mock GitHub authentication on the current localhost/127.0.0.1 host so development cookies are not lost across hostnames
- show the active AI provider truthfully inside the editor and use Chinese copy in candidate previews
- make constraint selection followed by AI generation the primary authoring path, with manual authoring as a fallback
- expose vocabulary, grammar, character, and pragmatic targets as category-based selectors and send their human-readable registry entries plus the full difficulty profile to the AI provider
- default new single-select items to a fixed reviewed option order; shuffled orders now produce a validation warning
- use DeepSeek Chat Completions JSON mode with non-thinking structured requests, schema-shaped examples, and one automatic retry for empty JSON responses; return actionable connection, timeout, and provider errors without exposing credentials
- validate AI authoring settings before a paid request; cascade domain-to-context choices and filter/count vocabulary, grammar, character, and pragmatic targets by context
- replace item-card grids with a searchable table; separate content lifecycle labels from Staging delivery and add explicit revision, blocked, rejected, and approved states
- make GitHub pull requests the configured human-review surface; keep legacy in-platform review APIs only as a fallback when GitHub review is disabled
- treat Workbench Staging export as the canonical handoff for every format; create legacy Exam Environment records only when a lossless single-select adapter exists
- persist GitHub synchronization failures as a blocked lifecycle state, skip completed batches during bulk sync, and allow merged items to begin a fresh auditable revision
- import reviewer-edited merged content into a new immutable approved version instead of rewriting the submitted snapshot, and refuse to overwrite a newer Draft
- replace the type-first new-item menu with an explicit Blueprint task selector, no default task, task-scoped formats, human-readable locked capability details, and cascading domain/context choices
- derive and validate delivery policy from the final Slot × Item Format capability, so matching and selection items do not inherit restricted-input policies from another format in the same Slot
- filter authoring content by Can-do, supporting Can-dos, receptive/productive mastery scope, and context on both client and server; send the complete capability and scoring Task Brief to real AI providers
- separate the four skill headings from Blueprint selection as explicit browse filters, show capability/scoring context before creation, and reapply locked Registry fields when saving legacy drafts
- render language-content candidates and selected targets as responsive full-width grids instead of a narrow single column
- tolerate a newly built Workbench client connecting temporarily to an older Registry snapshot, and ignore locked Rust targets in the Vite watcher on Windows
- show independent authoring, Staging-package, and formal-renderer readiness instead of collapsing them into one implementation badge
- add per-format array reordering and synchronize matching, restricted-input, and form response units with their item scoring points
- streamline Workbench authoring with decision-first creation, compact capability and language-content guidance, and progressive disclosure for fixed scoring, delivery, readiness, reference, and technical metadata
- simplify the Workbench header and item table by hiding the presence avatar, removing the updated timestamp, exposing archive and delete as separate action columns, and placing PR links below status badges
- start new items with an empty title and show the authoring/history guidance inside the title input as its placeholder

### Fixed

- reject unknown explicit Primary Can-do selections instead of silently falling back; validate active compatible contexts, complete difficulty bands and ranges, and readable registry names; compare publication impact by Slot × Format × Primary Can-do
- standardize English Workbench copy, punctuation, date formatting, terminology, and singular/plural forms; translate Registry labels and rules, legacy published snapshots, user-visible validation, and AI-provider errors while preserving Chinese learning content

- remove the remaining internal Workbench name from user-facing loading and local sign-in copy
- honor `SESSION_TTL_IN_S` for inactivity expiry, allow the development `sid` cookie over local HTTP, clear authentication on 401, and replace raw `no sid in jar` failures with an explicit Chinese re-login path
- prevent incomplete legacy scoring packages and AI candidate adoption from bypassing item-level scoring initialization and response-unit coverage validation
- merge real-provider answer proposals into the existing item scoring package so AI generation cannot erase the fixed scoring contract, rubric, benchmark, item-level scoring metadata, or author criteria
- prevent React Strict Mode from creating a no-op draft revision when an author only opens an item, and avoid empty avatar image URLs in local test identities

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
