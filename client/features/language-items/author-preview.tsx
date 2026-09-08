import { Box, Button, Grid, Heading, HStack, Stack, Text, Textarea } from "@chakra-ui/react";
import { useState } from "react";

import { translationRows, type TranslationRow } from "./english-translations";
import { CandidateRenderer } from "./renderer-registry";
import type { CandidatePayload, EnglishTranslation } from "./types";

interface AuthorPreviewProps {
  rendererId: string;
  payload: CandidatePayload;
  englishTranslations?: readonly EnglishTranslation[];
  onTranslationChange?: (path: string, englishText: string) => void;
  showLegacyHeading?: boolean;
}

function TranslationTable({ rows, onChange }: {
  rows: TranslationRow[];
  onChange?: (path: string, englishText: string) => void;
}) {
  return (
    <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4} p={3} bg="bg.subtle" fontWeight="semibold" fontSize="sm">
        <Text>中文</Text><Text>English</Text>
      </Grid>
      {rows.map((row) => (
        <Box key={row.path} borderTopWidth="1px" p={3}>
          <Text fontSize="xs" color="fg.muted" mb={2}>{row.label}</Text>
          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4} alignItems="start">
            <Text lang="zh-Hans" whiteSpace="pre-wrap" overflowWrap="anywhere">{row.sourceText}</Text>
            {onChange ? (
              <Textarea aria-label={`${row.label} · English`} lang="en" rows={2} resize="vertical"
                value={row.englishText} placeholder={row.status === "stale" ? "原文已更改，请更新英文 / Update English for the edited Chinese" : "English translation"}
                onChange={(event) => onChange(row.path, event.target.value)} />
            ) : row.status === "current" ? (
              <Text lang="en" whiteSpace="pre-wrap" overflowWrap="anywhere">{row.englishText}</Text>
            ) : (
              <Text fontSize="sm" color={row.status === "stale" ? "fg.warning" : "fg.muted"}>
                {row.status === "stale" ? "原文已更改，英文待更新 / Translation needs updating" : "暂无英文对照 / Translation unavailable"}
              </Text>
            )}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}

/** English stays in an author view; the candidate renderer receives the original payload. */
export function AuthorPreview({ rendererId, payload, englishTranslations, onTranslationChange, showLegacyHeading = true }: AuthorPreviewProps) {
  const [view, setView] = useState<"bilingual" | "candidate">("bilingual");
  const hasTranslations = !!englishTranslations?.length;
  return (
    <Stack gap={3}>
      {hasTranslations ? (
        <HStack gap={2} flexWrap="wrap">
          <Button size="sm" variant={view === "bilingual" ? "solid" : "outline"} colorPalette="teal"
            aria-pressed={view === "bilingual"} onClick={() => setView("bilingual")}>中英对照 / Bilingual</Button>
          <Button size="sm" variant={view === "candidate" ? "solid" : "outline"} colorPalette="teal"
            aria-pressed={view === "candidate"} onClick={() => setView("candidate")}>Candidate preview</Button>
        </HStack>
      ) : showLegacyHeading ? <Heading size="md">Candidate preview</Heading> : null}
      {hasTranslations && view === "bilingual" ? (
        <TranslationTable rows={translationRows(payload, englishTranslations)} onChange={onTranslationChange} />
      ) : <CandidateRenderer rendererId={rendererId} payload={payload} />}
    </Stack>
  );
}
