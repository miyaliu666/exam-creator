import { Badge, Box, Button, HStack, Stack, Table, Text } from "@chakra-ui/react";

import type { BatchGenerationChild, BatchGroup } from "./batch-api";
import { additionalBatchTargets } from "./batch-progress-display";
import { generationErrorMessage } from "./generation-message";
import { DIFFICULTY_LABELS, DOMAIN_LABELS, ITEM_FORMAT_LABELS, WORKBENCH_LABELS, contentOptionLabel, optionLabel, slotLabel } from "./labels";
import { languageTargetLabel } from "./language-target-labels";
import type { RegistrySnapshot } from "./types";

const CHILD_LABELS: Record<BatchGenerationChild["status"], string> = {
  pending: "Waiting", running: "Generating", completed: "AI drafts ready", partial: "Some AI drafts ready", failed: "Generation failed",
};

function BatchTargets({ ids, registry }: { ids: string[]; registry: RegistrySnapshot }) {
  return <HStack gap={2} flexWrap="wrap">{ids.map((id) => {
    const option = registry.contentIdOptions.find((entry) => entry.id === id);
    return <Badge key={id} variant="subtle" tabIndex={0} title={option ? contentOptionLabel(id, registry) : id}>
      {option ? languageTargetLabel(option).primary : "Unavailable target"}
    </Badge>;
  })}</HStack>;
}

export function BatchProgressGroup({ group, groupIndex, grouped, children, registry, labelsError, onOpenItem }: {
  group: BatchGroup;
  groupIndex: number;
  grouped: boolean;
  children: BatchGenerationChild[];
  registry: RegistrySnapshot | undefined;
  labelsError: boolean;
  onOpenItem: (id: string) => void;
}) {
  const hasAdditionalTargets = children.some((child) => additionalBatchTargets(child, group).length > 0);
  const fields = registry ? [
    [WORKBENCH_LABELS.blueprintSlot, slotLabel(group.blueprintSlotId, registry, group.itemFormatId)],
    [WORKBENCH_LABELS.itemFormat, ITEM_FORMAT_LABELS[group.itemFormatId] ?? group.itemFormatId],
    [WORKBENCH_LABELS.primaryCanDo, optionLabel(group.primaryCanDoId, registry.canDoOptions)],
    [WORKBENCH_LABELS.domain, DOMAIN_LABELS[group.primaryDomain] ?? group.primaryDomain],
    [WORKBENCH_LABELS.context, optionLabel(group.contextId, registry.contextOptions)],
    [WORKBENCH_LABELS.difficulty, DIFFICULTY_LABELS[group.difficultyBand] ?? group.difficultyBand],
  ] : [];
  return <Stack gap={3} borderTopWidth="1px" pt={3}>
    {grouped ? <Text fontWeight="semibold">Group {groupIndex + 1}</Text> : null}
    {registry ? <>
      <Box as="dl" display="grid" gridTemplateColumns={{ base: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(3, minmax(0, 1fr))" }} gap={2}>
        {fields.map(([label, value]) => <Box key={label}><Text as="dt" color="fg.muted" fontSize="xs">{label}</Text><Text as="dd" fontSize="sm">{value}</Text></Box>)}
      </Box>
      {group.requiredTargetContentIds.length ? <HStack align="start" flexWrap="wrap">
        <Text fontSize="sm" color="fg.muted">{group.itemCount === 1 ? "Language targets" : "Required in every item"}</Text>
        <BatchTargets ids={group.requiredTargetContentIds} registry={registry} />
      </HStack> : null}
    </> : <Text color="fg.muted" fontSize="sm">{labelsError ? "Item setup and target labels unavailable" : "Loading item setup…"}</Text>}
    <Box overflowX="auto"><Table.Root size="sm"><Table.Header><Table.Row>
      <Table.ColumnHeader>Item</Table.ColumnHeader>
      {hasAdditionalTargets ? <Table.ColumnHeader>{group.requiredTargetContentIds.length ? "Additional targets" : "Language targets"}</Table.ColumnHeader> : null}
      <Table.ColumnHeader>Generation</Table.ColumnHeader><Table.ColumnHeader />
    </Table.Row></Table.Header><Table.Body>{children.map((child) => <Table.Row key={child.index}>
      <Table.Cell><Text whiteSpace="nowrap">Item {child.index + 1}</Text></Table.Cell>
      {hasAdditionalTargets ? <Table.Cell>{registry ? <BatchTargets ids={additionalBatchTargets(child, group)} registry={registry} /> : "—"}</Table.Cell> : null}
      <Table.Cell><Text>{CHILD_LABELS[child.status]}</Text>{child.error ? <Text color="fg.error" fontSize="xs" maxW="320px">{generationErrorMessage(child.error)}</Text> : null}</Table.Cell>
      <Table.Cell>{child.itemId && child.itemCreated ? <Button size="xs" variant="outline" onClick={() => onOpenItem(child.itemId!)}>Open item</Button> : null}</Table.Cell>
    </Table.Row>)}</Table.Body></Table.Root></Box>
  </Stack>;
}
