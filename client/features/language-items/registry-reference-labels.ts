import { createContext } from "react";

import { ITEM_FORMAT_LABELS, WORKBENCH_LABELS, itemRuleLabel } from "./labels";
import { registryDisplayText } from "./registry-display-text";
import type { RegistryCapability, RegistrySnapshot, RegistryValidationIssue } from "./types";
import { getExerciseTemplateName } from "./exercise-template-names";

export const RegistryTextContext = createContext(registryDisplayText);

export function registryItemRuleName(snapshot: RegistrySnapshot, itemRuleId: string) {
  const name = itemRuleLabel(itemRuleId, snapshot);
  return name === itemRuleId ? WORKBENCH_LABELS.itemRules : name;
}

export function registryCombinationName(snapshot: RegistrySnapshot, capability: Pick<RegistryCapability, "itemRuleId" | "itemFormatId" | "primaryCanDoId">) {
  return registryItemRuleName(snapshot, capability.itemRuleId);
}

export function registryReferenceName(snapshot: RegistrySnapshot, id: string, fallback: string) {
  return registryDisplayText(snapshot.referenceLabels?.find((entry) => entry.id === id)?.displayName ?? fallback);
}

function referenceNames(snapshot: RegistrySnapshot): Map<string, string> {
  const names = new Map<string, string>();
  for (const entry of snapshot.capabilities) names.set(entry.itemRuleId, registryItemRuleName(snapshot, entry.itemRuleId));
  for (const entry of [...snapshot.canDoOptions, ...snapshot.contextOptions, ...snapshot.contentIdOptions, ...snapshot.difficultyStandards]) {
    names.set(entry.id, registryDisplayText(entry.label));
  }
  for (const [id, label] of Object.entries(ITEM_FORMAT_LABELS)) names.set(id, label);
  for (const entry of [...(snapshot.taskFamilyOptions ?? []), ...(snapshot.referenceLabels ?? [])]) names.set(entry.id, registryDisplayText(entry.displayName));
  for (const entry of snapshot.scoringContracts ?? []) names.set(entry.scoringContractTemplateId, registryDisplayText(entry.displayName ?? `${entry.itemRuleIds.map((id) => registryItemRuleName(snapshot, id)).join(" / ")} · ${ITEM_FORMAT_LABELS[entry.itemFormatId] ?? "Scoring"}`));
  return names;
}

export function createRegistryTextFormatter(snapshot: RegistrySnapshot) {
  const names = referenceNames(snapshot);
  const ids = [...names.keys()].filter((id) => id.includes("-") || /^D\d{2}$/.test(id));
  const pattern = new RegExp(`(?<![\\w-])(?:${ids.sort((a, b) => b.length - a.length).map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "g");
  return (value: string) => ids.length ? registryDisplayText(value).replace(pattern, (id) => names.get(id) ?? id) : registryDisplayText(value);
}

export function registryIssueText(snapshot: RegistrySnapshot, issue: RegistryValidationIssue) {
  let message = createRegistryTextFormatter(snapshot)(issue.message);
  // Unknown references have no business name; describe the missing object without exposing a code.
  message = message.replace(/\b(?:IF|TF|SCT|REN|DPS|CTX|A1|NP|IP|PP|RP|SRP|PAP|RG|LP|MP|GP|CH|LX|R|L|W|S)-[A-Za-z0-9_.:-]+\b/g, "missing reference")
    .replace(/\bD\d{2}\b/g, "missing context")
    .replace(/\b[Cc]apabilities\b/g, "item rule sets")
    .replace(/\b[Cc]apability(?: variant)?\b/g, "item rule set")
    .replace(/\bA item rule set\b/g, "An item rule set")
    .replace(/\ba item rule set\b/g, "an item rule set")
    .replace(/::/g, " · ");
  const [section, indexText, subSection, subIndexText] = issue.path.split(".");
  const index = Number(indexText);
  let location = "";
  if (section === "capabilities" && snapshot.capabilities[index]) location = registryCombinationName(snapshot, snapshot.capabilities[index]);
  if (section === "contextOptions") location = registryDisplayText(snapshot.contextOptions[index]?.label ?? "Context");
  if (section === "canDoOptions") location = registryDisplayText(snapshot.canDoOptions[index]?.label ?? "Can-do");
  if (section === "exerciseTemplateRules") {
    const rule = snapshot.exerciseTemplateRules?.[index];
    if (rule) location = `${registryDisplayText(snapshot.canDoOptions.find((entry) => entry.id === rule.primaryCanDoId)?.label ?? "Can-do")} · ${getExerciseTemplateName(rule.exerciseType)}`;
  }
  if (section === "contentIdOptions") location = registryDisplayText(snapshot.contentIdOptions[index]?.label ?? "Language content");
  if (section === "difficultyStandards") location = registryDisplayText(snapshot.difficultyStandards[index]?.label ?? "Difficulty");
  if (section === "capabilityDifficultyProfileSets") {
    const profile = snapshot.capabilityDifficultyProfileSets?.[index];
    if (profile) location = registryCombinationName(snapshot, profile);
    if (profile && subSection === "standards") location += ` · ${registryDisplayText(profile.standards[Number(subIndexText)]?.label ?? "Difficulty")}`;
  }
  return location ? `${location}: ${message}` : message;
}
