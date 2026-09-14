// Historical protected submissions only. Current runtime never creates these identities.
import { validateLockedFields, validateRegistry } from './registry-checks.mjs';
import { validateCandidate } from './candidate-checks.mjs';
import { exerciseReviewSchemas } from './exercise-template-checks.mjs';
import { requireRule } from '../registry-checks.mjs';

export function legacyPinnedValidation(original, registry, taskSchema) {
  const legacy = taskSchema.required?.includes('blueprintSlotId');
  if (!legacy) {
    requireRule(original.specVersions.taskPackageVersion === '0.2'
      && taskSchema.required?.includes('itemRuleId'), 'Unsupported current TaskPackage identity contract');
    return null;
  }
  requireRule(original.specVersions.taskPackageVersion === '0.1'
    && typeof original.blueprintSlotId === 'string' && !Object.hasOwn(original, 'itemRuleId')
    && (registry.settingsSchemaVersion ?? 0) < 3,
  'Legacy validation requires an unchanged historical pinned TaskPackage and Registry');
  return { validateLockedFields, validateRegistry, validateCandidate, exerciseReviewSchemas };
}
