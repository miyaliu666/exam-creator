import type { ContentIdOption } from "./types.ts";

export function contentContextMode(entry: ContentIdOption): "all" | "selected" {
  return entry.contextScopeMode ?? (entry.contextIds.length ? "selected" : "all");
}

export function contentContextMatches(entry: ContentIdOption, contextId: string): boolean {
  const mode = contentContextMode(entry);
  if (entry.excludedContextIds !== undefined && (!Array.isArray(entry.excludedContextIds) || entry.excludedContextIds.some((id) => typeof id !== "string"))) return false;
  if (mode === "selected") return !entry.excludedContextIds?.length && entry.contextIds.includes(contextId);
  return mode === "all" && !entry.contextIds.length && !(entry.excludedContextIds ?? []).includes(contextId);
}
