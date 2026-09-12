import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { DraftPreparationLayout } from "../client/features/language-items/draft-preparation-layout";

function render(candidatesFirst: boolean, requirementsNeedAttention = false, requirementsNeedRepair = false) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><DraftPreparationLayout
    candidatesFirst={candidatesFirst} requirementsNeedAttention={requirementsNeedAttention} requirementsNeedRepair={requirementsNeedRepair}
    requirements={<textarea aria-label="Task requirements" defaultValue="Stored brief" />}
    generation={<button>Generate drafts</button>}
    candidates={<button>Use this draft</button>} />
  </ChakraProvider>);
}

test("ready candidates come before requirements details and regeneration controls", () => {
  const html=render(true);
  assert(html.indexOf("Use this draft") < html.indexOf("Task requirements"));
  assert.match(html,/Generation requirements/);
  assert.doesNotMatch(html,/Edit generation requirements|Repair generation requirements/);
  assert.equal((html.match(/<details\b/g) ?? []).length,2);
  assert.doesNotMatch(html,/<details[^>]*\bopen/);
});

test("requirements needing repair are visible without hiding the existing candidates", () => {
  const html=render(true,true,true);
  assert.equal((html.match(/<details[^>]*\bopen/g) ?? []).length,2);
  assert.match(html,/Use this draft/);
  assert.match(html,/Task requirements/);
  assert.match(html,/Repair generation requirements/);
});

test("valid changed requirements open for review without offering repair", () => {
  const html=render(true,true);
  assert.equal((html.match(/<details[^>]*\bopen/g) ?? []).length,2);
  assert.match(html,/Generation requirements/);
  assert.doesNotMatch(html,/Edit generation requirements|Repair generation requirements/);
});

test("a new item shows its requirements and initial generation controls directly", () => {
  const html=render(false);
  assert(html.indexOf("Task requirements") < html.indexOf("Generate drafts"));
  assert.doesNotMatch(html,/<details\b/);
});
