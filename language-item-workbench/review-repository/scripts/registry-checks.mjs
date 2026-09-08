import { isDeepStrictEqual } from 'node:util';

export function requireRule(condition, message) {
  if (!condition) throw new Error(message);
}
export function same(actual, expected, label) {
  requireRule(isDeepStrictEqual(actual, expected), `${label}: does not match the locked reference`);
}
export function unique(values, label) {
  requireRule(values.every(value => typeof value === 'string' && value.trim()), `${label}: empty identifier`);
  requireRule(new Set(values).size === values.length, `${label}: duplicate identifier`);
}

export function validateLockedFields(current, original) {
  for (const key of ['schemaVersion', 'itemId', 'source']) same(current[key], original[key], key);
  const now = current.taskPackage;
  const before = original.taskPackage;
  for (const key of ['taskId', 'taskVersion', 'specVersions', 'blueprintSlotId', 'taskFamilyId',
    'itemFormatId', 'renderer', 'deliveryPolicyRefs', 'reviewPackage']) same(now[key], before[key], key);
  for (const key of ['primaryCanDoId', 'primaryReportedSkill', 'communicativeActivity', 'primaryDomain',
    'contextId', 'difficultyBand', 'difficulty']) same(now.content[key], before.content[key], `content.${key}`);
  for (const key of ['scoringContractTemplateId', 'scoringContractTemplateVersion', 'rubricId',
    'benchmarkSetVersion']) same(now.scoringPackage[key], before.scoringPackage[key], `scoringPackage.${key}`);
}

export function validateRegistry(pkg, registry) {
  same(pkg.specVersions.registryBundleVersion, registry.bundleVersion, 'Registry version');
  const matches = registry.capabilities.filter(cap => cap.blueprintSlotId === pkg.blueprintSlotId
    && cap.itemFormatId === pkg.itemFormatId && cap.primaryCanDoId === pkg.content.primaryCanDoId);
  requireRule(matches.length === 1, 'Task × format × Primary Can-do must resolve to exactly one configuration');
  const cap = matches[0];
  for (const key of ['taskFamilyId', 'itemFormatId']) same(pkg[key], cap[key], key);
  same(pkg.renderer.rendererId, cap.rendererId, 'Renderer');
  same(pkg.deliveryPolicyRefs, cap.deliveryPolicyRefs, 'Delivery policy');
  for (const key of ['primaryCanDoId', 'primaryReportedSkill', 'communicativeActivity']) {
    same(pkg.content[key], cap[key], key);
  }
  const canDo = registry.canDoOptions.find(entry => entry.id === cap.primaryCanDoId);
  requireRule(canDo, 'Primary Can-do is not registered');
  same(canDo.primarySkill, cap.primaryReportedSkill, 'Primary Can-do skill');
  same(canDo.activity, cap.communicativeActivity, 'Primary Can-do activity');
  const contract = registry.scoringContracts.find(entry =>
    entry.scoringContractTemplateId === cap.scoringContractTemplateId);
  requireRule(contract, 'Scoring contract is not registered');
  same(pkg.scoringPackage.scoringContractTemplateId, contract.scoringContractTemplateId, 'Scoring contract');
  same(pkg.scoringPackage.scoringContractTemplateVersion, contract.templateVersion, 'Scoring contract version');
  same(pkg.blueprintSlotId, contract.blueprintSlotId, 'Scoring slot');
  same(pkg.itemFormatId, contract.itemFormatId, 'Scoring format');
  const rubric = !contract.rubricId || contract.rubricId === 'notApplicable' ? null : contract.rubricId;
  same(pkg.scoringPackage.rubricId ?? null, rubric, 'Scoring rubric');
  const context = registry.contextOptions.find(entry => entry.id === pkg.content.contextId);
  requireRule(context && !context.retired && cap.allowedContextIds.includes(context.id)
    && cap.allowedDomains.includes(pkg.content.primaryDomain)
    && context.primaryDomains.includes(pkg.content.primaryDomain)
    && context.canDoIds.includes(cap.primaryCanDoId), 'Context is unavailable for the Primary Can-do/domain');
  const content = pkg.content;
  requireRule(content.targetContentIds.length > 0, 'At least one core language target is required');
  for (const [key, supporting] of [['targetContentIds', false], ['supportingContentRefs', true]]) {
    unique(content[key], key);
    for (const id of content[key]) {
      const entry = registry.contentIdOptions.find(option => option.id === id);
      requireRule(entry, `${key}: unregistered language content`);
      requireRule((entry.kind === 'supported') === supporting, `${key}: incorrect content partition`);
      requireRule(!entry.contextIds.length || entry.contextIds.includes(context.id), `${key}: incompatible context`);
      requireRule(!entry.canDoIds.length || entry.canDoIds.some(ref =>
        ref === cap.primaryCanDoId || cap.supportingCanDoIds.includes(ref)), `${key}: incompatible Can-do`);
      const productive = ['Writing', 'Speaking'].includes(cap.primaryReportedSkill);
      requireRule(!entry.masteryScope || entry.masteryScope === 'receptiveProductive'
        || entry.masteryScope === (productive ? 'productive' : 'receptive'), `${key}: incompatible mastery scope`);
    }
  }
  validateDifficulty(pkg, registry, cap);
  const pointIds = pkg.scoringPackage.scoringPoints.map(point => point.scoringPointId);
  unique(content.requiredInformationPoints.map(point => point.id), 'Information points');
  requireRule(content.requiredInformationPoints.length === (content.difficulty?.drivers.informationPoints ?? 1),
    'Information point count does not match the difficulty profile');
  for (const point of content.requiredInformationPoints) {
    requireRule(point.label.trim(), 'Information point label is required');
    requireRule(!point.scoringPointId || pointIds.includes(point.scoringPointId), 'Information point scoring reference is unknown');
  }
  for (const point of pkg.scoringPackage.scoringPoints) {
    requireRule(!point.normalizationPolicyId || point.normalizationPolicyId === contract.normalization.policyId,
      'Scoring point normalization policy does not match its contract');
  }
}

function validateDifficulty(pkg, registry, cap) {
  const modern = (registry.settingsSchemaVersion ?? 0) >= 1;
  const profiles = registry.capabilityDifficultyProfileSets ?? [];
  const standards = !modern && !profiles.length ? registry.difficultyStandards : profiles.find(entry =>
    entry.blueprintSlotId === cap.blueprintSlotId && entry.itemFormatId === cap.itemFormatId
    && entry.primaryCanDoId === cap.primaryCanDoId)?.standards;
  const standard = standards?.find(entry => entry.id === pkg.content.difficultyBand);
  requireRule(standard, 'Difficulty band is unavailable for this configuration');
  const profile = pkg.content.difficulty;
  if (!profile) { requireRule(!modern, 'Modern settings require a difficulty profile'); return; }
  same(profile.intendedBand, pkg.content.difficultyBand, 'Intended difficulty');
  requireRule(['AuthorEstimated', 'ExpertEstimated', 'HumanConfirmed', 'Piloted'].includes(profile.status), 'Invalid difficulty status');
  requireRule(profile.rationale.some(value => typeof value === 'string' && value.trim()), 'Difficulty rationale is required');
  const driver = profile.drivers;
  requireRule(driver.inferenceRequired === false, 'Complex inference is not allowed at A1');
  requireRule(Number.isInteger(driver.informationPoints) && driver.informationPoints >= 1, 'Invalid information point count');
  requireRule(['wordOrPhrase', 'shortSentence', 'twoRelatedPhrases'].includes(driver.inputLength), 'Invalid A1 input length');
  requireRule(['high', 'moderate', 'limited'].includes(driver.supportLevel), 'Invalid support level');
  requireRule(['clear', 'moderate', 'close', 'notApplicable'].includes(driver.distractorSimilarity), 'Invalid distractor similarity');
  if (modern) {
    requireRule(driver.informationPoints >= standard.informationPointsMin
      && driver.informationPoints <= standard.informationPointsMax
      && standard.allowedInputLengths.includes(driver.inputLength)
      && standard.allowedSupportLevels.includes(driver.supportLevel), 'Difficulty driver is outside the configured range');
    if (['IF-SINGLE-SELECT', 'IF-MATCHING'].includes(pkg.itemFormatId)) {
      requireRule(standard.allowedDistractorSimilarities.includes(driver.distractorSimilarity), 'Distractor similarity is outside the configured range');
    }
  } else requireRule(driver.informationPoints <= 2, 'Legacy A1 profiles allow at most two information points');
  if (profile.empiricalDifficulty?.status === 'NotPiloted') {
    requireRule(['sampleId', 'observedBand', 'percentCorrect'].every(key => profile.empiricalDifficulty[key] == null),
      'Unpiloted items cannot contain empirical results');
  }
}
