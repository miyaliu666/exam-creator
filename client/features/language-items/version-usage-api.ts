import { authorizedFetch } from "../../utils/fetch";
import type { VersionUsageEvent, VersionUsagePage, VersionUsageSummary, VersionUsageWrite } from "./version-usage-types";

function versionPath(itemId: string, versionId: string) {
  return `/api/language-items/${encodeURIComponent(itemId)}/versions/${encodeURIComponent(versionId)}/usage`;
}

export async function getItemVersionUsage(itemId: string): Promise<{ versions: VersionUsageSummary[] }> {
  return (await authorizedFetch(`/api/language-items/${encodeURIComponent(itemId)}/usage`)).json();
}

export async function getVersionUsage(itemId: string, versionId: string, beforeRevision?: number): Promise<VersionUsagePage> {
  const suffix = beforeRevision === undefined ? "" : `?beforeRevision=${beforeRevision}`;
  return (await authorizedFetch(`${versionPath(itemId, versionId)}${suffix}`)).json();
}

export async function recordVersionUsage(itemId: string, versionId: string, input: VersionUsageWrite): Promise<VersionUsageEvent> {
  return (await authorizedFetch(versionPath(itemId, versionId), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })).json();
}
