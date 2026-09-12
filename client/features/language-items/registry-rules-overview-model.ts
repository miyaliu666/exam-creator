import { isContentOptionCompatible } from "./content-compatibility.ts";
import { DOMAIN_LABELS, ITEM_FORMAT_LABELS, SKILL_LABELS } from "./labels.ts";
import { capabilityKey, contextCompatibilityIssue } from "./registry-capability.ts";
import { DIFFICULTY_LEVELS, DIFFICULTY_OPTIONS, independenceFieldState, selectedDifficultyStandard, usesDistractors } from "./registry-difficulty.ts";
import { registryDisplayText } from "./registry-display-text.ts";
import { registrySlotName } from "./registry-reference-labels.ts";
import type { DifficultyBandStandard, RegistryCapability, RegistryContext, RegistrySnapshot } from "./types.ts";

export interface RegistryOverviewDifficulty {
  id: string;
  label: string;
  standard?: DifficultyBandStandard;
  lines: string[];
  issues: string[];
}

export interface RegistryRulesOverviewRow {
  key: string;
  capability: RegistryCapability;
  contextId: string;
  context?: RegistryContext;
  slotName: string;
  skillName: string;
  activityName: string;
  formatName: string;
  canDoName: string;
  contextName: string;
  domainName: string;
  difficulties: RegistryOverviewDifficulty[];
  contentCount: number | null;
  issues: string[];
  searchText: string;
}

export interface RegistryOverviewFilters { query: string; skill: string; contextId: string }

function choiceLine(label: string, value: string, allowed: string[]) {
  const saved = allowed.length === 1 && allowed[0] === value ? "" : `; allowed: ${allowed.map(registryDisplayText).join(" / ") || "none"}`;
  return `${label}: ${registryDisplayText(value)}${saved}`;
}

export function overviewDifficulty(snapshot: RegistrySnapshot, capability: RegistryCapability, id: string, label: string): RegistryOverviewDifficulty {
  const standard = selectedDifficultyStandard(snapshot, capability, id);
  if (!standard) return { id, label, lines: [], issues: ["Difficulty rules are missing."] };
  const drivers = standard.defaultDrivers;
  const fixedCount = standard.informationPointsMin === drivers.informationPoints && standard.informationPointsMax === drivers.informationPoints;
  const lines = [
    choiceLine("Input", drivers.inputLength, standard.allowedInputLengths),
    `Information points: ${drivers.informationPoints}${fixedCount ? "" : `; range: ${standard.informationPointsMin}–${standard.informationPointsMax}`}`,
    choiceLine("Support", drivers.supportLevel, standard.allowedSupportLevels),
  ];
  if (usesDistractors(capability.itemFormatId)) lines.push(choiceLine("Distractors", drivers.distractorSimilarity, standard.allowedDistractorSimilarities));
  const issues: string[] = [];
  if (!standard.allowedInputLengths.includes(drivers.inputLength) || !standard.allowedSupportLevels.includes(drivers.supportLevel)
    || !standard.allowedDistractorSimilarities.includes(drivers.distractorSimilarity)) issues.push("A saved default is outside its allowed values.");
  if (standard.allowedInputLengths.some((value) => !DIFFICULTY_OPTIONS.inputLength.includes(value))
    || standard.allowedSupportLevels.some((value) => !DIFFICULTY_OPTIONS.supportLevel.includes(value))
    || standard.allowedDistractorSimilarities.some((value) => !DIFFICULTY_OPTIONS.distractorSimilarity.includes(value))
    || independenceFieldState(drivers.independenceLevel).invalid) issues.push("A saved difficulty value is invalid.");
  if (usesDistractors(capability.itemFormatId) ? standard.allowedDistractorSimilarities.includes("notApplicable")
    : standard.allowedDistractorSimilarities.some((value) => value !== "notApplicable")) issues.push("Distractor rules do not match this Item format.");
  if (!Number.isInteger(drivers.informationPoints) || !Number.isInteger(standard.informationPointsMin) || !Number.isInteger(standard.informationPointsMax)
    || standard.informationPointsMin < 1 || standard.informationPointsMax > 255 || standard.informationPointsMin > standard.informationPointsMax
    || drivers.informationPoints < standard.informationPointsMin || drivers.informationPoints > standard.informationPointsMax) issues.push("Information points need updating.");
  return { id, label, standard, lines, issues };
}

export function registryRulesOverviewRows(snapshot: RegistrySnapshot): RegistryRulesOverviewRow[] {
  const keys = new Map<string, number>();
  return snapshot.capabilities.flatMap((capability) => {
    const primary = snapshot.canDoOptions.find((entry) => entry.id === capability.primaryCanDoId);
    const slot = snapshot.blueprintSlots?.find((entry) => entry.id === capability.blueprintSlotId);
    const issues: string[] = [];
    if (!primary) issues.push("Primary Can-do is missing.");
    else if ((primary.primarySkill && primary.primarySkill !== capability.primaryReportedSkill)
      || (primary.activity && primary.activity !== capability.communicativeActivity)) issues.push("Skill or activity does not match Primary Can-do.");
    if (snapshot.blueprintSlots && !slot) issues.push("Blueprint slot is missing.");
    if (!ITEM_FORMAT_LABELS[capability.itemFormatId]) issues.push("Item format is unavailable.");
    if (!SKILL_LABELS[capability.primaryReportedSkill]) issues.push("Skill is unavailable.");
    if (slot && !slot.allowedItemFormatIds.includes(capability.itemFormatId)) issues.push("Item format is not allowed by this Blueprint slot.");
    const difficulties = DIFFICULTY_LEVELS.map(({ id, label }) => overviewDifficulty(snapshot, capability, id, label));
    const identity = {
      slotName: registrySlotName(snapshot, capability.blueprintSlotId),
      skillName: SKILL_LABELS[capability.primaryReportedSkill] ?? registryDisplayText(capability.primaryReportedSkill),
      activityName: [...new Set([capability.communicativeActivity, ...(capability.communicativeActivities ?? [])])].filter(Boolean).map(registryDisplayText).join(" / "),
      formatName: ITEM_FORMAT_LABELS[capability.itemFormatId] ?? "Unavailable item format",
      canDoName: primary ? registryDisplayText(primary.label) || "Unnamed Primary Can-do" : "Missing Primary Can-do",
    };
    // Preserve incomplete draft bindings so the overview remains a path to repair them.
    return [...new Set(capability.allowedContextIds.length ? capability.allowedContextIds : [""])].map((contextId) => {
      const context = snapshot.contextOptions.find((entry) => entry.id === contextId);
      const contextIssue = contextId ? contextCompatibilityIssue(snapshot, context, capability) : "No Context is selected.";
      const rowIssues = [...issues, ...(contextIssue ? [contextIssue] : [])];
      const baseKey = `${capabilityKey(capability)}::${contextId}`;
      const occurrence = keys.get(baseKey) ?? 0;
      keys.set(baseKey, occurrence + 1);
      const contextName = context ? registryDisplayText(context.label) || "Unnamed Context" : contextId ? "Missing Context" : "No Context selected";
      const domainName = context?.primaryDomains.map((domain) => DOMAIN_LABELS[domain] ?? registryDisplayText(domain)).join(" / ") || "Unknown Domain";
      return {
        key: occurrence ? `${baseKey}::duplicate-${occurrence}` : baseKey,
        capability, contextId, context, ...identity, contextName, domainName, difficulties,
        contentCount: contextIssue || issues.length ? null : snapshot.contentIdOptions.filter((entry) => entry.kind !== "supported" && isContentOptionCompatible(entry, capability, contextId)).length,
        issues: rowIssues,
        searchText: [...Object.values(identity), contextName, domainName, ...rowIssues, ...difficulties.flatMap((entry) => [entry.label, ...entry.lines])].join(" ").toLocaleLowerCase(),
      };
    });
  });
}

export function filterRegistryOverviewRows(rows: RegistryRulesOverviewRow[], filters: RegistryOverviewFilters) {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => (!filters.skill || row.capability.primaryReportedSkill === filters.skill)
    && (!filters.contextId || row.contextId === filters.contextId)
    && words.every((word) => row.searchText.includes(word)));
}
