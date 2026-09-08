import {
  Button,
  CloseButton,
  Dialog,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMemo } from "react";

import {
  ITEM_FORMAT_LABELS,
  DOMAIN_LABELS,
  SKILL_LABELS,
  optionLabel,
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
  const { draft, setField } = useNewItemDraft(draftScope);
  const {
    slotId, formatId, primaryCanDoId, domainId, contextId,
    difficultyBand, skillFilter, slotSearch,
  } = draft;
  const setSlotId = (value: string) => setField("slotId", value);
  const setFormatId = (value: string) => setField("formatId", value);
  const setPrimaryCanDoId = (value: string) => setField("primaryCanDoId", value);
  const setDomainId = (value: string) => setField("domainId", value);
  const setContextId = (value: string) => setField("contextId", value);
  const setDifficultyBand = (value: string) => setField("difficultyBand", value);
  const setSkillFilter = (value: string) => setField("skillFilter", value);
  const setSlotSearch = (value: string) => setField("slotSearch", value);
  const normalizedSlotSearch = slotSearch.trim().toLocaleLowerCase();
  const visibleSlots = slots.filter(
    (entry) =>
      entry.blueprintSlotId === slotId ||
      ((!skillFilter || (registry?.capabilities ?? []).some(
          (capability) =>
            capability.blueprintSlotId === entry.blueprintSlotId &&
            capability.primaryReportedSkill === skillFilter,
        )) &&
        (!normalizedSlotSearch ||
          registryDisplayText(entry.title).toLocaleLowerCase().includes(normalizedSlotSearch))),
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
          <Dialog.Header><Dialog.Title>New item</Dialog.Title></Dialog.Header>
          <Dialog.CloseTrigger asChild>
            <CloseButton size="sm" aria-label="Close new item" disabled={isPending} />
          </Dialog.CloseTrigger>
          <Dialog.Body>
            <fieldset disabled={isPending} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
            <Stack gap={4}>
              <Field.Root>
                <Field.Label>Exam task</Field.Label>
                <HStack gap={2} mb={3} flexWrap="wrap">
                  <Button
                    size="xs"
                    variant={skillFilter === "" ? "solid" : "outline"}
                    colorPalette={skillFilter === "" ? "blue" : undefined}
                    onClick={() => setSkillFilter("")}
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
                <Input
                  mb={3}
                  aria-label="Search exam tasks"
                  placeholder="Search task name"
                  value={slotSearch}
                  onChange={(event) => setSlotSearch(event.target.value)}
                />
                <NativeSelect.Root>
                  <NativeSelect.Field
                    aria-label="Exam task"
                    value={slotId}
                    onChange={(event) => selectSlot(event.target.value)}
                  >
                    <option value="" disabled>Select an exam task</option>
                    {visibleSlots.map((entry) => (
                      <option
                        key={entry.blueprintSlotId}
                        value={entry.blueprintSlotId}
                      >
                        {skillFilter
                          ? registryDisplayText(entry.title)
                          : `${SKILL_LABELS[entry.primaryReportedSkill] ?? entry.primaryReportedSkill} · ${registryDisplayText(entry.title)}`}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root>
                <Field.Label>Item format</Field.Label>
                <NativeSelect.Root disabled={!slotId}>
                  <NativeSelect.Field
                    aria-label="Item format"
                    value={formatId}
                    onChange={(event) => selectFormat(event.target.value)}
                  >
                    <option value="" disabled>Select an item format</option>
                    {formats.map((entry) => (
                      <option key={entry.itemFormatId} value={entry.itemFormatId}>
                        {ITEM_FORMAT_LABELS[entry.itemFormatId] ?? entry.itemFormatId}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root>
                <Field.Label>Primary Can-do</Field.Label>
                <NativeSelect.Root disabled={!formatId}>
                  <NativeSelect.Field
                    aria-label="Primary Can-do"
                    value={primaryCanDoId}
                    onChange={(event) => selectPrimaryCanDo(event.target.value)}
                  >
                    <option value="" disabled>Select one primary Can-do</option>
                    {capabilityChoices.map((entry) => (
                      <option key={entry.primaryCanDoId} value={entry.primaryCanDoId}>
                        {registryDisplayText(registry?.canDoOptions.find((option) => option.id === entry.primaryCanDoId)?.label ?? optionLabel(entry.primaryCanDoId, registry?.canDoOptions))}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root>
                <Field.Label>Domain</Field.Label>
                <NativeSelect.Root disabled={!selectedCapability}>
                  <NativeSelect.Field
                    aria-label="Domain"
                    value={domainId}
                    onChange={(event) => {
                      const nextDomain = event.target.value;
                      setDomainId(nextDomain);
                      setContextId(
                        contexts.find((context) => context.primaryDomains.includes(nextDomain))?.id ?? "",
                      );
                    }}
                  >
                    <option value="" disabled>Select a domain</option>
                    {domains.map((domain) => (
                      <option key={domain} value={domain}>
                        {DOMAIN_LABELS[domain] ?? domain}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root>
                <Field.Label>Concrete context</Field.Label>
                <NativeSelect.Root disabled={!domainId}>
                  <NativeSelect.Field
                    aria-label="Concrete context"
                    value={contextId}
                    onChange={(event) => setContextId(event.target.value)}
                  >
                    <option value="" disabled>Select a context</option>
                    {visibleContexts.map((context) => (
                      <option key={context.id} value={context.id}>
                        {registryDisplayText(context.label)}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              <Field.Root>
                <Field.Label>Difficulty</Field.Label>
                <NativeSelect.Root disabled={!selectedCapability}>
                  <NativeSelect.Field
                    aria-label="Difficulty"
                    value={difficultyBand}
                    onChange={(event) => setDifficultyBand(event.target.value)}
                  >
                    <option value="" disabled>Select a difficulty band</option>
                    {difficultyStandards.map((standard) => (
                      <option key={standard.id} value={standard.id}>
                        {registryDisplayText(standard.label)}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              {selectedCapability && contexts.length === 0 ? (
                <Text color="fg.error">No compatible contexts are available for this task.</Text>
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
              Create
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
