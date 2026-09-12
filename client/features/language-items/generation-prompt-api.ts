import { authorizedFetch } from "../../utils/fetch";
import type { CreateBatchInput } from "./batch-api";

export interface AiGenerationPromptPreview {
  provider: string;
  model: string;
  promptVersion: string;
  sendsToProvider: boolean;
  requestBody: unknown;
}

export type GenerationPromptSource =
  | { kind: "item"; itemId: string; revision: number }
  | { kind: "batch"; plan: CreateBatchInput };

export async function getGenerationPrompt(source: GenerationPromptSource, itemIndex: number, candidateOrdinal: number, signal?: AbortSignal): Promise<AiGenerationPromptPreview> {
  const response = source.kind === "item"
    ? await authorizedFetch(`/api/language-items/${encodeURIComponent(source.itemId)}/ai-prompt?${new URLSearchParams({ candidateOrdinal: String(candidateOrdinal), expectedRevision: String(source.revision) })}`, { signal })
    : await authorizedFetch("/api/language-item-batches/ai-prompt", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal,
      body: JSON.stringify({ plan: source.plan, itemIndex, candidateOrdinal }),
    });
  return response.json();
}
