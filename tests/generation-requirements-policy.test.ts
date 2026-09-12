import assert from "node:assert/strict";
import test from "node:test";

import { generationRequirementsNeedRepair } from "../client/features/language-items/generation-requirements-policy";

test("incomplete targets, supporting content and information points keep requirement repair available", () => {
  for (const path of ["content.targetContentIds", "content.supportingContentRefs", "content.requiredInformationPoints"]) {
    assert.equal(generationRequirementsNeedRepair([{ path }], []), true, path);
    assert.equal(generationRequirementsNeedRepair([], [{ path, severity: "error" }]), true, path);
  }
  assert.equal(generationRequirementsNeedRepair([], []), false);
});

test("server errors for duplicate references and invalid information-point types reopen the affected editor", () => {
  for (const path of [
    "content.targetContentIds.1", "content.supportingContentRefs.2", "content.requiredInformationPoints.0.pointType",
  ]) {
    assert.equal(generationRequirementsNeedRepair([], [{ path, severity: "error" }]), true, path);
  }
});

test("advisory findings and errors outside generation requirements do not unlock saved requirements", () => {
  for (const severity of ["warning", "info", ""]) {
    assert.equal(generationRequirementsNeedRepair([], [{ path: "content.requiredInformationPoints.0.label", severity }]), false);
  }
  for (const path of [
    "title", "registry", "specVersions.registryBundleVersion", "content.contextId", "content.difficulty.drivers.informationPoints",
    "candidatePayload.prompt", "candidatePayload.content.targetContentIds.0", "content.targetContentIdsExtra",
    "targetContentIds.0", "supportingContentRefs.1",
  ]) {
    assert.equal(generationRequirementsNeedRepair([{ path }], [{ path, severity: "error" }]), false, path);
  }
});

test("a separate setup failure or advisory finding does not mask a formal requirement error", () => {
  assert.equal(generationRequirementsNeedRepair([{ path: "title" }], [
    { path: "content.targetContentIds.0", severity: "warning" },
    { path: "content.supportingContentRefs.1", severity: "error" },
  ]), true);
});
