// Saved generation messages predate the author-facing AI draft terminology.
export function generationErrorMessage(message: string) {
  return message
    .replace(/\bnew candidates\b/g, "new AI drafts")
    .replace(/\bremaining candidates\b/g, "remaining AI drafts")
    .replace(/\bNo candidates were saved\b/g, "No AI drafts were saved")
    .replace(/\bRequest fewer candidates\b/g, "Request fewer AI drafts")
    .replace(/\bcandidate requests started\b/g, "AI draft requests started")
    .replace(/\bAI candidate count\b/g, "AI draft count")
    .replace(/\bAI candidate not found:/g, "AI draft not found:")
    .replace(/\bcannot adopt an invalid candidate\b/g, "cannot adopt an invalid AI draft")
    .replace(/\bdraft revision changed before candidate adoption\b/g, "draft revision changed before AI draft adoption")
    .replace(/\badopting a candidate\b/g, "adopting an AI draft")
    .replace(/\bCandidate (\d+) (repair|generation) failed:/g, "AI draft $1 $2 failed:")
    .replace(/\bAI returned (\d+) candidates; exactly one was requested for candidate (\d+)\b/g,
      "AI returned $1 drafts; exactly one was requested for AI draft $2");
}
