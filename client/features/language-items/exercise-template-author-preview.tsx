/// <reference path="../../../language-item-workbench/exercise-templates/source/speech.d.ts" />
import { Component, useCallback, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react";
import { registry } from "../../../language-item-workbench/exercise-templates/source/lib/registry";
import type { ExerciseType } from "../../../language-item-workbench/exercise-templates/source/lib/schema";
import type { TemplateProps } from "../../../language-item-workbench/exercise-templates/source/templates/types";
import sourceStyles from "../../../language-item-workbench/exercise-templates/source/styles.css?raw";
import { exerciseTemplateName, parsedExerciseTemplateData, validateExerciseTemplateData, type ExerciseTemplateValue } from "./exercise-template-catalog";

const isolatedStyles = sourceStyles.replace(/@font-face\s*\{[^}]*\}/g, "").replaceAll(":root", ":host").replace(/\bhtml\s*\{/g, ":host {").replace(/\bbody\s*\{/g, ".exercise-template-author-root {") + "\n:host{display:block;font-size:16px}.exercise-template-author-root{padding:1rem;--font-sans:system-ui,sans-serif;--font-mono:ui-monospace,monospace} .exercise{max-width:100%;margin:0}";

class AuthorPreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">The interactive author preview could not render this content. Close the preview, correct the fields, and try again.</p> : this.props.children; }
}

export interface ExerciseTemplateAuthorPreviewProps { exerciseType: string; value: ExerciseTemplateValue; body?: string; id?: string }

/**
 * AUTHORIZED AUTHOR USE ONLY. The source renderers receive full answers for practice feedback.
 * A candidate-facing preview must use projectExerciseTemplateCandidate and must never call this.
 */
export function ExerciseTemplateAuthorPreview({ exerciseType, value, body = "", id = "exercise-author-preview" }: ExerciseTemplateAuthorPreviewProps) {
  const [snapshot, setSnapshot] = useState<{ data: NonNullable<ReturnType<typeof parsedExerciseTemplateData>>; body: string; revision: number } | null>(null);
  const [shadow, setShadow] = useState<ShadowRoot | null>(null);
  const attach = useCallback((element: HTMLDivElement | null) => {
    setShadow(element ? element.shadowRoot ?? element.attachShadow({ mode: "open" }) : null);
  }, []);
  const issues = useMemo(() => validateExerciseTemplateData(exerciseType, value), [exerciseType, value]);
  const start = () => {
    const data = parsedExerciseTemplateData(exerciseType, value);
    if (data) setSnapshot({ data: { ...data, instructionLanguage: "en" }, body, revision: (snapshot?.revision ?? 0) + 1 });
  };
  const Renderer = snapshot ? registry[snapshot.data.type] as ComponentType<TemplateProps<ExerciseType>> : undefined;
  return <Stack gap={3}>
    <HStack justify="space-between"><Text fontWeight="semibold">Author preview · {exerciseTemplateName(exerciseType)}</Text><HStack>
      <Button size="sm" variant="outline" disabled={issues.length > 0} onClick={start}>{snapshot ? "Refresh author preview" : "Start author preview"}</Button>
      {snapshot ? <Button size="sm" variant="ghost" onClick={() => setSnapshot(null)}>Close preview</Button> : null}
    </HStack></HStack>
    {issues.length ? <Box role="status"><Text fontSize="sm">Complete the template fields to start the preview.</Text>{issues.slice(0, 5).map((issue, index) => <Text key={index} fontSize="sm" color="fg.muted">{issue.path.join(" · ") || "Exercise"}: {issue.message}</Text>)}</Box> : null}
    {snapshot ? <><Text fontSize="sm" color="fg.muted">Interactive practice preview, including source feedback after submission. Speaking tasks may request microphone access when started.</Text><Box borderWidth="1px" borderRadius="md" overflow="hidden"><div ref={attach} /></Box></> : null}
    {snapshot && Renderer && shadow ? createPortal(<AuthorPreviewBoundary key={snapshot.revision}><style>{isolatedStyles}</style><div className="exercise-template-author-root"><Renderer id={id} data={snapshot.data} body={snapshot.body} /></div></AuthorPreviewBoundary>, shadow) : null}
  </Stack>;
}
