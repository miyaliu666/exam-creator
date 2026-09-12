import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { ContentAssessmentRuleDialog } from "../client/features/language-items/content-assessment-rule-dialog";
import { createContentAssessmentRule } from "../client/features/language-items/content-assessment-rules";
import type { ContentIdOption, RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types";

const capability = { blueprintSlotId: "slot", title: "Classroom notices", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", primaryReportedSkill: "Reading", allowedContextIds: ["school"] } as RegistryCapability;
const entry: ContentIdOption = { id: "grammar", label: "在／不在", kind: "grammar", pattern: "在／不在＋地点", canDoIds: [], contextIds: [], masteryScope: null };
const rule = { ...createContentAssessmentRule(entry, capability, "school"), assessmentMode: "understanding" as const, communicativePurpose: "Find the classroom", requiredEvidence: ["Identify the actual location"] };
const saved = { ...entry, assessmentRules: [rule] };
const snapshot = { bundleVersion: "one", capabilities: [capability], contentIdOptions: [saved], canDoOptions: [{ id: "read", label: "Find a location" }], contextOptions: [{ id: "school", label: "Classroom" }] } as RegistrySnapshot;

function render(disabled: boolean, current = snapshot) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ContentAssessmentRuleDialog entry={saved} capability={capability} contextId="school" snapshot={current} disabled={disabled} onApply={() => assert.fail("Rendering must never write settings")} onClose={() => undefined} /></ChakraProvider>);
}

test("read-only rules expose their evidence without write or removal actions", () => {
  const html = render(true);
  assert.match(html, /Find the classroom/);
  assert.match(html, /Identify the actual location/);
  assert.doesNotMatch(html, /Apply to draft|Remove rule; use entry scope/);
  const inputs = html.match(/<(?:input|select|textarea)\b[^>]*>/g) ?? [];
  assert.ok(inputs.length > 0);
  for (const input of inputs) assert.match(input, /disabled=""/);
});

test("a stale entry remains visible with disabled application instead of overwriting new content", () => {
  const current = { ...snapshot, contentIdOptions: [{ ...saved, notes: "Changed elsewhere" }] };
  const html = render(false, current);
  assert.match(html, /changed or was removed/);
  assert.match(html, /Find the classroom/);
  const apply = html.match(/<button\b[^>]*>Apply to draft<\/button>/)?.[0];
  assert.ok(apply);
  assert.match(apply, /disabled=""/);
});
