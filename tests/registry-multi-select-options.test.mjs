import assert from "node:assert/strict";
import test from "node:test";

import { filterRegistryOptions, registryOptionNames, toggleRegistrySelection } from "../client/features/language-items/registry-multi-select-options.ts";

test("adding and removing valid options preserves unknown saved references", () => {
  const values = ["missing-context", "D01"];
  assert.deepEqual(toggleRegistrySelection(values, "D02"), ["missing-context", "D01", "D02"]);
  assert.deepEqual(toggleRegistrySelection(values, "D01"), ["missing-context"]);
  assert.deepEqual(values, ["missing-context", "D01"]);
});

test("option names use the Registry formatter without showing unresolved raw codes", () => {
  const names = registryOptionNames([{ id: "D01", label: "D01" }, { id: "CTX-MISSING", label: "CTX-MISSING" }, { id: "Public", label: "Public" }],
    (value) => value === "D01" ? "Personal introductions" : value);
  assert.deepEqual(names.map((option) => option.label), ["Personal introductions", "Unnamed option", "Public"]);
});

test("search matches normalized business names, never hidden IDs", () => {
  const options = [{ id: "D01", label: "Personal introductions" }, { id: "D02", label: "Public notices" }];
  assert.deepEqual(filterRegistryOptions(options, "ＰＥＲＳＯＮＡＬ "), [options[0]]);
  assert.deepEqual(filterRegistryOptions(options, "D01"), []);
  assert.deepEqual(filterRegistryOptions(options, ""), options);
});
