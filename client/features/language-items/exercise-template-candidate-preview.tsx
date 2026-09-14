import { useId, useState } from "react";
import DOMPurify from "dompurify";
import { Marked } from "marked";
import { Box, Button, Field, HStack, Input, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import { FilePicker } from "../../components/ui/file-picker";
import { exerciseTemplateById, type ExerciseTemplateField, type ExerciseTemplateValue } from "./exercise-template-catalog";
import type { ExerciseTemplateDocument, ExerciseTemplateProjectionPolicy } from "./exercise-template-projection";

const markdown = new Marked({ gfm: true, breaks: true });
function TextContent({ value }: { value: unknown }) {
  if (typeof value !== "string") return null;
  if (typeof DOMPurify.sanitize !== "function") return <Box whiteSpace="pre-wrap" overflowWrap="anywhere">{value}</Box>;
  return <Box overflowWrap="anywhere" css={{ "& p": { marginBlock: "0.5em" }, "& ul, & ol": { paddingInlineStart: "1.5em" }, "& table": { width: "100%", borderCollapse: "collapse" }, "& td, & th": { borderWidth: "1px", padding: "0.5em" } }} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(markdown.parse(value) as string, { USE_PROFILES: { html: true } }) }} />;
}
function record(value: unknown): ExerciseTemplateValue { return value && typeof value === "object" && !Array.isArray(value) ? value as ExerciseTemplateValue : {}; }
function entries(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function safeMediaReference(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try { const url = new URL(value, "https://preview.invalid/"); return ["http:", "https:", "blob:"].includes(url.protocol) ? value : undefined; } catch { return undefined; }
}
function Media({ value, audio }: { value: unknown; audio: boolean }) {
  const media = record(value), src = safeMediaReference(media.src);
  if (!src) return <Text color="fg.muted">{audio ? "Audio" : "Image"} not provided.</Text>;
  return <Box>{audio ? <audio controls src={src} style={{ width: "100%" }} /> : <img src={src} alt={typeof media.alt === "string" ? media.alt : "Exercise image"} style={{ maxWidth: "100%", maxHeight: 360, objectFit: "contain" }} />}{typeof media.credit === "string" ? <Text fontSize="xs" color="fg.muted">{media.credit}</Text> : null}</Box>;
}
function OptionInput({ values, multiple = false, id }: { values: unknown[]; multiple?: boolean; id: string }) {
  const group = useId();
  return <Stack gap={2}>{values.map((option, index) => <HStack key={index} align="start" as="label" gap={3}><input type={multiple ? "checkbox" : "radio"} name={`${id}-${group}`} value={index} aria-label={`Option ${index + 1}`} style={{ marginTop: 8 }} /><Box flex="1">{typeof option === "string" ? <TextContent value={option} /> : <Media value={option} audio={false} />}</Box></HStack>)}</Stack>;
}
const hiddenCommon = new Set(["type", "level", "language", "instructionLanguage", "estimatedMinutes", "countBy", "minWords", "maxWords", "maxPlays", "answerSeconds", "preparationSeconds", "readingSeconds", "readSeconds", "targetSeconds", "layout", "maxWordsPerBlank", "maxWordsPerLabel"]);

function PublicField({ field, value, path, policy, categories }: { field: ExerciseTemplateField; value: unknown; path: string; policy: ExerciseTemplateProjectionPolicy; categories: unknown[] }) {
  if (value === undefined || policy.privatePaths.includes(path) || hiddenCommon.has(field.key)) return null;
  if (field.type === "object") {
    if (field.properties?.some(child => child.key === "src")) return <Media value={value} audio={/audio/i.test(path)} />;
    const data = record(value), options = entries(data.options);
    const select = !!options.length && options.every(option => typeof option === "string" || !!record(option).src);
    const hasPrivateAnswer = policy.privatePaths.some(hidden => ["answer", "answers", "correct", "correctIndex", "correctAnswer", "isReal", "category"].some(key => hidden === `${path}.${key}`));
    const trueFalse = policy.privatePaths.includes(`${path}.correct`) && field.properties?.find(child => child.key === "correct")?.type === "enum";
    return <Stack gap={3}>{field.properties?.filter(child => !(select && child.key === "options")).map(child => <PublicField key={child.key} field={child} value={data[child.key]} path={`${path}.${child.key}`} policy={policy} categories={categories} />)}
      {select ? <OptionInput values={options} multiple={data.responseMode === "multiple"} id={path} /> : trueFalse ? <OptionInput values={["True", "False", "Not given"]} id={path} /> : policy.privatePaths.includes(`${path}.isReal`) ? <OptionInput values={["Real word", "Not a real word"]} id={path} /> : policy.privatePaths.includes(`${path}.category`) ? <NativeSelect.Root><NativeSelect.Field aria-label="Choose category" defaultValue=""><option value="" disabled>Select a category</option>{categories.map((category, index) => <option key={index}>{String(category)}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root> : hasPrivateAnswer ? <Input aria-label="Your answer" placeholder="Your answer" /> : null}
    </Stack>;
  }
  if (field.type === "array") {
    return <Stack gap={3}>{entries(value).map((entry, index) => <Box key={index} borderWidth={field.element?.type === "object" ? "1px" : undefined} borderRadius="md" p={field.element?.type === "object" ? 3 : 0}>{field.element ? <PublicField field={field.element} value={entry} path={`${path}.*`} policy={policy} categories={categories} /> : null}</Box>)}</Stack>;
  }
  return typeof value === "string" ? <TextContent value={value} /> : null;
}

function ReorderResponse({ values }: { values: unknown[] }) {
  const [order, setOrder] = useState(values.map(String));
  return <Stack gap={2}>{order.map((entry, index) => <HStack key={index} borderWidth="1px" borderRadius="md" p={2}><Text flex="1">{entry}</Text><Button size="xs" variant="outline" disabled={index === 0} onClick={() => { const next = order.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; setOrder(next); }}>Move up</Button></HStack>)}</Stack>;
}

/** Renders only the server-produced public document; never accepts or reassembles author answers. */
export function ExerciseTemplateCandidatePreview({ payload }: { payload: ExerciseTemplateDocument }) {
  const template = exerciseTemplateById(payload.exerciseType);
  if (!template) return <Text role="alert">This exercise template is unavailable.</Text>;
  const data = record(payload.data), options = entries(data.options), categories = entries(data.categories);
  const topOptions = options.length > 0 && options.every(option => typeof option === "string" || !!record(option).src);
  const scalarResponse = ["missing-letters", "build-a-sentence", "passage-reconstruction", "listening-fill-in-blanks", "diagram-label", "listening-diagram-label", "drag-to-complete"].includes(payload.exerciseType);
  const writingResponse = template.sourceSkill === "writing" || payload.exerciseType === "passage-reconstruction";
  const showFallbackResponse = scalarResponse || writingResponse;
  const highlightAnswers = payload.exerciseType === "highlight-the-answer";
  const highlightWords = payload.exerciseType === "highlight-incorrect-words";
  const exclude = new Set(["title", ...(topOptions ? ["options"] : []), ...(template.projection.transform === "unordered-items" ? ["items"] : []), ...(highlightAnswers ? ["passage", "questions"] : []), ...(highlightWords ? ["words"] : [])]);
  return <Stack gap={4} borderWidth="1px" borderRadius="lg" p={5} bg="bg.subtle">
    <Text fontWeight="semibold">{typeof data.title === "string" && data.title ? data.title : template.name}</Text>
    {payload.body ? <TextContent value={payload.body} /> : null}
    {template.fields.filter(field => !exclude.has(field.key)).map(field => <PublicField key={field.key} field={field} value={data[field.key]} path={field.key} policy={template.projection} categories={categories} />)}
    {topOptions ? <OptionInput values={options} id="exercise-template-options" /> : null}
    {highlightAnswers ? <Stack gap={5}>{entries(data.questions).map((value, index) => {
      const question = record(value);
      return <Stack key={index} gap={3} borderWidth="1px" borderRadius="md" p={3}><TextContent value={question.prompt} /><Text fontSize="sm" color="fg.muted">Select the passage spans that answer this question.</Text><OptionInput values={entries(data.passage)} multiple={question.responseMode === "multiple"} id={`highlight-question-${index}`} /></Stack>;
    })}</Stack> : null}
    {highlightWords ? <Stack gap={3}><Text fontSize="sm">Select the words that do not match the recording.</Text><OptionInput values={entries(data.words)} multiple id="highlight-incorrect-words" /></Stack> : null}
    {template.projection.transform === "independent-columns" ? <Stack>{entries(data.leftItems).map((left, index) => <HStack key={index}><Text flex="1">{String(left)}</Text><NativeSelect.Root flex="1"><NativeSelect.Field defaultValue="" aria-label={`Match ${String(left)}`}><option value="" disabled>Select a match</option>{entries(data.rightItems).map((right, choice) => <option key={choice} value={choice}>{String(right)}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root></HStack>)}</Stack> : null}
    {template.projection.transform === "unordered-items" ? <ReorderResponse key={JSON.stringify(data.items)} values={entries(data.items)} /> : null}
    {template.projection.transform === "masked-letters" ? <TextContent value={data.text} /> : null}
    {template.projection.transform === "unordered-words" ? <HStack wrap="wrap">{entries(data.words).map((word, index) => <Box key={index} borderWidth="1px" px={2} py={1}>{String(word)}</Box>)}</HStack> : null}
    {typeof data.responseCount === "number" && Number.isSafeInteger(data.responseCount) && data.responseCount > 0 ? <Stack>{Array.from({ length: data.responseCount }, (_, index) => <Field.Root key={index}><Field.Label>Answer {index + 1}</Field.Label><Input aria-label={`Answer ${index + 1}`} /></Field.Root>)}</Stack> : showFallbackResponse ? <Field.Root><Field.Label>Your response</Field.Label><Textarea rows={writingResponse ? 5 : 2} /></Field.Root> : null}
    {template.sourceSkill === "speaking" ? <FilePicker label="Spoken response audio" accept="audio/*"><Field.HelperText>Use Author preview to try the source recording interaction.</Field.HelperText></FilePicker> : null}
  </Stack>;
}
