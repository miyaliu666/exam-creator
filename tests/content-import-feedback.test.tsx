import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem, Dialog } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

import { ContentImportFooter } from "../client/features/language-items/content-import-footer";
import { createEmptyImportRow, type ContentImportPreview } from "../client/features/language-items/content-import-model";
import { getContentImportBlockReason, getContentImportReview } from "../client/features/language-items/content-import-review";
import { ContentImportTable } from "../client/features/language-items/content-import-table";

const noop = () => {};
const render = (node: ReactNode) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}>{node}</ChakraProvider>).replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "");
const previews = (): ContentImportPreview[] => Array.from({ length: 45 }, (_, index) => {
  const row = createEmptyImportRow("lexical", `Workbook row ${index + 2}`);
  row.values.label = `word ${index}`; row.values.meaning = `meaning ${index}`;
  return { row, entry: { id: row.id, label: row.values.label, kind: "lexical", meaning: row.values.meaning, masteryScope: null, contextIds: [], canDoIds: [] }, errors: [], duplicates: index === 40 ? ["word 40 — another meaning"] : [], changes: [] };
});

test("disabled import action has an always-visible reason, an accessible description and a way to review off-page rows", () => {
  const input = previews(), review = getContentImportReview(input);
  const reason = getContentImportBlockReason({ mode: "add", disabled: false, busy: false, busyText: "", hasPendingTables: false, hasPendingText: false, totalRows: input.length, review });
  const html = render(<Dialog.Root open><ContentImportFooter mode="add" count={45} reason={reason} reviewCount={1} busy={false} onReview={noop} onApply={noop} onClose={noop} /></Dialog.Root>);
  assert.match(html, /Cannot add: 1 row has the same name as other entries/);
  assert.match(html, /Confirm a different meaning or structure, or exclude this row/);
  assert.match(html, /Review 1 row/);
  const add = html.match(/<button[^>]*>Add 45 entries in draft<\/button>/)?.[0];
  assert.ok(add);
  assert.match(add, /disabled=""/);
  const describedBy = add.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(describedBy);
  assert.ok(html.includes(`id="${describedBy}" role="status"`));
});

test("review view filters before pagination and leaves the full input intact", () => {
  const input = previews(), before = structuredClone(input), review = getContentImportReview(input);
  const html = render(<ContentImportTable previews={input} mode="add" disabled={false} reviewOnly reviewIds={review.needsAttention.map(({ row }) => row.id)} pendingReviewIds={review.needsAttention.map(({ row }) => row.id)} reviewRequest={0} onShowAll={noop} onExcludeReview={noop} onChange={noop} onRemove={noop} />);
  assert.match(html, /Reviewing 1 row · 1 needs attention/);
  assert.match(html, /Workbook row 42/);
  assert.doesNotMatch(html, /Workbook row 2[<"]|Workbook row 3[<"]/);
  assert.match(html, /Show all rows \(45\)/);
  assert.match(html, /Exclude 1 unresolved row/);
  assert.match(html, /Different meaning or use; keep as a separate entry/);
  assert.deepEqual(input, before);
});

test("ready imports enable the action without displaying a stale blocking explanation", () => {
  const html = render(<Dialog.Root open><ContentImportFooter mode="add" count={44} reviewCount={0} busy={false} onReview={noop} onApply={noop} onClose={noop} /></Dialog.Root>);
  assert.doesNotMatch(html, /Cannot add|aria-describedby|Review \d+ rows?/);
  assert.match(html, />Add 44 entries in draft<\/button>/);
  assert.doesNotMatch(html, /disabled=""/);
});

test("resolving a row keeps its editable fields in the review view without excluding a confirmed row", () => {
  const input = previews(), row = input[40];
  row.row.duplicateConfirmed = true;
  const html = render(<ContentImportTable previews={input} mode="add" disabled={false} reviewOnly reviewIds={[row.row.id]} pendingReviewIds={[]} reviewRequest={0} onShowAll={noop} onExcludeReview={noop} onChange={noop} onRemove={noop} />);
  assert.match(html, /Workbook row 42/);
  assert.match(html, /Reviewing 1 row · 0 need attention/);
  assert.doesNotMatch(html, /Exclude \d+ unresolved/);
  assert.match(html, /Name · Workbook row 42/);
});
