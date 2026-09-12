import assert from "node:assert/strict";
import test from "node:test";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { GithubReviewPanel } from "../client/features/language-items/github-review-panel";
import type { LanguageItem, LanguageItemVersion } from "../client/features/language-items/types";

function render(overrides: Partial<ComponentProps<typeof GithubReviewPanel>> = {}) {
  const props: ComponentProps<typeof GithubReviewPanel> = {
    item: { id: "item-1", status: "draft", recordState: "active", hasStagingExport: false } as LanguageItem,
    latestVersion: undefined, versionDiff: undefined, versionDiffPending: false, versionDiffError: null,
    isCreating: false, isSyncing: false, isRevising: false, isExporting: false, canSubmit: true, canManage: true,
    onCreate: () => assert.fail("Rendering must never submit a review"),
    onSync: () => undefined, onRevise: () => undefined, onExport: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(<ChakraProvider value={defaultSystem}><GithubReviewPanel {...props} /></ChakraProvider>);
}

test("an eligible draft can submit without a frozen version or advisory AI feedback", () => {
  const html = render();
  assert.match(html, /Submit for review/);
  assert.doesNotMatch(html, /<button[^>]*disabled/);
  assert.doesNotMatch(html, /AI feedback|Submitting creates a GitHub/);
});

test("a blocked submission displays the supplied reason next to its disabled action", () => {
  const html = render({ canSubmit: false, submitBlockedReason: "AI generation is still running." });
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /aria-describedby=/);
  assert.match(html, /AI generation is still running\./);
  assert.doesNotMatch(render({ submitBlockedReason: "Outdated reason" }), /Outdated reason/);
});

test("a non-owner cannot submit even when draft eligibility is true", () => {
  const html = render({ canManage: false });
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /Only the item owner can submit for review\./);
});

test("an archived draft cannot submit even when draft eligibility is true", () => {
  const html = render({ item: { id: "item-1", status: "draft", recordState: "archived" } as LanguageItem });
  assert.match(html, /<button[^>]*disabled/);
  assert.match(html, /This item is archived\./);
});

test("merged versions retain review status, revision, export and comparison controls", () => {
  const html = render({
    item: {
      id: "item-1", status: "approvedForExport", recordState: "active", hasStagingExport: false,
      githubReview: { state: "merged", pullRequestUrl: "https://github.com/example/review/pull/1", pullRequestNumber: 1,
        approvedVersionId: "version-1", approvalCount: 1, changesRequestedCount: 0 },
    } as LanguageItem,
    latestVersion: { id: "version-1", versionNumber: 1 } as LanguageItemVersion,
  });
  assert.match(html, /Sync status/);
  assert.match(html, /Create revision draft/);
  assert.match(html, /Export to Staging/);
  assert.match(html, /Version changes/);
  assert.doesNotMatch(html, /Submit for review|AI feedback/);
});
