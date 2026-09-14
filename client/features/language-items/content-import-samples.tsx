import { Button, HStack, Stack, Text } from "@chakra-ui/react";

export function ContentImportSamples({ disabled, onPreview }: { disabled: boolean; onPreview: (language: "en" | "es") => void }) {
  return <details><summary style={{ cursor: "pointer", fontWeight: 600 }}>Try sample content</summary>
    <Stack gap={2} mt={2}>
      <Text fontSize="sm" color="fg.muted">Each sample contains 4 vocabulary entries and 3 grammar entries with examples. These original demonstrations have no calibrated level. Review the preview before adding them to the draft.</Text>
      <HStack gap={2} flexWrap="wrap">
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onPreview("en")}>Preview English sample</Button>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => onPreview("es")}>Preview Spanish sample</Button>
      </HStack>
    </Stack>
  </details>;
}
