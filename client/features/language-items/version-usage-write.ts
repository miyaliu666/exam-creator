import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { recordVersionUsage } from "./version-usage-api";
import type { VersionUsageChange, VersionUsageSummary, VersionUsageWrite } from "./version-usage-types";

export function useVersionUsageWrite(itemId: string, version: VersionUsageSummary, onSaved: () => void) {
  const cache = useQueryClient();
  const pending = useRef<{ key: string; input: VersionUsageWrite } | null>(null);
  const mutation = useMutation({
    mutationFn: (change: VersionUsageChange) => {
      const key = JSON.stringify(change);
      // A retry after an uncertain response must identify the original write even if polling advanced the revision.
      if (pending.current?.key !== key) pending.current = { key, input: {
        requestId: crypto.randomUUID(), expectedRevision: version.revision, change,
      } };
      return recordVersionUsage(itemId, version.versionId, pending.current.input);
    },
    onSuccess: async () => {
      pending.current = null;
      onSaved();
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["language-item-usage", itemId] }),
        cache.invalidateQueries({ queryKey: ["language-version-usage", itemId, version.versionId] }),
      ]);
    },
    onError: async (error) => {
      if (error.message.startsWith("409")) {
        pending.current = null;
        await cache.invalidateQueries({ queryKey: ["language-version-usage", itemId, version.versionId] });
      }
    },
  });
  return { ...mutation, retryPending: mutation.isError && pending.current !== null, resetRequest: () => { pending.current = null; mutation.reset(); } };
}
