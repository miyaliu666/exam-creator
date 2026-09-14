import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { useState } from "react";

import { CapabilityContractPanel } from "./capability-contract-panel";
import { contentLanguage, contentLanguageLabel } from "./content-language";
import { DifficultySchemeSummary } from "./difficulty-scheme-summary";
import { ItemSetupDialog } from "./item-setup-dialog";
import { selectedDifficulty, type ItemSetupSelection } from "./item-setup";
import { DIFFICULTY_LABELS, exerciseLabel } from "./labels";
import type { RegistrySnapshot, TaskPackage } from "./types";

export function ItemSetupPanel({ draft, registry, canEdit, onApply }: {
  draft: TaskPackage;
  registry: RegistrySnapshot;
  canEdit: boolean;
  onApply: (selection: ItemSetupSelection) => void;
}) {
  const [editing, setEditing] = useState(false);
  return <>
    <HStack align="start" gap={3}>
      <Box as="details" flex="1" minW="0" borderWidth="1px" borderRadius="lg" p={4}>
        <Text as="summary" cursor="pointer" fontSize="sm">Item setup · {contentLanguageLabel(contentLanguage(draft.content))} · {exerciseLabel(draft.itemFormatId, draft.content.primaryReportedSkill)} · {DIFFICULTY_LABELS[draft.content.difficultyBand]}</Text>
        <Stack mt={3} gap={4}>
          <CapabilityContractPanel draft={draft} registry={registry} />
          <DifficultySchemeSummary difficulty={selectedDifficulty(draft, registry)} />
        </Stack>
      </Box>
      {canEdit ? <Button size="sm" variant="outline" mt={2} onClick={() => setEditing(true)}>Edit item setup</Button> : null}
    </HStack>
    {editing && canEdit ? <ItemSetupDialog draft={draft} registry={registry} onClose={() => setEditing(false)} onApply={(selection) => { onApply(selection); setEditing(false); }} /> : null}
  </>;
}
