import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { registryDisplayText } from "../client/features/language-items/registry-display-text.ts";
import { ReviewRulesTable } from "../client/features/language-items/review-rules-table.tsx";
import { reviewSourceSummary } from "../client/features/language-items/review-source-summary.tsx";
import type { ReviewRuleSource } from "../client/features/language-items/review-rule-types.ts";

test("source summaries show authored rules without technical schemas or IDs", () => {
  const source: ReviewRuleSource = { id: "itemRule.read-notice", label: "Item rules, Can-do and structure", value: {
    capability: { title: "Short notices", primaryReportedSkill: "Reading", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "CD-1", observableEvidence: "Identify the classroom", a1Boundary: "Explicit short information" },
    canDoStatements: [{ id: "CD-1", label: "Understand a short notice" }], candidateSchemas: { secretSchemaMarker: true }, taskPackageSchema: { properties: { internalField: {} } },
  } };
  const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ReviewRulesTable checks={[{ id: "fixed.construct", title: "Construct", criterion: "Follow the Can-do", requiredEvidence: [], sourceRefs: [source.id], required: true, origin: "fixed", method: "ai" }]} sources={[source]} disabled={false} onEdit={() => {}} onRemove={() => {}} onEditSource={() => {}} /></ChakraProvider>);
  assert.match(html, /Short notices|Understand a short notice/); assert.match(html, /Multiple choice/); assert.match(html, /Edit source/);
  assert.equal(html.match(/>Edit source</g)?.length, 1); assert.doesNotMatch(html, /Edit its source/);
  assert.doesNotMatch(html, /secretSchemaMarker|taskPackageSchema|internalField|CD-1|IF-SINGLE-SELECT|<pre/);
});

test("required human review sources expose a direct read-only action", () => {
  const source: ReviewRuleSource = { id: "review.gates", label: "Required human reviews", value: ["editorial"] };
  const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><ReviewRulesTable checks={[{ id: "fixed.fairness", title: "Fairness", criterion: "Keep required human reviews", requiredEvidence: [], sourceRefs: [source.id], required: true, origin: "fixed", method: "ai" }]} sources={[source]} disabled={false} onEdit={() => {}} onRemove={() => {}} onEditSource={() => {}} /></ChakraProvider>);
  assert.match(html, />View required reviews</); assert.match(html, /Language and editing/);
  assert.doesNotMatch(html, />Edit source<|Edit its source/);
});

test("Context, difficulty and language summaries retain meaningful values and bound long directories", () => {
  const summarize = (id: string, value: unknown) => reviewSourceSummary({ id, label: "Source", value }, registryDisplayText).join("\n");
  assert.match(summarize("contexts.x", [{ label: "Classroom", scope: "Room changes and lesson times" }]), /Classroom: Room changes/);
  const difficulty = summarize("difficulty.x", [{ label: "Lower A1", informationPointsMin: 1, informationPointsMax: 2, allowedInputLengths: ["shortSentence"], allowedSupportLevels: ["high"], defaultDrivers: { distractorSimilarity: "notApplicable" } }]);
  assert.match(difficulty, /Lower A1: Input length: Short sentence · Information points: 1–2 · Support: High/); assert.doesNotMatch(difficulty, /Distractors/);
  const language = summarize("content.x", Array.from({ length: 400 }, (_, index) => ({ id: `LX-${index}`, kind: "lexical", label: `词${index}`, meaning: "Meaning" })));
  assert.match(language, /400 language entries/); assert.match(language, /397 more entries/); assert.doesNotMatch(language, /词399|LX-/);
  assert.equal(summarize("review.gates", ["editorial", "scoring"]), "Language and editing\nAnswers and scoring");
});
