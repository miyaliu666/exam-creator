import {
  Field,
  Input,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react";

import { CapabilityContractPanel } from "./capability-contract-panel";
import { itemTemplateForFormat } from "./item-template-registry";
import { MetadataFields } from "./metadata-fields";
import { ScoringContractPanel } from "./scoring-contract-panel";
import type { AuthoringSetupIssue } from "./setup-validation";
import type { RegistrySnapshot, TaskPackage, ValidationIssue } from "./types";

interface AuthoringPanelProps {
  mode: "setup" | "content";
  title: string;
  draft: TaskPackage;
  registry: RegistrySnapshot | undefined;
  setTitle: (title: string) => void;
  updateDraft: (mutate: (next: TaskPackage) => void) => void;
  readOnly: boolean;
  setupIssues?: AuthoringSetupIssue[];
  validationIssues?: ValidationIssue[];
}

export function AuthoringPanel({
  mode,
  title,
  draft,
  registry,
  setTitle,
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
            <Field.Root invalid={setupIssues.some((issue) => issue.path === "title")}>
              <Field.Label>Item title</Field.Label>
              <Input
                value={title}
                placeholder="Used for authoring, review, and history; not shown to candidates."
                onChange={(event) => setTitle(event.target.value)}
              />
              <Field.ErrorText>
                {setupIssues.find((issue) => issue.path === "title")?.message}
              </Field.ErrorText>
            </Field.Root>
            <CapabilityContractPanel draft={draft} registry={registry} />
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
            {template ? (
              <Stack borderWidth="1px" borderRadius="lg" px={4} py={3} gap={1} bg="bg.subtle">
                <Text fontWeight="semibold">
                  Exercise template: {template.label} · {template.exerciseType(draft)}
                </Text>
                <Text fontSize="sm" color="fg.muted">
                  The exercise template defines the fields below; the candidate preview updates alongside them.
                </Text>
              </Stack>
            ) : null}
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
                Advanced: view full TaskPackage (read-only)
              </Text>
              <Text fontSize="sm" color="fg.muted">
                Inspect the saved contract and review payload. Candidate previews never receive scoring or author partitions.
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
