import { Button, Dialog, HStack, Stack, Text } from "@chakra-ui/react";
import { Archive, RotateCcw, Trash2 } from "lucide-react";

import type { ItemRecordSummary } from "./item-bank-operations";
import type { LanguageItemRecordState } from "./types";

export function ItemBankActions({ count, selectableCount, recordState, busy, onClear, onChange }: {
  count: number;
  selectableCount: number;
  recordState: LanguageItemRecordState;
  busy: boolean;
  onClear: () => void;
  onChange: (target: LanguageItemRecordState) => void;
}) {
  return <HStack flexWrap="wrap" justify="space-between" gap={3}>
    <Text fontSize="sm" color="fg.muted" role="status">
      {count > 0 ? `${count} selected` : `Select items to manage (${selectableCount} yours)`}
    </Text>
    <HStack flexWrap="wrap" gap={2}>
      {count > 0 ? <Button size="sm" variant="ghost" disabled={busy} onClick={onClear}>Clear selection</Button> : null}
      <Button size="sm" variant="outline" disabled={!count || busy} onClick={() => onChange(recordState === "active" ? "archived" : "active")}>
        {recordState === "active" ? <Archive size={16} /> : <RotateCcw size={16} />}
        {recordState === "active" ? "Archive selected" : "Restore selected"}
      </Button>
      {recordState !== "deleted" ? <Button size="sm" variant="outline" colorPalette="red" disabled={!count || busy} onClick={() => onChange("deleted")}>
        <Trash2 size={16} /> Delete selected
      </Button> : null}
    </HStack>
  </HStack>;
}

export function ItemBankDeleteDialog({ items, onClose, onConfirm }: {
  items: readonly ItemRecordSummary[];
  onClose: () => void;
  onConfirm: () => void;
}) {
  return <Dialog.Root open={items.length > 0} role="alertdialog" onOpenChange={({ open }) => !open && onClose()}>
    <Dialog.Backdrop />
    <Dialog.Positioner>
      <Dialog.Content>
        <Dialog.Header><Dialog.Title>Move {items.length} {items.length === 1 ? "item" : "items"} to Trash?</Dialog.Title></Dialog.Header>
        <Dialog.Body>
          <Stack gap={3}>
            <Dialog.Description>You can restore these items from Trash. Version, review, and delivery records will be retained.</Dialog.Description>
            <Stack maxH="48" overflowY="auto" gap={1}>
              {items.map((item) => <Text key={item.id} fontSize="sm" title={item.id}>{item.title || "Untitled item"}</Text>)}
            </Stack>
          </Stack>
        </Dialog.Body>
        <Dialog.Footer>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button colorPalette="red" onClick={onConfirm}>Move to Trash</Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog.Positioner>
  </Dialog.Root>;
}
