import type { ContentIdOption, RegistrySnapshot } from "./types";

/** New settings use the item rule for Context and assessment; old pinned snapshots stay intact. */
export function simplifyContentEntry(entry: ContentIdOption): ContentIdOption {
  const { contextScopeMode: _contextScopeMode, excludedContextIds: _excludedContextIds, assessmentRules: _assessmentRules, ...rest } = entry;
  return { ...rest, contextIds: [] };
}

export function simplifyRegistryContent(snapshot: RegistrySnapshot): RegistrySnapshot {
  const changed = snapshot.contentIdOptions.some((entry) => entry.contextIds.length > 0
    || entry.contextScopeMode !== undefined || entry.excludedContextIds !== undefined
    || entry.assessmentRules !== undefined);
  return changed ? { ...snapshot, contentIdOptions: snapshot.contentIdOptions.map(simplifyContentEntry) } : snapshot;
}
