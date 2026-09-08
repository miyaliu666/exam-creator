import { Box, SimpleGrid, Stack, Text } from "@chakra-ui/react";

import type { RegistrySnapshot, TaskPackage } from "./types";

interface ScoringContractPanelProps {
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
}

const SCORING_TYPE_LABELS: Record<string, string> = {
  objective: "Automatic scoring",
  objectiveFields: "Automatic field-by-field scoring",
  fieldCriteria: "Field-by-field scoring",
  analyticRubric: "Fixed A1 analytic rubric",
};

const POLICY_LABELS: Record<string, string> = {
  "PC-NONE-v0.1": "Full credit for a correct answer; zero for an incorrect or blank answer; no negative marking",
  "PC-PER-MATCH-v0.1": "Each correct match earns credit independently; no negative marking",
  "PC-PER-FIELD-v0.1": "Each valid field earns credit independently; blank or invalid fields earn zero",
  "PC-ANALYTIC-RUBRIC-v0.1": "Evaluate the required response evidence with the fixed A1 rubric",
};

const REQUIREMENT_LABELS: Record<string, string> = {
  "4-6 fields": "Include 4–6 fields",
  "at least one Chinese field": "Require Chinese in at least one field",
  "field labels understood": "Make every field label clear and understandable",
  "no real sensitive information": "Do not request real sensitive information",
  "respond to source message": "Respond to the source message",
  "ask, state or confirm at least one arrangement detail": "Ask, state, or confirm at least one arrangement detail",
  "1-3 content points": "Include 1–3 required content points",
  "select relevant information": "Select information relevant to the task",
  "maintain key information accuracy": "Preserve the accuracy of key information",
  "address specified recipient and purpose": "Address the specified recipient and purpose",
  "answer personal/familiar questions": "Answer questions about personal or familiar topics",
  "provide basic information": "Provide basic information",
  "ask one related question": "Ask one related question",
  "address 1-3 prompted content points": "Address 1–3 prompted content points",
  "remain intelligible enough to identify key content": "Remain intelligible enough to identify key content",
  "respond across 2-3 turns": "Respond across 2–3 turns",
  "complete required request/confirmation/repair": "Complete the required request, confirmation, or repair",
  "actually speak": "Produce an actual spoken response",
  "select recipient-relevant information": "Select information relevant to the recipient",
  "relay key details accurately": "Relay key details accurately",
  "complete oral relay purpose": "Complete the oral relay purpose",
};

const CAP_LABELS: Record<string, string> = {
  "All-mechanical copying cannot alone satisfy the task.": "Mechanical copying alone cannot satisfy the task.",
  "Without actual message response or arrangement behavior, Task Fulfilment cannot exceed band 1 and A1-I3b is not evidenced.": "Without an actual message response or arrangement, Task Fulfilment cannot exceed band 1.",
  "Pure copying without recipient-oriented message caps Task Fulfilment at band 1.": "Pure copying without a recipient-oriented message caps Task Fulfilment at band 1.",
  "No required initiation caps Interaction and Responsiveness at band 1.": "Missing the required initiation caps Interaction and Responsiveness at band 1.",
  "Reading a supplied sentence does not count as the target production.": "Reading a supplied sentence does not count as the target production.",
  "Selecting an option without speaking yields no Interaction evidence.": "Selecting an option without speaking yields no Interaction evidence.",
  "Reading the whole source without recipient-oriented relay caps task fulfilment at band 1.": "Reading the source without a recipient-oriented relay caps Task Fulfilment at band 1.",
};

const NORMALIZATION_LABELS: Record<string, string> = {
  "NORM-NONE-v0.1": "Validate submitted response IDs exactly; do not infer semantic matches.",
  "NORM-NUMBER-v0.1": "Trim spacing, normalize Unicode and full-width digits, and apply only approved leading-zero rules.",
  "NORM-DATE-v0.1": "Accept only approved equivalent date forms; do not infer missing parts or swap month and day.",
  "NORM-TIME-v0.1": "Accept approved equivalent clock-time forms; preserve AM/PM meaning and do not round.",
  "NORM-PHONE-v0.1": "Normalize Unicode and approved visual separators only; never reorder or replace digits.",
  "NORM-SHORT-CORE-TEXT-v0.1": "Trim outer spacing, normalize Unicode, and ignore only explicitly non-target final punctuation; do not use fuzzy matching.",
  "NORM-FORM-v0.1": "Apply the approved normalization rule for each field; never apply one fuzzy rule to the whole form.",
  notApplicable: "No response normalization applies.",
};

const INVALID_RESPONSE_LABELS: Record<string, string> = {
  "INVALID-OBJECTIVE-v0.1": "A blank, invalid response ID, or multiple selections where only one is allowed earns zero. A technical failure is not scored as a candidate error.",
  "INVALID-CONSTRUCTED-v0.1": "A blank, completely off-topic response, or response with no scorable language earns zero. A short but relevant response is scored on the evidence present. A technical failure is not scored as a candidate error.",
  notApplicable: "Not applicable.",
};

const TECHNICAL_INCIDENT_LABEL =
  "A system failure must never be recorded directly as a candidate zero. Recover the response, allow a controlled retry, exclude the affected item, or record insufficient evidence.";

const SCORING_POINT_LABELS: Record<string, string> = {
  "整题正确": "Correct response",
  "任务完成与关键信息": "Task fulfilment and key information",
  "可理解度": "Comprehensibility",
  "基本语言控制": "Basic language control",
  "简体文字与基本书面规范": "Simplified Chinese and basic writing conventions",
  "任务完成与信息准确性": "Task fulfilment and information accuracy",
  "可理解度与语音控制": "Intelligibility and pronunciation control",
  "基本语言控制与流利度": "Basic language control and fluency",
  "任务完成与相关性": "Task fulfilment and relevance",
  "互动与回应": "Interaction and responsiveness",
};

const SCORING_POINT_ID_LABELS: Record<string, string> = {
  "SP-ITEM": "Correct response",
  "SP-COMPREHENSIBILITY": "Comprehensibility",
  "SP-CONVENTIONS": "Simplified Chinese and basic writing conventions",
  "SP-INTERACTION": "Interaction and responsiveness",
  "SP-INTELLIGIBILITY": "Intelligibility and pronunciation control",
};

function scoringPointLabel(scoringPointId: string, description: string, index: number) {
  if (SCORING_POINT_ID_LABELS[scoringPointId]) {
    return SCORING_POINT_ID_LABELS[scoringPointId];
  }
  const normalizedDescription = description.trim();
  if (SCORING_POINT_LABELS[normalizedDescription]) {
    return SCORING_POINT_LABELS[normalizedDescription];
  }
  if (normalizedDescription.startsWith("正确匹配")) return `Correct match ${index + 1}`;
  if (normalizedDescription.startsWith("表单字段")) return `Form field ${index + 1}`;
  return normalizedDescription;
}

function rubricLabel(rubricId: string) {
  if (rubricId === "notApplicable") return "Not applicable";
  if (rubricId.includes("INTERACTION")) return "Fixed A1 spoken interaction rubric";
  if (rubricId.includes("PRODUCTION")) return "Fixed A1 spoken production rubric";
  if (rubricId.includes("RUB-W")) return "Fixed A1 writing rubric";
  return "Fixed A1 rubric";
}

function benchmarkLabel(version: string | undefined) {
  if (!version) return "Not applicable";
  if (version === "PendingRealCandidateResponses") {
    return "Pilot response benchmark pending; use the fixed rubric until an approved benchmark is published.";
  }
  return version;
}

export function ScoringContractPanel({ draft, registry }: ScoringContractPanelProps) {
  const contract = registry?.scoringContracts?.find(
    (entry) =>
      entry.scoringContractTemplateId === draft.scoringPackage.scoringContractTemplateId,
  );
  const maxRawScore = (draft.scoringPackage.scoringPoints ?? []).reduce(
    (total, point) => total + (Number(point.points) || 0),
    0,
  );

  if (!contract) return <Text role="alert" color="fg.error">Scoring rules could not be loaded. Refresh and try again.</Text>;

  const policies = [
    ["Credit rule", POLICY_LABELS[contract.partialCredit.policyId] ?? contract.partialCredit.summary],
    ["Response normalization", NORMALIZATION_LABELS[contract.normalization.policyId] ?? contract.normalization.summary],
    ["Invalid responses", INVALID_RESPONSE_LABELS[contract.invalidResponse.policyId] ?? contract.invalidResponse.summary],
    ["Technical incidents", TECHNICAL_INCIDENT_LABEL],
  ];
  return (
    <Box as="details" borderWidth="1px" borderRadius="lg" p={4}>
      <Text as="summary" cursor="pointer" fontSize="sm" fontWeight="medium">
        Scoring rules · {maxRawScore} {maxRawScore === 1 ? "point" : "points"}
      </Text>
      <Stack mt={4} gap={4} fontSize="sm">
        <Text color="fg.muted">Set by Assessment Settings. Enter answers or response requirements in the editor; these rules apply automatically.</Text>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap={3}>
          <Box><Text fontWeight="medium">Scoring method</Text><Text>{SCORING_TYPE_LABELS[contract.scoringType] ?? contract.scoringType}</Text></Box>
          {contract.rubricId !== "notApplicable" ? <Box><Text fontWeight="medium">Rubric</Text><Text>{rubricLabel(contract.rubricId)}</Text></Box> : null}
        </SimpleGrid>
        <Box>
          <Text fontWeight="medium" mb={2}>Scoring points</Text>
          {(draft.scoringPackage.scoringPoints ?? []).map((point, index) => (
            <Text key={point.scoringPointId}>{scoringPointLabel(point.scoringPointId, point.description, index)} — {point.points} points</Text>
          ))}
        </Box>
        {contract.taskSpecificRequirements.length ? <Box>
          <Text fontWeight="medium" mb={2}>Response requirements</Text>
          {contract.taskSpecificRequirements.map((requirement) => <Text key={requirement}>· {REQUIREMENT_LABELS[requirement] ?? requirement}</Text>)}
          {contract.capOrExclusion ? <Text mt={2} color="fg.warning">{CAP_LABELS[contract.capOrExclusion] ?? contract.capOrExclusion}</Text> : null}
        </Box> : null}
        {policies.map(([label, value]) => <Box key={label}><Text fontWeight="medium">{label}</Text><Text mt={1}>{value}</Text></Box>)}
        <Text color="fg.muted">Contract version: {contract.templateVersion || "Current approved version"}</Text>
        <Text color="fg.muted">{benchmarkLabel(draft.scoringPackage.benchmarkSetVersion)}</Text>
      </Stack>
    </Box>
  );
}
