import {
  Badge,
  Box,
  Button,
  HStack,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useContext, useEffect, useMemo, useRef, useState } from "react";

import { AuthContext } from "../../contexts/auth";
import {
  createLanguageAssessmentRegistryDraft,
  getLanguageAssessmentRegistryAudit,
  getLanguageAssessmentRegistryImpact,
  getLanguageAssessmentRegistryVersion,
  getLanguageAssessmentRegistryVersions,
  publishLanguageAssessmentRegistryDraft,
  saveLanguageAssessmentRegistryDraft,
  validateLanguageAssessmentRegistryDraft,
} from "./api";
import { RegistryRuleEditor, type UpdateRegistry } from "./registry-rule-editor";
import { registryIssueText } from "./registry-reference-labels";
import type {
  RegistryImpact,
  RegistryValidationResult,
  RegistryVersionRecord,
} from "./types";

export function RegistrySettingsPanel({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const queryClient = useQueryClient();
  const { user } = useContext(AuthContext)!;
  const [selectedId, setSelectedId] = useState("");
  const [record, setRecord] = useState<RegistryVersionRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState("");
  const [validation, setValidation] = useState<RegistryValidationResult | null>(null);
  const [impact, setImpact] = useState<RegistryImpact | null>(null);
  const loadedRecordKey = useRef("");
  const versionsQuery = useQuery({
    queryKey: ["language-assessment-registry-versions"],
    queryFn: getLanguageAssessmentRegistryVersions,
  });
  const recordQuery = useQuery({
    queryKey: ["language-assessment-registry-version", selectedId],
    queryFn: () => getLanguageAssessmentRegistryVersion(selectedId),
    enabled: !!selectedId,
  });
  const auditQuery = useQuery({
    queryKey: ["language-assessment-registry-audit", selectedId],
    queryFn: () => getLanguageAssessmentRegistryAudit(selectedId),
    enabled: !!selectedId,
  });

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useBlocker({
    shouldBlockFn: () => dirty && !window.confirm("Discard unsaved settings?"),
    enableBeforeUnload: dirty,
    disabled: !dirty,
  });

  useEffect(() => {
    if (selectedId || !versionsQuery.data?.length) return;
    const draft = versionsQuery.data.find((entry) => entry.status === "draft" && entry.createdBy === user?.email);
    const active = versionsQuery.data.find((entry) => entry.active);
    setSelectedId((draft ?? active ?? versionsQuery.data[0]).id);
  }, [selectedId, versionsQuery.data, user?.email]);

  useEffect(() => {
    if (!recordQuery.data) return;
    const key = `${recordQuery.data.id}:${recordQuery.data.revision}`;
    if (loadedRecordKey.current === key) return;
    if (dirty && record?.id === recordQuery.data.id) return;
    loadedRecordKey.current = key;
    setRecord(structuredClone(recordQuery.data));
    setDirty(false);
    setValidation(null);
    setImpact(null);
  }, [recordQuery.data, dirty, record?.id]);

  const refresh = async (next?: RegistryVersionRecord) => {
    if (next) {
      loadedRecordKey.current = `${next.id}:${next.revision}`;
      setRecord(structuredClone(next));
      setSelectedId(next.id);
      setDirty(false);
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-versions"] }),
      queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-version"] }),
      queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-audit"] }),
      queryClient.invalidateQueries({ queryKey: ["language-item-registry"] }),
    ]);
  };
  const update: UpdateRegistry = (mutate) => {
    setRecord((current) => {
      if (!current || current.status !== "draft") return current;
      const next = structuredClone(current);
      mutate(next.snapshot);
      return next;
    });
    setDirty(true);
    setValidation(null);
    setImpact(null);
    setNotice("");
  };
  const persist = async () => {
    if (!record || record.status !== "draft") throw new Error("Open settings for editing first.");
    if (!dirty) return record;
    const saved = await saveLanguageAssessmentRegistryDraft({
      id: record.id,
      expectedRevision: record.revision,
      version: record.version,
      snapshot: record.snapshot,
    });
    loadedRecordKey.current = `${saved.id}:${saved.revision}`;
    setRecord(structuredClone(saved));
    setDirty(false);
    return saved;
  };

  const createMutation = useMutation({
    mutationFn: () => createLanguageAssessmentRegistryDraft(),
    onSuccess: async (next) => {
      setNotice("");
      setValidation(null);
      setImpact(null);
      await refresh(next);
    },
  });
  const saveMutation = useMutation({
    mutationFn: persist,
    onSuccess: async (next) => {
      setNotice("Saved.");
      await refresh(next);
    },
  });
  const validateMutation = useMutation({
    mutationFn: async () => {
      const saved = await persist();
      return { saved, result: await validateLanguageAssessmentRegistryDraft(saved.id) };
    },
    onSuccess: async ({ saved, result }) => {
      setValidation(result);
      setNotice("");
      await refresh(saved);
      setValidation(result);
    },
  });
  const impactMutation = useMutation({
    mutationFn: async () => {
      const saved = await persist();
      return { saved, result: await getLanguageAssessmentRegistryImpact(saved.id) };
    },
    onSuccess: async ({ saved, result }) => {
      await refresh(saved);
      setImpact(result);
    },
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!record) throw new Error("Open settings for editing first.");
      const saved = await persist();
      const result = await validateLanguageAssessmentRegistryDraft(saved.id);
      setValidation(result);
      if (!result.valid) throw new Error("Fix the validation errors before publishing.");
      const nextImpact = await getLanguageAssessmentRegistryImpact(saved.id);
      setImpact(nextImpact);
      if (!window.confirm(
        `Publish these settings for new items? ${nextImpact.itemsPinnedToActiveVersion} existing items will keep their original settings.`,
      )) return null;
      return publishLanguageAssessmentRegistryDraft(saved.id);
    },
    onSuccess: async (next) => {
      if (!next) {
        setNotice("Publishing cancelled.");
        return;
      }
      setNotice("Published for new items.");
      await refresh(next);
    },
  });
  const error = useMemo(
    () => recordQuery.error ?? versionsQuery.error ?? [createMutation, saveMutation, validateMutation, impactMutation, publishMutation].find((mutation) => mutation.error)?.error,
    [recordQuery.error, versionsQuery.error, createMutation.error, saveMutation.error, validateMutation.error, impactMutation.error, publishMutation.error],
  );
  const editable = record?.status === "draft" && record.createdBy === user?.email;
  const busy = createMutation.isPending || saveMutation.isPending || validateMutation.isPending || impactMutation.isPending || publishMutation.isPending;

  return (
    <Box borderWidth="1px" borderRadius="xl" bg="bg" overflow="hidden">
      <Stack p={5} gap={5}>
        {recordQuery.isPending || versionsQuery.isPending ? <Spinner /> : null}
        {record ? (
          <Stack gap={4}>
            <HStack justify="space-between" align="end" gap={3} flexWrap="wrap">
              <HStack flexWrap="wrap">
                <Badge colorPalette={record.active ? "teal" : editable ? "orange" : "gray"}>
                  {record.active ? "Published" : editable ? "Draft" : "Published"}
                </Badge>
                {dirty ? <Badge colorPalette="yellow">Unsaved changes</Badge> : null}
                {editable ? (
                  <>
                    <Button variant="outline" disabled={busy} onClick={() => saveMutation.mutate()}>Save</Button>
                    <Button variant="outline" disabled={busy} onClick={() => validateMutation.mutate()}>Validate</Button>
                    <Button variant="outline" disabled={busy} onClick={() => impactMutation.mutate()}>Impact</Button>
                    <Button colorPalette="teal" disabled={busy} onClick={() => publishMutation.mutate()}>Publish</Button>
                  </>
                ) : <Button colorPalette="teal" disabled={busy} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>Edit settings</Button>}
              </HStack>
            </HStack>

            <RegistryRuleEditor key={record.id} snapshot={record.snapshot} update={update} disabled={!editable || busy} />

            <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
              <Text as="summary" cursor="pointer" fontWeight="medium">Change history</Text>
              <Stack gap={2} mt={4}>
                {(auditQuery.data ?? []).map((event) => (
                  <HStack key={event.id} justify="space-between" align="start" gap={3} fontSize="sm">
                    <Text>{event.action.replace(/^registry[._]/, "").replace(/[._]/g, " ")} · {event.actorEmail}</Text>
                    <Text color="fg.muted" whiteSpace="nowrap">{new Date(event.createdAt).toLocaleString()}</Text>
                  </HStack>
                ))}
                {!auditQuery.isPending && !auditQuery.data?.length ? <Text color="fg.muted" fontSize="sm">No audit events recorded.</Text> : null}
              </Stack>
            </Box>
          </Stack>
        ) : null}

        {notice ? <Text color="fg.info">{notice}</Text> : null}
        {error ? <Text color="fg.error">{error.message}</Text> : null}
        {validation ? (
          <Box borderWidth="1px" borderColor={validation.valid ? "teal.300" : "red.300"} borderRadius="lg" p={4}>
            <Text fontWeight="semibold">Validation {validation.valid ? "passed" : "failed"}</Text>
            {validation.issues.map((issue) => (
              <Text
                key={`${issue.code}-${issue.path}`}
                mt={1}
                fontSize="sm"
                color={issue.severity === "error" ? "fg.error" : "fg.warning"}
              >
                {issue.severity === "warning" ? "Warning · " : ""}{record ? registryIssueText(record.snapshot, issue) : issue.message}
              </Text>
            ))}
          </Box>
        ) : null}
        {impact ? (
          <Box borderWidth="1px" borderRadius="lg" p={4}>
            <Text fontWeight="semibold">Changes from published settings</Text>
            <SimpleGrid minChildWidth="170px" gap={2} mt={2} fontSize="sm">
              <Text>
                {impact.itemsPinnedToActiveVersion} existing{" "}
                {impact.itemsPinnedToActiveVersion === 1 ? "item keeps" : "items keep"} original settings
              </Text>
              <Text>{impact.capabilityChanges} task configuration changes</Text>
              <Text>{impact.canDoChanges} Can-do changes</Text>
              <Text>{impact.contextChanges} context changes</Text>
              <Text>{impact.difficultyStandardChanges} difficulty changes</Text>
              <Text>{impact.scoringContractChanges} scoring changes</Text>
            </SimpleGrid>
            {impact.difficultyConfigurationChanges?.length ? (
              <Stack gap={1} mt={3} fontSize="sm">
                <Text fontWeight="medium">Updated difficulty settings</Text>
                {impact.difficultyConfigurationChanges.map((name) => <Text key={name}>{name}</Text>)}
              </Stack>
            ) : null}
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
