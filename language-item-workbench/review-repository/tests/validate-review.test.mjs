import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReview } from '../scripts/validate-review.mjs';
import { fixture, refs } from './fixture.mjs';

test('full canonical schemas allow reviewer text, answers, criteria, title and author notes without rehashing source', () => {
  const f = fixture();
  f.edit(f.item.path, file => {
    file.title = 'Revised item'; file.taskPackage.candidatePayload.prompt = '请选择正确的意思。';
    file.taskPackage.scoringPackage.correctOptionId = 'B';
    file.taskPackage.scoringPackage.taskSpecificCriteria = ['理解标志'];
    file.taskPackage.authoringPackage.notes = ['Human-reviewed'];
  });
  assert.equal(validateReview(f.reader, refs).itemCount, 1);
});

test('form schema validates productive content and legitimate nested sourceProfile', () => {
  const f = fixture({ form: true }); assert.equal(validateReview(f.reader, refs).itemCount, 1);
});

test('shared scoring contracts explicitly authorize every bound Item rule', () => {
  const f = fixture();
  f.edit(f.item.registrySnapshotPath, registry => {
    registry.scoringContracts[0].itemRuleIds.push('another-rule');
  }, true);
  assert.equal(validateReview(f.reader, refs).itemCount, 1);
  f.edit(f.item.registrySnapshotPath, registry => {
    registry.scoringContracts[0].itemRuleIds = ['another-rule'];
  }, true);
  assert.throws(() => validateReview(f.reader, refs), /does not apply to this item rule/);
});

test('duplicate capabilities cannot make the same Item rule identity ambiguous', () => {
  const f = fixture();
  f.edit(f.item.registrySnapshotPath, registry => {
    registry.capabilities.push(structuredClone(registry.capabilities[0]));
  }, true);
  assert.throws(() => validateReview(f.reader, refs), /exactly one configuration/);
});

for (const [name, message] of [['manifest', /Manifest schema version/], ['item', /Item schema version/]]) {
  test(`rejects a current submission with a downgraded 1.0 ${name}`, () => {
    const f = fixture();
    f.edit(name === 'manifest' ? f.manifestPath : f.item.path, file => { file.schemaVersion = '1.0'; }, true);
    assert.throws(() => validateReview(f.reader, refs), message);
  });
}

const englishTranslations = [{ path: '/prompt', sourceText: '这个标志是什么意思？', englishText: 'What does this sign mean?' }];

test('shared pinned rules accept English and Spanish items while preserving schemas and locked language', () => {
  for (const language of ['en', 'es']) {
    const f = fixture();
    f.edit(f.item.path, file => { file.taskPackage.content.language = language; }, true);
    f.edit(f.item.registrySnapshotPath, registry => { registry.contentIdOptions.forEach(entry => { entry.language = language; }); }, true);
    const schemaBefore = f.head.get(f.item.taskPackageSchemaPath);
    const itemBefore = f.head.get(f.item.path);
    assert.equal(validateReview(f.reader, refs).itemCount, 1);
    assert.equal(f.head.get(f.item.taskPackageSchemaPath), schemaBefore);
    assert.equal(f.head.get(f.item.path), itemBefore);
    f.edit(f.item.path, file => { file.taskPackage.content.language = 'zh'; });
    assert.throws(() => validateReview(f.reader, refs), /content.language/);
  }
});

test('review rejects mixed-language targets and unsupported item languages with older pinned schemas', () => {
  const mixed = fixture();
  mixed.edit(mixed.item.path, file => { file.taskPackage.content.language = 'en'; }, true);
  assert.throws(() => validateReview(mixed.reader, refs), /language/);
  const invalid = fixture();
  invalid.edit(invalid.item.path, file => { file.taskPackage.content.language = 'fr'; }, true);
  assert.throws(() => validateReview(invalid.reader, refs), /language/);
});

test('review accepts author English references and preserves old pinned schemas', () => {
  for (const legacy of [false, true]) {
    const f = fixture();
    if (legacy) {
      f.edit(f.item.taskPackageSchemaPath, schema => { delete schema.properties.authoringPackage.properties.englishTranslations; }, true);
      f.edit(f.item.registrySnapshotPath, registry => { delete registry.taskPackageSchema.properties.authoringPackage.properties.englishTranslations; }, true);
    }
    f.edit(f.item.path, file => { file.taskPackage.authoringPackage.englishTranslations = structuredClone(englishTranslations); });
    const schemaBefore = f.head.get(f.item.taskPackageSchemaPath);
    const fileBefore = f.head.get(f.item.path);
    assert.equal(validateReview(f.reader, refs).itemCount, 1);
    assert.equal(f.head.get(f.item.taskPackageSchemaPath), schemaBefore);
    assert.equal(f.head.get(f.item.path), fileBefore);
  }
});

for (const [label, change] of [
  ['duplicate source', entries => { entries.push(structuredClone(entries[0])); }],
  ['Chinese instead of English', entries => { entries[0].englishText = '英文翻译'; }],
  ['blank English', entries => { entries[0].englishText = ' '; }],
  ['invalid source pointer', entries => { entries[0].path = '/bad~pointer'; }],
  ['extra metadata', entries => { entries[0].unexpected = true; }],
]) test(`review rejects ${label} even with a legacy author schema`, () => {
  const f = fixture();
  f.edit(f.item.taskPackageSchemaPath, schema => { delete schema.properties.authoringPackage.properties.englishTranslations; }, true);
  f.edit(f.item.registrySnapshotPath, registry => { delete registry.taskPackageSchema.properties.authoringPackage.properties.englishTranslations; }, true);
  f.edit(f.item.path, file => {
    file.taskPackage.authoringPackage.englishTranslations = structuredClone(englishTranslations);
    change(file.taskPackage.authoringPackage.englishTranslations);
  });
  assert.throws(() => validateReview(f.reader, refs), /translation/i);
});

test('legacy projection still rejects unrelated author metadata', () => {
  const f = fixture();
  f.edit(f.item.taskPackageSchemaPath, schema => { delete schema.properties.authoringPackage.properties.englishTranslations; }, true);
  f.edit(f.item.registrySnapshotPath, registry => { delete registry.taskPackageSchema.properties.authoringPackage.properties.englishTranslations; }, true);
  f.edit(f.item.path, file => { file.taskPackage.authoringPackage.englishTranslations = structuredClone(englishTranslations); file.taskPackage.authoringPackage.unknown = 'unsupported'; });
  assert.throws(() => validateReview(f.reader, refs), /schema/);
});

test('registered user-created context passes full canonical schema', () => {
  const f = fixture({ contextId: 'CTX-CUSTOM-52f40dd1-18f4-4b01-a13e-9b489d729c80' });
  assert.equal(validateReview(f.reader, refs).itemCount, 1);
});

for (const [name, mutate, message] of [
  ['reviewer item schema downgrade', file => { file.schemaVersion = '1.0'; }, /Item schema version/],
  ['immutable source hash', file => { file.source.contentHash = 'forged'; }, /source/],
  ['item identity', file => { file.itemId = 'another-item'; }, /identity/],
  ['task family', file => { file.taskPackage.taskFamilyId = 'TF-SHORT-TEXT-COMPREHENSION'; }, /taskFamilyId/],
  ['registry version', file => { file.taskPackage.specVersions.registryBundleVersion = 'other'; }, /registry/],
  ['primary Can-do', file => { file.taskPackage.content.primaryCanDoId = 'A1-R2'; }, /primaryCanDoId/],
  ['context', file => { file.taskPackage.content.contextId = 'D01'; }, /contextId/],
  ['scoring contract', file => { file.taskPackage.scoringPackage.scoringContractTemplateId = 'other'; }, /scoringContractTemplateId/],
  ['review gate forgery', file => { file.taskPackage.reviewPackage.gates.approved = true; }, /reviewPackage/],
  ['schema type violation', file => { file.taskPackage.candidatePayload.shuffleOptions = 'yes'; }, /schema/],
  ['missing answer reference', file => { file.taskPackage.scoringPackage.correctOptionId = 'missing'; }, /existing option/],
  ['invalid score total', file => { file.taskPackage.scoringPackage.maxRawScore = 8; }, /sum/],
  ['unknown language content', file => { file.taskPackage.content.targetContentIds = ['UNKNOWN']; }, /unregistered/],
  ['unknown information scoring ref', file => { file.taskPackage.content.requiredInformationPoints[0].scoringPointId = 'unknown'; }, /scoring reference/],
  ['unknown root field', file => { file.unexpected = true; }, /fields/],
]) test(`rejects ${name}`, () => {
  const f = fixture(); f.edit(f.item.path, mutate); assert.throws(() => validateReview(f.reader, refs), message);
});

for (const key of ['answer_key', 'correctOptionId', 'scoringPackage', 'Review_Gates', 'authorNotes', 'englishTranslations', 'English_Translations']) {
  test(`recursively rejects ${key} in otherwise schema-valid nested form sourceProfile`, () => {
    const f = fixture({ form: true });
    f.edit(f.item.path, file => { file.taskPackage.candidatePayload.sourceProfile.details = [{ nested: { [key]: 'secret' } }]; });
    assert.throws(() => validateReview(f.reader, refs), /candidate-visible/);
  });
}

for (const name of ['manifest', 'snapshot', 'task schema', 'candidate schema']) test(`rejects modified ${name}`, () => {
  const f = fixture();
  const path = { manifest: f.manifestPath, snapshot: f.item.registrySnapshotPath, 'task schema': f.item.taskPackageSchemaPath,
    'candidate schema': f.item.candidateSchemaPath }[name];
  f.head.set(path, '{}'); assert.throws(() => validateReview(f.reader, refs), /Only this batch/);
});

test('rejects foreign batch item additions before parsing payloads', () => {
  const f = fixture(); f.head.set('items/foreign.json', 'malformed');
  assert.throws(() => validateReview(f.reader, refs), /Only this batch/);
});
test('rejects attempts to change trusted validation scripts', () => {
  const f = fixture(); f.head.set('scripts/validate-review.mjs', 'process.exit(0)');
  assert.throws(() => validateReview(f.reader, refs), /Only this batch/);
});
test('rejects deleting an in-batch item', () => {
  const f = fixture(); f.head.delete(f.item.path); assert.throws(() => validateReview(f.reader, refs), /Missing file/);
});
test('rejects rewritten history lacking the protected submission', () => {
  const f = fixture(); f.reader.ancestor = () => false;
  assert.throws(() => validateReview(f.reader, refs), /protected submission/);
});
test('rejects unregistered custom contexts even when the JSON schema accepts their syntax', () => {
  const f = fixture(); f.edit(f.item.path, file => { file.taskPackage.content.contextId = 'CTX-CUSTOM-unknown'; }, true);
  assert.throws(() => validateReview(f.reader, refs), /Context is unavailable/);
});
test('checks registry ranges beyond the broad difficulty JSON schema', () => {
  const f = fixture(); f.edit(f.item.path, file => { file.taskPackage.content.difficulty.drivers.informationPoints = 4; }, true);
  assert.throws(() => validateReview(f.reader, refs), /configured range/);
});
test('modern missing combination does not inherit global difficulty', () => {
  const f = fixture(); f.edit(f.item.registrySnapshotPath, registry => { registry.capabilityDifficultyProfileSets = []; }, true);
  assert.throws(() => validateReview(f.reader, refs), /unavailable/);
});
