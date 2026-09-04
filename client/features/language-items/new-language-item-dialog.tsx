import {
  Badge,
  Box,
  Button,
  Dialog,
  Field,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMemo, useState } from "react";

import {
  ITEM_FORMAT_LABELS,
  SKILL_LABELS,
  SLOT_LABELS,
  optionLabel,
} from "./labels";
import type { RegistrySnapshot } from "./types";

export interface NewLanguageItemSelection {
  blueprintSlotId: string;
  itemFormatId: string;
}

interface NewLanguageItemDialogProps {
  open: boolean;
  registry: RegistrySnapshot | undefined;
  isPending: boolean;
  onClose: () => void;
  onCreate: (selection: NewLanguageItemSelection) => void;
}

const SKILL_ORDER = ["Reading", "Listening", "Writing", "Speaking"];

const ACTIVITY_LABELS: Record<string, string> = {
  Reception: "Reception",
  Production: "Production",
  Interaction: "Interaction",
  Mediation: "Mediation",
};

const FORMAT_STRUCTURE: Record<string, string> = {
  "IF-SINGLE-SELECT": "One stimulus, one question, and at least two options.",
  "IF-MATCHING": "Match at least two prompts with the available answers.",
  "IF-RESTRICTED-INPUT": "Read or listen to a short stimulus and enter explicit information.",
  "IF-FORM-ENTRY": "Complete four to six short form fields.",
  "IF-TYPED-MESSAGE": "Write a short message for the specified recipient and purpose.",
  "IF-SPOKEN-SINGLE": "Give one short spoken response to a visible or audio prompt.",
  "IF-SPOKEN-MULTITURN": "Complete a short fixed-path interaction.",
};

export function NewLanguageItemDialog({
  open,
  registry,
  isPending,
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
  const [slotId, setSlotId] = useState("");
  const [formatId, setFormatId] = useState("");
  const [skillFilter, setSkillFilter] = useState("");
  const [slotSearch, setSlotSearch] = useState("");
  const normalizedSlotSearch = slotSearch.trim().toLocaleLowerCase();
  const visibleSlots = slots.filter(
    (entry) =>
      (!skillFilter || entry.primaryReportedSkill === skillFilter) &&
      (!normalizedSlotSearch ||
        entry.title.toLocaleLowerCase().includes(normalizedSlotSearch) ||
        entry.blueprintSlotId.toLocaleLowerCase().includes(normalizedSlotSearch)),
  );
  const formats = (registry?.capabilities ?? []).filter(
    (entry) => entry.blueprintSlotId === slotId,
  );
  const slot = slots.find((entry) => entry.blueprintSlotId === slotId);
  const selectedCapability = formats.find(
    (entry) => entry.itemFormatId === formatId,
  );
  const selectSlot = (nextSlotId: string) => {
    setSlotId(nextSlotId);
    setFormatId("");
  };
  const close = () => {
    setSlotId("");
    setFormatId("");
    setSkillFilter("");
    setSlotSearch("");
    onClose();
  };

  return (
    <Dialog.Root open={open} onOpenChange={(details) => !details.open && close()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content bg="bg" color="fg" maxW="lg">
          <Dialog.Header>New item</Dialog.Header>
          <Dialog.CloseTrigger />
          <Dialog.Body>
            <Stack gap={5}>
              <Field.Root>
                <Field.Label>Exam task</Field.Label>
                <Field.HelperText mb={2}>
                  Select the exam task first. The four skills are filters only.
                </Field.HelperText>
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
                        if (slot?.primaryReportedSkill !== skill) {
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
                          ? SLOT_LABELS[entry.blueprintSlotId] ?? entry.title
                          : `${SKILL_LABELS[entry.primaryReportedSkill] ?? entry.primaryReportedSkill} · ${SLOT_LABELS[entry.blueprintSlotId] ?? entry.title}`}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>

              {slot ? (
                <Box borderWidth="1px" borderRadius="lg" p={4} bg="bg.subtle">
                  <Text fontSize="sm" color="fg.muted">Can-do</Text>
                  <Text fontWeight="semibold" mt={1}>
                    {optionLabel(slot.primaryCanDoId, registry?.canDoOptions)}
                  </Text>
                  <HStack mt={2} gap={2} flexWrap="wrap">
                    <Badge variant="outline">
                      {SKILL_LABELS[slot.primaryReportedSkill] ?? slot.primaryReportedSkill}
                    </Badge>
                    {(slot.communicativeActivities ?? [slot.communicativeActivity]).map(
                      (activity) => (
                        <Badge key={activity} variant="outline" colorPalette="purple">
                          {ACTIVITY_LABELS[activity] ?? activity}
                        </Badge>
                      ),
                    )}
                  </HStack>
                </Box>
              ) : null}

              <Field.Root>
                <Field.Label>Item format</Field.Label>
                <NativeSelect.Root disabled={!slotId}>
                  <NativeSelect.Field
                    aria-label="Item format"
                    value={formatId}
                    onChange={(event) => setFormatId(event.target.value)}
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
                {selectedCapability ? (
                  <Field.HelperText>
                    {FORMAT_STRUCTURE[selectedCapability.itemFormatId] ?? selectedCapability.taskStructure}
                  </Field.HelperText>
                ) : null}
              </Field.Root>
            </Stack>
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="ghost" onClick={close}>Cancel</Button>
            <Button
              colorPalette="teal"
              loading={isPending}
              disabled={!selectedCapability}
              onClick={() =>
                selectedCapability &&
                onCreate({
                  blueprintSlotId: selectedCapability.blueprintSlotId,
                  itemFormatId: selectedCapability.itemFormatId,
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
