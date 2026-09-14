import { Badge, Box, Button, HStack, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import type { ReviewRuleProposal } from "./review-rule-model";
import type { ReviewCustomRule, ReviewRuleSource } from "./review-rule-types";

function RuleSummary({ rule, sources }: { rule: ReviewCustomRule | undefined; sources: ReviewRuleSource[] }) {
  if (!rule) return <Text fontSize="sm" color="fg.muted">No existing supplementary rule</Text>;
  return <Stack gap={1}><Text fontWeight="medium">{rule.title}</Text><Text fontSize="sm">{rule.criterion}</Text>
    {rule.requiredEvidence.map((value, index) => <Text key={index} fontSize="sm">Evidence: {value}</Text>)}
    <Text fontSize="xs">Source: {rule.sourceRefs.map((id) => sources.find((source) => source.id === id)?.label ?? "Unavailable source").join(" · ") || "Custom standard"}</Text>
    <Text fontSize="xs">{rule.required ? "Required for submission" : "Advisory"}</Text>
  </Stack>;
}

export function ReviewRuleProposals({ proposals, sources, selectedIds, disabled, stale, model, onSelect, onApply, onDiscard }: {
  proposals: ReviewRuleProposal[];
  sources: ReviewRuleSource[];
  selectedIds: string[];
  disabled: boolean;
  stale: boolean;
  model: string;
  onSelect: (ids: string[]) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return <Stack gap={3} borderWidth="1px" borderRadius="lg" p={4}>
    <HStack justify="space-between"><Text fontWeight="semibold">AI suggestions</Text><Text fontSize="xs" color="fg.muted">{model}</Text></HStack>
    {stale ? <Text role="alert" color="fg.error">Settings changed after generation. Discard these suggestions and generate again.</Text> : null}
    {proposals.map((proposal, index) => <Box key={`${proposal.proposed.id}:${index}`} borderTopWidth="1px" pt={3}>
      <HStack mb={2}><label><input type="checkbox" checked={selectedIds.includes(proposal.proposed.id)} disabled={disabled || stale || !proposal.changed || !!proposal.issues.length} onChange={(event) => onSelect(event.target.checked ? [...selectedIds, proposal.proposed.id] : selectedIds.filter((id) => id !== proposal.proposed.id))} /> Use suggestion</label><Badge>{!proposal.changed ? "Unchanged" : proposal.previous ? "Update" : "Add"}</Badge></HStack>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap={4}><Stack gap={2}><Text fontSize="xs" color="fg.muted">Current</Text><RuleSummary rule={proposal.previous} sources={sources} /></Stack><Stack gap={2}><Text fontSize="xs" color="fg.muted">Proposed</Text><RuleSummary rule={proposal.proposed} sources={sources} /></Stack></SimpleGrid>
      {proposal.issues.map((issue) => <Text key={issue} fontSize="sm" color="fg.error">{issue}</Text>)}
    </Box>)}
    {!proposals.length ? <Text fontSize="sm">AI returned no supplementary rules.</Text> : null}
    <HStack><Button colorPalette="teal" disabled={disabled || stale || !selectedIds.length} onClick={onApply}>Apply selected suggestions</Button><Button variant="outline" onClick={onDiscard}>Discard suggestions</Button></HStack>
  </Stack>;
}
