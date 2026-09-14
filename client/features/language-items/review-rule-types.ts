export interface ReviewCustomRule {
  id: string;
  title: string;
  criterion: string;
  requiredEvidence: string[];
  sourceRefs: string[];
  required: boolean;
}

export interface ReviewRuleSet {
  itemRuleId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  sourceFingerprint: string;
  sourceFingerprints: Record<string, string>;
  rules: ReviewCustomRule[];
}

export interface ReviewCheck extends ReviewCustomRule {
  origin: "fixed" | "custom";
  method: "deterministic" | "ai";
}

export interface ReviewPlan {
  planVersion: "1";
  planHash: string;
  sourceFingerprint: string;
  itemRuleId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  checks: ReviewCheck[];
}

export interface ReviewRuleSource { id: string; label: string; value: unknown }

export interface ReviewPlanPreview {
  plan: ReviewPlan;
  sourceFingerprint: string;
  sourceFingerprints: Record<string, string>;
  savedSourceFingerprint: string | null;
  stale: boolean;
  sourceChanges: Array<{ sourceRef: string; label: string; change: "added" | "changed" | "removed" }>;
  sources: ReviewRuleSource[];
}

export interface ReviewRuleSuggestions extends ReviewPlanPreview {
  provider: string;
  model: string;
  promptVersion: string;
  simulated: boolean;
  suggestions: ReviewCustomRule[];
}

export interface ReviewCheckResult {
  checkId: string;
  status: "pass" | "fail" | "insufficientEvidence";
  message: string;
  evidence: Array<{ fieldPath: string; quote: string }>;
  sourceRefs: string[];
}
