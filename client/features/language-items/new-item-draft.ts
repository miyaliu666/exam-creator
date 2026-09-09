import { useEffect, useState } from "react";

const EMPTY_DRAFT = {
  slotId: "",
  formatId: "",
  primaryCanDoId: "",
  domainId: "",
  contextId: "",
  difficultyBand: "",
  skillFilter: "",
};

function storageKey(scope: string) {
  return `language-items:new-item:${scope}`;
}

export function clearNewItemDraft(scope: string) {
  try {
    sessionStorage.removeItem(storageKey(scope));
  } catch {
    // In-memory state still works when the browser disables storage.
  }
}

export function useNewItemDraft(scope: string, initialValues?: Partial<typeof EMPTY_DRAFT>) {
  const [draft, setDraft] = useState(() => {
    const initial = { ...EMPTY_DRAFT };
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(scope)) ?? "null");
      if (saved && typeof saved === "object") {
        for (const key of Object.keys(initial) as Array<keyof typeof initial>) {
          const value: unknown = (saved as Record<string, unknown>)[key];
          if (typeof value === "string") initial[key] = value;
        }
      }
    } catch {
      // Ignore an unavailable or obsolete browser draft.
    }
    return { ...initial, ...initialValues };
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(scope), JSON.stringify(draft));
    } catch {
      // Closing and reopening the dialog still retains its in-memory choices.
    }
  }, [draft, scope]);

  const setField = (key: keyof typeof EMPTY_DRAFT, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  return { draft, setField };
}
