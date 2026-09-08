import type { RegistryVersionRecord, RegistryVersionSummary } from "./types";

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
      label: record.createdBy !== email ? "Read-only draft" : dirty ? "Draft · Unsaved" : "Draft · Saved",
      colorPalette: dirty ? "yellow" : "orange",
    };
  }
  return {
    label: record.active ? "Published" : record.status === "retired" ? "Retired" : "Previous publication",
    colorPalette: record.active ? "teal" : "gray",
  };
}
