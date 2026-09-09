import { Box, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { deleteLanguageItem, updateLanguageItemRecordState } from "./api";
import { ItemBankActions, ItemBankDeleteDialog } from "./item-bank-actions";
import { changeItemRecordStates, selectableItemIds, type ItemRecordSummary } from "./item-bank-operations";
import { ItemTable } from "./item-bank-table";
import type { LanguageItem, LanguageItemRecordState, RegistrySnapshot } from "./types";

const RESULT_ACTION = { active: "restored", archived: "archived", deleted: "moved to Trash" };

export function ItemBankList({ items, registry, recordState, currentUserEmail, selectionScope, onOpen }: {
  items: LanguageItem[];
  registry: RegistrySnapshot | undefined;
  recordState: LanguageItemRecordState;
  currentUserEmail: string | undefined;
  selectionScope: string;
  onOpen: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState({ scope: selectionScope, ids: [] as string[] });
  const [deletion, setDeletion] = useState<{ scope: string; items: ItemRecordSummary[] }>();
  const selectableIds = selectableItemIds(items, currentUserEmail);
  // Reset on query/account changes before another action can use a hidden selection.
  if (selection.scope !== selectionScope) {
    setSelection({ scope: selectionScope, ids: [] });
    setDeletion(undefined);
  }
  const selectedIds = new Set(selection.scope === selectionScope
    ? selection.ids.filter((id) => selectableIds.includes(id)) : []);
  const mutation = useMutation({
    mutationFn: ({ items: selected, target }: {
      items: ItemRecordSummary[]; target: LanguageItemRecordState; scope: string;
    }) => changeItemRecordStates(selected, target, (id, nextState) => nextState === "deleted"
      ? deleteLanguageItem(id) : updateLanguageItemRecordState(id, nextState)),
    onSuccess: async (result, variables) => {
      // Keep successful changes visible even when the subsequent list refresh fails.
      await queryClient.cancelQueries({ queryKey: ["language-items"] });
      const updated = new Map(result.succeeded.map((item) => [item.id, item]));
      queryClient.setQueryData<LanguageItem[]>(["language-items"], (cached) =>
        cached?.map((item) => updated.get(item.id) ?? item));
      setSelection((current) => current.scope === variables.scope
        ? { ...current, ids: [...new Set([...current.ids.filter((id) => !updated.has(id)), ...result.failed.map(({ item }) => item.id)])] }
        : current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["language-items"] }),
        queryClient.invalidateQueries({ queryKey: ["language-item-review-queue"] }),
        ...variables.items.flatMap((item) => [
          queryClient.invalidateQueries({ queryKey: ["language-item", item.id] }),
          queryClient.invalidateQueries({ queryKey: ["language-item-audit", item.id] }),
        ]),
      ]);
    },
  });

  function change(selected: ItemRecordSummary[], target: LanguageItemRecordState) {
    if (mutation.isPending) return;
    const eligible = selected.filter((item) => selectableIds.includes(item.id)
      && item.recordState !== target && (target !== "archived" || item.recordState === "active"));
    if (!eligible.length) return;
    if (target === "deleted") setDeletion({ scope: selectionScope, items: eligible });
    else mutation.mutate({ items: eligible, target, scope: selectionScope });
  }

  const result = mutation.variables?.scope === selectionScope ? mutation.data : undefined;
  const pendingDeletion = deletion?.scope === selectionScope ? deletion.items : [];
  return <Stack gap={3}>
    <ItemBankActions count={selectedIds.size} selectableCount={selectableIds.length}
      recordState={recordState} busy={mutation.isPending}
      onClear={() => setSelection({ scope: selectionScope, ids: [] })}
      onChange={(target) => change(items.filter((item) => selectedIds.has(item.id)), target)} />
    {mutation.isPending ? <Text role="status" fontSize="sm">Updating {mutation.variables.items.length} {mutation.variables.items.length === 1 ? "item" : "items"}…</Text> : null}
    {result ? <Box role={result.failed.length ? "alert" : "status"} borderWidth="1px" borderRadius="md" p={3}>
      <Text fontSize="sm" color={result.failed.length ? "fg.error" : "fg.success"}>
        {result.succeeded.length} {result.succeeded.length === 1 ? "item" : "items"} {RESULT_ACTION[mutation.variables!.target]}.
        {result.failed.length ? ` ${result.failed.length} failed; these items remain selected. Retry the action for the selected items.` : ""}
      </Text>
      {result.failed.length ? <Box as="ul" ps={5} maxH="48" overflowY="auto" fontSize="sm" mt={2}>
        {result.failed.map(({ item, message }) => <li key={item.id}>{item.title || "Untitled item"}: {message}</li>)}
      </Box> : null}
    </Box> : null}
    {mutation.error ? <Text role="alert" color="fg.error">{mutation.error.message}</Text> : null}
    <ItemTable items={items} registry={registry} currentUserEmail={currentUserEmail} onOpen={onOpen}
      onRecordStateChange={(item, target) => change([item], target)}
      selectedIds={selectedIds} selectableIds={selectableIds} busy={mutation.isPending}
      onSelect={(id, checked) => {
        if (mutation.isPending || !selectableIds.includes(id)) return;
        const next = new Set(selectedIds);
        if (checked) next.add(id); else next.delete(id);
        setSelection({ scope: selectionScope, ids: [...next] });
      }}
      onSelectAll={(checked) => !mutation.isPending && setSelection({ scope: selectionScope, ids: checked ? selectableIds : [] })} />
    <ItemBankDeleteDialog items={pendingDeletion} onClose={() => setDeletion(undefined)} onConfirm={() => {
      if (mutation.isPending || !pendingDeletion.length) return;
      const currentItems = items.filter((item) => pendingDeletion.some((selected) => selected.id === item.id)
        && item.ownerEmail === currentUserEmail && item.recordState !== "deleted");
      setDeletion(undefined);
      if (currentItems.length) mutation.mutate({ items: currentItems, target: "deleted", scope: selectionScope });
    }} />
  </Stack>;
}
