import { Box, Text } from "@chakra-ui/react";

import { itemTemplateForRenderer } from "./item-template-registry";
import type { CandidatePayload } from "./types";

export function CandidateRenderer({ rendererId, payload }: { rendererId: string; payload: CandidatePayload }) {
  const template = itemTemplateForRenderer(rendererId);
  if (template) return template.renderPreview(payload);
  return <Box role="alert" borderWidth="1px" borderRadius="lg" p={4}><Text color="fg.error">No candidate preview is registered for this item format.</Text></Box>;
}
