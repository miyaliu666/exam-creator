import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CoverageControls } from "../client/features/language-items/coverage-controls";
import { CoverageOverviewPanel } from "../client/features/language-items/coverage-overview";
import type { CoverageFilters, CoverageOverview, CoverageOverviewState, CoverageRequest } from "../client/features/language-items/coverage-types";
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
const setupRegistry: RegistrySnapshot = {
  ...registry,
  allowedDomains: ["Educational", "Personal"],
  difficultyBands: ["a1Typical"],
  difficultyStandards: [{
    id: "a1Typical", label: "Typical A1", description: "A short supported exchange",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  }],
  capabilities: [{
    itemRuleId: "listen", title: "Listen", primaryCanDoId: "understand", primaryReportedSkill: "Listening", communicativeActivity: "Reception", itemFormatId: "singleSelect",
    taskFamilyId: "exchange", rendererId: "fixture", scoringContractTemplateId: "fixture", allowedDomains: ["Educational", "Personal"], allowedContextIds: ["classroom", "home"],
    observableEvidence: "A response", taskStructure: "An exchange", prohibitedUses: [], referenceTask: "An exchange",
  }],
  contextOptions: [
    { id: "classroom", label: "Classroom", primaryDomains: ["Educational"], canDoIds: ["understand"], scope: "School exchanges", exclusions: [], retired: false },
    { id: "home", label: "Home", primaryDomains: ["Personal"], canDoIds: ["understand"], scope: "Home exchanges", exclusions: [], retired: false },
  ],
  contentIdOptions: registry.contentIdOptions.map((entry) => ({ ...entry, contextScopeMode: "selected", contextIds: [entry.id === "hello" ? "classroom" : "home"] })),
};
const request: CoverageRequest = {
  registryVersion: registry.bundleVersion, scope: "approved", role: "core", selectedIds: ["hello", "time"],
  excludedIds: [], matchMode: "all", filters: {}, offset: 0, limit: 25,
};
const noop = () => {};
const render = (element: ReactNode) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}>{element}</ChakraProvider>);
const visibleText = (markup: string) => markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const renderOverview = (options: { registry?: RegistrySnapshot; data?: CoverageOverview; state?: CoverageOverviewState; feedback?: ReactNode; itemFilters?: CoverageFilters }) => render(
  <CoverageOverviewPanel registry={options.registry ?? registry} state={options.state ?? state} data={options.data} feedback={options.feedback} itemFilters={options.itemFilters}
    filters={<button>Item filter fixture</button>} onReset={noop} onStateChange={noop} onInspect={noop} />,
);

test("both Coverage views expose a concrete Language selector and targets from that language only", () => {
  const multilingual = { ...registry, contentIdOptions: [...registry.contentIdOptions,
    { ...registry.contentIdOptions[0], id: "english", language: "en", label: "English target" },
    { ...registry.contentIdOptions[0], id: "spanish", language: "es", label: "Spanish target" },
  ] };
  for (const overview of [false, true]) {
    const markup = render(<CoverageControls registry={multilingual} versions={[registry.bundleVersion]} overview={overview}
      request={{ ...request, selectedIds: [], filters: { language: "en" } }} onChange={noop} />);
    assert.match(markup, /aria-label="Language"/);
    assert.match(markup, /<option value="en" selected=""/);
    const text = visibleText(markup);
    assert.match(text, /Chinese English Spanish/);
    assert.doesNotMatch(text, /Spanish target|Vocabulary: 你好|Vocabulary: 时间/);
  }
});

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
    assert.doesNotMatch(text, /\bTotal\b|With approved items|With unapproved items only|Without items|\bNo items\b|No matching language content/,
      "Unavailable data must not be presented as an empty inventory");
  });
}

test("overview leads the page and distinguishes content statistics from inventory totals", () => {
  const markup = renderOverview({ data });
  const text = visibleText(markup);
  const overviewIndex = markup.indexOf('aria-label="Language content overview"');
  const filtersIndex = markup.indexOf('aria-label="Coverage filters"');
  assert.ok(overviewIndex >= 0 && overviewIndex < filtersIndex);
  assert.match(text, /Total 2 With approved items 1 50% With unapproved items only 0 0% Without items 1 50%/);
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

test("Overview applies the selected setup to both summary and table, including unused eligible content", () => {
  const markup = renderOverview({ registry: setupRegistry, data: { ...data, entries: [] }, itemFilters: { contextId: "classroom" } });
  const text = visibleText(markup);
  assert.match(text, /Total 1 With approved items 0 0% With unapproved items only 0 0% Without items 1 100%/);
  assert.match(text, /Coverage by language content/);
  assert.match(text, /Hello/);
  assert.match(text, /No items/);
  assert.doesNotMatch(text, /时间|Time/);
});

test("incompatible setup filters explain an empty overview and keep recovery controls", () => {
  const markup = renderOverview({ registry: setupRegistry, data, itemFilters: { skill: "Listening", activity: "Production" } });
  const text = visibleText(markup);
  assert.match(text, /Total 0/);
  assert.match(text, /No compatible item setup matches these filters\./);
  assert.doesNotMatch(text, /No language content matches these filters\.|Hello|Time|100%/);
  assert.match(text, /Item filter fixture/);
  assert.match(text, /Reset/);
  assert.match(markup, /aria-label="Category"/);
});

test("valid setup filters with no eligible category explain missing content rather than an invalid setup", () => {
  const markup = renderOverview({ registry: setupRegistry, data, state: { ...state, category: "grammar" }, itemFilters: { contextId: "classroom" } });
  const text = visibleText(markup);
  assert.match(text, /Total 0/);
  assert.match(text, /No language content matches these filters\./);
  assert.doesNotMatch(text, /No compatible item setup matches these filters\.|100%/);
  assert.match(text, /Reset/);
  assert.match(markup, /<option value="grammar" selected=""/);
});

test("empty English and Spanish published directories explain why imported drafts are absent", () => {
  for (const [language, label] of [["en", "English"], ["es", "Spanish"]] as const) {
    const markup = renderOverview({ data, itemFilters: { language } });
    const text = visibleText(markup);
    assert.match(text, /Total 0/);
    assert.match(text, new RegExp(`The selected Assessment Settings version has no ${label} language content`));
    assert.match(text, /If you have already used a newer version, reopen Language coverage to load it/);
    assert.match(text, /Otherwise, save and use the draft containing the imported entries for new items/);
    assert.doesNotMatch(text, /No language content matches these filters/);
  }
});

test("a published English entry with an unmatched category keeps the ordinary empty state", () => {
  const englishRegistry = { ...registry, contentIdOptions: [
    ...registry.contentIdOptions,
    { ...registry.contentIdOptions[0], id: "about", language: "en", label: "about" },
  ] };
  const markup = renderOverview({ registry: englishRegistry, data, state: { ...state, category: "grammar" }, itemFilters: { language: "en" } });
  const text = visibleText(markup);
  assert.match(text, /No language content matches these filters/);
  assert.doesNotMatch(text, /selected Assessment Settings version has no English language content/);
});

test("selected setup filters do not turn unavailable coverage into zero statistics or empty-state claims", () => {
  for (const feedback of ["Loading coverage…", "Coverage request failed"]) {
    const markup = renderOverview({ registry: setupRegistry, feedback: <p role="status">{feedback}</p>, itemFilters: { skill: "Listening", activity: "Production" } });
    const text = visibleText(markup);
    assert.match(text, new RegExp(feedback));
    assert.match(text, /Reset/);
    assert.match(text, /Item filter fixture/);
    assert.doesNotMatch(text, /\bTotal\b|With approved items|Without items|No compatible item setup|No language content matches/);
  }
});

test("unknown saved targets qualify absence claims without changing known content counts", () => {
  const markup = renderOverview({ data: { ...data, plannedUnknownCount: 1, pendingUnknownCount: 2 } });
  const overview = visibleText(markup.slice(0, markup.indexOf('aria-label="Coverage filters"')));
  assert.match(overview, /Total 2 With approved items 1 50% Only unapproved items recorded 0 0% No recorded items 1 50%/);
  assert.match(overview, /Saved target data is missing for 1 approved item and 2 unapproved items/);
  assert.doesNotMatch(overview, /Without items|\bNo items\b/);
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
