import type { BatchGenerationJob } from "./batch-api";

export function batchNeedsPolling(job: BatchGenerationJob) {
  return ["queued", "running"].includes(job.status) ||
    (job.status === "paused" && job.children.some((child) => child.status === "running"));
}

export function includeFocusedBatch(jobs: BatchGenerationJob[], focusedJob?: BatchGenerationJob) {
  // The list is limited; a deep-linked older job must remain reachable independently.
  return focusedJob && !jobs.some((job) => job.id === focusedJob.id) ? [focusedJob, ...jobs] : jobs;
}

export function batchProgressVisibility(jobs: BatchGenerationJob[], showHistory: boolean, focusedId?: string) {
  const latestId = jobs.reduce<BatchGenerationJob | undefined>((latest, job) =>
    !latest || job.createdAt > latest.createdAt ? job : latest, undefined)?.id;
  const visibleJobs = jobs.filter((job) => showHistory || job.status !== "completed" || job.id === latestId || job.id === focusedId);
  return { latestId, visibleJobs, hiddenCompletedCount: jobs.length - visibleJobs.length };
}

export function batchCanResume(job: BatchGenerationJob) {
  return !["queued", "running"].includes(job.status) && (job.status === "paused" || job.children.some((child) =>
    child.status === "pending" || child.status === "running" || (child.status === "failed" && !child.itemCreated)));
}
