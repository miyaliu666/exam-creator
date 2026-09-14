import {
  Badge,
  Box,
  Button,
  Center,
  Dialog,
  Field,
  Flex,
  Heading,
  HStack,
  Image,
  Input,
  Portal,
  Spinner,
  Stack,
  Table,
  Text,
} from "@chakra-ui/react";
import { createRoute, useNavigate, useSearch } from "@tanstack/react-router";
import {
  Fragment,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitMergeIcon,
} from "lucide-react";

import { rootRoute } from "./root";
import { ProtectedRoute } from "../components/protected-route";
import { UsersWebSocketActivityContext } from "../contexts/users-websocket";
import { AuthContext } from "../contexts/auth";
import { SignOutButton } from "../components/sign-out-button";
import { Header } from "../components/ui/header";
import {
  getDuplicateUsers,
  type DuplicateUser,
  type Selection,
} from "../utils/fetch";
import { scheduleMerge } from "../utils/pending-merges";
import { objectIdToDate } from "../utils/object-id";

// Identity/derived keys that are never merged onto the survivor.
const NON_MERGEABLE = new Set(["id", "attemptCount"]);

const CONFIRM_PHRASE = "merge accounts";

type Rec = DuplicateUser;
type FieldKind = "scalar" | "object" | "array";

// A candidate value at some position in the tree, labelled by the record it came from.
interface Source {
  id: string;
  label: string;
  value: unknown;
}

// UI-side selection tree. Mirrors the wire `Selection` but arrays keep every group with an
// `included` flag (and a stable `id`) so toggling items is easy; `toWire` drops the extras.
type USel =
  | { kind: "pick"; sourceId: string }
  | { kind: "object"; fields: Record<string, USel> }
  | { kind: "array"; groups: UGroup[] };

interface UGroup {
  id: string;
  members: Array<{ sourceId: string; index: number }>;
  included: boolean;
  selection: USel;
}

function field(rec: Rec, key: string): unknown {
  return (rec as Record<string, unknown>)[key];
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    !(v instanceof Date)
  );
}

function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (isPlainObject(v)) return Object.keys(v).length === 0;
  return false;
}

function valueKey(v: unknown): string {
  return JSON.stringify(v ?? null);
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? "" : "s"}`;
  if (v instanceof Date) return v.toLocaleString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s === "" ? '""' : s;
}

// --- Generic, recursive selection helpers (shared by defaults, preview, and wire conversion) ---

function classify(sources: Source[]): FieldKind {
  if (sources.some((s) => Array.isArray(s.value))) return "array";
  if (sources.some((s) => isPlainObject(s.value))) return "object";
  return "scalar";
}

// Union of sub-keys across every source whose value is an object, first-seen order.
function objectKeysOf(sources: Source[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    if (isPlainObject(s.value)) {
      for (const k of Object.keys(s.value)) {
        if (!seen.has(k)) {
          seen.add(k);
          out.push(k);
        }
      }
    }
  }
  return out;
}

// Candidate sources for an object sub-key.
function subSourcesFor(sources: Source[], key: string): Source[] {
  return sources
    .filter((s) => isPlainObject(s.value) && key in s.value)
    .map((s) => ({
      id: s.id,
      label: s.label,
      value: (s.value as Record<string, unknown>)[key],
    }));
}

// Candidate sources for an array group (the item each member contributes).
function memberSourcesFor(
  sources: Source[],
  members: Array<{ sourceId: string; index: number }>,
): Source[] {
  return members.map((m) => {
    const src = sources.find((s) => s.id === m.sourceId);
    const arr = Array.isArray(src?.value) ? (src!.value as unknown[]) : [];
    return { id: m.sourceId, label: src?.label ?? m.sourceId, value: arr[m.index] };
  });
}

// Identity used to match array items across records: by `id` for objects, else by value.
function itemIdentity(item: unknown): string {
  if (isPlainObject(item) && item.id != null) return `id:${String(item.id)}`;
  return `val:${valueKey(item)}`;
}

// Group an array field's items across sources by identity, preserving first-seen order.
function buildGroups(
  sources: Source[],
): Array<{ id: string; members: Array<{ sourceId: string; index: number }> }> {
  const order: string[] = [];
  const map = new Map<string, Array<{ sourceId: string; index: number }>>();
  for (const s of sources) {
    const arr = Array.isArray(s.value) ? s.value : [];
    const seenInSource = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const idn = itemIdentity(arr[i]);
      if (seenInSource.has(idn)) continue; // one item per source per identity
      seenInSource.add(idn);
      if (!map.has(idn)) {
        map.set(idn, []);
        order.push(idn);
      }
      map.get(idn)!.push({ sourceId: s.id, index: i });
    }
  }
  return order.map((id) => ({ id, members: map.get(id)! }));
}

// Default selection: prefer the survivor's own non-empty value, else the first that has one.
// Arrays default to keeping every item (union); objects/arrays recurse.
function buildDefault(sources: Source[], preferred: string): USel {
  const kind = classify(sources);
  if (kind === "array") {
    const groups = buildGroups(sources).map((g) => ({
      id: g.id,
      members: g.members,
      included: true,
      selection: buildDefault(memberSourcesFor(sources, g.members), preferred),
    }));
    return { kind: "array", groups };
  }
  if (kind === "object") {
    const fields: Record<string, USel> = {};
    for (const k of objectKeysOf(sources)) {
      fields[k] = buildDefault(subSourcesFor(sources, k), preferred);
    }
    return { kind: "object", fields };
  }
  const pref =
    sources.find((s) => s.id === preferred && !isEmptyValue(s.value)) ??
    sources.find((s) => !isEmptyValue(s.value)) ??
    sources.find((s) => s.id === preferred) ??
    sources[0];
  return { kind: "pick", sourceId: pref?.id ?? preferred };
}

// Resolve a selection to its merged value (mirrors the server's resolver, for live preview).
function mergedOf(sel: USel, sources: Source[]): unknown {
  if (sel.kind === "pick") {
    return sources.find((s) => s.id === sel.sourceId)?.value;
  }
  if (sel.kind === "object") {
    const obj: Record<string, unknown> = {};
    for (const [k, sub] of Object.entries(sel.fields)) {
      const v = mergedOf(sub, subSourcesFor(sources, k));
      if (v !== undefined) obj[k] = v;
    }
    return obj;
  }
  const out: unknown[] = [];
  for (const g of sel.groups) {
    if (g.included) out.push(mergedOf(g.selection, memberSourcesFor(sources, g.members)));
  }
  return out;
}

// Convert the UI selection tree to the wire format (drop excluded groups + UI-only fields).
function toWire(sel: USel): Selection {
  if (sel.kind === "pick") return { kind: "pick", sourceId: sel.sourceId };
  if (sel.kind === "object") {
    const fields: Record<string, Selection> = {};
    for (const [k, v] of Object.entries(sel.fields)) fields[k] = toWire(v);
    return { kind: "object", fields };
  }
  return {
    kind: "array",
    groups: sel.groups
      .filter((g) => g.included)
      .map((g) => ({ members: g.members, selection: toWire(g.selection) })),
  };
}

function allFieldsOf(records: Rec[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rec of records) {
    for (const key of Object.keys(rec)) {
      if (!NON_MERGEABLE.has(key) && !seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

function fieldDiffers(records: Rec[], key: string): boolean {
  return new Set(records.map((r) => valueKey(field(r, key)))).size > 1;
}

function completeness(fields: string[], rec: Rec): number {
  return fields.filter((f) => !isEmptyValue(field(rec, f))).length;
}

function computeSuperlatives(records: Rec[], fields: string[]) {
  const meta = records.map((r) => ({
    id: r.id,
    created: objectIdToDate(r.id)?.getTime() ?? 0,
    attempts: r.attemptCount,
    complete: completeness(fields, r),
  }));
  const byMax = <K extends keyof (typeof meta)[number]>(key: K) =>
    meta.reduce((best, cur) => (cur[key] > best[key] ? cur : best)).id;
  const byMin = <K extends keyof (typeof meta)[number]>(key: K) =>
    meta.reduce((best, cur) => (cur[key] < best[key] ? cur : best)).id;
  return {
    oldest: byMin("created"),
    newest: byMax("created"),
    mostAttempts: byMax("attempts"),
    mostComplete: byMax("complete"),
  };
}

export function UserDeduplicate() {
  const { logout } = useContext(AuthContext)!;
  const { updateActivity } = useContext(UsersWebSocketActivityContext)!;
  const navigate = useNavigate();
  const { email } = useSearch({ from: userDeduplicateRoute.to });

  useEffect(() => {
    updateActivity({
      page: new URL(window.location.href),
      lastActive: Date.now(),
    });
  }, []);

  const duplicates = useQuery({
    queryKey: ["user-duplicates", email],
    queryFn: () => getDuplicateUsers(email!),
    enabled: !!email,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const records = useMemo(
    () =>
      [...(duplicates.data ?? [])].sort(
        (a, b) =>
          (objectIdToDate(a.id)?.getTime() ?? 0) -
          (objectIdToDate(b.id)?.getTime() ?? 0),
      ),
    [duplicates.data],
  );

  const fields = useMemo(() => allFieldsOf(records), [records]);
  const kinds = useMemo(() => {
    const m: Record<string, FieldKind> = {};
    for (const f of fields) {
      m[f] = classify(records.map((r) => ({ id: r.id, label: "", value: field(r, f) })));
    }
    return m;
  }, [fields, records]);
  const differingFields = useMemo(
    () => fields.filter((f) => fieldDiffers(records, f)),
    [fields, records],
  );
  const superlatives = useMemo(
    () => (records.length ? computeSuperlatives(records, fields) : null),
    [records, fields],
  );

  const [survivorId, setSurvivorId] = useState<string | null>(null);
  // Recursive selection tree per field.
  const [selections, setSelections] = useState<Record<string, USel>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmVal, setConfirmVal] = useState("");

  const effectiveSurvivorId =
    survivorId && records.some((r) => r.id === survivorId)
      ? survivorId
      : (records[0]?.id ?? null);

  const recordSources = useMemo(() => {
    const fn = (f: string): Source[] =>
      records.map((r, i) => ({
        id: r.id,
        label: `Account ${i + 1}`,
        value: field(r, f),
      }));
    return fn;
  }, [records]);

  // (Re)seed the whole selection tree whenever the survivor or record set changes.
  useEffect(() => {
    if (!effectiveSurvivorId || records.length === 0) return;
    const next: Record<string, USel> = {};
    for (const f of fields) {
      next[f] = buildDefault(recordSources(f), effectiveSurvivorId);
    }
    setSelections(next);
  }, [effectiveSurvivorId, records, fields, recordSources]);

  const discarded = records.filter((r) => r.id !== effectiveSurvivorId);
  const attemptsToRepoint = discarded.reduce(
    (sum, r) => sum + r.attemptCount,
    0,
  );

  function mergedValue(f: string): unknown {
    const sel = selections[f];
    return sel ? mergedOf(sel, recordSources(f)) : undefined;
  }

  function setFieldSel(f: string, sel: USel) {
    setSelections((prev) => ({ ...prev, [f]: sel }));
  }

  function badgesFor(id: string): string[] {
    if (!superlatives) return [];
    const out: string[] = [];
    if (superlatives.oldest === id) out.push("Oldest");
    if (superlatives.newest === id) out.push("Newest");
    if (superlatives.mostAttempts === id) out.push("Most attempts");
    if (superlatives.mostComplete === id) out.push("Most complete");
    return out;
  }

  function toggleExpanded(f: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  }

  function executeMerge() {
    if (!effectiveSurvivorId) return;
    const wire: Record<string, Selection> = {};
    for (const f of fields) {
      if (selections[f]) wire[f] = toWire(selections[f]);
    }
    scheduleMerge({
      survivorId: effectiveSurvivorId,
      discardedIds: discarded.map((r) => r.id),
      selections: wire,
    });
    setConfirmOpen(false);
    setConfirmVal("");
    navigate({ to: "/users", search: { field: "email", value: email } });
  }

  const shownFields = showAll ? fields : differingFields;
  const colSpan = records.length + 1;

  return (
    <Box minH="100vh" py={12} px={4}>
      <HStack position="fixed" top={3} left={8} zIndex={101} gap={3}>
        <Button
          colorPalette="teal"
          variant="outline"
          size="sm"
          onClick={() =>
            navigate({ to: "/users", search: { field: "email", value: email } })
          }
        >
          <ArrowLeftIcon />
          Back to User Management
        </Button>
        <SignOutButton
          colorPalette="red"
          variant="outline"
          size="sm"
          onClick={() => logout()}
        >
          Logout
        </SignOutButton>
      </HStack>
      <Center>
        <Stack gap={8} w="full" maxW="7xl">
          <Header
            title="Deduplicate User"
            description={
              email
                ? `Consolidate duplicate accounts for ${email}`
                : "Consolidate duplicate accounts"
            }
          />

          {!email ? (
            <Notice>
              No email provided. Return to User Management and search for a user.
            </Notice>
          ) : duplicates.isPending ? (
            <Center py={12}>
              <Spinner color="teal.focusRing" size="xl" />
            </Center>
          ) : duplicates.isError ? (
            <Notice color="red.400">{duplicates.error.message}</Notice>
          ) : records.length < 2 ? (
            <Notice>
              Only {records.length} account found for {email}. Nothing to
              deduplicate.
            </Notice>
          ) : (
            <>
              {/* Per-record overview: age and completeness signals for choosing a survivor. */}
              <Box bg="bg.subtle" borderRadius="xl" p={6} boxShadow="md">
                <Heading size="md" mb={1}>
                  Records ({records.length})
                </Heading>
                <Text color="fg.muted" fontSize="sm" mb={4}>
                  Pick which record to keep. Its ID is retained, so its attempts
                  stay linked; the other records' attempts are re-pointed to it.
                </Text>
                <Flex gap={4} wrap="wrap">
                  {records.map((rec, i) => {
                    const created = objectIdToDate(rec.id);
                    const isSurvivor = rec.id === effectiveSurvivorId;
                    const picture = field(rec, "picture");
                    return (
                      <Box
                        key={rec.id}
                        flex="1 1 260px"
                        borderWidth="2px"
                        borderColor={isSurvivor ? "teal.focusRing" : "border"}
                        borderRadius="lg"
                        p={4}
                      >
                        <Flex justify="space-between" align="center" mb={2}>
                          <Text fontWeight="bold">Account {i + 1}</Text>
                          <Button
                            size="xs"
                            colorPalette="teal"
                            variant={isSurvivor ? "solid" : "outline"}
                            onClick={() => setSurvivorId(rec.id)}
                          >
                            {isSurvivor ? "Keeping" : "Keep this"}
                          </Button>
                        </Flex>
                        <HStack gap={1} mb={2} wrap="wrap">
                          {badgesFor(rec.id).map((b) => (
                            <Badge key={b} colorPalette="purple" size="sm">
                              {b}
                            </Badge>
                          ))}
                        </HStack>
                        <Stack gap={1} fontSize="sm">
                          <Text fontFamily="mono" fontSize="xs" color="fg.muted">
                            {rec.id}
                          </Text>
                          <Text>
                            Created:{" "}
                            {created ? created.toLocaleString() : "unknown"}
                          </Text>
                          <Text>Attempts: {rec.attemptCount}</Text>
                          <Text>
                            Populated fields: {completeness(fields, rec)} /{" "}
                            {fields.length}
                          </Text>
                          <Text>
                            Username: {displayValue(field(rec, "username"))}
                          </Text>
                          {isEmptyValue(picture) ? (
                            <Text>Picture: —</Text>
                          ) : (
                            <HStack>
                              <Text>Picture:</Text>
                              <Image
                                src={String(picture)}
                                boxSize="6"
                                borderRadius="full"
                                alt=""
                              />
                            </HStack>
                          )}
                        </Stack>
                      </Box>
                    );
                  })}
                </Flex>
              </Box>

              {/* Field matrix: scalars pick inline; arrays/objects expand into a recursive editor. */}
              <Box bg="bg.subtle" borderRadius="xl" p={6} boxShadow="md">
                <Flex justify="space-between" align="center" mb={1} gap={4}>
                  <Heading size="md">Choose field values</Heading>
                  <Button
                    size="xs"
                    variant="outline"
                    onClick={() => setShowAll((s) => !s)}
                  >
                    {showAll
                      ? `Show only differing (${differingFields.length})`
                      : `Show all fields (${fields.length})`}
                  </Button>
                </Flex>
                <Text color="fg.muted" fontSize="sm" mb={4}>
                  Scalars: click a value to keep it. Arrays and objects: expand
                  the row to pick specific items, drill into objects within
                  arrays, and source each sub-field per record.
                  {showAll
                    ? ""
                    : ` Showing the ${differingFields.length} field${differingFields.length === 1 ? "" : "s"} that differ; ${fields.length - differingFields.length} identical hidden.`}
                </Text>
                {shownFields.length === 0 ? (
                  <Text color="fg.muted">
                    All fields are identical across records — nothing to choose.
                  </Text>
                ) : (
                  <Box overflowX="auto">
                    <Table.Root size="sm" variant="outline">
                      <Table.Header>
                        <Table.Row>
                          <Table.ColumnHeader>Field</Table.ColumnHeader>
                          {records.map((rec, i) => (
                            <Table.ColumnHeader key={rec.id}>
                              Account {i + 1}
                              {rec.id === effectiveSurvivorId && (
                                <Badge ml={2} colorPalette="teal" size="sm">
                                  survivor
                                </Badge>
                              )}
                            </Table.ColumnHeader>
                          ))}
                        </Table.Row>
                      </Table.Header>
                      <Table.Body>
                        {shownFields.map((f) => {
                          const kind = kinds[f];
                          const complex = kind !== "scalar";
                          const isOpen = expanded.has(f);
                          const sel = selections[f];
                          return (
                            <Fragment key={f}>
                              <Table.Row>
                                <Table.Cell
                                  fontWeight="bold"
                                  verticalAlign="top"
                                >
                                  <Stack gap={1}>
                                    <Text>{f}</Text>
                                    {complex && (
                                      <Button
                                        size="2xs"
                                        variant="outline"
                                        colorPalette="purple"
                                        onClick={() => toggleExpanded(f)}
                                      >
                                        {isOpen ? (
                                          <ChevronDownIcon />
                                        ) : (
                                          <ChevronRightIcon />
                                        )}
                                        {kind === "array"
                                          ? "Edit items"
                                          : "Edit fields"}
                                      </Button>
                                    )}
                                  </Stack>
                                </Table.Cell>
                                {records.map((rec) => {
                                  const value = field(rec, f);
                                  const empty = isEmptyValue(value);
                                  if (complex) {
                                    return (
                                      <Table.Cell
                                        key={rec.id}
                                        verticalAlign="top"
                                        color={empty ? "fg.muted" : undefined}
                                        maxW="240px"
                                      >
                                        <Text truncate>
                                          {displayValue(value)}
                                        </Text>
                                      </Table.Cell>
                                    );
                                  }
                                  const selected =
                                    sel?.kind === "pick" &&
                                    sel.sourceId === rec.id;
                                  return (
                                    <Table.Cell
                                      key={rec.id}
                                      verticalAlign="top"
                                      onClick={() =>
                                        setFieldSel(f, {
                                          kind: "pick",
                                          sourceId: rec.id,
                                        })
                                      }
                                      cursor="pointer"
                                      bg={selected ? "teal.subtle" : undefined}
                                      borderLeftWidth={selected ? "3px" : "1px"}
                                      borderLeftColor={
                                        selected ? "teal.focusRing" : "border"
                                      }
                                      color={empty ? "fg.muted" : undefined}
                                      maxW="240px"
                                    >
                                      <Text
                                        truncate
                                        title={
                                          typeof value === "object" && value
                                            ? JSON.stringify(value)
                                            : String(value ?? "")
                                        }
                                      >
                                        {displayValue(value)}
                                      </Text>
                                    </Table.Cell>
                                  );
                                })}
                              </Table.Row>
                              {complex && isOpen && sel && (
                                <Table.Row>
                                  <Table.Cell colSpan={colSpan} bg="bg">
                                    <SelectionEditor
                                      sources={recordSources(f)}
                                      sel={sel}
                                      depth={0}
                                      onChange={(next) => setFieldSel(f, next)}
                                    />
                                  </Table.Cell>
                                </Table.Row>
                              )}
                            </Fragment>
                          );
                        })}
                      </Table.Body>
                    </Table.Root>
                  </Box>
                )}
              </Box>

              {/* Live preview of the merge outcome. */}
              <Box
                bg="bg.subtle"
                borderRadius="xl"
                p={6}
                boxShadow="md"
                borderWidth="1px"
                borderColor="teal.focusRing"
              >
                <Heading size="md" mb={4}>
                  Merge preview
                </Heading>
                <Stack gap={2} fontSize="sm">
                  <Text>
                    Surviving record (kept):{" "}
                    <Text as="span" fontFamily="mono">
                      {effectiveSurvivorId}
                    </Text>
                  </Text>
                  {shownFields.map((f) => (
                    <Text key={f}>
                      {f}:{" "}
                      <Text as="span" fontWeight="bold">
                        {displayValue(mergedValue(f))}
                      </Text>
                    </Text>
                  ))}
                  <Text color="fg.muted" mt={2}>
                    {discarded.length} record
                    {discarded.length === 1 ? "" : "s"} will be deleted (
                    {discarded.map((r) => r.id).join(", ")}), and{" "}
                    {attemptsToRepoint} attempt
                    {attemptsToRepoint === 1 ? "" : "s"} re-pointed to the
                    survivor.
                  </Text>
                </Stack>
                <Button
                  mt={4}
                  colorPalette="red"
                  onClick={() => setConfirmOpen(true)}
                >
                  <GitMergeIcon />
                  Merge accounts
                </Button>
              </Box>
            </>
          )}
        </Stack>
      </Center>

      <Dialog.Root
        open={confirmOpen}
        onOpenChange={() => {
          setConfirmVal("");
          setConfirmOpen(false);
        }}
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content backgroundColor="gray.700" color="white">
              <Dialog.Header>Merge accounts</Dialog.Header>
              <Dialog.Body>
                <Text>
                  This is a destructive action. It writes the selected values to
                  the surviving record, deletes {discarded.length} other record
                  {discarded.length === 1 ? "" : "s"}, and re-points{" "}
                  {attemptsToRepoint} attempt
                  {attemptsToRepoint === 1 ? "" : "s"}. You will have 10 seconds
                  to undo.
                </Text>
                <Field.Root invalid={confirmVal !== CONFIRM_PHRASE} mt={4}>
                  <Field.Label>Confirmation</Field.Label>
                  <Input
                    value={confirmVal}
                    onChange={(e) => setConfirmVal(e.target.value)}
                  />
                  <Field.HelperText color="#c4c8d0">
                    Type "{CONFIRM_PHRASE}" to confirm
                  </Field.HelperText>
                </Field.Root>
              </Dialog.Body>
              <Dialog.Footer>
                <Button
                  colorPalette="blue"
                  mr={3}
                  onClick={() => {
                    setConfirmVal("");
                    setConfirmOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="outline"
                  colorPalette="red"
                  disabled={confirmVal !== CONFIRM_PHRASE}
                  onClick={executeMerge}
                >
                  Merge accounts
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </Box>
  );
}

// Recursive editor: scalars are a row of source buttons; objects recurse per sub-key; arrays list
// item groups (matched across records by identity) with an include toggle and a recursive editor
// for each item — so objects within arrays and arrays within objects are all editable.
function SelectionEditor({
  sources,
  sel,
  onChange,
  depth,
}: {
  sources: Source[];
  sel: USel;
  onChange: (next: USel) => void;
  depth: number;
}) {
  // Composite nodes start open near the top and collapsed deeper, to keep the tree scannable.
  const [open, setOpen] = useState(depth < 2);

  if (sel.kind === "pick") {
    return (
      <Flex gap={2} wrap="wrap">
        {sources.map((s) => {
          const selected = sel.sourceId === s.id;
          return (
            <Button
              key={s.id}
              size="xs"
              variant={selected ? "solid" : "outline"}
              colorPalette={selected ? "teal" : "gray"}
              onClick={() => onChange({ kind: "pick", sourceId: s.id })}
              maxW="52ch"
              justifyContent="flex-start"
            >
              <Text truncate>
                {s.label}: {displayValue(s.value)}
              </Text>
            </Button>
          );
        })}
      </Flex>
    );
  }

  const summary =
    sel.kind === "array"
      ? `${sel.groups.filter((g) => g.included).length}/${sel.groups.length} item${sel.groups.length === 1 ? "" : "s"}`
      : `${Object.keys(sel.fields).length} field${Object.keys(sel.fields).length === 1 ? "" : "s"}`;

  return (
    <Box pl={depth > 0 ? 3 : 0} borderLeftWidth={depth > 0 ? "1px" : undefined}>
      <Button
        size="2xs"
        variant="ghost"
        colorPalette="teal"
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
        {sel.kind === "array" ? "Array" : "Object"} · {summary}
      </Button>
      {open &&
        (sel.kind === "object" ? (
          <Stack gap={2} mt={1}>
            {objectKeysOf(sources).map((k) => (
              <Box key={k}>
                <Text fontSize="xs" fontWeight="bold" color="fg.muted">
                  {k}
                </Text>
                <SelectionEditor
                  sources={subSourcesFor(sources, k)}
                  sel={sel.fields[k] ?? { kind: "pick", sourceId: sources[0]?.id ?? "" }}
                  depth={depth + 1}
                  onChange={(next) =>
                    onChange({
                      ...sel,
                      fields: { ...sel.fields, [k]: next },
                    })
                  }
                />
              </Box>
            ))}
          </Stack>
        ) : (
          <Stack gap={2} mt={1}>
            {sel.groups.map((g, gi) => {
              const ms = memberSourcesFor(sources, g.members);
              const fromLabels = ms.map((m) => m.label).join(", ");
              return (
                <Box key={g.id} opacity={g.included ? 1 : 0.5}>
                  <HStack gap={2} align="start">
                    <Button
                      size="2xs"
                      minW="6"
                      variant={g.included ? "solid" : "outline"}
                      colorPalette={g.included ? "teal" : "gray"}
                      onClick={() =>
                        onChange({
                          ...sel,
                          groups: sel.groups.map((x, ix) =>
                            ix === gi ? { ...x, included: !x.included } : x,
                          ),
                        })
                      }
                    >
                      {g.included ? "✓" : ""}
                    </Button>
                    <Text fontSize="xs" fontFamily="mono" color="fg.muted">
                      {g.id} · from {fromLabels}
                    </Text>
                  </HStack>
                  {g.included && (
                    <Box pl={4} mt={1}>
                      <SelectionEditor
                        sources={ms}
                        sel={g.selection}
                        depth={depth + 1}
                        onChange={(next) =>
                          onChange({
                            ...sel,
                            groups: sel.groups.map((x, ix) =>
                              ix === gi ? { ...x, selection: next } : x,
                            ),
                          })
                        }
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </Stack>
        ))}
    </Box>
  );
}

function Notice({
  children,
  color = "fg.muted",
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <Center py={12}>
      <Text color={color} fontSize="lg">
        {children}
      </Text>
    </Center>
  );
}

interface UserDeduplicateSearch {
  email?: string;
}

export const userDeduplicateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/user/deduplicate",
  validateSearch: (search: Record<string, unknown>): UserDeduplicateSearch => ({
    email: typeof search.email === "string" ? search.email : undefined,
  }),
  component: () => (
    <ProtectedRoute>
      <UserDeduplicate />
    </ProtectedRoute>
  ),
});
