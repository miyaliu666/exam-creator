import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fixture, refs } from './fixture.mjs';
import { fixture as legacyFixture } from './legacy/fixture.mjs';
import { validateReview } from '../scripts/validate-review.mjs';
import { exerciseReviewSchemas, projectExerciseCandidate } from '../scripts/exercise-template-checks.mjs';
import { exerciseReviewSchemas as legacyExerciseReviewSchemas } from '../scripts/legacy/exercise-template-checks.mjs';

// Standalone fixtures keep this repository template testable after copying it to GitHub.
const templates = JSON.parse(readFileSync(new URL('fixtures/exercise-templates.json', import.meta.url), 'utf8'));
const template = templates.find(entry => entry.id === 'multiple-choice');

function exerciseFixture({ contextId = '', method = 'exactMatch' } = {}) {
  const f = fixture();
  const registry = structuredClone(f.registry);
  registry.allowedDomains = ['Public'];
  const rule = { id: 'rule-test', exerciseType: template.id, primaryCanDoId: 'A1-R1', enabled: true, allowedDomains: ['Public'], allowedContextIds: [],
    scoring: { method, criteria: 'Identify the correct answer.', normalizationPolicy: 'Exact choice.' } };
  registry.exerciseTemplateRules = [rule];
  registry.exerciseTemplateSchemas = { [template.id]: { ...template.schema, 'x-exercise-template': { name: template.name, fields: template.fields, projection: template.projection, responseUnits: { mode: 'rows', path: 'questions' } } } };
  const cap = registry.capabilities[0];
  cap.itemRuleId = 'rule-test'; cap.taskFamilyId = `exercise:${cap.itemRuleId}`; cap.itemFormatId = 'EXERCISE:multiple-choice';
  cap.rendererId = 'REN-EXERCISE-TEMPLATE'; cap.allowedContextIds = [];
  const contract = registry.scoringContracts[0];
  contract.itemRuleIds = [cap.itemRuleId]; contract.itemFormatId = cap.itemFormatId;
  const profile = registry.capabilityDifficultyProfileSets[0];
  profile.itemRuleId = cap.itemRuleId; profile.itemFormatId = cap.itemFormatId;
  registry.contentIdOptions[0].contextIds = [];
  const pkg = structuredClone(f.pkg);
  pkg.itemRuleId = cap.itemRuleId; pkg.taskFamilyId = cap.taskFamilyId; pkg.itemFormatId = cap.itemFormatId;
  pkg.renderer.rendererId = cap.rendererId; pkg.content.contextId = contextId;
  pkg.authoringPackage.exerciseTemplate = { exerciseType: template.id, body: 'Read and choose the answer.', data: {
    type: template.id, title: 'Class notice', level: 'A1', language: 'zh-CN', teacherNotes: 'PRIVATE NOTES',
    questions: [{ prompt: 'Which room?', options: ['Room 1', 'Room 2'], correct: 0, explanation: 'PRIVATE ANSWER' }],
  } };
  pkg.candidatePayload = projectExerciseCandidate(pkg.authoringPackage.exerciseTemplate, registry.exerciseTemplateSchemas[template.id]);
  pkg.scoringPackage.scoringPoints[0].scoringPointId = method === 'perResponse' ? 'SP-RESPONSE-1' : 'SP-TEMPLATE';
  pkg.content.requiredInformationPoints[0].scoringPointId = pkg.scoringPackage.scoringPoints[0].scoringPointId;
  pkg.scoringPackage.answerKeyRef = 'authoringPackage.exerciseTemplate.data';
  pkg.scoringPackage.taskSpecificCriteria = [rule.scoring.criteria];
  delete pkg.scoringPackage.correctOptionId;
  const schemas = exerciseReviewSchemas(registry, template.id);
  const oldTask = f.item.taskPackageSchemaPath, oldCandidate = f.item.candidateSchemaPath;
  const directory = oldTask.slice(0, oldTask.lastIndexOf('/'));
  f.item.taskPackageSchemaPath = `${directory}/task-package-exercise-${template.id}.schema.json`;
  f.item.candidateSchemaPath = `${directory}/exercise-${template.id}.schema.json`;
  for (const map of [f.files, f.head]) {
    map.delete(oldTask); map.delete(oldCandidate);
    const manifest = JSON.parse(map.get(f.manifestPath)); manifest.items[0] = f.item;
    map.set(f.manifestPath, JSON.stringify(manifest));
    map.set(f.item.registrySnapshotPath, JSON.stringify(registry));
    map.set(f.item.taskPackageSchemaPath, JSON.stringify(schemas.task));
    map.set(f.item.candidateSchemaPath, JSON.stringify(schemas.candidate));
    const file = JSON.parse(map.get(f.item.path)); file.taskPackage = pkg; map.set(f.item.path, JSON.stringify(file));
  }
  return { ...f, registry, pkg };
}

test('generic review accepts source answers privately with optional or compatible named Context', () => {
  for (const contextId of ['', 'D12']) for (const method of ['exactMatch', 'perResponse']) {
    const f = exerciseFixture({ contextId, method });
    assert.equal(validateReview(f.reader, refs).itemCount, 1);
    assert.equal(JSON.stringify(f.pkg.candidatePayload).includes('PRIVATE'), false);
    f.edit(f.item.path, file => { file.taskPackage.authoringPackage.exerciseTemplate.data.questions[0].correct = 1; });
    assert.equal(validateReview(f.reader, refs).itemCount, 1, 'reviewers may correct a private answer without exposing it');
  }
});

test('shared exercise rules require source, candidate and target languages to match the item', () => {
  for (const language of ['en', 'es']) {
    const f = exerciseFixture();
    f.edit(f.item.registrySnapshotPath, registry => { registry.contentIdOptions[0].language = language; }, true);
    f.edit(f.item.path, file => {
      const pkg = file.taskPackage;
      pkg.content.language = language;
      pkg.authoringPackage.exerciseTemplate.data.language = language;
      pkg.candidatePayload = projectExerciseCandidate(pkg.authoringPackage.exerciseTemplate, f.registry.exerciseTemplateSchemas[template.id]);
    }, true);
    assert.equal(validateReview(f.reader, refs).itemCount, 1);
    f.edit(f.item.path, file => {
      file.taskPackage.authoringPackage.exerciseTemplate.data.language = 'zh-CN';
      file.taskPackage.candidatePayload = projectExerciseCandidate(file.taskPackage.authoringPackage.exerciseTemplate, f.registry.exerciseTemplateSchemas[template.id]);
    });
    assert.throws(() => validateReview(f.reader, refs), /Exercise content language/);
  }
});

test('historical source-template submissions retain their pinned identity and answer privacy', () => {
  const f = exerciseFixture();
  const legacy = legacyFixture();
  for (const map of [f.files, f.head]) {
    const registry = JSON.parse(map.get(f.item.registrySnapshotPath));
    registry.settingsSchemaVersion = 2;
    registry.taskPackageSchema = legacy.registry.taskPackageSchema;
    const cap = registry.capabilities[0], profile = registry.capabilityDifficultyProfileSets[0], contract = registry.scoringContracts[0];
    cap.blueprintSlotId = 'exercise:rule-test'; delete cap.itemRuleId;
    profile.blueprintSlotId = cap.blueprintSlotId; delete profile.itemRuleId;
    contract.blueprintSlotId = cap.blueprintSlotId; delete contract.itemRuleIds;
    contract.scoringContractTemplateId = legacy.pkg.scoringPackage.scoringContractTemplateId;
    cap.scoringContractTemplateId = contract.scoringContractTemplateId;
    const file = JSON.parse(map.get(f.item.path));
    file.taskPackage.blueprintSlotId = cap.blueprintSlotId; delete file.taskPackage.itemRuleId;
    file.taskPackage.specVersions.taskPackageVersion = '0.1';
    file.taskPackage.scoringPackage.scoringContractTemplateId = contract.scoringContractTemplateId;
    const schemas = legacyExerciseReviewSchemas(registry, template.id);
    map.set(f.item.registrySnapshotPath, JSON.stringify(registry));
    map.set(f.item.taskPackageSchemaPath, JSON.stringify(schemas.task));
    map.set(f.item.candidateSchemaPath, JSON.stringify(schemas.candidate));
    map.set(f.item.path, JSON.stringify(file));
  }
  assert.equal(validateReview(f.reader, refs).itemCount, 1);
  f.edit(f.item.path, file => { file.taskPackage.candidatePayload.data.teacherNotes = 'PRIVATE'; });
  assert.throws(() => validateReview(f.reader, refs), /projection/);
});

for (const [name, mutate, pattern] of [
  ['private answer leak', pkg => { pkg.candidatePayload.data.questions[0].correct = 0; }, /projection/],
  ['private teacher notes', pkg => { pkg.candidatePayload.data.teacherNotes = 'PRIVATE'; }, /projection/],
  ['altered public prompt without author source', pkg => { pkg.candidatePayload.data.questions[0].prompt = 'Forged'; }, /projection/],
  ['source type mismatch', pkg => { pkg.authoringPackage.exerciseTemplate.data.type = 'listening'; }, /schema/],
  ['missing full source answers', pkg => { delete pkg.authoringPackage.exerciseTemplate.data.questions[0].correct; }, /schema/],
  ['out-of-range answer index', pkg => { pkg.authoringPackage.exerciseTemplate.data.questions[0].correct = 9; }, /existing option/],
  ['duplicate answer indices', pkg => { pkg.authoringPackage.exerciseTemplate.data.questions[0].correct = [0, 0]; pkg.candidatePayload.data.questions[0].responseMode = 'multiple'; }, /existing option/],
  ['altered response scoring', pkg => { pkg.scoringPackage.scoringPoints[0].scoringPointId = 'SP-forged'; pkg.content.requiredInformationPoints[0].scoringPointId = 'SP-forged'; }, /scoring units/],
]) test(`generic review rejects ${name}`, () => {
  const f = exerciseFixture(); f.edit(f.item.path, file => mutate(file.taskPackage));
  assert.throws(() => validateReview(f.reader, refs), pattern);
});

test('generic immutable schemas cannot be weakened, swapped or replaced by legacy paths', () => {
  const f = exerciseFixture();
  f.edit(f.item.taskPackageSchemaPath, schema => { delete schema.properties.authoringPackage.properties.exerciseTemplate; }, true);
  assert.throws(() => validateReview(f.reader, refs), /Pinned exercise TaskPackage schema/);
  const other = exerciseFixture();
  other.edit(other.item.candidateSchemaPath, schema => { schema.additionalProperties = true; }, true);
  assert.throws(() => validateReview(other.reader, refs), /Pinned exercise candidate schema/);
});

test('generic content scope never widens selected empty Contexts or explicit exclusions', () => {
  for (const scope of [{ contextScopeMode: 'selected', contextIds: [] }, { contextScopeMode: 'all', contextIds: [], excludedContextIds: [''] }]) {
    const f = exerciseFixture();
    f.edit(f.item.registrySnapshotPath, registry => Object.assign(registry.contentIdOptions[0], scope), true);
    assert.throws(() => validateReview(f.reader, refs), /incompatible context/);
  }
});

test('pinned template transform policies whitelist public fields and remove private notes', () => {
  assert.equal(templates.length, 8);
  for (const entry of templates) {
    const candidate = projectExerciseCandidate({ exerciseType: entry.id, body: 'Task', data: { type: entry.id, title: 'Item', teacherNotes: 'PRIVATE', privateExtension: 'PRIVATE' } },
      { 'x-exercise-template': { fields: entry.fields, projection: entry.projection } });
    assert.equal(JSON.stringify(candidate).includes('PRIVATE'), false, entry.id);
  }
});
