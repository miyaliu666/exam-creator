import {
  chakra,
  Box,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react";
import { useState } from "react";

import {
  CONTENT_KIND_LABELS,
  SUPPORTED_CONTENT_LABELS,
  contentOptionLabel,
} from "./labels";
import { isContentOptionCompatible } from "./content-compatibility";
import { informationPointSuggestions } from "./information-point-suggestions";
import { hasAuthoredContent } from "./authoring-workflow";
import { selectedDifficulty } from "./item-setup";
import { ensureInformationPointSlots, inferInformationPointType, normalizedInformationPoint } from "./information-points";
import { languageTargetDisplayText, languageTargetLabel, languageTargetMatchesSearch } from "./language-target-labels";
import type { AuthoringSetupIssue } from "./setup-validation";
import type {
  InformationPoint,
  RegistrySnapshot,
  TaskPackage,
} from "./types";
import {
  capabilityForDraft,
} from "./registry-capability";

const CONTENT_KINDS = ["lexical", "grammar", "character", "pragmatics"] as const;
type ContentKind = (typeof CONTENT_KINDS)[number];

const INFORMATION_POINT_TYPES: Array<[InformationPoint["pointType"], string]> = [
  ["date", "Date"],
  ["time", "Time"],
  ["location", "Location"],
  ["price", "Price"],
  ["quantity", "Quantity"],
  ["name", "Name"],
  ["action", "Action or arrangement"],
  ["purpose", "Communicative purpose"],
  ["other", "Other explicit information"],
];

function visibleContentTerm(label: string) {
  return label.split(" · ")[0]?.trim() ?? "";
}

function candidateText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(candidateText).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(candidateText).join(" ");
  }
  return "";
}

interface MetadataFieldsProps {
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
  issues?: AuthoringSetupIssue[];
  updateDraft: (mutate: (next: TaskPackage) => void) => void;
}

export function MetadataFields({
  draft,
  registry,
  issues = [],
  updateDraft,
}: MetadataFieldsProps) {
  const [contentKind, setContentKind] = useState<ContentKind>("lexical");
  const [contentSearch, setContentSearch] = useState("");
  const [showAllContent, setShowAllContent] = useState(false);
  const capability = capabilityForDraft(registry, draft);
  const compatibleContent = (registry?.contentIdOptions ?? []).filter(
    (entry) =>
      isContentOptionCompatible(entry, capability, draft.content.contextId),
  );
  const selectedSupportingContent = draft.content.supportingContentRefs ?? [];
  const authoredText = candidateText(draft.candidatePayload);
  const detectedContent = compatibleContent.filter((entry) => {
    if (!(["lexical", "character"] as string[]).includes(entry.kind)) return false;
    const term = visibleContentTerm(entry.label);
    return !!term && authoredText.includes(term);
  });
  const detectedIds = new Set(detectedContent.map((entry) => entry.id));
  const selectedButMissing = draft.content.targetContentIds.filter(
    (id) => !detectedIds.has(id),
  );
  const allowedCharacters = new Set(
    compatibleContent
      .filter((entry) => entry.kind === "character")
      .map((entry) => visibleContentTerm(entry.label)),
  );
  const unknownCharacters = [...new Set(authoredText.match(/\p{Script=Han}/gu) ?? [])]
    .filter((character) => !allowedCharacters.has(character));
  const supportingContent = compatibleContent.filter(
    (entry) =>
      entry.kind === "supported" &&
      !selectedSupportingContent.includes(entry.id),
  );
  const categoryCounts = Object.fromEntries(
    CONTENT_KINDS.map((kind) => [
      kind,
      compatibleContent.filter((entry) => entry.kind === kind).length,
    ]),
  ) as Record<ContentKind, number>;
  const filteredContent = compatibleContent.filter(
    (entry) =>
      entry.kind === contentKind &&
      !draft.content.targetContentIds.includes(entry.id) &&
      languageTargetMatchesSearch(entry, contentSearch),
  );
  const matchingContent = filteredContent.slice(
    0,
    showAllContent ? filteredContent.length : 12,
  );
  const expectedPoints = selectedDifficulty(draft, registry)?.drivers.informationPoints ?? 1;
  const incompatibleIds = new Set([...draft.content.targetContentIds, ...selectedSupportingContent].filter((id) =>
    !compatibleContent.some((entry) => entry.id === id),
  ));
  const suggestedInformationPoints = informationPointSuggestions(draft, registry);
  const informationPointSlotsFull = Array.from(
    { length: expectedPoints },
    (_, index) => draft.content.requiredInformationPoints[index] ?? "",
  ).every((point, index) => normalizedInformationPoint(point, index).label.trim());
  const issueFor = (path: string) =>
    issues.find((issue) => issue.path === path)?.message;

  const addContent = (contentId: string) => {
    updateDraft((next) => {
      next.content.targetContentIds.push(contentId);
    });
    setContentSearch("");
    setShowAllContent(false);
  };

  const applyInformationPointSuggestion = (suggestion: string) => {
    updateDraft((next) => {
      ensureInformationPointSlots(next, expectedPoints);
      const emptyIndex = next.content.requiredInformationPoints.findIndex(
        (point, index) => !normalizedInformationPoint(point, index).label.trim(),
      );
      if (emptyIndex >= 0) {
        const point = normalizedInformationPoint(
          next.content.requiredInformationPoints[emptyIndex],
          emptyIndex,
        );
        point.label = suggestion;
        point.pointType = inferInformationPointType(suggestion);
        next.content.requiredInformationPoints[emptyIndex] = point;
      }
    });
  };

  return (
    <>
      <Field.Root invalid={!!issueFor("content.targetContentIds")}>
        <Field.Label>Language targets</Field.Label>
        <HStack mb={2} flexWrap="wrap">
          {CONTENT_KINDS.map((kind) => (
            <Button
              key={kind}
              size="xs"
              variant={contentKind === kind ? "solid" : "outline"}
              colorPalette={contentKind === kind ? "teal" : undefined}
              onClick={() => {
                setContentKind(kind);
                setContentSearch("");
                setShowAllContent(false);
              }}
            >
              {CONTENT_KIND_LABELS[kind]} {categoryCounts[kind]}
            </Button>
          ))}
        </HStack>
        <Input
          aria-label="Search language content"
          placeholder={`搜索 / Search ${CONTENT_KIND_LABELS[contentKind]}`}
          value={contentSearch}
          onChange={(event) => {
            setContentSearch(event.target.value);
            setShowAllContent(false);
          }}
        />
        {matchingContent.length > 0 ? (
          <Box
            mt={3}
            borderWidth="1px"
            borderRadius="lg"
            p={3}
            w="full"
            maxH="480px"
            overflowY="auto"
            bg="bg.subtle"
          >
            <Text fontSize="sm" color="fg.muted" mb={3}>
              {filteredContent.length} available
            </Text>
            <SimpleGrid minChildWidth="260px" gap={3} w="full">
              {matchingContent.map((entry) => {
                const label = languageTargetLabel(entry);
                return (
                <Button
                  key={entry.id}
                  variant="outline"
                  h="auto"
                  minH="52px"
                  w="full"
                  justifyContent="flex-start"
                  textAlign="left"
                  whiteSpace="normal"
                  px={4}
                  py={3}
                  bg="bg"
                  onClick={() => addContent(entry.id)}
                >
                  <Stack gap={1} align="start">
                    <Text>{label.primary}</Text>
                    {label.english ? <Text lang="en" fontSize="sm" fontWeight="normal" color="fg.muted">{label.english}</Text> : null}
                    {label.pattern ? <Text fontSize="sm" fontWeight="normal">{label.pattern}</Text> : null}
                  </Stack>
                </Button>
                );
              })}
            </SimpleGrid>
          </Box>
        ) : null}
        {filteredContent.length > matchingContent.length ? (
          <Button size="sm" variant="ghost" mt={2} onClick={() => setShowAllContent(true)}>
            Show all {filteredContent.length}
          </Button>
        ) : null}
        {draft.content.targetContentIds.length > 0 ? (
          <SimpleGrid minChildWidth="260px" gap={3} mt={3} w="full">
            {draft.content.targetContentIds.map((id) => (
              <HStack key={id} justify="space-between" borderWidth="1px" borderRadius="md" px={4} py={3}>
                <Stack gap={1}>
                  <Text fontSize="sm" fontWeight="medium">{contentOptionLabel(id, registry)}</Text>
                  {incompatibleIds.has(id) ? <Text fontSize="xs" color="fg.error">Not available for this context. Remove or replace this target.</Text> : null}
                </Stack>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  aria-label={`Remove ${contentOptionLabel(id, registry)}`}
                  onClick={() =>
                    updateDraft((next) => {
                      next.content.targetContentIds = next.content.targetContentIds.filter(
                        (contentId) => contentId !== id,
                      );
                    })
                  }
                >
                  Remove
                </Button>
              </HStack>
            ))}
          </SimpleGrid>
        ) : null}
        <Field.ErrorText>{issueFor("content.targetContentIds")}</Field.ErrorText>

        {hasAuthoredContent(draft.candidatePayload) ? (
          <Box as="details" mt={4} borderWidth="1px" borderRadius="lg" p={4}>
            <Text as="summary" cursor="pointer" fontWeight="semibold">
              View language coverage check
            </Text>
            <SimpleGrid minChildWidth="220px" gap={3} mt={3}>
              <Box>
                <Text fontSize="sm" color="fg.muted">Detected in the item</Text>
                <Text mt={1} fontSize="sm">
                  {detectedContent.length > 0
                    ? detectedContent.slice(0, 20).map(languageTargetDisplayText).join(", ")
                    : "No registered target vocabulary or characters detected yet"}
                  {detectedContent.length > 20 ? ` and ${detectedContent.length - 20} more` : ""}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted">Selected targets not yet used</Text>
                <Text mt={1} fontSize="sm">
                  {selectedButMissing.length > 0
                    ? selectedButMissing.map((id) => contentOptionLabel(id, registry)).join(", ")
                    : "None"}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted">Characters outside the current range</Text>
                <Text mt={1} fontSize="sm" color={unknownCharacters.length > 0 ? "fg.warning" : undefined}>
                  {unknownCharacters.length > 0 ? unknownCharacters.join(", ") : "None"}
                </Text>
              </Box>
            </SimpleGrid>
          </Box>
        ) : null}
      </Field.Root>


      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <Stack gap={2}>
          <Text fontWeight="semibold">Key information ({expectedPoints})</Text>
          <Text fontSize="sm" color="fg.muted">Facts or messages to include, not answer keys.</Text>
          {draft.content.requiredInformationPoints.length > expectedPoints ? <Text role="alert" fontSize="sm" color="fg.error">This scheme requires {expectedPoints} information point{expectedPoints === 1 ? "" : "s"}. All your points have been kept. Choose which extra points to remove.</Text> : null}
          <HStack mt={3} mb={3} flexWrap="wrap" align="start">
            <Text fontSize="sm" fontWeight="semibold">Suggestions:</Text>
            {suggestedInformationPoints.map((suggestion) => (
              <Button
                key={suggestion}
                size="xs"
                variant="outline"
                colorPalette="blue"
                disabled={
                  informationPointSlotsFull ||
                  draft.content.requiredInformationPoints.some(
                    (point, index) =>
                      normalizedInformationPoint(point, index).label === suggestion,
                  )
                }
                onClick={() => applyInformationPointSuggestion(suggestion)}
              >
                + {suggestion}
              </Button>
            ))}
          </HStack>
          <Stack w="full" gap={2}>
            {Array.from({ length: Math.max(expectedPoints, draft.content.requiredInformationPoints.length) }, (_, index) => (
              <Field.Root
                key={index}
                invalid={
                  !!issueFor("content.requiredInformationPoints") &&
                  !normalizedInformationPoint(
                    draft.content.requiredInformationPoints[index],
                    index,
                  ).label.trim()
                }
              >
                <HStack w="full" justify="space-between">
                  <Field.Label fontSize="sm">Information point {index + 1}</Field.Label>
                  {draft.content.requiredInformationPoints.length > expectedPoints ? <Button size="xs" variant="ghost" colorPalette="red" aria-label={`Remove information point ${index + 1}`} onClick={() => updateDraft((next) => {
                    next.content.requiredInformationPoints.splice(index, 1);
                  })}>Remove</Button> : null}
                </HStack>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      aria-label={`Information point ${index + 1} type`}
                      value={normalizedInformationPoint(
                        draft.content.requiredInformationPoints[index],
                        index,
                      ).pointType}
                      onChange={(event) => updateDraft((next) => {
                        ensureInformationPointSlots(next, Math.max(expectedPoints, index + 1));
                        const point = normalizedInformationPoint(
                          next.content.requiredInformationPoints[index],
                          index,
                        );
                        point.pointType = event.target.value as InformationPoint["pointType"];
                        next.content.requiredInformationPoints[index] = point;
                      })}
                    >
                      {INFORMATION_POINT_TYPES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                  <Input
                    aria-label={`Information point ${index + 1}`}
                    placeholder={index === 0 ? "Example: opening time" : "Example: entrance location"}
                    value={normalizedInformationPoint(
                      draft.content.requiredInformationPoints[index],
                      index,
                    ).label}
                    onChange={(event) => updateDraft((next) => {
                      ensureInformationPointSlots(next, Math.max(expectedPoints, index + 1));
                      const point = normalizedInformationPoint(
                        next.content.requiredInformationPoints[index],
                        index,
                      );
                      point.label = event.target.value;
                      next.content.requiredInformationPoints[index] = point;
                    })}
                  />
                </SimpleGrid>
                <Field.ErrorText>
                  {!normalizedInformationPoint(
                    draft.content.requiredInformationPoints[index],
                    index,
                  ).label.trim()
                    ? `Enter information point ${index + 1}`
                    : undefined}
                </Field.ErrorText>
              </Field.Root>
            ))}
          </Stack>
        </Stack>
      </Box>

      <chakra.details open={selectedSupportingContent.some((id) => incompatibleIds.has(id)) || undefined} borderWidth="1px" borderRadius="lg" p={4}>
        <Text as="summary" cursor="pointer" fontWeight="semibold">Supporting content (optional)</Text>
        <Text fontSize="sm" color="fg.muted" mt={3}>Background language allowed in the item, but not assessed as a language target.</Text>
        {selectedSupportingContent.length > 0 ? (
          <SimpleGrid minChildWidth="260px" gap={3} mt={3}>
            {selectedSupportingContent.map((id) => (
              <HStack key={id} justify="space-between" borderWidth="1px" borderRadius="md" bg="bg.panel" px={4} py={3}>
                <Stack gap={1}>
                  <Text fontSize="sm" fontWeight="medium">{contentOptionLabel(id, registry)}</Text>
                  {incompatibleIds.has(id) ? <Text fontSize="xs" color="fg.error">Not available for this context. Remove or replace this supporting content.</Text> : null}
                </Stack>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  aria-label={`Remove supporting content ${contentOptionLabel(id, registry)}`}
                  onClick={() => updateDraft((next) => {
                    next.content.supportingContentRefs = (
                      next.content.supportingContentRefs ?? []
                    ).filter((contentId) => contentId !== id);
                  })}
                >
                  Remove
                </Button>
              </HStack>
            ))}
          </SimpleGrid>
        ) : null}
        <SimpleGrid minChildWidth="260px" gap={3} mt={3}>
          {supportingContent.map((entry) => (
            <Button
              key={entry.id}
              variant="outline"
              h="auto"
              minH="64px"
              justifyContent="flex-start"
              textAlign="left"
              whiteSpace="normal"
              px={4}
              py={3}
              bg="bg.panel"
              onClick={() => updateDraft((next) => {
                next.content.supportingContentRefs ??= [];
                next.content.supportingContentRefs.push(entry.id);
              })}
            >
              <Text lineClamp={3}>
                {SUPPORTED_CONTENT_LABELS[entry.label] ?? entry.label}
              </Text>
            </Button>
          ))}
        </SimpleGrid>
      </chakra.details>

    </>
  );
}
