// One-time source migration; archived inputs are never loaded by current runtime.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const YAML = require('yaml');
const root = path.resolve(__dirname, '../..');
const bundle = path.join(root, 'registries/Chinese_A1_Workbench_Registries_v0.2_provisional');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); };
const writeJson = (file, data) => write(file, JSON.stringify(data, null, 2) + '\n');
const yaml = data => YAML.stringify(JSON.parse(JSON.stringify(data)), { indentSeq: false, lineWidth: 0 });
const ruleId = (slot, format, primary) => 'legacy-rule-' + crypto.createHash('sha256').update(JSON.stringify([slot, format, primary]), 'utf8').digest('hex');
function deliveryPolicy(slot, format) {
  return {
    navigationPolicyId: slot.startsWith('L-') ? 'NAV-FORWARD-TASK-v0.1' : slot.startsWith('S-') ? 'NAV-FORWARD-RECORDING-v0.1' : 'NAV-REVIEW-WITHIN-MODULE-v0.1',
    inputPolicyId: format === 'IF-RESTRICTED-INPUT' ? 'INPUT-RESTRICTED-FIELD-v0.1' : slot.startsWith('W-') ? 'INPUT-EXAM-STANDARDIZED-PINYIN-v0.1' : 'notApplicable',
    playbackPolicyId: slot.startsWith('L-') ? 'PLAY-COMPLETE-TWICE-v0.1' : 'notApplicable',
    recordingPolicyId: ['S-A1-1', 'S-A1-3'].includes(slot) ? 'REC-MULTITURN-A1-v0.1' : slot.startsWith('S-') ? 'REC-SINGLE-A1-v0.1' : 'notApplicable',
    speakingRateProfileId: /^[LS]-/.test(slot) ? 'RATE-A1-CLEAR-SLOW-v0.1' : 'notApplicable',
    pauseProfileId: ['L-A1-2', 'S-A1-1', 'S-A1-3'].includes(slot) ? 'PAUSE-A1-DIALOGUE-v0.1' : /^[LS]-/.test(slot) ? 'PAUSE-A1-SENTENCE-v0.1' : 'notApplicable',
  };
}
const previousRules = path.join(bundle, 'blueprint/a1-slot-registry-v0.2-provisional.yaml');
const archive = path.join(root, 'registries/legacy/v0.2-provisional');
const archivedRules = path.join(archive, 'a1-slot-registry-v0.2-provisional.yaml');
if (fs.existsSync(previousRules)) { write(archivedRules, fs.readFileSync(previousRules)); fs.unlinkSync(previousRules); }
const oldRules = YAML.parse(fs.readFileSync(archivedRules, 'utf8'));
const mapping = oldRules.entries.flatMap(row => row.allowedItemFormatIds.map(format => ({
  blueprintSlotId: row.blueprintSlotId, itemFormatId: format, primaryCanDoId: row.primaryCanDoId,
  itemRuleId: ruleId(row.blueprintSlotId, format, row.primaryCanDoId),
})));
const entries = oldRules.entries.flatMap(row => row.allowedItemFormatIds.map(format => {
  const { blueprintSlotId, slotVersion, ...rest } = row;
  return { itemRuleId: ruleId(blueprintSlotId, format, row.primaryCanDoId), ...rest, ruleVersion: '0.3-provisional', allowedItemFormatIds: [format], deliveryPolicyRefs: deliveryPolicy(blueprintSlotId, format) };
}));
write(path.join(bundle, 'rules/a1-item-rule-registry-v0.3.yaml'), yaml({ registryType: 'A1ItemRuleRegistry', registryVersion: '0.3-provisional', status: oldRules.status, entries }));
for (const relative of ['formats/a1-task-family-registry-v0.2-provisional.yaml', 'scoring/a1-scoring-registry-v0.2-provisional.yaml']) {
  const file = path.join(bundle, relative), archived = path.join(archive, path.basename(relative));
  if (!fs.existsSync(archived)) write(archived, fs.readFileSync(file));
  const data = YAML.parse(fs.readFileSync(archived, 'utf8'));
  data.registryVersion = '0.3-provisional';
  for (const entry of data.entries ?? []) if (entry.blueprintSlotIds) {
    entry.itemRuleIds = mapping.filter(row => entry.blueprintSlotIds.includes(row.blueprintSlotId)).map(row => row.itemRuleId);
    delete entry.blueprintSlotIds;
  }
  for (const entry of [...(data.scoringContractTemplates ?? []), ...(data.taskSpecificCriteria ?? [])]) {
    entry.itemRuleIds = mapping.filter(row => row.blueprintSlotId === entry.blueprintSlotId && (!entry.itemFormatId || row.itemFormatId === entry.itemFormatId)).map(row => row.itemRuleId);
    delete entry.blueprintSlotId;
  }
  write(file, yaml(data));
}
const referenceFile = path.join(bundle, 'references/a1-reference-task-registry-v0.2-provisional.yaml');
const archivedReferences = path.join(archive, path.basename(referenceFile));
if (!fs.existsSync(archivedReferences)) write(archivedReferences, fs.readFileSync(referenceFile));
// The historical line-based loader accepted unquoted colons in these prose scalars.
const referenceText = fs.readFileSync(archivedReferences, 'utf8').replace(/^(  (?:valid|invalid|lower|typical|upper): )(.*)$/gm, (_line, key, value) => key + JSON.stringify(value.trimEnd()));
const references = YAML.parse(referenceText);
references.registryVersion = '0.3-provisional';
references.entries = references.entries.flatMap(({ slot, ...entry }) => mapping.filter(row => row.blueprintSlotId === slot).map(row => ({ itemRuleId: row.itemRuleId, ...entry })));
write(referenceFile, yaml(references));
const policyFile = path.join(bundle, 'policies/a1-delivery-policy-registry-v0.2-provisional.yaml');
const archivedPolicy = path.join(archive, path.basename(policyFile));
if (!fs.existsSync(archivedPolicy)) write(archivedPolicy, fs.readFileSync(policyFile));
const policies = YAML.parse(fs.readFileSync(archivedPolicy, 'utf8'));
policies.registryVersion = '0.3-provisional'; delete policies.slotPolicyMap;
policies.itemRulePolicyMap = Object.fromEntries(entries.map(entry => [entry.itemRuleId, entry.deliveryPolicyRefs]));
write(policyFile, yaml(policies));
const manifestFile = path.join(bundle, 'manifest.json'), manifest = json(manifestFile);
manifest.bundleVersion = '0.3-provisional'; manifest.generatedAt = '2026-09-14'; delete manifest.counts.slots; manifest.counts.itemRules = entries.length;
writeJson(manifestFile, manifest);
const oldContract = path.join(root, 'contracts/language-item-task-package-v0.1.schema.json');
const archivedContract = path.join(root, 'contracts/legacy/language-item-task-package-v0.1.schema.json');
if (fs.existsSync(oldContract)) { write(archivedContract, fs.readFileSync(oldContract)); fs.unlinkSync(oldContract); }
const contract = json(archivedContract);
contract.$id = 'urn:fcc:exam-creator:language-item-task-package:0.2'; contract.title = 'Exam Creator Language Item TaskPackage v0.2';
contract.required = contract.required.map(key => key === 'blueprintSlotId' ? 'itemRuleId' : key);
delete contract.properties.blueprintSlotId; contract.properties.itemRuleId = { type: 'string', minLength: 1 };
contract.properties.specVersions.properties.taskPackageVersion.const = '0.2';
contract.properties.scoringPackage.properties.scoringContractTemplateId = { type: 'string', minLength: 1 };
writeJson(path.join(root, 'contracts/language-item-task-package-v0.2.schema.json'), contract);
writeJson(path.join(root, 'review-repository/tests/fixtures/task-package.schema.json'), contract);
const bundleSchemaFile = path.join(bundle, 'schemas/task-package.schema.json'), bundleSchema = json(bundleSchemaFile);
bundleSchema.$id = 'urn:fcc:a1:task-package:0.3'; bundleSchema.required = bundleSchema.required.map(key => key === 'blueprintSlotId' ? 'itemRuleId' : key);
delete bundleSchema.properties.blueprintSlotId; bundleSchema.properties.itemRuleId = { type: 'string', minLength: 1 };
writeJson(bundleSchemaFile, bundleSchema);
for (const name of fs.readdirSync(path.join(bundle, 'examples'))) if (name.endsWith('.json')) {
  const file = path.join(bundle, 'examples', name), example = json(file);
  if (!example.blueprintSlotId) continue;
  const primary = example.content?.primaryCanDoId ?? example.authoringPackage?.primaryCanDoId;
  const matches = mapping.filter(row => row.blueprintSlotId === example.blueprintSlotId && row.itemFormatId === example.itemFormatId && (!primary || row.primaryCanDoId === primary));
  if (matches.length !== 1) throw new Error('Ambiguous example identity: ' + name);
  example.itemRuleId = matches[0].itemRuleId; delete example.blueprintSlotId;
  if (example.specVersions) { example.specVersions.taskPackageVersion = '0.2'; example.specVersions.registryBundleVersion = '0.3-provisional'; }
  writeJson(file, example);
}
writeJson(path.join(archive, 'item-rule-id-mapping.json'), mapping);
console.log('Migrated ' + entries.length + ' exact item rules.');
