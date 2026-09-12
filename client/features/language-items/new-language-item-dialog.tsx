import {
  Button,
  CloseButton,
  Dialog,
  HStack,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";

import { NewItemSelect } from "./new-item-select";

import {
  ITEM_FORMAT_LABELS,
  DOMAIN_LABELS,
  SKILL_LABELS,
  WORKBENCH_LABELS,
  optionLabel,
  slotLabel,
} from "./labels";
import { registryDisplayText } from "./registry-display-text";
import { useNewItemDraft } from "./new-item-draft";
import {
  contextsForCapability,
  difficultyStandardsForCapability,
} from "./registry-capability";
import type { RegistryCapability, RegistrySnapshot } from "./types";

export interface NewLanguageItemSelection {
  blueprintSlotId: string;
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

export function NewLanguageItemDialog({
  open,
  draftScope,
  registry,
  isPending,
  error,
  onClose,
  onCreate,
  title = "New item",
  actionLabel = "Create",
  initialSelection,
}: NewLanguageItemDialogProps) {
  const slots = useMemo(() => {
    const byId = new Map<string, RegistrySnapshot["capabilities"][number]>();
    for (const capability of registry?.capabilities ?? []) {
      if (!byId.has(capability.blueprintSlotId)) {
        byId.set(capability.blueprintSlotId, capability);
      }
    }
    return [...byId.values()];
  }, [registry]);
  const { draft, setField } = useNewItemDraft(draftScope, initialSelection ? {
    slotId: initialSelection.blueprintSlotId ?? "",
    formatId: initialSelection.itemFormatId ?? "",
    primaryCanDoId: initialSelection.primaryCanDoId ?? "",
    domainId: initialSelection.primaryDomain ?? "",
    contextId: initialSelection.contextId ?? "",
    difficultyBand: initialSelection.difficultyBand ?? "",
  } : undefined);
  const [openField, setOpenField] = useState<keyof NewLanguageItemSelection | null>(null);
  const dropdownState = (field: keyof NewLanguageItemSelection) => ({
    open: open && !isPending && openField === field,
    dimmed: open && !isPending && openField !== null && openField !== field,
    onOpenChange: (isOpen: boolean) => setOpenField((current) => isOpen ? field : current === field ? null : current),
  });
  const {
    slotId, formatId, primaryCanDoId, domainId, contextId,
    difficultyBand, skillFilter,
  } = draft;
  const setSlotId = (value: string) => setField("slotId", value);
  const setFormatId = (value: string) => setField("formatId", value);
  const setPrimaryCanDoId = (value: string) => setField("primaryCanDoId", value);
  const setDomainId = (value: string) => setField("domainId", value);
  const setContextId = (value: string) => setField("contextId", value);
  const setDifficultyBand = (value: string) => setField("difficultyBand", value);
  const setSkillFilter = (value: string) => setField("skillFilter", value);
  const visibleSlots = slots.filter(
    (entry) =>
      entry.blueprintSlotId === slotId ||
      (!skillFilter || (registry?.capabilities ?? []).some(
          (capability) =>
            capability.blueprintSlotId === entry.blueprintSlotId &&
            capability.primaryReportedSkill === skillFilter,
        )),
  );
  const formats = useMemo(() => {
    const byId = new Map<string, RegistryCapability>();
    for (const capability of registry?.capabilities ?? []) {
      if (capability.blueprintSlotId === slotId && !byId.has(capability.itemFormatId)) {
        byId.set(capability.itemFormatId, capability);
      }
    }
    return [...byId.values()];
  }, [registry, slotId]);
  const slot = slots.find((entry) => entry.blueprintSlotId === slotId);
  const capabilityChoices = (registry?.capabilities ?? []).filter(
    (entry) => entry.blueprintSlotId === slotId && entry.itemFormatId === formatId,
  );
  const selectedCapability = capabilityChoices.find(
    (entry) => entry.primaryCanDoId === primaryCanDoId,
  );
  const contexts = contextsForCapability(registry, selectedCapability);
  const domains = (registry?.allowedDomains ?? []).filter((domain) =>
    selectedCapability?.allowedDomains.includes(domain) &&
    contexts.some((context) => context.primaryDomains.includes(domain)),
  );
  const visibleContexts = contexts.filter((context) =>
    context.primaryDomains.includes(domainId),
  );
  const difficultyStandards = difficultyStandardsForCapability(
    registry,
    selectedCapability,
  );
  const initializeCapability = (capability: RegistryCapability | undefined) => {
    const nextContexts = contextsForCapability(registry, capability);
    const nextDomain = (registry?.allowedDomains ?? []).find((domain) =>
      capability?.allowedDomains.includes(domain) &&
      nextContexts.some((context) => context.primaryDomains.includes(domain)),
    ) ?? "";
    const nextContext = nextContexts.find((context) =>
      context.primaryDomains.includes(nextDomain),
    );
    const standards = difficultyStandardsForCapability(registry, capability);
    setDomainId(nextDomain);
    setContextId(nextContext?.id ?? "");
    setDifficultyBand(
      standards.find((standard) => standard.id === "TypicalA1")?.id ??
      standards[0]?.id ??
      "",
    );
  };
  const selectSlot = (nextSlotId: string) => {
    setSlotId(nextSlotId);
    setFormatId("");
    setPrimaryCanDoId("");
    initializeCapability(undefined);
  };
  const selectFormat = (nextFormatId: string) => {
    setFormatId(nextFormatId);
    const choices = (registry?.capabilities ?? []).filter(
      (entry) =>
        entry.blueprintSlotId === slotId &&
        entry.itemFormatId === nextFormatId,
    );
    const onlyChoice = choices.length === 1 ? choices[0] : undefined;
    setPrimaryCanDoId(onlyChoice?.primaryCanDoId ?? "");
    initializeCapability(onlyChoice);
  };
  const selectPrimaryCanDo = (nextCanDoId: string) => {
    setPrimaryCanDoId(nextCanDoId);
    initializeCapability(capabilityChoices.find(
      (entry) => entry.primaryCanDoId === nextCanDoId,
    ));
  };
  const close = () => {
    if (isPending) return;
    setOpenField(null);
    onClose();
  };
  const canCreate = !!selectedCapability &&
    domains.includes(domainId) &&
    visibleContexts.some((context) => context.id === contextId) &&
    difficultyStandards.some((standard) => standard.id === difficultyBand);

  return (
    <Dialog.Root
      open={open}
      closeOnInteractOutside={false}
      closeOnEscape={!isPending}
      onOpenChange={(details) => !details.open && close()}
      scrollBehavior="inside"
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="bg" color="fg" maxW="lg">
          <Dialog.Header><Dialog.Title>{title}</Dialog.Title></Dialog.Header>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" aria-label={`Close ${title.toLowerCase()}`} disabled={isPending} />
          </Dialog.CloseTrigger>
          <Dialog.Body>
            <fieldset disabled={isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <Stack gap={4}>
              <NewItemSelect label={WORKBENCH_LABELS.blueprintSlot} placeholder="Select a blueprint slot"
                value={slotId} onChange={selectSlot} disabled={isPending || !visibleSlots.length}
                options={visibleSlots.map((entry) => ({ value: entry.blueprintSlotId, label: skillFilter
                  ? slotLabel(entry.blueprintSlotId, registry)
                  : `${SKILL_LABELS[entry.primaryReportedSkill] ?? entry.primaryReportedSkill} · ${slotLabel(entry.blueprintSlotId, registry)}` }))}
                {...dropdownState("blueprintSlotId")}>
                <HStack gap={2} mb={3} flexWrap="wrap">
                  <Button
                    size="xs"
                    variant={skillFilter === "" ? "solid" : "outline"}
                    colorPalette={skillFilter === "" ? "blue" : undefined}
                    onClick={() => { setOpenField(null); setSkillFilter(""); }}
                  >
                    All
                  </Button>
                  {SKILL_ORDER.map((skill) => (
                    <Button
                      key={skill}
                      size="xs"
                      variant={skillFilter === skill ? "solid" : "outline"}
                      colorPalette={skillFilter === skill ? "blue" : undefined}
                      onClick={() => {
                        setOpenField(null);
                        setSkillFilter(skill);
                        if (slot && !(registry?.capabilities ?? []).some(
                          (capability) =>
                            capability.blueprintSlotId === slot.blueprintSlotId &&
                            capability.primaryReportedSkill === skill,
                        )) {
                          selectSlot("");
                        }
                      }}
                    >
                      {SKILL_LABELS[skill] ?? skill}
                    </Button>
                  ))}
                </HStack>
              </NewItemSelect>

              <NewItemSelect label={WORKBENCH_LABELS.itemFormat} placeholder="Select an item format"
                value={formatId} onChange={selectFormat} disabled={isPending || !slotId || !formats.length}
                options={formats.map((entry) => ({ value: entry.itemFormatId, label: ITEM_FORMAT_LABELS[entry.itemFormatId] ?? entry.itemFormatId }))}
                {...dropdownState("itemFormatId")} />

              <NewItemSelect label={WORKBENCH_LABELS.primaryCanDo} placeholder="Select one primary Can-do"
                value={primaryCanDoId} onChange={selectPrimaryCanDo} disabled={isPending || !formatId || !capabilityChoices.length}
                options={capabilityChoices.map((entry) => ({ value: entry.primaryCanDoId,
                  label: registryDisplayText(registry?.canDoOptions.find((option) => option.id === entry.primaryCanDoId)?.label ?? optionLabel(entry.primaryCanDoId, registry?.canDoOptions)) }))}
                {...dropdownState("primaryCanDoId")} />

              <NewItemSelect label={WORKBENCH_LABELS.domain} placeholder="Select a domain"
                value={domainId} disabled={isPending || !selectedCapability || !domains.length}
                onChange={(nextDomain) => {
                  setDomainId(nextDomain);
                  setContextId(contexts.find((context) => context.primaryDomains.includes(nextDomain))?.id ?? "");
                }}
                options={domains.map((domain) => ({ value: domain, label: DOMAIN_LABELS[domain] ?? domain }))}
                {...dropdownState("primaryDomain")} />

              <NewItemSelect label={WORKBENCH_LABELS.context} placeholder="Select a context"
                value={contextId} onChange={setContextId} disabled={isPending || !domainId || !visibleContexts.length}
                options={visibleContexts.map((context) => ({ value: context.id, label: registryDisplayText(context.label) }))}
                {...dropdownState("contextId")} />

              <NewItemSelect label={WORKBENCH_LABELS.difficulty} placeholder="Select a difficulty band"
                value={difficultyBand} onChange={setDifficultyBand} disabled={isPending || !selectedCapability || !difficultyStandards.length}
                options={difficultyStandards.map((standard) => ({ value: standard.id, label: registryDisplayText(standard.label) }))}
                {...dropdownState("difficultyBand")} />
              {selectedCapability && contexts.length === 0 ? (
                <Text color="fg.error">No compatible contexts are available for these item rules.</Text>
              ) : null}
              {error ? <Text role="alert" color="fg.error">{error.message}</Text> : null}
            </Stack>
            </fieldset>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" disabled={isPending} onClick={close}>Cancel</Button>
            <Button
              colorPalette="teal"
              loading={isPending}
              disabled={!canCreate || isPending}
              onClick={() =>
                selectedCapability &&
                onCreate({
                  blueprintSlotId: selectedCapability.blueprintSlotId,
                  itemFormatId: selectedCapability.itemFormatId,
                  primaryCanDoId: selectedCapability.primaryCanDoId,
                  primaryDomain: domainId,
                  contextId,
                  difficultyBand,
                })
              }
            >
              {actionLabel}
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
