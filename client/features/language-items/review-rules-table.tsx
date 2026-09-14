import { Badge, Box, Button, HStack, Stack, Table, Text } from "@chakra-ui/react";
import { useState } from "react";

import { ReviewSourceSummary } from "./review-source-summary";
import type { ReviewCheck, ReviewCustomRule, ReviewRuleSource } from "./review-rule-types";

export function ReviewRulesTable({ checks, sources, disabled, onEdit, onRemove, onEditSource }: {
  checks: ReviewCheck[];
  sources: ReviewRuleSource[];
  disabled: boolean;
  onEdit: (rule: ReviewCustomRule) => void;
  onRemove: (id: string) => void;
  onEditSource?: (sourceRef: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return <Box overflowX="auto" borderWidth="1px" borderRadius="md"><Table.Root size="sm" minW="680px" aria-label="Review rules">
    <Table.Header><Table.Row><Table.ColumnHeader>Source</Table.ColumnHeader><Table.ColumnHeader>Pass criteria</Table.ColumnHeader><Table.ColumnHeader>Method</Table.ColumnHeader><Table.ColumnHeader>Actions</Table.ColumnHeader></Table.Row></Table.Header>
    <Table.Body>{checks.map((check) => <Table.Row key={check.id} verticalAlign="top">
      <Table.Cell><Stack gap={2} maxW="64">
        <Badge alignSelf="start" colorPalette={check.origin === "fixed" ? "blue" : "gray"}>{check.origin === "fixed" ? "From settings" : "Supplementary"}</Badge>
        {check.sourceRefs.length ? check.sourceRefs.map((id) => {
          const source = sources.find((entry) => entry.id === id);
          const key = `${check.id}:${id}`;
          return <details key={id} open={expanded[key] ?? false} onToggle={(event) => { const open = event.currentTarget.open; setExpanded((current) => current[key] === open ? current : { ...current, [key]: open }); }}><summary style={{ cursor: "pointer" }}>{source?.label ?? "Unavailable source"}</summary>
            {source ? <ReviewSourceSummary source={source} /> : null}
          </details>;
        }) : <Text fontSize="sm">Custom standard</Text>}
      </Stack></Table.Cell>
      <Table.Cell><Stack gap={1} maxW="lg"><Text fontWeight="medium">{check.title}</Text><Text fontSize="sm">{check.criterion}</Text>
        {check.requiredEvidence.length ? <details><summary style={{ cursor: "pointer" }}>Required evidence</summary><Stack mt={2} gap={1}>{check.requiredEvidence.map((value, index) => <Text key={index} fontSize="sm">{value}</Text>)}</Stack></details> : null}
        <Text fontSize="xs" color="fg.muted">{check.required ? "Required for submission" : "Advisory"}</Text>
      </Stack></Table.Cell>
      <Table.Cell><Text fontSize="sm">{check.method === "deterministic" ? "Checks" : "AI review"}</Text></Table.Cell>
      <Table.Cell>{check.origin === "custom" ? <HStack gap={1} flexWrap="wrap"><Button size="xs" variant="outline" disabled={disabled} onClick={() => onEdit({ id: check.id, title: check.title, criterion: check.criterion, requiredEvidence: check.requiredEvidence, sourceRefs: check.sourceRefs, required: check.required })}>Edit</Button><Button size="xs" variant="plain" colorPalette="red" disabled={disabled} onClick={() => onRemove(check.id)}>Remove</Button></HStack> : <Stack gap={1} align="start">{check.sourceRefs.map((id) => {
        if (!sources.some((source) => source.id === id)) return <Text key={id} fontSize="xs" color="fg.muted">Source unavailable</Text>;
        const reviewGates = id.startsWith("review.");
        return <Button key={id} size="xs" variant="outline" onClick={() => {
          if (!reviewGates && onEditSource) onEditSource(id);
          else setExpanded((current) => ({ ...current, [`${check.id}:${id}`]: true }));
        }}>{reviewGates ? "View required reviews" : disabled || !onEditSource ? "View source" : "Edit source"}</Button>;
      })}</Stack>}</Table.Cell>
    </Table.Row>)}</Table.Body>
  </Table.Root></Box>;
}
