import {
  Box,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useState } from "react";

import {
  CONTENT_KIND_LABELS,
  CONTEXT_LABELS,
  CONTEXT_SCOPE_LABELS,
  DIFFICULTY_LABELS,
  DOMAIN_LABELS,
  SUPPORTED_CONTENT_LABELS,
  contentOptionLabel,
} from "./labels";
import { isContentOptionCompatible } from "./content-compatibility";
import { informationPointSuggestions } from "./information-point-suggestions";
import type { AuthoringSetupIssue } from "./setup-validation";
import type {
  DifficultyProfile,
  InformationPoint,
  RegistrySnapshot,
  TaskPackage,
} from "./types";

const DIFFICULTY_ANCHORS: Record<string, string> = {
  LowerA1: "1 explicit information point · word or phrase · high contextual support",
  TypicalA1: "1–2 explicit information points · short sentence · moderate contextual support",
  UpperA1: "2 explicit information points · related phrases · limited contextual support",
};

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

function inferInformationPointType(label: string): InformationPoint["pointType"] {
  if (/日期|哪天|星期/.test(label)) return "date";
  if (/时间|几点|开放/.test(label)) return "time";
  if (/地点|位置|入口|出口|楼层|房间|线路/.test(label)) return "location";
  if (/价格|付款|多少钱/.test(label)) return "price";
  if (/数量|多少/.test(label)) return "quantity";
  if (/人物|姓名|名称|联系人/.test(label)) return "name";
  if (/行动|安排|需要完成|回应/.test(label)) return "action";
  if (/目的|请求|邀请|确认/.test(label)) return "purpose";
  return "other";
}

function normalizedInformationPoint(
  value: InformationPoint | string | undefined,
  index: number,
): InformationPoint {
  if (value && typeof value !== "string") return value;
  const label = value ?? "";
  return {
    id: `IP${index + 1}`,
    pointType: inferInformationPointType(label),
    label,
    required: true,
    scoringPointId: undefined,
  };
}

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

function difficultyProfile(
  band: string,
  current?: DifficultyProfile,
): DifficultyProfile {
  const lower = band === "LowerA1";
  const upper = band === "UpperA1";
  return {
    intendedBand: band,
    status: "AuthorEstimated",
    drivers: {
      inputLength: lower
        ? "wordOrPhrase"
        : upper
          ? "twoRelatedPhrases"
          : "shortSentence",
      informationPoints: upper ? 2 : 1,
      supportLevel: lower ? "high" : upper ? "limited" : "moderate",
      distractorSimilarity:
        current?.drivers.distractorSimilarity === "notApplicable"
          ? "notApplicable"
          : lower ? "clear" : upper ? "close" : "moderate",
      outputLength: current?.drivers.outputLength ?? "selectedOption",
      interactionTurns: current?.drivers.interactionTurns ?? 0,
      preparationTimeSeconds: current?.drivers.preparationTimeSeconds ?? null,
      independenceLevel: lower
        ? "highlySupported"
        : upper
          ? "independent"
          : "partlySupported",
      inferenceRequired: false,
    },
    rationale: [DIFFICULTY_ANCHORS[band] ?? "Designed to the current task anchor"],
    empiricalDifficulty: {
      status: "NotPiloted",
      sampleId: null,
      observedBand: null,
      percentCorrect: null,
      discrimination: null,
      omissionRate: null,
      medianResponseTimeSeconds: null,
      decision: null,
    },
  };
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
  const capability = registry?.capabilities.find(
    (entry) =>
      entry.blueprintSlotId === draft.blueprintSlotId &&
      entry.itemFormatId === draft.itemFormatId,
  );
  const allowedDomains = capability?.allowedDomains ?? [];
  const allowedContexts = (registry?.contextOptions ?? []).filter(
    (entry) =>
      capability?.allowedContextIds.includes(entry.id) &&
      entry.primaryDomains.includes(draft.content.primaryDomain),
  );
  const selectedContext = allowedContexts.find(
    (entry) => entry.id === draft.content.contextId,
  );
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
  const normalizedSearch = contentSearch.trim().toLocaleLowerCase();
  const filteredContent = compatibleContent.filter(
    (entry) =>
      entry.kind === contentKind &&
      !draft.content.targetContentIds.includes(entry.id) &&
      (!normalizedSearch ||
        entry.label.toLocaleLowerCase().includes(normalizedSearch)),
  );
  const matchingContent = filteredContent.slice(
    0,
    showAllContent ? filteredContent.length : 12,
  );
  const difficulty =
    draft.content.difficulty ?? difficultyProfile(draft.content.difficultyBand);
  const usesDistractors = ["IF-SINGLE-SELECT", "IF-MATCHING"].includes(
    draft.itemFormatId,
  );
  const suggestedInformationPoints = informationPointSuggestions(draft, registry);
  const informationPointSlotsFull = Array.from(
    { length: difficulty.drivers.informationPoints },
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

  const retainContentForContext = (next: TaskPackage, contextId: string) => {
    next.content.targetContentIds = next.content.targetContentIds.filter((id) => {
      const entry = registry?.contentIdOptions.find((option) => option.id === id);
      return !entry || isContentOptionCompatible(entry, capability, contextId);
    });
    next.content.supportingContentRefs = (next.content.supportingContentRefs ?? []).filter(
      (id) => {
        const entry = registry?.contentIdOptions.find((option) => option.id === id);
        return !entry || isContentOptionCompatible(entry, capability, contextId);
      },
    );
  };

  const setInformationPointCount = (next: TaskPackage, count: number) => {
    const points = next.content.requiredInformationPoints
      .slice(0, count)
      .map((point, index) => normalizedInformationPoint(point, index));
    while (points.length < count) {
      points.push(normalizedInformationPoint(undefined, points.length));
    }
    next.content.requiredInformationPoints = points;
  };

  const applyInformationPointSuggestion = (suggestion: string) => {
    updateDraft((next) => {
      setInformationPointCount(next, difficulty.drivers.informationPoints);
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
      <HStack align="start">
        <Field.Root invalid={!!issueFor("content.primaryDomain")}>
          <Field.Label>Domain</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={draft.content.primaryDomain}
              onChange={(event) => {
                const domain = event.target.value;
                const firstContext = (registry?.contextOptions ?? []).find(
                  (entry) =>
                    capability?.allowedContextIds.includes(entry.id) &&
                    entry.primaryDomains.includes(domain),
                );
                updateDraft((next) => {
                  next.content.primaryDomain = domain;
                  if (firstContext) {
                    next.content.contextId = firstContext.id;
                    retainContentForContext(next, firstContext.id);
                  }
                });
                setShowAllContent(false);
              }}
            >
              {allowedDomains.map((domain) => (
                <option key={domain} value={domain}>
                  {DOMAIN_LABELS[domain] ?? domain}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          <Field.ErrorText>{issueFor("content.primaryDomain")}</Field.ErrorText>
        </Field.Root>
        <Field.Root invalid={!!issueFor("content.contextId")}>
          <Field.Label>Context</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={draft.content.contextId}
              onChange={(event) => {
                const contextId = event.target.value;
                updateDraft((next) => {
                  next.content.contextId = contextId;
                  retainContentForContext(next, contextId);
                });
                setShowAllContent(false);
              }}
            >
              {allowedContexts.map((context) => (
                <option key={context.id} value={context.id}>
                  {CONTEXT_LABELS[context.id] ?? context.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
          {selectedContext?.scope ? (
            <Field.HelperText>
              {CONTEXT_SCOPE_LABELS[selectedContext.id] ?? selectedContext.scope}
            </Field.HelperText>
          ) : null}
          <Field.ErrorText>{issueFor("content.contextId")}</Field.ErrorText>
        </Field.Root>
      </HStack>

      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <Field.Root maxW="280px" mb={3}>
          <Field.Label>Target difficulty within A1</Field.Label>
          <NativeSelect.Root>
            <NativeSelect.Field
              value={difficulty.intendedBand}
              onChange={(event) => {
                const profile = difficultyProfile(event.target.value, difficulty);
                updateDraft((next) => {
                  next.content.difficultyBand = event.target.value;
                  next.content.difficulty = profile;
                  setInformationPointCount(next, profile.drivers.informationPoints);
                });
              }}
            >
              {registry?.difficultyBands.map((band) => (
                <option key={band} value={band}>
                  {DIFFICULTY_LABELS[band] ?? band}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <SimpleGrid minChildWidth="180px" gap={3}>
          <Field.Root>
            <Field.Label>Input length</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                value={difficulty.drivers.inputLength}
                onChange={(event) =>
                  updateDraft((next) => {
                    const profile = next.content.difficulty ?? difficultyProfile(next.content.difficultyBand);
                    profile.drivers.inputLength = event.target.value as DifficultyProfile["drivers"]["inputLength"];
                    next.content.difficulty = profile;
                  })
                }
              >
                <option value="wordOrPhrase">Word or phrase</option>
                <option value="shortSentence">Short sentence</option>
                <option value="twoRelatedPhrases">Two related phrases</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label>Explicit information points</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                value={difficulty.drivers.informationPoints}
                onChange={(event) => {
                  const count = Number(event.target.value);
                  updateDraft((next) => {
                    const profile = next.content.difficulty ?? difficultyProfile(next.content.difficultyBand);
                    profile.drivers.informationPoints = count;
                    next.content.difficulty = profile;
                    setInformationPointCount(next, count);
                  });
                }}
              >
                <option value={1}>1 point</option>
                <option value={2}>2 points</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label>Contextual support</Field.Label>
            <NativeSelect.Root>
              <NativeSelect.Field
                value={difficulty.drivers.supportLevel}
                onChange={(event) =>
                  updateDraft((next) => {
                    const profile = next.content.difficulty ?? difficultyProfile(next.content.difficultyBand);
                    profile.drivers.supportLevel = event.target.value as DifficultyProfile["drivers"]["supportLevel"];
                    next.content.difficulty = profile;
                  })
                }
              >
                <option value="high">High</option>
                <option value="moderate">Moderate</option>
                <option value="limited">Limited</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label>Distractor similarity</Field.Label>
            <NativeSelect.Root disabled={!usesDistractors}>
              <NativeSelect.Field
                value={difficulty.drivers.distractorSimilarity}
                onChange={(event) =>
                  updateDraft((next) => {
                    const profile = next.content.difficulty ?? difficultyProfile(next.content.difficultyBand);
                    profile.drivers.distractorSimilarity = event.target.value as DifficultyProfile["drivers"]["distractorSimilarity"];
                    next.content.difficulty = profile;
                  })
                }
              >
                <option value="clear">Clearly different</option>
                <option value="moderate">Same category and plausible</option>
                <option value="close">Closely similar</option>
                <option value="notApplicable">Not applicable</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        </SimpleGrid>
        <Field.Root mt={3} invalid={!!issueFor("content.difficulty.rationale")}>
          <Field.Label>Difficulty rationale</Field.Label>
          <Textarea
            value={difficulty.rationale.join("\n")}
            onChange={(event) =>
              updateDraft((next) => {
                const profile = next.content.difficulty ?? difficultyProfile(next.content.difficultyBand);
                profile.rationale = event.target.value.split("\n").map((entry) => entry.trim()).filter(Boolean);
                next.content.difficulty = profile;
              })
            }
          />
          <Field.ErrorText>{issueFor("content.difficulty.rationale")}</Field.ErrorText>
        </Field.Root>
      </Box>

      <Field.Root invalid={!!issueFor("content.targetContentIds")}>
        <Field.Label>Language content</Field.Label>
        <Field.HelperText mb={2}>
          Options update automatically with the exam task, Can-do, context, and mastery scope.
        </Field.HelperText>
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
          placeholder={`Search ${CONTENT_KIND_LABELS[contentKind]}`}
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
              {filteredContent.length} available · Select a card to add it to this item
            </Text>
            <SimpleGrid minChildWidth="220px" gap={3} w="full">
              {matchingContent.map((entry) => (
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
                  <Text lineClamp={2}>{entry.label}</Text>
                </Button>
              ))}
            </SimpleGrid>
          </Box>
        ) : null}
        {filteredContent.length > matchingContent.length ? (
          <Button size="sm" variant="ghost" mt={2} onClick={() => setShowAllContent(true)}>
            Show all {filteredContent.length}
          </Button>
        ) : null}
        {draft.content.targetContentIds.length === 0 ? (
          <Text color="fg.warning" fontSize="sm" mt={2}>No language content selected</Text>
        ) : (
          <SimpleGrid minChildWidth="260px" gap={3} mt={3} w="full">
            {draft.content.targetContentIds.map((id) => (
              <HStack key={id} justify="space-between" borderWidth="1px" borderRadius="md" px={4} py={3}>
                <Text fontSize="sm" fontWeight="medium">{contentOptionLabel(id, registry)}</Text>
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
        )}
        <Field.ErrorText>{issueFor("content.targetContentIds")}</Field.ErrorText>

        {authoredText.trim() ? (
          <Box as="details" mt={4} borderWidth="1px" borderRadius="lg" p={4}>
            <Text as="summary" cursor="pointer" fontWeight="semibold">
              View language coverage check
            </Text>
            <SimpleGrid minChildWidth="220px" gap={3} mt={3}>
              <Box>
                <Text fontSize="sm" color="fg.muted">Detected in the item</Text>
                <Text mt={1} fontSize="sm">
                  {detectedContent.length > 0
                    ? detectedContent.slice(0, 20).map((entry) => entry.label).join("、")
                    : "No registered target vocabulary or characters detected yet"}
                  {detectedContent.length > 20 ? ` and ${detectedContent.length - 20} more` : ""}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted">Selected targets not yet used</Text>
                <Text mt={1} fontSize="sm">
                  {selectedButMissing.length > 0
                    ? selectedButMissing.map((id) => contentOptionLabel(id, registry)).join("、")
                    : "None"}
                </Text>
              </Box>
              <Box>
                <Text fontSize="sm" color="fg.muted">Characters outside the current range</Text>
                <Text mt={1} fontSize="sm" color={unknownCharacters.length > 0 ? "fg.warning" : undefined}>
                  {unknownCharacters.length > 0 ? unknownCharacters.join("、") : "None"}
                </Text>
              </Box>
            </SimpleGrid>
          </Box>
        ) : null}
      </Field.Root>

      <Box borderWidth="1px" borderRadius="lg" p={4} bg="blue.subtle">
        <Text fontWeight="semibold">Supporting content (optional)</Text>
        <Text mt={1} fontSize="sm" color="fg.muted">
          Names, places, and course names establish context but are not core targets.
        </Text>
        {selectedSupportingContent.length > 0 ? (
          <SimpleGrid minChildWidth="260px" gap={3} mt={3}>
            {selectedSupportingContent.map((id) => (
              <HStack key={id} justify="space-between" borderWidth="1px" borderRadius="md" bg="bg.panel" px={4} py={3}>
                <Text fontSize="sm" fontWeight="medium">{contentOptionLabel(id, registry)}</Text>
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
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
      </Box>

      <Box borderWidth="1px" borderRadius="lg" p={4}>
        <Stack gap={2}>
          <Text fontWeight="semibold">Required information points ({difficulty.drivers.informationPoints})</Text>
          <Text fontSize="sm" color="fg.muted">
            These are the facts candidates must find, select, or express. Suggestions are inferred from the exam task, Can-do, context, and reference task; authors must confirm them.
          </Text>
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
            {Array.from({ length: difficulty.drivers.informationPoints }, (_, index) => (
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
                <Field.Label fontSize="sm">Information point {index + 1}</Field.Label>
                <SimpleGrid columns={{ base: 1, md: 2 }} gap={2}>
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      aria-label={`Information point ${index + 1} type`}
                      value={normalizedInformationPoint(
                        draft.content.requiredInformationPoints[index],
                        index,
                      ).pointType}
                      onChange={(event) => updateDraft((next) => {
                        setInformationPointCount(next, difficulty.drivers.informationPoints);
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
                      setInformationPointCount(next, difficulty.drivers.informationPoints);
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
    </>
  );
}
