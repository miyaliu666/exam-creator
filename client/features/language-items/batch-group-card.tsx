import { Badge, Box, Button, Field, HStack, Input, Stack, Text } from "@chakra-ui/react";

import type { BatchGroup } from "./batch-api";
import { batchCapability, batchTargetOptions, BATCH_ITEM_LIMIT } from "./batch-plan";
import { BatchTargetAllocation } from "./batch-target-allocation";
import { CONTENT_KIND_LABELS, DIFFICULTY_LABELS, DOMAIN_LABELS, ITEM_FORMAT_LABELS, contentOptionLabel, optionLabel, slotLabel } from "./labels";
import { languageTargetDisplayText } from "./language-target-labels";
import { RegistryMultiSelect } from "./registry-multi-select";
import { registryDisplayText } from "./registry-display-text";
import type { RegistrySnapshot } from "./types";

export function BatchGroupCard({ group, index, itemOffset, grouped = true, registry, disabled, onChange, onEditSetup, onRemove }: {
  group: BatchGroup;
  index: number;
  itemOffset: number;
  grouped?: boolean;
  registry: RegistrySnapshot;
  disabled: boolean;
  onChange: (group: BatchGroup) => void;
  onEditSetup: () => void;
  onRemove: () => void;
}) {
  const capability = batchCapability(group, registry);
  const compatible = batchTargetOptions(group, registry);
  const options = compatible.map((entry) => ({ id: entry.id,
    label: `${CONTENT_KIND_LABELS[entry.kind] ?? entry.kind} · ${languageTargetDisplayText(entry)}` }));
  const incompatible = [...new Set([...group.requiredTargetContentIds, ...group.rotatingTargetContentIds])]
    .filter((id) => !compatible.some((option) => option.id === id));
  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <Stack gap={4}>
        <HStack justify="space-between" align="start" flexWrap="wrap">
          <Stack gap={1}>
            <Text fontWeight="semibold">{grouped ? `Group ${index + 1} · ` : ""}{slotLabel(group.blueprintSlotId, registry)}</Text>
            <Text fontSize="sm">{ITEM_FORMAT_LABELS[group.itemFormatId]} · {DOMAIN_LABELS[group.primaryDomain]} · {DIFFICULTY_LABELS[group.difficultyBand]}</Text>
            <Text fontSize="sm">{registryDisplayText(optionLabel(group.primaryCanDoId, registry.canDoOptions))}</Text>
            <Text fontSize="sm" color="fg.muted">{registryDisplayText(optionLabel(group.contextId, registry.contextOptions))}</Text>
            {capability ? <HStack flexWrap="wrap"><Badge>{capability.primaryReportedSkill}</Badge>
              {(capability.communicativeActivities ?? [capability.communicativeActivity]).map((activity) => <Badge key={activity} colorPalette="teal">{activity}</Badge>)}
            </HStack> : null}
          </Stack>
          <HStack><Button size="xs" variant="outline" disabled={disabled} onClick={onEditSetup}>Edit item setup</Button>
            {grouped ? <Button size="xs" variant="ghost" colorPalette="red" disabled={disabled} onClick={onRemove}>Remove group</Button> : null}</HStack>
        </HStack>
        <Field.Root>
          <Field.Label>Number of items</Field.Label>
          <Input aria-label={grouped ? `Number of items in group ${index + 1}` : "Number of items"} type="number" min={1} max={BATCH_ITEM_LIMIT} maxW="120px"
            value={group.itemCount || ""} disabled={disabled} onChange={(event) => onChange({ ...group, itemCount: Number(event.target.value) })} />
        </Field.Root>
        <Stack gap={2}>
          <RegistryMultiSelect label={group.itemCount === 1 ? "What this item should assess" : "Targets required in every item"} values={group.requiredTargetContentIds} disabled={disabled}
            options={options.filter((option) => !group.rotatingTargetContentIds.includes(option.id))}
            onChange={(requiredTargetContentIds) => onChange({ ...group, requiredTargetContentIds })} />
          <Text fontSize="sm" color="fg.muted">Choose core targets in vocabulary, grammar, Chinese characters or pragmatics. You don't need to list every word in the item.</Text>
        </Stack>
        {group.itemCount > 1 || group.rotatingTargetContentIds.length ? <Stack gap={2}>
          <RegistryMultiSelect label="Different targets for different items" values={group.rotatingTargetContentIds} disabled={disabled}
            options={options.filter((option) => !group.requiredTargetContentIds.includes(option.id))}
            onChange={(rotatingTargetContentIds) => onChange({ ...group, rotatingTargetContentIds })} />
          <Text fontSize="sm" color="fg.muted">Targets are assigned across items in order, repeating if needed. Each item gets one or more, plus the targets required above. Preview the assignments below.</Text>
        </Stack> : null}
        <BatchTargetAllocation group={group} registry={registry} itemOffset={itemOffset} />
        {incompatible.map((id) => <HStack key={id} justify="space-between"><Text color="fg.error" fontSize="sm">{contentOptionLabel(id, registry)} is unavailable for this setup.</Text>
          <Button size="xs" disabled={disabled} onClick={() => onChange({ ...group,
            requiredTargetContentIds: group.requiredTargetContentIds.filter((value) => value !== id),
            rotatingTargetContentIds: group.rotatingTargetContentIds.filter((value) => value !== id) })}>Remove target</Button></HStack>)}
      </Stack>
    </Box>
  );
}
