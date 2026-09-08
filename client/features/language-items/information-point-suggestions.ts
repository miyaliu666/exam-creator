import type { RegistrySnapshot, TaskPackage } from "./types";
import { capabilityForDraft } from "./registry-capability";

const SLOT_SUGGESTIONS: Record<string, string[]> = {
  "R-A1-1": ["Direct meaning of the sign or notice", "Open, closed, permitted, or prohibited status", "Date or time", "Entrance, exit, floor, or room number"],
  "R-A1-2": ["Person or contact in the message", "Meeting or activity time", "Location", "Required arrangement or action"],
  "R-A1-3": ["Item, course, or product name", "Date or time", "Location or room number", "Price or quantity"],
  "R-A1-4": ["Basic personal detail", "Daily arrangement", "Time or location", "One-step action instruction"],
  "L-A1-1": ["Speaker or relevant person", "Current activity", "Location", "Personal or familiar information"],
  "L-A1-2": ["Explicit person in the dialogue", "Explicit time or date", "Explicit location", "Price, quantity, or arrangement detail"],
  "L-A1-3": ["Date of the announcement or message", "Time", "Location or room number", "Phone, route number, or quantity"],
  "L-A1-4": ["Speaker's direct purpose", "Required action", "Request or invitation", "Confirmation outcome"],
  "W-A1-1": ["Name or identity", "City or nationality", "Date or phone number", "Work, study, or availability"],
  "W-A1-2": ["Accept or decline the arrangement", "Arrangement time or location", "Detail to confirm", "Simple question for the recipient"],
  "W-A1-3": ["Information to select and relay", "Accurate key value", "Specified recipient", "Purpose the message must achieve"],
  "S-A1-1": ["Personal or familiar information", "Answer to a direct question", "Related question initiated by the candidate", "Basic study, work, or schedule information"],
  "S-A1-2": ["Direct need to express", "Main prompted content", "Familiar object or current activity", "Required help or action"],
  "S-A1-3": ["Request to make", "Quantity, price, or object", "Confirmation to complete", "Simple repair after misunderstanding"],
  "S-A1-4": ["Information to select and relay orally", "Key time or location", "Route, quantity, or other core value", "Recipient-oriented purpose"],
};

const CONTEXT_RULES: Array<{ pattern: RegExp; suggestion: string }> = [
  { pattern: /课程|上课|学校|学习/, suggestion: "Course date, time, or room" },
  { pattern: /购买|商品|商店|菜单|餐厅|点餐/, suggestion: "Product, price, or quantity" },
  { pattern: /交通|公交|车站|路线|线路/, suggestion: "Route, departure time, or boarding point" },
  { pattern: /预约|安排|活动|见面/, suggestion: "Arrangement date, time, or location" },
  { pattern: /电话|联系|留言/, suggestion: "Contact, phone number, or message purpose" },
  { pattern: /人物|个人|家庭|朋友/, suggestion: "Person identity or basic personal information" },
  { pattern: /方向|入口|出口|楼层|房间/, suggestion: "Entrance, exit, floor, or room number" },
  { pattern: /工作|职业/, suggestion: "Workplace, time, or duty" },
  { pattern: /健康|身体|医生/, suggestion: "Health issue or required help" },
];

export function informationPointSuggestions(
  draft: TaskPackage,
  registry: RegistrySnapshot | undefined,
) {
  const capability = capabilityForDraft(registry, draft);
  const context = registry?.contextOptions.find(
    (entry) => entry.id === draft.content.contextId,
  );
  const haystack = [
    context?.label,
    context?.scope,
    capability?.observableEvidence,
    capability?.referenceTask,
  ]
    .filter(Boolean)
    .join(" ");
  const contextual = CONTEXT_RULES
    .filter((rule) => rule.pattern.test(haystack))
    .map((rule) => rule.suggestion);

  return Array.from(
    new Set([
      ...contextual,
      ...(SLOT_SUGGESTIONS[draft.blueprintSlotId] ?? []),
    ]),
  ).slice(0, 6);
}
