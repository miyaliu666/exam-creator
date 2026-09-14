import { validateContentImport, type ContentImportMode, type ContentImportPreview, type ContentImportRow } from "./content-import-model";
import type { RegistrySnapshot } from "./types";

export interface ContentImportReview {
  included: ContentImportPreview[];
  invalid: ContentImportPreview[];
  duplicates: ContentImportPreview[];
  needsAttention: ContentImportPreview[];
}

export function getContentImportReview(previews: readonly ContentImportPreview[], confirmationsCurrent = true): ContentImportReview {
  const included = previews.filter(({ row }) => row.included);
  const invalid = included.filter(({ entry, errors }) => !entry || errors.length > 0);
  const duplicates = included.filter(({ row, duplicates }) => duplicates.length > 0 && (!row.duplicateConfirmed || !confirmationsCurrent));
  const blocked = new Set([...invalid, ...duplicates]);
  return { included, invalid, duplicates, needsAttention: included.filter((preview) => blocked.has(preview)) };
}

export function excludeContentImportReviewRows(rows: ContentImportRow[], reviewIds: string[], snapshot: RegistrySnapshot, mode: ContentImportMode): ContentImportRow[] {
  const ids = new Set(reviewIds);
  if (!rows.some((row) => row.included && ids.has(row.id))) return rows;
  const next = rows.map((row) => row.included && ids.has(row.id) ? { ...row, included: false, duplicateConfirmed: false } : row);
  if (!next.some((row) => row.included && row.duplicateConfirmed)) return next;
  const before = new Map(validateContentImport(rows, snapshot, mode).map((preview) => [preview.row.id, JSON.stringify(preview.duplicates)]));
  const after = new Map(validateContentImport(next, snapshot, mode).map((preview) => [preview.row.id, JSON.stringify(preview.duplicates)]));
  return next.map((row) => row.included && row.duplicateConfirmed && before.get(row.id) !== after.get(row.id) ? { ...row, duplicateConfirmed: false } : row);
}

export interface ContentImportBlockOptions {
  disabled: boolean;
  busy: boolean;
  busyText: string;
  hasPendingTables: boolean;
  hasPendingText: boolean;
  totalRows: number;
  review: ContentImportReview;
  mode: ContentImportMode;
}

export function getContentImportBlockReason({ disabled, busy, busyText, hasPendingTables, hasPendingText, totalRows, review, mode }: ContentImportBlockOptions): string | undefined {
  const prefix = `Cannot ${mode}: `;
  if (disabled) return `${prefix}the settings draft is read-only. Your import preview is retained.`;
  if (busy) return `${prefix}${busyText.trim() || "Processing input…"} Wait for processing to finish.`;
  if (hasPendingTables) return `${prefix}finish column mapping and preview the rows, or discard the pending input.`;
  if (hasPendingText) return `${prefix}read the pasted input or clear it before applying the preview.`;
  if (!totalRows) return `${prefix}choose a file or paste and read a table first.`;
  if (!review.included.length) return `${prefix}select at least one row to include.`;
  const errors = review.invalid.length, duplicates = review.duplicates.length;
  const rows = (count: number) => `${count} ${count === 1 ? "row has" : "rows have"}`;
  if (errors && duplicates) {
    return `${prefix}${rows(errors)} errors; ${rows(duplicates)} the same name as other entries. Fix the errors and confirm different meanings or structures, or exclude the affected rows.`;
  }
  if (errors) return `${prefix}${rows(errors)} errors. Fix or exclude ${errors === 1 ? "this row" : "these rows"}.`;
  if (duplicates) return `${prefix}${rows(duplicates)} the same name as other entries. Confirm a different meaning or structure, or exclude ${duplicates === 1 ? "this row" : "these rows"}.`;
  return undefined;
}
