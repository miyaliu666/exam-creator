const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');
const root = path.resolve(__dirname, '../..');
const bundle = path.join(root, 'registries/Chinese_A1_Workbench_Registries_v0.2_provisional');
const read = relative => YAML.parse(fs.readFileSync(path.join(bundle, relative), 'utf8'));
const rules = read('rules/a1-item-rule-registry-v0.3.yaml').entries;
const mapping = JSON.parse(fs.readFileSync(path.join(__dirname, 'v0.2-provisional/item-rule-id-mapping.json'), 'utf8'));

test('all 21 migrated rules retain exact independent identities and explicit delivery policies', () => {
  assert.equal(rules.length, 21);
  assert.equal(new Set(rules.map(rule => rule.itemRuleId)).size, 21);
  for (const old of mapping) {
    const id = 'legacy-rule-' + crypto.createHash('sha256').update(JSON.stringify([old.blueprintSlotId, old.itemFormatId, old.primaryCanDoId]), 'utf8').digest('hex');
    const rule = rules.find(entry => entry.itemRuleId === id);
    assert.ok(rule);
    assert.deepEqual(rule.allowedItemFormatIds, [old.itemFormatId]);
    assert.equal(rule.primaryCanDoId, old.primaryCanDoId);
    assert.equal(Object.keys(rule.deliveryPolicyRefs).length, 6);
    assert.equal(Object.hasOwn(rule, 'blueprintSlotId'), false);
    if (old.blueprintSlotId === 'L-A1-2') assert.equal(rule.deliveryPolicyRefs.pauseProfileId, 'PAUSE-A1-DIALOGUE-v0.1');
    if (old.itemFormatId === 'IF-RESTRICTED-INPUT') assert.equal(rule.deliveryPolicyRefs.inputPolicyId, 'INPUT-RESTRICTED-FIELD-v0.1');
  }
});

test('shared scoring, task families, references and delivery maps resolve only current Item rules', () => {
  const ids = new Set(rules.map(rule => rule.itemRuleId));
  for (const entry of [...read('formats/a1-task-family-registry-v0.2-provisional.yaml').entries,
    ...read('scoring/a1-scoring-registry-v0.2-provisional.yaml').scoringContractTemplates,
    ...read('scoring/a1-scoring-registry-v0.2-provisional.yaml').taskSpecificCriteria]) {
    assert.ok(entry.itemRuleIds.length);
    assert.ok(entry.itemRuleIds.every(id => ids.has(id)));
    assert.equal(Object.hasOwn(entry, 'blueprintSlotId'), false);
    assert.equal(Object.hasOwn(entry, 'blueprintSlotIds'), false);
  }
  const references = read('references/a1-reference-task-registry-v0.2-provisional.yaml').entries;
  assert.equal(references.length, 21);
  assert.ok(references.every(entry => ids.has(entry.itemRuleId) && !Object.hasOwn(entry, 'slot')));
  const policies = read('policies/a1-delivery-policy-registry-v0.2-provisional.yaml');
  assert.equal(Object.hasOwn(policies, 'slotPolicyMap'), false);
  assert.deepEqual(new Set(Object.keys(policies.itemRulePolicyMap)), ids);
});

test('current TaskPackage contract and examples have direct rule identity and version 0.2', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'contracts/language-item-task-package-v0.2.schema.json'), 'utf8'));
  assert.ok(schema.required.includes('itemRuleId'));
  assert.equal(Object.hasOwn(schema.properties, 'blueprintSlotId'), false);
  assert.equal(schema.properties.specVersions.properties.taskPackageVersion.const, '0.2');
  for (const name of fs.readdirSync(path.join(bundle, 'examples')).filter(name => name.endsWith('.json'))) {
    const example = JSON.parse(fs.readFileSync(path.join(bundle, 'examples', name), 'utf8'));
    assert.ok(rules.some(rule => rule.itemRuleId === example.itemRuleId));
    assert.equal(Object.hasOwn(example, 'blueprintSlotId'), false);
    assert.equal(example.specVersions.taskPackageVersion, '0.2');
  }
});
