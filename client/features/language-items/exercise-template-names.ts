import catalog from "../../../language-item-workbench/exercise-templates/catalog.json";

/** Names intentionally retain original case and duplicates from source TYPE_LABELS. */
const names = new Map(catalog.templates.map(template => [template.id, template.name]));
export function getExerciseTemplateName(exerciseType: string): string { return names.get(exerciseType) ?? exerciseType; }
export function isExerciseTemplate(exerciseType: string): boolean { return names.has(exerciseType); }
