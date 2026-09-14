import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SOURCES = ["catalog", "shared", "review", "newRules"] as const;
type DirtySource = typeof SOURCES[number];

export function useRegistryEditorDirty(onChange?: (dirty: boolean) => void) {
  const [dirty, setDirty] = useState<Partial<Record<DirtySource, boolean>>>({});
  const report = useCallback((source: DirtySource, value: boolean) => setDirty((current) => current[source] === value ? current : { ...current, [source]: value }), []);
  const callbacks = useMemo(() => Object.fromEntries(SOURCES.map((source) => [source, (value: boolean) => report(source, value)])) as Record<DirtySource, (value: boolean) => void>, [report]);
  const anyDirty = Object.values(dirty).some(Boolean);
  useEffect(() => { onChange?.(anyDirty); }, [anyDirty, onChange]);
  return { dirty, callbacks };
}

export type RegistryEditorView = "rules:overview" | "rules:detail" | "content:directory";

export function useRegistryEditorNavigation() {
  const [view, setView] = useState<RegistryEditorView>("rules:overview");
  const positions = useRef<Partial<Record<RegistryEditorView, number>>>({});
  const previous = useRef(view);
  const navigate = (next: RegistryEditorView) => {
    if (next === view) return;
    positions.current[view] = window.scrollY;
    setView(next);
  };
  useEffect(() => {
    if (previous.current === view) return;
    previous.current = view;
    window.scrollTo({ top: positions.current[view] ?? 0, behavior: "instant" });
  }, [view]);
  return { view, navigate };
}
