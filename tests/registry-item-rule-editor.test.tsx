import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { Children, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { RegistryItemRuleEditor } from "../client/features/language-items/registry-item-rule-editor";
import type { RegistryCapability, RegistrySnapshot } from "../client/features/language-items/types";

function fixture() {
  const capability: RegistryCapability = {
    itemRuleId: "slot", title: "Notices", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read",
    taskFamilyId: "family", rendererId: "renderer", scoringContractTemplateId: "contract", primaryReportedSkill: "Reading",
    communicativeActivity: "Reception", allowedDomains: ["Public", "Educational"], allowedContextIds: ["shop", "school"],
    observableEvidence: "Read a notice", taskStructure: "Short notice", prohibitedUses: [], referenceTask: "Room 205",
  };
  const snapshot: RegistrySnapshot = {
    bundleVersion: "test", status: "draft", sourceFingerprint: "test", limitations: [], capabilities: [capability],
    canDoOptions: [{ id: "read", label: "Read a notice", primarySkill: "Reading", activity: "Reception" }],
    contextOptions: [
      { id: "shop", label: "Shopping notices", primaryDomains: ["Public"], scope: "Opening times", canDoIds: ["read"], exclusions: [], retired: false },
      { id: "school", label: "Classroom notices", primaryDomains: ["Educational"], scope: "Room changes", canDoIds: ["read"], exclusions: [], retired: false },
    ], allowedDomains: ["Public", "Educational"], candidateSchemas: [], taskPackageSchema: {}, contentIdOptions: [],
    difficultyBands: [], difficultyStandards: [], requiredReviewGateIds: [],
  };
  return { snapshot, capability };
}

const noWrite = () => assert.fail("Displaying saved rules must not write or navigate");
const render = (snapshot: RegistrySnapshot, capability: RegistryCapability, disabled = false) => renderToStaticMarkup(
  <ChakraProvider value={defaultSystem}><RegistryItemRuleEditor snapshot={snapshot} capability={capability} update={noWrite} disabled={disabled} onSelect={noWrite} onManageContexts={noWrite} /></ChakraProvider>,
);

test("Item rules detail pairs every saved Context with exactly its own Domain", () => {
  const { snapshot, capability } = fixture();
  const before = structuredClone(snapshot);
  const html = render(snapshot, capability);
  const table = html.match(/<table\b[^>]*aria-label="Allowed Contexts and Domains"[\s\S]*?<\/table>/)?.[0] ?? "";
  const rows = table.match(/<tr\b[\s\S]*?<\/tr>/g) ?? [];
  assert.equal(rows.length, 3);
  assert.match(rows[1], /Shopping notices[\s\S]*Public/);
  assert.doesNotMatch(rows[1], /Classroom notices|Educational/);
  assert.match(rows[2], /Classroom notices[\s\S]*Educational/);
  assert.doesNotMatch(rows[2], /Shopping notices|Public/);
  assert.deepEqual(snapshot, before);
});

test("Current item rules presents a fixed identity with Primary Can-do first even when alternatives exist", () => {
  const { snapshot, capability } = fixture();
  snapshot.capabilities.push({ ...capability, itemRuleId: "other-primary-rule", primaryCanDoId: "other-primary" }, { ...capability, itemRuleId: "matching-rule", itemFormatId: "IF-MATCHING" });
  snapshot.canDoOptions.push({ id: "other-primary", label: "Read another text", primarySkill: "Reading", activity: "Reception" });
  const before = structuredClone(snapshot);
  const html = render(snapshot, capability);
  assert.match(html, /Current item rules/);
  assert.ok(html.indexOf("Primary Can-do") < html.indexOf("Exercise template"));
  assert.match(html, /Read a notice/);
  assert.doesNotMatch(html, /<select\b|Blueprint slot|Saved task design|Item rule ID/);
  assert.deepEqual(snapshot, before);
});

test("Context scope has an explicit closed edit toggle while its per-Context table stays visible", () => {
  const { snapshot, capability } = fixture();
  const html = render(snapshot, capability);
  const toggle = html.match(/<button\b[^>]*>Change allowed Contexts<\/button>/)?.[0] ?? "";
  assert.match(toggle, /aria-expanded="false"/);
  assert.match(html, /data-rule-section="contexts"/);
  assert.match(html, /aria-label="Allowed Contexts and Domains"/);
  assert.match(html, /aria-label="Edit Context Shopping notices"/);
  assert.match(html, /aria-label="Edit Context Classroom notices"/);
  const readOnly = render(snapshot, capability, true);
  assert.doesNotMatch(readOnly, /Change allowed Contexts/);
  assert.match(readOnly, /aria-label="View Context Shopping notices"/);
});

test("malformed and missing Context bindings remain visible with repair feedback and no invented Domain", () => {
  const { snapshot, capability } = fixture();
  snapshot.contextOptions[0].primaryDomains = ["Public", "Educational"];
  snapshot.contextOptions[1].retired = true;
  capability.allowedContextIds.push("missing");
  const before = structuredClone(snapshot);
  const html = render(snapshot, capability);
  assert.equal((html.match(/One valid Domain required/g) ?? []).length, 2);
  assert.match(html, /This context is retired/);
  assert.match(html, /This context no longer exists/);
  assert.equal((html.match(/>Remove invalid Context</g) ?? []).length, 3);
  const readOnly = render(snapshot, capability, true);
  assert.match(readOnly, /Missing Context/);
  assert.doesNotMatch(readOnly, /Remove invalid Context|Change allowed Contexts/);
  assert.deepEqual(snapshot, before);
});

test("Domain repair appears only for mismatched saved Domains with fully valid Contexts", () => {
  const { snapshot, capability } = fixture();
  assert.doesNotMatch(render(snapshot, capability), /Use Context Domains|Saved allowed Domains/);
  capability.allowedDomains = ["Educational", "Public", "Public"];
  assert.doesNotMatch(render(snapshot, capability), /Use Context Domains|Saved allowed Domains/);
  capability.allowedDomains = ["Public"];
  const before = structuredClone(snapshot);
  assert.match(render(snapshot, capability), /Saved allowed Domains do not match the Domains of the selected Contexts/);
  assert.match(render(snapshot, capability), />Use Context Domains</);
  const readOnly = render(snapshot, capability, true);
  assert.match(readOnly, /Saved allowed Domains do not match/);
  assert.doesNotMatch(readOnly, /Use Context Domains/);
  assert.deepEqual(snapshot, before);
  snapshot.contextOptions[0].retired = true;
  assert.doesNotMatch(render(snapshot, capability), /Use Context Domains/);
  capability.allowedContextIds = [];
  assert.doesNotMatch(render(snapshot, capability), /Use Context Domains/);
});

test("Use Context Domains changes only saved Domains and preserves the Context bindings", () => {
  const { snapshot, capability } = fixture();
  capability.allowedDomains = ["Personal"];
  const before = structuredClone(snapshot);
  const tree = RegistryItemRuleEditor({ snapshot, capability, disabled: false, onSelect: noWrite, onManageContexts: noWrite,
    update: (mutate) => mutate(snapshot) });
  const findRepair = (nodes: ReactNode): (() => void) | undefined => {
    for (const node of Children.toArray(nodes)) {
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node)) continue;
      if (node.props.children === "Use Context Domains") return node.props.onClick;
      const match = findRepair(node.props.children);
      if (match) return match;
    }
  };
  const repair = findRepair(tree);
  assert.ok(repair);
  repair();
  before.capabilities[0].allowedDomains = ["Public", "Educational"];
  assert.deepEqual(snapshot, before);
  assert.doesNotMatch(render(snapshot, capability), /Use Context Domains|Saved allowed Domains/);
});

test("Context links open the clicked shared definition without changing item rules", () => {
  const { snapshot, capability } = fixture();
  const before = structuredClone(snapshot);
  const opened: Array<string | undefined> = [];
  const tree = RegistryItemRuleEditor({ snapshot, capability, disabled: false, onSelect: noWrite, update: noWrite,
    onManageContexts: (id) => opened.push(id) });
  const openContext = (nodes: ReactNode, label: string): (() => void) | undefined => {
    for (const node of Children.toArray(nodes)) {
      if (!isValidElement<{ children?: ReactNode; onClick?: () => void; "aria-label"?: string }>(node)) continue;
      if (node.props["aria-label"] === label) return node.props.onClick;
      const match = openContext(node.props.children, label);
      if (match) return match;
    }
  };
  const openSchool = openContext(tree, "Edit Context Classroom notices");
  const openShop = openContext(tree, "Edit Context Shopping notices");
  assert.ok(openSchool);
  assert.ok(openShop);
  openSchool();
  openShop();
  assert.deepEqual(opened, ["school", "shop"]);
  assert.deepEqual(snapshot, before);
});
