import { Select, Stack, Text, createListCollection } from "@chakra-ui/react";
import { useMemo, type ReactNode } from "react";

interface NewItemSelectProps {
  label: string;
  placeholder: string;
  value: string;
  options: Array<{ value: string; label: string; description?: string }>;
  open: boolean;
  dimmed: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}

export function NewItemSelect({ label, placeholder, value, options, open, dimmed, disabled, children, onChange, onOpenChange }: NewItemSelectProps) {
  // The prompt belongs to the closed trigger, never to the selectable collection.
  const collection = useMemo(() => createListCollection({ items: options }), [options]);
  return (
    <Select.Root collection={collection} value={value ? [value] : []} open={open}
      disabled={disabled} onValueChange={(details) => onChange(details.value[0] ?? "")}
      onOpenChange={(details) => onOpenChange(details.open)}
      positioning={{ placement: "bottom-start", strategy: "fixed", sameWidth: true, hideWhenDetached: true }}
      lazyMount unmountOnExit colorPalette="blue"
      data-new-item-field={label} data-dimmed={dimmed || undefined}
      opacity={dimmed ? 0.3 : 1} transition="opacity 120ms ease"
      position="relative" zIndex={open ? 1 : "auto"}>
      <Select.HiddenSelect aria-hidden="true" tabIndex={-1} />
      <Select.Label color="blue.700" fontSize="md">{label}</Select.Label>
      {children}
      <Select.Control>
        <Select.Trigger aria-label={label} minH="52px" py={3} pe={10} bg="bg"
          _expanded={{ borderColor: "blue.500", boxShadow: "0 0 0 1px var(--chakra-colors-blue-500)" }}>
          <Select.ValueText placeholder={placeholder} maxW="full" lineClamp={2} />
        </Select.Trigger>
        <Select.IndicatorGroup><Select.Indicator /></Select.IndicatorGroup>
      </Select.Control>
      {/* Keep the popup inside the dialog's focus scope; fixed positioning avoids body clipping. */}
      <Select.Positioner>
        <Select.Content aria-label={label} bg="bg" borderWidth="1px" borderColor="border.emphasized"
          boxShadow="xl" maxH="min(280px, var(--available-height))" overscrollBehavior="contain">
          {collection.items.map((option) => (
            <Select.Item key={option.value} item={option} py={3} alignItems="start"
              _selected={{ bg: "blue.subtle", color: "blue.fg", fontWeight: "semibold" }}
              _highlighted={{ bg: "blue.muted" }}>
              <Stack gap={1}><Select.ItemText whiteSpace="normal" translate="no">{option.label}</Select.ItemText>
                {option.description ? <Text fontSize="xs" color="fg.muted" fontWeight="normal">{option.description}</Text> : null}
              </Stack>
              <Select.ItemIndicator flexShrink={0} mt={1} />
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Positioner>
    </Select.Root>
  );
}
