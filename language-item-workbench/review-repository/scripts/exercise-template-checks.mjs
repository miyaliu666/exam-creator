import { requireRule, same } from './registry-checks.mjs';

const transforms = new Set(['none', 'independent-columns', 'unordered-items', 'unordered-words', 'unordered-categories', 'masked-letters', 'blank-count', 'label-count']);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const list = value => Array.isArray(value) ? value : [];
const text = value => typeof value === 'string' ? value : '';
const sortedStrings = value => list(value).map(text).sort();

export function exerciseType(pkg) {
  if (!pkg.itemFormatId?.startsWith('EXERCISE:')) return null;
  const type = pkg.itemFormatId.slice('EXERCISE:'.length);
  requireRule(/^[a-z][a-z0-9-]*$/.test(type), 'Invalid exercise template type');
  return type;
}

/** Must match Rust review_schemas: no submitted schema can relax its pinned source. */
export function exerciseReviewSchemas(registry, type) {
  const pinned = registry.exerciseTemplateSchemas?.[type];
  requireRule(pinned && typeof pinned === 'object', 'Pinned exercise schema is unavailable');
  const source = structuredClone(pinned);
  delete source['x-exercise-template']; delete source.$schema;
  const candidate = { $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `urn:exam-creator:exercise-candidate:${type}:1`, type: 'object',
    required: ['exerciseType', 'body', 'data'], properties: { exerciseType: { const: type }, body: { type: 'string' }, data: { type: 'object' } }, additionalProperties: false };
  const task = structuredClone(registry.taskPackageSchema);
  const capabilities = registry.capabilities.filter(row => row.itemFormatId === `EXERCISE:${type}`);
  requireRule(capabilities.length, 'Pinned exercise has no enabled rule configuration');
  task.$id = `urn:exam-creator:exercise-task:${type}:1`;
  task.properties.itemRuleId = { enum: capabilities.map(row => row.itemRuleId) };
  task.properties.taskFamilyId = { enum: capabilities.map(row => row.taskFamilyId) };
  task.properties.itemFormatId = { const: `EXERCISE:${type}` };
  task.properties.renderer.properties.rendererId = { const: 'REN-EXERCISE-TEMPLATE' };
  task.properties.content.properties.primaryCanDoId = { enum: capabilities.map(row => row.primaryCanDoId) };
  task.properties.content.properties.primaryDomain = { enum: registry.allowedDomains };
  task.properties.content.properties.contextId = { type: 'string' };
  task.properties.authoringPackage.properties.exerciseTemplate = { type: 'object', required: ['exerciseType', 'body', 'data'],
    properties: { exerciseType: { const: type }, body: { type: 'string' }, data: source }, additionalProperties: false };
  task.properties.authoringPackage.required.push('exerciseTemplate');
  return { task, candidate };
}

function projectField(field, value, path, policy) {
  if (value === undefined || policy.privatePaths.includes(path)) return undefined;
  if (field.type === 'object') {
    const input = object(value), result = {};
    for (const child of field.properties ?? []) {
      const projected = projectField(child, input[child.key], `${path}.${child.key}`, policy);
      if (projected !== undefined) result[child.key] = projected;
    }
    if (Array.isArray(input.correct)) result.responseMode = 'multiple';
    return result;
  }
  if (field.type === 'array') return field.element ? list(value).map(entry => projectField(field.element, entry, `${path}.*`, policy)) : [];
  if (field.type === 'union') {
    const variant = field.variants?.find(entry => entry.type === 'array' ? Array.isArray(value) : entry.type === 'object' ? !!value && typeof value === 'object' && !Array.isArray(value) : entry.type === 'integer' || entry.type === 'number' ? typeof value === 'number' : typeof value === entry.type);
    return variant ? projectField(variant, value, path, policy) : undefined;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return undefined;
}

export function projectExerciseCandidate(document, pinnedSchema) {
  const definition = pinnedSchema?.['x-exercise-template'];
  const policy = definition?.projection;
  requireRule(Array.isArray(definition?.fields) && policy?.version === 1 && Array.isArray(policy.privatePaths) && transforms.has(policy.transform), 'Pinned exercise projection is unavailable or unsupported');
  const data = {};
  for (const field of definition.fields) {
    const value = projectField(field, document.data[field.key], field.key, policy);
    if (value !== undefined) data[field.key] = value;
  }
  switch (policy.transform) {
    case 'independent-columns': {
      const pairs = list(document.data.pairs).map(object);
      data.leftItems = pairs.map(pair => text(pair.left));
      data.rightItems = sortedStrings([...pairs.map(pair => pair.right), ...list(document.data.distractors)]); break;
    }
    case 'unordered-items': data.items = sortedStrings(document.data.items); break;
    case 'unordered-words': data.words = sortedStrings(document.data.words); break;
    case 'unordered-categories': data.items = list(data.items).sort((a, b) => text(object(a).text) < text(object(b).text) ? -1 : text(object(a).text) > text(object(b).text) ? 1 : 0); break;
    case 'masked-letters': data.text = text(document.data.text).replace(/\{([^|{}]+)\|(\d+)\}/g, (_match, word, count) => {
      const letters = Array.from(word), given = Math.min(letters.length, Number(count));
      return letters.slice(0, given).join('') + '_'.repeat(Math.max(0, letters.length - given));
    }); break;
    case 'blank-count': data.responseCount = list(document.data.blanks).length; break;
    case 'label-count': data.responseCount = list(document.data.labels).length; break;
  }
  return { exerciseType: document.exerciseType, body: document.body, data };
}

function validateAnswerReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.options)) for (const key of ['correct', 'correctIndex', 'correctIndices']) {
    if (value[key] === undefined) continue;
    const answers = Array.isArray(value[key]) ? value[key] : [value[key]];
    if (answers.every(answer => typeof answer === 'number')) requireRule(answers.every(answer => Number.isSafeInteger(answer) && answer >= 0 && answer < value.options.length)
      && new Set(answers).size === answers.length, 'Each correct answer index must identify a distinct existing option');
  }
  Object.values(value).forEach(validateAnswerReferences);
}

export function validateExerciseCandidate(pkg, registry) {
  const type = exerciseType(pkg);
  const authored = pkg.authoringPackage?.exerciseTemplate;
  requireRule(authored?.exerciseType === type && authored.data?.type === type, 'Exercise author data does not match the configured template');
  const sourceLanguage = text(authored.data.language).toLowerCase().split('-')[0];
  same(sourceLanguage, pkg.content.language ?? 'zh', 'Exercise content language');
  const rule = registry.exerciseTemplateRules?.find(entry => entry.id === pkg.itemRuleId && entry.exerciseType === type && entry.primaryCanDoId === pkg.content.primaryCanDoId);
  requireRule(rule?.enabled, 'Exercise template configuration is unavailable');
  same(pkg.candidatePayload, projectExerciseCandidate(authored, registry.exerciseTemplateSchemas[type]), 'Candidate-safe exercise projection');
  same(pkg.scoringPackage.answerKeyRef, 'authoringPackage.exerciseTemplate.data', 'Exercise answer reference');
  const definition = registry.exerciseTemplateSchemas[type]['x-exercise-template'].responseUnits;
  const entries = list(authored.data[definition?.path]);
  const count = definition?.mode === 'rows' ? entries.length : definition?.mode === 'nestedAnswers' ? entries.reduce((total, entry) => total + list(entry?.answers).length, 0) : 1;
  const expectedIds = rule.scoring.method === 'perResponse' && count > 0
    ? Array.from({ length: count }, (_, index) => `SP-RESPONSE-${index + 1}`) : ['SP-TEMPLATE'];
  same(pkg.scoringPackage.scoringPoints.map(point => point.scoringPointId), expectedIds, 'Exercise response scoring units');
  requireRule(pkg.scoringPackage.scoringPoints.every(point => point.points === 1), 'Exercise response units use one point each');
  same(pkg.scoringPackage.taskSpecificCriteria, [rule.scoring.criteria], 'Exercise scoring criteria');
  validateAnswerReferences(authored.data);
}
