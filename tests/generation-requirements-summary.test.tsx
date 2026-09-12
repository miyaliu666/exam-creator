import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { GenerationRequirementsSummary } from "../client/features/language-items/generation-requirements-summary";
import type { RegistrySnapshot, TaskPackage } from "../client/features/language-items/types";

test("generated requirements preserve bilingual targets and saved information without editor controls", () => {
  const registry: RegistrySnapshot = {
    bundleVersion: "published-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [], candidateSchemas: [], taskPackageSchema: {}, allowedDomains: [],
    difficultyBands: [], difficultyStandards: [], contextOptions: [], canDoOptions: [], requiredReviewGateIds: [],
    contentIdOptions: [
      { id: "target", kind: "lexical", label: "苹果", englishGloss: "Apple", canDoIds: [], contextIds: [], masteryScope: null },
      { id: "support", kind: "supported", label: "placeName", canDoIds: [], contextIds: [], masteryScope: null },
    ],
  };
  const draft: Pick<TaskPackage, "content"> = { content: {
    primaryCanDoId: "A1-R1", primaryReportedSkill: "Reading", communicativeActivity: "Reception",
    primaryDomain: "Public", contextId: "shop", difficultyBand: "TypicalA1",
    targetContentIds: ["target"], supportingContentRefs: ["support"],
    requiredInformationPoints: ["Opening hours", { id: "IP2", pointType: "price", label: "Price per kilogram", required: true }],
  } };
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
    <GenerationRequirementsSummary draft={draft} registry={registry} />
  </ChakraProvider>);
  assert.match(markup, /苹果 \/ Apple/);
  assert.match(markup, /Opening hours/);
  assert.match(markup, /Price per kilogram/);
  assert.match(markup, /Supporting material types/);
  assert.doesNotMatch(markup, /<(?:input|textarea|select|button)\b/);
  assert.doesNotMatch(markup, /This version is read-only/);
});
