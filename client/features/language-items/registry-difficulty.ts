import { capabilityKey, difficultyStandardsForCapability } from "./registry-capability.ts";
import { registryDisplayText } from "./registry-display-text.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "./types.ts";

export const DIFFICULTY_LEVELS = [
  { id: "LowerA1", label: "Lower A1" },
  { id: "TypicalA1", label: "Typical A1" },
  { id: "UpperA1", label: "Upper A1" },
] as const;

export function usesDistractors(itemFormatId: string) {
  return ["IF-SINGLE-SELECT", "IF-MATCHING"].includes(itemFormatId);
}

export function initialDifficultyStandards(snapshot: RegistrySnapshot, itemFormatId: string) {
  const standards = structuredClone(snapshot.difficultyStandards);
  if (!usesDistractors(itemFormatId)) standards.forEach(setDistractorsNotApplicable);
  return standards;
}

export function setDistractorsNotApplicable(standard: DifficultyBandStandard) {
  standard.defaultDrivers.distractorSimilarity = "notApplicable";
  standard.allowedDistractorSimilarities = ["notApplicable"];
  standard.description = difficultyDescription(standard);
}

export function hasApplicableDistractors(standard: DifficultyBandStandard) {
  return standard.defaultDrivers.distractorSimilarity !== "notApplicable" ||
    standard.allowedDistractorSimilarities.length !== 1 ||
    standard.allowedDistractorSimilarities[0] !== "notApplicable";
}

export function selectedDifficultyStandard(snapshot: RegistrySnapshot, capability: RegistryCapability, levelId: string) {
  return difficultyStandardsForCapability(snapshot, capability).find((standard) => standard.id === levelId);
}

function ensureDifficultyProfile(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  const existing = snapshot.capabilityDifficultyProfileSets?.find((profile) => capabilityKey(profile) === capabilityKey(capability));
  if (existing) return existing;
  // Editing a legacy global rule creates a local copy without rewriting other configurations.
  const standards = structuredClone(difficultyStandardsForCapability(snapshot, capability));
  const profile = {
    id: `DPS-${capability.blueprintSlotId}-${capability.itemFormatId}-${capability.primaryCanDoId}`,
    blueprintSlotId: capability.blueprintSlotId,
    itemFormatId: capability.itemFormatId,
    primaryCanDoId: capability.primaryCanDoId,
    standards,
  };
  snapshot.capabilityDifficultyProfileSets ??= [];
  snapshot.capabilityDifficultyProfileSets.push(profile);
  return profile;
}

export function changeDifficultyStandard(snapshot: RegistrySnapshot, capability: RegistryCapability, levelId: string, mutate: (standard: DifficultyBandStandard) => void) {
  const standard = ensureDifficultyProfile(snapshot, capability).standards.find((entry) => entry.id === levelId);
  if (standard) mutate(standard);
}

export function restoreMissingDifficultyLevels(snapshot: RegistrySnapshot, capability: RegistryCapability) {
  const profile = ensureDifficultyProfile(snapshot, capability);
  const initial = initialDifficultyStandards(snapshot, capability.itemFormatId);
  for (const { id } of DIFFICULTY_LEVELS) {
    const baseline = initial.find((standard) => standard.id === id);
    if (baseline && !profile.standards.some((standard) => standard.id === id)) profile.standards.push(baseline);
  }
}

export type ChoiceDimension = "inputLength" | "supportLevel" | "distractorSimilarity";
export const DIFFICULTY_OPTIONS: Record<ChoiceDimension, string[]> = {
  inputLength: ["wordOrPhrase", "shortSentence", "twoRelatedPhrases"],
  supportLevel: ["high", "moderate", "limited"],
  distractorSimilarity: ["clear", "moderate", "close", "notApplicable"],
};
const INDEPENDENCE_OPTIONS = [
  { id: "highlySupported", label: "Highly supported" },
  { id: "partlySupported", label: "Partly supported" },
  { id: "independent", label: "Independent" },
];

export function independenceFieldState(savedValue: string) {
  const invalid = !INDEPENDENCE_OPTIONS.some(({ id }) => id === savedValue);
  return {
    invalid,
    options: invalid ? [{ id: savedValue, label: "Invalid saved value" }, ...INDEPENDENCE_OPTIONS] : INDEPENDENCE_OPTIONS,
  };
}

export const ALLOWED_DIFFICULTY_FIELD = {
  inputLength: "allowedInputLengths",
  supportLevel: "allowedSupportLevels",
  distractorSimilarity: "allowedDistractorSimilarities",
} as const;

export function difficultyChoiceState(standard: DifficultyBandStandard, dimension: ChoiceDimension) {
  const options = DIFFICULTY_OPTIONS[dimension].filter((value) => value !== "notApplicable");
  const allowed = standard[ALLOWED_DIFFICULTY_FIELD[dimension]];
  const value = standard.defaultDrivers[dimension];
  const invalid = !allowed.includes(value) || !options.includes(value) || allowed.some((entry) => !options.includes(entry));
  return { options, allowed, value, invalid, fixed: allowed.length === 1 && allowed[0] === value && !invalid };
}

export function setFixedDifficultyValue(standard: DifficultyBandStandard, dimension: ChoiceDimension, value: string) {
  if (!difficultyChoiceState(standard, dimension).options.includes(value)) return;
  changeAllowedDifficultyValues(standard, dimension, [value]);
  standard.description = difficultyDescription(standard);
}

export function setFixedInformationPoints(standard: DifficultyBandStandard, value: number) {
  standard.defaultDrivers.informationPoints = value;
  standard.informationPointsMin = value;
  standard.informationPointsMax = value;
  standard.description = difficultyDescription(standard);
}

function difficultyDescription(standard: DifficultyBandStandard) {
  // Keep prose sent to new items and AI aligned with explicitly edited parameters.
  // Reading an existing Registry never replaces its historical description.
  const drivers = standard.defaultDrivers;
  return `Input length: ${registryDisplayText(drivers.inputLength)}. ` +
    `Information points: ${drivers.informationPoints}. ` +
    `Contextual support: ${registryDisplayText(drivers.supportLevel)}. ` +
    `Distractor similarity: ${registryDisplayText(drivers.distractorSimilarity)}.`;
}

export function changeAllowedDifficultyValues(standard: DifficultyBandStandard, dimension: ChoiceDimension, values: string[]) {
  standard[ALLOWED_DIFFICULTY_FIELD[dimension]] = values;
  const validValues = values.filter((value) => DIFFICULTY_OPTIONS[dimension].includes(value));
  const value = validValues.includes(standard.defaultDrivers[dimension]) ? standard.defaultDrivers[dimension] : validValues[0];
  // Only a deliberate range edit adjusts its default; reading saved data never repairs it silently.
  if (!value) return;
  if (dimension === "inputLength") standard.defaultDrivers.inputLength = value as typeof standard.defaultDrivers.inputLength;
  if (dimension === "supportLevel") standard.defaultDrivers.supportLevel = value as typeof standard.defaultDrivers.supportLevel;
  if (dimension === "distractorSimilarity") standard.defaultDrivers.distractorSimilarity = value as typeof standard.defaultDrivers.distractorSimilarity;
}
