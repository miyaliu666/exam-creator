import { Button, CloseButton, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";
import { NewItemSelect } from "./new-item-select";
import { CONTENT_LANGUAGE_OPTIONS, contentLanguage } from "./content-language";
import { DOMAIN_LABELS, SKILL_LABELS, WORKBENCH_LABELS, exerciseLabel, optionLabel } from "./labels";
import { registryDisplayText } from "./registry-display-text";
import { useNewItemDraft } from "./new-item-draft";
import { capabilityKey, contextIsOptional, contextsForCapability, difficultyStandardsForCapability, domainsForCapability, exerciseRuleForCapability, setupContextIsCompatible } from "./registry-capability";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface NewLanguageItemSelection {
  language?: string;
  itemRuleId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  primaryDomain: string;
  contextId: string;
  difficultyBand: string;
}

interface NewLanguageItemDialogProps {
  open: boolean;
  draftScope: string;
  registry: RegistrySnapshot | undefined;
  isPending: boolean;
  error?: Error | null;
  onClose: () => void;
  onCreate: (selection: NewLanguageItemSelection) => void;
  title?: string;
  actionLabel?: string;
  initialSelection?: Partial<NewLanguageItemSelection>;
}

const SKILL_ORDER = ["Reading", "Listening", "Writing", "Speaking"];

export function NewLanguageItemDialog({ open, draftScope, registry, isPending, error, onClose, onCreate, title = "New item", actionLabel = "Create", initialSelection }: NewLanguageItemDialogProps) {
  const { draft, setField } = useNewItemDraft(draftScope, initialSelection ? {
    language: contentLanguage(initialSelection),
    itemRuleId: initialSelection.itemRuleId ?? "", formatId: initialSelection.itemFormatId ?? "",
    primaryCanDoId: initialSelection.primaryCanDoId ?? "", domainId: initialSelection.primaryDomain ?? "",
    contextId: initialSelection.contextId ?? "", difficultyBand: initialSelection.difficultyBand ?? "",
  } : undefined);
  const [openField, setOpenField] = useState<keyof NewLanguageItemSelection | null>(null);
  const dropdownState = (field: keyof NewLanguageItemSelection) => ({
    open: open && !isPending && openField === field,
    dimmed: open && !isPending && openField !== null && openField !== field,
    onOpenChange: (isOpen: boolean) => setOpenField((current) => isOpen ? field : current === field ? null : current),
  });
  const { language, itemRuleId, formatId, primaryCanDoId, domainId, contextId, difficultyBand, skillFilter } = draft;
  const capabilities = registry?.capabilities ?? [];
  const canDos = (registry?.canDoOptions ?? []).filter((entry) =>
    capabilities.some((capability) => capability.primaryCanDoId === entry.id &&
      (!skillFilter || capability.primaryReportedSkill === skillFilter)));
  const choices = capabilities.filter((entry) => entry.primaryCanDoId === primaryCanDoId);
  const selectedCapability = choices.find((entry) => entry.itemRuleId === itemRuleId && entry.itemFormatId === formatId);
  const contexts = contextsForCapability(registry, selectedCapability);
  const optionalContext = contextIsOptional(registry, selectedCapability);
  const domains = registry && selectedCapability ? domainsForCapability(registry, selectedCapability) : [];
  const visibleContexts = contexts.filter((entry) => entry.primaryDomains.includes(domainId));
  const standards = difficultyStandardsForCapability(registry, selectedCapability);

  const initializeCapability = (capability: RegistryCapability | undefined) => {
    setField("itemRuleId", capability?.itemRuleId ?? "");
    setField("formatId", capability?.itemFormatId ?? "");
    const nextDomains = registry && capability ? domainsForCapability(registry, capability) : [];
    const nextDomain = nextDomains.includes(domainId) ? domainId : nextDomains[0] ?? "";
    const nextContexts = contextsForCapability(registry, capability).filter((entry) => entry.primaryDomains.includes(nextDomain));
    const nextStandards = difficultyStandardsForCapability(registry, capability);
    setField("domainId", nextDomain);
    setField("contextId", contextIsOptional(registry, capability) ? "" : nextContexts[0]?.id ?? "");
    setField("difficultyBand", nextStandards.find((entry) => entry.id === "TypicalA1")?.id ?? nextStandards[0]?.id ?? "");
  };
  const selectCanDo = (id: string) => {
    setField("primaryCanDoId", id);
    const nextChoices = capabilities.filter((entry) => entry.primaryCanDoId === id);
    initializeCapability(nextChoices.length === 1 ? nextChoices[0] : undefined);
  };
  const canCreate = CONTENT_LANGUAGE_OPTIONS.some((option) => option.id === language) && !!selectedCapability && domains.includes(domainId) &&
    setupContextIsCompatible(registry, selectedCapability, domainId, contextId) &&
    standards.some((entry) => entry.id === difficultyBand);
  const close = () => { if (!isPending) { setOpenField(null); onClose(); } };

  return <Dialog.Root open={open} closeOnInteractOutside={false} closeOnEscape={!isPending}
    onOpenChange={(details) => !details.open && close()} scrollBehavior="inside">
    <Dialog.Backdrop />
    <Dialog.Positioner><Dialog.Content bg="bg" color="fg" maxW="xl">
      <Dialog.Header><Dialog.Title>{title}</Dialog.Title></Dialog.Header>
      <Dialog.CloseTrigger asChild><CloseButton size="sm" aria-label={`Close ${title.toLowerCase()}`} disabled={isPending} /></Dialog.CloseTrigger>
      <Dialog.Body>
        <fieldset disabled={isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
          <Stack gap={4}>
            <NewItemSelect label="Language" placeholder="Select a language" value={language}
              onChange={(value) => setField("language", value)} disabled={isPending}
              options={CONTENT_LANGUAGE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))}
              {...dropdownState("language")} />
            {initialSelection && language !== contentLanguage(initialSelection) ? <Text fontSize="sm" color="fg.warning">Applying a different language clears the previous language targets. Select targets from the new language after applying this setup.</Text> : null}
            <NewItemSelect label={WORKBENCH_LABELS.primaryCanDo} placeholder="Select one primary Can-do"
              value={primaryCanDoId} onChange={selectCanDo} disabled={isPending || !canDos.length}
              options={canDos.map((entry) => ({ value: entry.id, label: registryDisplayText(entry.label),
                description: [entry.primarySkill, entry.activity].filter(Boolean).join(" · ") }))}
              {...dropdownState("primaryCanDoId")}>
              <HStack gap={2} mb={2} flexWrap="wrap">
                {["", ...SKILL_ORDER].map((skill) => <Button key={skill} size="xs"
                  variant={skillFilter === skill ? "solid" : "outline"} colorPalette={skillFilter === skill ? "blue" : undefined}
                  onClick={() => {
                    setOpenField(null); setField("skillFilter", skill);
                    if (primaryCanDoId && skill && !capabilities.some((entry) => entry.primaryCanDoId === primaryCanDoId && entry.primaryReportedSkill === skill)) selectCanDo("");
                  }}>{SKILL_LABELS[skill] ?? "All"}</Button>)}
              </HStack>
            </NewItemSelect>

            <NewItemSelect label="Exercise template" placeholder="Select an exercise template"
              value={selectedCapability ? capabilityKey(selectedCapability) : ""}
              onChange={(value) => initializeCapability(choices.find((entry) => capabilityKey(entry) === value))}
              disabled={isPending || !primaryCanDoId || !choices.length}
              options={choices.map((entry) => {
                const rule = exerciseRuleForCapability(registry, entry);
                return { value: capabilityKey(entry), label: exerciseLabel(entry.itemFormatId, entry.primaryReportedSkill),
                  description: registryDisplayText(rule ? rule.taskRequirements : entry.observableEvidence || entry.taskStructure) };
              })} {...dropdownState("itemFormatId")} />

            <NewItemSelect label={WORKBENCH_LABELS.domain} placeholder="Select a domain"
              value={domainId} disabled={isPending || !selectedCapability || !domains.length}
              onChange={(value) => {
                setField("domainId", value);
                setField("contextId", optionalContext ? "" : contexts.find((entry) => entry.primaryDomains.includes(value))?.id ?? "");
              }}
              options={domains.map((domain) => ({ value: domain, label: DOMAIN_LABELS[domain] ?? domain }))}
              {...dropdownState("primaryDomain")} />

            <Stack gap={1}>
              <NewItemSelect label={optionalContext ? "Context (optional)" : "Context"} placeholder={optionalContext ? "No Context restriction" : "Select a context"}
                value={contextId} onChange={(value) => setField("contextId", value)}
                disabled={isPending || !domainId || !visibleContexts.length}
                options={visibleContexts.map((entry) => ({ value: entry.id, label: registryDisplayText(entry.label) }))}
                {...dropdownState("contextId")} />
              {optionalContext ? <HStack justify="space-between">
                <Text fontSize="xs" color="fg.muted">Leave blank for a scenario described in the item. Restricted language targets require a compatible Context.</Text>
                {contextId ? <Button size="xs" variant="ghost" onClick={() => setField("contextId", "")}>Clear Context</Button> : null}
              </HStack> : null}
            </Stack>

            <NewItemSelect label={WORKBENCH_LABELS.difficulty} placeholder="Select a difficulty band"
              value={difficultyBand} onChange={(value) => setField("difficultyBand", value)}
              disabled={isPending || !selectedCapability || !standards.length}
              options={standards.map((entry) => ({ value: entry.id, label: registryDisplayText(entry.label) }))}
              {...dropdownState("difficultyBand")} />
            {selectedCapability ? <Text fontSize="sm" color="fg.muted">{optionLabel(selectedCapability.primaryCanDoId, registry?.canDoOptions)} · {selectedCapability.primaryReportedSkill} · {selectedCapability.communicativeActivity}</Text> : null}
            {selectedCapability && !optionalContext && !contexts.length ? <Text color="fg.error">No compatible contexts are available for these item rules.</Text> : null}
            {!capabilities.length && registry ? <Text color="fg.muted">Configure and publish an exercise template in Assessment Settings to create an item.</Text> : null}
            {error ? <Text role="alert" color="fg.error">{error.message}</Text> : null}
          </Stack>
        </fieldset>
      </Dialog.Body>
      <Dialog.Footer>
        <Button variant="ghost" disabled={isPending} onClick={close}>Cancel</Button>
        <Button colorPalette="teal" loading={isPending} disabled={!canCreate || isPending}
          onClick={() => selectedCapability && onCreate({
            language,
            itemRuleId: selectedCapability.itemRuleId, itemFormatId: selectedCapability.itemFormatId,
            primaryCanDoId: selectedCapability.primaryCanDoId, primaryDomain: domainId, contextId, difficultyBand,
          })}>{actionLabel}</Button>
      </Dialog.Footer>
    </Dialog.Content></Dialog.Positioner>
  </Dialog.Root>;
}
