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
import { createRoute, useBlocker, useNavigate, useParams } from "@tanstack/react-router";
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
import { AuthorPreview } from "../features/language-items/author-preview";
import { aiGenerationMatchesSetup } from "../features/language-items/ai-generation-setup";
import { updateEnglishTranslation } from "../features/language-items/english-translations";
import { AuthoringPanel } from "../features/language-items/authoring-panel";
import { ItemSetupPanel } from "../features/language-items/item-setup-panel";
import { applyItemSetup } from "../features/language-items/item-setup";
import { AuditPanel } from "../features/language-items/audit-panel";
import { GithubReviewPanel } from "../features/language-items/github-review-panel";
import { AuthoringStepNavigation } from "../features/language-items/authoring-step-navigation";
import { DraftCheckPanel } from "../features/language-items/draft-check-panel";
import { canSubmitDraft, initialEditorSection, type EditorSection } from "../features/language-items/authoring-workflow";
import { ScoringContractPanel } from "../features/language-items/scoring-contract-panel";
import { validateAuthoringSetup } from "../features/language-items/setup-validation";
import { AiCandidatesPanel } from "../features/language-items/workflow-panels";
import type {
  LanguageItem,
  TaskPackage,
  ValidationResult,
} from "../features/language-items/types";
import { languageItemsRoute } from "./language-items";
import { rootRoute } from "./root";

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
  const confirmLeave = useRef(() => true);
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
        <Button size="sm" variant="outline" colorPalette="red" onClick={() => { if (confirmLeave.current()) logout(); }}>
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
          <WorkbenchEditor key={itemQuery.data.id} item={itemQuery.data} confirmLeave={confirmLeave} />
        )}
      </Center>
    </Box>
  );
}

function WorkbenchEditor({ item, confirmLeave }: { item: LanguageItem; confirmLeave: { current: () => boolean } }) {
  const queryClient = useQueryClient();
  const { user } = useContext(AuthContext)!;
  const [title, setTitle] = useState(() => editableItemTitle(item.title));
  const [draft, setDraft] = useState<TaskPackage>(() => structuredClone(item.draft));
  const [revision, setRevision] = useState(item.revision);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [candidateCount, setCandidateCount] = useState(3);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<EditorSection>(() => initialEditorSection(item.status, item.draft.candidatePayload));
  const [autosaveState, setAutosaveState] = useState<
    "saved" | "waiting" | "saving" | "error"
  >("saved");
  const autosaveTimer = useRef<number | null>(null);
  const revisionRef = useRef(item.revision);
  const draftDirtyRef = useRef(false);
  const draftChangeRef = useRef(0);
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
    setAutosaveState("saving");
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
        setAutosaveState(draftDirtyRef.current ? "waiting" : "saved");
        return saved;
      })
      .catch((error) => {
        draftDirtyRef.current = true;
        setAutosaveState("error");
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
      const change = draftChangeRef.current;
      const saved = await flushDraft();
      const result = await validateLanguageItem(item.id);
      return { saved, result, change };
    },
    onSuccess: async ({ saved, result, change }) => {
      if (change === draftChangeRef.current) {
        setValidation(result);
        setNotice(null);
      } else {
        setValidation(null);
        setNotice("The item changed during checking. Check the latest draft again.");
      }
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
      draftChangeRef.current += 1;
      setNotice("Draft selected. Edit it, then check the item before submitting.");
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
      if (canEditDraft) {
        await flushDraft();
        const result = await validateLanguageItem(item.id);
        setValidation(result);
        if (!result.valid) {
          throw new Error("Checks failed. Fix the required content before submitting for review.");
        }
      }
      return createGithubReviewBatch({ itemIds: [item.id] });
    },
    onSuccess: async (batch) => {
      setNotice(`Review PR #${batch.pullRequestNumber} created.`);
      setSection("review");
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
      setSection("review");
      await refreshItem();
      await queryClient.invalidateQueries({
        queryKey: ["language-item-exports", item.id],
      });
    },
  });

  const updateDraft = (mutate: (next: TaskPackage) => void) => {
    setValidation(null);
    draftChangeRef.current += 1;
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
        setAutosaveState(draftDirtyRef.current ? "waiting" : "saved");
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
  const previewEnglishTranslations = previewUsesSavedRoundTrip
    ? item.draft.authoringPackage.englishTranslations
    : draft.authoringPackage.englishTranslations;

  const submitting = createGithubReviewMutation.isPending;
  const hasUnsavedChanges = canEditDraft && (draftDirtyRef.current || autosaveState !== "saved");
  const mayLeave = () => !submitting && (!hasUnsavedChanges || window.confirm("Your latest changes have not been saved yet. Leave and discard those changes?"));
  useBlocker({ shouldBlockFn: () => !mayLeave(), enableBeforeUnload: hasUnsavedChanges || submitting, disabled: !hasUnsavedChanges && !submitting });
  useEffect(() => {
    confirmLeave.current = mayLeave;
    return () => { confirmLeave.current = () => true; };
  });
  const hasActiveRun = runsQuery.data?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const latestRun = runsQuery.data?.[0];
  const generationSetupChanged = !!latestRun && !aiGenerationMatchesSetup(latestRun, draft);
  const checkForReview = () => {
    setSection("review");
    validateMutation.mutate();
  };
  const submitReady = canEditDraft && canSubmitDraft(validation, setupIssues.length,
    submitting || validateMutation.isPending || autosaveState === "saving" || autosaveState === "error");
  const frozenSubmissionReady = user?.email === item.ownerEmail && !submitting &&
    ["readyForReview", "rejected"].includes(item.status) && latestVersion?.validation.valid === true;

  return (
    <Stack w="full" maxW="7xl" gap={6}>
      <Box pt={5}>
        <Stack gap={2}>
          {canEditDraft ? (
            <Field.Root>
              <Field.Label>Item title</Field.Label>
              <Input aria-label="Item title" value={title} placeholder="Internal name for the item bank. Candidates do not see this title."
                fontSize="xl" disabled={submitting}
                onChange={(event) => {
                  setValidation(null);
                  draftDirtyRef.current = true;
                  draftChangeRef.current += 1;
                  setTitle(event.target.value);
                }} />
            </Field.Root>
          ) : <Heading size="2xl">{title || "Untitled item"}</Heading>}
          <HStack flexWrap="wrap" gap={3}>
            <Badge>{ITEM_STATUS_LABELS[item.status]}</Badge>
            {item.hasStagingExport || item.status === "exportedToStaging" ? <Badge colorPalette="teal">Exported to Staging</Badge> : null}
            {canEditDraft ? <Text role="status" fontSize="sm" color={autosaveState === "error" ? "fg.error" : "fg.muted"}>{autosaveLabel}</Text> : null}
            {canEditDraft && autosaveState === "error" ? <Button size="xs" variant="outline" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Retry save</Button> : null}
          </HStack>
        </Stack>
        {notice ? <Text role="status" whiteSpace="pre-wrap" mt={3} color="fg.info">{notice}</Text> : null}
        {error ? <Box role="alert" mt={3} borderWidth="1px" borderRadius="lg" p={3} borderColor="border.error">
          <Text color="fg.error">{errorValidationIssues.length ? "Fix the highlighted item fields and try again." : error.message}</Text>
        </Box> : null}
      </Box>

      {registryQuery.data ? <ItemSetupPanel draft={draft} registry={registryQuery.data}
        canEdit={canEditDraft && !submitting && !hasActiveRun && !adoptMutation.isPending && !generateMutation.isPending && !validateMutation.isPending}
        onApply={(selection) => {
          updateDraft((next) => applyItemSetup(next, selection, registryQuery.data!));
          setNotice("Item setup updated. Review your preserved language targets, key information, item text, and answers, then run checks again.");
          setSection("setup");
        }} /> : <Text color={registryQuery.isError ? "fg.error" : "fg.muted"}>{registryQuery.isError ? "Item settings could not be loaded. Refresh to retry." : "Loading item settings…"}</Text>}

      <AuthoringStepNavigation section={section} onChange={setSection} />

      {section === "setup" ? (
        <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(320px, 0.75fr)" }} gap={6}>
          <AuthoringPanel mode="setup" draft={draft} registry={registryQuery.data} updateDraft={updateDraft}
            readOnly={!canEditDraft || submitting} setupIssues={setupIssues} />
          {canEditDraft ? <Stack gap={4} borderWidth="1px" borderRadius="xl" p={5} alignSelf="start">
            <Heading size="md">Create a first draft</Heading>
            {setupIssues.length ? <Box fontSize="sm">
              <Text fontWeight="medium" mb={2}>Complete before continuing</Text>
              <Stack gap={1}>{[...new Set(setupIssues.map((issue) => issue.message))].map((message) => <Text key={message}>· {message}</Text>)}</Stack>
            </Box> : null}
            <Text fontSize="xs" color="fg.muted">
              {aiProviderQuery.isPending ? "Loading AI provider…" : aiProviderQuery.isError ? "AI is unavailable. You can write the item yourself."
                : aiProviderQuery.data?.usesRealModel ? aiProviderQuery.data.model : "Offline simulator · sample content"}
            </Text>
            <Field.Root maxW="180px">
              <Field.Label>Draft options (1–5)</Field.Label>
              <Input aria-label="Draft options" type="number" min={1} max={5} value={candidateCount}
                disabled={!canEditDraft || hasActiveRun || generateMutation.isPending}
                onChange={(event) => setCandidateCount(Math.max(1, Math.min(5, Number(event.target.value) || 1)))} />
            </Field.Root>
            <Button colorPalette="teal" disabled={!canEditDraft || submitting || hasActiveRun || setupIssues.length > 0 || !aiProviderQuery.data || autosaveState === "saving" || autosaveState === "error"}
              loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              {hasActiveRun ? "Generating drafts…" : "Generate drafts"}
            </Button>
            <Button variant="outline" disabled={setupIssues.length > 0 || submitting} onClick={() => setSection("content")}>
              {canEditDraft ? "Write it myself" : "View item"}
            </Button>
            {runsQuery.isError ? <Text color="fg.error" fontSize="sm">Generated drafts could not be loaded. Refresh to retry.</Text> : null}
            {latestRun ? <AiCandidatesPanel run={latestRun} isAdopting={adoptMutation.isPending} setupChanged={generationSetupChanged}
              canAdopt={canEditDraft && !submitting && !generationSetupChanged && setupIssues.length === 0} onAdopt={(runId, candidateId) => adoptMutation.mutate({ runId, candidateId })} /> : null}
          </Stack> : <Button variant="outline" onClick={() => setSection("content")}>View item</Button>}
        </Grid>
      ) : null}

      {section === "content" ? (
        <Stack gap={5}>
          {canEditDraft ? <HStack justify="flex-end" flexWrap="wrap">
            <Button colorPalette="teal" onClick={checkForReview}
              disabled={submitting || autosaveState === "error"} loading={validateMutation.isPending}>Check & continue</Button>
          </HStack> : null}
          {canEditDraft && setupIssues.length ? <HStack borderWidth="1px" borderRadius="lg" p={3} justify="space-between" flexWrap="wrap">
            <Text fontSize="sm">Complete the remaining requirements in Prepare before submitting.</Text>
            <Button size="sm" variant="outline" onClick={() => setSection("setup")}>Complete requirements</Button>
          </HStack> : null}
          <Grid templateColumns={{ base: "1fr", lg: "minmax(0, 1fr) minmax(340px, 0.8fr)" }} gap={6}>
            <AuthoringPanel mode="content" draft={draft} registry={registryQuery.data} updateDraft={updateDraft}
              readOnly={!canEditDraft || submitting} validationIssues={visibleValidationIssues} />
            <Stack gap={4} alignSelf="start">
              {!previewUsesSavedRoundTrip ? <Text fontSize="xs" color="fg.muted">Previewing your latest edits.</Text> : null}
              <AuthorPreview rendererId={previewRendererId} payload={previewPayload}
                englishTranslations={previewEnglishTranslations}
                onTranslationChange={canEditDraft && !submitting ? (path, englishText) => updateDraft((next) => {
                  next.authoringPackage.englishTranslations = updateEnglishTranslation(next.candidatePayload, next.authoringPackage.englishTranslations, path, englishText);
                }) : undefined} />
              <ScoringContractPanel draft={draft} registry={registryQuery.data} />
            </Stack>
          </Grid>
        </Stack>
      ) : null}

      {section === "review" ? <Stack gap={5}>
        <AuthorPreview rendererId={previewRendererId} payload={previewPayload}
          englishTranslations={previewEnglishTranslations} />
        {canEditDraft ? <>
          <DraftCheckPanel validation={validation} setupIssues={setupIssues} checking={validateMutation.isPending}
            onCheck={() => validateMutation.mutate()} onEdit={setSection} />
          <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
            <Text as="summary" cursor="pointer" fontSize="sm">AI feedback (optional)</Text>
            <Stack mt={3} gap={3}>
              <Text fontSize="sm" color="fg.muted">An advisory check of wording and task quality. Human review is still required.</Text>
              <Button alignSelf="start" variant="outline" disabled={!submitReady}
                loading={draftAiReviewMutation.isPending} onClick={() => draftAiReviewMutation.mutate()}>Get AI feedback</Button>
              {draftAiReviewsQuery.data?.[0]?.findings.map((finding) => <Text key={finding.code + finding.fieldPath} fontSize="sm">{finding.message}</Text>)}
            </Stack>
          </Box>
        </> : null}
        <GithubReviewPanel item={item} latestVersion={latestVersion} latestAiReview={aiReviewsQuery.data?.[0]}
          versionDiff={versionDiffQuery.data} versionDiffPending={versionDiffQuery.isPending} versionDiffError={versionDiffQuery.error}
          isCreating={submitting} isSyncing={syncGithubReviewMutation.isPending} isRunningAiReview={aiReviewMutation.isPending}
          isRevising={reviseMutation.isPending} isExporting={exportMutation.isPending} canSubmit={submitReady || frozenSubmissionReady}
          canManage={user?.email === item.ownerEmail}
          onCreate={() => createGithubReviewMutation.mutate()} onSync={() => syncGithubReviewMutation.mutate()}
          onAiReview={() => aiReviewMutation.mutate()} onRevise={() => reviseMutation.mutate()} onExport={() => exportMutation.mutate()} />
      </Stack> : null}

      <Box as="details" borderTopWidth="1px" pt={4}>
        <Text as="summary" cursor="pointer" fontSize="sm" color="fg.muted">History & item details</Text>
        <Stack mt={4} gap={3}>
          <Text fontSize="sm" color="fg.muted">Revision {revision} · Owner {item.ownerEmail}</Text>
          <AuditPanel events={auditQuery.data ?? []} exports={exportsQuery.data ?? []} />
        </Stack>
      </Box>
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
