import { authorizedFetch } from "../../utils/fetch";

export type LanguageRelation = "unknown" | "understanding" | "requiredProduction" | "opportunity" | "supporting" | "notDemonstrated";
export interface TargetEvidence { targetContentId: string; relation: LanguageRelation; evidence: string }
export interface EvidenceSource { title: string; url: string; usage: "original" | "authorized" | "unverified"; notes: string }
export interface EvidenceFields { targets: TargetEvidence[]; sources: EvidenceSource[]; qualityNotes: string; originalityNotes: string }
export interface ItemEvidence extends EvidenceFields { id: string; itemId: string; contentHash: string; registryVersion: string; reviewedBy: string; createdAt: string }
export interface EvidenceView { revision: number; current: boolean; record: ItemEvidence | null }

export async function getItemEvidence(id: string): Promise<EvidenceView> {
  return (await authorizedFetch(`/api/language-items/${encodeURIComponent(id)}/evidence`)).json();
}
export async function saveItemEvidence(id: string, input: EvidenceFields & { expectedRevision: number }): Promise<EvidenceView> {
  return (await authorizedFetch(`/api/language-items/${encodeURIComponent(id)}/evidence`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })).json();
}
