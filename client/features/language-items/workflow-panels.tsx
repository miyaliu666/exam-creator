import {
  Badge,
  Box,
  Button,
  Grid,
  Heading,
  HStack,
  Input,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";

import { AuthorPreview } from "./author-preview";
import { rankAiCandidates } from "./candidate-quality";
import { AiRunTelemetry } from "./ai-run-telemetry";
import { VersionDiffPanel } from "./version-diff-panel";
import {
  REVIEW_DECISION_LABELS,
  REVIEW_GATE_LABELS,
} from "./labels";
import type {
  AiGenerationRun,
  AiReviewRun,
  LanguageItemReview,
  LanguageItemVersion,
  LanguageItemVersionDiff,
  ReviewDecision,
} from "./types";

interface AiCandidatesPanelProps {
  run: AiGenerationRun | undefined;
  isAdopting: boolean;
  canAdopt: boolean;
  setupChanged?: boolean;
  onAdopt: (runId: string, candidateId: string) => void;
}

export function AiCandidatesPanel({
  run,
  isAdopting,
  canAdopt,
  setupChanged = false,
  onAdopt,
}: AiCandidatesPanelProps) {
  const candidates = rankAiCandidates(run?.candidates ?? []);
  return (
    <>
      <Separator />
      <Stack gap={4}>
        <Heading size="lg">Generated drafts</Heading>
        {setupChanged ? <Text role="status" color="fg.warning">These drafts were generated for earlier authoring requirements. Generate new drafts for the current setup.</Text> : null}
        {run && (run.status === "queued" || run.status === "running") ? (
          <Box borderWidth="1px" borderColor="border.info" borderRadius="lg" p={4}>
            <Text color="fg.info" fontWeight="semibold">
              {run.status === "queued" ? "Generation queued" : "Generating independent candidates…"}
            </Text>
            <Text color="fg.muted" fontSize="sm" mt={1}>
              This run is saved. You may continue editing while it finishes.
            </Text>
          </Box>
        ) : null}
        {run?.status === "partial" ? (
          <Box borderWidth="1px" borderColor="border.warning" borderRadius="lg" p={4}>
            <Text color="fg.warning" fontWeight="semibold">Generation partially completed</Text>
            <Text color="fg.muted" fontSize="sm" mt={1}>
              {run.candidates.length}/{run.requestedCount} candidates are available after {run.attemptCount}{" "}
              {run.attemptCount === 1 ? "attempt" : "attempts"}.
            </Text>
          </Box>
        ) : null}
        {run?.error ? (
          <Box borderWidth="1px" borderColor="border.error" borderRadius="lg" p={4}>
            <Text color="fg.error" fontWeight="semibold">
              {run.status === "failed" ? "This AI run failed" : "Some candidate calls failed"}
            </Text>
            <Text color="fg.muted" fontSize="sm" mt={1}>{run.error}</Text>
          </Box>
        ) : null}
        {!run ? (
          <Box borderWidth="1px" borderRadius="lg" p={5}>
            <Text fontWeight="semibold">No candidates yet</Text>
          </Box>
        ) : null}
        {run ? <AiRunTelemetry run={run} /> : null}
        {run && candidates.map(({ candidate, duplicateOfOrdinal, warningCount }) => (
          <Box key={candidate.id} borderWidth="1px" borderRadius="lg" p={4}>
            <Grid
              templateColumns={{ base: "1fr", md: "1fr auto" }}
              gap={4}
              alignItems="center"
            >
              <Stack>
                <HStack>
                  <Badge colorPalette="purple">Option {candidate.ordinal}</Badge>
                  {candidate.status === "adopted" ? <Badge colorPalette="teal">Selected</Badge> : null}
                  {candidate.status === "discarded" ? <Badge>Not selected</Badge> : null}
                  <Badge colorPalette={setupChanged ? "orange" : candidate.validation.valid ? "green" : "red"}>
                    {setupChanged ? "Earlier requirements" : candidate.validation.valid ? "Checks passed" : "Cannot use"}
                  </Badge>
                  {warningCount > 0 ? <Badge colorPalette="orange">{warningCount} validation {warningCount === 1 ? "warning" : "warnings"}</Badge> : null}
                </HStack>
                {duplicateOfOrdinal !== undefined ? (
                  <Text fontSize="sm" color="fg.warning">Same visible content as Option {duplicateOfOrdinal}</Text>
                ) : null}
                <AuthorPreview
                  rendererId={run.rendererId}
                  payload={candidate.candidatePayload}
                  englishTranslations={candidate.englishTranslations}
                  showLegacyHeading={false}
                />
                {candidate.validation.issues.map((issue) => (
                  <Text
                    key={`${issue.code}-${issue.path}`}
                    color={issue.severity === "warning" ? "fg.warning" : "fg.error"}
                    fontSize="sm"
                  >
                    {issue.message}
                  </Text>
                ))}
              </Stack>
              <Button
                colorPalette="purple"
                disabled={
                  !canAdopt ||
                  setupChanged ||
                  !candidate.validation.valid ||
                  candidate.status !== "valid"
                }
                loading={isAdopting}
                onClick={() => onAdopt(run.id, candidate.id)}
              >
                Use this draft
              </Button>
            </Grid>
          </Box>
        ))}
      </Stack>
    </>
  );
}

interface ReviewPanelProps {
  latestVersion: LanguageItemVersion | undefined;
  currentUserEmail: string | undefined;
  requiredGateIds: string[];
  latestDecisions: ReadonlyMap<string, ReviewDecision>;
  latestReviews: ReadonlyMap<string, LanguageItemReview>;
  openChangeRequestCount: number;
  latestAiReview: AiReviewRun | undefined;
  versionDiff: LanguageItemVersionDiff | undefined;
  isVersionDiffPending: boolean;
  versionDiffError: Error | null;
  isRunningAiReview: boolean;
  isReviewing: boolean;
  isRevising: boolean;
  isExporting: boolean;
  onAiReview: () => void;
  onReview: (
    gateId: string,
    decision: ReviewDecision,
    fieldPath: string,
    ruleRef: string,
    comment: string,
  ) => void;
  onRevise: () => void;
  onExport: () => void;
}

export function ReviewPanel(props: ReviewPanelProps) {
  const { latestVersion } = props;
  const [comment, setComment] = useState("");
  const [fieldPath, setFieldPath] = useState("");
  const [ruleRef, setRuleRef] = useState("");
  const approvedCount = props.requiredGateIds.filter(
    (gateId) => props.latestDecisions.get(gateId) === "approved",
  ).length;
  const allApproved =
    props.requiredGateIds.length > 0 &&
    approvedCount === props.requiredGateIds.length;
  const canExport = allApproved && props.openChangeRequestCount === 0;
  return (
    <Stack gap={5}>
        <HStack justify="space-between" flexWrap="wrap">
          <Stack gap={1}>
            <Heading size="lg">Review and export</Heading>
            <Text color="fg.muted">
              {latestVersion
                ? `Version ${latestVersion.versionNumber} · ${approvedCount}/${props.requiredGateIds.length} review areas approved`
                : "Validate the draft and submit it for review first."}
            </Text>
          </Stack>
          <HStack>
            <Button
              variant="outline"
              disabled={
                !latestVersion ||
                props.currentUserEmail !== latestVersion.authorEmail
              }
              onClick={props.onRevise}
              loading={props.isRevising}
            >
              Create revision draft
            </Button>
            <Button
              variant="outline"
              disabled={!latestVersion}
              onClick={props.onAiReview}
              loading={props.isRunningAiReview}
            >
              AI pre-review
            </Button>
            <Button
              colorPalette="teal"
              disabled={!latestVersion || !canExport}
              onClick={props.onExport}
              loading={props.isExporting}
            >
              Export to Staging
            </Button>
          </HStack>
        </HStack>
        {props.isRunningAiReview ? (
          <Text color="fg.info" fontSize="sm">
            AI is working…
          </Text>
        ) : null}
        {latestVersion && !canExport ? (
          <Text color="fg.warning" fontSize="sm">
            Export pending: {approvedCount}/{props.requiredGateIds.length} review areas approved
            {props.openChangeRequestCount > 0
              ? ` · ${props.openChangeRequestCount} open change ${props.openChangeRequestCount === 1 ? "request" : "requests"}`
              : ""}
          </Text>
        ) : null}
        {latestVersion ? (
          <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
            <Box as="summary" cursor="pointer" fontWeight="semibold">
              View changes from the previous version
            </Box>
            <Box mt={4}>
              <VersionDiffPanel
                diff={props.versionDiff}
                isPending={props.isVersionDiffPending}
                error={props.versionDiffError}
              />
            </Box>
          </Box>
        ) : null}
        {props.latestAiReview ? (
          <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
            <Box as="summary" cursor="pointer" fontWeight="semibold">
              View latest AI pre-review ({props.latestAiReview.findings.length}{" "}
              {props.latestAiReview.findings.length === 1 ? "finding" : "findings"})
            </Box>
            <Stack mt={3} gap={2}>
              {props.latestAiReview.findings.map((finding) => (
                <Text key={`${finding.code}-${finding.message}`}>
                  {finding.message}
                </Text>
              ))}
            </Stack>
          </Box>
        ) : null}
        <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
          <Box as="summary" cursor="pointer" fontWeight="semibold">
            Review details
          </Box>
          <HStack mt={3}>
            <Input
              aria-label="Issue field path"
              placeholder="Issue field, e.g. candidatePayload.prompt"
              value={fieldPath}
              onChange={(event) => setFieldPath(event.target.value)}
            />
            <Input
              aria-label="Rule reference"
              placeholder="Rule reference, e.g. registry.context"
              value={ruleRef}
              onChange={(event) => setRuleRef(event.target.value)}
            />
            <Input
              aria-label="Review comment"
              placeholder="Review comment (required unless approving)"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </HStack>
        </Box>
        <Grid templateColumns={{ base: "1fr", md: "repeat(2, 1fr)" }} gap={3}>
          {props.requiredGateIds.map((gateId) => (
            <Box key={gateId} borderWidth="1px" borderRadius="lg" p={4}>
              <HStack justify="space-between">
                <Box>
                  <Text fontWeight="bold">{REVIEW_GATE_LABELS[gateId] ?? gateId}</Text>
                </Box>
                <Badge>
                  {REVIEW_DECISION_LABELS[props.latestDecisions.get(gateId) ?? "pending"]}
                </Badge>
              </HStack>
              {props.latestReviews.get(gateId) ? (
                <Text fontSize="xs" color="fg.muted" mt={1}>
                  Latest decision by {props.latestReviews.get(gateId)?.reviewerEmail}
                </Text>
              ) : null}
              <HStack mt={3} flexWrap="wrap">
                <Button
                  size="sm"
                  colorPalette="green"
                  disabled={!latestVersion}
                  loading={props.isReviewing}
                  onClick={() =>
                    props.onReview(gateId, "approved", fieldPath, ruleRef, comment)
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  colorPalette="orange"
                  variant="outline"
                  disabled={
                    !latestVersion ||
                    !comment.trim()
                  }
                  loading={props.isReviewing}
                  onClick={() =>
                    props.onReview(gateId, "revise", fieldPath, ruleRef, comment)
                  }
                >
                  Request changes
                </Button>
                <Button
                  size="sm"
                  colorPalette="red"
                  variant="outline"
                  disabled={
                    !latestVersion ||
                    !comment.trim()
                  }
                  loading={props.isReviewing}
                  onClick={() =>
                    props.onReview(gateId, "rejected", fieldPath, ruleRef, comment)
                  }
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !latestVersion ||
                    !comment.trim()
                  }
                  loading={props.isReviewing}
                  onClick={() =>
                    props.onReview(gateId, "blocked", fieldPath, ruleRef, comment)
                  }
                >
                  Block
                </Button>
              </HStack>
            </Box>
          ))}
        </Grid>
      </Stack>
  );
}
