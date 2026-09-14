import assert from "node:assert/strict";
import test from "node:test";
import { mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

test("speaking preview uses English instructions while preserving Chinese prompts and cues", async () => {
  // The source shell needs browser-only Markdown sanitization; isolate it for this UI-language check.
  mock.module("../language-item-workbench/exercise-templates/source/components/Shell", () => ({
    ExerciseShell: ({ children }: { children: ReactNode }) => <article>{children}</article>,
    Markdown: ({ children }: { children: string }) => <div>{children}</div>,
    CompactAudioButton: () => null,
  }));
  const { default: Speaking } = await import("../language-item-workbench/exercise-templates/source/templates/Speaking");
  const markup = renderToStaticMarkup(<Speaking id="english-ui" body="" data={{
    type: "speaking", language: "zh", instructionLanguage: "en", level: "A1", title: "Speaking practice",
    tags: [], prompt: "请介绍自己。", cues: ["姓名", "工作"], preparationSeconds: 60,
  }} />);
  assert.match(markup, /<h3>Talk about<\/h3>/);
  assert.match(markup, /Preparation time: 1:00/);
  assert.doesNotMatch(markup, /谈一谈|准备时间/);
  assert.match(markup, /请介绍自己。/);
  assert.match(markup, /<li>姓名<\/li>/);
  assert.match(markup, /<li>工作<\/li>/);
});
