import type { LanguageItem, LanguageItemRecordState } from "./types";

export type ItemRecordSummary = Pick<
  LanguageItem,
  "id" | "title" | "ownerEmail" | "recordState"
>;

export function selectableItemIds(
  items: readonly ItemRecordSummary[],
  ownerEmail: string | undefined,
): string[] {
  if (!ownerEmail) return [];
  return [...new Set(items.filter((item) => item.ownerEmail === ownerEmail).map((item) => item.id))];
}

export async function changeItemRecordStates(
  items: readonly ItemRecordSummary[],
  target: LanguageItemRecordState,
  change: (id: string, target: LanguageItemRecordState) => Promise<LanguageItem>,
): Promise<{
  succeeded: LanguageItem[];
  failed: Array<{ item: ItemRecordSummary; message: string }>;
}> {
  const uniqueItems = new Map<string, ItemRecordSummary>();
  for (const item of items) {
    if (!uniqueItems.has(item.id)) uniqueItems.set(item.id, item);
  }
  const pending = [...uniqueItems.values()];
  const outcomes: Array<
    { succeeded: LanguageItem } | { failed: { item: ItemRecordSummary; message: string } }
  > = new Array(pending.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < pending.length) {
      const index = nextIndex++;
      const item = pending[index];
      try {
        outcomes[index] = { succeeded: await change(item.id, target) };
      } catch (error) {
        outcomes[index] = {
          failed: {
            item,
            message: error instanceof Error
              ? error.message
              : typeof error === "string" ? error : "The item could not be updated.",
          },
        };
      }
    }
  }

  // Bound requests while allowing every selected item to finish independently.
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  const succeeded: LanguageItem[] = [];
  const failed: Array<{ item: ItemRecordSummary; message: string }> = [];
  for (const outcome of outcomes) {
    if ("succeeded" in outcome) succeeded.push(outcome.succeeded);
    else failed.push(outcome.failed);
  }
  return { succeeded, failed };
}
