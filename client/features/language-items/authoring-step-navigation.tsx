import { Box, Button, HStack } from "@chakra-ui/react";

import { AUTHORING_STEPS, type EditorSection } from "./authoring-workflow";

export function AuthoringStepNavigation({ section, onChange }: {
  section: EditorSection;
  onChange: (section: EditorSection) => void;
}) {
  return (
    <Box as="nav" aria-label="Item creation steps">
      <HStack gap={2} flexWrap="wrap">
        {AUTHORING_STEPS.map((step) => (
          <Button key={step.id} variant={section === step.id ? "solid" : "outline"}
            colorPalette={section === step.id ? "teal" : undefined}
            aria-current={section === step.id ? "step" : undefined}
            onClick={() => onChange(step.id)}>{step.label}</Button>
        ))}
      </HStack>
    </Box>
  );
}
