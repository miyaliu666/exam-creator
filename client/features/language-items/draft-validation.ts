import type { ValidationResult } from "./types";

export interface DraftValidationState {
  change: number;
  revision: number;
  dirty: boolean;
}

export async function checkCurrentDraft({ flushDraft, validate, readState }: {
  flushDraft: () => Promise<unknown>;
  validate: () => Promise<ValidationResult>;
  readState: () => DraftValidationState;
}): Promise<{ result: ValidationResult; current: boolean }> {
  const initialChange = readState().change;
  await flushDraft();
  const checked = { ...readState() };
  const result = await validate();
  const latest = readState();
  return {
    result,
    current: initialChange === checked.change && checked.change === latest.change &&
      checked.revision === latest.revision && !checked.dirty && !latest.dirty,
  };
}
