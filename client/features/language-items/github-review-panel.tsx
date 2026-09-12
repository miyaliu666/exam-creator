import {
  Badge,
  Box,
  Button,
  Heading,
  HStack,
  Link,
  Stack,
  Text,
} from "@chakra-ui/react";
import { ExternalLink, GitPullRequest, RefreshCw } from "lucide-react";
import { useId } from "react";

import { VersionDiffPanel } from "./version-diff-panel";
import type {
  GithubReviewState,
  LanguageItem,
  LanguageItemVersion,
  LanguageItemVersionDiff,
} from "./types";

const REVIEW_STATE: Record<
  GithubReviewState,
  { label: string; colorPalette: string }
> = {
  open: { label: "Awaiting review", colorPalette: "orange" },
  changesRequested: { label: "Changes requested", colorPalette: "red" },
  approved: { label: "Approved, awaiting merge", colorPalette: "green" },
  merged: { label: "Merged", colorPalette: "green" },
  closed: { label: "PR closed", colorPalette: "gray" },
  syncFailed: { label: "Sync failed", colorPalette: "yellow" },
};

interface GithubReviewPanelProps {
  item: LanguageItem;
  latestVersion: LanguageItemVersion | undefined;
  versionDiff: LanguageItemVersionDiff | undefined;
  versionDiffPending: boolean;
  versionDiffError: Error | null;
  isCreating: boolean;
  isSyncing: boolean;
  isRevising: boolean;
  isExporting: boolean;
  canSubmit: boolean;
  submitBlockedReason?: string;
  canManage: boolean;
  workflowLocked?: boolean;
  onCreate: () => void;
  onSync: () => void;
  onRevise: () => void;
  onExport: () => void;
}

export function GithubReviewPanel(props: GithubReviewPanelProps) {
  const submitReasonId = useId();
  const review = props.item.githubReview;
  const reviewState = review ? REVIEW_STATE[review.state] : undefined;
  const canCreate = props.canManage && props.item.recordState === "active" &&
    ["draft", "readyForReview", "rejected"].includes(props.item.status) && !review && props.canSubmit;
  const submitBlockedReason = !props.isCreating && (!canCreate || props.workflowLocked)
    ? props.submitBlockedReason ?? (!props.canManage ? "Only the item owner can submit for review."
      : props.item.recordState !== "active" ? `This item is ${props.item.recordState}.` : undefined)
    : undefined;
  const canRevise =
    props.canManage && props.item.status !== "draft" && !!props.latestVersion &&
    (!review || review.state === "merged" || review.state === "closed");
  const canExport =
    !!props.latestVersion &&
    review?.state === "merged" &&
    review.approvedVersionId === props.latestVersion.id &&
    !props.item.hasStagingExport;

  return (
    <Stack gap={5}>
      <HStack justify="space-between" align="start" flexWrap="wrap">
        <Stack gap={1}>
          <Heading size="lg">Human review</Heading>
          <HStack>
            {reviewState ? (
              <Badge colorPalette={reviewState.colorPalette}>{reviewState.label}</Badge>
            ) : (
              <Badge>{props.latestVersion ? "Ready for PR" : "Draft"}</Badge>
            )}
            {props.latestVersion ? (
              <Text color="fg.muted">Version {props.latestVersion.versionNumber}</Text>
            ) : null}
          </HStack>
        </Stack>
        <HStack flexWrap="wrap">
          {!review ? (
            <Stack gap={2} align="start">
              <Button
                colorPalette="purple"
                disabled={!canCreate || props.workflowLocked || props.isCreating}
                loading={props.isCreating}
                aria-describedby={submitBlockedReason ? submitReasonId : undefined}
                onClick={props.onCreate}
              >
                <GitPullRequest size={16} /> Submit for review
              </Button>
              {submitBlockedReason ? <Text id={submitReasonId} role="status" fontSize="sm" color="fg.muted">{submitBlockedReason}</Text> : null}
            </Stack>
          ) : (
            <>
              <Button variant="outline" disabled={props.workflowLocked} loading={props.isSyncing} onClick={props.onSync}>
                <RefreshCw size={16} /> Sync status
              </Button>
              <Link href={review.pullRequestUrl} target="_blank">
                PR #{review.pullRequestNumber} <ExternalLink size={14} />
              </Link>
            </>
          )}
          {canRevise ? <Button
            variant="outline"
            disabled={!canRevise || props.workflowLocked}
            loading={props.isRevising}
            onClick={props.onRevise}
          >
            Create revision draft
          </Button> : null}
          {canExport ? <Button
            colorPalette="teal"
            disabled={!canExport || props.workflowLocked}
            loading={props.isExporting}
            onClick={props.onExport}
          >
            Export to Staging
          </Button> : null}
        </HStack>
      </HStack>

      {review ? (
        <Box borderWidth="1px" borderRadius="lg" p={4}>
          <HStack justify="space-between" flexWrap="wrap">
            <Text fontWeight="semibold">Review result</Text>
            <Text color="fg.muted" fontSize="sm">
              {review.approvalCount} {review.approvalCount === 1 ? "approval" : "approvals"} ·{" "}
              {review.changesRequestedCount}{" "}
              {review.changesRequestedCount === 1 ? "change request" : "change requests"}
            </Text>
          </HStack>
          {review.syncError ? <Text color="fg.error" mt={2}>{review.syncError}</Text> : null}
        </Box>
      ) : null}

      {props.latestVersion ? (
        <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
          <Box as="summary" cursor="pointer" fontWeight="semibold">Version changes</Box>
          <Box mt={4}>
            <VersionDiffPanel
              diff={props.versionDiff}
              isPending={props.versionDiffPending}
              error={props.versionDiffError}
            />
          </Box>
        </Box>
      ) : null}
    </Stack>
  );
}
