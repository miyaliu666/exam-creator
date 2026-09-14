import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";

import { RegistryItemRuleEditor } from "./registry-item-rule-editor";
import { RegistryDifficultyEditor } from "./registry-difficulty-editor";
import { SelectField } from "./registry-form-controls";
import { RegistryReviewRulesEditor } from "./registry-review-rules-editor";
import type { SharedRegistrySelection } from "./registry-shared-edit-dialog";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import type { RegistryCapability } from "./types";

export function RegistryItemRulesDetail({ snapshot, update, disabled, capability, contextId, difficultyLevel, registryVersionId, expectedRevision, published,
  onSelect, onContextChange, onDifficultyChange, onEditShared, onViewContent, onReviewDirty, focus, onRemoved,
}: SharedRegistryEditorProps & {
  capability: RegistryCapability; contextId: string; difficultyLevel: string; registryVersionId: string; expectedRevision: number;
  onSelect: (capability: RegistryCapability) => boolean; onContextChange: (id: string) => void; onDifficultyChange: (id: string) => void;
  onEditShared: (selection: SharedRegistrySelection) => void;
  onViewContent: (ruleId: string, contextId?: string) => void;
  onReviewDirty: (dirty: boolean) => void;
  onRemoved?: () => void;
  focus?: { section: "item" | "difficulty" | "content"; sequence: number };
  published?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [sectionFocus, setSectionFocus] = useState<{ section: string; sequence: number }>();
  const showSection = (section: string) => {
    if (section === "content") { onViewContent(capability.itemRuleId, contextId); return; }
    setSectionFocus((current) => ({ section, sequence: (current?.sequence ?? 0) + 1 }));
  };
  useEffect(() => { if (focus) showSection(focus.section); }, [focus]);
  useEffect(() => {
    if (!sectionFocus) return;
    const frame = window.requestAnimationFrame(() => {
      const target = sectionFocus.section === "item" ? panel.current?.parentElement
        : panel.current?.querySelector<HTMLElement>(`[data-rule-section="${sectionFocus.section}"]`);
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sectionFocus]);
  const editor = { snapshot, update, disabled };
  const currentContext = snapshot.contextOptions.find((entry) => entry.id === contextId);
  const editSource = (sourceRef: string) => {
    const prefix = sourceRef.split(".")[0];
    if (prefix === "contexts") { onEditShared({ section: "contexts", selectedId: contextId }); return; }
    if (prefix === "scoring") { onEditShared({ section: "scoring", selectedId: sourceRef.slice("scoring.".length) }); return; }
    if (prefix === "content") { showSection("content"); return; }
    const section = panel.current?.querySelector<HTMLElement>(`[data-rule-section="${prefix === "difficulty" ? "difficulty" : prefix === "review" ? "review" : "item"}"]`);
    section?.querySelectorAll("details").forEach((details) => { details.open = true; });
    section?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return <Stack gap={5} ref={panel} css={{ "& [data-rule-section]": { scrollMarginTop: "10rem" } }}>
    <HStack gap={2} flexWrap="wrap" role="group" aria-label="Jump to rule section">
      <Text fontSize="sm" color="fg.muted">Adjust:</Text>
      <Button size="sm" variant="outline" onClick={() => showSection("contexts")}>Contexts</Button>
      <Button size="sm" variant="outline" onClick={() => showSection("difficulty")}>Difficulty</Button>
      <Button size="sm" variant="outline" onClick={() => showSection("content")}>View available content</Button>
      <Button size="sm" variant="outline" onClick={() => showSection("review")}>Review rules</Button>
    </HStack>
    <Box data-rule-section="item"><RegistryItemRuleEditor {...editor} capability={capability} onSelect={onSelect} onRemoved={onRemoved}
      onManageContexts={(id) => onEditShared({ section: "contexts", selectedId: id ?? contextId })}
      onEditCanDo={(id) => onEditShared({ section: "canDo", selectedId: id })}
      onEditScoring={(id) => onEditShared({ section: "scoring", selectedId: id })} />
    </Box>
    <Box data-rule-section="difficulty" borderTopWidth="1px" pt={4}>
      <Text fontWeight="semibold" mb={3}>Difficulty</Text>
      <Text fontSize="sm" color="fg.muted" mb={3}>These difficulty profiles apply to all allowed Contexts for these item rules.</Text>
      <RegistryDifficultyEditor {...editor} capability={capability} selectedLevel={difficultyLevel} onSelectLevel={onDifficultyChange} />
    </Box>
    <Box borderTopWidth="1px" pt={4}>
      <HStack align="end" gap={3}>
        <SelectField label="Current Context" value={contextId} placeholder="Select Context" options={capability.allowedContextIds.map((id) => ({ id, label: snapshot.contextOptions.find((entry) => entry.id === id)?.label ?? "Missing Context" }))} onChange={onContextChange} />
        <Button size="sm" variant="outline" onClick={() => onEditShared({ section: "contexts", selectedId: contextId })}>{disabled ? "View Context" : "Edit Context"}</Button>
      </HStack>
      {currentContext ? <Text mt={3} fontSize="sm" whiteSpace="pre-wrap">{currentContext.scope}</Text> : null}
    </Box>
    <Box data-rule-section="review">
      <RegistryReviewRulesEditor {...editor} capability={capability} registryVersionId={registryVersionId} expectedRevision={expectedRevision} published={published} onStagedDirtyChange={onReviewDirty} onEditSource={editSource} />
    </Box>
  </Stack>;
}
