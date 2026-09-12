import { aiPrereviewBlockReason, type AiPrereviewStage } from "./ai-prereview";
import type { AiReviewRun, GithubReviewBatch } from "./types";

export interface SubmitItemForReviewInput {
  itemId: string;
  check: () => Promise<void>;
  readState: () => { revision: number; change: number; dirty: boolean };
  review: (expectedRevision: number) => Promise<AiReviewRun>;
  createPr: (input: {
    itemIds: string[];
    aiReviewRunIds: Record<string, string>;
    expectedRevisions: Record<string, number>;
  }) => Promise<GithubReviewBatch>;
  onStage: (stage: AiPrereviewStage) => void;
  onReview: (run: AiReviewRun) => void;
}

export async function submitItemForReview(input: SubmitItemForReviewInput): Promise<GithubReviewBatch> {
  input.onStage("checking");
  await input.check();
  const checked = { ...input.readState() };
  if (checked.dirty) throw new Error("The item changed during checking. Submit the latest draft again.");

  input.onStage("aiReview");
  const review = await input.review(checked.revision);
  const latest = input.readState();
  if (latest.dirty || latest.revision !== checked.revision || latest.change !== checked.change) {
    throw new Error("The item changed during AI preliminary review. Submit the latest draft again.");
  }
  input.onReview(review);
  const blockReason = aiPrereviewBlockReason(review);
  if (blockReason) throw new Error(blockReason);

  input.onStage("creatingPr");
  return input.createPr({
    itemIds: [input.itemId],
    aiReviewRunIds: { [input.itemId]: review.id },
    expectedRevisions: { [input.itemId]: checked.revision },
  });
}
