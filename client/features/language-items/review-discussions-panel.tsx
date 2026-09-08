import {
  Badge,
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  addLanguageItemReviewDiscussionEvent,
  createLanguageItemReviewDiscussion,
} from "./api";
import { REVIEW_GATE_LABELS } from "./labels";
import type {
  LanguageItemReviewDiscussion,
  LanguageItemVersion,
  ReviewDiscussionEventKind,
  ReviewDiscussionKind,
} from "./types";

const statusLabels = {
  open: "Open",
  addressed: "Addressed; awaiting confirmation",
  resolved: "Resolved",
} as const;

const eventLabels = {
  comment: "Reply",
  addressed: "Marked as addressed",
  resolved: "Confirmed as resolved",
  reopened: "Reopened",
} as const;

interface DiscussionCardProps {
  discussion: LanguageItemReviewDiscussion;
  pending: boolean;
  onEvent: (
    discussionId: string,
    kind: ReviewDiscussionEventKind,
    message?: string,
  ) => void;
}

function DiscussionCard(props: DiscussionCardProps) {
  const { discussion } = props;
  const [reply, setReply] = useState("");
  const submit = (kind: ReviewDiscussionEventKind, message?: string) => {
    props.onEvent(discussion.id, kind, message);
    setReply("");
  };

  return (
    <Box borderWidth="1px" borderRadius="lg" p={4}>
      <HStack justify="space-between" align="start" flexWrap="wrap">
        <Box>
          <HStack flexWrap="wrap">
            <Badge colorPalette={discussion.kind === "changeRequest" ? "red" : "blue"}>
              {discussion.kind === "changeRequest" ? "Change request" : "Discussion"}
            </Badge>
            <Badge colorPalette={discussion.status === "resolved" ? "green" : "orange"}>
              {statusLabels[discussion.status]}
            </Badge>
            <Badge variant="outline">
              {REVIEW_GATE_LABELS[discussion.gateId] ?? "Other"}
            </Badge>
          </HStack>
          <Text fontWeight="bold" mt={2}>{discussion.subject}</Text>
          <Text fontSize="xs" color="fg.muted">
            Opened on version {discussion.versionNumber} · {discussion.createdBy}
          </Text>
        </Box>
      </HStack>
      {(discussion.fieldPath || discussion.ruleRef) ? (
        <Box as="details" mt={2} fontSize="xs" color="fg.muted">
          <Box as="summary" cursor="pointer">View issue location</Box>
          <Text mt={1}>
            {discussion.fieldPath || "No field specified"} · {discussion.ruleRef || "No rule specified"}
          </Text>
        </Box>
      ) : null}
      <Stack gap={2} mt={4}>
        {discussion.events.map((event) => (
          <Box key={event.id} bg="bg.subtle" borderRadius="md" p={3}>
            <Text fontSize="xs" color="fg.muted">
              {event.actorEmail} · {eventLabels[event.kind]} ·{" "}
              {new Date(event.createdAt).toLocaleString("en-GB")}
            </Text>
            {event.message ? <Text mt={1}>{event.message}</Text> : null}
          </Box>
        ))}
      </Stack>
      <HStack mt={3} align="end" flexWrap="wrap">
        <Field.Root flex="1" minW="240px">
          <Field.Label>Reply or resolution note</Field.Label>
          <Input
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder="Describe the issue, change, or reason for reopening"
          />
        </Field.Root>
        <Button
          size="sm"
          variant="outline"
          disabled={!reply.trim()}
          loading={props.pending}
          onClick={() => submit("comment", reply)}
        >
          Reply
        </Button>
        {discussion.kind === "changeRequest" &&
        discussion.status !== "resolved" ? (
          <Button
            size="sm"
            colorPalette="orange"
            disabled={!reply.trim()}
            loading={props.pending}
            onClick={() => submit("addressed", reply)}
          >
            Mark addressed
          </Button>
        ) : null}
        {discussion.status !== "resolved" ? (
          <Button
            size="sm"
            colorPalette="green"
            loading={props.pending}
            onClick={() => submit("resolved", reply || undefined)}
          >
            Mark resolved
          </Button>
        ) : null}
        {discussion.status === "resolved" ? (
          <Button
            size="sm"
            colorPalette="orange"
            disabled={!reply.trim()}
            loading={props.pending}
            onClick={() => submit("reopened", reply)}
          >
            Reopen
          </Button>
        ) : null}
      </HStack>
    </Box>
  );
}

interface ReviewDiscussionsPanelProps {
  itemId: string;
  latestVersion: LanguageItemVersion | undefined;
  requiredGateIds: string[];
  discussions: LanguageItemReviewDiscussion[];
  isLoading: boolean;
}

export function ReviewDiscussionsPanel(props: ReviewDiscussionsPanelProps) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ReviewDiscussionKind>("discussion");
  const [gateId, setGateId] = useState(props.requiredGateIds[0] ?? "");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [fieldPath, setFieldPath] = useState("");
  useEffect(() => {
    if (!gateId && props.requiredGateIds[0]) {
      setGateId(props.requiredGateIds[0]);
    }
  }, [gateId, props.requiredGateIds]);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["language-item-review-discussions", props.itemId],
    });
  const createMutation = useMutation({
    mutationFn: () =>
      createLanguageItemReviewDiscussion({
        versionId: props.latestVersion!.id,
        gateId,
        kind,
        subject,
        message,
        fieldPath,
      }),
    onSuccess: async () => {
      setSubject("");
      setMessage("");
      setFieldPath("");
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: ["language-item", props.itemId],
      });
    },
  });
  const eventMutation = useMutation({
    mutationFn: (input: {
      discussionId: string;
      kind: ReviewDiscussionEventKind;
      message?: string;
    }) => addLanguageItemReviewDiscussionEvent(input),
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({
        queryKey: ["language-item", props.itemId],
      });
    },
  });
  const error = createMutation.error ?? eventMutation.error;

  return (
    <Stack gap={4}>
      <Box>
        <Heading size="lg">Review discussions</Heading>
      </Box>
      {props.latestVersion ? (
        <Box borderWidth="1px" borderRadius="lg" p={4}>
          <HStack flexWrap="wrap" mb={3}>
            <Button
              size="sm"
              variant={kind === "discussion" ? "solid" : "outline"}
              onClick={() => setKind("discussion")}
            >
              Start discussion
            </Button>
            <Button
              size="sm"
              colorPalette="red"
              variant={kind === "changeRequest" ? "solid" : "outline"}
              onClick={() => setKind("changeRequest")}
            >
              Request changes
            </Button>
          </HStack>
          <Stack gap={3}>
            <HStack align="end" flexWrap="wrap">
              <Field.Root flex="1" minW="220px">
                <Field.Label>Review area</Field.Label>
                <NativeSelect.Root>
                  <NativeSelect.Field
                    value={gateId}
                    onChange={(event) => setGateId(event.target.value)}
                  >
                    {props.requiredGateIds.map((id) => (
                      <option key={id} value={id}>
                        {REVIEW_GATE_LABELS[id] ?? id}
                      </option>
                    ))}
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
              <Field.Root flex="2" minW="260px">
                <Field.Label>Subject</Field.Label>
                <Input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Example: Option B is ambiguous"
                />
              </Field.Root>
            </HStack>
            <Textarea
              aria-label="Discussion message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe the issue, rationale, and expected change"
            />
            <Box as="details">
              <Box as="summary" cursor="pointer" fontSize="sm" color="fg.muted">
                Link to a field (optional)
              </Box>
              <Input
                mt={2}
                value={fieldPath}
                onChange={(event) => setFieldPath(event.target.value)}
                placeholder="Example: candidatePayload.options[1]"
              />
            </Box>
            <Button
              alignSelf="start"
              colorPalette={kind === "changeRequest" ? "red" : "blue"}
              disabled={!gateId || !subject.trim() || !message.trim()}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {kind === "changeRequest" ? "Submit change request" : "Start discussion"}
            </Button>
          </Stack>
        </Box>
      ) : null}
      {error ? <Text color="fg.error">{error.message}</Text> : null}
      {props.isLoading ? (
        <Text color="fg.muted">Loading discussions…</Text>
      ) : props.discussions.length === 0 ? (
        <Text color="fg.muted">No review discussions.</Text>
      ) : (
        <Stack gap={3}>
          {props.discussions.map((discussion) => (
            <DiscussionCard
              key={discussion.id}
              discussion={discussion}
              pending={eventMutation.isPending}
              onEvent={(discussionId, eventKind, eventMessage) =>
                eventMutation.mutate({
                  discussionId,
                  kind: eventKind,
                  message: eventMessage,
                })
              }
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}
