import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  createLanguageAssessmentRegistryDraft,
  getLanguageAssessmentRegistryImpact, getLanguageAssessmentRegistryVersion,
  getLanguageAssessmentRegistryVersions, publishLanguageAssessmentRegistryDraft,
  saveLanguageAssessmentRegistryDraft, validateLanguageAssessmentRegistryDraft,
} from "./api";
import { registryDraftIsStale, registryRecordKey, registryWriteValidation, selectRegistryForEditing, shouldAdoptRegistryRecord } from "./registry-workflow";
import { simplifyRegistryContent } from "./simple-language-content";
import type { UpdateRegistry } from "./registry-rule-editor";
import type { RegistryImpact, RegistryValidationResult, RegistryVersionRecord } from "./types";

export interface RegistryPublication {
  record: RegistryVersionRecord;
  validation: RegistryValidationResult;
  impact: RegistryImpact;
}
type Action = "save" | "prepare" | "publish" | "restart";
interface Result {
  record?: RegistryVersionRecord;
  validation?: RegistryValidationResult;
  impact?: RegistryImpact;
  publication?: RegistryPublication;
  notice?: string;
  warnings?: string[];
}

export function useRegistrySettings(email: string | undefined, stagedDirty = false) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState("");
  const [record, setRecord] = useState<RegistryVersionRecord | null>(null);
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<Result>({});
  const [error, setError] = useState("");
  const [publication, setPublication] = useState<RegistryPublication | null>(null);
  const [editorReset, setEditorReset] = useState(0);
  const versionsQuery = useQuery({ queryKey: ["language-assessment-registry-versions", email], queryFn: getLanguageAssessmentRegistryVersions, enabled: !!email });
  const recordQuery = useQuery({ queryKey: ["language-assessment-registry-version", selectedId], queryFn: () => getLanguageAssessmentRegistryVersion(selectedId), enabled: !!selectedId && !!email });
  const activeVersion = versionsQuery.data?.find((entry) => entry.active)?.version;
  const staleBase = !!record && registryDraftIsStale(record, activeVersion);
  const editable = record?.status === "draft" && record.createdBy === email;

  const adopt = (next: RegistryVersionRecord) => {
    queryClient.setQueryData(["language-assessment-registry-version", next.id], next);
    const local = structuredClone(next);
    if (local.status === "draft" && local.createdBy === email) local.snapshot = simplifyRegistryContent(local.snapshot);
    setRecord(local);
    setSelectedId(next.id);
    setDirty(local.snapshot !== next.snapshot && JSON.stringify(local.snapshot) !== JSON.stringify(next.snapshot));
  };
  const operation = useMutation({
    mutationFn: async (action: Action): Promise<Result> => {
      setError("");
      if (action === "restart") return { record: await createLanguageAssessmentRegistryDraft() };
      if (stagedDirty) throw new Error("Apply or cancel the open edits first.");
      if (!record || !editable) throw new Error("Open your own draft before changing settings.");
      if (action === "save") {
        if (!dirty) return {};
        return { record: await saveLanguageAssessmentRegistryDraft({ id: record.id, expectedRevision: record.revision, version: record.version, snapshot: record.snapshot }) };
      }
      if (dirty) throw new Error("Save changes first.");
      if (action === "publish") {
        if (!publication || registryRecordKey(publication.record) !== registryRecordKey(record)) throw new Error("Check the current draft before publishing.");
        const published = await publishLanguageAssessmentRegistryDraft(record.id, record.revision, publication.impact.activeVersion);
        return { record: published, warnings: published.publicationWarnings };
      }
      const validation = await validateLanguageAssessmentRegistryDraft(record.id, record.revision);
      if (!validation.valid) return { validation };
      const impact = await getLanguageAssessmentRegistryImpact(record.id, record.revision);
      if (impact.staleBase) return { validation, impact, notice: "Published settings changed. Start a new draft from published settings." };
      return { validation, impact, publication: { record, validation, impact } };
    },
    onSuccess: async (result, action) => {
      if (result.record) adopt(result.record);
      if (action === "restart") setEditorReset((current) => current + 1);
      setFeedback(result.publication ? {} : result);
      setPublication(result.publication ?? null);
      if (["save", "publish", "restart"].includes(action)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-versions"] }),
          queryClient.invalidateQueries({ queryKey: ["language-item-registry"], exact: true }),
        ]);
      }
    },
    onError: (failure, action) => {
      setPublication(null);
      const validation = registryWriteValidation(failure.message);
      if (validation) setFeedback({ validation });
      setError(validation ? `${action === "save" ? "Language content needs" : "Settings need"} fixes. Your changes have been kept.` : failure.message);
      void queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-versions"] });
      void queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-version", selectedId] });
    },
  });
  const busy = operation.isPending;
  useBlocker({ shouldBlockFn: () => busy || ((dirty || stagedDirty) && !window.confirm("Discard unsaved settings?")), enableBeforeUnload: dirty || stagedDirty || busy, disabled: !dirty && !stagedDirty && !busy });

  useEffect(() => {
    if (selectedId || !versionsQuery.data?.length) return;
    const selected = selectRegistryForEditing(versionsQuery.data, email);
    if (selected) setSelectedId(selected.id);
  }, [selectedId, versionsQuery.data, email]);
  useEffect(() => {
    const incoming = recordQuery.data;
    if (!incoming || !shouldAdoptRegistryRecord(record, incoming, dirty || stagedDirty, busy)) return;
    const local = structuredClone(incoming);
    if (local.status === "draft" && local.createdBy === email) local.snapshot = simplifyRegistryContent(local.snapshot);
    setRecord(local);
    setDirty(JSON.stringify(local.snapshot) !== JSON.stringify(incoming.snapshot));
    setFeedback({});
    setPublication(null);
  }, [recordQuery.data, record, dirty, stagedDirty, busy]);

  const update: UpdateRegistry = (mutate) => {
    if (!editable || busy || publication || !record) return;
    const next = structuredClone(record);
    mutate(next.snapshot);
    next.snapshot = simplifyRegistryContent(next.snapshot);
    if (JSON.stringify(next.snapshot) === JSON.stringify(record.snapshot)) return;
    setRecord(next);
    setDirty(true);
    setFeedback({});
    setError("");
  };
  const remoteChanged = !!record && !!recordQuery.data && recordQuery.data.id === record.id && recordQuery.data.revision > record.revision;
  const reload = () => {
    if (busy || !recordQuery.data || ((dirty || stagedDirty) && !window.confirm("Discard local changes and load the saved draft?"))) return;
    adopt(recordQuery.data);
    setEditorReset((current) => current + 1);
    setFeedback({});
    setError("");
    setPublication(null);
  };
  const restart = () => {
    if (record?.status === "draft" && !window.confirm("Start from the latest published settings? The saved draft is retained; unsaved changes will be discarded.")) return;
    operation.mutate("restart");
  };
  const retryLoad = () => {
    if (busy) return;
    void versionsQuery.refetch();
    if (selectedId) void recordQuery.refetch();
  };
  return {
    record, dirty, busy, editable, staleBase, remoteChanged, update, reload, restart, retryLoad, editorReset,
    feedback, publication, closePublication: () => !busy && setPublication(null),
    run: operation.mutate, action: busy ? operation.variables : undefined,
    error,
    loadError: recordQuery.error?.message || versionsQuery.error?.message,
    refreshing: versionsQuery.isFetching || recordQuery.isFetching,
    loading: versionsQuery.isPending || (!!selectedId && recordQuery.isPending)
      || (!selectedId && !!selectRegistryForEditing(versionsQuery.data ?? [], email))
      || (!record && !!recordQuery.data),
  };
}
