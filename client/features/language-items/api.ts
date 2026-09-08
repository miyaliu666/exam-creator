import { authorizedFetch } from "../../utils/fetch";
import type {
  AiGenerationRun,
  AiProviderStatus,
  AiReviewRun,
  CandidatePreview,
  GithubIntegrationStatus,
  GithubReviewBatch,
  LanguageItem,
  LanguageItemRecordState,
  LanguageItemAuditEvent,
  LanguageItemExport,
  LanguageItemReview,
  LanguageItemReviewDiscussion,
  LanguageItemVersion,
  LanguageItemVersionDiff,
  RegistrySnapshot,
  RegistryAuditEvent,
  RegistryImpact,
  RegistryValidationResult,
  RegistryVersionRecord,
  RegistryVersionSummary,
  ReviewDecision,
  ReviewDiscussionEventKind,
  ReviewDiscussionKind,
  TaskPackage,
  ValidationResult,
} from "./types";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function getLanguageItemRegistry(
  version?: string,
): Promise<RegistrySnapshot> {
  const suffix = version ? `/${encodeURIComponent(version)}` : "";
  return readJson(await authorizedFetch(`/api/language-items/registry${suffix}`));
}

export async function getActiveLanguageAssessmentRegistry(): Promise<RegistrySnapshot> {
  return readJson(await authorizedFetch("/api/language-assessment/registry/active"));
}

export async function getLanguageAssessmentRegistryVersions(): Promise<RegistryVersionSummary[]> {
  return readJson(await authorizedFetch("/api/language-assessment/registry/versions"));
}

export async function getLanguageAssessmentRegistryVersion(
  id: string,
): Promise<RegistryVersionRecord> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/versions/${id}`),
  );
}

export async function getLanguageAssessmentRegistryAudit(
  id: string,
): Promise<RegistryAuditEvent[]> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/versions/${id}/audit`),
  );
}

export async function createLanguageAssessmentRegistryDraft(
  version?: string,
): Promise<RegistryVersionRecord> {
  return readJson(
    await authorizedFetch("/api/language-assessment/registry/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    }),
  );
}

export async function saveLanguageAssessmentRegistryDraft(input: {
  id: string;
  expectedRevision: number;
  version: string;
  snapshot: RegistrySnapshot;
}): Promise<RegistryVersionRecord> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/drafts/${input.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function validateLanguageAssessmentRegistryDraft(
  id: string,
  expectedRevision: number,
): Promise<RegistryValidationResult> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/drafts/${id}/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision }),
    }),
  );
}

export async function getLanguageAssessmentRegistryImpact(
  id: string,
  expectedRevision: number,
): Promise<RegistryImpact> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/drafts/${id}/impact?expectedRevision=${expectedRevision}`),
  );
}

export async function publishLanguageAssessmentRegistryDraft(
  id: string,
  expectedRevision: number,
  expectedActiveVersion: string,
): Promise<RegistryVersionRecord> {
  return readJson(
    await authorizedFetch(`/api/language-assessment/registry/drafts/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision, expectedActiveVersion }),
    }),
  );
}

export async function getLanguageItemAiProvider(): Promise<AiProviderStatus> {
  return readJson(await authorizedFetch("/api/language-items/ai-provider"));
}

export async function getGithubReviewStatus(): Promise<GithubIntegrationStatus> {
  return readJson(
    await authorizedFetch("/api/language-items/github-review/status"),
  );
}

export async function createGithubReviewBatch(input: {
  itemIds: string[];
}): Promise<GithubReviewBatch> {
  return readJson(
    await authorizedFetch("/api/language-items/github-review/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function syncGithubReviewBatch(
  batchId: string,
): Promise<GithubReviewBatch> {
  return readJson(
    await authorizedFetch(
      `/api/language-items/github-review/batches/${batchId}/sync`,
      { method: "POST" },
    ),
  );
}

export async function getLanguageItems(): Promise<LanguageItem[]> {
  return readJson(await authorizedFetch("/api/language-items"));
}

export async function getLanguageItemReviewQueue(): Promise<LanguageItem[]> {
  return readJson(await authorizedFetch("/api/language-item-review-queue"));
}

export async function createLanguageItem(
  input: {
    blueprintSlotId: string;
    itemFormatId: string;
    primaryCanDoId: string;
    primaryDomain: string;
    contextId: string;
    difficultyBand: string;
    title?: string;
  },
): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch("/api/language-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getLanguageItem(id: string): Promise<LanguageItem> {
  return readJson(await authorizedFetch(`/api/language-items/${id}`));
}

export async function updateLanguageItemRecordState(
  id: string,
  recordState: Exclude<LanguageItemRecordState, "deleted">,
): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch(`/api/language-items/${id}/record-state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recordState }),
    }),
  );
}

export async function deleteLanguageItem(id: string): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch(`/api/language-items/${id}`, { method: "DELETE" }),
  );
}

export async function getLanguageItemCandidatePreview(
  id: string,
): Promise<CandidatePreview> {
  return readJson(await authorizedFetch(`/api/language-items/${id}/preview`));
}

export async function saveLanguageItemDraft(input: {
  id: string;
  expectedRevision: number;
  title: string;
  package: TaskPackage;
}): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch(`/api/language-items/${input.id}/draft`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function validateLanguageItem(id: string): Promise<ValidationResult> {
  return readJson(
    await authorizedFetch(`/api/language-items/${id}/validate`, {
      method: "POST",
    }),
  );
}

export async function getLanguageItemVersions(
  id: string,
): Promise<LanguageItemVersion[]> {
  return readJson(await authorizedFetch(`/api/language-items/${id}/versions`));
}

export async function getLanguageItemVersionDiff(
  versionId: string,
): Promise<LanguageItemVersionDiff> {
  return readJson(
    await authorizedFetch(`/api/language-item-versions/${versionId}/diff`),
  );
}

export async function freezeLanguageItem(
  id: string,
  expectedRevision: number,
): Promise<LanguageItemVersion> {
  return readJson(
    await authorizedFetch(`/api/language-items/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedRevision }),
    }),
  );
}

export async function reviseLanguageItemVersion(input: {
  versionId: string;
  expectedRevision: number;
}): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch(
      `/api/language-item-versions/${input.versionId}/revise`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: input.expectedRevision }),
      },
    ),
  );
}

export async function getLanguageItemAudit(
  id: string,
): Promise<LanguageItemAuditEvent[]> {
  return readJson(await authorizedFetch(`/api/language-items/${id}/audit`));
}

export async function getLanguageItemExports(
  id: string,
): Promise<LanguageItemExport[]> {
  return readJson(await authorizedFetch(`/api/language-items/${id}/exports`));
}

export async function getAiGenerationRuns(id: string): Promise<AiGenerationRun[]> {
  return readJson(await authorizedFetch(`/api/language-items/${id}/ai-runs`));
}

export async function generateAiCandidates(
  id: string,
  count: number,
  idempotencyKey = crypto.randomUUID(),
): Promise<AiGenerationRun> {
  return readJson(
    await authorizedFetch(`/api/language-items/${id}/ai-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count, idempotencyKey }),
    }),
  );
}

export async function adoptAiCandidate(input: {
  itemId: string;
  runId: string;
  candidateId: string;
  expectedRevision: number;
}): Promise<LanguageItem> {
  return readJson(
    await authorizedFetch(
      `/api/language-items/${input.itemId}/ai-runs/${input.runId}/candidates/${input.candidateId}/adopt`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedRevision: input.expectedRevision }),
      },
    ),
  );
}

export async function runAiReview(versionId: string): Promise<AiReviewRun> {
  return readJson(
    await authorizedFetch(`/api/language-item-versions/${versionId}/ai-review`, {
      method: "POST",
    }),
  );
}

export async function runDraftAiReview(itemId: string): Promise<AiReviewRun> {
  return readJson(
    await authorizedFetch(`/api/language-items/${itemId}/ai-review`, {
      method: "POST",
    }),
  );
}

export async function getDraftAiReviews(itemId: string): Promise<AiReviewRun[]> {
  return readJson(
    await authorizedFetch(`/api/language-items/${itemId}/ai-review`),
  );
}

export async function getAiReviews(versionId: string): Promise<AiReviewRun[]> {
  return readJson(
    await authorizedFetch(`/api/language-item-versions/${versionId}/ai-review`),
  );
}

export async function getLanguageItemReviews(
  versionId: string,
): Promise<LanguageItemReview[]> {
  return readJson(
    await authorizedFetch(`/api/language-item-versions/${versionId}/reviews`),
  );
}

export async function reviewLanguageItem(input: {
  versionId: string;
  gateId: string;
  decision: ReviewDecision;
  fieldPath?: string;
  ruleRef?: string;
  comment?: string;
}): Promise<LanguageItemReview> {
  return readJson(
    await authorizedFetch(`/api/language-item-versions/${input.versionId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function getLanguageItemReviewDiscussions(
  itemId: string,
): Promise<LanguageItemReviewDiscussion[]> {
  return readJson(
    await authorizedFetch(
      `/api/language-items/${itemId}/review-discussions`,
    ),
  );
}

export async function createLanguageItemReviewDiscussion(input: {
  versionId: string;
  gateId: string;
  kind: ReviewDiscussionKind;
  subject: string;
  message: string;
  fieldPath?: string;
  ruleRef?: string;
}): Promise<LanguageItemReviewDiscussion> {
  return readJson(
    await authorizedFetch(
      `/api/language-item-versions/${input.versionId}/review-discussions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function addLanguageItemReviewDiscussionEvent(input: {
  discussionId: string;
  kind: ReviewDiscussionEventKind;
  message?: string;
}): Promise<LanguageItemReviewDiscussion> {
  return readJson(
    await authorizedFetch(
      `/api/language-item-review-discussions/${input.discussionId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    ),
  );
}

export async function exportLanguageItemToStaging(
  versionId: string,
): Promise<LanguageItemExport> {
  return readJson(
    await authorizedFetch(
      `/api/language-item-versions/${versionId}/exports/staging`,
      { method: "POST" },
    ),
  );
}
