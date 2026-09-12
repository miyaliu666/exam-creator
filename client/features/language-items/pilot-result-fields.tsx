import { Box, Input, NativeSelect, SimpleGrid, Stack, Text, Textarea } from "@chakra-ui/react";
import { PILOT_DECISION_LABELS, PILOT_TIMING_LABELS } from "./version-usage-labels";
import type { PilotResultFormState } from "./pilot-result-form-state";
import type { PilotDecision, PilotTimingBasis } from "./version-usage-types";

interface Props { form: PilotResultFormState; disabled: boolean; onChange: (patch: Partial<PilotResultFormState>) => void }

export function PilotResultFields({ form, disabled, onChange }: Props) {
  const textField = (key: "source" | "sampleRef" | "cohort", label: string, placeholder: string) => <Box>
    <Text asChild fontSize="sm" fontWeight="medium"><label htmlFor={`pilot-${key}`}>{label}</label></Text>
    <Input id={`pilot-${key}`} value={form[key]} maxLength={500} disabled={disabled} placeholder={placeholder} onChange={(event) => onChange({ [key]: event.target.value })} />
  </Box>;
  const numberField = (key: "sampleSize" | "correctCount" | "omittedCount" | "discrimination" | "medianResponseTimeSeconds", label: string, optional = true) => <Box>
    <Text asChild fontSize="sm" fontWeight="medium"><label htmlFor={`pilot-${key}`}>{label}{optional ? " (optional)" : ""}</label></Text>
    <Input id={`pilot-${key}`} type="number" value={form[key]} disabled={disabled}
      min={key === "discrimination" ? -1 : key === "sampleSize" ? 1 : 0}
      max={key === "discrimination" ? 1 : key === "sampleSize" ? 10_000_000 : undefined}
      step={key === "discrimination" || key === "medianResponseTimeSeconds" ? "any" : 1}
      placeholder={optional ? "Not recorded" : undefined} onChange={(event) => onChange({ [key]: event.target.value })} />
  </Box>;
  return <Stack gap={3}>
    {textField("sampleRef", "Pilot reference", "Pilot date or batch reference")}
    {textField("source", "Data source", "Report, file or system used for these results")}
    {textField("cohort", "Candidate group", "Language background, level and testing conditions")}
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      {numberField("sampleSize", "Sample size", false)}
      {numberField("correctCount", "Correct count")}
      {numberField("omittedCount", "Omitted count")}
    </SimpleGrid>
    <Box as="details"><Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">Timing and discrimination</Text>
      <Stack mt={3} gap={3}>
        {numberField("discrimination", "Discrimination (correlation)")}
        {numberField("medianResponseTimeSeconds", "Median response time in seconds")}
        <Box><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="pilot-timing">Time measurement</label></Text>
          <NativeSelect.Root disabled={disabled || !form.medianResponseTimeSeconds.trim()}><NativeSelect.Field id="pilot-timing" value={form.medianResponseTimeSeconds.trim() ? form.timingBasis : "unknown"} onChange={(event) => onChange({ timingBasis: event.target.value as PilotTimingBasis })}>
            {Object.entries(PILOT_TIMING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
        </Box>
      </Stack>
    </Box>
    <Box><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="pilot-decision">Decision</label></Text>
      <NativeSelect.Root disabled={disabled}><NativeSelect.Field id="pilot-decision" value={form.decision} onChange={(event) => onChange({ decision: event.target.value as PilotDecision })}>
        {Object.entries(PILOT_DECISION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
    </Box>
    <Box><Text asChild fontSize="sm" fontWeight="medium"><label htmlFor="pilot-notes">Findings and decision rationale</label></Text>
      <Textarea id="pilot-notes" value={form.notes} disabled={disabled} maxLength={8000} onChange={(event) => onChange({ notes: event.target.value })}
        placeholder="What the results support, limitations and next steps. If supplied, describe the correlation method and how item timing handles revisits and inactivity." />
    </Box>
  </Stack>;
}
