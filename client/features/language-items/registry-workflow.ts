import type { RegistryValidationResult, RegistryVersionRecord, RegistryVersionSummary } from "./types";

export function registryWriteValidation(message: string): RegistryValidationResult | undefined {
  const start = message.indexOf("{");
  if (start < 0) return;
  try {
    const value: unknown = JSON.parse(message.slice(start));
    if (!value || typeof value !== "object" || !("valid" in value) || value.valid !== false || !("issues" in value) || !Array.isArray(value.issues)) return;
    if (!value.issues.every((entry: unknown) => entry && typeof entry === "object" && "severity" in entry && ["error", "warning"].includes(String(entry.severity)) && "code" in entry && typeof entry.code === "string" && "path" in entry && typeof entry.path === "string" && "message" in entry && typeof entry.message === "string")) return;
    return { valid: false, issues: value.issues };
  } catch { return; }
}

export function selectRegistryForEditing(versions: RegistryVersionSummary[], email?: string) {
  const active = versions.find((entry) => entry.active);
  const draft = active && versions.find((entry) =>
    entry.status === "draft" && entry.createdBy === email && entry.baseVersion === active.version,
  );
  return draft || active;
}

export function registryRecordKey(record: RegistryVersionRecord) {
  return `${record.id}:${record.revision}:${record.status}:${record.active}`;
}

export function registryDraftIsStale(record: RegistryVersionRecord, activeVersion?: string) {
  return record.status === "draft" && !!activeVersion && record.baseVersion !== activeVersion;
}

export function shouldAdoptRegistryRecord(
  current: RegistryVersionRecord | null,
  incoming: RegistryVersionRecord,
  dirty: boolean,
  busy: boolean,
) {
  if (dirty || busy) return false;
  if (!current) return true;
  if (current.id === incoming.id && incoming.revision < current.revision) return false;
  return registryRecordKey(current) !== registryRecordKey(incoming);
}

export function registryStatus(record: RegistryVersionRecord, dirty: boolean, email?: string) {
  if (record.status === "draft") {
    return {
      label: record.createdBy !== email ? "Read-only draft" : dirty ? "Unsaved changes" : "Saved · Not applied",
    };
  }
  return {
    label: record.active ? "In use for new items" : record.status === "retired" ? "Retired settings" : "Previous settings",
  };
}
