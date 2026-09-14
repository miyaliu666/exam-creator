import assert from "node:assert/strict";
import test from "node:test";

import { coverageContentScope } from "../client/features/language-items/coverage-content-scope.ts";
import type { CoverageFilters } from "../client/features/language-items/coverage-types";
import type { ContentIdOption, DifficultyBandStandard, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types";

const entry = (id: string, patch: Partial<ContentIdOption> = {}): ContentIdOption => ({
  id, kind: "lexical", label: id, canDoIds: [], contextIds: [], masteryScope: null, ...patch,
});
const standard = (id: string): DifficultyBandStandard => ({
  id, label: id, description: "A1 profile", defaultDrivers: {
    inputLength: "shortSentence", informationPoints: 1, supportLevel: "high", distractorSimilarity: "clear",
    independenceLevel: "highlySupported", inferenceRequired: false,
  },
  allowedInputLengths: ["shortSentence"], informationPointsMin: 1, informationPointsMax: 1,
  allowedSupportLevels: ["high"], allowedDistractorSimilarities: ["clear"],
});
const capability = (id: string, patch: Partial<RegistryCapability>): RegistryCapability => ({
  itemRuleId: id, title: id, taskFamilyId: id, itemFormatId: "single", rendererId: "renderer",
  scoringContractTemplateId: "scoring", primaryCanDoId: id, primaryReportedSkill: "Listening",
  communicativeActivity: "Reception", allowedDomains: ["Educational", "Personal"],
  allowedContextIds: ["school", "home"], observableEvidence: "Evidence", taskStructure: "Task",
  prohibitedUses: [], referenceTask: "Example", ...patch,
});

function fixture(): RegistrySnapshot {
  const capabilities = [
    capability("listen", {}),
    capability("speak", { primaryReportedSkill: "Speaking", communicativeActivity: "Interaction", communicativeActivities: ["Interaction", "Production"], itemFormatId: "dialogue" }),
    capability("write", { primaryReportedSkill: "Writing", communicativeActivity: "Production", itemFormatId: "typed", allowedDomains: ["Occupational"], allowedContextIds: ["office"] }),
  ];
  return {
    bundleVersion: "rules-1", status: "published", settingsSchemaVersion: 2, sourceFingerprint: "fixture", limitations: [],
    capabilities, candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Educational", "Personal", "Occupational"],
    difficultyBands: ["LowerA1", "TypicalA1", "UpperA1"], difficultyStandards: [],
    capabilityDifficultyProfileSets: capabilities.map((value, index) => ({
      id: value.itemRuleId, itemRuleId: value.itemRuleId, itemFormatId: value.itemFormatId,
      primaryCanDoId: value.primaryCanDoId, standards: [standard(["LowerA1", "TypicalA1", "UpperA1"][index])],
    })),
    contextOptions: [
      { id: "school", label: "School", primaryDomains: ["Educational"], canDoIds: ["listen", "speak"], scope: "At school", exclusions: [], retired: false },
      { id: "home", label: "Home", primaryDomains: ["Personal"], canDoIds: ["listen", "speak"], scope: "At home", exclusions: [], retired: false },
      { id: "office", label: "Office", primaryDomains: ["Occupational"], canDoIds: ["write"], scope: "At work", exclusions: [], retired: false },
    ],
    canDoOptions: capabilities.map((value) => ({ id: value.primaryCanDoId, label: value.title })),
    contentIdOptions: [
      entry("common"), entry("listening", { canDoIds: ["listen"], contextIds: ["school"], masteryScope: "receptive" }),
      entry("speaking", { canDoIds: ["speak"], contextIds: ["home"], masteryScope: "productive" }),
      entry("writing", { kind: "grammar", canDoIds: ["write"], contextIds: ["office"], masteryScope: "productive" }),
      entry("material", { kind: "supported" }),
    ],
    requiredReviewGateIds: [],
  };
}
const ids = (registry: RegistrySnapshot, filters: CoverageFilters) => coverageContentScope(registry, filters).entries.map((value) => value.id);

test("an unfiltered overview retains the complete non-supporting directory without requiring current setups", () => {
  const registry = fixture();
  registry.capabilities = [];
  registry.contentIdOptions.push(entry("legacy", { kind: "legacy-category", contextScopeMode: "selected", contextIds: [] }));
  const before = structuredClone(registry);
  for (const filters of [{}, { skill: "", domain: undefined }]) {
    const scope = coverageContentScope(registry, filters);
    assert.deepEqual(scope.entries.map((value) => value.id), ["common", "listening", "speaking", "writing", "legacy"]);
    assert.equal(scope.hasMatchingSetup, true);
  }
  assert.deepEqual(registry, before);
});

test("each language scopes the complete directory and shared item setups without mixing entries", () => {
  const registry = fixture();
  registry.contentIdOptions = [
    entry("legacy-chinese"), entry("chinese", { language: "zh" }),
    entry("english", { language: "en" }), entry("spanish", { language: "es", kind: "grammar" }),
  ];
  assert.deepEqual(ids(registry, {}), ["legacy-chinese", "chinese"]);
  assert.deepEqual(ids(registry, { skill: "Listening" }), ["legacy-chinese", "chinese"]);
  for (const [language, expected] of [["en", ["english"]], ["es", ["spanish"]]] as const) {
    assert.deepEqual(ids(registry, { language }), expected);
    assert.deepEqual(ids(registry, { language, skill: "Listening" }), expected);
  }
  registry.contentIdOptions = registry.contentIdOptions.filter((value) => value.language !== "zh" && value.language !== undefined);
  assert.deepEqual(coverageContentScope(registry, { skill: "Listening" }), { entries: [], hasMatchingSetup: true });
});

test("all eight setup filters narrow eligible content while retaining entries with no item records", () => {
  const registry = fixture();
  const cases: Array<[CoverageFilters, string[]]> = [
    [{ skill: "Listening" }, ["common", "listening"]],
    [{ activity: "Production" }, ["common", "speaking", "writing"]],
    [{ domain: "Educational" }, ["common", "listening"]],
    [{ contextId: "home" }, ["common", "speaking"]],
    [{ itemRuleId: "listen" }, ["common", "listening"]],
    [{ primaryCanDoId: "speak" }, ["common", "speaking"]],
    [{ difficultyBand: "LowerA1" }, ["common", "listening"]],
    [{ itemFormatId: "typed" }, ["common", "writing"]],
  ];
  for (const [filters, expected] of cases) {
    assert.deepEqual(ids(registry, filters), expected, JSON.stringify(filters));
    assert.equal(coverageContentScope(registry, filters).hasMatchingSetup, true);
  }
  assert.deepEqual(ids(registry, { activity: "Interaction" }), ["common", "speaking"]);
  registry.capabilities[0].communicativeActivities = [];
  assert.deepEqual(ids(registry, { activity: "Reception" }), ["common", "listening"], "Legacy primary activity remains usable with an empty activities list");
});

test("combined filters must identify one compatible setup rather than matching different capabilities", () => {
  const registry = fixture();
  const filters: CoverageFilters = {
    skill: "Listening", activity: "Reception", domain: "Educational", contextId: "school",
    itemRuleId: "listen", primaryCanDoId: "listen", difficultyBand: "LowerA1", itemFormatId: "single",
  };
  assert.deepEqual(ids(registry, filters), ["common", "listening"]);
  for (const patch of [
    { activity: "Production" }, { primaryCanDoId: "speak" }, { domain: "Personal" },
    { itemFormatId: "typed" }, { contextId: "office" }, { difficultyBand: "UpperA1" },
  ]) {
    assert.deepEqual(coverageContentScope(registry, { ...filters, ...patch }), { entries: [], hasMatchingSetup: false });
  }
  for (const key of Object.keys(filters) as Array<keyof CoverageFilters>) {
    assert.deepEqual(coverageContentScope(registry, { [key]: "missing" }), { entries: [], hasMatchingSetup: false }, key);
  }
});

test("valid setups with no eligible content remain distinct from incompatible setup conditions", () => {
  const registry = fixture();
  registry.contentIdOptions = [entry("material", { kind: "supported" }), entry("none", { contextScopeMode: "selected" })];
  assert.deepEqual(coverageContentScope(registry, { skill: "Listening" }), { entries: [], hasMatchingSetup: true });
  assert.deepEqual(coverageContentScope(registry, { skill: "Listening", activity: "Production" }), { entries: [], hasMatchingSetup: false });
});

test("only active allowed Contexts with one valid Domain and compatible Can-do form a setup", () => {
  for (const mutate of [
    (registry: RegistrySnapshot) => { registry.contextOptions[0].retired = true; },
    (registry: RegistrySnapshot) => { registry.contextOptions[0].canDoIds = ["speak"]; },
    (registry: RegistrySnapshot) => { registry.contextOptions[0].primaryDomains = ["Educational", "Personal"]; },
    (registry: RegistrySnapshot) => { registry.contextOptions[0].scope = ""; },
    (registry: RegistrySnapshot) => { registry.capabilities[0].allowedContextIds = ["home"]; },
    (registry: RegistrySnapshot) => { registry.capabilities[0].allowedDomains = ["Personal"]; },
    (registry: RegistrySnapshot) => { registry.allowedDomains = ["Personal"]; },
  ]) {
    const registry = fixture();
    mutate(registry);
    assert.deepEqual(coverageContentScope(registry, { skill: "Listening", contextId: "school" }), { entries: [], hasMatchingSetup: false });
  }
});

test("difficulty scopes use supported combination profiles and preserve legacy profile fallback", () => {
  const registry = fixture();
  registry.capabilityDifficultyProfileSets![0].standards = [];
  assert.equal(coverageContentScope(registry, { skill: "Listening" }).hasMatchingSetup, false);
  registry.capabilityDifficultyProfileSets![0].standards = [standard("UnregisteredBand")];
  assert.equal(coverageContentScope(registry, { skill: "Listening" }).hasMatchingSetup, false);
  delete registry.settingsSchemaVersion;
  delete registry.capabilityDifficultyProfileSets;
  registry.difficultyStandards = [standard("TypicalA1")];
  assert.deepEqual(ids(registry, { skill: "Listening", difficultyBand: "TypicalA1" }), ["common", "listening"]);
  registry.settingsSchemaVersion = 2;
  assert.equal(coverageContentScope(registry, { skill: "Listening" }).hasMatchingSetup, false, "Modern snapshots cannot borrow global profiles for a missing combination");
});

test("entry scopes retain legacy and explicit Context semantics, Can-do restrictions and mastery", () => {
  const registry = fixture();
  registry.capabilities[0].supportingCanDoIds = ["support"];
  registry.contentIdOptions = [
    entry("legacy-all"), entry("legacy-school", { contextIds: ["school"] }),
    entry("all", { contextScopeMode: "all" }), entry("all-except-school", { contextScopeMode: "all", excludedContextIds: ["school"] }),
    entry("none", { contextScopeMode: "selected", contextIds: [] }), entry("school", { contextScopeMode: "selected", contextIds: ["school"] }),
    entry("other-cando", { canDoIds: ["write"] }), entry("supporting-cando", { canDoIds: ["support"] }),
    entry("receptive", { masteryScope: "receptive" }), entry("productive", { masteryScope: "productive" }),
    entry("both", { masteryScope: "receptiveProductive" }),
  ];
  assert.deepEqual(ids(registry, { skill: "Listening", contextId: "school" }), [
    "legacy-all", "legacy-school", "all", "school", "supporting-cando", "receptive", "both",
  ]);
  assert.deepEqual(ids(registry, { skill: "Listening", contextId: "home" }), [
    "legacy-all", "all", "all-except-school", "supporting-cando", "receptive", "both",
  ]);
  assert.ok(ids(registry, { skill: "Listening" }).includes("all-except-school"), "An entry eligible in any matching Context remains visible without a Context filter");
});

test("exact assessment exclusions narrow only their combination and allowed rules cannot widen entry scope", () => {
  const registry = fixture();
  const listening = registry.capabilities[0];
  const historicalRule = {
    itemRuleId: listening.itemRuleId, itemFormatId: listening.itemFormatId,
    primaryCanDoId: listening.primaryCanDoId, contextId: "school",
    assessmentMode: null, communicativePurpose: "", requiredEvidence: [], acceptableResponses: [],
    failurePatterns: [], prerequisites: [], validExamples: [], invalidExamples: [],
  };
  const excluded = entry("excluded");
  excluded.assessmentRules = [{ ...historicalRule, applicability: "excluded" }];
  const none = entry("none", { contextScopeMode: "selected" });
  const wrongCanDo = entry("wrong-cando", { canDoIds: ["write"] });
  const productive = entry("productive", { masteryScope: "productive" });
  for (const value of [none, wrongCanDo, productive]) value.assessmentRules = [{ ...historicalRule, applicability: "allowed" }];
  registry.contentIdOptions = [excluded, none, wrongCanDo, productive];
  assert.deepEqual(ids(registry, { skill: "Listening", contextId: "school" }), []);
  assert.deepEqual(ids(registry, { skill: "Listening", contextId: "home" }), ["excluded"]);
  assert.deepEqual(ids(registry, { skill: "Listening" }), ["excluded"]);
  assert.ok(ids(registry, { skill: "Speaking", contextId: "school" }).includes("excluded"), "Another capability in the same Context retains the entry");
});
