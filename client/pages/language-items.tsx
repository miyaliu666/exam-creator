import {
  Badge,
  Box,
  Button,
  Center,
  HStack,
  Input,
  Link,
  NativeSelect,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRoute, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ExternalLink,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useContext, useEffect, useMemo, useState } from "react";

import { ProtectedRoute } from "../components/protected-route";
import { Header } from "../components/ui/header";
import { AuthContext } from "../contexts/auth";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import {
  createLanguageItem,
  deleteLanguageItem,
  getGithubReviewStatus,
  getLanguageItemRegistry,
  getLanguageItems,
  syncGithubReviewBatch,
  updateLanguageItemRecordState,
} from "../features/language-items/api";
import {
  DIFFICULTY_LABELS,
  ITEM_FORMAT_LABELS,
  SKILL_LABELS,
  SLOT_LABELS,
  slotLabel,
} from "../features/language-items/labels";
import {
  NewLanguageItemDialog,
  type NewLanguageItemSelection,
} from "../features/language-items/new-language-item-dialog";
import { clearNewItemDraft } from "../features/language-items/new-item-draft";
import { RegistrySettingsPanel } from "../features/language-items/registry-settings-panel";
import type {
  GithubReviewState,
  LanguageItem,
  LanguageItemRecordState,
  LanguageItemStatus,
  RegistrySnapshot,
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

const STATUS_COPY: Record<
  LanguageItemStatus,
  { label: string; colorPalette: string }
> = {
  draft: { label: "Draft", colorPalette: "blue" },
  readyForReview: { label: "Ready for PR", colorPalette: "purple" },
  inReview: { label: "In review", colorPalette: "orange" },
  needsRevision: { label: "Changes requested", colorPalette: "red" },
  reviewBlocked: { label: "Sync issue", colorPalette: "yellow" },
  rejected: { label: "PR closed", colorPalette: "red" },
  approvedForExport: { label: "Approved", colorPalette: "green" },
  exportedToStaging: { label: "Approved", colorPalette: "green" },
};

const GITHUB_STATE_COPY: Record<
  GithubReviewState,
  { label: string; colorPalette: string }
> = {
  open: { label: "Awaiting review", colorPalette: "orange" },
  changesRequested: { label: "Changes requested", colorPalette: "red" },
  approved: { label: "Approved, awaiting merge", colorPalette: "green" },
  merged: { label: "Merged", colorPalette: "green" },
  closed: { label: "Closed", colorPalette: "gray" },
  syncFailed: { label: "Sync failed", colorPalette: "yellow" },
};

const RECORD_STATE_COPY: Record<
  LanguageItemRecordState,
  { label: string; colorPalette: string }
> = {
  active: { label: "Active", colorPalette: "teal" },
  archived: { label: "Archived", colorPalette: "gray" },
  deleted: { label: "Deleted", colorPalette: "red" },
};

function matchesStatus(item: LanguageItem, filter: StatusFilter) {
  if (filter === "all") return true;
  if (filter === "approved") {
    return item.status === "approvedForExport" || item.status === "exportedToStaging";
  }
  return item.status === filter;
}

function ItemTable({
  items,
  registry,
  currentUserEmail,
  onOpen,
  onRecordStateChange,
  pendingRecordStateItemId,
}: {
  items: LanguageItem[];
  registry: RegistrySnapshot | undefined;
  currentUserEmail: string | undefined;
  onOpen: (id: string) => void;
  onRecordStateChange: (
    item: LanguageItem,
    target: LanguageItemRecordState,
  ) => void;
  pendingRecordStateItemId?: string;
}) {
  if (items.length === 0) {
    return <Text color="fg.muted" py={8} textAlign="center">No matching items</Text>;
  }

  return (
    <Box borderWidth="1px" borderRadius="lg" overflowX="auto">
      <Table.Root size="sm" interactive>
        <Table.Header>
          <Table.Row>
            <Table.ColumnHeader>Item</Table.ColumnHeader>
            <Table.ColumnHeader>Exam task</Table.ColumnHeader>
            <Table.ColumnHeader>Format / difficulty</Table.ColumnHeader>
            <Table.ColumnHeader>Status</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Archive</Table.ColumnHeader>
            <Table.ColumnHeader textAlign="center">Delete</Table.ColumnHeader>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {items.map((item) => {
            const status = STATUS_COPY[item.status];
            const githubStatus = item.githubReview
              ? GITHUB_STATE_COPY[item.githubReview.state]
              : undefined;
            const isOwner = item.ownerEmail === currentUserEmail;
            const isActive = item.recordState === "active";
            const recordStatePending = pendingRecordStateItemId === item.id;
            return (
              <Table.Row
                key={item.id}
                onClick={() => isActive && onOpen(item.id)}
                cursor={isActive ? "pointer" : "default"}
              >
                <Table.Cell minW="220px">
                  <Button variant="plain" h="auto" p={0} fontWeight="semibold" disabled={!isActive}>
                    {item.title || "Untitled item"}
                  </Button>
                </Table.Cell>
                <Table.Cell minW="180px">
                  {slotLabel(item.draft.blueprintSlotId, registry, item.draft.itemFormatId)}
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    {SKILL_LABELS[item.draft.content.primaryReportedSkill] ?? item.draft.content.primaryReportedSkill}
                  </Text>
                </Table.Cell>
                <Table.Cell minW="160px">
                  <Text>
                    {ITEM_FORMAT_LABELS[item.draft.itemFormatId] ?? item.draft.itemFormatId}
                  </Text>
                  <Text mt={1} fontSize="xs" color="fg.muted">
                    {DIFFICULTY_LABELS[item.draft.content.difficultyBand] ?? item.draft.content.difficultyBand}
                  </Text>
                </Table.Cell>
                <Table.Cell minW="180px" onClick={(event) => event.stopPropagation()}>
                  <Stack gap={1} align="start">
                    <HStack gap={2} flexWrap="wrap">
                      <Badge colorPalette={status.colorPalette}>{status.label}</Badge>
                      {item.recordState !== "active" ? (
                        <Badge colorPalette="gray">{RECORD_STATE_COPY[item.recordState].label}</Badge>
                      ) : null}
                    </HStack>
                    {item.githubReview && githubStatus ? (
                      <Link href={item.githubReview.pullRequestUrl} target="_blank" fontSize="xs">
                        PR #{item.githubReview.pullRequestNumber} · {githubStatus.label} <ExternalLink size={12} />
                      </Link>
                    ) : null}
                  </Stack>
                </Table.Cell>
                <Table.Cell textAlign="center" onClick={(event) => event.stopPropagation()}>
                  {isOwner ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={recordStatePending}
                      aria-label={`${item.recordState === "active" ? "Archive" : "Restore"} ${item.title || "untitled item"}`}
                      onClick={() => onRecordStateChange(
                        item,
                        item.recordState === "active" ? "archived" : "active",
                      )}
                    >
                      {item.recordState === "active" ? <Archive size={14} /> : <RotateCcw size={14} />}
                    </Button>
                  ) : (
                    <Text color="fg.muted">—</Text>
                  )}
                </Table.Cell>
                <Table.Cell textAlign="center" onClick={(event) => event.stopPropagation()}>
                  {isOwner && item.recordState !== "deleted" ? (
                    <Button
                      size="xs"
                      variant="ghost"
                      colorPalette="red"
                      disabled={recordStatePending}
                      aria-label={`Move ${item.title || "untitled item"} to trash`}
                      onClick={() => onRecordStateChange(item, "deleted")}
                    >
                      <Trash2 size={14} />
                    </Button>
                  ) : (
                    <Text color="fg.muted">—</Text>
                  )}
                </Table.Cell>
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}

function LanguageItems() {
  const { user, logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [recordStateFilter, setRecordStateFilter] =
    useState<RecordStateFilter>("active");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [skillFilter, setSkillFilter] = useState<SkillFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
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
  const createMutation = useMutation({
    mutationFn: (selection: NewLanguageItemSelection) =>
      createLanguageItem({
        ...selection,
        title: `Untitled: ${SLOT_LABELS[selection.blueprintSlotId] ?? "Registered exam task"} · ${ITEM_FORMAT_LABELS[selection.itemFormatId] ?? "Item"}`,
      }),
    onSuccess: async (item) => {
      clearNewItemDraft(user?.email ?? "local");
      setCreateOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["language-items"] });
      navigate({ to: editLanguageItemRoute.to, params: { id: item.id } });
    },
  });
  const recordStateMutation = useMutation({
    mutationFn: ({
      item,
      target,
    }: {
      item: LanguageItem;
      target: LanguageItemRecordState;
    }) =>
      target === "deleted"
        ? deleteLanguageItem(item.id)
        : updateLanguageItemRecordState(item.id, target),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["language-items"] });
    },
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
      (skillFilter === "all" || item.draft.content.primaryReportedSkill === skillFilter) &&
      (difficultyFilter === "all" || item.draft.content.difficultyBand === difficultyFilter) &&
      (!normalizedSearch || [item.title, item.id]
        .some((value) => value.toLocaleLowerCase().includes(normalizedSearch))),
  );
  const mutationError =
    createMutation.error ??
    recordStateMutation.error ??
    syncMutation.error;

  function changeRecordState(
    item: LanguageItem,
    target: LanguageItemRecordState,
  ) {
    if (
      target === "deleted" &&
      !window.confirm(
        `Move “${item.title || "Untitled item"}” to trash?\n\nVersion, review, and delivery records will be retained.`,
      )
    ) {
      return;
    }
    recordStateMutation.mutate({ item, target });
  }

  return (
    <Box minH="100vh" bg="bg" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button variant="outline" colorPalette="teal" size="sm" onClick={() => navigate({ to: landingRoute.to })}>
          Back to home
        </Button>
        <Button variant="outline" colorPalette="red" size="sm" onClick={() => logout()}>
          Sign out / switch account
        </Button>
      </HStack>
      <Center>
        <Stack gap={6} w="full" maxW="7xl">
          <Header title="Language Exam Item Creator">
            <HStack>
              <Button
                variant="outline"
                onClick={() => {
                  if (settingsOpen && settingsDirty && !window.confirm("Discard unsaved settings and close Assessment Settings?")) return;
                  setSettingsOpen((open) => !open);
                }}
              >
                {settingsOpen ? "Close Settings" : "Assessment Settings"}
              </Button>
              <Button
                colorPalette="teal"
                disabled={!registryQuery.data}
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={18} /> New item
              </Button>
            </HStack>
          </Header>

          {settingsOpen ? <RegistrySettingsPanel onDirtyChange={setSettingsDirty} /> : null}

          <NewLanguageItemDialog
            key={user?.email ?? "local"}
            draftScope={user?.email ?? "local"}
            open={createOpen}
            registry={registryQuery.data}
            isPending={createMutation.isPending}
            error={createMutation.error}
            onClose={() => setCreateOpen(false)}
            onCreate={(selection) => createMutation.mutate(selection)}
          />

          <HStack justify="space-between" flexWrap="wrap" gap={3}>
            <Text fontWeight="semibold">Item bank</Text>
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
              <NativeSelect.Root size="sm" maxW="160px">
                <NativeSelect.Field
                  value={recordStateFilter}
                  onChange={(event) => {
                    setRecordStateFilter(event.target.value as RecordStateFilter);
                  }}
                >
                  <option value="active">Current item bank</option>
                  <option value="archived">Archived</option>
                  <option value="deleted">Trash</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <NativeSelect.Root size="sm" maxW="180px">
                <NativeSelect.Field value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                  <option value="all">All statuses</option>
                  <option value="draft">Draft</option>
                  <option value="readyForReview">Ready for PR</option>
                  <option value="inReview">In review</option>
                  <option value="needsRevision">Changes requested</option>
                  <option value="reviewBlocked">Sync issue</option>
                  <option value="rejected">PR closed</option>
                  <option value="approved">Approved</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <NativeSelect.Root size="sm" maxW="150px">
                <NativeSelect.Field value={skillFilter} onChange={(event) => setSkillFilter(event.target.value as SkillFilter)}>
                  <option value="all">All skills</option>
                  <option value="Reading">Reading</option>
                  <option value="Listening">Listening</option>
                  <option value="Writing">Writing</option>
                  <option value="Speaking">Speaking</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
              <NativeSelect.Root size="sm" maxW="170px">
                <NativeSelect.Field value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as DifficultyFilter)}>
                  <option value="all">All difficulties</option>
                  <option value="LowerA1">Lower A1</option>
                  <option value="TypicalA1">Typical A1</option>
                  <option value="UpperA1">Upper A1</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
          </HStack>

          {itemsQuery.isPending ? (
            <Spinner />
          ) : itemsQuery.isError ? (
            <Box borderWidth="1px" borderColor="border.error" borderRadius="xl" p={5}>
              <Text color="fg.error" fontWeight="semibold">Failed to load language items</Text>
              <Text color="fg.muted" fontSize="sm" mt={1}>{itemsQuery.error.message}</Text>
            </Box>
          ) : (
            <ItemTable
              items={visibleItems}
              registry={registryQuery.data}
              currentUserEmail={user?.email}
              onOpen={(id) => navigate({ to: editLanguageItemRoute.to, params: { id } })}
              onRecordStateChange={changeRecordState}
              pendingRecordStateItemId={recordStateMutation.variables?.item.id}
            />
          )}

          {githubQuery.data && !githubQuery.data.enabled ? (
            <Text color="fg.warning">GitHub review is not configured.</Text>
          ) : null}
          {mutationError ? <Text color="fg.error">{mutationError.message}</Text> : null}
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
