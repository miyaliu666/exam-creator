import { Badge, Box, Button, Checkbox, HStack, Link, Stack, Table, Text } from "@chakra-ui/react";
import { Archive, ExternalLink, RotateCcw, Trash2 } from "lucide-react";

import { DIFFICULTY_LABELS, ITEM_FORMAT_LABELS, SKILL_LABELS, WORKBENCH_LABELS, slotLabel } from "./labels";
import { ITEM_STATUS_COPY } from "./item-status";
import type { GithubReviewState, LanguageItem, LanguageItemRecordState, RegistrySnapshot } from "./types";

const GITHUB_STATE_COPY: Record<
  GithubReviewState,
  { label: string; colorPalette: string }
> = {
  open: { label: "Awaiting review", colorPalette: "orange" },
  changesRequested: { label: "Changes requested", colorPalette: "red" },
  approved: { label: "Approved, awaiting merge", colorPalette: "green" },
  merged: { label: "Merged", colorPalette: "green" },
  closed: { label: "Closed", colorPalette: "gray" },
  syncFailed: { label: "Sync failed", colorPalette: "yellow" },
};

const RECORD_STATE_COPY: Record<
  LanguageItemRecordState,
  { label: string; colorPalette: string }
> = {
  active: { label: "Active", colorPalette: "teal" },
  archived: { label: "Archived", colorPalette: "gray" },
  deleted: { label: "Deleted", colorPalette: "red" },
};

export function ItemTable({
  items,
  registry,
  currentUserEmail,
  onOpen,
  onRecordStateChange,
  selectedIds,
  selectableIds,
  busy,
  onSelect,
  onSelectAll,
}: {
  items: LanguageItem[];
  registry: RegistrySnapshot | undefined;
  currentUserEmail: string | undefined;
  onOpen: (id: string) => void;
  onRecordStateChange: (
    item: LanguageItem,
    target: LanguageItemRecordState,
  ) => void;
  selectedIds: ReadonlySet<string>;
  selectableIds: readonly string[];
  busy: boolean;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
}) {
  if (items.length === 0) {
    return <Text color="fg.muted" py={8} textAlign="center">No matching items</Text>;
  }

  return (
    <Box borderWidth="1px" borderRadius="lg" overflowX="auto">
      <Table.Root size="sm" interactive>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader w="12">
              <Checkbox.Root size="sm" colorPalette="teal"
                checked={selectedIds.size === 0 ? false : selectedIds.size === selectableIds.length ? true : "indeterminate"}
                disabled={busy || selectableIds.length === 0}
                onCheckedChange={({ checked }) => onSelectAll(checked === true)}>
                <Checkbox.HiddenInput aria-label="Select all your matching items" />
                <Checkbox.Control />
              </Checkbox.Root>
            </Table.ColumnHeader>
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.blueprintSlot}</Table.ColumnHeader>
            <Table.ColumnHeader>{WORKBENCH_LABELS.itemFormat} / difficulty</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">{items[0].recordState === "active" ? "Archive" : "Restore"}</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Delete</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => {
            const status = ITEM_STATUS_COPY[item.status];
            const githubStatus = item.githubReview
              ? GITHUB_STATE_COPY[item.githubReview.state]
              : undefined;
            const isOwner = item.ownerEmail === currentUserEmail;
            const isActive = item.recordState === "active";
            return (
              <Table.Row
                key={item.id}
                onClick={() => isActive && !busy && onOpen(item.id)}
                cursor={isActive && !busy ? "pointer" : "default"}
                bg={selectedIds.has(item.id) ? "bg.muted" : undefined}
              >
                <Table.Cell onClick={(event) => event.stopPropagation()}>
                  <Checkbox.Root size="sm" colorPalette="teal" checked={selectedIds.has(item.id)}
                    disabled={!isOwner || busy} onCheckedChange={({ checked }) => onSelect(item.id, checked === true)}>
                    <Checkbox.HiddenInput aria-label={`Select ${item.title || "untitled item"} (${item.id})`} />
                    <Checkbox.Control title={isOwner ? "Select item" : "Only the owner can manage this item"} />
                  </Checkbox.Root>
                </Table.Cell>
                <Table.Cell minW="220px">
                  <Button variant="plain" h="auto" p={0} fontWeight="semibold" disabled={!isActive || busy}>
                    {item.title || "Untitled item"}
                  </Button>
                </Table.Cell>
                <Table.Cell minW="180px">
                  {slotLabel(item.draft.blueprintSlotId, registry, item.draft.itemFormatId)}
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    {SKILL_LABELS[item.draft.content.primaryReportedSkill] ?? item.draft.content.primaryReportedSkill}
                  </Text>
                </Table.Cell>
                <Table.Cell minW="160px">
                  <Text>
                    {ITEM_FORMAT_LABELS[item.draft.itemFormatId] ?? item.draft.itemFormatId}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    {DIFFICULTY_LABELS[item.draft.content.difficultyBand] ?? item.draft.content.difficultyBand}
                  </Text>
                </Table.Cell>
                <Table.Cell minW="180px" onClick={(event) => event.stopPropagation()}>
                  <Stack gap={1} align="start">
                    <HStack gap={2} flexWrap="wrap">
                      <Badge colorPalette={status.colorPalette}>{status.label}</Badge>
                      {item.recordState !== "active" ? (
                        <Badge colorPalette="gray">{RECORD_STATE_COPY[item.recordState].label}</Badge>
                      ) : null}
                    </HStack>
                    {item.githubReview && githubStatus ? (
                      <Link href={item.githubReview.pullRequestUrl} target="_blank" fontSize="xs">
                        PR #{item.githubReview.pullRequestNumber} · {githubStatus.label} <ExternalLink size={12} />
                      </Link>
                    ) : null}
                  </Stack>
                </Table.Cell>
                <Table.Cell textAlign="center" onClick={(event) => event.stopPropagation()}>
                  {isOwner ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      aria-label={`${item.recordState === "active" ? "Archive" : "Restore"} ${item.title || "untitled item"}`}
                      onClick={() => onRecordStateChange(
                        item,
                        item.recordState === "active" ? "archived" : "active",
                      )}
                    >
                      {item.recordState === "active" ? <Archive size={14} /> : <RotateCcw size={14} />}
                    </Button>
                  ) : (
                    <Text color="fg.muted">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="center" onClick={(event) => event.stopPropagation()}>
                  {isOwner && item.recordState !== "deleted" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      disabled={busy}
                      aria-label={`Move ${item.title || "untitled item"} to trash`}
                      onClick={() => onRecordStateChange(item, "deleted")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : (
                    <Text color="fg.muted">—</Text>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

