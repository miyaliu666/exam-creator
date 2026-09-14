import { Button, HStack } from "@chakra-ui/react";

export function RegistrySettingsNavigation({ rulesActive, onItemRules, onLanguageContent }: {
  rulesActive: boolean; onItemRules: () => void; onLanguageContent: () => void;
}) {
  return <HStack borderBottomWidth="1px" pb={3} gap={2} role="tablist" aria-label="Assessment Settings sections">
    <Button role="tab" aria-selected={rulesActive} variant={rulesActive ? "subtle" : "ghost"} colorPalette="blue" onClick={onItemRules}>Item rules</Button>
    <Button role="tab" aria-selected={!rulesActive} variant={!rulesActive ? "subtle" : "ghost"} colorPalette="blue" onClick={onLanguageContent}>Language content</Button>
  </HStack>;
}
