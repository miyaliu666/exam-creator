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
- Language Exam Item Creator with integrated versioned Assessment Settings, seven registered task formats, AI-first candidate generation, deterministic validation, human review, and idempotent Staging export

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
- Workbench canonical data uses dedicated collections in the Staging MongoDB database and is independent of the user's database-environment setting
- The Workbench has one authenticated user role. Central-rule maintenance, item setup, AI generation, editing, validation, and review are workflow operations rather than separate author/assessment-admin roles; record ownership still protects mutable drafts from unrelated users.
- Central Blueprint, Can-do, Domain/Context, A1 difficulty, language-content, scoring, schema, review, and delivery rules are maintained on the independent `/language-items/assessment-settings` page, opened beside New item in the Item Bank. The toolbar exposes status, Save draft, and Publish only; publication automatically validates and requires confirmation. Drafts must validate before publication, published versions are immutable, and every new item pins the active version.
- Settings separates Task configuration from reusable Rule libraries. The task fields and fixed Lower/Typical/Upper A1 tabs share one Slot × Item Format × Primary Can-do selection. Compact searchable multi-selects show selected values; detailed task/delivery rules are disclosures. Navigating to Context management preserves the selected task configuration, and hiding inapplicable controls must not silently rewrite saved rules.
- Difficulty editing uses one value for Input length, Information points, Contextual support, and conditional Distractor similarity (Single select/Matching); explicit edits set matching defaults and singleton ranges and regenerate the description from the current structured defaults, while saved ranges, descriptions, and independence remain unchanged on read, with repair controls for invalid legacy values and no routine Definition or Independence editor.
- Assessment Settings manages version identifiers internally and displays named rules. Configurations bind Slot × Item Format × exactly one Primary Can-do, derive skill/activity, allow centrally maintained active Contexts, and require Lower/Typical/Upper A1 profiles. New-item selections survive dismissal and refresh within the browser session; the dialog has six criteria and no Blueprint slot search. Creation opens Prepare (language targets and key information → generate drafts or write manually), followed by Edit & preview and Check & submit. Changes autosave; unsaved navigation/sign-out/refresh are guarded, edits invalidate checks, and submission requires current successful checks. A single Item setup summary provides Edit item setup; fixed scoring rules, optional fields, and history remain in disclosures. Raw TaskPackage JSON is not an authoring control. See `language-item-workbench/ITEM-CREATION.md` for field meanings.
- Edit item setup stages Domain, Context, and Difficulty changes in a dialog with an impact preview; Cancel discards those staged selections and Apply changes explicitly updates the draft. Blueprint slot, Item format, Primary Can-do, and the pinned Registry version stay fixed. The selected difficulty band uses its complete scheme from the item's pinned Assessment Settings, displayed read-only without author-facing difficulty tuning or rationale inputs. Setup changes preserve all language targets, supporting content, information points, candidate content, and answers. Surface incompatibilities as repairable issues; authors explicitly remove excess information points when the new scheme requires fewer, never silently truncate them. Applying changed setup invalidates formal checks, and existing content must be checked again. Later Settings publications apply only to new items.
- Registry draft writes preserve authored values; only legacy reads hydrate absent metadata. Published legacy snapshots retain their original validation semantics. Publication checks ownership, draft revision, and the current published baseline; incompatible Contexts, invalid bindings, shared-policy conflicts, and incomplete difficulty profiles block publication.
- Workbench AI runs, exports, and audit events use append-only records; GitHub PR commits are the configured submission-history and human-review authority, and merged files are revalidated before replacing the same item's current approved content
- Workbench item record state is independent from content/review status: owners can archive, soft-delete, and restore items while immutable versions, PR links, exports, and audits remain intact
- Seven Item Formats are authorable and previewable: single select, matching, restricted input, form entry, typed message, spoken single, and spoken multiturn
- A single fixed template registry binds each Item Format to its authoring editor and candidate-safe renderer; canonical TaskPackage metadata, scoring, delivery, and review partitions remain outside the candidate template
- Language content separates core target refs from supporting context refs; structured information points can reference item-level scoring points, while registry scoring policy stays locked and author-visible
- Workbench capability snapshots expose author-readable Can-do evidence, all communicative activities, Task Family/reference constraints, Slot × Item Format delivery policy, and complete scoring-contract summaries; locked rules remain visible to every author
- Language-content compatibility is enforced on both client and server by context, primary/supporting Can-do, and receptive/productive mastery scope; saved candidate previews are reread through the candidate-safe preview API
- Workbench AI defaults to a deterministic offline provider. DeepSeek uses server-side Chat Completions JSON mode; OpenAI uses Responses API structured outputs with `store: false`. Candidate calls are independent and run asynchronously after a durable `queued` record is created; invalid candidates receive at most one focused repair, and final state is persisted as `partial`, `completed`, or `failed`.
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

- Workbench UI field names are centralized in `client/features/language-items/labels.ts`: Blueprint slot, Item format, Primary Can-do, Domain, Context, and Difficulty. A Task configuration is Blueprint slot × Item format × Primary Can-do; Task family and Scoring contract are distinct references. Do not label these fields as Exam task or bare Slot. Use the central Blueprint slot display name consistently, with legacy capability-title fallback.
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
- `POST /api/language-items/github-review/batches` - Validate drafts, create submission snapshots, commit 1–50 items, and create a review PR; drafts lock only after PR creation succeeds
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
- `GET|POST /api/language-items/{item_id}/ai-runs` - List AI runs or queue idempotent independent candidate generation
- `GET|POST /api/language-items/{item_id}/ai-review` - List or run independent advisory review on a mutable draft
- `GET|POST /api/language-item-versions/{version_id}/ai-review` - List or run isolated AI pre-review
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
- Run `tsc` before shipping code changes
- After every UI change, immediately apply it to the running page and verify it in the browser. Proactively run the application build, restart affected services when needed, and refresh the page before handoff; do not wait for the user to request a rebuild or refresh.
- Avoid `any` or `unsafe` without justification
- No sweeping refactors
- Update this file when changing architecture, env vars, or major modules
- Update `CHANGELOG.md` with planning and implementation notes
