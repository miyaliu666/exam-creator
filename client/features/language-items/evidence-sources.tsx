import { Box, Button, HStack, Input, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import type { EvidenceSource } from "./evidence-api";

export function EvidenceSources({ values, disabled, onChange }: { values: EvidenceSource[]; disabled: boolean; onChange: (values: EvidenceSource[]) => void }) {
  const change = (index: number, patch: Partial<EvidenceSource>) => onChange(values.map((source, i) => i === index ? { ...source, ...patch } : source));
  return <Stack gap={3}>
    <HStack justify="space-between"><Text fontWeight="medium">Materials and sources</Text>
      <Button size="sm" variant="outline" disabled={disabled || values.length >= 20} onClick={() => onChange([...values, { title: "", url: "", usage: "unverified", notes: "" }])}>Add source</Button></HStack>
    <Text fontSize="sm" color="fg.muted">Record your own materials or the permission for external material. A public link alone does not establish permission to generate or deliver exam content.</Text>
    {values.map((source, index) => <Box key={index} borderWidth="1px" borderRadius="md" p={3}>
      <Stack gap={2}>
        <Input aria-label={`Source ${index + 1} title`} placeholder="Source title or own material" value={source.title} disabled={disabled} maxLength={500} onChange={(event) => change(index, { title: event.target.value })} />
        <Input aria-label={`Source ${index + 1} link`} placeholder="Optional source link" value={source.url} disabled={disabled} maxLength={2000} onChange={(event) => change(index, { url: event.target.value })} />
        <NativeSelect.Root disabled={disabled}><NativeSelect.Field aria-label={`Source ${index + 1} usage`} value={source.usage} onChange={(event) => change(index, { usage: event.target.value as EvidenceSource["usage"] })}>
          <option value="unverified">Permission not verified</option><option value="original">Own original material</option><option value="authorized">Permission confirmed by author</option>
        </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        <Textarea aria-label={`Source ${index + 1} permission notes`} placeholder="Origin, permitted use and any limitations" value={source.notes} disabled={disabled} maxLength={4000} onChange={(event) => change(index, { notes: event.target.value })} />
        {!disabled ? <Button alignSelf="end" size="sm" variant="ghost" onClick={() => onChange(values.filter((_, i) => i !== index))}>Remove source</Button> : null}
      </Stack>
    </Box>)}
  </Stack>;
}
