import { Button, HStack, Menu, Portal, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { ContentCatalog, type ContentRuleFocus } from "./content-catalog";
import { ExerciseSettingsWorkspace } from "./exercise-settings-workspace";
import { capabilityKey } from "./registry-capability";
import { RegistryItemRulesDetail } from "./registry-item-rules-detail";
import { createRegistryTextFormatter, RegistryTextContext } from "./registry-reference-labels";
import { RegistrySettingsNavigation } from "./registry-settings-navigation";
import { RegistrySharedEditDialog, type SharedRegistrySelection } from "./registry-shared-edit-dialog";
import type { SharedRegistryEditorProps } from "./registry-shared-edit-model";
import { useRegistryEditorDirty, useRegistryEditorNavigation } from "./use-registry-editor-state";
import type { RegistryCapability } from "./types";

export type { UpdateRegistry } from "./registry-shared-edit-model";

export function RegistryRuleEditor({ snapshot, update, disabled, onStagedDirtyChange, registryVersionId, expectedRevision, published }: SharedRegistryEditorProps & {
  onStagedDirtyChange?: (dirty: boolean) => void; registryVersionId: string; expectedRevision: number; published?: boolean;
}) {
  const displayText = useMemo(() => createRegistryTextFormatter(snapshot), [snapshot]);
  const { view, navigate } = useRegistryEditorNavigation();
  const { dirty, callbacks } = useRegistryEditorDirty(onStagedDirtyChange);
  const [rulesPage, setRulesPage] = useState<"overview" | "detail">("overview");
  const [contentFocus, setContentFocus] = useState<ContentRuleFocus>();
  const [selectedKey, setSelectedKey] = useState("");
  const [requestedExerciseRule, setRequestedExerciseRule] = useState<{ id: string; sequence: number }>();
  const [contextId, setContextId] = useState("");
  const [difficultyLevel, setDifficultyLevel] = useState("LowerA1");
  const [detailFocus, setDetailFocus] = useState<{ section: "item" | "difficulty" | "content"; sequence: number }>();
  const [shared, setShared] = useState<SharedRegistrySelection>();
  const [pendingRules, setPendingRules] = useState<{ key: string; contextId?: string; level?: string; focus?: "difficulty" | "content" }>();
  const discardNotice = useRef<HTMLDivElement>(null);
  const editScroll = useRef(0);
  useEffect(() => { if (pendingRules) discardNotice.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }, [pendingRules]);
  const capability = snapshot.capabilities.find((entry) => capabilityKey(entry) === selectedKey);
  const editor = { snapshot, update, disabled };
  const rulesActive = view.startsWith("rules:");
  const unappliedView = dirty.newRules && view !== "rules:overview" ? "rules:overview"
    : dirty.review && view !== "rules:detail" ? "rules:detail"
      : dirty.catalog && view !== "content:directory" ? "content:directory" : undefined;
  const returnToEdits = () => {
    if (!unappliedView) return;
    if (unappliedView === "rules:overview" || unappliedView === "rules:detail") setRulesPage(unappliedView === "rules:detail" ? "detail" : "overview");
    navigate(unappliedView);
  };
  const openContent = (ruleId: string, contextId?: string) => {
    setContentFocus({ ruleId, contextId });
    navigate("content:directory");
  };
  const selectRules = (entry: RegistryCapability, id?: string, level?: string, focus?: "difficulty" | "content") => {
    if (entry.itemFormatId.startsWith("EXERCISE:")) {
      const ruleId = entry.itemRuleId;
      if (snapshot.exerciseTemplateRules?.some((rule) => rule.id === ruleId)) {
        setRequestedExerciseRule((current) => ({ id: ruleId, sequence: (current?.sequence ?? 0) + 1 }));
        setRulesPage("overview"); navigate("rules:overview"); setPendingRules(undefined); return;
      }
    }
    setSelectedKey(capabilityKey(entry)); setContextId(id ?? entry.allowedContextIds[0] ?? "");
    setDifficultyLevel(level ?? "LowerA1"); setRulesPage("detail"); navigate("rules:detail");
    setDetailFocus((current) => ({ section: focus ?? "item", sequence: (current?.sequence ?? 0) + 1 }));
    setPendingRules(undefined);
  };
  const openRules = (entry: RegistryCapability, id?: string, level?: string, focus?: "difficulty" | "content") => {
    const changed = capabilityKey(entry) !== selectedKey;
    if (changed && dirty.review) { editScroll.current = window.scrollY; setPendingRules({ key: capabilityKey(entry), contextId: id, level, focus }); return false; }
    selectRules(entry, id, level, focus);
    return true;
  };
  const confirmRuleChange = () => {
    const selected = snapshot.capabilities.find((entry) => capabilityKey(entry) === pendingRules?.key);
    if (!selected || !pendingRules) return;
    if (selected.itemFormatId.startsWith("EXERCISE:")) {
      setSelectedKey("");
      callbacks.review(false);
    }
    selectRules(selected, pendingRules.contextId, pendingRules.level, pendingRules.focus);
  };
  const keepEditing = () => {
    setPendingRules(undefined); setRulesPage("detail");
    if (view === "rules:detail") window.scrollTo({ top: editScroll.current, behavior: "smooth" });
    else navigate("rules:detail");
  };
  return <RegistryTextContext.Provider value={displayText}>
    <Stack gap={5}>
      <RegistrySettingsNavigation rulesActive={rulesActive} onItemRules={() => navigate(`rules:${rulesPage}`)} onLanguageContent={() => navigate("content:directory")} />
      {unappliedView ? <HStack gap={3} flexWrap="wrap" role="status">
        <Text fontSize="sm">{unappliedView.startsWith("rules:") ? "Item rules have unapplied changes." : "Language content has unapplied changes."}</Text>
        <Button size="sm" variant="outline" onClick={returnToEdits}>Return to unapplied edits</Button>
      </HStack> : null}
      {pendingRules ? <Stack ref={discardNotice} role="alert" borderWidth="1px" borderRadius="md" p={3}>
        <Text>Discard unapplied changes to the current item rules?</Text>
        <HStack><Button size="sm" colorPalette="red" disabled={!snapshot.capabilities.some((entry) => capabilityKey(entry) === pendingRules.key)} onClick={confirmRuleChange}>Discard and open item rules</Button>
          <Button size="sm" variant="outline" onClick={keepEditing}>Keep editing</Button></HStack>
      </Stack> : null}
      <div hidden={view !== "rules:overview"}>
          <ExerciseSettingsWorkspace {...editor} onEditLegacy={openRules} requestedRule={requestedExerciseRule} onViewContent={openContent}
            onEditCanDo={(id) => setShared({ section: "canDo", selectedId: id })} onStagedDirtyChange={callbacks.newRules} actions={
            <Menu.Root><Menu.Trigger asChild><Button size="sm" variant="outline">Manage definitions</Button></Menu.Trigger>
              <Portal><Menu.Positioner><Menu.Content>
                <Menu.Item value="contexts" onClick={() => setShared({ section: "contexts" })}>Contexts and Domains</Menu.Item>
                <Menu.Item value="canDo" onClick={() => setShared({ section: "canDo" })}>Can-do statements</Menu.Item>
                {snapshot.capabilities.some((entry) => !entry.itemFormatId.startsWith("EXERCISE:")) ? <Menu.Item value="scoring" onClick={() => setShared({ section: "scoring" })}>Existing rule scoring contracts</Menu.Item> : null}
              </Menu.Content></Menu.Positioner></Portal>
            </Menu.Root>
          } />
      </div>
      <div hidden={view !== "rules:detail"}>
        <Stack gap={4} scrollMarginTop="10rem">
          <Button alignSelf="start" size="sm" variant="outline" onClick={() => { setRulesPage("overview"); navigate("rules:overview"); }}>Back to item rules</Button>
          {capability ? <RegistryItemRulesDetail key={selectedKey} {...editor} capability={capability} contextId={contextId} difficultyLevel={difficultyLevel} focus={detailFocus}
            registryVersionId={registryVersionId} expectedRevision={expectedRevision} published={published} onSelect={openRules} onContextChange={setContextId} onDifficultyChange={setDifficultyLevel}
            onEditShared={setShared} onViewContent={openContent} onReviewDirty={callbacks.review}
            onRemoved={() => { setRulesPage("overview"); navigate("rules:overview"); }} />
            : <Text color="fg.muted">The selected item rules are unavailable.</Text>}
        </Stack>
      </div>
      <div hidden={rulesActive}>
        <ContentCatalog {...editor} published={published} onStagedDirtyChange={callbacks.catalog} focus={contentFocus} onClearFocus={() => setContentFocus(undefined)} />
      </div>
      {shared ? <RegistrySharedEditDialog key={JSON.stringify(shared)} {...editor} {...shared} onClose={() => { setShared(undefined); callbacks.shared(false); }} onStagedDirtyChange={callbacks.shared} /> : null}
    </Stack>
  </RegistryTextContext.Provider>;
}
