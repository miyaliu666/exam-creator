import {
  Box,
  Button,
  Center,
  HStack,
  Input,
  NativeSelect,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, useNavigate } from "@tanstack/react-router";
import {
  Plus,
  RefreshCw,
} from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { SignOutButton } from "../components/sign-out-button";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import {
  getGithubReviewStatus,
  getLanguageItemRegistry,
  getLanguageItems,
  syncGithubReviewBatch,
} from "../features/language-items/api";
import { ITEM_STATUS_COPY } from "../features/language-items/item-status";
import { FilterSelect } from "../features/language-items/filter-select";
import { CONTENT_LANGUAGE_OPTIONS, contentLanguage } from "../features/language-items/content-language";
import { WORKBENCH_LABELS } from "../features/language-items/labels";
import { ItemBankList } from "../features/language-items/item-bank-list";
import type {
  LanguageItem,
  LanguageItemRecordState,
} from "../features/language-items/types";
import { editLanguageItemRoute } from "./edit-language-item";
import { landingRoute } from "./landing";
import { rootRoute } from "./root";
type RecordStateFilter = LanguageItemRecordState;
type SkillFilter = "all" | "Reading" | "Listening" | "Writing" | "Speaking";
type DifficultyFilter = "all" | "LowerA1" | "TypicalA1" | "UpperA1";
type StatusFilter =
  | "all"
  | "draft"
  | "readyForReview"
  | "inReview"
  | "needsRevision"
  | "reviewBlocked"
  | "rejected"
  | "approved";

function matchesStatus(item: LanguageItem, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "approved") {
    return item.status === "approvedForExport" || item.status === "exportedToStaging";
  }
  return item.status === filter;
}

function LanguageItems() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [recordStateFilter, setRecordStateFilter] =
    useState<RecordStateFilter>("active");
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const itemsQuery = useQuery({
    queryKey: ["language-items"],
    queryFn: getLanguageItems,
    enabled: !!user,
    retry: false,
  });
  const registryQuery = useQuery({
    queryKey: ["language-item-registry"],
    queryFn: () => getLanguageItemRegistry(),
    enabled: !!user,
  });
  const githubQuery = useQuery({
    queryKey: ["language-item-github-review-status"],
    queryFn: getGithubReviewStatus,
    enabled: !!user,
    retry: false,
  });
  const batchIds = useMemo(
    () => [
      ...new Set(
        (itemsQuery.data ?? [])
          .filter((item) =>
            item.recordState === "active" && item.githubReview
              ? ["open", "approved", "changesRequested", "syncFailed"].includes(
                  item.githubReview.state,
                )
              : false,
          )
          .map((item) => item.githubReview?.batchId)
          .filter((id): id is string => !!id),
      ),
    ],
    [itemsQuery.data],
  );
  const syncMutation = useMutation({
    mutationFn: () => Promise.all(batchIds.map(syncGithubReviewBatch)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["language-items"] });
    },
  });

  useEffect(() => {
    updateActivity({ page: new URL(window.location.href), lastActive: Date.now() });
  }, []);

  const items = itemsQuery.data ?? [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleItems = items.filter(
    (item) =>
      item.recordState === recordStateFilter &&
      matchesStatus(item, statusFilter) &&
      (!languageFilter || contentLanguage(item.draft.content) === languageFilter) &&
      (skillFilter === "all" || item.draft.content.primaryReportedSkill === skillFilter) &&
      (difficultyFilter === "all" || item.draft.content.difficultyBand === difficultyFilter) &&
      (!normalizedSearch || [item.title, item.id]
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))),
  );

  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" onClick={() => navigate({ to: landingRoute.to })}>
          Back to home
        </Button>
        <SignOutButton variant="outline" colorPalette="red" size="sm" onClick={() => logout()}>
          Sign out / switch account
        </SignOutButton>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title={WORKBENCH_LABELS.itemBank}>
            <HStack flexWrap="wrap">
              <Button variant="outline" onClick={() => navigate({ to: "/language-items/coverage" })}>
                Language coverage
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/language-items/batches" })}>
                Generation jobs
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/language-items/assessment-settings" })}
              >
                Assessment Settings
              </Button>
              <Button
                colorPalette="teal"
                disabled={!registryQuery.data}
                onClick={() => navigate({ to: "/language-items/new" })}
              >
                <Plus size={18} /> New items
              </Button>
            </HStack>
          </Header>

          <HStack justify="flex-end" flexWrap="wrap" gap={3}>
            {githubQuery.data?.enabled ? (
              <Button
                size="sm"
                variant="outline"
                disabled={batchIds.length === 0}
                loading={syncMutation.isPending}
                onClick={() => syncMutation.mutate()}
              >
                <RefreshCw size={16} /> Sync PRs
              </Button>
            ) : null}
          </HStack>

          <HStack gap={3} flexWrap="wrap">
              <Input maxW="320px" size="sm" placeholder="Search by title or item ID" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Box w="160px"><FilterSelect label="Language" hideLabel placeholder="Language" value={languageFilter} options={[...CONTENT_LANGUAGE_OPTIONS]} onChange={setLanguageFilter} /></Box>
              <NativeSelect.Root size="sm" maxW="160px">
                <NativeSelect.Field
                  aria-label="Item location"
                  value={recordStateFilter}
                  onChange={(event) => {
                    setRecordStateFilter(event.target.value as RecordStateFilter);
                  }}
                >
                  <option value="active">Current Item Bank</option>
                  <option value="archived">Archived</option>
                  <option value="deleted">Trash</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <Box w="180px">
                <FilterSelect label="Item status" hideLabel placeholder="Status" value={statusFilter === "all" ? "" : statusFilter}
                  options={[
                    { id: "draft", label: ITEM_STATUS_COPY.draft.label },
                    { id: "readyForReview", label: ITEM_STATUS_COPY.readyForReview.label },
                    { id: "inReview", label: ITEM_STATUS_COPY.inReview.label },
                    { id: "needsRevision", label: ITEM_STATUS_COPY.needsRevision.label },
                    { id: "reviewBlocked", label: ITEM_STATUS_COPY.reviewBlocked.label },
                    { id: "rejected", label: ITEM_STATUS_COPY.rejected.label },
                    { id: "approved", label: "Approved" },
                  ]} onChange={(value) => setStatusFilter((value || "all") as StatusFilter)} />
              </Box>
              <Box w="150px">
                <FilterSelect label="Skill" hideLabel placeholder="Skill" value={skillFilter === "all" ? "" : skillFilter}
                  options={["Reading", "Listening", "Writing", "Speaking"].map((id) => ({ id, label: id }))}
                  onChange={(value) => setSkillFilter((value || "all") as SkillFilter)} />
              </Box>
              <Box w="170px">
                <FilterSelect label="Difficulty" hideLabel placeholder="Difficulty" value={difficultyFilter === "all" ? "" : difficultyFilter}
                  options={[
                    { id: "LowerA1", label: "Lower A1" },
                    { id: "TypicalA1", label: "Typical A1" },
                    { id: "UpperA1", label: "Upper A1" },
                  ]} onChange={(value) => setDifficultyFilter((value || "all") as DifficultyFilter)} />
              </Box>
          </HStack>

          {itemsQuery.isError && itemsQuery.data ? (
            <Box role="alert" borderWidth="1px" borderColor="border.error" borderRadius="md" p={3}>
              <Text color="fg.error">Failed to refresh items. Showing the last available list.</Text>
              <Text fontSize="sm" color="fg.muted">{itemsQuery.error.message}</Text>
              <Button size="sm" variant="outline" mt={2} loading={itemsQuery.isFetching} onClick={() => void itemsQuery.refetch()}>Retry refresh</Button>
            </Box>
          ) : null}
          {itemsQuery.isPending ? (
            <Spinner />
          ) : itemsQuery.isError && !itemsQuery.data ? (
            <Box borderWidth="1px" borderColor="border.error" borderRadius="xl" p={5}>
              <Text color="fg.error" fontWeight="semibold">Failed to load language items</Text>
              <Text color="fg.muted" fontSize="sm" mt={1}>{itemsQuery.error.message}</Text>
              <Button size="sm" variant="outline" mt={3} loading={itemsQuery.isFetching} onClick={() => void itemsQuery.refetch()}>Retry</Button>
            </Box>
          ) : (
            <ItemBankList
              selectionScope={JSON.stringify([user?.email, recordStateFilter, search, languageFilter, statusFilter, skillFilter, difficultyFilter])}
              items={visibleItems}
              recordState={recordStateFilter}
              registry={registryQuery.data}
              currentUserEmail={user?.email}
              onOpen={(id) => navigate({ to: editLanguageItemRoute.to, params: { id } })}
            />
          )}

          {githubQuery.data && !githubQuery.data.enabled ? (
            <Text color="fg.warning">GitHub review is not configured.</Text>
          ) : null}
          {syncMutation.error ? <Text color="fg.error">{syncMutation.error.message}</Text> : null}
        </Stack>
      </Center>
    </Box>
  );
}

export const languageItemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/language-items",
  component: () => (
    <ProtectedRoute>
      <LanguageItems />
    </ProtectedRoute>
  ),
});
