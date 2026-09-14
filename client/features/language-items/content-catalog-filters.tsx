import { Button, Field, HStack, Input, SimpleGrid, Stack } from "@chakra-ui/react";

import { CONTENT_KIND_LABELS } from "./labels";
import { CONTENT_MASTERY_OPTIONS, type ContentCatalogFilters } from "./content-catalog-model";
import { FilterSelect } from "./filter-select";
import type { RegistrySnapshot } from "./types";

export function ContentCatalogFilterFields({ filters, onChange, snapshot }: {
  filters: ContentCatalogFilters;
  onChange: (filters: ContentCatalogFilters) => void;
  snapshot: RegistrySnapshot;
}) {
  const kinds = [...new Set(["lexical", "grammar", "character", "pragmatics", "supported", ...snapshot.contentIdOptions.map((entry) => entry.kind)])];
  const set = (key: keyof ContentCatalogFilters) => (value: string) => onChange({ ...filters, [key]: value });
  const additionalFilters = Number(filters.mastery !== "all") + Number(!!filters.canDoId);
  return <Stack gap={3}>
    <SimpleGrid columns={{ base: 1, md: 3 }} gap={3}>
      <FilterSelect label="Category" value={filters.kind} options={kinds.map((id) => ({ id, label: CONTENT_KIND_LABELS[id] ?? id }))} onChange={set("kind")} translate size="md" />
      <FilterSelect label="Level" value={filters.level ?? ""} options={[{ id: "__missing", label: "Not set" }, ...[...new Set(snapshot.contentIdOptions.map((entry) => entry.level?.trim()).filter((level): level is string => !!level))].sort().map((level) => ({ id: level, label: level }))]} onChange={set("level")} size="md" />
      <Field.Root><Field.Label>Search</Field.Label><Input placeholder="Word, meaning, structure or example" value={filters.query} onChange={(event) => set("query")(event.target.value)} /></Field.Root>
    </SimpleGrid>
    <HStack align="start" gap={3}>
      <details style={{ flex: 1 }}><summary style={{ cursor: "pointer" }}>More filters{additionalFilters ? ` (${additionalFilters})` : ""}</summary>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3} mt={3}>
          <FilterSelect label="Mastery scope" value={filters.mastery === "all" ? "" : filters.mastery || "__unrestricted"} options={CONTENT_MASTERY_OPTIONS.map((option) => ({ ...option, id: option.id || "__unrestricted" }))} onChange={(value) => set("mastery")(value === "__unrestricted" ? "" : value || "all")} translate size="md" />
          <FilterSelect label="Applicable Can-do" value={filters.canDoId} options={[{ id: "__unrestricted", label: "Not restricted" }, ...snapshot.canDoOptions]} onChange={set("canDoId")} translate size="md" />
        </SimpleGrid>
      </details>
      <Button size="xs" variant="plain" onClick={() => onChange({ language: filters.language, kind: "", query: "", mastery: "all", canDoId: "", level: "" })}>Clear filters</Button>
    </HStack>
  </Stack>;
}
