import { exerciseTemplateById, type ExerciseTemplateField, type ExerciseTemplateValue } from "./exercise-template-catalog";

export interface ExerciseTemplateDocument { exerciseType: string; body: string; data: ExerciseTemplateValue }
export interface ExerciseTemplateProjectionPolicy { version: number; privatePaths: string[]; transform: string }

function object(value: unknown): ExerciseTemplateValue { return value && typeof value === "object" && !Array.isArray(value) ? value as ExerciseTemplateValue : {}; }
function list(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
/** Lexicographic display order is independent of source answer order and reproducible on the server. */
function sortedStrings(value: unknown): string[] { return list(value).map(text).sort(); }
function isHidden(policy: ExerciseTemplateProjectionPolicy, path: string): boolean { return policy.privatePaths.includes(path); }

function projectField(field: ExerciseTemplateField, value: unknown, path: string, policy: ExerciseTemplateProjectionPolicy): unknown {
  if (value === undefined || isHidden(policy, path)) return undefined;
  if (field.type === "object") {
    const input = object(value), result: ExerciseTemplateValue = {};
    for (const child of field.properties ?? []) {
      const projected = projectField(child, input[child.key], `${path}.${child.key}`, policy);
      if (projected !== undefined) result[child.key] = projected;
    }
    // Whether a question permits several responses is public behavior, not its answer indices.
    if (Array.isArray(input.correct)) result.responseMode = "multiple";
    return result;
  }
  if (field.type === "array") return field.element ? list(value).map(entry => projectField(field.element!, entry, `${path}.*`, policy)) : [];
  if (field.type === "union") {
    const variant = field.variants?.find(entry => entry.type === "array" ? Array.isArray(value) : entry.type === "object" ? !!value && typeof value === "object" && !Array.isArray(value) : entry.type === "integer" || entry.type === "number" ? typeof value === "number" : typeof value === entry.type);
    return variant ? projectField(variant, value, path, policy) : undefined;
  }
  // Malformed nested objects must not cross a public primitive field as hidden metadata.
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) return value;
  return undefined;
}

/**
 * Public candidate projection. Full author data must never be reassembled on the candidate side.
 * Only known schema fields survive; private field paths and answer-bearing structural encodings
 * are handled by the same catalog policy used by the server.
 */
export function projectExerciseTemplateCandidate(document: ExerciseTemplateDocument): ExerciseTemplateDocument {
  const template = exerciseTemplateById(document.exerciseType);
  if (!template) throw new Error("Unknown exercise template: " + document.exerciseType);
  const policy = template.projection;
  const data: ExerciseTemplateValue = {};
  for (const field of template.fields) {
    const projected = projectField(field, document.data[field.key], field.key, policy);
    if (projected !== undefined) data[field.key] = projected;
  }
  switch (policy.transform) {
    case "independent-columns": {
      const pairs = list(document.data.pairs).map(object);
      data.leftItems = pairs.map(pair => text(pair.left));
      data.rightItems = sortedStrings([...pairs.map(pair => pair.right), ...list(document.data.distractors)]);
      break;
    }
    case "unordered-items": data.items = sortedStrings(document.data.items); break;
    case "unordered-words": data.words = sortedStrings(document.data.words); break;
    case "unordered-categories": data.items = list(data.items).sort((left, right) => text(object(left).text) < text(object(right).text) ? -1 : text(object(left).text) > text(object(right).text) ? 1 : 0); break;
    case "masked-letters": {
      data.text = text(document.data.text).replace(/\{([^|{}]+)\|(\d+)\}/g, (_match, word: string, count: string) => {
        const letters = Array.from(word);
        const given = Math.min(letters.length, Number(count));
        return letters.slice(0, given).join("") + "_".repeat(Math.max(0, letters.length - given));
      });
      break;
    }
    case "blank-count": data.responseCount = list(document.data.blanks).length; break;
    case "label-count": data.responseCount = list(document.data.labels).length; break;
  }
  return { exerciseType: document.exerciseType, body: document.body, data };
}
