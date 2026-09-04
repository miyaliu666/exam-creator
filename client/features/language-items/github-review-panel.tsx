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

import { VersionDiffPanel } from "./version-diff-panel";
import type {
  AiReviewRun,
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
  latestAiReview: AiReviewRun | undefined;
  versionDiff: LanguageItemVersionDiff | undefined;
  versionDiffPending: boolean;
  versionDiffError: Error | null;
  isCreating: boolean;
  isSyncing: boolean;
  isRunningAiReview: boolean;
  isRevising: boolean;
  isExporting: boolean;
  onCreate: () => void;
  onSync: () => void;
  onAiReview: () => void;
  onRevise: () => void;
  onExport: () => void;
}

export function GithubReviewPanel(props: GithubReviewPanelProps) {
  const review = props.item.githubReview;
  const reviewState = review ? REVIEW_STATE[review.state] : undefined;
  const canCreate = props.item.status === "draft" && !review;
  const canRevise =
    !!props.latestVersion &&
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
          <Heading size="lg">GitHub review</Heading>
          <HStack>
            {reviewState ? (
              <Badge colorPalette={reviewState.colorPalette}>{reviewState.label}</Badge>
            ) : (
              <Badge>{props.latestVersion ? "Ready for PR" : "Draft"}</Badge>
            )}
            {props.latestVersion ? (
              <Text color="fg.muted">Version {props.latestVersion.versionNumber}</Text>
            ) : props.item.status === "draft" ? (
              <Text color="fg.muted">A review snapshot is created automatically with the PR</Text>
            ) : null}
          </HStack>
        </Stack>
        <HStack flexWrap="wrap">
          {!review ? (
            <Button
              colorPalette="purple"
              disabled={!canCreate}
              loading={props.isCreating}
              onClick={props.onCreate}
            >
              <GitPullRequest size={16} /> Submit for review & create PR
            </Button>
          ) : (
            <>
              <Button variant="outline" loading={props.isSyncing} onClick={props.onSync}>
                <RefreshCw size={16} /> Sync status
              </Button>
              <Link href={review.pullRequestUrl} target="_blank">
                PR #{review.pullRequestNumber} <ExternalLink size={14} />
              </Link>
            </>
          )}
          <Button
            variant="outline"
            disabled={!props.latestVersion}
            loading={props.isRunningAiReview}
            onClick={props.onAiReview}
          >
            AI pre-review
          </Button>
          <Button
            variant="outline"
            disabled={!canRevise}
            loading={props.isRevising}
            onClick={props.onRevise}
          >
            Create revision draft
          </Button>
          <Button
            colorPalette="teal"
            disabled={!canExport}
            loading={props.isExporting}
            onClick={props.onExport}
          >
            Export to Staging
          </Button>
        </HStack>
      </HStack>

      {!props.latestVersion ? (
        <Text color="fg.warning">Validate the draft before submitting it for review.</Text>
      ) : null}
      {review ? (
        <Box borderWidth="1px" borderRadius="lg" p={4}>
          <HStack justify="space-between" flexWrap="wrap">
            <Text fontWeight="semibold">Review result</Text>
            <Text color="fg.muted" fontSize="sm">
              {review.approvalCount} approvals · {review.changesRequestedCount} change requests
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
      {props.latestAiReview ? (
        <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
          <Box as="summary" cursor="pointer" fontWeight="semibold">
            AI pre-review ({props.latestAiReview.findings.length} findings)
          </Box>
          <Stack mt={3} gap={2}>
            {props.latestAiReview.findings.map((finding) => (
              <Text key={`${finding.code}-${finding.fieldPath}`}>{finding.message}</Text>
            ))}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}
