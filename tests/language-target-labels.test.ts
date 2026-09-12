import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { languageTargetDisplayText, languageTargetLabel, languageTargetMatchesSearch } from "../client/features/language-items/language-target-labels.ts";
import { LANGUAGE_TARGET_RULE_LABELS } from "../client/features/language-items/language-target-rule-labels.ts";

const contentDirectory = new URL("../language-item-workbench/registries/Chinese_A1_Workbench_Registries_v0.2_provisional/content/", import.meta.url);
const registries = [
  { file: "a1-lexicon-registry-v0.1-provisional.yaml", kind: "lexical", key: "lexicalId", label: "form", count: 413 },
  { file: "a1-character-registry-v0.2-provisional.yaml", kind: "character", key: "characterId", label: "form", count: 349 },
  { file: "a1-grammar-registry-v0.2-provisional.yaml", kind: "grammar", key: "grammarId", label: "function", count: 60 },
  { file: "a1-pragmatics-registry-v0.2-provisional.yaml", kind: "pragmatics", key: "pragmaticFunctionId", label: "title", count: 18 },
];

for (const registry of registries) {
  test(`every bundled ${registry.kind} target has a Chinese-English display pair without changing its source`, () => {
    const source = readFileSync(new URL(registry.file, contentDirectory), "utf8");
    const blocks = source.split(new RegExp(`(?=^- ${registry.key}:)`, "m")).slice(1);
    assert.equal(blocks.length, registry.count);
    for (const block of blocks) {
      const id = block.match(new RegExp(`^- ${registry.key}: (.+)$`, "m"))?.[1].trim();
      const label = block.match(new RegExp(`^  ${registry.label}: (.+)$`, "m"))?.[1].trim();
      assert.ok(id && label);
      const option = Object.freeze({ id, kind: registry.kind, label });
      const display = languageTargetLabel(option);
      assert.match(display.primary, /\p{Script=Han}/u, `${id} Chinese label`);
      assert.ok(display.english?.match(/[A-Za-z]{2,}/), `${id} English gloss`);
      assert.notEqual(display.primary, display.english, `${id} distinct languages`);
      assert.equal(option.label, label, `${id} original label stays pinned`);
      assert.ok(languageTargetMatchesSearch(option, display.english.toUpperCase()));
      if (registry.kind === "grammar") assert.ok(display.pattern, `${id} grammar pattern`);
    }
  });
}

test("search accepts either language and grammar patterns", () => {
  const greeting = { id: "LEX-A1-0003", kind: "lexical", label: "早上好" };
  assert.ok(languageTargetMatchesSearch(greeting, " morning "));
  assert.ok(languageTargetMatchesSearch(greeting, "早上"));
  assert.equal(languageTargetMatchesSearch(greeting, "evening"), false);
  assert.ok(languageTargetMatchesSearch({ id: "GR-A1-001", kind: "grammar", label: "State identity or category" }, "A 是 B"));
});

test("legacy Chinese rule labels and current English labels produce the same bilingual display", () => {
  for (const rule of LANGUAGE_TARGET_RULE_LABELS) {
    const option = { id: rule.id, kind: rule.id.startsWith("GR-") ? "grammar" : "pragmatics" };
    assert.equal(
      languageTargetDisplayText({ ...option, label: rule.chinese }),
      languageTargetDisplayText({ ...option, label: rule.english }),
    );
  }
});

test("customized rules retain authored labels instead of receiving a stale translation", () => {
  assert.deepEqual(languageTargetLabel({ id: "GR-A1-001", kind: "grammar", label: "Custom future tense rule" }), { primary: "Custom future tense rule" });
  assert.deepEqual(languageTargetLabel({ id: "CUSTOM-WORD", kind: "lexical", label: "自定义术语" }), { primary: "自定义术语" });
});

test("character glosses respect compound and grammatical senses", () => {
  assert.match(languageTargetDisplayText({ id: "CHAR-A1-0001", kind: "character", label: "漂" }), /Pretty \(in 漂亮\)/);
  assert.match(languageTargetDisplayText({ id: "LEX-A1-0395", kind: "lexical", label: "吗" }), /question particle/);
  assert.match(languageTargetDisplayText({ id: "LEX-A1-0002", kind: "lexical", label: "您好" }), /Hello \(polite\)/);
  assert.match(languageTargetDisplayText({ id: "CHAR-A1-0211", kind: "character", label: "口" }), /Opening/);
  assert.match(languageTargetDisplayText({ id: "CHAR-A1-0033", kind: "character", label: "点" }), /location; a little/);
  assert.match(languageTargetDisplayText({ id: "CHAR-A1-0111", kind: "character", label: "会" }), /meeting/);
  assert.doesNotMatch(languageTargetDisplayText({ id: "LEX-A1-0104", kind: "lexical", label: "会" }), /meeting/);
});

test("authored content metadata overrides legacy display hints and is searchable", () => {
  const grammar = { id: "GR-A1-001", kind: "grammar", label: "State identity or category", englishGloss: "Authored identity rule", pattern: "甲 是 乙" };
  assert.equal(languageTargetLabel(grammar).english, "Authored identity rule");
  assert.equal(languageTargetLabel(grammar).pattern, "甲 是 乙");
  assert.equal(languageTargetLabel({ ...grammar, englishGloss: "", pattern: "" }).english, undefined);
  assert.equal(languageTargetLabel({ ...grammar, englishGloss: "", pattern: "" }).pattern, undefined);
  const word = { id: "custom", kind: "lexical", label: "行", meaning: "表示可以或同意", pinyin: "xíng", englishGloss: "okay" };
  assert.ok(languageTargetMatchesSearch(word, "同意"));
  assert.ok(languageTargetMatchesSearch(word, "XÍNG"));
  assert.ok(languageTargetMatchesSearch(word, "okay"));
  assert.match(languageTargetDisplayText(word), /表示可以或同意/);
  assert.equal(languageTargetLabel({ id: "CONTENT-CUSTOM-sense", kind: "lexical", label: "会", meaning: "会议" }).english, undefined);
});
