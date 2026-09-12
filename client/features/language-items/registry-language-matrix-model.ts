import { isContentOptionCompatible } from "./content-compatibility.ts";
import { contentAssessmentRuleIssues, getContentAssessmentRule } from "./content-assessment-rules.ts";
import { languageTargetLabel, languageTargetMatchesSearch } from "./language-target-labels.ts";
import { ITEM_FORMAT_LABELS } from "./labels.ts";
import { capabilityKey, contextsForCapability } from "./registry-capability.ts";
import { registrySlotName } from "./registry-reference-labels.ts";
import type { ContentIdOption, RegistryCapability, RegistryContext, RegistrySnapshot } from "./types.ts";

export interface LanguageMatrixColumn {
  key: string;
  capability: RegistryCapability;
  context: RegistryContext;
}
export interface LanguageMatrixFilters {
  query: string;
  kind: string;
  skill: string;
  contextId: string;
  capabilityKey: string;
}
export const EMPTY_MATRIX_FILTERS: LanguageMatrixFilters = { query: "", kind: "", skill: "", contextId: "", capabilityKey: "" };

export function languageMatrixColumns(snapshot: RegistrySnapshot, filters: LanguageMatrixFilters) {
  return snapshot.capabilities.flatMap((capability) => {
    if (filters.skill && capability.primaryReportedSkill !== filters.skill) return [];
    if (filters.capabilityKey && capabilityKey(capability) !== filters.capabilityKey) return [];
    return contextsForCapability(snapshot, capability)
      .filter((context) => !filters.contextId || context.id === filters.contextId)
      .map((context) => ({ key: JSON.stringify([capabilityKey(capability), context.id]), capability, context }));
  }).sort((a, b) => a.capability.primaryReportedSkill.localeCompare(b.capability.primaryReportedSkill)
    || a.context.label.localeCompare(b.context.label)
    || registrySlotName(snapshot, a.capability.blueprintSlotId).localeCompare(registrySlotName(snapshot, b.capability.blueprintSlotId))
    || a.key.localeCompare(b.key));
}

export function languageMatrixEntries(snapshot: RegistrySnapshot, filters: LanguageMatrixFilters) {
  const query = filters.query.normalize("NFKC").trim().toLocaleLowerCase();
  return snapshot.contentIdOptions.filter((entry) => entry.kind !== "supported"
    && (!filters.kind || filters.kind === entry.kind)
    && (!query || languageTargetMatchesSearch(entry, query) || `${entry.meaning ?? ""} ${entry.pattern ?? ""}`.normalize("NFKC").toLocaleLowerCase().includes(query)));
}

export function languageMatrixCell(entry: ContentIdOption, column: LanguageMatrixColumn) {
  const rule = getContentAssessmentRule(entry, column.capability, column.context.id);
  const allowed = isContentOptionCompatible(entry, column.capability, column.context.id);
  if (!allowed) return { allowed, label: "Not allowed", detail: rule?.applicability === "excluded" ? "Excluded for this combination" : "Restricted by this entry's scopes" };
  if (!rule) return { allowed, label: "Allowed", detail: "Assessment rule not defined" };
  const complete = contentAssessmentRuleIssues(rule, column.capability).length === 0;
  const modes = { understanding: "Understanding", controlledProduction: "Controlled production", freeProduction: "Free production" };
  return { allowed, label: "Allowed", detail: complete && rule.assessmentMode ? modes[rule.assessmentMode] : "Assessment rule incomplete" };
}

export function orphanedAssessmentRules(snapshot: RegistrySnapshot) {
  return snapshot.contentIdOptions.flatMap((entry) => (entry.assessmentRules ?? []).flatMap((rule, index) => {
    const capability = snapshot.capabilities.find((candidate) => capabilityKey(candidate) === capabilityKey(rule));
    const context = snapshot.contextOptions.find((candidate) => candidate.id === rule.contextId);
    const reason = entry.kind === "supported" ? "Supporting material types cannot carry language assessment rules."
      : !capability ? "Item rules no longer exist."
      : !contextsForCapability(snapshot, capability).some((candidate) => candidate.id === rule.contextId) ? "Context is no longer allowed for these Item rules." : null;
    const primary = snapshot.canDoOptions?.find((candidate) => candidate.id === rule.primaryCanDoId)?.label ?? "Missing Primary Can-do";
    return reason ? [{ entry, rule, index, reason, label: `${languageTargetLabel(entry).primary} · ${registrySlotName(snapshot, rule.blueprintSlotId)} · ${ITEM_FORMAT_LABELS[rule.itemFormatId] ?? "Missing Item format"} · ${primary} · ${context?.label ?? "Missing Context"}` }] : [];
  }));
}
