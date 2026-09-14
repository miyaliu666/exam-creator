import assert from "node:assert/strict";
import test from "node:test";

import { coverageOverviewModel, coverageOverviewRows } from "../client/features/language-items/coverage-overview-model.ts";
import type { CoverageOverview, CoverageOverviewState } from "../client/features/language-items/coverage-types.ts";
import type { ContentIdOption, RegistrySnapshot } from "../client/features/language-items/types.ts";

const option = (id: string, kind: string, label = id, englishGloss = ""): ContentIdOption => ({ id, kind, label, englishGloss, canDoIds: [], contextIds: [], masteryScope: null });

function fixture() {
  const registry: RegistrySnapshot = {
    bundleVersion: "rules-1", status: "published", sourceFingerprint: "fixture", limitations: [], capabilities: [],
    candidateSchemas: [], taskPackageSchema: {}, allowedDomains: [], difficultyBands: [], difficultyStandards: [],
    contextOptions: [], canDoOptions: [], requiredReviewGateIds: [],
    contentIdOptions: [
      option("hello", "lexical", "你好", "Hello"), option("time", "lexical", "时间", "Time"),
      option("identity", "grammar", "是", "State identity"), option("good", "character", "好", "Good"),
      option("request", "pragmatics", "请求", "Make a request"), option("legacy", "legacy-category", "旧目标", "Legacy target"),
      option("name", "supported", "Person name"),
    ],
  };
  const data: CoverageOverview = {
    approvedItemCount: 6, pendingItemCount: 5, plannedUnknownCount: 1, confirmedUnknownCount: 4, pendingUnknownCount: 2,
    entries: [
      { id: "hello", plannedCount: 3, confirmedCount: 1, pendingCount: 2 },
      { id: "time", plannedCount: 1, confirmedCount: 0, pendingCount: 0 },
      { id: "request", plannedCount: 0, confirmedCount: 0, pendingCount: 4 },
      { id: "name", plannedCount: 99, confirmedCount: 99, pendingCount: 99 },
      { id: "removed-reference", plannedCount: 99, confirmedCount: 99, pendingCount: 99 },
    ],
  };
  const state: CoverageOverviewState = { category: "", search: "", sort: "name", offset: 0 };
  return { registry, data, state };
}

function setupFixture() {
  const { registry, data, state } = fixture();
  registry.allowedDomains = ["Educational", "Personal"];
  registry.difficultyBands = ["a1Typical"];
  registry.difficultyStandards = [{
    id: "a1Typical", label: "Typical A1", description: "A short supported exchange",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
    allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
  }];
  registry.capabilities = [
    { itemRuleId: "listen", title: "Listen", primaryCanDoId: "understand", primaryReportedSkill: "Listening", communicativeActivity: "Reception", itemFormatId: "singleSelect" },
    { itemRuleId: "speak", title: "Speak", primaryCanDoId: "exchange", primaryReportedSkill: "Speaking", communicativeActivity: "Production", itemFormatId: "shortResponse" },
  ].map((capability) => ({
    ...capability, taskFamilyId: "exchange", rendererId: "fixture", scoringContractTemplateId: "fixture",
    allowedDomains: ["Educational", "Personal"], allowedContextIds: ["classroom", "home"],
    observableEvidence: "A response", taskStructure: "An exchange", prohibitedUses: [], referenceTask: "An exchange",
  }));
  registry.contextOptions = [
    { id: "classroom", label: "Classroom", primaryDomains: ["Educational"] },
    { id: "home", label: "Home", primaryDomains: ["Personal"] },
  ].map((context) => ({ ...context, canDoIds: ["understand", "exchange"], scope: "Everyday exchanges", exclusions: [], retired: false }));
  registry.contentIdOptions = [
    option("hello", "lexical", "Hello"),
    { ...option("school-time", "lexical", "School time"), contextScopeMode: "selected", contextIds: ["classroom"] },
    { ...option("home-time", "lexical", "Home time"), contextScopeMode: "selected", contextIds: ["home"] },
    { ...option("produce", "lexical", "Produce a response"), masteryScope: "productive" },
    { ...option("question", "grammar", "Ask a question"), canDoIds: ["exchange"] },
  ];
  data.entries = [{ id: "hello", plannedCount: 3, pendingCount: 2, confirmedCount: 0 }];
  return { registry, data, state };
}

test("overview joins sparse counts to the complete unique directory and excludes supporting types", () => {
  const { registry, data, state } = fixture();
  registry.contentIdOptions.push({ ...registry.contentIdOptions[0] });
  const before = structuredClone({ registry, data, state });
  const rows = coverageOverviewRows(registry, data);
  assert.equal(rows.length, 6);
  assert.equal(rows.filter((row) => row.id === "hello").length, 1);
  assert.equal(rows.some((row) => ["name", "removed-reference"].includes(row.id)), false);
  assert.deepEqual(rows.find((row) => row.id === "identity"), {
    id: "identity", category: "grammar", label: "Grammar: 是 / State identity", plannedCount: 0, pendingCount: 0,
  });
  const model = coverageOverviewModel(registry, data, state);
  assert.deepEqual([model.summary.total, model.summary.approved, model.summary.unapprovedOnly, model.summary.noItems], [6, 2, 1, 3]);
  assert.ok(Math.abs(model.summary.approvedPercent! - 100 / 3) < 0.00001);
  assert.ok(Math.abs(model.summary.unapprovedOnlyPercent! - 100 / 6) < 0.00001);
  assert.equal(model.summary.noItemsPercent, 50);
  assert.ok(model.categories.includes("legacy-category"));
  assert.deepEqual({ registry, data, state }, before);
});

test("category and search use the same content scope for summary and rows, and clearing search restores it", () => {
  const { registry, data, state } = fixture();
  const category = { ...state, category: "lexical" };
  const model = coverageOverviewModel(registry, data, category);
  assert.equal(model.summary.total, 2);
  assert.equal(model.summary.approvedPercent, 100);
  assert.equal(model.summary.unapprovedOnlyPercent, 0);
  assert.equal(model.summary.noItemsPercent, 0);
  assert.equal(model.categoryTotal, 2);
  const searched = coverageOverviewModel(registry, data, { ...category, search: "  HELLO  " });
  assert.deepEqual(searched.rows.map((row) => row.id), ["hello"]);
  assert.deepEqual(searched.summary, { total: 1, approved: 1, unapprovedOnly: 0, noItems: 0, approvedPercent: 100, unapprovedOnlyPercent: 0, noItemsPercent: 0 });
  assert.equal(searched.categoryTotal, 2);
  const empty = coverageOverviewModel(registry, data, { ...category, search: "missing" });
  assert.deepEqual(empty.summary, { total: 0, approved: 0, unapprovedOnly: 0, noItems: 0, approvedPercent: null, unapprovedOnlyPercent: null, noItemsPercent: null });
  assert.equal(empty.categoryTotal, 2, "An empty search must not look like an empty registered category");
  assert.equal(empty.matchedCount, 0);
  assert.deepEqual(empty.rows, []);
  assert.deepEqual(empty.categories, model.categories);
  const chinese = coverageOverviewModel(registry, data, { ...category, search: "时间" });
  assert.deepEqual(chinese.rows.map((row) => row.id), ["time"]);
  assert.equal(chinese.summary.total, 1);
  assert.deepEqual(coverageOverviewModel(registry, data, { ...category, search: "" }), model);
  assert.equal(coverageOverviewModel(registry, data, { ...state, category: "all" }).summary.total, 6);
});

test("narrowing the item inventory preserves zero-item directory entries in the content denominator", () => {
  const { registry, data, state } = fixture();
  const emptyInventory = { ...data, approvedItemCount: 0, pendingItemCount: 0, plannedUnknownCount: 0, pendingUnknownCount: 0, entries: [] };
  const model = coverageOverviewModel(registry, emptyInventory, state);
  assert.deepEqual(model.summary, { total: 6, approved: 0, unapprovedOnly: 0, noItems: 6, approvedPercent: 0, unapprovedOnlyPercent: 0, noItemsPercent: 100 });
  assert.equal(model.rows.length, 6);
  const searched = coverageOverviewModel(registry, emptyInventory, { ...state, category: "lexical", search: "Hello" });
  assert.equal(searched.categoryTotal, 2);
  assert.equal(searched.summary.total, 1);
  assert.equal(searched.summary.noItems, 1);
  assert.equal(searched.rows[0].id, "hello");
});

test("setup filters scope the total and table to compatible language content while retaining gaps", () => {
  const { registry, data, state } = setupFixture();
  const filters = { skill: "Listening", activity: "Reception", domain: "Educational", primaryCanDoId: "understand", difficultyBand: "a1Typical", itemFormatId: "singleSelect", itemRuleId: "listen" };
  const before = structuredClone({ registry, data, state, filters });
  const unfiltered = coverageOverviewModel(registry, data, state);
  const model = coverageOverviewModel(registry, data, state, filters);
  assert.equal(unfiltered.summary.total, 5);
  assert.equal(model.hasMatchingSetup, true);
  assert.deepEqual(model.rows.map((row) => row.id), ["hello", "school-time"]);
  assert.deepEqual(model.summary, { total: 2, approved: 1, unapprovedOnly: 0, noItems: 1, approvedPercent: 50, unapprovedOnlyPercent: 0, noItemsPercent: 50 });
  assert.equal(model.categoryTotal, 2);
  assert.equal(model.matchedCount, 2);
  assert.deepEqual([model.rows[1].plannedCount, model.rows[1].pendingCount], [0, 0], "Eligible content remains visible before an item has been created");
  const searched = coverageOverviewModel(registry, data, { ...state, category: "lexical", search: "School" }, filters);
  assert.equal(searched.summary.total, 1);
  assert.equal(searched.summary.noItems, 1);
  assert.deepEqual(searched.rows.map((row) => row.id), ["school-time"]);
  assert.equal(searched.categoryTotal, 2);
  assert.deepEqual({ registry, data, state, filters }, before);
});

test("a Context filter considers its compatible setups and clears without losing the full directory", () => {
  const { registry, data, state } = setupFixture();
  const model = coverageOverviewModel(registry, data, state, { contextId: "classroom" });
  assert.equal(model.hasMatchingSetup, true);
  assert.equal(model.summary.total, 4);
  assert.deepEqual(new Set(model.rows.map((row) => row.id)), new Set(["hello", "school-time", "produce", "question"]));
  assert.equal(model.summary.noItems, 3);
  const lexical = coverageOverviewModel(registry, data, { ...state, category: "lexical" }, { contextId: "classroom" });
  assert.equal(lexical.summary.total, 3);
  assert.deepEqual(lexical.categories, model.categories, "Available category choices remain independent of the selected setup");
  assert.deepEqual(coverageOverviewModel(registry, data, state, {}), coverageOverviewModel(registry, data, state));
});

test("conflicting setup filters return no setup or rows, distinct from a valid setup with no language matches", () => {
  const { registry, data, state } = setupFixture();
  const impossible = coverageOverviewModel(registry, data, state, { skill: "Listening", activity: "Production" });
  assert.equal(impossible.hasMatchingSetup, false);
  assert.equal(impossible.summary.total, 0);
  assert.equal(impossible.matchedCount, 0);
  assert.deepEqual(impossible.rows, []);
  assert.deepEqual([impossible.summary.approvedPercent, impossible.summary.unapprovedOnlyPercent, impossible.summary.noItemsPercent], [null, null, null]);
  const noEntries = coverageOverviewModel(registry, data, { ...state, category: "grammar" }, { skill: "Listening" });
  assert.equal(noEntries.hasMatchingSetup, true);
  assert.equal(noEntries.summary.total, 0);
  assert.deepEqual(noEntries.rows, []);
});

test("setup changes clamp pagination and count all eligible entries beyond the current page", () => {
  const { registry, data, state } = setupFixture();
  registry.contentIdOptions = Array.from({ length: 61 }, (_, index) => ({
    ...option(`entry-${index}`, "lexical", `Entry ${index}`), contextScopeMode: "selected" as const, contextIds: [index < 31 ? "classroom" : "home"],
  }));
  data.entries = [{ id: "entry-0", plannedCount: 1, pendingCount: 0, confirmedCount: 0 }];
  const lastUnfiltered = coverageOverviewModel(registry, data, { ...state, offset: 50 });
  assert.equal(lastUnfiltered.summary.total, 61);
  assert.equal(lastUnfiltered.rows.length, 11);
  const first = coverageOverviewModel(registry, data, state, { contextId: "classroom" });
  const last = coverageOverviewModel(registry, data, { ...state, offset: 50 }, { contextId: "classroom" });
  assert.equal(first.rows.length, 25);
  assert.equal(last.rows.length, 6);
  assert.equal(last.offset, 25);
  assert.equal(last.summary.total, 31);
  assert.equal(last.summary.noItems, 30);
  assert.deepEqual(last.summary, first.summary);
  assert.equal(new Set([...first.rows, ...last.rows].map((row) => row.id)).size, 31);
  const searched = coverageOverviewModel(registry, data, { ...state, search: "Entry 30", offset: 50 }, { contextId: "classroom" });
  assert.equal(searched.offset, 0);
  assert.equal(searched.summary.total, 1);
  assert.deepEqual(searched.rows.map((row) => row.id), ["entry-30"]);
  const sorted = coverageOverviewModel(registry, data, { ...state, sort: "planned" }, { contextId: "classroom" });
  assert.deepEqual(sorted.summary, first.summary);
});

test("summary categories form a complete partition and count overlapping approved and unapproved use once", () => {
  const { registry, data, state } = fixture();
  for (const category of ["", "lexical", "grammar", "pragmatics", "missing"]) {
    const { summary } = coverageOverviewModel(registry, data, { ...state, category });
    assert.equal(summary.approved + summary.unapprovedOnly + summary.noItems, summary.total);
    if (summary.total > 0) assert.ok(Math.abs(summary.approvedPercent! + summary.unapprovedOnlyPercent! + summary.noItemsPercent! - 100) < 0.00001);
  }
  const overlapping = { ...registry, contentIdOptions: registry.contentIdOptions.filter((entry) => entry.id === "hello") };
  const { summary, rows } = coverageOverviewModel(overlapping, data, state);
  assert.deepEqual(summary, { total: 1, approved: 1, unapprovedOnly: 0, noItems: 0, approvedPercent: 100, unapprovedOnlyPercent: 0, noItemsPercent: 0 });
  assert.deepEqual([rows[0].plannedCount, rows[0].pendingCount], [3, 2], "The row retains both item counts even though its summary category is approved");
});

test("all language points show both inventory counts, including overlapping use and zero-item entries", () => {
  const { registry, data, state } = fixture();
  const rows = coverageOverviewModel(registry, data, state).rows;
  const counts = (id: string) => {
    const row = rows.find((entry) => entry.id === id);
    assert.ok(row, `Directory entry ${id} remains visible`);
    return [row.plannedCount, row.pendingCount];
  };
  assert.deepEqual(counts("hello"), [3, 2], "Approved and pending use coexist on one row");
  assert.deepEqual(counts("time"), [1, 0]);
  assert.deepEqual(counts("request"), [0, 4]);
  for (const id of ["good", "identity", "legacy"]) assert.deepEqual(counts(id), [0, 0]);
  const known = coverageOverviewModel(registry, { ...data, plannedUnknownCount: 0, confirmedUnknownCount: 0, pendingUnknownCount: 0 }, state);
  assert.deepEqual(known.summary, coverageOverviewModel(registry, data, state).summary, "Missing target data must not invent covered language points or alter the directory denominator");
  const changedEvidence = { ...data, confirmedUnknownCount: 0, entries: data.entries.map((entry) => ({ ...entry, confirmedCount: 100 })) };
  assert.deepEqual(coverageOverviewModel(registry, changedEvidence, state), coverageOverviewModel(registry, data, state), "Separate author evidence does not change the saved-target inventory view");
});

test("retired availability state cannot hide entries from the overview model", () => {
  const { registry, data, state } = fixture();
  for (const patch of [{}, { category: "lexical" }, { search: "HELLO" }, { category: "grammar", search: "missing" }]) {
    const scoped = { ...state, ...patch };
    const all = coverageOverviewModel(registry, data, scoped);
    for (const status of ["all", "approved", "pendingOnly", "unused", "noPlanned", "noConfirmed"]) {
      const legacyState = { ...scoped, status };
      assert.deepEqual(coverageOverviewModel(registry, data, legacyState), all);
    }
  }
});

test("count sorting puts scarce approved coverage first and pending work first without invented thresholds", () => {
  const { registry, data, state } = fixture();
  const expectedSummary = coverageOverviewModel(registry, data, state).summary;
  for (const sort of ["name", "planned", "pending"] as const) {
    assert.deepEqual(coverageOverviewModel(registry, data, { ...state, sort }).summary, expectedSummary);
  }
  const model = coverageOverviewModel(registry, data, { ...state, sort: "planned" });
  assert.equal(model.rows[0].plannedCount, 0);
  assert.equal(model.rows.at(-1)?.id, "hello");
  assert.deepEqual(coverageOverviewModel(registry, data, { ...state, sort: "pending" }).rows.slice(0, 2).map((row) => row.id), ["request", "hello"]);
});

test("name sorting uses the language entry name rather than its category prefix", () => {
  const { registry, data, state } = fixture();
  registry.contentIdOptions = [option("z", "lexical", "Zulu"), option("a", "pragmatics", "Alpha"), option("b", "grammar", "Bravo")];
  const model = coverageOverviewModel(registry, data, { ...state, sort: "name" });
  assert.deepEqual(model.rows.map((row) => row.id), ["a", "b", "z"]);
  assert.match(model.rows[0].label, /Pragmatic functions: Alpha/, "Category remains in the display label");
});

test("pagination is stable and clamps a stale page after filters or inventory shrink", () => {
  const { registry, data, state } = fixture();
  registry.contentIdOptions = Array.from({ length: 53 }, (_, index) => option(`id-${index}`, "lexical", `Entry ${index}`));
  data.entries = Array.from({ length: 40 }, (_, index) => ({ id: `id-${index}`, plannedCount: index < 26 ? 1 : 0, pendingCount: index >= 26 ? 1 : 0, confirmedCount: 0 }));
  const first = coverageOverviewModel(registry, data, state);
  const second = coverageOverviewModel(registry, data, { ...state, offset: 25 });
  const last = coverageOverviewModel(registry, data, { ...state, offset: 1000 });
  assert.equal(first.rows.length, 25);
  assert.equal(second.rows.length, 25);
  assert.equal(last.rows.length, 3);
  assert.equal(last.offset, 50);
  assert.deepEqual([first.summary.total, first.summary.approved, first.summary.unapprovedOnly, first.summary.noItems], [53, 26, 14, 13]);
  for (const page of [first, second, last]) {
    assert.deepEqual(page.summary, first.summary, "Summary covers all matching content, not just the displayed page");
    assert.equal(page.categoryTotal, 53);
    assert.equal(page.matchedCount, 53);
  }
  assert.equal(new Set([...first.rows, ...second.rows, ...last.rows].map((row) => row.id)).size, 53);
  const filtered = coverageOverviewModel(registry, data, { ...state, search: "Entry 52", offset: 50 });
  assert.equal(filtered.offset, 0);
  assert.equal(filtered.rows[0].id, "id-52");
  assert.equal(filtered.summary.total, 1);
  assert.equal(filtered.summary.noItems, 1);
  assert.equal(filtered.categoryTotal, 53);
});

test("empty categories and empty registries never claim a coverage percentage", () => {
  const { registry, data, state } = fixture();
  for (const model of [
    coverageOverviewModel(registry, data, { ...state, category: "missing" }),
    coverageOverviewModel({ ...registry, contentIdOptions: [] }, data, state),
  ]) {
    assert.equal(model.summary.total, 0);
    assert.equal(model.categoryTotal, 0);
    assert.deepEqual([model.summary.approved, model.summary.unapprovedOnly, model.summary.noItems], [0, 0, 0]);
    assert.equal(model.summary.approvedPercent, null);
    assert.equal(model.summary.unapprovedOnlyPercent, null);
    assert.equal(model.summary.noItemsPercent, null);
    assert.equal(model.offset, 0);
    assert.deepEqual(model.rows, []);
  }
});
