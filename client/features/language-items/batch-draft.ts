import { useEffect, useState } from "react";

import type { CreateBatchInput } from "./batch-api";
import { emptyBatchDraft, restoreBatchDraft, reviseBatchDraft } from "./batch-draft-storage";

export function useBatchDraft(scope: string, registryVersion: string) {
  const key = `language-items:batch-plan:${scope}`;
  const [draft, setDraft] = useState<CreateBatchInput>(() => {
    try {
      return restoreBatchDraft(sessionStorage.getItem(key), registryVersion);
    } catch {
      // Ignore unusable local plans; submitted batches are loaded independently from the server.
    }
    return emptyBatchDraft(registryVersion);
  });
  useEffect(() => {
    try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* The in-memory plan remains editable. */ }
  }, [draft, key]);
  const update = (change: Partial<CreateBatchInput>) => setDraft((current) => reviseBatchDraft(current, change));
  const reset = () => {
    const next = emptyBatchDraft(registryVersion);
    try { sessionStorage.setItem(key, JSON.stringify(next)); } catch { /* The next mounted composer can still start empty. */ }
    setDraft(next);
  };
  return { draft, update, reset };
}
