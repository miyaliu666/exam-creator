import { Badge, Box, HStack, Stack, Text } from "@chakra-ui/react";

import { contentMasteryLabel } from "./content-catalog-model";
import { contentLanguage, contentLanguageLabel } from "./content-language";
import { CONTENT_KIND_LABELS } from "./labels";
import { languageTargetLabel } from "./language-target-labels";
import type { ContentIdOption, RegistrySnapshot } from "./types";

export function ContentEntryPreview({ entry, snapshot }: { entry: ContentIdOption; snapshot: RegistrySnapshot }) {
  const display = languageTargetLabel(entry);
  const language = contentLanguage(entry);
  const section = (label: string, value: string | undefined) => value?.trim() ? <Stack gap={1}><Text fontSize="sm" fontWeight="semibold">{label}</Text><Text whiteSpace="pre-wrap">{value}</Text></Stack> : null;
  return <Stack gap={5}>
    <Stack gap={2}>
      <HStack><Badge colorPalette="teal">{contentLanguageLabel(language)}</Badge><Badge>{CONTENT_KIND_LABELS[entry.kind] ?? entry.kind}</Badge>{entry.level ? <Badge>{entry.level}</Badge> : null}</HStack>
      <Text fontSize="2xl" fontWeight="semibold" lang={language}>{display.primary}</Text>
      {entry.pinyin ? <Text color="fg.muted">{entry.pinyin}</Text> : null}
    </Stack>
    {section("Meaning", entry.meaning)}
    {section("Structure", entry.pattern ?? display.pattern)}
    {display.english && display.english !== entry.meaning ? section("English meaning", display.english) : null}
    <Stack gap={2}><Text fontSize="sm" fontWeight="semibold">Examples</Text>{entry.examples?.length ? entry.examples.map((example, index) => <Box key={index} borderLeftWidth="3px" borderColor="teal.400" pl={3} py={1}><Text whiteSpace="pre-wrap" lang={language}>{example}</Text></Box>) : <Text color="fg.muted" fontSize="sm">No examples recorded.</Text>}</Stack>
    {section("Usage restrictions", entry.restrictions)}
    {section("Sources", entry.sources?.join("\n"))}
    {section("Notes", entry.notes)}
    <details><summary style={{ cursor: "pointer" }}>Content scope</summary><Stack mt={3} gap={2}><Text fontSize="sm">Mastery: {contentMasteryLabel(entry.masteryScope)}</Text><Text fontSize="sm">Can-do: {entry.canDoIds.length ? entry.canDoIds.map((id) => snapshot.canDoOptions.find((option) => option.id === id)?.label ?? "Unavailable reference").join("; ") : "Not restricted"}</Text></Stack></details>
  </Stack>;
}
