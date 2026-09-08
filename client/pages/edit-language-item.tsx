import {
  Badge,
  Box,
  Button,
  Center,
  Field,
  Grid,
  Heading,
  HStack,
  Input,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useContext, useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { AuthContext } from "../contexts/auth";
import {
  adoptAiCandidate,
  exportLanguageItemToStaging,
  createGithubReviewBatch,
  generateAiCandidates,
  getAiGenerationRuns,
  getAiReviews,
  getDraftAiReviews,
  getLanguageItemAiProvider,
  getLanguageItemCandidatePreview,
  getLanguageItem,
  getLanguageItemAudit,
  getLanguageItemExports,
  getLanguageItemRegistry,
  getLanguageItemVersions,
  getLanguageItemVersionDiff,
  reviseLanguageItemVersion,
  runAiReview,
  runDraftAiReview,
  saveLanguageItemDraft,
  syncGithubReviewBatch,
  validateLanguageItem,
} from "../features/language-items/api";
import { CandidateRenderer } from "../features/language-items/renderer-registry";
import { AuthoringPanel } from "../features/language-items/authoring-panel";
import { CapabilityContractPanel } from "../features/language-items/capability-contract-panel";
import { AuditPanel } from "../features/language-items/audit-panel";
import { GithubReviewPanel } from "../features/language-items/github-review-panel";
import { validateAuthoringSetup } from "../features/language-items/setup-validation";
import { AiCandidatesPanel } from "../features/language-items/workflow-panels";
import type {
  LanguageItem,
  TaskPackage,
  ValidationResult,
} from "../features/language-items/types";
import { languageItemsRoute } from "./language-items";
import { rootRoute } from "./root";

type EditorSection = "setup" | "content" | "review" | "history";

const ITEM_STATUS_LABELS = {
  draft: "Draft",
  readyForReview: "Ready for PR",
  inReview: "In review",
  needsRevision: "Changes requested",
  reviewBlocked: "Review blocked",
  rejected: "Rejected",
  approvedForExport: "Approved",
  exportedToStaging: "Approved",
} as const;

function validationIssuesFromError(error: unknown): ValidationResult["issues"] {
  if (!(error instanceof Error)) return [];
  const start = error.message.indexOf("[{");
  if (start < 0) return [];
  try {
    const value = JSON.parse(error.message.slice(start)) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is ValidationResult["issues"][number] =>
        typeof entry === "object" &&
        entry !== null &&
        "path" in entry &&
        "message" in entry &&
        typeof entry.path === "string" &&
        typeof entry.message === "string",
    );
  } catch {
    return [];
  }
}

function editableItemTitle(title: string) {
  return /^(?:Untitled|未命名)\s*[:：]/.test(title.trim()) ? "" : title;
}

function EditLanguageItem() {
  const { id } = useParams({ from: "/language-items/$id" });
  const { user, logout } = useContext(AuthContext)!;
  const navigate = useNavigate();
  const itemQuery = useQuery({
    queryKey: ["language-item", id],
    queryFn: () => getLanguageItem(id),
    enabled: !!user,
    retry: false,
  });

  return (
    <Box minH="100vh" bg="bg" py={10} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button size="sm" variant="outline" colorPalette="teal" onClick={() => navigate({ to: languageItemsRoute.to })}>
          Back to item bank
        </Button>
        <Button size="sm" variant="outline" colorPalette="red" onClick={() => logout()}>
          Sign out / switch account
        </Button>
        <Text fontSize="xs" color="fg.muted">
          Signed in as {user?.email}
        </Text>
      </HStack>
      <Center>
        {itemQuery.isPending ? (
          <Spinner />
        ) : itemQuery.isError ? (
          <Text color="fg.error">{itemQuery.error.message}</Text>
        ) : (
          <WorkbenchEditor key={itemQuery.data.id} item={itemQuery.data} />
        )}
      </Center>
    </Box>
  );
}

function WorkbenchEditor({ item }: { item: LanguageItem }) {
  const queryClient = useQueryClient();
  const { user } = useContext(AuthContext)!;
  const [title, setTitle] = useState(() => editableItemTitle(item.title));
  const [draft, setDraft] = useState<TaskPackage>(() => structuredClone(item.draft));
  const [revision, setRevision] = useState(item.revision);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [candidateCount, setCandidateCount] = useState(3);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<EditorSection>(() =>
    item.status === "draft"
      ? "content"
      : item.status === "exportedToStaging"
        ? "history"
        : "review",
  );
  const [autosaveState, setAutosaveState] = useState<
    "saved" | "waiting" | "saving" | "error"
  >("saved");
  const autosaveTimer = useRef<number | null>(null);
  const revisionRef = useRef(item.revision);
  const draftDirtyRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const canEditDraft = item.status === "draft" && user?.email === item.ownerEmail;

  const registryVersion = item.draft.specVersions.registryBundleVersion;
  const registryQuery = useQuery({
    queryKey: ["language-item-registry", registryVersion],
    queryFn: () => getLanguageItemRegistry(registryVersion),
  });
  const previewQuery = useQuery({
    queryKey: ["language-item-candidate-preview", item.id],
    queryFn: () => getLanguageItemCandidatePreview(item.id),
  });
  const aiProviderQuery = useQuery({
    queryKey: ["language-item-ai-provider"],
    queryFn: getLanguageItemAiProvider,
  });
  const versionsQuery = useQuery({
    queryKey: ["language-item-versions", item.id],
    queryFn: () => getLanguageItemVersions(item.id),
  });
  const runsQuery = useQuery({
    queryKey: ["language-item-ai-runs", item.id],
    queryFn: () => getAiGenerationRuns(item.id),
    refetchInterval: (query) =>
      query.state.data?.some((run) =>
        run.status === "queued" || run.status === "running"
      )
        ? 1_000
        : false,
  });
  const auditQuery = useQuery({
    queryKey: ["language-item-audit", item.id],
    queryFn: () => getLanguageItemAudit(item.id),
  });
  const exportsQuery = useQuery({
    queryKey: ["language-item-exports", item.id],
    queryFn: () => getLanguageItemExports(item.id),
  });
  const latestVersion = versionsQuery.data?.[0];
  const versionDiffQuery = useQuery({
    queryKey: ["language-item-version-diff", latestVersion?.id],
    queryFn: () => getLanguageItemVersionDiff(latestVersion!.id),
    enabled: !!latestVersion,
  });
  const aiReviewsQuery = useQuery({
    queryKey: ["language-item-ai-reviews", latestVersion?.id],
    queryFn: () => getAiReviews(latestVersion!.id),
    enabled: !!latestVersion,
  });
  const draftAiReviewsQuery = useQuery({
    queryKey: ["language-item-draft-ai-reviews", item.id],
    queryFn: () => getDraftAiReviews(item.id),
    enabled: canEditDraft,
  });
  const setupIssues = validateAuthoringSetup(
    title,
    draft,
    registryQuery.data,
  );

  const persist = () => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    const titleSnapshot = title;
    const draftSnapshot = structuredClone(draft);
    draftDirtyRef.current = false;
    const operation = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        const saved = await saveLanguageItemDraft({
          id: item.id,
          expectedRevision: revisionRef.current,
          title: titleSnapshot,
          package: draftSnapshot,
        });
        revisionRef.current = saved.revision;
        setRevision(saved.revision);
        queryClient.setQueryData(["language-item", item.id], saved);
        try {
          const preview = await getLanguageItemCandidatePreview(item.id);
          queryClient.setQueryData(
            ["language-item-candidate-preview", item.id],
            preview,
          );
        } catch {
          await queryClient.invalidateQueries({
            queryKey: ["language-item-candidate-preview", item.id],
          });
        }
        return saved;
      })
      .catch((error) => {
        draftDirtyRef.current = true;
        throw error;
      });
    saveQueue.current = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
  const flushDraft = async () => {
    if (autosaveTimer.current !== null) {
      window.clearTimeout(autosaveTimer.current);
      autosaveTimer.current = null;
    }
    await saveQueue.current;
    return draftDirtyRef.current ? persist() : undefined;
  };
  const refreshItem = async (saved?: LanguageItem) => {
    if (saved) {
      revisionRef.current = saved.revision;
      setRevision(saved.revision);
      queryClient.setQueryData(["language-item", item.id], saved);
    }
    await queryClient.invalidateQueries({ queryKey: ["language-item", item.id] });
    await queryClient.invalidateQueries({
      queryKey: ["language-item-candidate-preview", item.id],
    });
    await queryClient.invalidateQueries({ queryKey: ["language-items"] });
    await queryClient.invalidateQueries({
      queryKey: ["language-item-review-queue"],
    });
    await queryClient.invalidateQueries({
      queryKey: ["language-item-audit", item.id],
    });
  };

  const saveMutation = useMutation({
    mutationFn: flushDraft,
    onSuccess: async (saved) => {
      setAutosaveState("saved");
      setNotice("Draft saved.");
      await refreshItem(saved);
    },
  });
  const validateMutation = useMutation({
    mutationFn: async () => {
      const saved = await flushDraft();
      const result = await validateLanguageItem(item.id);
      return { saved, result };
    },
    onSuccess: async ({ saved, result }) => {
      setValidation(result);
      setNotice(result.valid ? "Validation passed." : "Validation found issues that must be fixed.");
      await refreshItem(saved);
    },
  });
  const generateMutation = useMutation({
    mutationFn: async () => {
      const saved = await flushDraft();
      const run = await generateAiCandidates(item.id, candidateCount);
      return { saved, run };
    },
    onSuccess: async ({ saved, run }) => {
      setNotice(
        run.error
          ? `AI candidate generation failed: ${run.error}`
          : "AI generation queued. You can keep working while candidates are created.",
      );
      setSection("setup");
      await refreshItem(saved);
      await queryClient.invalidateQueries({ queryKey: ["language-item-ai-runs", item.id] });
    },
  });
  const adoptMutation = useMutation({
    mutationFn: async (input: { runId: string; candidateId: string }) => {
      await flushDraft();
      return adoptAiCandidate({
        itemId: item.id,
        runId: input.runId,
        candidateId: input.candidateId,
        expectedRevision: revisionRef.current,
      });
    },
    onSuccess: async (saved) => {
      setDraft(structuredClone(saved.draft));
      setTitle(saved.title);
      setValidation(null);
      setAutosaveState("saved");
      draftDirtyRef.current = false;
      setNotice("Candidate adopted.\nValidate the draft again.");
      setSection("content");
      await refreshItem(saved);
    },
  });
  const aiReviewMutation = useMutation({
    mutationFn: () => runAiReview(latestVersion!.id),
    onSuccess: async (run) => {
      setNotice(
        run.error ??
          run.findings
            .map((finding) => `[${finding.severity}] ${finding.message}`)
            .join("\n"),
      );
      await queryClient.invalidateQueries({ queryKey: ["language-item-ai-reviews", latestVersion?.id] });
    },
  });
  const draftAiReviewMutation = useMutation({
    mutationFn: async () => {
      const saved = await flushDraft();
      const run = await runDraftAiReview(item.id);
      return { saved, run };
    },
    onSuccess: async ({ saved, run }) => {
      setNotice(
        run.error ??
          `AI draft review completed with ${run.findings.length} ${run.findings.length === 1 ? "finding" : "findings"}.`,
      );
      await refreshItem(saved);
      await queryClient.invalidateQueries({
        queryKey: ["language-item-draft-ai-reviews", item.id],
      });
    },
  });
  const createGithubReviewMutation = useMutation({
    mutationFn: async () => {
      await flushDraft();
      const result = await validateLanguageItem(item.id);
      setValidation(result);
      if (!result.valid) {
        throw new Error("Validation failed. Fix the required content before creating a review PR.");
      }
      return createGithubReviewBatch({ itemIds: [item.id] });
    },
    onSuccess: async (batch) => {
      setNotice(`Review PR #${batch.pullRequestNumber} created.`);
      await refreshItem();
      window.open(batch.pullRequestUrl, "_blank", "noopener,noreferrer");
    },
  });
  const syncGithubReviewMutation = useMutation({
    mutationFn: () => syncGithubReviewBatch(item.githubReview!.batchId),
    onSuccess: async (batch) => {
      const labels = {
        open: "Awaiting review",
        changesRequested: "Changes requested",
        approved: "Approved, awaiting merge",
        merged: "Merged",
        closed: "PR closed",
        syncFailed: "Sync failed",
      } as const;
      setNotice(`GitHub status synced: ${labels[batch.state]}`);
      await refreshItem();
      await queryClient.invalidateQueries({ queryKey: ["language-item-versions", item.id] });
    },
  });
  const reviseMutation = useMutation({
    mutationFn: async () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      await saveQueue.current;
      return reviseLanguageItemVersion({
        versionId: latestVersion!.id,
        expectedRevision: revisionRef.current,
      });
    },
    onSuccess: async (saved) => {
      revisionRef.current = saved.revision;
      setRevision(saved.revision);
      setDraft(structuredClone(saved.draft));
      setTitle(saved.title);
      setValidation(null);
      setAutosaveState("saved");
      draftDirtyRef.current = false;
      setNotice("A new revision draft was created from the reviewed version.");
      setSection("content");
      await refreshItem(saved);
    },
  });
  const exportMutation = useMutation({
    mutationFn: () => exportLanguageItemToStaging(latestVersion!.id),
    onSuccess: async () => {
      setNotice("Exported to Staging.");
      setSection("history");
      await refreshItem();
      await queryClient.invalidateQueries({
        queryKey: ["language-item-exports", item.id],
      });
    },
  });

  const updateDraft = (mutate: (next: TaskPackage) => void) => {
    setValidation(null);
    draftDirtyRef.current = true;
    setDraft((current) => {
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  };
  useEffect(() => {
    // React Strict Mode replays mount effects in development. Dirty state is
    // the authoritative signal so merely opening a draft never creates a new revision.
    if (!draftDirtyRef.current) return;
    setAutosaveState("waiting");
    autosaveTimer.current = window.setTimeout(async () => {
      setAutosaveState("saving");
      try {
        await persist();
        setAutosaveState("saved");
      } catch {
        setAutosaveState("error");
      }
    }, 1200);
    return () => {
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
      }
    };
  }, [title, draft]);
  const error = [saveMutation, validateMutation, generateMutation, adoptMutation, draftAiReviewMutation, aiReviewMutation, createGithubReviewMutation, syncGithubReviewMutation, reviseMutation, exportMutation]
    .find((mutation) => mutation.isError)?.error;
  const errorValidationIssues = validationIssuesFromError(error);
  const visibleValidationIssues = validation?.issues ?? errorValidationIssues;
  const autosaveLabel = {
    saved: "Saved",
    waiting: "Waiting to autosave",
    saving: "Saving",
    error: "Save failed",
  }[autosaveState];
  const previewUsesSavedRoundTrip =
    autosaveState === "saved" &&
    !draftDirtyRef.current &&
    !previewQuery.isFetching &&
    !!previewQuery.data;
  const previewRendererId = previewUsesSavedRoundTrip
    ? previewQuery.data.renderer.rendererId
    : draft.renderer.rendererId;
  const previewPayload = previewUsesSavedRoundTrip
    ? previewQuery.data.candidatePayload
    : draft.candidatePayload;

  return (
    <Stack w="full" maxW="7xl" gap={7}>
      <Box pt={5}>
        <HStack justify="space-between" align="start" flexWrap="wrap">
          <Stack gap={2} w="full">
            {canEditDraft ? (
              <Field.Root invalid={!!setupIssues.find((issue) => issue.path === "title")}>
                <Field.Label>Item title</Field.Label>
                <Input
                  value={title}
                  placeholder="Item title"
                  fontSize="xl"
                  onChange={(event) => {
                    setValidation(null);
                    draftDirtyRef.current = true;
                    setTitle(event.target.value);
                  }}
                />
                <Field.ErrorText>{setupIssues.find((issue) => issue.path === "title")?.message}</Field.ErrorText>
              </Field.Root>
            ) : <Heading size="2xl">{title || "Untitled item"}</Heading>}
            <HStack flexWrap="wrap">
              <Badge>{ITEM_STATUS_LABELS[item.status]}</Badge>
              {item.hasStagingExport || item.status === "exportedToStaging" ? (
                <Badge colorPalette="teal">Exported to Staging</Badge>
              ) : null}
              <Text color="fg.muted">
                Revision {revision} · Owner {item.ownerEmail} · {autosaveLabel}
              </Text>
            </HStack>
          </Stack>
        </HStack>
        {notice ? <Text whiteSpace="pre-wrap" mt={3} color="fg.info">{notice}</Text> : null}
        {error ? (
          <Box mt={3} borderWidth="1px" borderRadius="lg" p={3} borderColor="red.300" bg="red.subtle">
            <Text color="fg.error" fontWeight="semibold">Action failed</Text>
            {errorValidationIssues.length > 0 ? (
              errorValidationIssues.map((issue) => (
                <Text key={`${issue.code}-${issue.path}`} mt={1} color="fg.error" fontSize="sm">
                  {issue.path}: {issue.message}
                </Text>
              ))
            ) : (
              <Text mt={1} color="fg.error" fontSize="sm">{error.message}</Text>
            )}
          </Box>
        ) : null}
      </Box>

      {registryQuery.data ? <CapabilityContractPanel draft={draft} registry={registryQuery.data} /> : null}

      <HStack borderBottomWidth="1px" flexWrap="wrap" gap={1}>
          <Button
            size="sm"
            variant="ghost"
            borderRadius="0"
            borderBottomWidth="3px"
            borderBottomColor={section === "content" ? "purple.solid" : "transparent"}
            onClick={() => setSection("content")}
          >
            Edit &amp; Preview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            borderRadius="0"
            borderBottomWidth="3px"
            borderBottomColor={section === "setup" ? "teal.solid" : "transparent"}
            onClick={() => setSection("setup")}
          >
            Language targets &amp; AI
          </Button>
          <Button
            size="sm"
            variant="ghost"
            borderRadius="0"
            borderBottomWidth="3px"
            borderBottomColor={section === "review" ? "orange.solid" : "transparent"}
            onClick={() => setSection("review")}
          >
            Validate &amp; Review
          </Button>
          <Button
            size="sm"
            variant="ghost"
            borderRadius="0"
            borderBottomWidth="3px"
            borderBottomColor={section === "history" ? "gray.solid" : "transparent"}
            onClick={() => setSection("history")}
          >
            History &amp; Delivery
          </Button>
      </HStack>

      {section === "setup" ? (
        <Grid
          templateColumns={{
            base: "1fr",
            lg: "minmax(0, 1fr) minmax(360px, 0.8fr)",
          }}
          gap={7}
        >
          <AuthoringPanel
            mode="setup"
            draft={draft}
            registry={registryQuery.data}
            updateDraft={updateDraft}
            readOnly={!canEditDraft}
            setupIssues={setupIssues}
          />
          <Stack gap={4} borderWidth="1px" borderRadius="xl" p={6} alignSelf="start">
            <HStack justify="space-between" flexWrap="wrap">
              <HStack>
                <Heading size="lg">AI generation</Heading>
                <Badge colorPalette="purple">
                  {aiProviderQuery.isPending
                    ? "Loading"
                    : aiProviderQuery.data?.usesRealModel
                      ? aiProviderQuery.data.model
                      : aiProviderQuery.isError
                        ? "Unavailable"
                        : "Offline simulator"}
                </Badge>
              </HStack>
              <HStack>
                <Input
                  aria-label="Number of candidates"
                  type="number"
                  min={1}
                  max={5}
                  w="64px"
                  value={candidateCount}
                  onChange={(event) =>
                    setCandidateCount(
                      Math.max(1, Math.min(5, Number(event.target.value) || 1)),
                    )
                  }
                />
                <Button
                  disabled={
                    !canEditDraft ||
                    autosaveState === "saving" ||
                    setupIssues.length > 0
                  }
                  colorPalette="purple"
                  onClick={() => generateMutation.mutate()}
                  loading={generateMutation.isPending}
                >
                  Generate with AI
                </Button>
              </HStack>
            </HStack>
            {setupIssues.length > 0 ? (
              <Text color="fg.warning" fontSize="sm">
                {setupIssues.map((issue) => issue.message).join(" · ")}
              </Text>
            ) : null}
            {generateMutation.isPending ? (
              <Text color="fg.info" fontSize="sm">AI is working…</Text>
            ) : null}
            <AiCandidatesPanel
              run={runsQuery.data?.[0]}
              isAdopting={adoptMutation.isPending}
              canAdopt={canEditDraft}
              onAdopt={(runId, candidateId) =>
                adoptMutation.mutate({ runId, candidateId })
              }
            />
          </Stack>
        </Grid>
      ) : null}

      {section === "content" ? (
        <Stack gap={6}>
          <HStack justify="space-between" align="start" flexWrap="wrap" gap={3}>
            <Button variant="outline" onClick={() => setSection("setup")}>
              Language targets &amp; AI
            </Button>
            <HStack flexWrap="wrap">
              <Button
                disabled={!canEditDraft || autosaveState === "saving"}
                variant="outline"
                onClick={() => draftAiReviewMutation.mutate()}
                loading={draftAiReviewMutation.isPending}
              >
                AI pre-review
              </Button>
              <Button
                disabled={!canEditDraft || autosaveState === "saving"}
                onClick={() => saveMutation.mutate()}
                loading={saveMutation.isPending}
              >
                Save now
              </Button>
              <Button
                disabled={!canEditDraft || autosaveState === "saving"}
                variant="outline"
                onClick={() => validateMutation.mutate()}
                loading={validateMutation.isPending}
              >
                Save & validate
              </Button>
              <Button
                disabled={
                  !canEditDraft ||
                  autosaveState === "saving" ||
                  setupIssues.length > 0
                }
                colorPalette="purple"
                onClick={() => createGithubReviewMutation.mutate()}
                loading={createGithubReviewMutation.isPending}
              >
                Submit for review & create PR
              </Button>
            </HStack>
          </HStack>
          {setupIssues.filter((issue) => issue.path !== "title").length > 0 ? (
            <Text color="fg.warning" fontSize="sm">
              {setupIssues.filter((issue) => issue.path !== "title").map((issue) => issue.message).join(" · ")}
            </Text>
          ) : null}
          <Grid
            templateColumns={{
              base: "1fr",
              lg: "minmax(0, 1fr) minmax(360px, 0.8fr)",
            }}
            gap={7}
          >
            <AuthoringPanel
              mode="content"
              draft={draft}
              registry={registryQuery.data}
              updateDraft={updateDraft}
              readOnly={!canEditDraft}
              validationIssues={visibleValidationIssues}
            />
            <Stack gap={6}>
              <Box>
                <HStack justify="space-between" align="start" mb={2} flexWrap="wrap">
                  <Box>
                    <Heading size="lg">Candidate preview</Heading>
                  </Box>
                  <Badge colorPalette={previewUsesSavedRoundTrip ? "teal" : "orange"}>
                    {previewUsesSavedRoundTrip ? "Saved preview" : "Live preview"}
                  </Badge>
                </HStack>
                <CandidateRenderer
                  rendererId={previewRendererId}
                  payload={previewPayload}
                />
              </Box>
              {validation ? (
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                  <Heading size="md">
                    Validation: {validation.valid ? "Passed" : "Failed"}
                  </Heading>
                  {validation.issues.length === 0 ? (
                    <Text color="fg.success" mt={2}>Ready to submit for review</Text>
                  ) : null}
                  {validation.issues.map((issue) => (
                    <Text
                      key={`${issue.code}-${issue.path}`}
                      color={issue.severity === "warning" ? "fg.warning" : "fg.error"}
                      mt={2}
                    >
                      {issue.message}
                    </Text>
                  ))}
                </Box>
              ) : (
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                  <Text fontWeight="semibold">Not validated</Text>
                </Box>
              )}
              {draftAiReviewMutation.isPending ? (
                <Text color="fg.info" fontSize="sm">AI is working…</Text>
              ) : null}
              {draftAiReviewsQuery.data?.[0] ? (
                <Box borderWidth="1px" borderRadius="lg" p={4}>
                  <Heading size="md">AI pre-review</Heading>
                  {draftAiReviewsQuery.data[0].findings.map((finding) => (
                    <Text key={`${finding.code}-${finding.fieldPath}`} mt={2}>
                      {finding.message}
                    </Text>
                  ))}
                </Box>
              ) : null}
            </Stack>
          </Grid>
        </Stack>
      ) : null}

      {section === "review" ? (
        <Stack gap={7}>
          <GithubReviewPanel
            item={item}
            latestVersion={latestVersion}
            latestAiReview={aiReviewsQuery.data?.[0]}
            versionDiff={versionDiffQuery.data}
            versionDiffPending={versionDiffQuery.isPending}
            versionDiffError={versionDiffQuery.error}
            isCreating={createGithubReviewMutation.isPending}
            isSyncing={syncGithubReviewMutation.isPending}
            isRunningAiReview={aiReviewMutation.isPending}
            isRevising={reviseMutation.isPending}
            isExporting={exportMutation.isPending}
            onCreate={() => createGithubReviewMutation.mutate()}
            onSync={() => syncGithubReviewMutation.mutate()}
            onAiReview={() => aiReviewMutation.mutate()}
            onRevise={() => reviseMutation.mutate()}
            onExport={() => exportMutation.mutate()}
          />
        </Stack>
      ) : null}

      {section === "history" ? (
        <AuditPanel
          events={auditQuery.data ?? []}
          exports={exportsQuery.data ?? []}
        />
      ) : null}
    </Stack>
  );
}

export const editLanguageItemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/$id",
  component: () => (
    <ProtectedRoute>
      <EditLanguageItem />
    </ProtectedRoute>
  ),
});
