import { Stack, Text } from "@chakra-ui/react";
import { useContext } from "react";

import { CONTENT_KIND_LABELS, ITEM_FORMAT_LABELS, REVIEW_GATE_LABELS } from "./labels";
import { RegistryTextContext } from "./registry-reference-labels";
import type { ReviewRuleSource } from "./review-rule-types";

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function records(value: unknown) { return Array.isArray(value) ? value.map(record) : []; }
function text(value: unknown) { return typeof value === "string" ? value : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }

export function reviewSourceSummary(source: ReviewRuleSource, display: (value: string) => string): string[] {
  const prefix = source.id.split(".")[0];
  const value = record(source.value);
  const readable = (value: unknown) => display(text(value)).replace(/\b(?:IF|TF|SCT|REN|DPS|CTX|A1|RG|LX|GP|CD)-[A-Za-z0-9_.:-]+\b/g, "Unavailable reference");
  const brief = (value: unknown) => { const full = readable(value); return full.length > 220 ? `${full.slice(0, 217)}…` : full; };
  if (prefix === "itemRule") {
    const capability = record(value.capability);
    const primary = records(value.canDoStatements).find((entry) => entry.id === capability.primaryCanDoId);
    return [
      readable(capability.title),
      [readable(capability.primaryReportedSkill), ITEM_FORMAT_LABELS[text(capability.itemFormatId)]].filter(Boolean).join(" · "),
      primary ? `Primary Can-do: ${brief(primary.label)}` : "",
      capability.observableEvidence ? `Evidence: ${brief(capability.observableEvidence)}` : "",
      capability.a1Boundary ? `A1 boundary: ${brief(capability.a1Boundary)}` : "",
    ].filter(Boolean);
  }
  if (prefix === "contexts") {
    const contexts = records(source.value);
    return [...contexts.slice(0, 4).map((entry) => `${readable(entry.label)}${entry.scope ? `: ${brief(entry.scope)}` : ""}`), ...(contexts.length > 4 ? [`${contexts.length - 4} more Contexts`] : [])];
  }
  if (prefix === "difficulty") return records(source.value).map((entry) => {
    const defaults = record(entry.defaultDrivers);
    const count = entry.informationPointsMin === entry.informationPointsMax ? entry.informationPointsMin : `${entry.informationPointsMin}–${entry.informationPointsMax}`;
    return `${readable(entry.label)}: ${[
      `Input length: ${strings(entry.allowedInputLengths).map(readable).join(" / ") || readable(defaults.inputLength)}`,
      `Information points: ${count ?? defaults.informationPoints ?? "Not specified"}`,
      `Support: ${strings(entry.allowedSupportLevels).map(readable).join(" / ") || readable(defaults.supportLevel)}`,
      defaults.distractorSimilarity !== "notApplicable" ? `Distractors: ${strings(entry.allowedDistractorSimilarities).map(readable).join(" / ") || readable(defaults.distractorSimilarity)}` : "",
    ].filter(Boolean).join(" · ")}`;
  });
  if (prefix === "scoring") return [
    readable(value.displayName) || "Scoring contract", readable(value.scoringType),
    ...["normalization", "partialCredit", "invalidResponse"].map((field) => brief(record(value[field]).summary)),
    ...strings(value.taskSpecificRequirements).slice(0, 2).map(brief),
  ].filter(Boolean);
  if (prefix === "content") {
    const entries = records(source.value);
    const kinds = [...new Set(entries.map((entry) => text(entry.kind)))];
    return [`${entries.length} language entries`, ...kinds.map((kind) => `${CONTENT_KIND_LABELS[kind] ?? "Language content"}: ${entries.filter((entry) => entry.kind === kind).length}`),
      ...entries.slice(0, 3).map((entry) => `${readable(entry.label)}${entry.meaning || entry.pattern ? ` · ${brief(entry.meaning || entry.pattern)}` : ""}`),
      ...(entries.length > 3 ? [`${entries.length - 3} more entries`] : [])];
  }
  if (prefix === "review") return strings(source.value).map((id) => REVIEW_GATE_LABELS[id] ?? "Required human review");
  return [];
}

export function ReviewSourceSummary({ source }: { source: ReviewRuleSource }) {
  const display = useContext(RegistryTextContext);
  const lines = reviewSourceSummary(source, display);
  return <Stack gap={1} mt={2}>{lines.map((line, index) => <Text key={index} fontSize="xs" overflowWrap="anywhere">{line}</Text>)}</Stack>;
}
