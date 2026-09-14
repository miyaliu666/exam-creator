import { Box, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import { CONTENT_LANGUAGE_OPTIONS, contentLanguage } from "./content-language";
import type { ContentIdOption } from "./types";

export function ContentLanguageOverview({ entries, selected, onSelect }: {
  entries: ContentIdOption[];
  selected: string;
  onSelect: (language: string) => void;
}) {
  return <Stack gap={3}>
    <HStack justify="space-between"><Text fontWeight="medium">Browse by language</Text><Button size="xs" variant={selected ? "plain" : "subtle"} aria-pressed={!selected} onClick={() => onSelect("")}>All languages · {entries.length}</Button></HStack>
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      {CONTENT_LANGUAGE_OPTIONS.map(({ id, label }) => {
        const contents = entries.filter((entry) => contentLanguage(entry) === id);
        const count = (kind: string) => contents.filter((entry) => entry.kind === kind).length;
        return <Button key={id} height="auto" py={4} px={4} justifyContent="start" textAlign="left" variant="outline" borderColor={selected === id ? "teal.500" : undefined} bg={selected === id ? "teal.subtle" : undefined} aria-pressed={selected === id} aria-label={`Browse ${label}`} onClick={() => onSelect(id)}>
          <Box><Text fontWeight="semibold">{label}</Text><Text fontSize="xs" fontWeight="normal" color="fg.muted" mt={1}>{count("lexical")} vocabulary · {count("grammar")} grammar · {contents.length} total</Text></Box>
        </Button>;
      })}
    </SimpleGrid>
  </Stack>;
}
