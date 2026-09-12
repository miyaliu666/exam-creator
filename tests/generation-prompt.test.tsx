import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";

import { generationPromptSections, validPromptOrdinal } from "../client/features/language-items/generation-prompt-model";
import { GenerationPromptViewer } from "../client/features/language-items/generation-prompt-viewer";

test("OpenAI prompt display decodes requirements without modifying the full recorded request", () => {
  const input = { lockedConstraints: { targetContent: [{ label: "把", pattern: "把＋宾语＋动词" }], difficultyBand: "A1-typical" }, repairValidationIssues: null };
  const request = { model: "fixture", store: false, instructions: "中文 instructions\nDo not change the settings.", input: JSON.stringify(input), text: { format: { type: "json_schema", strict: false, schema: { type: "object" } } } };
  const before = JSON.stringify(request);
  const sections = generationPromptSections(request);
  assert.equal(sections[0].text, request.instructions);
  assert.deepEqual(JSON.parse(sections[1].text), input);
  assert.deepEqual(JSON.parse(sections[2].text), request.text.format.schema);
  assert.equal(sections.at(-1)?.text, JSON.stringify(request, null, 2));
  assert.equal(JSON.stringify(request), before);
});

test("DeepSeek display preserves repair instructions, structural examples and output schema", () => {
  const content = { input: { repairValidationIssues: [{ message: "Missing translation" }], currentCandidatePayload: { prompt: "几点？" } }, outputSchema: { type: "object" }, jsonOutputShapeExample: { candidates: [] } };
  const request = { messages: [{ role: "system", content: "Repair once.\nReturn JSON." }, { role: "user", content: JSON.stringify(content) }] };
  const sections = generationPromptSections(request);
  assert.equal(sections[0].text, request.messages[0].content);
  assert.deepEqual(JSON.parse(sections[1].text), content);
  assert.equal(sections.at(-1)?.text, JSON.stringify(request, null, 2));
});

test("legacy absence is not rebuilt and unfamiliar request fields remain inspectable", () => {
  assert.deepEqual(generationPromptSections(undefined), []);
  assert.deepEqual(generationPromptSections(null), []);
  const unknown = { futurePrompt: "Literal <script> text", parameters: [1, 2] };
  assert.deepEqual(generationPromptSections(unknown), [{ label: "Full request", text: JSON.stringify(unknown, null, 2) }]);
});

test("prompt text remains literal read-only content rather than executable HTML", () => {
  const html = renderToStaticMarkup(<ChakraProvider value={defaultSystem}><GenerationPromptViewer requestBody={{ instructions: "</textarea><script>alert(1)</script>" }} /></ChakraProvider>);
  assert.match(html, /readonly=""/i);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
});

test("prompt selection preserves custom AI draft counts and rejects out-of-range or unsafe ordinals", () => {
  assert.equal(validPromptOrdinal("256", 256), 256);
  assert.equal(validPromptOrdinal("1", 1), 1);
  for (const value of ["0", "-1", "1.5", "1e2", "", "257", "9007199254740993"]) assert.equal(validPromptOrdinal(value, 256), undefined);
});
