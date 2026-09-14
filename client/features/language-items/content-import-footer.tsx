import { Button, Dialog, HStack, Text } from "@chakra-ui/react";
import { useId } from "react";

export function ContentImportFooter({ mode, count, reason, reviewCount, busy, onReview, onApply, onClose }: {
  mode: "add" | "update";
  count: number;
  reason?: string;
  reviewCount: number;
  busy: boolean;
  onReview: () => void;
  onApply: () => void;
  onClose: () => void;
}) {
  const reasonId = useId();
  return <Dialog.Footer borderTopWidth="1px" flexWrap="wrap" gap={4}>
    <HStack flex="1" minW={{ base: "100%", md: "280px" }} flexWrap="wrap" gap={3}>
      {reason ? <Text id={reasonId} role="status" color="fg.warning" fontSize="sm" maxW="66ch">{reason}</Text> : null}
      {reviewCount > 0 ? <Button flexShrink={0} size="sm" variant="outline" colorPalette="orange" disabled={busy} onClick={onReview}>Review {reviewCount} {reviewCount === 1 ? "row" : "rows"}</Button> : null}
    </HStack>
    <HStack gap={3} flexShrink={0} maxW="100%" flexWrap="wrap" justify="end" marginInlineStart="auto">
      <Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
      <Button colorPalette="teal" disabled={!!reason} aria-describedby={reason ? reasonId : undefined} onClick={onApply}>{mode === "add" ? "Add" : "Update"} {count} {count === 1 ? "entry" : "entries"} in draft</Button>
    </HStack>
  </Dialog.Footer>;
}
