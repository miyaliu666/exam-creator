export interface ManualCreationRecovery {
  itemId: string;
  setupKey: string;
}

const memory = new Map<string, ManualCreationRecovery>();

function storageKey(scope: string) {
  return `language-items:manual-creation:${scope}`;
}

function parseRecovery(value: unknown): ManualCreationRecovery | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.itemId !== "string" || !record.itemId.trim() || record.itemId.length > 256 ||
      typeof record.setupKey !== "string" || !record.setupKey.trim() || record.setupKey.length > 8192) return undefined;
  return { itemId: record.itemId, setupKey: migrateLegacyManualRecoveryKey(record.setupKey) };
}

export function saveManualCreationRecovery(scope: string, recovery: ManualCreationRecovery) {
  const checked = parseRecovery(recovery);
  if (!checked) return;
  memory.set(scope, checked);
  try {
    sessionStorage.setItem(storageKey(scope), JSON.stringify(checked));
  } catch {
    // An unavailable browser store still permits recovery during this page session.
  }
}

export function readManualCreationRecovery(scope: string): ManualCreationRecovery | undefined {
  let serialized: string | null;
  try {
    serialized = sessionStorage.getItem(storageKey(scope));
  } catch {
    return parseRecovery(memory.get(scope));
  }
  if (serialized === null) return parseRecovery(memory.get(scope));
  try {
    return parseRecovery(JSON.parse(serialized));
  } catch {
    return undefined;
  }
}

export function clearManualCreationRecovery(scope: string) {
  memory.delete(scope);
  try {
    sessionStorage.removeItem(storageKey(scope));
  } catch {
    // Clearing in-memory recovery also works when browser storage is unavailable.
  }
}
import { migrateLegacyManualRecoveryKey } from "./legacy-item-rule-browser-migration";
