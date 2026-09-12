import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  createLanguageAssessmentRegistryDraft, getLanguageAssessmentRegistryAudit,
  getLanguageAssessmentRegistryImpact, getLanguageAssessmentRegistryVersion,
  getLanguageAssessmentRegistryVersions, publishLanguageAssessmentRegistryDraft,
  saveLanguageAssessmentRegistryDraft, validateLanguageAssessmentRegistryDraft,
} from "./api";
import { registryDraftIsStale, registryRecordKey, registryWriteValidation, selectRegistryForEditing, shouldAdoptRegistryRecord } from "./registry-workflow";
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
  const versionsQuery = useQuery({ queryKey: ["language-assessment-registry-versions", email], queryFn: getLanguageAssessmentRegistryVersions, enabled: !!email });
  const recordQuery = useQuery({ queryKey: ["language-assessment-registry-version", selectedId], queryFn: () => getLanguageAssessmentRegistryVersion(selectedId), enabled: !!selectedId && !!email });
  const auditQuery = useQuery({ queryKey: ["language-assessment-registry-audit", selectedId], queryFn: () => getLanguageAssessmentRegistryAudit(selectedId), enabled: !!selectedId && !!email });
  const activeVersion = versionsQuery.data?.find((entry) => entry.active)?.version;
  const staleBase = !!record && registryDraftIsStale(record, activeVersion);
  const editable = record?.status === "draft" && record.createdBy === email;

  const adopt = (next: RegistryVersionRecord) => {
    queryClient.setQueryData(["language-assessment-registry-version", next.id], next);
    setRecord(structuredClone(next));
    setSelectedId(next.id);
    setDirty(false);
  };
  const operation = useMutation({
    mutationFn: async (action: Action): Promise<Result> => {
      setError("");
      if (action === "restart") return { record: await createLanguageAssessmentRegistryDraft(), notice: "New draft created from published settings." };
      if (stagedDirty) throw new Error("Apply or cancel the language content changes first.");
      if (!record || !editable) throw new Error("Open your own draft before changing settings.");
      if (action === "save") {
        if (!dirty) return { notice: "Draft is already saved." };
        return { record: await saveLanguageAssessmentRegistryDraft({ id: record.id, expectedRevision: record.revision, version: record.version, snapshot: record.snapshot }), notice: "Draft saved. Not published." };
      }
      if (dirty) throw new Error("Save the draft first.");
      if (action === "publish") {
        if (!publication || registryRecordKey(publication.record) !== registryRecordKey(record)) throw new Error("Check the current draft before publishing.");
        const published = await publishLanguageAssessmentRegistryDraft(record.id, record.revision, publication.impact.activeVersion);
        return { record: published, notice: "Published for new items.", warnings: published.publicationWarnings };
      }
      const validation = await validateLanguageAssessmentRegistryDraft(record.id, record.revision);
      if (!validation.valid) return { validation };
      const impact = await getLanguageAssessmentRegistryImpact(record.id, record.revision);
      if (impact.staleBase) return { validation, impact, notice: "Published settings changed. Start a new draft from published settings." };
      return { validation, impact, publication: { record, validation, impact } };
    },
    onSuccess: async (result, action) => {
      if (result.record) adopt(result.record);
      setFeedback(result);
      setPublication(result.publication ?? null);
      if (["save", "publish", "restart"].includes(action)) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-versions"] }),
          queryClient.invalidateQueries({ queryKey: ["language-assessment-registry-audit"] }),
          queryClient.invalidateQueries({ queryKey: ["language-item-registry"], exact: true }),
        ]);
      }
    },
    onError: (failure) => {
      setPublication(null);
      const validation = registryWriteValidation(failure.message);
      if (validation) setFeedback({ validation });
      setError(validation ? "Language content needs fixes. Your changes have been kept." : failure.message);
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
    setRecord(structuredClone(incoming));
    setFeedback({});
    setPublication(null);
  }, [recordQuery.data, record, dirty, stagedDirty, busy]);

  const update: UpdateRegistry = (mutate) => {
    if (!editable || busy || publication || !record) return;
    const next = structuredClone(record);
    mutate(next.snapshot);
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
    setFeedback({});
    setError("");
    setPublication(null);
  };
  const restart = () => {
    if (record?.status === "draft" && !window.confirm("Start from the latest published settings? The saved draft is retained; unsaved changes will be discarded.")) return;
    operation.mutate("restart");
  };
  return {
    record, dirty, busy, editable, staleBase, remoteChanged, update, reload, restart,
    feedback, publication, closePublication: () => !busy && setPublication(null),
    run: operation.mutate, action: busy ? operation.variables : undefined,
    audit: auditQuery.data ?? [], auditError: auditQuery.error?.message,
    error: error || recordQuery.error?.message || versionsQuery.error?.message,
    loading: versionsQuery.isPending || (!!selectedId && recordQuery.isPending),
  };
}
