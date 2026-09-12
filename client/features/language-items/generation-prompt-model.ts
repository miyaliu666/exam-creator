interface PromptSection { label: string; text: string }

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readable(value: unknown): string {
  if (typeof value !== "string") return JSON.stringify(value, null, 2) ?? "";
  try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; }
}

export function generationPromptSections(requestBody: unknown): PromptSection[] {
  const body = record(requestBody);
  if (!body) return [];
  const sections: PromptSection[] = [];
  if (typeof body.instructions === "string") sections.push({ label: "Instructions", text: body.instructions });
  if (body.input !== undefined) sections.push({ label: "Item requirements", text: readable(body.input) });
  const format = record(record(body.text)?.format);
  if (format?.schema !== undefined) sections.push({ label: "Output format", text: readable(format.schema) });
  if (Array.isArray(body.messages)) {
    for (const message of body.messages) {
      const entry = record(message);
      if (typeof entry?.content !== "string") continue;
      sections.push({ label: entry.role === "system" ? "Instructions" : "Item requirements and output format", text: readable(entry.content) });
    }
  }
  sections.push({ label: "Full request", text: JSON.stringify(requestBody, null, 2) });
  return sections;
}

export function validPromptOrdinal(value: string, maximum: number): number | undefined {
  if (!/^[1-9]\d*$/.test(value)) return undefined;
  const ordinal = Number(value);
  return Number.isSafeInteger(ordinal) && ordinal <= maximum ? ordinal : undefined;
}
