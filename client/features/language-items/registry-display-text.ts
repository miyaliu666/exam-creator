import legacyTranslations from "./registry-legacy-translations.json";

const DISPLAY_TEXT: Record<string, string> = {
  wordOrPhrase: "Word or phrase",
  shortSentence: "Short sentence",
  twoRelatedPhrases: "Two related phrases",
  high: "High",
  moderate: "Moderate",
  limited: "Limited",
  clear: "Clearly different",
  close: "Closely similar",
  notApplicable: "Not applicable",
  highlySupported: "Highly supported",
  partlySupported: "Partly supported",
  independent: "Independent",
  receptive: "Receptive",
  productive: "Productive",
  receptiveProductive: "Receptive and productive",
  objective: "Automatic scoring",
  objectiveFields: "Automatic field-by-field scoring",
  fieldCriteria: "Field-by-field scoring",
  analyticRubric: "Analytic rubric",
  ProvisionalWorkbenchUse: "Provisional",
  StructureReadyEvidencePending: "Evidence pending",
  NotScoredTechnical: "Not scored due to a technical issue",
  ScoringHold: "Scoring on hold",
  Inconclusive: "Insufficient evidence for a result",
  scoreActualEvidence: "Score the evidence present",
};

const SCORING_FIELD_LABELS: Record<string, string> = {
  blank: "Blank response",
  invalidId: "Invalid answer",
  multipleWhenSingle: "Multiple answers when only one is allowed",
  technicalFailure: "Technical failure",
  completelyOffTopic: "Completely off-topic response",
  noScorableLanguage: "No scorable language",
  shortButRelevant: "Short but relevant response",
};

export function registryDisplayText(value: string): string {
  if (Object.hasOwn(DISPLAY_TEXT, value)) return DISPLAY_TEXT[value];
  // Published snapshots retain their original text; translate only known legacy copy for display.
  const translations: Record<string, string> = legacyTranslations;
  const key = value.trim();
  const translated = Object.hasOwn(translations, key) ? translations[key] : value;
  return translated
    .replace(/\b(blank|invalidId|multipleWhenSingle|technicalFailure|completelyOffTopic|noScorableLanguage|shortButRelevant)(?=\s*:)/g, (field) => SCORING_FIELD_LABELS[field])
    .replace(/\b(NotScoredTechnical|ScoringHold|Inconclusive|scoreActualEvidence)\b/g, (status) => DISPLAY_TEXT[status]);
}
