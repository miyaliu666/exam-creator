import { Button, Field, HStack, Text } from "@chakra-ui/react";
import { useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export function FilePicker({ label, accept, disabled = false, resetAfterSelect = false, onFile, children }: {
  label: string;
  accept: string;
  disabled?: boolean;
  resetAfterSelect?: boolean;
  onFile?: (file: File) => void;
  children?: ReactNode;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  return <Field.Root disabled={disabled}>
    <Field.Label htmlFor={`${id}-trigger`}>{label}</Field.Label>
    <HStack gap={3} w="full" minW={0}>
      {/* Native file controls use the browser locale even on an English page. */}
      <input ref={input} type="file" accept={accept} disabled={disabled} hidden onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        if (resetAfterSelect) event.target.value = "";
        onFile?.(file);
      }} />
      <Button id={`${id}-trigger`} type="button" variant="outline" flexShrink={0} disabled={disabled} aria-describedby={`${id}-file`} onClick={() => input.current?.click()}>Choose file</Button>
      <Text id={`${id}-file`} role="status" fontSize="sm" color={fileName ? undefined : "fg.muted"} overflowWrap="anywhere" minW={0}>{fileName || "No file selected"}</Text>
    </HStack>
    {children}
  </Field.Root>;
}
