import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyImportRow, validateContentImport, type ContentImportPreview } from "../client/features/language-items/content-import-model.ts";
import { excludeContentImportReviewRows, getContentImportBlockReason, getContentImportReview, type ContentImportBlockOptions } from "../client/features/language-items/content-import-review.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";

function preview(index = 0): ContentImportPreview {
  const row = createEmptyImportRow();
  Object.assign(row.values, { label: `word ${index}`, meaning: `meaning ${index}` });
  const entry: ContentIdOption = { id: row.id, label: row.values.label, meaning: row.values.meaning, kind: "lexical", masteryScope: null, canDoIds: [], contextIds: [] };
  return { row, entry, errors: [], duplicates: [], changes: [] };
}
function options(previews: ContentImportPreview[] = [preview()], changes: Partial<ContentImportBlockOptions> = {}): ContentImportBlockOptions {
  return { disabled: false, busy: false, busyText: "Reading input…", hasPendingTables: false, hasPendingText: false, totalRows: previews.length, review: getContentImportReview(previews), mode: "add", ...changes };
}

test("all 768 imported rows are considered when 61 same-name rows are beyond the first preview page", () => {
  const rows = Array.from({ length: 768 }, (_, index) => preview(index).row);
  const snapshot = {
    contentIdOptions: rows.slice(707).map((row, index) => ({ id: `saved-${index}`, kind: "lexical", label: row.values.label, meaning: `a different saved meaning ${index}`, masteryScope: null, canDoIds: [], contextIds: [] })),
    canDoOptions: [], contextOptions: [],
  } as unknown as RegistrySnapshot;
  const previews = validateContentImport(rows, snapshot, "add");
  const review = getContentImportReview(previews);
  assert.equal(review.included.length, 768);
  assert.equal(review.invalid.length, 0);
  assert.equal(review.duplicates.length, 61);
  assert.deepEqual(review.needsAttention, previews.slice(707));
  assert.match(getContentImportBlockReason(options(previews)), /^Cannot add: 61 rows have the same name as other entries\./);
  assert.match(getContentImportBlockReason(options(previews)), /Confirm a different meaning or structure, or exclude these rows\./);
});

test("errors and duplicate confirmations both block, without duplicating an affected row", () => {
  const same = preview(), invalid = preview(1), ready = preview(2);
  same.errors.push({ field: "meaning", message: "Meaning is required." });
  same.duplicates.push("word 0 — another meaning");
  invalid.entry = undefined;
  const previews = [same, invalid, ready], review = getContentImportReview(previews);
  assert.deepEqual(review.invalid, [same, invalid]);
  assert.deepEqual(review.duplicates, [same]);
  assert.deepEqual(review.needsAttention, [same, invalid]);
  assert.match(getContentImportBlockReason(options(previews)), /2 rows have errors; 1 row has the same name/);
  assert.match(getContentImportBlockReason(options(previews)), /Fix the errors and confirm different meanings or structures/);
});

test("excluding a row removes all of its blocking errors and duplicate review", () => {
  const excluded = preview();
  excluded.row.included = false;
  excluded.errors.push({ field: "label", message: "Already exists." });
  excluded.duplicates.push("another entry");
  const ready = preview(1), review = getContentImportReview([excluded, ready]);
  assert.deepEqual(review, { included: [ready], invalid: [], duplicates: [], needsAttention: [] });
  assert.equal(getContentImportBlockReason(options([excluded, ready])), undefined);
});

test("current confirmations allow same-name rows but stale confirmations require review again", () => {
  const confirmed = preview();
  confirmed.duplicates.push("another meaning");
  confirmed.row.duplicateConfirmed = true;
  assert.deepEqual(getContentImportReview([confirmed]).needsAttention, []);
  assert.equal(getContentImportBlockReason(options([confirmed])), undefined);
  const review = getContentImportReview([confirmed], false);
  assert.deepEqual(review.duplicates, [confirmed]);
  assert.deepEqual(review.needsAttention, [confirmed]);
  assert.match(getContentImportBlockReason(options([confirmed], { review })), /1 row has the same name/);
  assert.equal(confirmed.row.duplicateConfirmed, true, "review does not mutate saved confirmation state");
});

test("a confirmation never bypasses row validation errors", () => {
  const confirmed = preview();
  confirmed.row.duplicateConfirmed = true;
  confirmed.duplicates.push("another meaning");
  confirmed.errors.push({ field: "meaning", message: "Meaning is required." });
  assert.deepEqual(getContentImportReview([confirmed]).needsAttention, [confirmed]);
  assert.equal(getContentImportBlockReason(options([confirmed])), "Cannot add: 1 row has errors. Fix or exclude this row.");
});

test("empty input and all-excluded previews explain different recovery actions", () => {
  assert.equal(getContentImportBlockReason(options([])), "Cannot add: choose a file or paste and read a table first.");
  const excluded = preview(); excluded.row.included = false;
  assert.equal(getContentImportBlockReason(options([excluded])), "Cannot add: select at least one row to include.");
});

test("pending mapping or unread text prevents partial application and explains the required action", () => {
  assert.match(getContentImportBlockReason(options(undefined, { hasPendingTables: true, hasPendingText: true })), /finish column mapping and preview the rows/);
  assert.match(getContentImportBlockReason(options(undefined, { hasPendingText: true })), /read the pasted input or clear it/);
});

test("read-only and busy states take priority over row and input errors", () => {
  const invalid = preview(); invalid.entry = undefined;
  const blocked = options([invalid], { disabled: true, busy: true, hasPendingTables: true });
  assert.match(getContentImportBlockReason(blocked), /settings draft is read-only/);
  assert.match(getContentImportBlockReason({ ...blocked, disabled: false, busyText: "Generating missing pinyin…" }), /Generating missing pinyin… Wait for processing to finish\./);
  assert.match(getContentImportBlockReason({ ...blocked, disabled: false, busyText: " " }), /Processing input… Wait for processing to finish\./);
});

test("update mode and plural errors use the correct action and row count", () => {
  const previews = [preview(), preview(1)];
  for (const row of previews) row.errors.push({ field: "id", message: "An existing ID is required." });
  assert.equal(getContentImportBlockReason(options(previews, { mode: "update" })), "Cannot update: 2 rows have errors. Fix or exclude these rows.");
  assert.equal(getContentImportBlockReason(options(undefined, { mode: "update" })), undefined);
});

test("excluding an unrelated pending same-name group preserves the confirmed group", () => {
  const confirmed = preview(1), pending = preview(2);
  confirmed.row.duplicateConfirmed = true;
  const snapshot = {
    contentIdOptions: [confirmed.entry!, pending.entry!].map((entry) => ({ ...entry, id: `saved-${entry.id}`, meaning: "a different saved meaning" })),
    canDoOptions: [], contextOptions: [],
  } as unknown as RegistrySnapshot;
  const rows = [confirmed.row, pending.row];
  assert.equal(getContentImportReview(validateContentImport(rows, snapshot, "add")).duplicates.length, 1);
  const next = excludeContentImportReviewRows(rows, [pending.row.id], snapshot, "add");
  assert.equal(next[0].duplicateConfirmed, true);
  assert.equal(next[1].included, false);
  assert.deepEqual(getContentImportReview(validateContentImport(next, snapshot, "add")).needsAttention, []);
});

test("excluding a member of the same name group invalidates its changed comparison confirmation", () => {
  const confirmed = preview(1), pending = preview(2);
  confirmed.row.duplicateConfirmed = true;
  pending.row.values.label = confirmed.row.values.label;
  const snapshot = {
    contentIdOptions: [{ ...confirmed.entry!, id: "saved-other-meaning", meaning: "saved meaning" }],
    canDoOptions: [], contextOptions: [],
  } as unknown as RegistrySnapshot;
  const rows = [confirmed.row, pending.row];
  assert.equal(validateContentImport(rows, snapshot, "add")[0].duplicates.length, 2);
  const next = excludeContentImportReviewRows(rows, [pending.row.id], snapshot, "add");
  assert.equal(next[0].duplicateConfirmed, false);
  assert.equal(validateContentImport(next, snapshot, "add")[0].duplicates.length, 1);
  assert.deepEqual(getContentImportReview(validateContentImport(next, snapshot, "add")).duplicates.map(({ row }) => row.id), [confirmed.row.id]);
});

test("bulk exclusion keeps every row and authored value, changes only requested included rows, and does not mutate the input", () => {
  const rows = [preview(1).row, preview(2).row, preview(3).row];
  rows[1].included = false;
  rows[1].duplicateConfirmed = true;
  rows[2].duplicateConfirmed = true;
  rows[2].generatedPinyin = { label: rows[2].values.label, value: "generated" };
  const original = structuredClone(rows);
  const snapshot = { contentIdOptions: [], canDoOptions: [], contextOptions: [] } as unknown as RegistrySnapshot;
  const next = excludeContentImportReviewRows(rows, [rows[1].id, rows[2].id, "missing-id"], snapshot, "add");
  assert.deepEqual(rows, original);
  assert.deepEqual(next.map(({ id }) => id), rows.map(({ id }) => id));
  assert.strictEqual(next[0], rows[0]);
  assert.strictEqual(next[1], rows[1]);
  assert.deepEqual(next[2], { ...rows[2], included: false, duplicateConfirmed: false });
  assert.strictEqual(next[2].values, rows[2].values);
  assert.deepEqual(next[2].generatedPinyin, rows[2].generatedPinyin);
  assert.strictEqual(excludeContentImportReviewRows(next, [rows[2].id, "missing-id"], snapshot, "add"), next);
});

test("excluding an update restores the saved comparison entry and invalidates affected confirmations", () => {
  const confirmed = preview(1), pending = preview(2);
  confirmed.row.duplicateConfirmed = true;
  confirmed.row.values.id = "saved-first";
  pending.row.values.id = "saved-second";
  const snapshot = {
    contentIdOptions: [
      { ...confirmed.entry!, id: "saved-first", label: "previous first name" },
      { ...pending.entry!, id: "saved-second", label: confirmed.row.values.label, meaning: "saved second meaning" },
    ],
    canDoOptions: [], contextOptions: [],
  } as unknown as RegistrySnapshot;
  const rows = [confirmed.row, pending.row];
  assert.equal(validateContentImport(rows, snapshot, "update")[0].duplicates.length, 0);
  const next = excludeContentImportReviewRows(rows, [pending.row.id], snapshot, "update");
  assert.equal(next[0].duplicateConfirmed, false);
  assert.equal(validateContentImport(next, snapshot, "update")[0].duplicates.length, 1);
});
