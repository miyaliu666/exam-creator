import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const schema = name => JSON.parse(readFileSync(new URL(`fixtures/${name}.schema.json`, import.meta.url), 'utf8'));
export const refs = { base: 'a'.repeat(40), submission: 'b'.repeat(40), head: 'c'.repeat(40), batchId: 'batch-test' };
export function fixture({ form = false, contextId = 'D12' } = {}) {
  const taskSchema = schema('task-package');
  const candidateSchema = schema(form ? 'form-entry' : 'single-select');
  const format = form ? 'IF-FORM-ENTRY' : 'IF-SINGLE-SELECT';
  const primary = form ? 'A1-W1' : 'A1-R1';
  const itemRuleId = form ? 'test-rule-form' : 'test-rule-reading';
  const skill = form ? 'Writing' : 'Reading';
  const activity = form ? 'Production' : 'Reception';
  const family = form ? 'TF-FORM-COMPLETION' : 'TF-SIGNS-NOTICES';
  const registryVersion = 'settings-fixture-1';
  const contractId = `SCT-${itemRuleId}-${format.slice(3)}-v0.1`;
  const delivery = Object.fromEntries(['navigationPolicyId', 'inputPolicyId', 'playbackPolicyId',
    'recordingPolicyId', 'speakingRateProfileId', 'pauseProfileId'].map(key => [key, `POL-${key}`]));
  const responseIds = form ? ['NAME', 'AGE', 'CITY', 'DATE'] : ['ITEM'];
  const pkg = {
    taskId: 'LI-test', taskVersion: '1', specVersions: { planningSpecVersion: '0.2-provisional', registryBundleVersion: registryVersion, taskPackageVersion: '0.2' },
    itemRuleId, taskFamilyId: family, itemFormatId: format,
    renderer: { rendererId: `REN-${format.slice(3)}`, rendererVersion: '0.1' },
    candidatePayload: form ? { situation: '填写报名表', instructions: '请填写个人信息。', sourceProfile: { name: '小王', details: [{ city: '北京' }] },
      fields: responseIds.map(fieldId => ({ fieldId, label: fieldId, inputType: 'shortText', required: true })) }
      : { stimulus: { text: '请勿入内', imageRefs: [] }, prompt: '这个标志是什么意思？', options: [{ optionId: 'A', text: '不能进去' }, { optionId: 'B', text: '可以进去' }], shuffleOptions: true },
    authoringPackage: { notes: [] },
    scoringPackage: { itemScoringVersion: '1', scoringContractTemplateId: contractId, scoringContractTemplateVersion: '0.1',
      maxRawScore: responseIds.length, scoringPoints: responseIds.map(id => ({ scoringPointId: `SP-${id}`, description: '理解并回答', points: 1, normalizationPolicyId: 'NORM-EXACT' })),
      answerKeyRef: 'AK-LI-test', taskSpecificCriteria: [], ...(form ? { acceptedResponses: Object.fromEntries(responseIds.map(id => [id, ['示例']])) } : { correctOptionId: 'A' }) },
    reviewPackage: { gates: {} }, mediaRefs: [], deliveryPolicyRefs: delivery,
    content: { primaryCanDoId: primary, primaryReportedSkill: skill, communicativeActivity: activity,
      primaryDomain: 'Public', contextId, difficultyBand: 'TypicalA1', targetContentIds: ['LEX-test'], supportingContentRefs: [],
      requiredInformationPoints: [{ id: 'IP-1', pointType: 'action', label: '禁止进入', required: true, scoringPointId: `SP-${responseIds[0]}` }],
      difficulty: { intendedBand: 'TypicalA1', status: 'AuthorEstimated', drivers: { inputLength: 'shortSentence', informationPoints: 1, supportLevel: 'moderate', distractorSimilarity: form ? 'notApplicable' : 'moderate', outputLength: 'short', interactionTurns: 0, preparationTimeSeconds: null, independenceLevel: 'someSupport', inferenceRequired: false }, rationale: ['一个明确的信息点'], empiricalDifficulty: { status: 'NotPiloted', sampleId: null, observedBand: null, percentCorrect: null, discrimination: null, omissionRate: null, medianResponseTimeSeconds: null, decision: null } } }, variation: {},
  };
  const registry = {
    settingsSchemaVersion: 3, bundleVersion: registryVersion, taskPackageSchema: taskSchema, candidateSchemas: [candidateSchema],
    capabilities: [{ itemRuleId, itemFormatId: format, taskFamilyId: family, primaryCanDoId: primary,
      primaryReportedSkill: skill, communicativeActivity: activity, rendererId: pkg.renderer.rendererId,
      deliveryPolicyRefs: delivery, scoringContractTemplateId: contractId, supportingCanDoIds: [], allowedContextIds: [contextId], allowedDomains: ['Public'] }],
    canDoOptions: [{ id: primary, primarySkill: skill, activity }],
    scoringContracts: [{ scoringContractTemplateId: contractId, templateVersion: '0.1', itemRuleIds: [itemRuleId], itemFormatId: format,
      rubricId: 'notApplicable', normalization: { policyId: 'NORM-EXACT' } }],
    contextOptions: [{ id: contextId, primaryDomains: ['Public'], canDoIds: [primary], retired: false }],
    contentIdOptions: [{ id: 'LEX-test', kind: 'vocabulary', canDoIds: [primary], contextIds: [contextId], masteryScope: form ? 'productive' : 'receptive' }],
    capabilityDifficultyProfileSets: [{ itemRuleId, itemFormatId: format, primaryCanDoId: primary, standards: [{ id: 'TypicalA1',
      allowedInputLengths: ['shortSentence'], informationPointsMin: 1, informationPointsMax: 2, allowedSupportLevels: ['moderate'], allowedDistractorSimilarities: ['moderate'], defaultDrivers: { inferenceRequired: false } }] }],
  };
  const rulesPath = `review-batches/${refs.batchId}/rules/${createHash('sha256').update(registryVersion).digest('hex')}`;
  const item = { itemId: pkg.taskId, versionId: 'LIV-test', versionNumber: 1, path: `items/${pkg.taskId}.json`,
    contentHash: 'fnv1a64:0123456789abcdef', registryVersion, registrySnapshotPath: `${rulesPath}/snapshot.json`,
    taskPackageSchemaPath: `${rulesPath}/task-package.schema.json`, candidateSchemaPath: `${rulesPath}/${format}.schema.json` };
  const file = { schemaVersion: '1.1', itemId: item.itemId, title: 'Review fixture',
    source: { batchId: refs.batchId, versionId: item.versionId, versionNumber: 1, contentHash: item.contentHash }, taskPackage: pkg };
  const manifestPath = `review-batches/${refs.batchId}.json`;
  const files = new Map([[manifestPath, { schemaVersion: '1.1', batchId: refs.batchId, items: [item] }], [item.path, file],
    [item.registrySnapshotPath, registry], [item.taskPackageSchemaPath, taskSchema], [item.candidateSchemaPath, candidateSchema]]
    .map(([path, data]) => [path, JSON.stringify(data)]));
  const head = new Map(files);
  const reader = { parent: () => refs.base, ancestor: () => true,
    changed: before => before === refs.base ? [...files.keys()] : [...new Set([...files.keys(), ...head.keys()])].filter(path => files.get(path) !== head.get(path)),
    read: (ref, path) => { const value = (ref === refs.head ? head : files).get(path); if (value === undefined) throw new Error(`Missing file: ${path}`); return value; } };
  function edit(path, update, both = false) {
    const data = JSON.parse(head.get(path)); update(data); head.set(path, JSON.stringify(data));
    if (both) files.set(path, head.get(path));
  }
  return { reader, files, head, item, manifestPath, registry, pkg, edit };
}
