# Deploy the complete dev application to Railway

Railway runs the Docker container in the cloud. The container serves the React
application, Rust API and WebSockets under one HTTPS address, independently of
the developer's computer. MongoDB and Supabase must also be reachable cloud
services. GitHub Pages cannot run this Rust backend.

The default deployment path uses a Railway account signed in by email or Google
and a local upload with the Railway CLI. It does not install the Railway GitHub App
or grant Railway repository access. The files in this repository prepare
deployment; they do not create a Railway service, purchase a plan, copy data or
publish a URL.

## Deployment settings

The root `railway.json` selects the root `Dockerfile`, one replica, disabled
sleeping, `/status/ping` as the startup health check, a 300-second startup allowance,
and up to ten restarts after failure. These fields follow Railway's
[configuration reference](https://docs.railway.com/config-as-code/reference) and
[published schema](https://railway.com/railway.schema.json).

Keep a single deployment region and one steady-state replica: collaboration
state and the tower session store are currently in memory. No specific region
is required by this configuration. Redeployment disconnects active
WebSockets and resets that memory; authored Workbench data and application login
records are stored in MongoDB. Scaling to multiple replicas needs shared state.

One replica does not prevent the old and new deployments from overlapping during
a rollout. On startup, the server marks all non-batch `queued`/`running` AI runs
and queued/running GitHub synchronization deliveries as failed, including work
that an old deployment might still be processing. For each release, stop starting
new generation/review work, pause active batches and wait for their in-flight
calls to finish, then wait for individual generation, AI review/submission and
webhook synchronization to complete before deploying. Resume batches after the
new deployment passes its checks; inspect interrupted jobs before retrying.

Release manually after the checks for the chosen source succeed until the
application lifecycle supports overlapping deployments. A local upload has no
GitHub push trigger. Successful checks do not establish that active application
work has finished; complete the controlled release procedure above as well.

Keep **Serverless** disabled for background generation and prompt availability.
Railway's [Serverless setting](https://docs.railway.com/deployments/serverless)
allows idle services to sleep. The checked-in restart policy also works within
the free/trial restart restrictions. An ongoing deployment needs an account with
sufficient resources and credit; it is not a promise of perpetual free hosting.
Paid plans can use `ALWAYS` if desired; see
[restart policies](https://docs.railway.com/deployments/restart-policy).

An unverified account can have a **Limited Trial**, with restricted outbound
network access and available ports. Before deployment, check the account's plan
and whether it permits the required MongoDB, Supabase, GitHub and AI connections;
verify those connections from the deployed service before sharing it. If the
trial blocks them, obtain approval for a suitable paid plan before upgrading.
Signing in with email or Google does not itself establish full network access.
See [Railway trial restrictions](https://docs.railway.com/pricing/free-trial).

## Prepare the cloud services

1. Choose the exact `dev` source to publish. Review `git branch --show-current`,
   `git rev-parse HEAD`, `git status --short`, `git diff` and `git diff --cached`,
   including any untracked application files. `railway up` uploads the files
   currently saved in the selected local directory: it does not check out `dev`,
   use only the Git index, or fetch a GitHub commit. A clean checkout of the
   chosen `dev` commit gives a reproducible release. If deployment includes
   local changes, review and agree on those exact changes first; the presence
   of saved or staged files does not establish approval to publish them. There
   is no need to push to GitHub for this deployment method. Keep `.env`,
   credentials, database exports and local `docs/` private.
2. Prepare cloud MongoDB database credentials for two distinct databases, such
   as `exam_creator_production` and `exam_creator_staging`. They may share one
   Atlas cluster. Every URI must include its database name after the hostname.
   Both database accounts need access to their configured databases. Add the
   service's approved outbound network addresses to the
   [Atlas IP access list](https://www.mongodb.com/docs/atlas/security/add-ip-address-to-list/).
   Database data is separate from Git: migrate existing records only when those
   records are intended for this public deployment.
3. Prepare a Supabase project URL and a server-side key authorized to read its
   `events` table. The current full application requires both values at startup;
   legacy attempt-event retrieval queries `events` by `attempt_id`, using the
   event shape in `server/config.rs`. MongoDB alone does not replace that feature.
4. Sign in to Railway with **email or Google**, then create an empty project and an
   **Empty Service** in your own account. Keep its root directory at the
   uploaded repository root and use `railway.json`. Leave build/start command
   overrides empty so the Dockerfile builds and starts the complete application.
   Install the [Railway CLI](https://docs.railway.com/cli), run `railway login`,
   and complete its browser sign-in using that Railway account. From the chosen
   local source directory, run `railway link` and explicitly select this project,
   environment and service. Check the destination with `railway status` before
   uploading. Do not choose Connect Repo or install a GitHub App for this path.
   See Railway's [local-directory deployment](https://docs.railway.com/services#deploying-from-a-local-directory).
5. Generate a Railway public domain in the service's Networking settings.
   Its HTTPS origin becomes `PUBLIC_ORIGIN` in the examples below; that label is
   a documentation placeholder, not an additional application variable.
   Configure its target port to match `PORT`. See
   [Railway domains](https://docs.railway.com/networking/domains/railway-domains).
6. [Create a GitHub OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
   for this deployment. Set Homepage URL to the public HTTPS origin and
   Authorization callback URL to `PUBLIC_ORIGIN/auth/callback/github`.
   Preserve any separate OAuth app used for local development.

The application's GitHub OAuth login is separate from Railway's repository
integration. Creating a deployment login app does not require installing the
Railway GitHub App.

If this is a new Railway account, the account owner completes identity
verification and reviews and accepts the account terms shown during sign-up.
The CLI's [login flow](https://docs.railway.com/cli/login) can also create an
account and asks new users to accept Railway's Terms of Service and Fair Use
Policy. Creating an account or approving those terms does not approve a paid
subscription or additional GitHub permissions.

## Set runtime variables

Enter credentials in Railway's service Variables, without shell-style quotes.
Do not place them in the Dockerfile, Git, or `VITE_*` variables. The frontend uses
same-origin API calls, so it does not need a separate public backend URL.

| Variable | Cloud value |
| --- | --- |
| `MONGODB_URI_PRODUCTION` | Cloud URI including `/exam_creator_production` or your chosen production database name. |
| `MONGODB_URI_STAGING` | Cloud URI including `/exam_creator_staging` or your chosen staging database name. All Workbench records live here. |
| `COOKIE_KEY` | A new random string of exactly 64 ASCII characters; keep it stable across redeploys. |
| `GITHUB_CLIENT_ID` | Deployment OAuth app client ID. |
| `GITHUB_CLIENT_SECRET` | Deployment OAuth app client secret. |
| `GITHUB_REDIRECT_URL` | `PUBLIC_ORIGIN/auth/callback/github`, exactly matching the OAuth app. |
| `ALLOWED_ORIGINS` | `PUBLIC_ORIGIN`, including `https://` and without a trailing slash. |
| `SUPABASE_URL` | Your Supabase project HTTPS URL. |
| `SUPABASE_KEY` | A server-only key authorized to read the required events. |
| `MOCK_AUTH` | `false`. Release builds reject `true`. |
| `PORT` | Railway's supplied value, or an explicit value such as `8080` matching the public domain target port. |
| `REQUEST_TIMEOUT_IN_MS` | `180000` when using real AI calls; adjust to the provider's needs. |

For example, PowerShell 7 can generate the cookie key locally with
`[Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`.
Store the generated value directly in Railway Variables. Do not use the example
key in `sample.env`.

To enable real AI drafting and preliminary review, configure either:

- `LANGUAGE_ITEM_AI_PROVIDER=deepseek`, `LANGUAGE_ITEM_AI_MODEL` with your chosen
  supported model ID, and `DEEPSEEK_API_KEY`; or
- `LANGUAGE_ITEM_AI_PROVIDER=openai`, `LANGUAGE_ITEM_AI_MODEL` with your chosen
  supported model ID, and `OPENAI_API_KEY`.

Without that configuration, generation uses the deterministic offline mock;
simulation does not satisfy the real preliminary-review gate. Optional base URLs
and other supported variables are listed in `sample.env`.

For the GitHub review submission workflow, also set
`GITHUB_REVIEW_ENABLED=true`, `GITHUB_REVIEW_REPOSITORY=owner/private-review-repository`,
`GITHUB_REVIEW_TOKEN`, and the intended `GITHUB_REVIEW_BASE_BRANCH`. The fine-grained
token needs Contents and Pull requests read/write access to the review repository.
For automatic merge synchronization, set `GITHUB_REVIEW_WEBHOOK_SECRET` and use
the same secret on a `pull_request` webhook pointing to
`PUBLIC_ORIGIN/api/integrations/github/webhook`.

`SENTRY_DSN` is optional. Omit it when error reporting is not configured.

## Register the first user

The public URL is reachable by visitors, but editing and AI usage retain the
existing GitHub login and registered-user requirement. Login looks up the GitHub
account's email in the **production** database's `ExamCreatorUser` collection.
Deploying does not turn every visitor into an authorized author.

On a fresh deployment, add the intended first user's record in that collection
using the database administration interface. Use the email returned by GitHub
(or its primary verified email when the public email is absent). This example
shows the required shape; replace the placeholders and let MongoDB assign `_id`:

```json
{
  "email": "your-github-email@example.com",
  "name": "Your name",
  "github_id": null,
  "picture": null,
  "settings": { "databaseEnvironment": "Staging" },
  "version": 2
}
```

Register subsequent authors in the same collection. The existing User Management
page does not provide an author-registration flow. An anonymous, fully editable
public demo would require a separate access-policy change; do not enable local
mock authentication on the cloud service.

## Build and verify

For a local container build, run `docker build --tag exam-creator:dev .` from the
repository root. This compiles TypeScript and the Vite production bundle, generates
the Prisma client, and builds the Rust release server. Build-time credentials
and database access are not required. The `.dockerignore` excludes local secrets,
dependencies, build output and local documentation from the build context.

The `.railwayignore` permits only the Docker build inputs and deployment
configuration to enter the upload. It includes `bunfig.toml`, Prisma sources,
the complete server tree (including embedded prompts), and Workbench registries
and contracts. It excludes environment files, credentials with common explicit
filenames, Git metadata, CI workflows, dependencies, build output, local
documentation, agent state and caches. It cannot recognize a secret saved under
an ordinary application filename; review the intended source before uploading.
When the Dockerfile gains a new local input, update this allowlist as well.

Railway's CLI also respects `.gitignore`, and ignores `.git` and `node_modules`.
Keep both ignore files in effect; do not use `--no-gitignore`. The upload is
source code, not the locally built Docker image, and Railway builds it again in
the cloud. See [CLI file handling](https://docs.railway.com/cli/up#file-handling).

After setting cloud variables and completing the controlled release procedure,
run these commands from the reviewed local source root:

```sh
railway status
railway up
```

Confirm `railway status` identifies the intended project, environment and
service before `railway up`. The latter uploads the current local files and
streams build/deployment logs. It does not create a public domain by itself;
use the service domain configured above. Then verify:

1. The deployment logs report a listening server; `GET PUBLIC_ORIGIN/status/ping`
   returns HTTP 200 with `pong`.
2. The HTTPS home page and a refreshed `/language-items` deep link load. An
   incognito visitor sees the normal sign-in flow, and no browser request targets
   `localhost` or `127.0.0.1`.
3. The registered GitHub account can sign in and open Item Bank, Assessment
   Settings and the legacy exam pages. Verify the selected databases contain the
   intended data.
4. Create and save a small test draft, refresh, and confirm persistence. When
   real AI and GitHub review are configured, test those flows with an intended
   test item and inspect their provider/review status.
5. Confirm `/ws/users` connects after sign-in. Reload or reconnect clients after
   a deployment; an existing WebSocket cannot survive replacement of its process.

Railway's [health check](https://docs.railway.com/deployments/healthchecks) controls
startup traffic routing. The app's ping is a process liveness check; it does not
prove database, Supabase, AI or OAuth readiness, and Railway does not continuously
poll it after deployment. Complete the functional checks before sharing the URL.

For later releases, review the new local source, repeat the required checks and
controlled release procedure, and run `railway up` again. Reverting to an earlier
application deployment does not roll back database writes; retain database
backups independently.

## Optional future GitHub integration

Only add repository integration after a separate, explicit permission review.
The Railway GitHub App installation page inspected on 2026-09-14 requested
metadata read access; read/write access to actions, administration, checks, code,
commit statuses, deployments, pull requests and workflows; and email read access.
The page allowed choosing specific repositories but had no individual permission
toggles. That fixed set is broader than this deployment's source-upload needs,
so the default procedure above does not grant it.

If this integration is approved in the future, choose **Only select repositories**
and only `miyaliu666/exam-creator`; review the then-current permission list before
installation. Configure the service's source branch as **dev**, disable
autodeploy, and release manually after checks and application work finish.
Enable **Wait for CI** where available. Enabling autodeploy makes future pushes
trigger a release, potentially interrupting active work; it does not replace the
controlled release procedure. See [GitHub installation permissions](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-a-third-party)
and [Railway GitHub autodeploys](https://docs.railway.com/deployments/github-autodeploys).
