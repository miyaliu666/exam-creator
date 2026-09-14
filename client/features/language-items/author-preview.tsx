import { Box, Button, Grid, Heading, HStack, Stack, Text, Textarea } from "@chakra-ui/react";
import { lazy, Suspense, useState } from "react";

import { translationRows, type TranslationRow } from "./english-translations";
import { contentLanguageLabel } from "./content-language";
import { CandidateRenderer } from "./renderer-registry";
import type { CandidatePayload, EnglishTranslation, ExerciseTemplateAuthorData } from "./types";
const ExerciseTemplateAuthorPreview = lazy(() => import("./exercise-template-author-preview").then((module) => ({ default: module.ExerciseTemplateAuthorPreview })));

interface AuthorPreviewProps {
  language?: string;
  rendererId: string;
  payload: CandidatePayload;
  englishTranslations?: readonly EnglishTranslation[];
  onTranslationChange?: (path: string, englishText: string) => void;
  showLegacyHeading?: boolean;
  exerciseTemplate?: ExerciseTemplateAuthorData;
}

function TranslationTable({ rows, onChange, language }: {
  language: string;
  rows: TranslationRow[];
  onChange?: (path: string, englishText: string) => void;
}) {
  return (
    <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4} p={3} bg="bg.subtle" fontWeight="semibold" fontSize="sm">
        <Text>{contentLanguageLabel(language)}</Text><Text>English</Text>
      </Grid>
      {rows.map((row) => (
        <Box key={row.path} borderTopWidth="1px" p={3}>
          <Text fontSize="xs" color="fg.muted" mb={2}>{row.label}</Text>
          <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={4} alignItems="start">
            <Text lang={language === "zh" ? "zh-Hans" : language} whiteSpace="pre-wrap" overflowWrap="anywhere">{row.sourceText}</Text>
            {onChange ? (
              <Textarea aria-label={`${row.label} · English`} lang="en" rows={2} resize="vertical"
                value={row.englishText} placeholder={row.status === "stale" ? "Update English for the edited source text" : "English translation"}
                onChange={(event) => onChange(row.path, event.target.value)} />
            ) : row.status === "current" ? (
              <Text lang="en" whiteSpace="pre-wrap" overflowWrap="anywhere">{row.englishText}</Text>
            ) : (
              <Text fontSize="sm" color={row.status === "stale" ? "fg.warning" : "fg.muted"}>
                {row.status === "stale" ? "Translation needs updating" : "Translation unavailable"}
              </Text>
            )}
          </Grid>
        </Box>
      ))}
    </Box>
  );
}

/** English stays in an author view; the candidate renderer receives the original payload. */
export function AuthorPreview({ rendererId, payload, englishTranslations, onTranslationChange, showLegacyHeading = true, exerciseTemplate, language = "zh" }: AuthorPreviewProps) {
  const [view, setView] = useState<"bilingual" | "candidate" | "template">("bilingual");
  const hasTranslations = language !== "en" && !!englishTranslations?.length;
  return (
    <Stack gap={3}>
      {hasTranslations || exerciseTemplate ? (
        <HStack gap={2} flexWrap="wrap">
          {hasTranslations ? <Button size="sm" variant={view === "bilingual" ? "solid" : "outline"} colorPalette="teal"
            aria-pressed={view === "bilingual"} onClick={() => setView("bilingual")}>Bilingual</Button> : null}
          <Button size="sm" variant={view === "candidate" ? "solid" : "outline"} colorPalette="teal"
            aria-pressed={view === "candidate"} onClick={() => setView("candidate")}>Candidate preview</Button>
          {exerciseTemplate ? <Button size="sm" variant={view === "template" ? "solid" : "outline"} colorPalette="teal"
            aria-pressed={view === "template"} onClick={() => setView("template")}>Author preview</Button> : null}
        </HStack>
      ) : showLegacyHeading ? <Heading size="md">Candidate preview</Heading> : null}
      {exerciseTemplate && view === "template" ? <Suspense fallback={<Text>Loading author preview…</Text>}><ExerciseTemplateAuthorPreview exerciseType={exerciseTemplate.exerciseType} value={exerciseTemplate.data} body={exerciseTemplate.body} /></Suspense> : hasTranslations && view === "bilingual" ? (
        <TranslationTable language={language} rows={translationRows(payload, englishTranslations)} onChange={onTranslationChange} />
      ) : <CandidateRenderer rendererId={rendererId} payload={payload} />}
    </Stack>
  );
}
