import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { gitReader, validateReview } from '../scripts/validate-review.mjs';
import { fixture, refs } from './fixture.mjs';

function repository(t, { legacyItem = false } = {}) {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'review-validator-'));
  t.after(() => {
    assert.ok(resolve(directory).startsWith(`${temporaryRoot}${sep}review-validator-`));
    rmSync(directory, { recursive: true, force: true });
  });
  const git = (args, input) => execFileSync('git', ['-C', directory, '-c', 'user.name=Validator Test',
    '-c', 'user.email=validator@example.invalid', '-c', 'core.autocrlf=false', '-c', 'core.hooksPath=/dev/null', ...args],
  { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']);
  const data = fixture();
  writeFileSync(join(directory, 'README.md'), 'Trusted base validator repository\n');
  if (legacyItem) {
    const file = JSON.parse(data.files.get(data.item.path));
    file.schemaVersion = '1.0'; file.itemId = 'LI-legacy'; file.taskPackage.taskId = file.itemId;
    delete file.source.batchId;
    mkdirSync(join(directory, 'items'));
    writeFileSync(join(directory, 'items/LI-legacy.json'), JSON.stringify(file));
    git(['add', '--', 'items/LI-legacy.json']);
  }
  git(['add', '--', 'README.md']); git(['commit', '-qm', 'Trusted base']);
  const base = git(['rev-parse', 'HEAD']);
  for (const [path, value] of data.files) {
    mkdirSync(resolve(directory, path, '..'), { recursive: true });
    writeFileSync(join(directory, path), value);
  }
  git(['add', '--', 'items', 'review-batches']); git(['commit', '-qm', 'Original submission']);
  const submission = git(['rev-parse', 'HEAD']);
  git(['tag', `item-submission/${refs.batchId}`]);
  const commit = () => { git(['commit', '-qm', 'Reviewer edit']); return git(['rev-parse', 'HEAD']); };
  return { directory, git, data, commit, options: { base, submission, head: submission, batchId: refs.batchId } };
}

test('real git reader validates protected original and modified item without checking out head', t => {
  const repo = repository(t);
  const reader = gitReader(repo.directory);
  assert.equal(reader.resolve(`refs/tags/item-submission/${refs.batchId}`), repo.options.submission);
  repo.data.edit(repo.data.item.path, file => { file.taskPackage.candidatePayload.prompt = '请选择。'; });
  writeFileSync(join(repo.directory, repo.data.item.path), repo.data.head.get(repo.data.item.path));
  repo.git(['add', '--', repo.data.item.path]); const head = repo.commit();
  repo.git(['checkout', '--detach', repo.options.base]);
  assert.equal(validateReview(reader, { ...repo.options, head }).itemCount, 1);
});

test('real git reader ignores historical 1.0 items outside the current 1.1 batch', t => {
  const repo = repository(t, { legacyItem: true });
  const reader = gitReader(repo.directory);
  const legacy = reader.read(repo.options.base, 'items/LI-legacy.json');
  assert.equal(JSON.parse(legacy).schemaVersion, '1.0');
  assert.equal(validateReview(reader, repo.options).itemCount, 1);
  assert.equal(reader.read(repo.options.head, 'items/LI-legacy.json'), legacy);
});

test('real git reader accepts a tree-preserving retrigger after the trusted base advances', t => {
  const repo = repository(t);
  repo.data.edit(repo.data.item.path, file => { file.title = 'Preserved reviewer edit'; });
  writeFileSync(join(repo.directory, repo.data.item.path), repo.data.head.get(repo.data.item.path));
  repo.git(['add', '--', repo.data.item.path]); const reviewedHead = repo.commit();
  const reviewedTree = repo.git(['rev-parse', `${reviewedHead}^{tree}`]);
  repo.git(['checkout', '--detach', repo.options.base]);
  writeFileSync(join(repo.directory, 'README.md'), 'Updated trusted validator instructions\n');
  repo.git(['add', '--', 'README.md']); repo.git(['commit', '-qm', 'Upgrade trusted validator']);
  const base = repo.git(['rev-parse', 'HEAD']);
  repo.git(['checkout', '--detach', reviewedHead]);
  repo.git(['commit', '--allow-empty', '-qm', 'Retrigger updated review workflow']);
  const head = repo.git(['rev-parse', 'HEAD']);
  assert.notEqual(head, reviewedHead);
  assert.equal(repo.git(['rev-parse', `${head}^{tree}`]), reviewedTree);
  repo.git(['checkout', '--detach', base]);
  const reader = gitReader(repo.directory);
  assert.equal(reader.ancestor(base, head), false);
  assert.equal(reader.resolve(`refs/tags/item-submission/${refs.batchId}`), repo.options.submission);
  assert.equal(validateReview(reader, { ...repo.options, base, head }).itemCount, 1);
});

test('real git reader rejects symlink item blobs without dereferencing them', t => {
  const repo = repository(t);
  const blob = repo.git(['hash-object', '-w', '--stdin'], '../private-file');
  repo.git(['update-index', '--cacheinfo', `120000,${blob},${repo.data.item.path}`]);
  const head = repo.commit();
  assert.throws(() => validateReview(gitReader(repo.directory), { ...repo.options, head }), /non-regular/);
});

test('real git reader rejects modified batch schemas', t => {
  const repo = repository(t);
  writeFileSync(join(repo.directory, repo.data.item.candidateSchemaPath), '{}');
  repo.git(['add', '--', repo.data.item.candidateSchemaPath]); const head = repo.commit();
  assert.throws(() => validateReview(gitReader(repo.directory), { ...repo.options, head }), /Only this batch/);
});

test('missing protected tag fails closed', t => {
  const repo = repository(t);
  assert.throws(() => gitReader(repo.directory).resolve('refs/tags/item-submission/missing'));
});

test('git reader rejects path traversal even for an exact trusted commit', t => {
  const repo = repository(t);
  assert.throws(() => gitReader(repo.directory).read(repo.options.submission, '../private.json'), /Unsafe/);
});
