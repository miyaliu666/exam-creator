import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { MetadataFields } from "../client/features/language-items/metadata-fields";
import type { RegistrySnapshot, TaskPackage } from "../client/features/language-items/types";

test("literal checks distinguish missing words and characters from grammar and pragmatics needing human review", () => {
  const contentIdOptions = [
    { id: "missing-word", kind: "lexical", label: "苹果" },
    { id: "present-word", kind: "lexical", label: "老师" },
    { id: "missing-character", kind: "character", label: "猫" },
    { id: "question-pattern", kind: "grammar", label: "疑问句式" },
    { id: "greeting-function", kind: "pragmatics", label: "问候功能" },
  ].map((entry) => ({ ...entry, canDoIds: [], contextIds: [], masteryScope: "receptiveProductive" }));
  const registry: RegistrySnapshot = {
    bundleVersion: "word-check-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [{
      blueprintSlotId: "R-A1-1", title: "Notices", taskFamilyId: "TF-NOTICES", itemFormatId: "IF-SINGLE-SELECT",
      rendererId: "REN-SINGLE-SELECT", scoringContractTemplateId: "SCORE-NOTICE", primaryCanDoId: "A1-R1",
      primaryReportedSkill: "Reading", communicativeActivity: "Reception", allowedDomains: ["Public"],
      allowedContextIds: ["school"], observableEvidence: "Understand a direct question.",
      taskStructure: "Select one answer.", prohibitedUses: [], referenceTask: "A short exchange",
    }],
    contentIdOptions, candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Public"],
    difficultyBands: ["TypicalA1"], difficultyStandards: [], contextOptions: [], canDoOptions: [], requiredReviewGateIds: [],
  };
  const draft: TaskPackage = {
    taskId: "LI-WORD-CHECK", taskVersion: "draft",
    specVersions: { planningSpecVersion: "1", registryBundleVersion: "word-check-1", taskPackageVersion: "1" },
    blueprintSlotId: "R-A1-1", taskFamilyId: "TF-NOTICES", itemFormatId: "IF-SINGLE-SELECT",
    renderer: { rendererId: "REN-SINGLE-SELECT", rendererVersion: "1" },
    candidatePayload: {
      stimulus: { text: "你是老师吗？", imageRefs: [], audioRef: null }, prompt: "请选择回答。",
      options: [{ optionId: "A", text: "是。", imageRef: null }, { optionId: "B", text: "不是。", imageRef: null }], shuffleOptions: false,
    },
    content: {
      primaryCanDoId: "A1-R1", primaryReportedSkill: "Reading", communicativeActivity: "Reception",
      primaryDomain: "Public", contextId: "school", difficultyBand: "TypicalA1",
      targetContentIds: contentIdOptions.map((entry) => entry.id), supportingContentRefs: [], requiredInformationPoints: ["Identity"],
    },
    authoringPackage: { notes: [] }, scoringPackage: { scoringContractTemplateId: "SCORE-NOTICE", correctOptionId: "A" },
    reviewPackage: { gates: {} }, mediaRefs: [], variation: {},
    deliveryPolicyRefs: { navigationPolicyId: "none", inputPolicyId: "none", playbackPolicyId: "none", recordingPolicyId: "none", speakingRateProfileId: "none", pauseProfileId: "none" },
  };
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><MetadataFields
    draft={draft} registry={registry} updateDraft={() => assert.fail("A read-only check must not change targets")}
  /></ChakraProvider>);
  const text = markup.replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "").replace(/<[^>]*>/g, "");
  const check = text.split("Word and character check")[1];
  assert.ok(check, "The literal check must be distinct from formal language coverage");
  const missing = check.split("Selected words and characters not found")[1]?.split("Characters outside the current range")[0];
  assert.ok(missing, "Missing literal targets need their own result");
  assert.match(missing, /苹果/);
  assert.match(missing, /猫/);
  assert.doesNotMatch(missing, /老师|疑问句式|问候功能/);

  const humanReview = check.split("Grammar and pragmatic functions: human review required")[1]?.split("Key information")[0];
  assert.ok(humanReview, "Nonliteral targets must remain visible for human review");
  assert.match(humanReview, /疑问句式/);
  assert.match(humanReview, /问候功能/);
  assert.match(humanReview, /not detected automatically/);
  assert.match(humanReview, /record evidence/);
  assert.doesNotMatch(humanReview, /苹果|猫/);
});
