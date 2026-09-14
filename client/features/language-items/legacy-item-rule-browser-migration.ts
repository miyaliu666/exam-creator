import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

/** The only browser boundary that reads the retired setup identity. */
export function legacyBrowserItemRuleId(oldSlotId: string, itemFormatId: string, primaryCanDoId: string): string {
  if (!oldSlotId || !itemFormatId || !primaryCanDoId) return "";
  if (oldSlotId.startsWith("exercise:") && itemFormatId.startsWith("EXERCISE:")) return oldSlotId.slice("exercise:".length);
  return `legacy-rule-${bytesToHex(sha256(utf8ToBytes(JSON.stringify([oldSlotId, itemFormatId, primaryCanDoId]))))}`;
}

/** Retain saved quantities, targets, idempotency keys and unknown metadata. Incomplete setups remain repairable. */
export function migrateLegacyBrowserSetup(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  const old = record.blueprintSlotId ?? record.slotId;
  const format = record.itemFormatId ?? record.formatId;
  let identity = record.itemRuleId;
  if (typeof identity === "string" && identity.startsWith("exercise:") && typeof format === "string" && format.startsWith("EXERCISE:")) identity = identity.slice("exercise:".length);
  if (typeof identity !== "string" && typeof old === "string") identity = legacyBrowserItemRuleId(old, typeof format === "string" ? format : "", typeof record.primaryCanDoId === "string" ? record.primaryCanDoId : "");
  const migrated: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if (key === "blueprintSlotId" || key === "slotId" || key === "itemRuleId") {
      if (!Object.hasOwn(migrated, "itemRuleId") && typeof identity === "string") migrated.itemRuleId = identity;
    } else migrated[key] = entry;
  }
  return migrated;
}

export function migrateLegacyManualRecoveryKey(key: string): string {
  try { return JSON.stringify(migrateLegacyBrowserSetup(JSON.parse(key))); }
  catch { return key; }
}
