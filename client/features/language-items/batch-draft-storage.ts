import type { BatchGroup, CreateBatchInput } from "./batch-api";
import { migrateLegacyBrowserSetup } from "./legacy-item-rule-browser-migration";

const SETUP_KEYS = ["itemRuleId", "itemFormatId", "primaryCanDoId", "primaryDomain", "contextId", "difficultyBand"] as const;

function isGroup(value: unknown): value is BatchGroup {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return SETUP_KEYS.every((key) => typeof record[key] === "string") &&
    typeof record.itemCount === "number" &&
    [record.requiredTargetContentIds, record.rotatingTargetContentIds].every((ids) =>
      Array.isArray(ids) && ids.every((id: unknown) => typeof id === "string"));
}

export function emptyBatchDraft(registryVersion: string): CreateBatchInput {
  return { title: "", idempotencyKey: crypto.randomUUID(), registryVersion, groups: [], candidatesPerItem: 1 };
}

export function restoreBatchDraft(serialized: string | null, registryVersion: string): CreateBatchInput {
  try {
    const value: unknown = JSON.parse(serialized ?? "null");
    if (value && typeof value === "object") {
      const saved = value as Record<string, unknown>;
      if (Array.isArray(saved.groups)) saved.groups = saved.groups.map(migrateLegacyBrowserSetup);
      if (typeof saved.title === "string" && typeof saved.registryVersion === "string" &&
        typeof saved.idempotencyKey === "string" && !!saved.idempotencyKey.trim() &&
        typeof saved.candidatesPerItem === "number" && Array.isArray(saved.groups) && saved.groups.every(isGroup)) {
        return {
          title: saved.title, registryVersion: saved.registryVersion, idempotencyKey: saved.idempotencyKey,
          candidatesPerItem: saved.candidatesPerItem, groups: saved.groups,
        };
      }
    }
  } catch {
    // A broken local plan must not prevent access to durable submitted batches.
  }
  return emptyBatchDraft(registryVersion);
}

export function reviseBatchDraft(current: CreateBatchInput, change: Partial<CreateBatchInput>): CreateBatchInput {
  return { ...current, ...change, idempotencyKey: crypto.randomUUID() };
}
