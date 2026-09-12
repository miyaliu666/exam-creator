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
import { createRoute, useBlocker, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useContext, useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { AuthContext } from "../contexts/auth";
import {
  adoptAiCandidate,
  exportLanguageItemToStaging,
  createGithubReviewBatch,
  generateAiCandidates,
  getAiGenerationRuns,
  getLanguageItemAiProvider,
  getLanguageItemCandidatePreview,
  getLanguageItem,
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
import { itemStatusLabel } from "../features/language-items/item-status";
import { ItemSetupPanel } from "../features/language-items/item-setup-panel";
import { applyItemSetup } from "../features/language-items/item-setup";
import { GithubReviewPanel } from "../features/language-items/github-review-panel";
import { AuthoringStepNavigation } from "../features/language-items/authoring-step-navigation";
import { DraftCheckPanel } from "../features/language-items/draft-check-panel";
import { checkCurrentDraft } from "../features/language-items/draft-validation";
import { AiPrereviewPanel } from "../features/language-items/ai-prereview-panel";
import { submitItemForReview } from "../features/language-items/submit-item-for-review";
import { DraftPreparationLayout } from "../features/language-items/draft-preparation-layout";
import { GenerationRequirementsSummary } from "../features/language-items/generation-requirements-summary";
import { generationRequirementsNeedRepair } from "../features/language-items/generation-requirements-policy";
import { VersionUsagePanel } from "../features/language-items/version-usage-panel";
import { hasAuthoredContent, initialEditorSection, type EditorSection } from "../features/language-items/authoring-workflow";
import { ScoringContractPanel } from "../features/language-items/scoring-contract-panel";
import { validateAuthoringSetup } from "../features/language-items/setup-validation";
import { AiCandidatesPanel } from "../features/language-items/workflow-panels";
import { CandidateCountField } from "../features/language-items/candidate-count-field";
import { isValidCandidateCount } from "../features/language-items/candidate-count";
import { generationErrorMessage } from "../features/language-items/generation-message";
import type {
  AiReviewRun,
  LanguageItem,
  TaskPackage,
  ValidationResult,
} from "../features/language-items/types";
import { languageItemsRoute } from "./language-items";
import { rootRoute } from "./root";

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
  const { start } = useSearch({ from: "/language-items/$id" });
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
          Back to Item Bank
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
          <WorkbenchEditor key={itemQuery.data.id} item={itemQuery.data} confirmLeave={confirmLeave} writeManually={start === "manual"} />
        )}
      </Center>
    </Box>
  );
}

function WorkbenchEditor({ item, confirmLeave, writeManually }: { item: LanguageItem; confirmLeave: { current: () => boolean }; writeManually: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useContext(AuthContext)!;
  const [title, setTitle] = useState(() => editableItemTitle(item.title));
  const [draft, setDraft] = useState<TaskPackage>(() => structuredClone(item.draft));
  const [usageDirty, setUsageDirty] = useState(false);
  const [usageBusy, setUsageBusy] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [aiPrereview, setAiPrereview] = useState<AiReviewRun | null>(null);
  const [submissionStage, setSubmissionStage] = useState<"checking" | "aiReview" | "creatingPr" | null>(null);
  const [candidateCount, setCandidateCount] = useState(3);
  const [requirementsRepairRunId, setRequirementsRepairRunId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [section, setSection] = useState<EditorSection>(() => initialEditorSection(item.status, item.draft.candidatePayload, writeManually));
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
  const latestVersion = versionsQuery.data?.[0];
  const versionDiffQuery = useQuery({
    queryKey: ["language-item-version-diff", latestVersion?.id],
    queryFn: () => getLanguageItemVersionDiff(latestVersion!.id),
    enabled: !!latestVersion,
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
    const current = saved ?? await getLanguageItem(item.id);
    if (saved || !draftDirtyRef.current) {
      revisionRef.current = current.revision;
      // Review synchronization can replace content without remounting this editor.
      if (!saved) {
        setDraft(structuredClone(current.draft));
        setTitle(editableItemTitle(current.title));
        setValidation(null);
        setAiPrereview(null);
      }
    }
    queryClient.setQueryData(["language-item", item.id], current);
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
    await queryClient.invalidateQueries({ queryKey: ["language-item-usage", item.id] });
  };

  const saveMutation = useMutation({
    mutationFn: flushDraft,
    onSuccess: async (saved) => {
      setAutosaveState("saved");
      setNotice("Draft saved.");
      await refreshItem(saved);
    },
  });
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!isValidCandidateCount(candidateCount)) throw new Error("Enter a positive whole number of AI drafts per item.");
      const saved = await flushDraft();
      const currentRuns = await queryClient.fetchQuery({
        queryKey: ["language-item-ai-runs", item.id],
        queryFn: () => getAiGenerationRuns(item.id),
        staleTime: 0,
        retry: false,
      });
      if (currentRuns.some((run) => run.status === "queued" || run.status === "running")) {
        throw new Error("AI generation is already in progress. Wait for it to finish before generating more drafts.");
      }
      const run = await generateAiCandidates(item.id, candidateCount);
      return { saved, run };
    },
    onSuccess: async ({ saved, run }) => {
      setNotice(
        run.error
          ? `AI draft generation failed: ${generationErrorMessage(run.error)}`
          : null,
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
      setAiPrereview(null);
      createGithubReviewMutation.reset();
      setAutosaveState("saved");
      draftDirtyRef.current = false;
      draftChangeRef.current += 1;
      setNotice(null);
      setSection("content");
      await refreshItem(saved);
    },
  });
  const createGithubReviewMutation = useMutation({
    onMutate: () => { setAiPrereview(null); setValidation(null); setNotice(null); setSubmissionStage("checking"); },
    mutationFn: async () => {
      if (submitBlockedReason) throw new Error(submitBlockedReason);
      return submitItemForReview({
        itemId: item.id,
        readState: () => ({ change: draftChangeRef.current, revision: revisionRef.current, dirty: draftDirtyRef.current }),
        check: async () => {
          if (!canEditDraft) return;
          const currentRuns = await queryClient.fetchQuery({
            queryKey: ["language-item-ai-runs", item.id], queryFn: () => getAiGenerationRuns(item.id),
            staleTime: 0, retry: false,
          });
          if (currentRuns.some((run) => run.status === "queued" || run.status === "running")) {
            throw new Error("AI draft generation is still in progress.");
          }
          const { result, current } = await checkCurrentDraft({
            flushDraft, validate: () => validateLanguageItem(item.id),
            readState: () => ({ change: draftChangeRef.current, revision: revisionRef.current, dirty: draftDirtyRef.current }),
          });
          setValidation(current ? result : null);
          if (!current) throw new Error("The item changed during checking. Submit the latest draft again.");
          if (!result.valid) throw new Error("Item checks failed.");
        },
        review: async (expectedRevision) => {
          if (canEditDraft) return runDraftAiReview(item.id, expectedRevision);
          if (!latestVersion) throw new Error("No item version is available.");
          return runAiReview(latestVersion.id);
        },
        onStage: setSubmissionStage,
        onReview: setAiPrereview,
        createPr: createGithubReviewBatch,
      });
    },
    onSuccess: async (batch) => {
      setNotice(`Review PR #${batch.pullRequestNumber} created.`);
      setSection("review");
      await refreshItem();
      window.open(batch.pullRequestUrl, "_blank", "noopener,noreferrer");
    },
    onSettled: () => { setSubmissionStage(null); },
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
    mutationFn: async ({ versionId, usageEventId }: { versionId: string; usageEventId?: string }) => {
      if (usageBusy || createGithubReviewMutation.isPending || syncGithubReviewMutation.isPending) {
        throw new Error("Wait for the current review or pilot action to finish before creating a revision.");
      }
      if (item.status === "draft" || draftDirtyRef.current || usageDirty) {
        throw new Error("Continue the current draft or save version use changes before starting another revision.");
      }
      if (autosaveTimer.current !== null) {
        window.clearTimeout(autosaveTimer.current);
        autosaveTimer.current = null;
      }
      await saveQueue.current;
      return reviseLanguageItemVersion({
        versionId,
        expectedRevision: revisionRef.current,
        usageEventId,
      });
    },
    onSuccess: async (saved) => {
      revisionRef.current = saved.revision;
      setDraft(structuredClone(saved.draft));
      setTitle(editableItemTitle(saved.title));
      setValidation(null);
      setAiPrereview(null);
      createGithubReviewMutation.reset();
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
    setAiPrereview(null);
    createGithubReviewMutation.reset();
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
  const error = [createGithubReviewMutation, saveMutation, generateMutation, adoptMutation, syncGithubReviewMutation, reviseMutation, exportMutation]
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
  const hasUnsavedChanges = usageDirty || (canEditDraft && (draftDirtyRef.current || autosaveState !== "saved"));
  const workflowBusy = submitting || usageBusy || reviseMutation.isPending;
  const mayLeave = () => !workflowBusy && (!hasUnsavedChanges || window.confirm("Your latest changes have not been saved yet. Leave and discard those changes?"));
  useBlocker({ shouldBlockFn: () => !mayLeave(), enableBeforeUnload: hasUnsavedChanges || workflowBusy, disabled: !hasUnsavedChanges && !workflowBusy });
  useEffect(() => {
    confirmLeave.current = mayLeave;
    return () => { confirmLeave.current = () => true; };
  });
  const hasActiveRun = runsQuery.data?.some((run) => run.status === "queued" || run.status === "running") ?? false;
  const latestRun = runsQuery.data?.[0];
  const generationSetupChanged = !!latestRun && !aiGenerationMatchesSetup(latestRun, draft);
  const candidatesFirst = !!latestRun &&
    (latestRun.candidates.length > 0 || hasActiveRun);
  const hasGeneratedCandidates = runsQuery.data?.some((run) => run.candidates.length > 0) ?? false;
  const requirementsNeedRepair = generationRequirementsNeedRepair(setupIssues, visibleValidationIssues);
  // Keep a repair editable until the next run so completing one field cannot interrupt the remaining edits.
  if (canEditDraft && latestRun && requirementsNeedRepair && requirementsRepairRunId !== latestRun.id) {
    setRequirementsRepairRunId(latestRun.id);
  }
  const repairingRequirements = requirementsNeedRepair || (!!latestRun && requirementsRepairRunId === latestRun.id);
  const canEditGenerationRequirements = canEditDraft && runsQuery.isSuccess && !submitting && !hasActiveRun &&
    (!hasGeneratedCandidates || repairingRequirements);
  const itemActionBusy = usageBusy || reviseMutation.isPending || syncGithubReviewMutation.isPending || exportMutation.isPending ||
    generateMutation.isPending || adoptMutation.isPending || hasActiveRun;
  const submitBlockedReason = usageDirty ? "Unsaved version use changes."
    : itemActionBusy ? "An item update is in progress."
      : canEditDraft && runsQuery.isError ? "AI draft status could not be loaded."
          : canEditDraft && !runsQuery.isSuccess ? "Loading AI draft status…"
            : canEditDraft && registryQuery.isError ? "Assessment Settings could not be loaded."
              : canEditDraft && !registryQuery.isSuccess ? "Loading Assessment Settings…"
                : canEditDraft && setupIssues.length ? setupIssues[0].message
                  : autosaveState === "error" ? "The draft could not be saved."
                    : ["readyForReview", "rejected"].includes(item.status)
                      ? versionsQuery.isPending ? "Loading item version…"
                        : versionsQuery.isError ? "The item version could not be loaded."
                          : !latestVersion ? "No frozen version is available."
                            : !latestVersion.validation.valid ? "The frozen version has check errors."
                              : undefined
                      : undefined;
  const submitReady = canEditDraft && !submitBlockedReason;
  const frozenSubmissionReady = user?.email === item.ownerEmail && !submitting && !submitBlockedReason &&
    ["readyForReview", "rejected"].includes(item.status) && latestVersion?.validation.valid === true;

  return (
    <Stack w="full" maxW="7xl" gap={6}>
      <Box pt={5}>
        <Stack gap={2}>
          {canEditDraft ? (
            <Field.Root>
              <Field.Label>Item title</Field.Label>
              <Input aria-label="Item title" value={title}
                fontSize="xl" disabled={submitting}
                onChange={(event) => {
                  setValidation(null);
                  setAiPrereview(null);
                  createGithubReviewMutation.reset();
                  draftDirtyRef.current = true;
                  draftChangeRef.current += 1;
                  setTitle(event.target.value);
                }} />
            </Field.Root>
          ) : <Heading size="2xl">{title || "Untitled item"}</Heading>}
          <HStack flexWrap="wrap" gap={3}>
            <Badge>{itemStatusLabel(item.status)}</Badge>
            {item.hasStagingExport || item.status === "exportedToStaging" ? <Badge colorPalette="teal">Exported to Staging</Badge> : null}
            {canEditDraft ? <Text role="status" fontSize="sm" color={autosaveState === "error" ? "fg.error" : "fg.muted"}>{autosaveLabel}</Text> : null}
            {canEditDraft && autosaveState === "error" ? <Button size="xs" variant="outline" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>Retry save</Button> : null}
          </HStack>
        </Stack>
        {notice ? <Text role="status" whiteSpace="pre-wrap" mt={3} color="fg.info">{notice}</Text> : null}
        {error ? <Box role="alert" mt={3} borderWidth="1px" borderRadius="lg" p={3} borderColor="border.error">
          <Text color="fg.error">{errorValidationIssues.length ? "Fix the highlighted item fields and try again."
            : error === generateMutation.error || error === adoptMutation.error ? generationErrorMessage(error.message) : error.message}</Text>
        </Box> : null}
      </Box>

      {registryQuery.data ? <ItemSetupPanel draft={draft} registry={registryQuery.data}
        canEdit={canEditDraft && !submitting && !hasActiveRun && !adoptMutation.isPending && !generateMutation.isPending}
        onApply={(selection) => {
          updateDraft((next) => applyItemSetup(next, selection, registryQuery.data!));
          setNotice("Item setup updated.");
          setSection("setup");
        }} /> : <Text color={registryQuery.isError ? "fg.error" : "fg.muted"}>{registryQuery.isError ? "Item settings could not be loaded. Refresh to retry." : "Loading item settings…"}</Text>}

      <AuthoringStepNavigation section={section} onChange={setSection} />

      {(section === "setup" || section === "review") && canEditDraft && runsQuery.isError ? <HStack flexWrap="wrap">
        <Text role="alert" color="fg.error" fontSize="sm">AI drafts could not be loaded.</Text>
        <Button size="sm" variant="outline" loading={runsQuery.isFetching} onClick={() => { void runsQuery.refetch(); }}>Retry loading AI drafts</Button>
      </HStack> : null}

      {section === "setup" ? (
        <DraftPreparationLayout candidatesFirst={canEditDraft && candidatesFirst}
          requirementsNeedAttention={generationSetupChanged || setupIssues.length > 0 || repairingRequirements}
          requirementsNeedRepair={canEditGenerationRequirements && repairingRequirements}
          requirements={canEditGenerationRequirements ? <AuthoringPanel mode="setup" draft={draft} registry={registryQuery.data} updateDraft={updateDraft}
            readOnly={false} setupIssues={setupIssues} /> : <GenerationRequirementsSummary draft={draft} registry={registryQuery.data} />}
          generation={canEditDraft ? <>
            {!candidatesFirst ? <Heading size="md">{latestRun ? "Generate AI drafts" : "Create a first draft"}</Heading> : null}
            {setupIssues.length ? <Box fontSize="sm">
              <Text fontWeight="medium" mb={2}>Complete before continuing</Text>
              <Stack gap={1}>{[...new Set(setupIssues.map((issue) => issue.message))].map((message) => <Text key={message}>· {message}</Text>)}</Stack>
            </Box> : null}
            <Text fontSize="xs" color="fg.muted">
              {aiProviderQuery.isPending ? "Loading AI provider…" : aiProviderQuery.isError ? "AI is unavailable. You can write the item yourself."
                : aiProviderQuery.data?.usesRealModel ? aiProviderQuery.data.model : "Offline simulator · sample content"}
            </Text>
            <CandidateCountField value={candidateCount} onChange={setCandidateCount}
              disabled={!canEditDraft || submitting || hasActiveRun || generateMutation.isPending} />
            <Button colorPalette="teal" disabled={!isValidCandidateCount(candidateCount) || !canEditDraft || submitting || !runsQuery.isSuccess || hasActiveRun || generateMutation.isPending || setupIssues.length > 0 || !aiProviderQuery.data || autosaveState === "saving" || autosaveState === "error"}
              loading={generateMutation.isPending} onClick={() => generateMutation.mutate()}>
              {runsQuery.isPending ? "Loading AI drafts…" : hasActiveRun ? "Generating AI drafts…" : "Generate AI drafts"}
            </Button>
            <Button variant="outline" disabled={submitting} onClick={() => setSection("content")}>
              {hasAuthoredContent(draft.candidatePayload) ? "Back to editor" : "Write manually"}
            </Button>
          </> : <Button variant="outline" onClick={() => setSection("content")}>View item</Button>}
          candidates={canEditDraft && latestRun ? <AiCandidatesPanel run={latestRun} isAdopting={adoptMutation.isPending} setupChanged={generationSetupChanged}
            canAdopt={!submitting && !generationSetupChanged && setupIssues.length === 0} onAdopt={(runId, candidateId) => adoptMutation.mutate({ runId, candidateId })} /> : null} />
      ) : null}

      {section === "content" ? (
        <Stack gap={5}>
          {canEditDraft ? <HStack justify="flex-end" flexWrap="wrap">
            <Button colorPalette="teal" onClick={() => setSection("review")}
              disabled={submitting || itemActionBusy || autosaveState === "error"}>Continue</Button>
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
        {canEditDraft && (validation || setupIssues.length > 0 || submissionStage === "checking") ? <DraftCheckPanel validation={validation} setupIssues={setupIssues} checking={submissionStage === "checking"}
          disabled={submitting || itemActionBusy || autosaveState === "error"}
          onEdit={setSection} /> : null}
        <AiPrereviewPanel stage={submissionStage} review={aiPrereview} />
        {["readyForReview", "rejected"].includes(item.status) && versionsQuery.isError ? <Button alignSelf="start" size="sm" variant="outline"
          loading={versionsQuery.isFetching} onClick={() => void versionsQuery.refetch()}>Retry loading version</Button> : null}
        <GithubReviewPanel item={item} latestVersion={latestVersion}
          versionDiff={versionDiffQuery.data} versionDiffPending={versionDiffQuery.isPending} versionDiffError={versionDiffQuery.error}
          isCreating={submitting} isSyncing={syncGithubReviewMutation.isPending}
          isRevising={reviseMutation.isPending} isExporting={exportMutation.isPending} canSubmit={submitReady || frozenSubmissionReady}
          submitBlockedReason={submitBlockedReason}
          workflowLocked={usageDirty || itemActionBusy}
          canManage={user?.email === item.ownerEmail}
          onCreate={() => createGithubReviewMutation.mutate()} onSync={() => syncGithubReviewMutation.mutate()}
          onRevise={() => latestVersion && reviseMutation.mutate({ versionId: latestVersion.id })} onExport={() => exportMutation.mutate()} />
      </Stack> : null}

      <Box hidden={section !== "review"}><VersionUsagePanel itemId={item.id} versions={versionsQuery.data ?? []}
        canManage={user?.email === item.ownerEmail}
        disabled={item.recordState !== "active" || submitting || syncGithubReviewMutation.isPending || reviseMutation.isPending}
        canRevise={user?.email === item.ownerEmail && item.recordState === "active" && item.status !== "draft" &&
          (!item.githubReview || item.githubReview.state === "merged" || item.githubReview.state === "closed") &&
          !submitting && !syncGithubReviewMutation.isPending && !reviseMutation.isPending}
        onDirtyChange={setUsageDirty} onBusyChange={setUsageBusy}
        onOpenDraft={item.status === "draft" ? () => setSection("content") : undefined}
        onRevise={async (versionId, usageEventId) => { await reviseMutation.mutateAsync({ versionId, usageEventId }); }} /></Box>
    </Stack>
  );
}

export const editLanguageItemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/$id",
  validateSearch: (search: Record<string, unknown>): { start?: "manual" } => ({ start: search.start === "manual" ? "manual" : undefined }),
  component: () => (
    <ProtectedRoute>
      <EditLanguageItem />
    </ProtectedRoute>
  ),
});
