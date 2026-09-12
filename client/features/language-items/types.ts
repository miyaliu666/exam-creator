export type LanguageItemStatus =
  | "draft"
  | "readyForReview"
  | "inReview"
  | "needsRevision"
  | "reviewBlocked"
  | "rejected"
  | "approvedForExport"
  | "exportedToStaging";

export type LanguageItemRecordState = "active" | "archived" | "deleted";

export type ReviewDecision = "approved" | "revise" | "rejected" | "blocked";

export interface SingleSelectOption {
  optionId: string;
  text: string | null;
  imageRef: string | null;
}

export interface SingleSelectCandidatePayload {
  stimulus: {
    text: string | null;
    imageRefs: string[];
    audioRef: string | null;
  };
  prompt: string;
  options: SingleSelectOption[];
  shuffleOptions: boolean;
}

export interface MatchingItem {
  itemId: string;
  text: string | null;
  imageRef: string | null;
}

export interface MatchingCandidatePayload {
  stimulus: SingleSelectCandidatePayload["stimulus"];
  prompt: string;
  leftItems: MatchingItem[];
  rightItems: MatchingItem[];
  shuffleRightItems: boolean;
  allowRightItemReuse: boolean;
}

export interface ResponseField {
  responseId: string;
  label: string | null;
  inputType: string;
  maxLength: number | null;
  placeholder: string | null;
}

export interface RestrictedInputCandidatePayload {
  stimulus: SingleSelectCandidatePayload["stimulus"];
  prompt: string;
  responseFields: ResponseField[];
}

export interface FormField {
  fieldId: string;
  label: string;
  inputType: string;
  required: boolean;
  maxLength: number | null;
  placeholder: string | null;
}

export interface FormEntryCandidatePayload {
  situation: string;
  instructions: string;
  sourceProfile: unknown | null;
  fields: FormField[];
}

export interface ContentPoint {
  contentPointId: string;
  description: string;
}

export interface TypedMessageCandidatePayload {
  situation: string;
  instructions: string;
  sourceMessage: string | null;
  sourceMaterialRefs: string[];
  recipient: string;
  purpose: string;
  requiredContentPoints: ContentPoint[];
  lengthGuidance: { countBy: string; minimum: number; maximum: number };
}

export interface SpokenSingleCandidatePayload {
  situation: string;
  instructions: string;
  visiblePromptText: string | null;
  promptAudioRef: string | null;
  sourceMaterialRefs: string[];
  recipient: string | null;
  purpose: string | null;
  preparationTimeSeconds: number;
  responseTimeSeconds: number;
  requiredContentPoints: ContentPoint[];
}

export interface SpokenTurn {
  turnId: string;
  speaker: string;
  promptAudioRef: string | null;
  responseId: string | null;
  responseTimeSeconds: number | null;
  requiredFunctionIds: string[];
}

export interface SpokenMultiturnCandidatePayload {
  situation: string;
  instructions: string;
  roles: { systemRole: string; candidateRole: string };
  interactionMode: string;
  startPathId: string;
  paths: Array<{ pathId: string; turns: SpokenTurn[] }>;
  routingRuleId: string;
}

export type CandidatePayload =
  | SingleSelectCandidatePayload
  | MatchingCandidatePayload
  | RestrictedInputCandidatePayload
  | FormEntryCandidatePayload
  | TypedMessageCandidatePayload
  | SpokenSingleCandidatePayload
  | SpokenMultiturnCandidatePayload;

export interface CandidatePreview {
  taskId: string;
  renderer: TaskPackage["renderer"];
  candidatePayload: CandidatePayload;
  deliveryPolicyRefs: DeliveryPolicyRefs;
}

export interface DifficultyDrivers {
  inputLength: "wordOrPhrase" | "shortSentence" | "twoRelatedPhrases";
  informationPoints: number;
  supportLevel: "high" | "moderate" | "limited";
  distractorSimilarity: "clear" | "moderate" | "close" | "notApplicable";
  outputLength: string;
  interactionTurns: number;
  preparationTimeSeconds: number | null;
  independenceLevel: "highlySupported" | "partlySupported" | "independent";
  inferenceRequired: boolean;
}

export interface EmpiricalDifficulty {
  status: "NotPiloted" | "Piloted";
  sampleId: string | null;
  observedBand: string | null;
  percentCorrect: number | null;
  discrimination: number | null;
  omissionRate: number | null;
  medianResponseTimeSeconds: number | null;
  decision: string | null;
}

export interface DifficultyProfile {
  intendedBand: string;
  status: "AuthorEstimated" | "ExpertEstimated" | "HumanConfirmed" | "Piloted";
  drivers: DifficultyDrivers;
  rationale: string[];
  empiricalDifficulty: EmpiricalDifficulty;
}

export interface DeliveryPolicyRefs {
  navigationPolicyId: string;
  inputPolicyId: string;
  playbackPolicyId: string;
  recordingPolicyId: string;
  speakingRateProfileId: string;
  pauseProfileId: string;
}

export interface ScoringPoint {
  scoringPointId: string;
  description: string;
  points: number;
  normalizationPolicyId?: string;
}

export interface InformationPoint {
  id: string;
  pointType:
    | "date"
    | "time"
    | "location"
    | "price"
    | "quantity"
    | "name"
    | "action"
    | "purpose"
    | "other";
  label: string;
  required: boolean;
  sourceRef?: string;
  scoringPointId?: string;
}

/** Author/reviewer metadata; never part of CandidatePayload or CandidatePreview. */
export interface EnglishTranslation {
  path: string;
  sourceText: string;
  englishText: string;
}

export interface TaskPackage {
  taskId: string;
  taskVersion: string;
  specVersions: {
    planningSpecVersion: string;
    registryBundleVersion: string;
    taskPackageVersion: string;
  };
  blueprintSlotId: string;
  taskFamilyId: string;
  itemFormatId: string;
  renderer: {
    rendererId: string;
    rendererVersion: string;
  };
  candidatePayload: CandidatePayload;
  authoringPackage: { notes: string[]; englishTranslations?: EnglishTranslation[] };
  scoringPackage: {
    itemScoringVersion?: string;
    scoringContractTemplateId: string;
    scoringContractTemplateVersion?: string;
    maxRawScore?: number;
    scoringPoints?: ScoringPoint[];
    answerKeyRef?: string;
    taskSpecificCriteria?: string[];
    benchmarkSetVersion?: string;
    correctOptionId?: string;
    correctMatches?: Record<string, string>;
    acceptedResponses?: Record<string, string[]>;
    rubricId?: string;
  };
  reviewPackage: { gates: Record<string, unknown> };
  mediaRefs: string[];
  deliveryPolicyRefs: DeliveryPolicyRefs;
  content: {
    primaryCanDoId: string;
    primaryReportedSkill: string;
    communicativeActivity: string;
    primaryDomain: string;
    contextId: string;
    difficultyBand: string;
    difficulty?: DifficultyProfile;
    targetContentIds: string[];
    supportingContentRefs?: string[];
    requiredInformationPoints: Array<InformationPoint | string>;
  };
  variation: unknown;
}

export interface LanguageItem {
  id: string;
  title: string;
  ownerEmail: string;
  status: LanguageItemStatus;
  recordState: LanguageItemRecordState;
  recordStateUpdatedAt?: string;
  recordStateUpdatedBy?: string;
  hasStagingExport: boolean;
  githubReview?: GithubReviewLink;
  revision: number;
  draft: TaskPackage;
  latestVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GithubReviewState =
  | "open"
  | "changesRequested"
  | "approved"
  | "merged"
  | "closed"
  | "syncFailed";

export interface GithubReviewLink {
  batchId: string;
  repository: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  baseRef: string;
  headRef: string;
  headSha: string;
  submissionHeadSha?: string;
  repositoryPath: string;
  sourceVersionId: string;
  sourceContentHash: string;
  state: GithubReviewState;
  approvalCount: number;
  changesRequestedCount: number;
  mergeCommitSha?: string;
  approvedVersionId?: string;
  syncError?: string;
  lastSyncedAt: string;
}

export interface GithubReviewBatch {
  batchId: string;
  repository: string;
  pullRequestNumber: number;
  pullRequestUrl: string;
  state: GithubReviewState;
  itemIds: string[];
  approvalCount: number;
  changesRequestedCount: number;
  lastSyncedAt: string;
}

export interface GithubIntegrationStatus {
  enabled: boolean;
  repository: string | null;
  baseBranch: string | null;
  reviewMode: "pullRequest";
  automaticSync: boolean;
}

export interface ValidationIssue {
  severity: string;
  code: string;
  path: string;
  ruleRef: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  registryBundleVersion: string;
  issues: ValidationIssue[];
}

export interface LanguageItemVersion {
  id: string;
  itemId: string;
  versionNumber: number;
  createdFromDraftRevision: number;
  authorEmail: string;
  submittedBy: string;
  frozen: boolean;
  contentHash: string;
  evidenceContentHash?: string;
  lifecycleStatus: string;
  package: TaskPackage;
  validation: ValidationResult;
  createdAt: string;
}

export interface TaskPackageChange {
  path: string;
  partition: "candidate" | "authoring" | "scoring" | "review" | "contract";
  before: unknown | null;
  after: unknown | null;
}

export interface LanguageItemVersionDiff {
  versionId: string;
  baseVersionId: string | null;
  changes: TaskPackageChange[];
  truncated: boolean;
}

export interface AiCandidate {
  id: string;
  ordinal: number;
  status: string;
  candidatePayload: CandidatePayload;
  englishTranslations?: EnglishTranslation[];
  proposedCorrectOptionId?: string;
  proposedScoringPackage?: TaskPackage["scoringPackage"];
  validation: ValidationResult;
}

export interface AiProviderCall {
  requestBody?: unknown;
  requestBodyUnavailableReason?: string;
  candidateOrdinal: number;
  phase: "initial" | "repair";
  elapsedMilliseconds: number;
  outcome: string;
  httpStatus: number | null;
  providerRequestId: string | null;
  providerResponseId: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export interface AiGenerationRun {
  id: string;
  itemId: string;
  provider: string;
  model: string;
  modelVersion: string;
  promptId: string;
  promptVersion: string;
  outputSchemaVersion: string;
  specVersions: TaskPackage["specVersions"];
  blueprintSlotId: string;
  taskFamilyId: string;
  itemFormatId: string;
  rendererId: string;
  primaryCanDoId: string;
  primaryDomain: string;
  contextId: string;
  difficultyBand: string;
  targetContentIds: string[];
  requiredInformationPoints: string[];
  generationSetupSnapshot?: AiGenerationSetupSnapshot;
  requestedCount: number;
  candidates: AiCandidate[];
  adoptedCandidateId: string | null;
  status: string;
  error: string | null;
  idempotencyKey?: string;
  attemptCount: number;
  retryCount: number;
  candidateErrors: string[];
  elapsedMilliseconds?: number | null;
  providerCalls?: AiProviderCall[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface AiGenerationSetupSnapshot {
  specVersions: TaskPackage["specVersions"];
  blueprintSlotId: string;
  taskFamilyId: string;
  itemFormatId: string;
  rendererId: string;
  primaryCanDoId: string;
  primaryDomain: string;
  contextId: string;
  difficultyBand: string;
  difficulty: DifficultyProfile | null;
  targetContentIds: string[];
  supportingContentRefs: string[];
  requiredInformationPoints: InformationPoint[];
}

export interface AiFinding {
  category: string;
  severity: string;
  code: string;
  fieldPath: string;
  ruleRef: string;
  message: string;
}

export interface AiReviewRun {
  id: string;
  versionId: string | null;
  itemId: string;
  draftRevision: number | null;
  contentHash?: string | null;
  provider: string;
  model: string;
  modelVersion: string;
  promptId: string;
  promptVersion: string;
  schemaVersion: string;
  specVersions: TaskPackage["specVersions"];
  findings: AiFinding[];
  status: string;
  error: string | null;
  createdBy: string;
  createdAt: string;
}

export interface LanguageItemReview {
  id: string;
  versionId: string;
  gateId: string;
  decision: ReviewDecision;
  fieldPath: string | null;
  ruleRef: string | null;
  comment: string;
  reviewerEmail: string;
  createdAt: string;
}

export type ReviewDiscussionKind = "discussion" | "changeRequest";
export type ReviewDiscussionStatus = "open" | "addressed" | "resolved";
export type ReviewDiscussionEventKind =
  | "comment"
  | "addressed"
  | "resolved"
  | "reopened";

export interface LanguageItemReviewDiscussionEvent {
  id: string;
  discussionId: string;
  kind: ReviewDiscussionEventKind;
  message: string;
  actorEmail: string;
  createdAt: string;
}

export interface LanguageItemReviewDiscussion {
  id: string;
  itemId: string;
  versionId: string;
  versionNumber: number;
  gateId: string;
  kind: ReviewDiscussionKind;
  subject: string;
  fieldPath: string | null;
  ruleRef: string | null;
  createdBy: string;
  createdAt: string;
  status: ReviewDiscussionStatus;
  events: LanguageItemReviewDiscussionEvent[];
}

export interface LanguageItemExport {
  id: string;
  versionId: string;
  itemId: string;
  target: string;
  artifactId: string;
  legacyExamId?: string;
  legacyQuestionSetId?: string;
  legacyQuestionId?: string;
  optionAnswerIds: Record<string, string>;
  result: string;
  exportedBy: string;
  createdAt: string;
}

export interface LanguageItemAuditEvent {
  id: string;
  itemId: string;
  versionId: string | null;
  action: string;
  actorEmail: string;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface ScoringPolicySummary {
  policyId: string;
  summary: string;
  details: string[];
}

export interface ScoringContractSummary {
  scoringContractTemplateId: string;
  displayName?: string;
  templateVersion: string;
  blueprintSlotId: string;
  itemFormatId: string;
  scoringType: string;
  normalization: ScoringPolicySummary;
  partialCredit: ScoringPolicySummary;
  rubricId: string;
  invalidResponse: ScoringPolicySummary;
  technicalIncident: ScoringPolicySummary;
  adjudication: ScoringPolicySummary;
  raterQualification: ScoringPolicySummary;
  taskSpecificRequirements: string[];
  capOrExclusion?: string;
  status: string;
}

export interface DifficultyDriverDefaults {
  inputLength: "wordOrPhrase" | "shortSentence" | "twoRelatedPhrases";
  informationPoints: number;
  supportLevel: "high" | "moderate" | "limited";
  distractorSimilarity: "clear" | "moderate" | "close" | "notApplicable";
  independenceLevel: "highlySupported" | "partlySupported" | "independent";
  inferenceRequired: boolean;
}

export interface DifficultyBandStandard {
  id: string;
  label: string;
  description: string;
  defaultDrivers: DifficultyDriverDefaults;
  allowedInputLengths: string[];
  informationPointsMin: number;
  informationPointsMax: number;
  allowedSupportLevels: string[];
  allowedDistractorSimilarities: string[];
}

export interface RegistryCapability {
  blueprintSlotId: string;
  title: string;
  taskFamilyId: string;
  itemFormatId: string;
  rendererId: string;
  scoringContractTemplateId: string;
  /** A capability variant always has exactly one primary Can-do. */
  primaryCanDoId: string;
  supportingCanDoIds?: string[];
  primaryReportedSkill: string;
  communicativeActivity: string;
  communicativeActivities?: string[];
  allowedDomains: string[];
  allowedContextIds: string[];
  observableEvidence: string;
  a1Boundary?: string;
  taskFamilyCoreBehavior?: string;
  taskStructure: string;
  prohibitedUses: string[];
  referenceTask: string;
  invalidReferenceTask?: string;
  authoringReadiness?: string;
  stagingReadiness?: string;
  rendererImplementationStatus?: string;
  rendererRequiredWork?: string[];
  deliveryPolicyRefs?: DeliveryPolicyRefs;
}

export interface RegistryContext {
  id: string;
  label: string;
  /** Kept as an array for stored-snapshot compatibility; publication requires one Domain. */
  primaryDomains: string[];
  canDoIds: string[];
  scope: string;
  exclusions: string[];
  retired: boolean;
}

export interface CapabilityDifficultyProfileSet {
  id: string;
  blueprintSlotId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  standards: DifficultyBandStandard[];
}

export interface ContentAssessmentRule {
  blueprintSlotId: string;
  itemFormatId: string;
  primaryCanDoId: string;
  contextId: string;
  applicability: "allowed" | "excluded";
  assessmentMode: "understanding" | "controlledProduction" | "freeProduction" | null;
  communicativePurpose: string;
  requiredEvidence: string[];
  acceptableResponses: string[];
  failurePatterns: string[];
  prerequisites: string[];
  validExamples: string[];
  invalidExamples: string[];
  [key: string]: unknown;
}

export interface ContentIdOption {
  id: string;
  kind: string;
  label: string;
  canDoIds: string[];
  contextIds: string[];
  masteryScope: string | null;
  meaning?: string;
  pattern?: string;
  pinyin?: string;
  englishGloss?: string;
  examples?: string[];
  restrictions?: string;
  sources?: string[];
  notes?: string;
  assessmentRules?: ContentAssessmentRule[];
  /** Retain authored and source metadata when editing a newer or richer snapshot. */
  [key: string]: unknown;
}

export interface RegistrySnapshot {
  settingsSchemaVersion?: number;
  bundleVersion: string;
  status: string;
  limitations: string[];
  sourceFingerprint: string;
  capabilities: RegistryCapability[];
  blueprintSlots?: Array<{
    id: string;
    displayName: string;
    description: string;
    allowedItemFormatIds: string[];
  }>;
  taskFamilyOptions?: Array<{ id: string; displayName: string; blueprintSlotIds?: string[]; allowedItemFormatIds?: string[] }>;
  referenceLabels?: Array<{ id: string; displayName: string; kind: string }>;
  candidateSchemas: unknown[];
  taskPackageSchema: unknown;
  allowedDomains: string[];
  difficultyBands: string[];
  difficultyStandards: DifficultyBandStandard[];
  capabilityDifficultyProfileSets?: CapabilityDifficultyProfileSet[];
  contentIdOptions: ContentIdOption[];
  contextOptions: RegistryContext[];
  canDoOptions: Array<{
    id: string;
    label: string;
    primarySkill?: string | null;
    activity?: string | null;
  }>;
  scoringContracts?: ScoringContractSummary[];
  requiredReviewGateIds: string[];
}

export interface RegistryVersionSummary {
  id: string;
  version: string;
  status: "draft" | "published" | "retired";
  active: boolean;
  revision: number;
  baseVersion: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

export interface RegistryVersionRecord extends RegistryVersionSummary {
  snapshot: RegistrySnapshot;
  publicationWarnings?: string[];
}

export interface RegistryAuditEvent {
  id: string;
  registryVersionId: string;
  action: string;
  actorEmail: string;
  revision: number;
  createdAt: string;
}

export interface RegistryValidationIssue {
  severity: "error" | "warning";
  code: string;
  path: string;
  message: string;
}

export interface RegistryValidationResult {
  valid: boolean;
  issues: RegistryValidationIssue[];
}

export interface RegistryImpact {
  activeVersion: string;
  draftVersion: string;
  draftRevision: number;
  baseVersion: string | null;
  staleBase: boolean;
  additionalChanges: Array<{ label: string; count: number }>;
  itemsPinnedToActiveVersion: number;
  capabilityChanges: number;
  canDoChanges: number;
  contextChanges: number;
  scoringContractChanges: number;
  difficultyStandardChanges: number;
  difficultyConfigurationChanges?: string[];
}

export interface AiProviderStatus {
  provider: string;
  model: string;
  usesRealModel: boolean;
}
