export function isValidCandidateCount(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

export function parseCandidateCount(value: string): number {
  const parsed = /^\d+$/.test(value.trim()) ? Number(value) : 0;
  return isValidCandidateCount(parsed) ? parsed : 0;
}
