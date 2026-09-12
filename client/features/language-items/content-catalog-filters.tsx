import { Button, Field, HStack, Input, SimpleGrid, Stack } from "@chakra-ui/react";

import { CONTENT_KIND_LABELS } from "./labels";
import { CONTENT_MASTERY_OPTIONS, type ContentCatalogFilters } from "./content-catalog-model";
import { SelectField } from "./registry-form-controls";
import type { RegistrySnapshot } from "./types";

export function ContentCatalogFilterFields({ filters, onChange, snapshot }: {
  filters: ContentCatalogFilters;
  onChange: (filters: ContentCatalogFilters) => void;
  snapshot: RegistrySnapshot;
}) {
  const kinds = [...new Set(["lexical", "grammar", "character", "pragmatics", "supported", ...snapshot.contentIdOptions.map((entry) => entry.kind)])];
  const set = (key: keyof ContentCatalogFilters) => (value: string) => onChange({ ...filters, [key]: value });
  const additionalFilters = Number(filters.mastery !== "all") + Number(!!filters.canDoId) + Number(!!filters.contextId);
  return <Stack gap={3}>
    <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
      <SelectField label="Category" value={filters.kind} options={[{ id: "", label: "All categories" }, ...kinds.map((id) => ({ id, label: CONTENT_KIND_LABELS[id] ?? id }))]} onChange={set("kind")} />
      <Field.Root><Field.Label>Search</Field.Label><Input value={filters.query} onChange={(event) => set("query")(event.target.value)} /></Field.Root>
    </SimpleGrid>
    <HStack align="start" gap={3}>
      <details style={{ flex: 1 }}><summary style={{ cursor: "pointer" }}>More filters{additionalFilters ? ` (${additionalFilters})` : ""}</summary>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap={3} mt={3}>
          <SelectField label="Mastery scope" value={filters.mastery} options={[{ id: "all", label: "All" }, ...CONTENT_MASTERY_OPTIONS]} onChange={set("mastery")} />
          <SelectField label="Applicable Can-do" value={filters.canDoId} options={[{ id: "", label: "All" }, { id: "__unrestricted", label: "Not restricted" }, ...snapshot.canDoOptions]} onChange={set("canDoId")} />
          <SelectField label="Applicable Context" value={filters.contextId} options={[{ id: "", label: "All" }, { id: "__unrestricted", label: "Not restricted" }, ...snapshot.contextOptions.map((entry) => ({ id: entry.id, label: `${entry.label}${entry.retired ? " · retired" : ""}` }))]} onChange={set("contextId")} />
        </SimpleGrid>
      </details>
      <Button size="xs" variant="plain" onClick={() => onChange({ kind: "", query: "", mastery: "all", canDoId: "", contextId: "" })}>Clear filters</Button>
    </HStack>
  </Stack>;
}
