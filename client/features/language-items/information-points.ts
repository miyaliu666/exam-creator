import type { InformationPoint, TaskPackage } from "./types";

export function inferInformationPointType(label: string): InformationPoint["pointType"] {
  if (/日期|哪天|星期/.test(label)) return "date";
  if (/时间|几点|开放/.test(label)) return "time";
  if (/地点|位置|入口|出口|楼层|房间|线路/.test(label)) return "location";
  if (/价格|付款|多少钱/.test(label)) return "price";
  if (/数量|多少/.test(label)) return "quantity";
  if (/人物|姓名|名称|联系人/.test(label)) return "name";
  if (/行动|安排|需要完成|回应/.test(label)) return "action";
  if (/目的|请求|邀请|确认/.test(label)) return "purpose";
  return "other";
}

export function normalizedInformationPoint(value: InformationPoint | string | undefined, index: number): InformationPoint {
  if (value && typeof value !== "string") return value;
  const label = value ?? "";
  return { id: `IP${index + 1}`, pointType: inferInformationPointType(label), label, required: true };
}

export function ensureInformationPointSlots(draft: TaskPackage, count: number) {
  const points = draft.content.requiredInformationPoints.map(normalizedInformationPoint);
  // Removing a point must not make the next blank reuse a surviving point's ID.
  while (points.length < count) {
    let number = 1;
    while (points.some((point) => point.id === `IP${number}`)) number += 1;
    points.push({ id: `IP${number}`, pointType: "other", label: "", required: true });
  }
  draft.content.requiredInformationPoints = points;
}
