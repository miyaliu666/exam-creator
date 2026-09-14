import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { aiGenerationMatchesSetup, aiGenerationSetupSnapshot } from "../client/features/language-items/ai-generation-setup";
import { ensureInformationPointSlots } from "../client/features/language-items/information-points";
import { applyItemSetup, difficultyScheme, itemSetupSelection, selectedDifficulty } from "../client/features/language-items/item-setup";
import { ItemSetupPanel } from "../client/features/language-items/item-setup-panel";
import { MetadataFields } from "../client/features/language-items/metadata-fields";
import { validateAuthoringSetup } from "../client/features/language-items/setup-validation";
import type { AiGenerationRun, DifficultyBandStandard, RegistryCapability, RegistrySnapshot, TaskPackage } from "../client/features/language-items/types";

function fixture() {
  const lower: DifficultyBandStandard = {
    id: "LowerA1", label: "Lower A1", description: "One explicit opening time, with clear contextual support.",
    defaultDrivers: { inputLength: "shortSentence", informationPoints: 1, supportLevel: "moderate", distractorSimilarity: "clear", independenceLevel: "highlySupported", inferenceRequired: false },
    allowedInputLengths: ["wordOrPhrase", "shortSentence"], informationPointsMin: 1, informationPointsMax: 2,
    allowedSupportLevels: ["high", "moderate"], allowedDistractorSimilarities: ["moderate", "clear"],
  };
  const upper: DifficultyBandStandard = {
    id: "UpperA1", label: "Upper A1", description: "Two explicit facts in a short notice.",
    defaultDrivers: { inputLength: "twoRelatedPhrases", informationPoints: 2, supportLevel: "limited", distractorSimilarity: "close", independenceLevel: "independent", inferenceRequired: false },
    allowedInputLengths: ["shortSentence", "twoRelatedPhrases"], informationPointsMin: 2, informationPointsMax: 2,
    allowedSupportLevels: ["moderate", "limited"], allowedDistractorSimilarities: ["moderate", "close"],
  };
  const capability: RegistryCapability = {
    itemRuleId: "R-A1-1", title: "Short notices", taskFamilyId: "TF-NOTICES", itemFormatId: "IF-SINGLE-SELECT",
    rendererId: "REN-SINGLE-SELECT", scoringContractTemplateId: "SCORE-NOTICE", primaryCanDoId: "A1-R1",
    primaryReportedSkill: "Reading", communicativeActivity: "Reception", allowedDomains: ["Public", "Educational"],
    allowedContextIds: ["shop", "school"], observableEvidence: "Locate an explicit time and place.",
    taskStructure: "Read a notice and select an answer.", prohibitedUses: [], referenceTask: "An opening notice",
  };
  const registry: RegistrySnapshot = {
    settingsSchemaVersion: 1, bundleVersion: "published-1", status: "published", limitations: [], sourceFingerprint: "fixture",
    capabilities: [capability], candidateSchemas: [], taskPackageSchema: {}, allowedDomains: ["Public", "Educational"],
    difficultyBands: ["LowerA1", "UpperA1"], difficultyStandards: [lower, upper],
    capabilityDifficultyProfileSets: [{ id: "notice-difficulty", itemRuleId: "R-A1-1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "A1-R1", standards: [lower, upper] }],
    contentIdOptions: [
      { id: "target-shop", kind: "lexical", label: "营业", canDoIds: ["A1-R1"], contextIds: ["shop"], masteryScope: "receptive" },
      { id: "target-time", kind: "lexical", label: "几点", canDoIds: ["A1-R1"], contextIds: [], masteryScope: "receptiveProductive" },
      { id: "support-shop", kind: "supported", label: "placeName", canDoIds: ["A1-R1"], contextIds: ["shop"], masteryScope: null },
    ],
    contextOptions: [
      { id: "shop", label: "Shop opening information", primaryDomains: ["Public"], canDoIds: ["A1-R1"], scope: "Opening hours", exclusions: [], retired: false },
      { id: "school", label: "School notices", primaryDomains: ["Educational"], canDoIds: ["A1-R1"], scope: "Opening hours and classrooms", exclusions: [], retired: false },
    ],
    canDoOptions: [{ id: "A1-R1", label: "Understand short notices" }], requiredReviewGateIds: [],
  };
  const draft: TaskPackage = {
    taskId: "LI-NOTICE", taskVersion: "draft", specVersions: { planningSpecVersion: "1", registryBundleVersion: "published-1", taskPackageVersion: "1" },
    itemRuleId: "R-A1-1", taskFamilyId: "TF-NOTICES", itemFormatId: "IF-SINGLE-SELECT", renderer: { rendererId: "REN-SINGLE-SELECT", rendererVersion: "1" },
    candidatePayload: {
      stimulus: { text: "书店在一楼，上午九点开门。", imageRefs: [], audioRef: null }, prompt: "书店几点开门？",
      options: [{ optionId: "A", text: "上午九点", imageRef: null }, { optionId: "B", text: "上午十点", imageRef: null }], shuffleOptions: false,
    },
    authoringPackage: { notes: ["Keep the original wording until the author chooses to edit it."] },
    scoringPackage: { scoringContractTemplateId: "SCORE-NOTICE", correctOptionId: "A", scoringPoints: [{ scoringPointId: "SP-ITEM", description: "Correct opening time", points: 1 }] },
    reviewPackage: { gates: {} }, mediaRefs: [], variation: {},
    deliveryPolicyRefs: { navigationPolicyId: "review", inputPolicyId: "none", playbackPolicyId: "none", recordingPolicyId: "none", speakingRateProfileId: "none", pauseProfileId: "none" },
    content: {
      primaryCanDoId: "A1-R1", primaryReportedSkill: "Reading", communicativeActivity: "Reception", primaryDomain: "Public", contextId: "shop", difficultyBand: "UpperA1",
      difficulty: {
        intendedBand: "UpperA1", status: "HumanConfirmed", drivers: { inputLength: "twoRelatedPhrases", informationPoints: 2, supportLevel: "limited", distractorSimilarity: "close", independenceLevel: "independent", inferenceRequired: false, outputLength: "selectedOption", interactionTurns: 0, preparationTimeSeconds: null },
        rationale: ["A reviewer confirmed the original two-fact brief."],
        empiricalDifficulty: { status: "Piloted", sampleId: "pilot-1", observedBand: "UpperA1", percentCorrect: 0.7, discrimination: 0.4, omissionRate: 0, medianResponseTimeSeconds: 12, decision: "retain" },
      },
      targetContentIds: ["target-shop", "target-time"], supportingContentRefs: ["support-shop"],
      requiredInformationPoints: [
        { id: "IP2", pointType: "time", label: "Time: 09:00", required: true, sourceRef: "notice-time", scoringPointId: "SP-ITEM" },
        { id: "IP7", pointType: "location", label: "Location: first floor", required: false, sourceRef: "notice-location", scoringPointId: "SP-ITEM" },
      ],
    },
  };
  return { draft, registry, lower, upper };
}

test("English and Spanish use shared setup rules with their own targets and generation briefs", () => {
  for (const language of ["en", "es"]) {
    const { draft, registry } = fixture();
    draft.content.language = language;
    registry.contentIdOptions.forEach((entry) => { entry.language = language; });
    assert.equal(validateAuthoringSetup("Notice", draft, registry).filter((issue) => issue.path === "content.targetContentIds" || issue.path === "content.supportingContentRefs").length, 0);
    const snapshot = aiGenerationSetupSnapshot(draft);
    assert.equal(snapshot.language, language);
    const run = { generationSetupSnapshot: snapshot } as AiGenerationRun;
    assert.equal(aiGenerationMatchesSetup(run, draft), true);
    draft.content.language = "zh";
    assert.equal(aiGenerationMatchesSetup(run, draft), false);
    assert.ok(validateAuthoringSetup("Notice", draft, registry).some((issue) => issue.path === "content.targetContentIds"));
  }
  const { draft } = fixture();
  const legacy = { generationSetupSnapshot: aiGenerationSetupSnapshot(draft) } as AiGenerationRun;
  draft.content.language = "zh";
  assert.equal(aiGenerationMatchesSetup(legacy, draft), true);
});

test("previewing a context and difficulty change preserves authored work and leaves the saved draft untouched", () => {
  const { draft, registry } = fixture();
  const original = structuredClone(draft);
  const originalRegistry = structuredClone(registry);
  const preview = structuredClone(draft);
  applyItemSetup(preview, { domain: "Educational", contextId: "school", difficultyBand: "LowerA1" }, registry);

  assert.deepEqual(itemSetupSelection(preview), { domain: "Educational", contextId: "school", difficultyBand: "LowerA1" });
  assert.equal(preview.content.difficulty?.drivers.informationPoints, 1);
  assert.deepEqual(preview.content.targetContentIds, original.content.targetContentIds);
  assert.deepEqual(preview.content.supportingContentRefs, original.content.supportingContentRefs);
  assert.deepEqual(preview.content.requiredInformationPoints, original.content.requiredInformationPoints);
  assert.deepEqual(preview.candidatePayload, original.candidatePayload);
  assert.deepEqual(preview.scoringPackage, original.scoringPackage);
  assert.deepEqual(preview.authoringPackage, original.authoringPackage);
  assert.deepEqual(preview.specVersions, original.specVersions);
  assert.deepEqual(draft, original, "Cancel can discard the preview without restoring any saved fields");
  assert.deepEqual(registry, originalRegistry);

  const issues = validateAuthoringSetup("Opening notice", preview, registry);
  assert.ok(issues.some(({ path }) => path === "content.targetContentIds"));
  assert.ok(issues.some(({ path }) => path === "content.supportingContentRefs"));
  assert.ok(issues.some(({ path }) => path === "content.requiredInformationPoints"));
});

test("keeping the same difficulty preserves the historical profile, rationale and pilot evidence", () => {
  const { draft, registry } = fixture();
  const original = structuredClone(draft.content.difficulty);
  applyItemSetup(draft, { domain: "Educational", contextId: "school", difficultyBand: "UpperA1" }, registry);
  assert.deepEqual(draft.content.difficulty, original);
  assert.deepEqual(selectedDifficulty(draft, registry), original);
});

test("a new difficulty takes the complete published default scheme even when legacy ranges allow other choices", () => {
  const { draft, registry, lower } = fixture();
  applyItemSetup(draft, { ...itemSetupSelection(draft), difficultyBand: "LowerA1" }, registry);
  const profile = draft.content.difficulty!;
  assert.equal(profile.drivers.inputLength, "shortSentence");
  assert.equal(profile.drivers.informationPoints, 1);
  assert.equal(profile.drivers.supportLevel, "moderate");
  assert.equal(profile.drivers.distractorSimilarity, "clear");
  assert.equal(profile.drivers.independenceLevel, "highlySupported");
  assert.equal(profile.drivers.inferenceRequired, false);
  assert.deepEqual(profile.rationale, [lower.description]);
  assert.equal(profile.status, "AuthorEstimated");
  assert.equal(profile.empiricalDifficulty.status, "NotPiloted");
  assert.equal(profile.empiricalDifficulty.sampleId, null);
});

test("previewing an unavailable difficulty fails without partially applying context or domain changes", () => {
  const { draft, registry } = fixture();
  const original = structuredClone(draft);
  assert.throws(() => applyItemSetup(draft, { domain: "Educational", contextId: "school", difficultyBand: "missing" }, registry), /available/);
  assert.deepEqual(draft, original);
});

test("the displayed fallback scheme does not rewrite a legacy draft with no saved difficulty profile", () => {
  const { draft, registry } = fixture();
  delete draft.content.difficulty;
  const original = structuredClone(draft);
  assert.equal(selectedDifficulty(draft, registry)?.drivers.informationPoints, 2);
  assert.deepEqual(draft, original);
});

test("open response schemes keep distractors inapplicable and use the matching response structure", () => {
  const { draft, lower } = fixture();
  draft.itemFormatId = "IF-SPOKEN-SINGLE";
  const profile = difficultyScheme(draft, lower);
  assert.equal(profile.drivers.distractorSimilarity, "notApplicable");
  assert.equal(profile.drivers.outputLength, "shortSpeech");
  assert.equal(profile.drivers.interactionTurns, 1);
  assert.equal(profile.drivers.preparationTimeSeconds, 20);
});

test("Prepare shows every retained information point, explicit removal and incompatible content after setup changes", () => {
  const { draft, registry } = fixture();
  applyItemSetup(draft, { domain: "Educational", contextId: "school", difficultyBand: "LowerA1" }, registry);
  const original = structuredClone(draft);
  const markup = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><MetadataFields
    draft={draft} registry={registry} issues={validateAuthoringSetup("Opening notice", draft, registry)} updateDraft={() => assert.fail("Rendering must not modify a draft")}
  /></ChakraProvider>);
  assert.match(markup, /All your points have been kept/);
  assert.match(markup, /value="Time: 09:00"/);
  assert.match(markup, /value="Location: first floor"/);
  assert.match(markup, /aria-label="Remove information point 1"/);
  assert.match(markup, /aria-label="Remove information point 2"/);
  assert.match(markup, /Not available for this context\. Remove or replace this target/);
  assert.match(markup, /Not available for this context\. Remove or replace this supporting content/);
  assert.doesNotMatch(markup, /Change context or difficulty|Difficulty tuning|Explicit information points/);
  assert.deepEqual(draft, original);
});

test("the setup summary offers a single edit action only on editable drafts", () => {
  const { draft, registry } = fixture();
  const render = (canEdit: boolean) => renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ItemSetupPanel
    draft={draft} registry={registry} canEdit={canEdit} onApply={() => assert.fail("Rendering must not apply setup")}
  /></ChakraProvider>);
  const editable = render(true);
  assert.equal(editable.split("Edit item setup").length - 1, 1);
  assert.match(editable, /Maintain its rules in Assessment Settings/);
  assert.doesNotMatch(render(false), /Edit item setup/);
});

test("adding information slots after an explicit removal preserves surviving links and creates unique IDs", () => {
  const { draft } = fixture();
  draft.content.requiredInformationPoints = [
    { id: "IP1", pointType: "time", label: "Removed fact", required: true },
    { id: "IP2", pointType: "location", label: "Keep this fact", required: true, sourceRef: "notice-location", scoringPointId: "SP-ITEM" },
  ];
  draft.content.requiredInformationPoints.splice(0, 1);
  const survivor = structuredClone(draft.content.requiredInformationPoints[0]);
  const scoring = structuredClone(draft.scoringPackage);
  ensureInformationPointSlots(draft, 2);
  assert.deepEqual(draft.content.requiredInformationPoints[0], survivor);
  const points = draft.content.requiredInformationPoints;
  assert.ok(points.every((point) => typeof point !== "string"));
  assert.equal(new Set(points.map((point) => typeof point === "string" ? point : point.id)).size, 2);
  assert.equal(typeof points[1] === "string" ? points[1] : points[1].label, "");
  const padded = structuredClone(points);
  ensureInformationPointSlots(draft, 1);
  assert.deepEqual(draft.content.requiredInformationPoints, padded, "Reducing the requirement never removes saved facts");
  assert.deepEqual(draft.scoringPackage, scoring, "Removing a brief fact does not remove its scoring point or answer");
});

function generationRun(draft: TaskPackage, legacy = false): AiGenerationRun {
  const snapshot = structuredClone(aiGenerationSetupSnapshot(draft));
  return {
    id: "AIR-NOTICE", itemId: draft.taskId, provider: "deterministic-mock", model: "offline", modelVersion: "1",
    promptId: "generate", promptVersion: "1", outputSchemaVersion: "1", specVersions: snapshot.specVersions,
    itemRuleId: snapshot.itemRuleId, taskFamilyId: snapshot.taskFamilyId, itemFormatId: snapshot.itemFormatId,
    rendererId: snapshot.rendererId, primaryCanDoId: snapshot.primaryCanDoId, primaryDomain: snapshot.primaryDomain,
    contextId: snapshot.contextId, difficultyBand: snapshot.difficultyBand, targetContentIds: snapshot.targetContentIds,
    requiredInformationPoints: snapshot.requiredInformationPoints.map(({ label }) => label),
    generationSetupSnapshot: legacy ? undefined : snapshot, requestedCount: 1, candidates: [], adoptedCandidateId: null,
    status: "completed", error: null, attemptCount: 1, retryCount: 0, candidateErrors: [],
    createdBy: "author@example.test", createdAt: "2026-09-08T00:00:00Z", updatedAt: "2026-09-08T00:00:01Z",
  };
}

const changedBriefs: Array<[string, (draft: TaskPackage) => void]> = [
  ["context", (draft) => { draft.content.contextId = "school"; }],
  ["domain", (draft) => { draft.content.primaryDomain = "Educational"; }],
  ["difficulty band", (draft) => { draft.content.difficultyBand = "LowerA1"; }],
  ["difficulty profile", (draft) => { draft.content.difficulty!.drivers.informationPoints = 1; }],
  ["language targets", (draft) => { draft.content.targetContentIds.pop(); }],
  ["supporting content", (draft) => { draft.content.supportingContentRefs = []; }],
  ["information-point type", (draft) => {
    const point = draft.content.requiredInformationPoints[0];
    assert.ok(typeof point !== "string");
    point.pointType = "date";
  }],
  ["information-point scoring reference", (draft) => {
    const point = draft.content.requiredInformationPoints[0];
    assert.ok(typeof point !== "string");
    point.scoringPointId = "SP-OTHER";
  }],
];

for (const [label, change] of changedBriefs) {
  test(`AI candidates become stale when the ${label} changes`, () => {
    const { draft } = fixture();
    const run = generationRun(draft);
    assert.equal(aiGenerationMatchesSetup(run, draft), true);
    change(draft);
    assert.equal(aiGenerationMatchesSetup(run, draft), false);
  });
}

test("editing the title, question and answer does not make candidates stale while the generation brief is unchanged", () => {
  const item = { title: "Original title", ...fixture() };
  const run = generationRun(item.draft);
  item.title = "A clearer internal title";
  assert.ok("prompt" in item.draft.candidatePayload);
  item.draft.candidatePayload.prompt = "书店几点营业？";
  item.draft.scoringPackage.correctOptionId = "B";
  item.draft.authoringPackage.notes.push("Review revised wording.");
  assert.equal(aiGenerationMatchesSetup(run, item.draft), true);
});

test("serialized object key order does not change the generation brief", () => {
  const { draft } = fixture();
  const run = generationRun(draft);
  const snapshot = run.generationSetupSnapshot!;
  run.generationSetupSnapshot = {
    ...snapshot,
    specVersions: {
      taskPackageVersion: snapshot.specVersions.taskPackageVersion,
      registryBundleVersion: snapshot.specVersions.registryBundleVersion,
      planningSpecVersion: snapshot.specVersions.planningSpecVersion,
    },
  };
  assert.equal(aiGenerationMatchesSetup(run, draft), true);
});

test("legacy AI runs compare their saved information-point text and setup without inventing missing metadata", () => {
  const { draft } = fixture();
  const run = generationRun(draft, true);
  assert.equal(aiGenerationMatchesSetup(run, draft), true);
  draft.content.requiredInformationPoints = [...run.requiredInformationPoints];
  assert.equal(aiGenerationMatchesSetup(run, draft), true, "Legacy strings and structured labels represent the same saved brief");
  draft.content.requiredInformationPoints[0] = "Time: 10:00";
  assert.equal(aiGenerationMatchesSetup(run, draft), false);
  draft.content.requiredInformationPoints = [...run.requiredInformationPoints];
  draft.content.contextId = "school";
  assert.equal(aiGenerationMatchesSetup(run, draft), false);
});
