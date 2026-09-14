# Item rule identity migration

The current application uses `itemRuleId` for each saved assessment rule. An Exercise Template rule uses its own `id` directly. The user selects a Can-do, Exercise template, Domain, optional Context and Difficulty; there is no separate Blueprint slot entity or selector.

The migration preserves each distinct historical task and scoring design. A historical slot, format and Primary Can-do tuple becomes `legacy-rule-` followed by the lowercase SHA-256 of its compact JSON array. Shared scoring contracts and task families reference an `itemRuleIds` array. Current TaskPackage contracts use version `0.2`; new and explicitly migrated settings drafts use schema version `3`.

## Run the database migration

Run the newly built server executable from the project directory so it loads the intended `.env`. The command targets only the database named by `MONGODB_URI_STAGING` and exits before normal server startup, job recovery or AI provider initialization.

1. Stop every application instance and generation worker that can write to this database. Keep them stopped through migration and verification. Record-level guards cannot prevent another process from inserting new work.
2. Run the read-only preflight:

   ```powershell
   .\target\debug\server.exe --migrate-item-rule-identity --dry-run
   ```

3. Resolve any reported malformed identities, integrity failures or active/uncertain generation work. The tool refuses to apply a partial preflight. Paused jobs are eligible only when no worker owns them and no child is running; provider calls are never replayed.
4. Apply with a new local backup filename:

   ```powershell
   .\target\debug\server.exe --migrate-item-rule-identity --apply --backup .\docs\item-rule-identity-backup.json
   ```

5. Repeat the dry run. A completed migration reports zero proposed changes. Restart the newly built application and refresh existing browser tabs.

## Preserved records and recovery

The tool converts editable Registry drafts, editable item drafts, completed generation-run metadata and eligible batch-job metadata. It increments draft revisions, invalidates obsolete item checks, updates saved generation setup versions and verifies/recomputes batch request fingerprints while preserving idempotency keys, quantities, targets, candidates and provider evidence.

Published Registry snapshots, frozen item versions, submitted/approved item packages and raw provider request/response records remain unchanged. Explicit archive readers translate their identities for current application use. Original frozen-package hashes are verified against the original contract before those records are exposed. New revisions and new frozen records use the current contract. Historical validators live under `legacy` directories so existing review evidence can still be verified.

Before its first write, the tool creates and flushes a backup containing the exact original and proposed BSON for every affected record, each with a SHA-256 checksum. It refuses to overwrite an existing backup. Changes use an exact-document comparison; a failure triggers guarded rollback, including re-reading a write whose acknowledgement may have been lost. A concurrent third state is never overwritten. Unresolved rollback outcomes are named in the report and require inspecting that record against the backup before any manual restoration. Restore only a verified `before.bsonHex` value whose current record still matches its corresponding `after.bsonHex`; do not blindly replace records edited after migration.

Old browser-session plans and unfinished manual-creation recovery records are converted by a separate browser adapter. It keeps saved quantities, targets, group structure and retry identities. No settings are published and no generation or approval action is performed by either migration.

If preflight reports a historical integrity mismatch, `server.exe --inspect-item-rule-history <new-local-file>` exports immutable records, their original BSON and verification results for local diagnosis. It performs no writes to MongoDB. Compare the original stored representation before treating fields hydrated by a later application version as evidence of corruption; never replace a stored hash merely to make verification pass.
