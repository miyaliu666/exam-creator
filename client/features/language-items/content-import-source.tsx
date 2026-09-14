import { Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ContentImportSource({ hasRows, hasPendingInput, modeLabel, rowCount, children }: {
  hasRows: boolean;
  hasPendingInput: boolean;
  modeLabel: string;
  rowCount: number;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const previewSeen = useRef(false);
  useEffect(() => {
    if (!hasRows) {
      previewSeen.current = false;
      setExpanded(true);
    } else if (!previewSeen.current && !hasPendingInput) {
      previewSeen.current = true;
      setExpanded(false);
    }
  }, [hasRows, hasPendingInput]);
  const forceOpen = !hasRows || hasPendingInput;
  const open = forceOpen || expanded;

  return <details open={open}>
    <summary
      hidden={!hasRows}
      aria-disabled={forceOpen}
      style={{ cursor: forceOpen ? "default" : "pointer", fontWeight: 600 }}
      onClick={(event) => { event.preventDefault(); if (!forceOpen) setExpanded((current) => !current); }}
    >
      {hasRows ? "Add more input" : "Import input"}
      <Text as="span" ml={3} fontWeight="normal" fontSize="sm" color="fg.muted">
        {modeLabel}{hasRows ? ` · ${rowCount} rows loaded` : ""}
      </Text>
    </summary>
    <Stack gap={3} mt={hasRows ? 3 : 0}>{children}</Stack>
  </details>;
}
