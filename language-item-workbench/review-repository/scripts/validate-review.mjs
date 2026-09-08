import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { requireRule, same, unique, validateLockedFields, validateRegistry } from './registry-checks.mjs';
import { validateCandidate } from './candidate-checks.mjs';
import { packageForPinnedSchema } from './author-translations.mjs';

const shaPattern = /^[a-f0-9]{40}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const maximumFileBytes = 10 * 1024 * 1024;
export function gitReader(repository) {
  const git = args => execFileSync('git', ['-C', repository, ...args], {
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1', GIT_CONFIG_NOSYSTEM: '1' },
  });
  return {
    resolve(ref) { return git(['rev-parse', '--verify', `${ref}^{commit}`]).trim(); },
    parent(ref) { return git(['rev-parse', '--verify', `${ref}^`]).trim(); },
    ancestor(older, newer) { try { git(['merge-base', '--is-ancestor', older, newer]); return true; } catch { return false; } },
    changed(before, after) { return git(['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', before, after, '--']).split('\0').filter(Boolean); },
    read(ref, path) {
      requireRule(shaPattern.test(ref), 'Git reader requires an exact commit SHA');
      requireRule(!path.includes('..') && /^[A-Za-z0-9_./-]+$/.test(path), 'Unsafe repository path');
      const tree = git(['ls-tree', '-z', ref, '--', path]);
      requireRule(/^100644 blob [a-f0-9]+\t/.test(tree) && tree.endsWith(`\t${path}\0`), `Missing or non-regular file: ${path}`);
      const size = Number(git(['cat-file', '-s', `${ref}:${path}`]).trim());
      requireRule(size <= maximumFileBytes, `File exceeds the validation size limit: ${path}`);
      return git(['show', `${ref}:${path}`]);
    },
  };
}

function objectKeys(value, keys, label) {
  requireRule(value && typeof value === 'object' && !Array.isArray(value), `${label}: expected object`);
  same(Object.keys(value).sort(), [...keys].sort(), `${label} fields`);
}
function parse(text, path) {
  try { return JSON.parse(text); } catch { throw new Error(`Invalid JSON: ${path}`); }
}
function schemaCheck(schema, value, label) {
  // Only trusted submission assets are compiled. No remote schema loading or custom code keywords.
  const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
  const validate = ajv.compile(schema);
  requireRule(validate(value), `${label}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
}

export function validateReview(reader, { batchId, submission, head, base }) {
  requireRule(idPattern.test(batchId), 'Invalid batch ID');
  for (const sha of [submission, head, base]) requireRule(shaPattern.test(sha), 'Exact commit SHAs are required');
  requireRule(reader.ancestor(submission, head), 'PR history does not contain the protected submission commit');
  const parent = reader.parent(submission);
  requireRule(reader.ancestor(parent, base), 'Submission was not created from the trusted base history');
  const manifestPath = `review-batches/${batchId}.json`;
  const manifestText = reader.read(submission, manifestPath);
  const manifest = parse(manifestText, manifestPath);
  objectKeys(manifest, ['schemaVersion', 'batchId', 'items'], 'Manifest');
  same(manifest.schemaVersion, '1.1', 'Manifest schema version'); same(manifest.batchId, batchId, 'Batch ID');
  requireRule(Array.isArray(manifest.items) && manifest.items.length >= 1 && manifest.items.length <= 50, 'A batch must contain 1–50 items');
  const assets = new Set([manifestPath]);
  const itemPaths = new Set();
  for (const item of manifest.items) {
    objectKeys(item, ['itemId', 'versionId', 'versionNumber', 'path', 'contentHash', 'registryVersion',
      'registrySnapshotPath', 'taskPackageSchemaPath', 'candidateSchemaPath'], 'Manifest item');
    requireRule(idPattern.test(item.itemId), 'Invalid item ID');
    same(item.path, `items/${item.itemId}.json`, 'Item path');
    requireRule(!itemPaths.has(item.path), 'Duplicate item path'); itemPaths.add(item.path);
    const key = createHash('sha256').update(item.registryVersion).digest('hex');
    const directory = `review-batches/${batchId}/rules/${key}`;
    same(item.registrySnapshotPath, `${directory}/snapshot.json`, 'Snapshot path');
    same(item.taskPackageSchemaPath, `${directory}/task-package.schema.json`, 'Task schema path');
    requireRule(new RegExp(`^${directory}/IF-(SINGLE-SELECT|MATCHING|RESTRICTED-INPUT|FORM-ENTRY|TYPED-MESSAGE|SPOKEN-SINGLE|SPOKEN-MULTITURN)\\.schema\\.json$`).test(item.candidateSchemaPath), 'Candidate schema path is outside the batch');
    for (const path of [item.registrySnapshotPath, item.taskPackageSchemaPath, item.candidateSchemaPath]) assets.add(path);
  }
  unique(manifest.items.map(item => item.itemId), 'Batch items');
  const allowed = new Set([...assets, ...itemPaths]);
  for (const path of reader.changed(parent, submission)) requireRule(allowed.has(path), `Submission contains an out-of-batch change: ${path}`);
  for (const path of reader.changed(submission, head)) requireRule(itemPaths.has(path), `Only this batch's item files may be edited: ${path}`);
  // Compare bytes, not only parsed JSON, to disallow modified manifests and rule assets.
  for (const path of assets) same(reader.read(head, path), reader.read(submission, path), `Immutable asset ${path}`);
  for (const item of manifest.items) {
    const original = parse(reader.read(submission, item.path), item.path);
    const edited = parse(reader.read(head, item.path), item.path);
    for (const file of [original, edited]) {
      objectKeys(file, ['schemaVersion', 'itemId', 'title', 'source', 'taskPackage'], 'Item file');
      objectKeys(file.source, ['batchId', 'versionId', 'versionNumber', 'contentHash'], 'Item source');
      requireRule(typeof file.title === 'string' && file.title.trim(), 'Item title is required');
      same(file.schemaVersion, '1.1', 'Item schema version'); same(file.itemId, item.itemId, 'Item identity');
      same(file.source, { batchId, versionId: item.versionId, versionNumber: item.versionNumber, contentHash: item.contentHash }, 'Immutable source');
      same(file.taskPackage.taskId, item.itemId, 'Task identity');
      same(file.taskPackage.specVersions.registryBundleVersion, item.registryVersion, 'Pinned registry');
    }
    validateLockedFields(edited, original);
    const registry = parse(reader.read(submission, item.registrySnapshotPath), item.registrySnapshotPath);
    const taskSchema = parse(reader.read(submission, item.taskPackageSchemaPath), item.taskPackageSchemaPath);
    const candidateSchema = parse(reader.read(submission, item.candidateSchemaPath), item.candidateSchemaPath);
    same(item.candidateSchemaPath.split('/').at(-1), `${edited.taskPackage.itemFormatId}.schema.json`, 'Format schema');
    same(taskSchema, registry.taskPackageSchema, 'Snapshot TaskPackage schema');
    requireRule(registry.candidateSchemas.some(schema => JSON.stringify(schema) === JSON.stringify(candidateSchema)), 'Candidate schema does not belong to pinned snapshot');
    schemaCheck(taskSchema, packageForPinnedSchema(edited.taskPackage, taskSchema), 'TaskPackage schema');
    schemaCheck(candidateSchema, edited.taskPackage.candidatePayload, 'Candidate payload schema');
    validateRegistry(edited.taskPackage, registry);
    validateCandidate(edited.taskPackage);
  }
  return { batchId, itemCount: manifest.items.length, submission, head };
}

function main() {
  const args = process.argv.slice(2);
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    requireRule(['--repo', '--batch', '--base', '--head'].includes(args[index]) && args[index + 1], 'Usage: --repo PATH --batch ID --base SHA --head SHA');
    options[args[index].slice(2)] = args[index + 1];
  }
  requireRule(idPattern.test(options.batch ?? ''), 'A valid --batch is required');
  const reader = gitReader(resolve(options.repo ?? '.'));
  // The protected tag is the authority, never a PR body, PR-edited manifest, or oldest branch commit.
  const submission = reader.resolve(`refs/tags/item-submission/${options.batch}`);
  const result = validateReview(reader, { batchId: options.batch, base: options.base, head: options.head, submission });
  console.log(`Validated ${result.itemCount} item(s); protected submission ${result.submission}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(`Review validation failed: ${error.message}`); process.exitCode = 1; }
}
