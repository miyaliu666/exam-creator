import { CONTENT_KIND_LABELS, contentOptionLabel, optionLabel } from "./labels";
import type { RegistryOptionGroup } from "./registry-multi-select";
import type { RegistrySnapshot } from "./types";

const MASTERY_LABELS: Record<string, string> = {
  receptive: "Understanding",
  productive: "Production",
  receptiveProductive: "Understanding and production",
};

export function coverageOptionGroups(registry: RegistrySnapshot): RegistryOptionGroup[] {
  return ["lexical", "grammar", "character", "pragmatics", "supported"].map((kind) => ({
    id: kind,
    label: CONTENT_KIND_LABELS[kind],
    optionIds: registry.contentIdOptions.filter((option) => option.kind === kind).map((option) => option.id),
  })).filter((group) => group.optionIds.length > 0);
}

export function coverageContentOptions(registry: RegistrySnapshot) {
  const baseLabels = new Map(registry.contentIdOptions.map((option) => [option.id, contentOptionLabel(option.id, registry)]));
  const signature = (ids: string[]) => [...new Set(ids)].sort().join("\u0000");
  const options = registry.contentIdOptions.map((option) => {
    const label = baseLabels.get(option.id)!;
    const peers = registry.contentIdOptions.filter((peer) => baseLabels.get(peer.id) === label);
    const details: string[] = [];
    if (peers.length > 1) {
      if (new Set(peers.map((peer) => peer.masteryScope)).size > 1) {
        details.push(MASTERY_LABELS[option.masteryScope ?? ""] ?? option.masteryScope ?? "Mastery scope unspecified");
      }
      if (new Set(peers.map((peer) => signature(peer.contextIds))).size > 1) {
        details.push(`Context: ${option.contextIds.map((id) => optionLabel(id, registry.contextOptions)).join("; ") || "Unrestricted"}`);
      }
      if (new Set(peers.map((peer) => signature(peer.canDoIds))).size > 1) {
        details.push(`Can-do: ${option.canDoIds.map((id) => optionLabel(id, registry.canDoOptions)).join("; ") || "Unrestricted"}`);
      }
    }
    return { id: option.id, label: [label, ...details].join(" · ") };
  });
  // Some registry entries share every exposed meaning and scope field; their
  // canonical references are then the only available distinction for counting.
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
  return options.map((option) => ({
    ...option,
    label: counts.get(option.label)! > 1 ? `${option.label} · Reference: ${option.id}` : option.label,
  }));
}
