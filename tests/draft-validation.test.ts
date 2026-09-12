import assert from "node:assert/strict";
import test from "node:test";

import { checkCurrentDraft, type DraftValidationState } from "../client/features/language-items/draft-validation";
import type { ValidationResult } from "../client/features/language-items/types";

const valid: ValidationResult = { valid: true, registryBundleVersion: "published-1", issues: [] };

test("checking an already-saved draft retains its result when flush has no item to return", async () => {
  const calls: string[] = [];
  const state = { change: 0, revision: 4, dirty: false };
  const checked = await checkCurrentDraft({
    readState: () => state,
    flushDraft: async () => { calls.push("flush"); },
    validate: async () => { calls.push("validate"); return valid; },
  });
  assert.deepEqual(calls, ["flush", "validate"]);
  assert.equal(checked.result, valid);
  assert.equal(checked.current, true);
  assert.deepEqual(state, { change: 0, revision: 4, dirty: false });
});

test("saving the existing edits before validation binds the check to their new revision", async () => {
  const state = { change: 3, revision: 4, dirty: true };
  const checked = await checkCurrentDraft({
    readState: () => state,
    flushDraft: async () => { state.revision += 1; state.dirty = false; return { revision: state.revision }; },
    validate: async () => { assert.equal(state.revision, 5); assert.equal(state.dirty, false); return valid; },
  });
  assert.equal(checked.current, true);
});

test("edits made during saving invalidate the check even if that save finishes cleanly", async () => {
  const state = { change: 0, revision: 4, dirty: true };
  const checked = await checkCurrentDraft({
    readState: () => state,
    flushDraft: async () => { state.change += 1; state.revision += 1; state.dirty = false; },
    validate: async () => valid,
  });
  assert.equal(checked.result, valid);
  assert.equal(checked.current, false);
});

for (const [name, update] of [
  ["an edit", (state: DraftValidationState) => { state.change += 1; state.dirty = true; }],
  ["an edit saved before the response", (state: DraftValidationState) => { state.change += 1; state.revision += 1; }],
  ["a revision replacement without a local edit", (state: DraftValidationState) => { state.revision += 1; }],
  ["an unsaved change without a new counter", (state: DraftValidationState) => { state.dirty = true; }],
] as const) {
  test(`${name} during validation prevents the result from authorizing submission`, async () => {
    const state = { change: 0, revision: 4, dirty: false };
    let finishValidation!: (result: ValidationResult) => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const checking = checkCurrentDraft({
      readState: () => state,
      flushDraft: async () => undefined,
      validate: () => { signalStarted(); return new Promise<ValidationResult>((resolve) => { finishValidation = resolve; }); },
    });
    await started;
    update(state);
    finishValidation(valid);
    const checked = await checking;
    assert.equal(checked.result, valid);
    assert.equal(checked.current, false);
  });
}

test("a dirty validation start stays stale even if another save finishes before the response", async () => {
  const state = { change: 0, revision: 4, dirty: true };
  const checked = await checkCurrentDraft({
    readState: () => state,
    flushDraft: async () => undefined,
    validate: async () => { state.dirty = false; return valid; },
  });
  assert.equal(checked.current, false);
});

test("current failed checks preserve their issues for correction instead of treating them as stale", async () => {
  const invalid: ValidationResult = { valid: false, registryBundleVersion: "published-1", issues: [
    { severity: "error", code: "schema.minLength", path: "candidatePayload.prompt", ruleRef: "question", message: "Enter a question" },
  ] };
  const checked = await checkCurrentDraft({
    readState: () => ({ change: 0, revision: 4, dirty: false }),
    flushDraft: async () => undefined,
    validate: async () => invalid,
  });
  assert.equal(checked.result, invalid);
  assert.equal(checked.current, true);
});

test("a failed save stops validation and preserves the original failure", async () => {
  const failure = new Error("Draft revision changed");
  let validations = 0;
  await assert.rejects(checkCurrentDraft({
    readState: () => ({ change: 0, revision: 4, dirty: true }),
    flushDraft: async () => { throw failure; },
    validate: async () => { validations += 1; return valid; },
  }), (error) => error === failure);
  assert.equal(validations, 0);
});
