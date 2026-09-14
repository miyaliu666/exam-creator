import catalog from "../../../language-item-workbench/exercise-templates/catalog.json";
import { schemas, type ExerciseType } from "../../../language-item-workbench/exercise-templates/source/lib/schema";

export type ExerciseTemplateValue = Record<string, unknown>;
export interface ExerciseTemplateField {
  key: string;
  label: string;
  type: "string" | "number" | "integer" | "boolean" | "object" | "array" | "enum" | "literal" | "union";
  required: boolean;
  description?: string;
  default?: unknown;
  values?: (string | number | boolean)[];
  properties?: ExerciseTemplateField[];
  element?: ExerciseTemplateField;
  variants?: ExerciseTemplateField[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  sourceRefinements?: string[];
}
export interface ExerciseTemplateDefinition {
  id: string;
  name: string;
  description: string;
  sourceSkill: string | null;
  sourceSupportedLevels: string[];
  component: string;
  fields: ExerciseTemplateField[];
  schema: Record<string, unknown>;
  projection: { version: number; privatePaths: string[]; transform: string };
}

export const EXERCISE_TEMPLATES: readonly ExerciseTemplateDefinition[] = catalog.templates as ExerciseTemplateDefinition[];
export const EXERCISE_TEMPLATE_COMMON_FIELDS: readonly string[] = catalog.commonFields;
const byId = new Map(EXERCISE_TEMPLATES.map(template => [template.id, template]));
export function exerciseTemplateById(id: string): ExerciseTemplateDefinition | undefined { return byId.get(id); }
/** Preserve duplicate names and original capitalization; the stable id identifies the type. */
export function exerciseTemplateName(id: string): string { return byId.get(id)?.name ?? id; }
export const getExerciseTemplateName = exerciseTemplateName;

export interface ExerciseTemplateValidationIssue { path: (string | number)[]; message: string }
export function validateExerciseTemplateData(exerciseType: string, data: unknown): ExerciseTemplateValidationIssue[] {
  if (!byId.has(exerciseType)) return [{ path: ["type"], message: "Select a registered exercise template." }];
  const result = schemas[exerciseType as ExerciseType].safeParse(data);
  return result.success ? [] : result.error.issues.map(({ path, message }) => ({ path, message }));
}

export function emptyExerciseTemplateField(field: ExerciseTemplateField): unknown {
  if (field.default !== undefined) return structuredClone(field.default);
  switch (field.type) {
    case "literal": case "enum": return field.values?.[0] ?? "";
    case "string": return "";
    case "boolean": return false;
    case "number": case "integer": return field.minimum ?? (field.exclusiveMinimum !== undefined ? field.exclusiveMinimum + 1 : 0);
    case "object": return Object.fromEntries((field.properties ?? []).filter(child => child.required || child.default !== undefined).map(child => [child.key, emptyExerciseTemplateField(child)]));
    case "array": return Array.from({ length: field.minItems ?? 0 }, () => field.element ? emptyExerciseTemplateField(field.element) : "");
    case "union": return field.variants?.[0] ? emptyExerciseTemplateField(field.variants[0]) : "";
  }
}

/** A draft may be incomplete. Never claim these empty authored values are validated content. */
export function createExerciseTemplateDraft(exerciseType: string, defaults: ExerciseTemplateValue = {}, language = "zh"): ExerciseTemplateValue {
  const template = byId.get(exerciseType);
  if (!template) throw new Error("Unknown exercise template: " + exerciseType);
  const data = Object.fromEntries(template.fields.filter(field => field.required || field.default !== undefined).map(field => [field.key, emptyExerciseTemplateField(field)]));
  return { ...data, instructionLanguage: "en", level: "A1", ...structuredClone(defaults), language, type: exerciseType };
}

/** Local immutable patching retains unknown metadata and all untouched array entries. */
export function setExerciseTemplateField(data: unknown, path: readonly (string | number)[], value: unknown): unknown {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (typeof key === "number") {
    const result = Array.isArray(data) ? data.slice() : [];
    if (!rest.length && value === undefined) result.splice(key, 1);
    else result[key] = setExerciseTemplateField(result[key], rest, value);
    return result;
  }
  const result: Record<string, unknown> = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
  if (!rest.length && value === undefined) delete result[key];
  else result[key] = setExerciseTemplateField(result[key], rest, value);
  return result;
}

/** Validation is read-only. Defaults are applied only for explicit author preview/normalization. */
export function parsedExerciseTemplateData(exerciseType: string, data: unknown) {
  if (!byId.has(exerciseType)) return undefined;
  const result = schemas[exerciseType as ExerciseType].safeParse(data);
  return result.success ? result.data : undefined;
}
