import type { RegistrySnapshot } from "./types";
import { registryDisplayText } from "./registry-display-text";
import { languageTargetDisplayText } from "./language-target-labels";

// Shared field names distinguish the blueprint target, response format, and rule configuration.
export const WORKBENCH_LABELS = {
  blueprintSlot: "Blueprint slot",
  itemFormat: "Item format",
  primaryCanDo: "Primary Can-do",
  domain: "Domain",
  context: "Context",
  difficulty: "Difficulty",
  taskConfiguration: "Task configuration",
  taskFamily: "Task family",
  scoringContract: "Scoring contract",
} as const;

export const CONTENT_KIND_LABELS: Record<string, string> = {
  lexical: "词汇 / Vocabulary",
  character: "汉字 / Characters",
  grammar: "语法 / Grammar",
  pragmatics: "语用 / Pragmatic functions",
  supported: "Supporting material types",
};

export const DOMAIN_LABELS: Record<string, string> = {
  Personal: "Personal",
  Public: "Public",
  Educational: "Educational",
  Occupational: "Occupational",
};

export const DIFFICULTY_LABELS: Record<string, string> = {
  LowerA1: "Lower A1",
  TypicalA1: "Typical A1",
  UpperA1: "Upper A1",
};

export const SKILL_LABELS: Record<string, string> = {
  Listening: "Listening",
  Reading: "Reading",
  Writing: "Writing",
  Speaking: "Speaking",
};

export const ITEM_FORMAT_LABELS: Record<string, string> = {
  "IF-SINGLE-SELECT": "Single select",
  "IF-MATCHING": "Matching",
  "IF-RESTRICTED-INPUT": "Restricted input",
  "IF-FORM-ENTRY": "Form entry",
  "IF-TYPED-MESSAGE": "Typed message",
  "IF-SPOKEN-SINGLE": "Spoken response",
  "IF-SPOKEN-MULTITURN": "Spoken interaction",
};

export const SUPPORTED_CONTENT_LABELS: Record<string, string> = {
  personName: "Person name",
  placeName: "Place name",
  institutionName: "Institution name",
  courseName: "Course name",
  activityName: "Activity name",
  lowFrequencyItem: "Low-frequency object name",
  foodName: "Food name",
  addressSegment: "Short address segment",
  routeOrServiceLabel: "Route or service label",
  latinProperName: "Latin-script proper name",
  interfaceLabel: "Interface label",
  cultureSpecificContent: "Culture-specific content",
};

export const REVIEW_GATE_LABELS: Record<string, string> = {
  editorial: "Language and editing",
  constructAndLevel: "Construct and level",
  content: "Vocabulary, characters, and grammar",
  scoring: "Answers and scoring",
  fairnessAccessibility: "Fairness and accessibility",
  technicalSecurity: "Technical and information security",
};

export const REVIEW_DECISION_LABELS: Record<string, string> = {
  approved: "Approved",
  revise: "Needs revision",
  rejected: "Rejected",
  blocked: "Blocked",
  pending: "Pending",
};

export const SLOT_LABELS: Record<string, string> = {
  "R-A1-1": "Signs, labels, and short notices",
  "R-A1-2": "Short messages and online information",
  "R-A1-3": "Practical structured information",
  "R-A1-4": "Short profiles, routines, and basic descriptions",
  "L-A1-1": "Basic personal and familiar information",
  "L-A1-2": "Explicit details in short dialogues",
  "L-A1-3": "Announcements, messages, and information records",
  "L-A1-4": "Simple communicative purposes and one-step instructions",
  "W-A1-1": "Complete a basic online form",
  "W-A1-2": "Reply to a very short practical message",
  "W-A1-3": "Relay simple information in writing",
  "S-A1-1": "Basic personal questions and answers",
  "S-A1-2": "Express direct needs and familiar content",
  "S-A1-3": "Simple everyday interaction and arrangement confirmation",
  "S-A1-4": "Relay simple information orally",
};

export const CAN_DO_LABELS: Record<string, string> = {
  "A1-L1": "Understand basic personal and familiar information",
  "A1-L2": "Extract explicit practical information",
  "A1-L3": "Understand simple communicative purposes and instructions",
  "A1-R1": "Understand signs, labels, and short notices",
  "A1-R2": "Find key information in short messages and practical texts",
  "A1-S1": "Provide basic personal information",
  "A1-S2": "Express direct needs and familiar content",
  "A1-W1": "Complete a basic online form",
  "A1-W2": "Write a very short practical message",
  "A1-I1": "Conduct a basic personal exchange",
  "A1-I2": "Complete a simple, predictable everyday exchange",
  "A1-I3a": "Arrange or confirm a simple plan orally",
  "A1-I3b": "Arrange or confirm a simple plan in writing",
  "A1-I4": "Maintain and repair a basic exchange",
  "A1-M1": "Relay simple explicit information orally",
  "A1-M2": "Relay simple explicit information in writing",
};

export const CONTEXT_LABELS: Record<string, string> = {
  D01: "Greetings and introductions",
  D02: "Exchange basic personal information",
  D03: "Talk about familiar people",
  D04: "Describe familiar people, objects, and places",
  D05: "Express likes, interests, and abilities",
  D06: "Talk about routines and current situations",
  D07: "Express basic health and help needs",
  D08: "Order common food and drinks",
  D09: "Complete a simple purchase",
  D10: "Use basic transport information",
  D11: "Ask for and state a basic location",
  D12: "Understand public signs and opening information",
  D13: "Arrange or confirm a time and place",
  D14: "Confirm basic accommodation information",
  D15: "Understand and confirm basic course information",
  D16: "Complete simple registration and classroom exchanges",
  D17: "Provide and understand basic work information",
  D18: "Complete a simple workplace exchange",
  D19: "Read and reply to a very short online message",
  D20: "Complete a form and relay key information",
};

export const CONTEXT_SCOPE_LABELS: Record<string, string> = {
  D01: "Greetings, leave-taking, simple introductions, and basic social expressions.",
  D02: "Name, nationality, residence, age, birthday, phone, work, or study.",
  D03: "Basic relationships and information about family, friends, classmates, teachers, and colleagues.",
  D04: "Colour, size, quantity, location, and visible features.",
  D05: "Likes, dislikes, wants, needs, abilities, and a small set of interests.",
  D06: "Routines, current actions, current weather, and simple near-term arrangements.",
  D07: "Basic symptoms, doctors, and requests for help.",
  D08: "Reading a menu, ordering one or two items, quantities, and basic preferences.",
  D09: "Price, colour, size, quantity, and simple payment.",
  D10: "Routes, service numbers, times, tickets, and boarding or alighting points.",
  D11: "Asking for a place, stating a basic location, and giving one-step directions.",
  D12: "Entrances, exits, floors, room numbers, opening hours, and simple permissions or prohibitions.",
  D13: "Meetings, invitations, courses, activities, and simple appointments.",
  D14: "Name, arrival date, room number, breakfast, checkout, and facility locations.",
  D15: "Course name, time, room, teacher, and one-step classroom instructions.",
  D16: "Course details, course messages, asking about words or rooms, and requesting repetition.",
  D17: "Occupation, workplace, shifts, simple schedules, and whether a colleague is present.",
  D18: "One-step work requests, requesting objects, arrival times, meetings, and asking for help.",
  D19: "Confirming time, stating a place, accepting or declining an invitation, attendance, and simple questions.",
  D20: "Entering basic details and finding and relaying explicit practical information from a short source.",
};

export function optionLabel(
  id: string,
  options: Array<{ id: string; label: string }> | undefined,
) {
  const label = options?.find((option) => option.id === id)?.label;
  return label ? registryDisplayText(label) : CAN_DO_LABELS[id] ?? id;
}

export function contentOptionLabel(
  id: string,
  registry: RegistrySnapshot | undefined,
) {
  const option = registry?.contentIdOptions.find((entry) => entry.id === id);
  if (!option) return id;
  const label = option.kind === "supported"
    ? SUPPORTED_CONTENT_LABELS[option.label] ?? option.label
    : languageTargetDisplayText(option);
  return `${CONTENT_KIND_LABELS[option.kind] ?? option.kind}: ${label}`;
}

export function slotLabel(
  id: string,
  registry: RegistrySnapshot | undefined,
  itemFormatId?: string,
) {
  const slot = registry?.blueprintSlots?.find((entry) => entry.id === id);
  if (slot?.displayName) return registryDisplayText(slot.displayName);
  const capability = registry?.capabilities.find(
    (entry) =>
      entry.blueprintSlotId === id &&
      (!itemFormatId || entry.itemFormatId === itemFormatId),
  );
  return capability?.title ? registryDisplayText(capability.title) : SLOT_LABELS[id] ?? id;
}
