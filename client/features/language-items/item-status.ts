import type { LanguageItemStatus } from "./types";

// Item lifecycle states can come from human decisions or GitHub synchronization.
export const ITEM_STATUS_COPY: Record<LanguageItemStatus, { label: string; colorPalette: string }> = {
  draft: { label: "Draft", colorPalette: "blue" },
  readyForReview: { label: "Ready for PR", colorPalette: "purple" },
  inReview: { label: "In review", colorPalette: "orange" },
  needsRevision: { label: "Changes requested", colorPalette: "red" },
  reviewBlocked: { label: "Review blocked", colorPalette: "yellow" },
  rejected: { label: "Rejected", colorPalette: "red" },
  approvedForExport: { label: "Approved", colorPalette: "green" },
  exportedToStaging: { label: "Approved", colorPalette: "green" },
};

export function itemStatusLabel(status: string): string {
  return Object.hasOwn(ITEM_STATUS_COPY, status)
    ? ITEM_STATUS_COPY[status as LanguageItemStatus].label
    : "Unknown status";
}
