import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NewItemSelect } from "../client/features/language-items/new-item-select";

function renderSelect(value = "", open = false, dimmed = false, disabled = false) {
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}>
    <NewItemSelect label="Exercise template" placeholder="Select an exercise template" value={value}
      options={[{ value: "template-1", label: "Basic personal information" }, { value: "template-2", label: "Short announcements" }]}
      open={open} dimmed={dimmed} disabled={disabled} onChange={() => undefined} onOpenChange={() => undefined} />
  </ChakraProvider>);
}

test("unselected trigger shows its prompt but the open option list never contains it", () => {
  const markup = renderSelect("", true);
  assert.match(markup, /Select an exercise template/);
  const choices = markup.match(/<[^>]+role="option"[^>]*>[\s\S]*?<\/div><\/div>/g) ?? [];
  assert.equal(choices.length, 2);
  assert.ok(choices.every((choice) => !choice.includes("Select an exercise template")));
  assert.match(markup, /role="listbox"/);
});

test("selected trigger retains its value and the menu marks the selected option", () => {
  const markup = renderSelect("template-2", true);
  assert.doesNotMatch(markup, /Select an exercise template/);
  assert.match(markup, /aria-selected="true"/);
  assert.match(markup, /Short announcements/);
});

test("de-emphasizing a neighboring field preserves its selection and does not disable it", () => {
  const markup = renderSelect("template-1", false, true);
  assert.match(markup, /data-dimmed="true"/);
  assert.match(markup, /Basic personal information/);
  assert.doesNotMatch(markup, /disabled=""/);
  assert.doesNotMatch(renderSelect("template-1"), /data-dimmed=/);
  assert.match(renderSelect("", false, false, true), /disabled=""/);
});
