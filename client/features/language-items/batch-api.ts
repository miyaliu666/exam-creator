import { authorizedFetch } from "../../utils/fetch";
import type { NewLanguageItemSelection } from "./new-language-item-dialog";

export interface BatchGroup extends NewLanguageItemSelection {
  itemCount: number;
  requiredTargetContentIds: string[];
  rotatingTargetContentIds: string[];
}

export interface BatchGenerationChild {
  index: number;
  groupIndex: number;
  itemId?: string | null;
  itemCreated: boolean;
  runId?: string | null;
  targetContentIds: string[];
  status: "pending" | "running" | "completed" | "partial" | "failed";
  error?: string | null;
}

export interface BatchGenerationJob {
  id: string;
  title: string;
  ownerEmail: string;
  registryVersion: string;
  groups: BatchGroup[];
  candidatesPerItem: number;
  status: "queued" | "running" | "paused" | "partial" | "completed";
  children: BatchGenerationChild[];
  createdAt: string;
  updatedAt: string;
  error?: string | null;
}

export interface CreateBatchInput {
  title: string;
  idempotencyKey: string;
  registryVersion: string;
  groups: BatchGroup[];
  candidatesPerItem: number;
}

export async function getLanguageItemBatches(): Promise<BatchGenerationJob[]> {
  return (await authorizedFetch("/api/language-item-batches")).json();
}

export async function getLanguageItemBatch(id: string): Promise<BatchGenerationJob> {
  return (await authorizedFetch(`/api/language-item-batches/${encodeURIComponent(id)}`)).json();
}

export async function createLanguageItemBatch(input: CreateBatchInput): Promise<BatchGenerationJob> {
  return (await authorizedFetch("/api/language-item-batches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })).json();
}

export async function controlLanguageItemBatch(id: string, action: "pause" | "resume"): Promise<BatchGenerationJob> {
  return (await authorizedFetch(`/api/language-item-batches/${encodeURIComponent(id)}/control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  })).json();
}
