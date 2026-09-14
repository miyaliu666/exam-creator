# Deployment: 8.210.43.194

Deployed on 2026-09-14 to an Ubuntu 24.04 amd64 host. The application is available
at **https://8.210.43.194/**. HTTP port 80 redirects to HTTPS except for the public
ACME challenge directory needed for certificate renewal.

## Access

The entire HTTPS application, API and WebSocket surface requires HTTP Basic
authentication. Credentials were generated independently from the root SSH
password and are stored in the local, Git-ignored
`docs/deploy-8210/ACCESS-PRIVATE.txt`. The Basic username is `examadmin`; never copy
the plaintext password into source control or public release notes.

The installed local SSH configuration supports both commands:

```sh
ssh root@8.210.43.194
ssh exam-creator-8210
```

An independent Ed25519 key and pinned host key are installed in the current
Windows user's `.ssh` directory. Existing SSH keys and configuration are
preserved. Password authentication was not disabled.

Behind Basic authentication, the app uses `PUBLIC_ACCESS=true`,
`PUBLIC_USER_EMAIL=author@exam-creator.local`, and `MOCK_AUTH=false`. All visitors
use that existing author. Nginx consumes the Basic `Authorization` header and
forwards the app's session cookies and WebSocket upgrade headers. `FRONTEND_URL`
is unset because this is a same-origin deployment.

## Runtime and data

- `/opt/exam-creator/compose.aliyun.yml`: one app and one authenticated MongoDB 7.
- App port: `127.0.0.1:8080`; MongoDB has no host port mapping.
- Public host firewall ports: 22, 80 and 443. Docker and Nginx start at boot.
- Persistent MongoDB volume: `exam-creator_mongodb-data`.
- Credentials: `/opt/exam-creator/.env.runtime` and `.env.mongo`, mode `0600`.
- Nginx site: `/etc/nginx/sites-available/exam-creator`, enabled by symlink.
- Basic password hash: `/etc/nginx/exam-creator.htpasswd`, `root:www-data`, `0640`.
- Two GiB swap supplements the host's approximately 1.6 GiB RAM. Existing Compose
  memory limits remain in effect.

The local `freecodecamp` application database was copied at approximately 14:56
China time on 2026-09-14: 21 collections, 1,194 documents, including 123 item
records and five Assessment Settings versions. All collection counts matched
after restoration. Temporary `ExamCreatorSession` records were excluded. Existing
item ownership, revisions, approvals, audit and generation history were preserved.
The local and server databases now operate independently; this is not ongoing
synchronization. No running or queued generation/review work existed at export.

The release image and original database archive are retained under
`/opt/exam-creator/releases/20260914/`. The database archive contains application
content and must remain private. Subsequent releases must preserve the database
volume and take an appropriate backup before changes.

## Image identity

The deployed artifact is the previously validated 6.9.0 release candidate:

- Image tag: `exam-creator:release-20260914`, also tagged `exam-creator:aliyun`.
- Image archive SHA-256: `a5ac6e5b1d0caaed88bf6ab62b365bdb2424fa7db78a30144cc1ed091c17dcdc`.
- Image config digest: `sha256:f094499cdb54fe403cccf2bb815eb845f0a4623ba87a55b89e289e10933066bd`.
- OCI manifest digest: `sha256:9d536c1994422a4b61dd06f0efc0cc141288cc933fe9face4e4eb85555a69c2b`.

Docker's classic image store reports the config digest as its image ID; this
server's containerd image store reports the OCI manifest digest. Both digests
were verified against the same archive; the image was not rebuilt on the server.

## HTTPS renewal

Certbot 5.8 obtained a publicly trusted Let's Encrypt IP certificate using the
webroot challenge and `shortlived` profile. The first certificate expires at
2026-09-21 06:02:05 China time. IP certificates are short lived; the enabled
`exam-creator-certbot-renew.timer` checks every six hours, with randomized delay,
and a successful renewal validates then reloads Nginx.

```sh
systemctl list-timers exam-creator-certbot-renew.timer
systemctl status exam-creator-certbot-renew.timer
/opt/certbot/bin/certbot certificates
/opt/certbot/bin/certbot renew --cert-name 8.210.43.194 --dry-run --run-deploy-hooks --no-random-sleep-on-renew
```

The issuance dry run, production issuance, simulated renewal and deploy hook
were verified. Do not put Basic authentication on the ACME challenge location.

## Operations

```sh
cd /opt/exam-creator
docker compose -f compose.aliyun.yml ps
docker compose -f compose.aliyun.yml logs --tail=100 app
docker stats --no-stream
curl -fsS http://127.0.0.1:8080/status/ping
nginx -t
```

Public health requests require Basic authentication. A health response alone
does not establish database, AI or external integration readiness. Stop new work
and allow active calls to finish before replacing the single app instance.

The existing DeepSeek provider/model and GitHub review configuration were carried
over privately. This deployment does not make real generation calls or create
test review PRs. The old Supabase analytics configuration points to a localhost
placeholder; a real Supabase service must be configured separately for those
legacy analytics features. Any future external webhook ingress is also subject
to Basic authentication and needs an explicit compatible access design.

Local deployment scripts, backup metadata and verification reports are retained
under `docs/deploy-8210/`. That directory is Git-ignored and contains private
credentials and data, so it is not a source distribution directory.
