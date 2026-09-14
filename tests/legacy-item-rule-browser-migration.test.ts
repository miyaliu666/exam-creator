import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { legacyBrowserItemRuleId, migrateLegacyBrowserSetup, migrateLegacyManualRecoveryKey } from "../client/features/language-items/legacy-item-rule-browser-migration";
import { restoreBatchDraft } from "../client/features/language-items/batch-draft-storage";

test("browser legacy identities hash the full previous binding with the server's UTF-8 JSON convention", () => {
  for (const identity of [["R-A1-1", "IF-SINGLE-SELECT", "A1-R1"], ["自定义", "IF-TYPED-MESSAGE", "能力"]]) {
    assert.equal(legacyBrowserItemRuleId(...identity as [string, string, string]), `legacy-rule-${createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex")}`);
  }
  assert.notEqual(legacyBrowserItemRuleId("R-A1-1", "IF-SINGLE-SELECT", "A1-R1"), legacyBrowserItemRuleId("R-A1-1", "IF-MATCHING", "A1-R1"));
  assert.notEqual(legacyBrowserItemRuleId("R-A1-1", "IF-SINGLE-SELECT", "A1-R1"), legacyBrowserItemRuleId("R-A1-1", "IF-SINGLE-SELECT", "A1-R2"));
  assert.equal(legacyBrowserItemRuleId("exercise:rule-id", "EXERCISE:multiple-choice", "read"), "rule-id");
});

test("saved plans keep all groups, quantities, targets and request identity during migration", () => {
  const original = { title: "Saved plan", registryVersion: "pinned", idempotencyKey: "same-request", candidatesPerItem: 13, groups: [
    { blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", primaryDomain: "Public", contextId: "D12", difficultyBand: "TypicalA1", itemCount: 7, requiredTargetContentIds: ["a"], rotatingTargetContentIds: ["b", "c"] },
    { blueprintSlotId: "exercise:source-rule", itemFormatId: "EXERCISE:multiple-choice", primaryCanDoId: "read", primaryDomain: "Public", contextId: "", difficultyBand: "TypicalA1", itemCount: 2, requiredTargetContentIds: ["d"], rotatingTargetContentIds: [] },
  ] };
  const restored = restoreBatchDraft(JSON.stringify(original), "new-current");
  assert.equal(restored.idempotencyKey, "same-request"); assert.equal(restored.registryVersion, "pinned"); assert.equal(restored.candidatesPerItem, 13);
  assert.deepEqual(restored.groups.map(group => group.itemCount), [7, 2]);
  assert.deepEqual(restored.groups[0].rotatingTargetContentIds, ["b", "c"]);
  assert.equal(restored.groups[0].itemRuleId, legacyBrowserItemRuleId("R1", "IF-SINGLE-SELECT", "read"));
  assert.equal(restored.groups[1].itemRuleId, "source-rule");
  assert.equal(JSON.stringify(restored).includes("blueprintSlotId"), false);
  assert.equal(restoreBatchDraft(JSON.stringify(restored), "new-current").idempotencyKey, "same-request");
});

test("manual recovery and new-item drafts migrate their binding without losing the unfinished item", () => {
  const setup = { blueprintSlotId: "R1", itemFormatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", primaryDomain: "Public", contextId: "D12", difficultyBand: "TypicalA1", registryVersion: "pinned" };
  const { blueprintSlotId, ...remaining } = setup;
  const expected = { itemRuleId: legacyBrowserItemRuleId(blueprintSlotId, setup.itemFormatId, setup.primaryCanDoId), ...remaining };
  assert.equal(migrateLegacyManualRecoveryKey(JSON.stringify(setup)), JSON.stringify(expected));
  const migrated = migrateLegacyBrowserSetup({ slotId: "R1", formatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", skillFilter: "Reading", custom: { keep: true } });
  assert.deepEqual(migrated, { itemRuleId: expected.itemRuleId, formatId: "IF-SINGLE-SELECT", primaryCanDoId: "read", skillFilter: "Reading", custom: { keep: true } });
  assert.deepEqual(migrateLegacyBrowserSetup(migrated), migrated);
});
