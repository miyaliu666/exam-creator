import { exerciseTemplateById, exerciseTemplateName } from "./exercise-template-catalog";
import { registryDisplayText } from "./registry-display-text";
import { DIFFICULTY_LEVELS } from "./registry-difficulty";
import type { ExerciseTemplateRule, RegistrySnapshot } from "./types";

export const EXERCISE_SCORING_METHODS = [
  { id: "exactMatch", label: "Exact match" },
  { id: "perResponse", label: "Per response" },
  { id: "analyticRubric", label: "Analytic rubric" },
] as const;

export function newExerciseRule(snapshot: RegistrySnapshot, exerciseType = ""): ExerciseTemplateRule {
  return {
    id: `exercise-rule-${crypto.randomUUID()}`, primaryCanDoId: "", exerciseType, enabled: true,
    allowedDomains: [], allowedContextIds: [], taskRequirements: "",
    difficultyStandards: structuredClone(snapshot.difficultyStandards),
    scoring: { method: "exactMatch", criteria: "", normalizationPolicy: "" },
    reviewCriteria: [], defaults: {},
  };
}

/** Configuration errors remain visible in the draft; only complete rules can be applied. */
export function exerciseRuleIssues(snapshot: RegistrySnapshot, rule: ExerciseTemplateRule): string[] {
  const issues: string[] = [];
  if (!snapshot.canDoOptions.some((entry) => entry.id === rule.primaryCanDoId)) issues.push("Select a Can-do statement.");
  if (!exerciseTemplateById(rule.exerciseType)) issues.push("Select an exercise template.");
  if (snapshot.exerciseTemplateRules?.some((entry) => entry.id !== rule.id && entry.primaryCanDoId === rule.primaryCanDoId && entry.exerciseType === rule.exerciseType)) {
    issues.push("This Can-do already has rules for this exercise template. Edit the existing row.");
  }
  if (!rule.allowedDomains.length) issues.push("Select at least one allowed Domain.");
  if (rule.allowedDomains.some((id) => !snapshot.allowedDomains.includes(id))) issues.push("Remove unavailable Domains.");
  for (const id of rule.allowedContextIds) {
    const context = snapshot.contextOptions.find((entry) => entry.id === id);
    if (!context || context.retired) issues.push("Remove or replace an unavailable Context.");
    else if (context.primaryDomains.length !== 1 || !rule.allowedDomains.includes(context.primaryDomains[0])) issues.push("Each selected Context must belong to one of the allowed Domains.");
    else if (!context.canDoIds.includes(rule.primaryCanDoId)) issues.push("A selected Context does not allow this Can-do.");
  }
  if (!rule.taskRequirements.trim()) issues.push("Describe the task requirements and the expected evidence of success.");
  for (const level of DIFFICULTY_LEVELS) {
    const standards = rule.difficultyStandards.filter((entry) => entry.id === level.id);
    if (standards.length !== 1) { issues.push(`Provide one ${level.label} difficulty profile.`); continue; }
    const standard = standards[0];
    const drivers = standard.defaultDrivers;
    if (!Number.isSafeInteger(drivers.informationPoints) || drivers.informationPoints < 1 || drivers.informationPoints < standard.informationPointsMin || drivers.informationPoints > standard.informationPointsMax) issues.push(`Repair ${level.label} information points.`);
    if (!standard.allowedInputLengths.includes(drivers.inputLength) || !standard.allowedSupportLevels.includes(drivers.supportLevel) || !standard.allowedDistractorSimilarities.includes(drivers.distractorSimilarity)) issues.push(`Repair ${level.label} difficulty choices.`);
  }
  if (!EXERCISE_SCORING_METHODS.some((entry) => entry.id === rule.scoring.method)) issues.push("Select a scoring method.");
  if (!rule.scoring.criteria.trim()) issues.push("Describe the scoring criteria.");
  if (!rule.scoring.normalizationPolicy.trim()) issues.push("Describe the normalization policy, including any accepted equivalent responses.");
  if (rule.reviewCriteria.some((criterion) => !criterion.trim())) issues.push("Complete or remove each supplementary review criterion.");
  return [...new Set(issues)];
}

export function exerciseRuleSearchText(snapshot: RegistrySnapshot, rule: ExerciseTemplateRule): string {
  const canDo = snapshot.canDoOptions.find((entry) => entry.id === rule.primaryCanDoId);
  return [canDo?.label, canDo?.primarySkill, canDo?.activity, exerciseTemplateName(rule.exerciseType), rule.taskRequirements,
    ...rule.allowedDomains, ...rule.difficultyStandards.map((entry) => entry.label), rule.scoring.method]
    .filter((value): value is string => typeof value === "string").map(registryDisplayText).join(" ").toLocaleLowerCase();
}

export function applyExerciseRule(current: RegistrySnapshot, initial: RegistrySnapshot, rule: ExerciseTemplateRule): boolean {
  if (JSON.stringify(current) !== JSON.stringify(initial) || exerciseRuleIssues(current, rule).length) return false;
  const entries = current.exerciseTemplateRules ??= [];
  const index = entries.findIndex((entry) => entry.id === rule.id);
  if (index < 0) entries.push(structuredClone(rule));
  else entries[index] = structuredClone(rule);
  return true;
}

export function canRefreshExerciseRuleBaseline(snapshot: RegistrySnapshot, original: ExerciseTemplateRule, dirty: boolean): boolean {
  return !dirty && JSON.stringify(snapshot.exerciseTemplateRules?.find((entry) => entry.id === original.id)) === JSON.stringify(original);
}
