import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import type { BatchGenerationJob, BatchGroup } from "../client/features/language-items/batch-api";
import { batchGenerationSummary } from "../client/features/language-items/batch-progress-display";
import { BatchProgressGroup } from "../client/features/language-items/batch-progress-group";
import type { RegistrySnapshot } from "../client/features/language-items/types";

const group: BatchGroup = {
  blueprintSlotId: "L-A1-1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "A1-L1", primaryDomain: "Personal",
  contextId: "D02", difficultyBand: "LowerA1", itemCount: 5, requiredTargetContentIds: ["common"], rotatingTargetContentIds: ["varied"],
};
const children: BatchGenerationJob["children"] = (["completed", "partial", "running", "pending", "failed"] as const)
  .map((status, index) => ({ index, groupIndex: 0, itemCreated: status !== "pending", status,
    itemId: `LI-0123456789abcdef0123456789abcdef-${index + 1}`, targetContentIds: ["common", "varied"] }));
const job: BatchGenerationJob = {
  id: "BATCH-0123456789abcdef0123456789abcdef", title: "Named generation", ownerEmail: "author@example.test", registryVersion: "rules-1",
  groups: [group], candidatesPerItem: 2, status: "queued", children, createdAt: "2026-09-09T04:00:00Z", updatedAt: "2026-09-09T04:00:00Z",
};
const registry: RegistrySnapshot = {
  bundleVersion: "rules-1", status: "published", limitations: [], sourceFingerprint: "", capabilities: [], candidateSchemas: [], taskPackageSchema: {},
  allowedDomains: ["Personal"], difficultyBands: ["LowerA1"], difficultyStandards: [],
  contentIdOptions: [{ id: "common", kind: "lexical", label: "我", canDoIds: [], contextIds: [], masteryScope: null },
    { id: "varied", kind: "lexical", label: "你", canDoIds: [], contextIds: [], masteryScope: null }],
  contextOptions: [{ id: "D02", label: "Personal information", primaryDomains: ["Personal"], canDoIds: [], scope: "", exclusions: "", retired: false }],
  canDoOptions: [{ id: "A1-L1", label: "Understand personal information" }], requiredReviewGateIds: [],
};

function render(targetChildren = children) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><BatchProgressGroup group={group} groupIndex={0} grouped={false}
    children={targetChildren} registry={registry} labelsError={false} onOpenItem={() => undefined} /></ChakraProvider>);
}

test("progress counts items with partial candidates once and reflects active children without clearing pause", () => {
  const summary = batchGenerationSummary(job);
  assert.deepEqual(summary, { total: 5, withCandidates: 2, waiting: 1, generating: 1, failed: 1, status: "running" });
  assert.equal(summary.withCandidates + summary.waiting + summary.generating + summary.failed, summary.total);
  assert.equal(batchGenerationSummary({ ...job, status: "paused" }).status, "paused");
  assert.equal(batchGenerationSummary({ ...job, children: [] }).status, "queued");
});

test("single-group results show settings and shared targets once, with item numbers and bilingual target details", () => {
  const html = render();
  for (const label of ["Blueprint slot", "Item format", "Primary Can-do", "Domain", "Context", "Difficulty"]) {
    assert.equal((html.match(new RegExp(`>${label}<`, "g")) ?? []).length, 1);
  }
  assert.equal((html.match(/>我</g) ?? []).length, 1, "Common targets belong above the rows");
  assert.equal((html.match(/>你</g) ?? []).length, 5, "Additional targets stay visible for their assigned items");
  assert.match(html, /title="词汇 \/ Vocabulary: 我 \/ I; me"/);
  for (const child of children) assert(!html.includes(child.itemId!));
  assert.match(html, /AI drafts ready/);
  assert.doesNotMatch(html, />Group 1</);
  assert.doesNotMatch(html, /Review and select/);
});

test("identical target assignments omit the empty differences column", () => {
  const html = render(children.map((child) => ({ ...child, targetContentIds: ["common"] })));
  assert.doesNotMatch(html, /Additional targets/);
  assert.equal((html.match(/>我</g) ?? []).length, 1);
});
