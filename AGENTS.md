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
- Language Exam Item Creator with seven registered task formats, versioned authoring, optional real AI, deterministic validation, GitHub pull-request review, idempotent Staging export, and R-A1-1 assembly

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
  └── language_items/ Registry, domain, validation, and AI provider boundary
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
- `bun run dev` - Start Vite dev server (port 5173)
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
- Workbench AI runs, exports, assemblies, and audit events use append-only records; GitHub PR commits are the configured submission-history and human-review authority, and merged files are revalidated before replacing the same item's current approved content
- Workbench item record state is independent from content/review status: owners can archive, soft-delete, and restore items while immutable versions, PR links, exports, and audits remain intact
- Seven Item Formats are authorable and previewable: single select, matching, restricted input, form entry, typed message, spoken single, and spoken multiturn
- A single fixed template registry binds each Item Format to its authoring editor and candidate-safe renderer; canonical TaskPackage metadata, scoring, delivery, and review partitions remain outside the candidate template
- Language content separates core target refs from supporting context refs; structured information points can reference item-level scoring points, while registry scoring policy stays locked and author-visible
- Workbench capability snapshots expose author-readable Can-do evidence, all communicative activities, Task Family/reference constraints, Slot × Item Format delivery policy, and complete scoring-contract summaries; locked rules remain visible to every author
- Language-content compatibility is enforced on both client and server by context, primary/supporting Can-do, and receptive/productive mastery scope; saved candidate previews are reread through the candidate-safe preview API
- Workbench AI defaults to a deterministic offline provider. DeepSeek uses server-side Chat Completions JSON mode; OpenAI uses Responses API structured outputs with `store: false`. All output is revalidated and provider errors are persisted as failed runs.

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

- `GET|POST /api/language-items` - List items or create one from a required `blueprintSlotId` + allowed `itemFormatId` pair
- `GET /api/language-items/registry` - Get the implemented registry capability snapshot
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
- `GET|POST /api/language-items/{item_id}/ai-runs` - List or generate AI candidates
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
- `GET /api/language-item-assemblies` - List idempotent Slot assemblies
- `GET /api/language-item-assemblies/{assembly_id}` - Get one Slot assembly and all source mappings
- `POST /api/language-item-assemblies/staging` - Assemble 5–6 distinct exported R-A1-1 versions into a Staging legacy exam

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
- Avoid `any` or `unsafe` without justification
- No sweeping refactors
- Update this file when changing architecture, env vars, or major modules
- Update `CHANGELOG.md` with planning and implementation notes
