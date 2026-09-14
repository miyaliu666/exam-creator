import { Box, Button, Center, HStack, Spinner, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import { useContext, useEffect, useRef, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { SignOutButton } from "../components/sign-out-button";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { createLanguageItem, getLanguageItem, getLanguageItemRegistry, saveLanguageItemDraft } from "../features/language-items/api";
import { createLanguageItemBatch, type BatchGenerationJob, type CreateBatchInput } from "../features/language-items/batch-api";
import { BatchCreatePanel } from "../features/language-items/batch-create-panel";
import { batchPlanIssues } from "../features/language-items/batch-plan";
import { contentLanguage } from "../features/language-items/content-language";
import { clearCreationSuggestion, readCreationSuggestion } from "../features/language-items/creation-suggestion-storage";
import { clearManualCreationRecovery, readManualCreationRecovery, saveManualCreationRecovery } from "../features/language-items/manual-creation-recovery";
import { rootRoute } from "./root";

function NewLanguageItems() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const scope = user?.email ?? "local";
  const [suggestion, setSuggestion] = useState(() => readCreationSuggestion(scope));
  const [manualRecovery, setManualRecovery] = useState(() => ({ scope, record: readManualCreationRecovery(scope) }));
  const unfinishedManual = manualRecovery.scope === scope ? manualRecovery.record : readManualCreationRecovery(scope);
  const allowCreatedNavigation = useRef(false);
  const registryQuery = useQuery({ queryKey: ["language-item-registry"], queryFn: () => getLanguageItemRegistry(), enabled: !!user });
  useEffect(() => { updateActivity({ page: new URL(window.location.href), lastActive: Date.now() }); }, []);
  const clearSuggestion = () => { clearCreationSuggestion(scope); setSuggestion(undefined); };
  const refreshItems = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["language-items"] }),
    queryClient.invalidateQueries({ queryKey: ["language-coverage"] }),
  ]);
  const create = useMutation({ mutationFn: createLanguageItemBatch, onSuccess: async (job) => {
    queryClient.setQueryData<BatchGenerationJob[]>(["language-item-batches", scope], (current) =>
      [job, ...(current ?? []).filter((entry) => entry.id !== job.id)]);
    await refreshItems();
  } });
  const manual = useMutation({ mutationFn: async (input: CreateBatchInput) => {
    const registry = registryQuery.data;
    if (!registry || input.registryVersion !== registry.bundleVersion || input.groups.length !== 1 || input.groups[0].itemCount !== 1) {
      throw new Error("Review the settings and choose one item to write manually.");
    }
    const issues = batchPlanIssues(input.groups, registry, input.candidatesPerItem, false);
    if (issues.length) throw new Error(issues.join(" "));
    const group = input.groups[0];
    const setup = {
      itemRuleId: group.itemRuleId, itemFormatId: group.itemFormatId,
      primaryCanDoId: group.primaryCanDoId, primaryDomain: group.primaryDomain,
      contextId: group.contextId, difficultyBand: group.difficultyBand,
      ...(contentLanguage(group) !== "zh" ? { language: contentLanguage(group) } : {}),
    };
    const setupKey = JSON.stringify({ ...setup, registryVersion: input.registryVersion });
    // A target-save retry reuses its already-created draft instead of creating another item.
    const recovery = readManualCreationRecovery(scope);
    let item = recovery?.setupKey === setupKey
      ? await getLanguageItem(recovery.itemId)
      : await createLanguageItem({ ...setup, title: input.title.trim() });
    const record = { itemId: item.id, setupKey };
    saveManualCreationRecovery(scope, record);
    setManualRecovery({ scope, record });
    if (item.draft.specVersions.registryBundleVersion !== input.registryVersion) {
      throw new Error("Assessment Settings changed during creation. Open the created draft to review its settings.");
    }
    const targets = [...new Set([...group.requiredTargetContentIds, ...group.rotatingTargetContentIds])];
    if (JSON.stringify(item.draft.content.targetContentIds) !== JSON.stringify(targets) || item.title !== input.title.trim()) {
      const draft = structuredClone(item.draft);
      draft.content.targetContentIds = targets;
      item = await saveLanguageItemDraft({ id: item.id, expectedRevision: item.revision, title: input.title.trim(), package: draft });
    }
    clearManualCreationRecovery(scope);
    setManualRecovery({ scope, record: undefined });
    return item;
  }, onSuccess: async (item) => {
    queryClient.setQueryData(["language-item", item.id], item);
    await refreshItems();
  } });
  const busy = create.isPending || manual.isPending;
  useBlocker({ shouldBlockFn: () => busy && !allowCreatedNavigation.current, enableBeforeUnload: busy, disabled: !busy });
  return <Box minH="100vh" bg="bg" py={12} px={4}>
    <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
      <Button variant="outline" colorPalette="teal" size="sm" disabled={busy} onClick={() => navigate({ to: "/language-items" })}>Item Bank</Button>
      <SignOutButton variant="outline" colorPalette="red" size="sm" disabled={busy} onClick={() => logout()}>Sign out / switch account</SignOutButton>
    </HStack>
    <Center><Stack gap={6} w="full" maxW="7xl">
      <Header title="New items"><Button variant="outline" disabled={busy} onClick={() => navigate({ to: "/language-items/batches" })}>Generation jobs</Button></Header>
      {registryQuery.data ? <BatchCreatePanel key={scope} showHeading={false} registry={registryQuery.data} scope={scope}
        pending={busy} error={create.error ?? manual.error} suggestion={suggestion} onSuggestionUsed={clearSuggestion}
        onClose={() => navigate({ to: "/language-items" })}
        onCreate={(input, reset) => { allowCreatedNavigation.current = false; manual.reset(); create.mutate(input, { onSuccess: (job) => {
          reset(); clearSuggestion(); allowCreatedNavigation.current = true; void navigate({ to: "/language-items/batches", search: { batchId: job.id } });
        } }); }}
        onWriteManually={(input, reset) => { allowCreatedNavigation.current = false; create.reset(); manual.mutate(input, { onSuccess: (item) => {
          reset(); clearSuggestion(); allowCreatedNavigation.current = true; void navigate({ to: "/language-items/$id", params: { id: item.id }, search: { start: "manual" } });
        } }); }} /> : registryQuery.isError ? <Stack align="start">
          <Text role="alert" color="fg.error">Could not load Assessment Settings: {registryQuery.error.message}</Text>
          <Button onClick={() => void registryQuery.refetch()}>Retry loading settings</Button>
        </Stack> : <Spinner />}
      {unfinishedManual ? <Button alignSelf="start" variant="outline" disabled={busy} onClick={() => navigate({ to: "/language-items/$id", params: { id: unfinishedManual.itemId }, search: { start: "manual" } })}>Open unfinished draft</Button> : null}
    </Stack></Center>
  </Box>;
}

export const newLanguageItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items/new",
  component: () => <ProtectedRoute><NewLanguageItems /></ProtectedRoute>,
});
