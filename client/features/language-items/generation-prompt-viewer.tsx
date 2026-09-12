import { Box, Button, HStack, Stack, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";

import { generationPromptSections } from "./generation-prompt-model";

export function GenerationPromptViewer({ requestBody }: { requestBody: unknown }) {
  const sections = generationPromptSections(requestBody);
  const [selected, setSelected] = useState(0);
  const [copyStatus, setCopyStatus] = useState("");
  const section = sections[selected] ?? sections[0];
  if (!section) return <Text>No prompt was recorded for this request.</Text>;
  return <Stack gap={3} minW={0}>
    <HStack flexWrap="wrap" gap={2}>
      {sections.map((entry, index) => <Button key={`${entry.label}-${index}`} size="sm" variant={section === entry ? "solid" : "outline"}
        aria-pressed={section === entry} onClick={() => { setSelected(index); setCopyStatus(""); }}>{entry.label}</Button>)}
    </HStack>
    <Box minW={0}>
      <Textarea aria-label={section.label} value={section.text} readOnly spellCheck={false} fontFamily="mono" fontSize="sm" h="50vh" minH="220px" resize="vertical" />
    </Box>
    <HStack flexWrap="wrap">
      <Button size="sm" variant="outline" onClick={async () => {
        try { await navigator.clipboard.writeText(section.text); setCopyStatus("Copied"); }
        catch { setCopyStatus("Copy unavailable. Select the text and copy it manually."); }
      }}>Copy {section.label.toLowerCase()}</Button>
      {copyStatus ? <Text role="status" fontSize="sm">{copyStatus}</Text> : null}
    </HStack>
  </Stack>;
}
