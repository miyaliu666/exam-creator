import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { RegistryCanDoEditor } from "../client/features/language-items/registry-cando-editor";
import { ContentCatalog } from "../client/features/language-items/content-catalog";
import { ExerciseSettingsWorkspace } from "../client/features/language-items/exercise-settings-workspace";
import { RegistrySettingsNavigation } from "../client/features/language-items/registry-settings-navigation";
import { simplifyRegistryContent } from "../client/features/language-items/simple-language-content";
import { RegistrySharedEditDialog } from "../client/features/language-items/registry-shared-edit-dialog";
import type { RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types";

const snapshot: RegistrySnapshot = {
  bundleVersion: "test", status: "draft", limitations: [], sourceFingerprint: "test", capabilities: [], candidateSchemas: [], taskPackageSchema: {},
  allowedDomains: ["Educational"], difficultyBands: [], difficultyStandards: [], contentIdOptions: [], contextOptions: [], requiredReviewGateIds: [],
  canDoOptions: [{ id: "read", label: "Read a notice", primarySkill: "Reading", activity: "Reception" }],
};
const noWrite = () => assert.fail("Rendering must not change a Registry");
const render = (children: React.ReactNode) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}>{children}</ChakraProvider>);

test("Settings has only Item rules and Language content top-level navigation and a working empty-state entry", () => {
  const html = render(<><RegistrySettingsNavigation rulesActive onItemRules={() => undefined} onLanguageContent={() => undefined} />
    <ExerciseSettingsWorkspace snapshot={snapshot} update={noWrite} disabled={false} onEditCanDo={noWrite} onEditLegacy={noWrite} onStagedDirtyChange={() => undefined} onViewContent={noWrite} /></>);
  const top = html.match(/<button\b[^>]*role="tab"[^>]*>[^<]*<\/button>/g) ?? [];
  assert.equal(top.length, 2);
  assert.ok(top[0].includes("Item rules"));
  assert.ok(top[1].includes("Language content"));
  assert.match(html, /Add item rules/);
  assert.match(html, /No exercise template rules yet/);
  assert.doesNotMatch(html, />Rule libraries<|>Reference sources<|>Change history<|>Can-do library</);
});

test("shared Can-do editing exposes the actual skill and activity fields", () => {
  const html = render(<RegistryCanDoEditor snapshot={snapshot} update={noWrite} disabled={false} selectedId="read" />);
  assert.match(html, /Read a notice/);
  const selects = html.match(/<select\b[^>]*>/g) ?? [];
  assert.equal(selects.length, 3);
  assert.ok(selects.every((select) => !select.includes("disabled")));
  assert.match(html, /Add Can-do statement/);
});

test("read-only shared editors keep definitions visible and omit application and deletion controls", () => {
  const html = render(<RegistrySharedEditDialog snapshot={snapshot} update={noWrite} disabled section="canDo" selectedId="read" onClose={() => undefined} />);
  assert.match(html, /Read a notice/);
  assert.doesNotMatch(html, /Apply to draft|Add Can-do statement|Delete unused|Edit statement/);
  assert.doesNotMatch(html, /<textarea\b/);
  assert.equal((html.match(/<select\b[^>]*disabled=""/g) ?? []).length, 2);
});

test("View content shows compatible entries with import and entry actions on one page", () => {
  const capability = { itemRuleId: "slot", title: "Notice", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", primaryReportedSkill: "Reading", allowedContextIds: ["one"] } as RegistryCapability;
  const contextual = { ...snapshot, capabilities: [capability], contextOptions: [{ id: "one", label: "Classroom", scope: "Scope", canDoIds: ["read"], primaryDomains: ["Educational"], exclusions: [], retired: false }],
    contentIdOptions: [
      { id: "usable", kind: "lexical", label: "书", language: "zh", canDoIds: ["read"], contextIds: [], masteryScope: "receptive" },
      { id: "wrong-skill", kind: "lexical", label: "笔", language: "zh", canDoIds: ["write"], contextIds: [], masteryScope: null },
      { id: "wrong-mastery", kind: "lexical", label: "纸", language: "zh", canDoIds: [], contextIds: [], masteryScope: "productive" },
    ] } as RegistrySnapshot;
  const html = render(<ContentCatalog snapshot={contextual} update={noWrite} disabled={false} focus={{ ruleId: "slot", contextId: "one" }} onClearFocus={noWrite} />);
  assert.match(html, /Available content for/);
  assert.match(html, /New entry|Import|Show all content/);
  assert.match(html, /All languages · 1/);
  assert.match(html, /1 vocabulary · 0 grammar · 1 total/);
  assert.match(html, /书/);
  assert.doesNotMatch(html, /笔|纸|By Context|Assessment requirements/);
});

test("published language content explains why New entry and Import are disabled", () => {
  const html = render(<ContentCatalog snapshot={snapshot} update={noWrite} disabled published />);
  assert.match(html, /This published version is read-only/);
  assert.match(html, /Select Edit settings above to add or import language content/);
  assert.match(html, /Save the draft and select Use for new items/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>New entry<\/button>/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Import<\/button>/);
});

test("a source rule without a predefined Context opens the same content directory", () => {
  const sourceRule = {
    id: "source-rule", primaryCanDoId: "read", exerciseType: "Fill in the Blanks", enabled: true,
    allowedDomains: ["Educational"], allowedContextIds: [], taskRequirements: "Read and complete a notice.",
    difficultyStandards: [], scoring: { method: "exactMatch" as const, criteria: "Exact answer", normalizationPolicy: "" },
    reviewCriteria: [], defaults: {},
  };
  const sourceSnapshot = { ...snapshot, exerciseTemplateRules: [sourceRule],
    contentIdOptions: [
      { id: "available", kind: "lexical", label: "教室", canDoIds: [], contextIds: [], masteryScope: null },
      { id: "legacy-context-only", kind: "lexical", label: "餐厅", canDoIds: [], contextIds: ["restaurant"], masteryScope: null },
    ] } as RegistrySnapshot;
  const html = render(<ContentCatalog snapshot={sourceSnapshot} update={noWrite} disabled={false} focus={{ ruleId: "source-rule" }} onClearFocus={noWrite} />);
  assert.match(html, /Available content for/);
  assert.match(html, /New entry|Import|Show all content/);
  assert.match(html, /教室/);
  assert.doesNotMatch(html, /餐厅|By Context|Assessment requirements/);
});

test("new settings drop content exceptions while preserving the original snapshot", () => {
  const original = { ...snapshot, contentIdOptions: [{ id: "word", kind: "lexical", label: "书", canDoIds: [], contextIds: ["one"], contextScopeMode: "selected", excludedContextIds: [], masteryScope: null, assessmentRules: [{ applicability: "excluded" }] }] } as unknown as RegistrySnapshot;
  const simplified = simplifyRegistryContent(original);
  assert.deepEqual(simplified.contentIdOptions[0].contextIds, []);
  assert.equal(simplified.contentIdOptions[0].contextScopeMode, undefined);
  assert.equal(simplified.contentIdOptions[0].excludedContextIds, undefined);
  assert.equal(simplified.contentIdOptions[0].assessmentRules, undefined);
  assert.equal(original.contentIdOptions[0].contextIds[0], "one");
  assert.equal(original.contentIdOptions[0].assessmentRules?.[0].applicability, "excluded");
});
