import assert from "node:assert/strict";
import test from "node:test";

import { canGenerateContentPinyin, generateMissingContentPinyin } from "../client/features/language-items/content-pinyin.ts";
import type { ContentIdOption } from "../client/features/language-items/types.ts";

function entry(label: string, extra: Partial<ContentIdOption> = {}): ContentIdOption {
  return { id: label, kind: "lexical", label, meaning: "source meaning", masteryScope: null, canDoIds: [], contextIds: [], ...extra };
}

test("pinyin conversion fills Chinese vocabulary only and preserves all authored metadata", async () => {
  const values = [entry("银行", { level: "A2", sourceRecord: { row: 2 } }), entry("我们"), entry("女"), entry("谢谢", { pinyin: "xiè xie" })];
  const original = structuredClone(values);
  const result = await generateMissingContentPinyin(values);
  assert.equal(result[0].pinyin, "yín háng");
  assert.equal(result[1].pinyin, "wǒ men");
  assert.equal(result[2].pinyin, "nǚ");
  assert.equal(result[3].pinyin, "xiè xie");
  assert.deepEqual(result[0], { ...original[0], pinyin: "yín háng" });
  assert.deepEqual(values, original);
});

test("English, Spanish, grammar and supporting names are not converted", async () => {
  const values = [entry("hello"), entry("mañana"), entry("因为……所以……", { kind: "grammar" }), entry("人名", { kind: "supported" })];
  assert(values.every((value) => !canGenerateContentPinyin(value)));
  assert.deepEqual(await generateMissingContentPinyin(values), values);
});

test("explicit non-Chinese language suppresses conversion even when the authored name contains Han characters", async () => {
  const values = [entry("你好 (hello)", { language: "en" }), entry("谢谢 (gracias)", { language: "es" })];
  assert(values.every((value) => !canGenerateContentPinyin(value)));
  assert.equal(await generateMissingContentPinyin(values), values);
  assert.equal(canGenerateContentPinyin(entry("你好", { language: "zh" })), true);
});

test("blank pinyin can be completed; existing transcription and mixed-language names are preserved", async () => {
  const values = [entry("你好", { pinyin: "  " }), entry("A股"), entry("行", { pinyin: "háng" })];
  const result = await generateMissingContentPinyin(values);
  assert.equal(result[0].pinyin, "nǐ hǎo");
  assert.equal(result[1].pinyin, "A gǔ");
  assert.equal(result[2].pinyin, "háng");
  assert.deepEqual(await generateMissingContentPinyin(result), result);
});
