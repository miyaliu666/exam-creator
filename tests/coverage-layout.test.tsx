import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoverageControls } from "../client/features/language-items/coverage-controls";
import { CoverageOverviewPanel } from "../client/features/language-items/coverage-overview";
import type { CoverageOverview, CoverageOverviewState, CoverageRequest } from "../client/features/language-items/coverage-types";
import type { RegistrySnapshot } from "../client/features/language-items/types";

const registry: RegistrySnapshot = {
  bundleVersion: "rules-1", status: "published", sourceFingerprint: "fixture", limitations: [], capabilities: [],
  candidateSchemas: [], taskPackageSchema: {}, allowedDomains: [], difficultyBands: [], difficultyStandards: [],
  contextOptions: [], canDoOptions: [], requiredReviewGateIds: [],
  contentIdOptions: [
    { id: "hello", kind: "lexical", label: "你好", englishGloss: "Hello", canDoIds: [], contextIds: [], masteryScope: null },
    { id: "time", kind: "lexical", label: "时间", englishGloss: "Time", canDoIds: [], contextIds: [], masteryScope: null },
  ],
};
const data: CoverageOverview = {
  approvedItemCount: 5, pendingItemCount: 53, plannedUnknownCount: 0, confirmedUnknownCount: 0, pendingUnknownCount: 0,
  entries: [{ id: "hello", plannedCount: 1, confirmedCount: 0, pendingCount: 2 }],
};
const state: CoverageOverviewState = { category: "lexical", search: "", sort: "pending", offset: 0 };
const request: CoverageRequest = {
  registryVersion: registry.bundleVersion, scope: "approved", role: "core", selectedIds: ["hello", "time"],
  excludedIds: [], matchMode: "all", filters: {}, offset: 0, limit: 25,
};
const noop = () => {};
const render = (element: ReactNode) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>);
const visibleText = (markup: string) => markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const renderOverview = (options: { data?: CoverageOverview; state?: CoverageOverviewState; feedback?: ReactNode }) => render(
  <CoverageOverviewPanel registry={registry} state={options.state ?? state} data={options.data} feedback={options.feedback}
    filters={<button>Item filter fixture</button>} onReset={noop} onStateChange={noop} onInspect={noop} />,
);

for (const message of ["Loading coverage…", "Coverage request failed"]) {
  test(`overview retains usable filters and their values when ${message}`, () => {
    const markup = renderOverview({ state: { ...state, search: "Hello" }, feedback: <p role="status">{message}</p> });
    const text = visibleText(markup);
    assert.ok(text.includes(message));
    assert.match(markup, /aria-label="Category"/);
    assert.match(markup, /<option value="lexical" selected=""/);
    assert.match(markup, /aria-label="Search language content"[^>]*value="Hello"/);
    assert.match(markup, /aria-label="Sort by"/);
    assert.match(markup, /<option value="pending" selected=""/);
    assert.ok(text.includes("Item filter fixture"));
    assert.ok(text.includes("Reset"));
    assert.doesNotMatch(text, /\bTotal\b|Has approved items|Unapproved items only|\bNo items\b|No matching language content/,
      "Unavailable data must not be presented as an empty inventory");
  });
}

test("overview leads the page and distinguishes content statistics from inventory totals", () => {
  const markup = renderOverview({ data });
  const text = visibleText(markup);
  const overviewIndex = markup.indexOf('aria-label="Language content overview"');
  const filtersIndex = markup.indexOf('aria-label="Coverage filters"');
  assert.ok(overviewIndex >= 0 && overviewIndex < filtersIndex);
  assert.match(text, /Total 2 Has approved items 1 50% Unapproved items only 0 0% No items 1 50%/);
  assert.doesNotMatch(text, /Approved items: 5|Unapproved items: 53|\b53\b/,
    "Inventory totals have a different scope and must not appear as a second overview summary");
});

test("an empty search keeps the filter controls and exposes search recovery", () => {
  const markup = renderOverview({ data, state: { ...state, search: "no matching entry" } });
  const text = visibleText(markup);
  assert.match(text, /Total 0/);
  assert.match(text, /No matching language content/);
  assert.match(text, /Clear search/);
  assert.match(markup, /aria-label="Search language content"[^>]*value="no matching entry"/);
  assert.match(markup, /aria-label="Category"/);
  assert.ok(text.includes("Item filter fixture"));
});

test("unknown saved targets qualify absence claims without changing known content counts", () => {
  const markup = renderOverview({ data: { ...data, plannedUnknownCount: 1, pendingUnknownCount: 2 } });
  const overview = visibleText(markup.slice(0, markup.indexOf('aria-label="Coverage filters"')));
  assert.match(overview, /Total 2 Has approved items 1 50% Only unapproved items recorded 0 0% No recorded items 1 50%/);
  assert.match(overview, /Saved target data is missing for 1 approved item and 2 unapproved items/);
  assert.doesNotMatch(overview, /\bNo items\b/);
});

test("selected combinations remain visible and clearable without response data", () => {
  const markup = render(<CoverageControls registry={registry} versions={[registry.bundleVersion]}
    request={{ ...request, pattern: ["hello"] }} onChange={noop} />);
  const text = visibleText(markup);
  assert.match(text, /Target combination Clear combination/);
  assert.match(text, /Includes: .*Hello/);
  assert.match(text, /Excludes: .*Time/);
  assert.doesNotMatch(markup, /aria-label="Item status"/, "Inventory status belongs to item details rather than the joint coverage filters");
  assert.doesNotMatch(markup, /aria-label="Match"/,
    "The combination already defines matching and must not retain a contradictory match selector");
});
