import assert from "node:assert/strict";
import test from "node:test";
import { registryDraftIsStale, registryRecordKey, registryStatus, registryWriteValidation, selectRegistryForEditing, shouldAdoptRegistryRecord } from "../client/features/language-items/registry-workflow.ts";
import type { RegistryVersionRecord } from "../client/features/language-items/types.ts";

const record = {
  id: "draft", revision: 2, status: "draft", active: false,
  createdBy: "owner", baseVersion: "published-1",
} as RegistryVersionRecord;

test("content save failures expose structured field issues while unrelated errors stay intact", () => {
  const validation = { valid: false, issues: [{ severity: "error", code: "registry.contentMeaningRequired", path: "contentIdOptions.1.meaning", message: "Meaning is required" }] };
  assert.deepEqual(registryWriteValidation(`422 - ${JSON.stringify(validation)}`), validation);
  assert.equal(registryWriteValidation("409 - The draft changed elsewhere"), undefined);
  assert.equal(registryWriteValidation('422 - {"valid":false,"issues":["bad"]}'), undefined);
});

test("draft ownership and saved state are not mislabeled as published", () => {
  assert.equal(registryStatus(record, false, "owner").label, "Saved · Not applied");
  assert.equal(registryStatus(record, true, "owner").label, "Unsaved changes");
  assert.equal(registryStatus(record, false, "other").label, "Read-only draft");
  assert.equal(registryStatus({ ...record, status: "published", active: false }, false).label, "Previous settings");
  assert.equal(registryStatus({ ...record, status: "published", active: true }, false).label, "In use for new items");
  assert.equal(registryStatus({ ...record, status: "retired", active: false }, false).label, "Retired settings");
});
test("publication changes identity even when the draft revision stays the same", () => {
  const published = { ...record, status: "published" as const, active: true };
  assert.notEqual(registryRecordKey(record), registryRecordKey(published));
  assert.equal(shouldAdoptRegistryRecord(record, published, false, false), true);
});
test("background responses preserve unsaved edits and in-flight operations", () => {
  const incoming = { ...record, revision: 3 };
  assert.equal(shouldAdoptRegistryRecord(record, incoming, true, false), false);
  assert.equal(shouldAdoptRegistryRecord(record, incoming, false, true), false);
  assert.equal(shouldAdoptRegistryRecord(record, incoming, false, false), true);
});
test("old cached responses cannot replace a newer saved revision", () => {
  assert.equal(shouldAdoptRegistryRecord(record, { ...record, revision: 1 }, false, false), false);
  assert.equal(shouldAdoptRegistryRecord(record, record, false, false), false);
});
test("drafts are stale only against a different known active publication", () => {
  assert.equal(registryDraftIsStale(record, "published-1"), false);
  assert.equal(registryDraftIsStale(record, "published-2"), true);
  assert.equal(registryDraftIsStale(record, undefined), false);
  assert.equal(registryDraftIsStale({ ...record, status: "published" }, "published-2"), false);
});

test("reopening after publication does not resurrect a retained stale draft", () => {
  const active = { ...record, id: "active", status: "published" as const, version: "published-2", active: true };
  const currentDraft = { ...record, id: "current-draft", baseVersion: active.version };
  assert.equal(selectRegistryForEditing([record, active], "owner")?.id, "active");
  assert.equal(selectRegistryForEditing([record, currentDraft, active], "owner")?.id, "current-draft");
  assert.equal(selectRegistryForEditing([currentDraft, active], "other")?.id, "active");
});
