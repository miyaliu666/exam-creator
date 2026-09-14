import type { BatchGenerationChild, BatchGenerationJob, BatchGroup } from "./batch-api";

export function batchGenerationSummary(job: BatchGenerationJob) {
  const waiting = job.children.filter((child) => child.status === "pending").length;
  const generating = job.children.filter((child) => child.status === "running").length;
  const withCandidates = job.children.filter((child) => ["completed", "partial"].includes(child.status)).length;
  const failed = job.children.filter((child) => child.status === "failed").length;
  return { waiting, generating, withCandidates, failed,
    total: job.groups.reduce((sum, group) => sum + group.itemCount, 0),
    status: job.status === "queued" && generating > 0 ? "running" as const : job.status };
}

export function additionalBatchTargets(child: BatchGenerationChild, group: BatchGroup) {
  return child.targetContentIds.filter((id) => !group.requiredTargetContentIds.includes(id));
}

export function batchCreationTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Creation time unavailable" : date.toLocaleString("en-GB", {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
