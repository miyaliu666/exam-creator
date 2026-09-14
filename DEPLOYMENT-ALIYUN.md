# Deploy to Alibaba Cloud

This deployment serves the complete frontend, API and WebSockets at one HTTPS
origin. The requested shared workspace opens automatically as the existing
`author@exam-creator.local` author. Every visitor has that author's existing
workflow access. Other records retain their saved ownership. No GitHub OAuth app
is needed in this explicit mode; GitHub review remains a separate integration.

## Runtime

- Ubuntu 24.04 host: Docker Compose, Nginx and Certbot.
- Application directory: `/opt/exam-creator`.
- Application container: `exam-creator:aliyun`, bound to `127.0.0.1:8080`.
- MongoDB 7: Docker network only, authenticated, persistent `mongodb-data` volume.
- `compose.aliyun.yml` uses raw environment files `.env.runtime` and `.env.mongo`.
  Both files and backups must be readable only by the administrator. Never commit
  or publish them.
- Single application replica; graceful shutdown allows 180 seconds.
- The small-memory deployment limits the app to 384 MiB and MongoDB to 512 MiB,
  with additional swap allowances. MongoDB's internal cache is 0.256 GB. These are
  ceilings, not guaranteed capacity for a large bank or concurrent generation.
- Build the image on a separate machine. The initial roughly 1 GB host has a
  2 GB swap file; this does not replace physical memory for sustained workloads.

The application environment includes `PUBLIC_ACCESS=true`,
`PUBLIC_USER_EMAIL=author@exam-creator.local`, `MOCK_AUTH=false`, a newly generated
64-character `COOKIE_KEY`, the exact HTTPS `ALLOWED_ORIGINS`, the two MongoDB URIs,
and the chosen AI/review configuration. Leave `FRONTEND_URL` unset for this
same-origin deployment. Public access is disabled by default in other environments.
The configured public author must already exist; startup does not create or
impersonate arbitrary browser-supplied identities.

## Data migration

The local configuration uses `freecodecamp` for both production and staging.
Preserve that mapping when migrating this installation. Export only that database,
excluding `ExamCreatorSession`; separate smoke-test databases are not application
data. Retain author, rule, item and version identities. Restore into the new cloud
database before starting the app, then compare collection counts and verify the
configured public author exists. Use one collection worker on small-memory hosts.

Keep the original dump and restore logs under the administrator-only application
directory. Source migration does not transfer browser-only unsaved edits. The
application may recover durable queued/running jobs at startup, so check and drain
active generation/review work before making a new migration or release.

Supabase configuration belongs to the legacy exam-events integration. The local
installation's localhost placeholder does not establish a working remote events
service. Use real Supabase configuration if that feature is required; do not
represent an unavailable service as successful empty results.

## HTTPS and renewal

Nginx exposes ports 80 and 443, redirects ordinary HTTP requests to HTTPS and
forwards WebSockets to the app. Only ports 22, 80 and 443 are open in the host
firewall. Neither MongoDB nor the app's direct port is publicly bound.

Certbot 5.4+ supports a public IP certificate through the webroot challenge and
the `shortlived` profile. IP certificates last approximately six days, so renewal
is required. This installation uses `exam-creator-cert-renew.timer` twice daily
with an Nginx reload deploy hook. Check it with:

```sh
systemctl status exam-creator-cert-renew.timer
/opt/certbot/bin/certbot certificates
/opt/certbot/bin/certbot renew --dry-run
```

See the [Let's Encrypt IP certificate instructions](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/).

## Operate and release

```sh
cd /opt/exam-creator
docker compose -f compose.aliyun.yml ps
docker compose -f compose.aliyun.yml logs --tail=100 app
docker stats --no-stream
curl -fsS https://47.236.247.1/status/ping
```

Build the reviewed current workspace, including untracked application files, with
the root Dockerfile. Keep environment files, backups, keys, caches and local docs
out of the build context. Upload the image using encrypted SSH, load it with
`docker load`, and run `docker compose -f compose.aliyun.yml up -d app` after
in-flight work has finished. Retain the previous image for rollback; never remove
the database volume when updating the application.

Verify HTTPS trust, direct page reloads, automatic sessions, restored item and
settings records, write persistence and WebSocket reconnection. The `/status/ping`
endpoint alone proves only that the process responds.
