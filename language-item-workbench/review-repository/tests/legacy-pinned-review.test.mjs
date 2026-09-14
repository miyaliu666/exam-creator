import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, refs } from './legacy/fixture.mjs';
import { fixture as currentFixture } from './fixture.mjs';
import { validateReview } from '../scripts/validate-review.mjs';

test('historical pinned submission retains its original schema and rule validation without normalization', () => {
  const f = fixture();
  const before = f.files.get(f.item.registrySnapshotPath);
  f.edit(f.item.path, file => { file.taskPackage.candidatePayload.prompt = '新的审核文字'; });
  assert.equal(validateReview(f.reader, refs).itemCount, 1);
  assert.equal(f.files.get(f.item.registrySnapshotPath), before);
  f.edit(f.item.path, file => { file.taskPackage.blueprintSlotId = 'R-A1-2'; });
  assert.throws(() => validateReview(f.reader, refs), /locked reference/);
});

test('legacy pinned assets must remain byte-identical before the compatibility validator runs', () => {
  const f = fixture();
  f.head.set(f.item.registrySnapshotPath, f.head.get(f.item.registrySnapshotPath) + '\n');
  assert.throws(() => validateReview(f.reader, refs), /Only this batch|Immutable asset/);
});

test('current submissions cannot switch to the historical identity contract', () => {
  const f = currentFixture();
  f.edit(f.item.path, file => {
    file.taskPackage.blueprintSlotId = 'R-A1-1';
    delete file.taskPackage.itemRuleId;
    file.taskPackage.specVersions.taskPackageVersion = '0.1';
  });
  assert.throws(() => validateReview(f.reader, refs), /locked reference/);
});

test('historical compatibility rejects a current settings snapshot mislabeled with the old identity', () => {
  const f = fixture();
  f.edit(f.item.registrySnapshotPath, registry => { registry.settingsSchemaVersion = 3; }, true);
  assert.throws(() => validateReview(f.reader, refs), /Legacy validation requires/);
});
