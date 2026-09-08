import { Box, Button, Dialog, Stack, Text } from "@chakra-ui/react";

import { registryIssueText } from "./registry-reference-labels";
import type { RegistrySnapshot, RegistryValidationResult } from "./types";
import type { RegistryPublication } from "./use-registry-settings";

export function RegistryValidationFeedback({ snapshot, result }: { snapshot: RegistrySnapshot; result: RegistryValidationResult }) {
  return (
    <Box role="status" borderWidth="1px" borderColor={result.valid ? "teal.300" : "red.300"} borderRadius="lg" p={4}>
      <Text fontWeight="semibold">{result.valid ? "Rules passed" : "Rules need fixes"}</Text>
      <Stack gap={1} mt={2}>
        {result.issues.map((issue, index) => (
          <Text key={`${issue.code}-${issue.path}-${index}`} fontSize="sm" color={issue.severity === "error" ? "fg.error" : "fg.warning"}>
            {issue.severity === "warning" ? "Warning · " : ""}{registryIssueText(snapshot, issue)}
          </Text>
        ))}
      </Stack>
    </Box>
  );
}

export function RegistryPublishDialog({ publication, busy, onClose, onPublish }: {
  publication: RegistryPublication | null;
  busy: boolean;
  onClose: () => void;
  onPublish: () => void;
}) {
  return (
    <Dialog.Root open={!!publication} closeOnInteractOutside={false} closeOnEscape={!busy} scrollBehavior="inside" onOpenChange={({ open }) => !open && onClose()}>
      <Dialog.Backdrop />
      <Dialog.Positioner>
        <Dialog.Content maxW="3xl">
          <Dialog.Header><Dialog.Title>Publish settings for new items?</Dialog.Title></Dialog.Header>
          <Dialog.Body>
            {publication ? <Stack gap={4}>
              <RegistryValidationFeedback snapshot={publication.record.snapshot} result={publication.validation} />
              <Text>New items will use these settings. Existing items keep their original settings.</Text>
            </Stack> : null}
          </Dialog.Body>
          <Dialog.Footer>
            <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
            <Button colorPalette="teal" loading={busy} disabled={busy || !publication?.validation.valid || publication.impact.staleBase} onClick={onPublish}>Confirm publication</Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog.Positioner>
    </Dialog.Root>
  );
}
