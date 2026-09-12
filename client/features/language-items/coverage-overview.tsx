import { Box, Field, HStack, Input, NativeSelect, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useMemo, type ReactNode } from "react";

import { CoverageFilterSection } from "./coverage-filter-section";
import { coverageOverviewCategories, coverageOverviewModel } from "./coverage-overview-model";
import { CoverageOverviewTable } from "./coverage-overview-table";
import type { CoverageOverview, CoverageOverviewState } from "./coverage-types";
import { CONTENT_KIND_LABELS } from "./labels";
import type { RegistrySnapshot } from "./types";

function percentage(value: number | null) {
  return value === null ? "—" : `${Number(value.toFixed(1))}%`;
}

function SelectField({ label, value, options, onChange }: {
  label: string; value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void;
}) {
  return <Field.Root><Field.Label>{label}</Field.Label><NativeSelect.Root size="sm"><NativeSelect.Field aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></Field.Root>;
}

export function CoverageOverviewPanel({ registry, data, state, filters, feedback, disabled, onReset, onStateChange, onInspect }: {
  registry: RegistrySnapshot; data?: CoverageOverview; state: CoverageOverviewState;
  filters: ReactNode; feedback?: ReactNode; disabled?: boolean; onReset?: () => void;
  onStateChange: (patch: Partial<CoverageOverviewState>) => void;
  onInspect: (id: string, scope: "approved" | "drafts") => void;
}) {
  const model = useMemo(() => data ? coverageOverviewModel(registry, data, state) : undefined, [registry, data, state]);
  const summary = model?.summary;
  const change = (patch: Partial<CoverageOverviewState>) => onStateChange({ ...patch, offset: 0 });
  const missingApproved = !!data?.plannedUnknownCount;
  const missingPending = !!data?.pendingUnknownCount;
  const metrics = summary ? [
    { label: "Total", count: summary.total },
    { label: "Has approved items", count: summary.approved, detail: percentage(summary.approvedPercent) },
    { label: missingApproved ? "Only unapproved items recorded" : "Unapproved items only", count: summary.unapprovedOnly, detail: percentage(summary.unapprovedOnlyPercent) },
    { label: missingApproved || missingPending ? "No recorded items" : "No items", count: summary.noItems, detail: percentage(summary.noItemsPercent) },
  ] : [];
  const missingTargets = [
    { count: data?.plannedUnknownCount ?? 0, label: "approved" }, { count: data?.pendingUnknownCount ?? 0, label: "unapproved" },
  ].filter(({ count }) => count > 0).map(({ count, label }) => `${count} ${label} ${count === 1 ? "item" : "items"}`);
  return <Stack gap={5}>
    <Box as="section" aria-label="Language content overview" borderWidth="1px" borderRadius="lg" p={4}>
      <Text fontWeight="medium" mb={3}>Language content</Text>
      {feedback}
      {summary && <>
      <SimpleGrid columns={{ base: 1, sm: 2, md: 4 }} gap={4}>
        {metrics.map((metric) => <Box key={metric.label}>
          <Text fontSize="sm" color="fg.muted">{metric.label}</Text>
          <HStack align="baseline" gap={2}>
            <Text fontSize="2xl" fontWeight="semibold">{metric.count}</Text>
            {metric.detail && <Text fontSize="sm" color="fg.muted">{metric.detail}</Text>}
          </HStack>
        </Box>)}
      </SimpleGrid>
      {missingTargets.length > 0 && <Text mt={3} fontSize="xs" color="fg.warning">Saved target data is missing for {missingTargets.join(" and ")}; coverage counts exclude those items.</Text>}
      </>}
    </Box>
    <CoverageFilterSection onReset={onReset}>
      <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
          <SelectField label="Category" value={state.category === "all" ? "" : state.category}
            options={[{ value: "", label: "All categories" }, ...coverageOverviewCategories(registry).map((category) => ({ value: category, label: CONTENT_KIND_LABELS[category] ?? category }))]}
            onChange={(category) => change({ category })} />
          <Field.Root><Field.Label>Search language content</Field.Label><Input size="sm" aria-label="Search language content" value={state.search} onChange={(event) => change({ search: event.target.value })} /></Field.Root>
        </SimpleGrid>
      </fieldset>
      {filters}
    </CoverageFilterSection>
    <Stack gap={3}>
      <HStack justify="space-between" align="end" flexWrap="wrap">
        <Text fontWeight="medium">Coverage by language content</Text>
        <Box w={{ base: "full", sm: "64" }}>
        <SelectField label="Sort by" value={state.sort} options={[
          { value: "name", label: "Name" }, { value: "planned", label: "Approved items: fewest first" }, { value: "pending", label: "Unapproved items: most first" },
        ]} onChange={(sort) => change({ sort: sort as CoverageOverviewState["sort"] })} />
        </Box>
      </HStack>
      {model && (model.categoryTotal === 0 ? <Text role="status" color="fg.muted">No language content in this category.</Text> :
      <CoverageOverviewTable rows={model.rows} total={model.matchedCount} offset={model.offset} onPage={(offset) => onStateChange({ offset })} onInspect={onInspect}
        onClearSearch={() => change({ search: "" })} unknownTargets={missingApproved || missingPending} />)}
    </Stack>
  </Stack>;
}
