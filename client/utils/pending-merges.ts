import { toaster } from "../components/toaster";
import { queryClient } from "../contexts/query-client";
import {
  cancelUserMerge,
  scheduleUserMerge,
  type MergeUsersPayload,
} from "./fetch";

const MERGE_DELAY_SECONDS = 10;

// The countdown toast must outlive the page: the toaster is global, and the user
// navigates from the deduplicate page back to /users while the grace period runs.
// All pending-merge state therefore lives at module scope, shared by every page.
const mergeTimers = new Map<
  string,
  { timeout: number; interval: number; toastId: string }
>();

// Ids of `user` records scheduled for discard by a pending merge. Entries are only
// removed on undo; a finalized merge keeps them in the set so stale cached lists keep
// hiding the now-deleted records.
let pendingDiscarded = new Set<string>();
const pendingDiscardedListeners = new Set<() => void>();

export function subscribePendingMerges(listener: () => void) {
  pendingDiscardedListeners.add(listener);
  return () => pendingDiscardedListeners.delete(listener);
}

export function getPendingDiscarded() {
  return pendingDiscarded;
}

function setPendingDiscarded(ids: string[], pending: boolean) {
  const next = new Set(pendingDiscarded);
  for (const id of ids) {
    if (pending) {
      next.add(id);
    } else {
      next.delete(id);
    }
  }
  pendingDiscarded = next;
  pendingDiscardedListeners.forEach((listener) => listener());
}

// Tear down a merge's countdown toast and timers.
function clearMergeTimers(survivorId: string) {
  const timers = mergeTimers.get(survivorId);
  if (timers) {
    window.clearTimeout(timers.timeout);
    window.clearInterval(timers.interval);
    toaster.dismiss(timers.toastId);
    mergeTimers.delete(survivorId);
  }
}

// Drop cached user lookups so nothing renders the pre-merge records. Inactive-only:
// removing an actively observed query would trigger an immediate refetch of now-stale data.
function purgeMergedUsers() {
  queryClient.removeQueries({ queryKey: ["user-duplicates"], type: "inactive" });
  queryClient.removeQueries({ queryKey: ["user-search"], type: "inactive" });
}

// Undo: cancel the server-side pending merge and restore the discarded records.
export function undoMerge(survivorId: string, discardedIds: string[]) {
  clearMergeTimers(survivorId);
  setPendingDiscarded(discardedIds, false);
  cancelUserMerge(survivorId).catch((e: Error) => {
    toaster.create({
      type: "error",
      title: "Undo failed",
      description: e.message,
    });
  });
}

export function scheduleMerge(payload: MergeUsersPayload) {
  const { survivorId, discardedIds } = payload;
  // Optimistically hide the records that will be discarded.
  setPendingDiscarded(discardedIds, true);

  // Server owns the grace-period timer; the client countdown is only the undo affordance.
  scheduleUserMerge(payload).catch((e: Error) => {
    clearMergeTimers(survivorId);
    setPendingDiscarded(discardedIds, false);
    toaster.create({
      type: "error",
      title: "Merge failed",
      description: e.message,
    });
  });

  const total = discardedIds.length + 1;
  let remaining = MERGE_DELAY_SECONDS;
  const toastId = toaster.create({
    type: "info",
    title: `Merging ${total} accounts into 1`,
    description: `Undo within ${remaining}s`,
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Undo",
      onClick: () => undoMerge(survivorId, discardedIds),
    },
  });

  const interval = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      toaster.update(toastId, { description: `Undo within ${remaining}s` });
    }
  }, 1000);

  // Grace elapsed: the server has now performed the merge. Dismiss the toast, purge
  // stale caches, and leave the discarded ids in the set so they stay hidden. No undo
  // past this point.
  const timeout = window.setTimeout(() => {
    clearMergeTimers(survivorId);
    purgeMergedUsers();
  }, MERGE_DELAY_SECONDS * 1000);

  mergeTimers.set(survivorId, { timeout, interval, toastId });
}
