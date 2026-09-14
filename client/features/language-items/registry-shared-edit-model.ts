import { contextCompatibilityIssue, domainsForCapability } from "./registry-capability.ts";
import { registryDisplayText } from "./registry-display-text.ts";
import type { RegistrySnapshot } from "./types.ts";
import { getExerciseTemplateName } from "./exercise-template-names";

export type SharedRegistrySection = "contexts" | "canDo" | "scoring";
export type UpdateRegistry = (mutate: (snapshot: RegistrySnapshot) => void) => void;
export interface SharedRegistryEditorProps {
  snapshot: RegistrySnapshot;
  update: UpdateRegistry;
  disabled: boolean;
  selectedId?: string;
}

export function registryNameExists(entries: Array<{ id: string; label: string }>, label: string, exceptId?: string) {
  const normalize = (value: string) => registryDisplayText(value).normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
  return entries.some((entry) => entry.id !== exceptId && normalize(entry.label) === normalize(label));
}

export function canDoReferenceCount(snapshot: RegistrySnapshot, id: string) {
  return snapshot.capabilities.filter((entry) => !entry.itemFormatId.startsWith("EXERCISE:") && (entry.primaryCanDoId === id || entry.supportingCanDoIds?.includes(id))).length
    + (snapshot.exerciseTemplateRules ?? []).filter((entry) => entry.primaryCanDoId === id).length
    + snapshot.contextOptions.filter((entry) => entry.canDoIds.includes(id)).length
    + snapshot.contentIdOptions.filter((entry) => entry.canDoIds.includes(id) || entry.assessmentRules?.some((rule) => rule.primaryCanDoId === id)).length;
}

export function sharedRegistryImpact(initial: RegistrySnapshot, staged: RegistrySnapshot, section: SharedRegistrySection) {
  if (section === "scoring") return [];
  const changedIds = section === "contexts"
    ? staged.contextOptions.filter((entry) => JSON.stringify(entry) !== JSON.stringify(initial.contextOptions.find((saved) => saved.id === entry.id))).map((entry) => entry.id)
    : staged.canDoOptions.filter((entry) => JSON.stringify(entry) !== JSON.stringify(initial.canDoOptions.find((saved) => saved.id === entry.id))).map((entry) => entry.id);
  const legacyImpact = staged.capabilities.filter((entry) => !entry.itemFormatId.startsWith("EXERCISE:")).flatMap((entry) => {
    if (section === "contexts") return entry.allowedContextIds.flatMap((id) => {
      if (!changedIds.includes(id)) return [];
      const issue = contextCompatibilityIssue(staged, staged.contextOptions.find((context) => context.id === id), entry);
      return issue ? [`${registryDisplayText(entry.title)}: ${issue}`] : [];
    });
    if (!changedIds.includes(entry.primaryCanDoId)) return [];
    const canDo = staged.canDoOptions.find((option) => option.id === entry.primaryCanDoId);
    return canDo && (canDo.primarySkill !== entry.primaryReportedSkill || canDo.activity !== entry.communicativeActivity)
      ? [`${registryDisplayText(entry.title)}: Skill or activity needs repair after this Can-do change.`] : [];
  });
  const templateImpact = (staged.exerciseTemplateRules ?? []).flatMap((rule) => {
    const name = getExerciseTemplateName(rule.exerciseType);
    if (section === "canDo" && changedIds.includes(rule.primaryCanDoId)) return [`${name}: Skill and activity follow the updated Can-do. Review the task and scoring requirements.`];
    if (section !== "contexts") return [];
    return rule.allowedContextIds.flatMap((id) => {
      if (!changedIds.includes(id)) return [];
      const context = staged.contextOptions.find((entry) => entry.id === id);
      if (!context || context.retired || context.primaryDomains.length !== 1 || !rule.allowedDomains.includes(context.primaryDomains[0]) || !context.canDoIds.includes(rule.primaryCanDoId)) {
        return [`${name}: A restricted Context is incompatible with these exercise rules.`];
      }
      return [];
    });
  });
  return [...legacyImpact, ...templateImpact];
}

export function applySharedRegistryEdit(current: RegistrySnapshot, initial: RegistrySnapshot, staged: RegistrySnapshot, section: SharedRegistrySection) {
  // The modal may outlive a remote reload; never apply a staged shared definition over a changed snapshot.
  if (JSON.stringify(current) !== JSON.stringify(initial)) return false;
  if (section === "contexts") {
    current.contextOptions = structuredClone(staged.contextOptions);
    for (const capability of current.capabilities) capability.allowedDomains = domainsForCapability(current, capability);
  } else if (section === "canDo") current.canDoOptions = structuredClone(staged.canDoOptions);
  else current.scoringContracts = structuredClone(staged.scoringContracts);
  return true;
}
