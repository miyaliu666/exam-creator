import { Box, Button, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { useContext, useEffect, useId, useRef, useState } from "react";

import { RegistryTextContext } from "./registry-reference-labels";
import {
  filterRegistryOptions,
  registryOptionNames,
  toggleRegistrySelection,
  type RegistryMultiSelectOption,
} from "./registry-multi-select-options";

export function RegistryMultiSelect({ label, options, values, onChange, disabled }: {
  label: string;
  options: RegistryMultiSelectOption[];
  values: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const displayText = useContext(RegistryTextContext);
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const controlId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const namedOptions = registryOptionNames(options, displayText);
  const optionMap = new Map(namedOptions.map((option) => [option.id, option]));
  const selected = [...new Set(values)].flatMap((id) => {
    const option = optionMap.get(id);
    return option ? [option] : [];
  });
  const filtered = filterRegistryOptions(namedOptions, query);
  const toggle = (id: string) => {
    if (!disabled) onChange(toggleRegistrySelection(values, id));
  };
  const close = () => {
    setExpanded(false);
    setQuery("");
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (disabled) {
      setExpanded(false);
      setQuery("");
    } else if (expanded) searchRef.current?.focus();
  }, [disabled, expanded]);

  return (
    <Stack gap={2} role="group" aria-labelledby={`${controlId}-label`}>
      <HStack justify="space-between" align="center" gap={3}>
        <Text id={`${controlId}-label`} fontSize="sm" fontWeight="medium">{label}</Text>
        {!disabled ? (
          <Button
            ref={buttonRef}
            type="button"
            size="xs"
            variant="outline"
            flexShrink={0}
            aria-label={`${expanded ? "Finish editing" : selected.length ? "Edit" : "Choose"} ${label}`}
            aria-expanded={expanded}
            aria-controls={`${controlId}-options`}
            onClick={() => expanded ? close() : setExpanded(true)}
          >
            {expanded ? "Done" : selected.length ? "Edit" : "Choose"}
          </Button>
        ) : null}
      </HStack>
      <HStack gap={2} flexWrap="wrap">
        {selected.map((option) => disabled ? (
          <Box key={option.id} px={2} py={1} borderWidth="1px" borderRadius="md" fontSize="xs" overflowWrap="anywhere">
            {option.label}
          </Box>
        ) : (
          <Button
            key={option.id}
            type="button"
            size="xs"
            variant="subtle"
            colorPalette="teal"
            h="auto"
            py={1}
            whiteSpace="normal"
            textAlign="left"
            aria-label={`Remove ${option.label} from ${label}`}
            onClick={() => toggle(option.id)}
          >
            {option.label}<span aria-hidden="true">×</span>
          </Button>
        ))}
        {!selected.length ? <Text color="fg.muted" fontSize="sm">—</Text> : null}
      </HStack>
      {expanded && !disabled ? (
        <Stack
          id={`${controlId}-options`}
          borderWidth="1px"
          borderRadius="md"
          p={3}
          gap={3}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <Input ref={searchRef} size="sm" placeholder="Search" aria-label={`Search ${label}`} value={query} onChange={(event) => setQuery(event.target.value)} />
          <Stack gap={1} maxH="64" overflowY="auto" role="group" aria-label={`${label} options`}>
            {filtered.map((option) => (
              <Box as="label" key={option.id} display="flex" alignItems="start" gap={2} px={1} py={2} cursor="pointer" borderRadius="sm" _hover={{ bg: "bg.muted" }}>
                <input type="checkbox" checked={values.includes(option.id)} onChange={() => toggle(option.id)} style={{ marginTop: 3, flexShrink: 0, accentColor: "var(--chakra-colors-teal-600)" }} />
                <Text as="span" fontSize="sm" overflowWrap="anywhere">{option.label}</Text>
              </Box>
            ))}
            {!filtered.length ? <Text role="status" color="fg.muted" fontSize="sm">No matching options.</Text> : null}
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}
