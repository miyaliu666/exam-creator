import {
  Field,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import { itemTemplateForFormat } from "./item-template-registry";
import { MetadataFields } from "./metadata-fields";
import { ScoringContractPanel } from "./scoring-contract-panel";
import type { AuthoringSetupIssue } from "./setup-validation";
import type { RegistrySnapshot, TaskPackage, ValidationIssue } from "./types";

interface AuthoringPanelProps {
  mode: "setup" | "content";
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
  updateDraft: (mutate: (next: TaskPackage) => void) => void;
  readOnly: boolean;
  setupIssues?: AuthoringSetupIssue[];
  validationIssues?: ValidationIssue[];
}

export function AuthoringPanel({
  mode,
  draft,
  registry,
  updateDraft,
  readOnly,
  setupIssues = [],
  validationIssues = [],
}: AuthoringPanelProps) {
  const template = itemTemplateForFormat(draft.itemFormatId);
  const Editor = template?.Editor;
  const templateMatchesRenderer = template?.rendererId === draft.renderer.rendererId;
  return (
    <fieldset disabled={readOnly} style={{ border: 0, margin: 0, minWidth: 0, padding: 0 }}>
      <Stack borderWidth="1px" borderRadius="xl" p={6} gap={5}>
        {readOnly ? <Text color="fg.warning">This version is read-only.</Text> : null}
        {mode === "setup" ? (
          <>
            <MetadataFields
              draft={draft}
              registry={registry}
              issues={setupIssues}
              updateDraft={updateDraft}
            />
          </>
        ) : null}
        {mode === "content" ? (
          <>
            {Editor && templateMatchesRenderer ? (
              <Editor
                draft={draft}
                updateDraft={updateDraft}
                validationIssues={validationIssues}
              />
            ) : (
              <Text color="fg.error">
                {template
                  ? `Template and renderer mismatch: expected ${template.rendererId}, found ${draft.renderer.rendererId}.`
                  : `No exercise template is registered for ${draft.itemFormatId}.`}
              </Text>
            )}
            <ScoringContractPanel
              draft={draft}
              registry={registry}
            />
            <Field.Root>
              <Field.Label>Author notes</Field.Label>
              <Textarea value={draft.authoringPackage.notes.join("\n")} onChange={(event) => updateDraft((next) => {
                next.authoringPackage.notes = event.target.value.split("\n");
              })} />
            </Field.Root>
            <Stack as="details" borderWidth="1px" borderRadius="lg" p={4} gap={3}>
              <Text as="summary" cursor="pointer" fontWeight="semibold">
                Technical data
              </Text>
              <Textarea
                aria-label="Full TaskPackage"
                readOnly
                value={JSON.stringify(draft, null, 2)}
                minH="420px"
                fontFamily="mono"
                fontSize="xs"
              />
            </Stack>
          </>
        ) : null}
      </Stack>
    </fieldset>
  );
}
