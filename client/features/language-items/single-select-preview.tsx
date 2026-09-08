import { Box, Heading, Stack, Text } from "@chakra-ui/react";
import { useId, useMemo } from "react";

import type { SingleSelectCandidatePayload } from "./types";

interface SingleSelectPreviewProps {
  payload: SingleSelectCandidatePayload;
}

export function SingleSelectPreview({ payload }: SingleSelectPreviewProps) {
  const groupName = useId();
  const options = useMemo(
    () =>
      payload.shuffleOptions
        ? [...payload.options].reverse()
        : payload.options,
    [payload.options, payload.shuffleOptions],
  );

  return (
    <Box borderWidth="1px" borderRadius="lg" p={5} bg="bg.subtle">
      {payload.stimulus.audioRef ? (
        <audio controls src={payload.stimulus.audioRef} style={{ width: "100%" }} />
      ) : null}
      {payload.stimulus.text ? (
        <Box borderWidth="1px" borderRadius="md" p={4} bg="bg">
          <Text fontSize="xl" textAlign="center">
            {payload.stimulus.text}
          </Text>
        </Box>
      ) : null}
      <Heading as="h3" size="md" mt={5} mb={3}>
        {payload.prompt || "(Prompt not entered)"}
      </Heading>
      <Stack as="fieldset" gap={2} border="0" p={0}>
        <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
          Select one answer
        </legend>
        {options.map((option) => (
          <Box as="label" key={option.optionId} borderWidth="1px" borderRadius="md" p={3}>
            <input type="radio" name={groupName} value={option.optionId} />{" "}
            <Text as="span" ml={2}>
              {option.text || "(Empty option)"}
            </Text>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
