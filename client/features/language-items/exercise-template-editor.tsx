import { useId } from "react";
import { contentLanguageLabel } from "./content-language";
import { Box, Button, Field, HStack, Input, NativeSelect, Stack, Text, Textarea } from "@chakra-ui/react";
import {
  emptyExerciseTemplateField, exerciseTemplateById, setExerciseTemplateField,
  type ExerciseTemplateField, type ExerciseTemplateValue, type ExerciseTemplateValidationIssue,
} from "./exercise-template-catalog";

export interface ExerciseTemplateEditorProps {
  itemLanguage?: string;
  exerciseType: string;
  value: ExerciseTemplateValue;
  onChange: (value: ExerciseTemplateValue) => void;
  body?: string;
  onBodyChange?: (body: string) => void;
  readOnly?: boolean;
  /** Settings defaults can omit required item content; every field remains explicitly editable. */
  mode?: "item" | "defaults";
  issues?: ExerciseTemplateValidationIssue[];
}

function matches(field: ExerciseTemplateField, value: unknown): boolean {
  if (field.type === "array") return Array.isArray(value);
  if (field.type === "object") return !!value && typeof value === "object" && !Array.isArray(value);
  if (field.type === "number" || field.type === "integer") return typeof value === "number";
  return typeof value === field.type || ((field.type === "literal" || field.type === "enum") && !!field.values?.includes(value as string));
}

function RetainedFields({ value, fields, readOnly, onRemove }: { value: ExerciseTemplateValue; fields: ExerciseTemplateField[]; readOnly?: boolean; onRemove: (key: string) => void }) {
  const known = new Set(fields.map(field => field.key));
  const retained = Object.keys(value).filter(key => !known.has(key));
  if (!retained.length) return null;
  return <Box as="details" borderWidth="1px" borderRadius="md" p={3}>
    <Text as="summary" cursor="pointer" fontWeight="medium">Retained fields ({retained.length})</Text>
    <Text fontSize="sm" color="fg.muted" mt={2}>These saved fields are outside the selected template. They remain saved until explicitly removed.</Text>
    <Stack gap={2} mt={3}>{retained.map(key => <HStack key={key} justify="space-between"><Box><Text fontSize="sm" fontWeight="medium">{key}</Text><Text fontSize="xs" color="fg.muted">{Array.isArray(value[key]) ? `${value[key].length} entries` : value[key] && typeof value[key] === "object" ? `${Object.keys(value[key]).length} nested fields` : String(value[key] ?? "Empty")}</Text></Box><Button size="xs" variant="outline" disabled={readOnly} onClick={() => onRemove(key)} aria-label={`Remove retained field ${key}`}>Remove field</Button></HStack>)}</Stack>
  </Box>;
}

function TemplateFieldInput({ field, value, onChange, readOnly, path, issues, mode }: {
  field: ExerciseTemplateField; value: unknown; onChange: (value: unknown) => void; readOnly?: boolean;
  path: (string | number)[]; issues: ExerciseTemplateValidationIssue[]; mode: "item" | "defaults";
}) {
  const id = useId();
  const absent = value === undefined;
  const errors = issues.filter(issue => issue.path.length === path.length && issue.path.every((part, index) => part === path[index]));
  const label = field.label;
  const canUnset = !field.required || mode === "defaults";
  if (field.type === "literal") return null;
  let control;
  if (absent) {
    control = <Button alignSelf="start" size="sm" variant="outline" disabled={readOnly} onClick={() => onChange(emptyExerciseTemplateField(field))}>Set {label.toLowerCase()}</Button>;
  } else if (field.type === "union") {
    const variants = field.variants ?? [];
    const selected = Math.max(0, variants.findIndex(variant => matches(variant, value)));
    const variant = variants[selected];
    control = <Stack gap={3}><NativeSelect.Root disabled={readOnly}><NativeSelect.Field id={id} aria-label={`${label} value format`} value={selected} onChange={event => {
      const next = Number(event.target.value); onChange(emptyExerciseTemplateField(variants[next]));
    }}>{variants.map((entry, index) => <option key={index} value={index}>{entry.type === "object" ? "Answer with alternatives and explanation" : entry.type === "array" ? "Multiple values" : "Single value"}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>
      {variant && <TemplateFieldInput field={{ ...variant, label, required: true }} value={value} onChange={onChange} readOnly={readOnly} path={path} issues={issues} mode="item" />}
    </Stack>;
  } else if (field.type === "object") {
    const object = value && typeof value === "object" && !Array.isArray(value) ? value as ExerciseTemplateValue : {};
    control = <Stack gap={4} borderWidth="1px" borderRadius="md" p={4}>{(field.properties ?? []).map(child => <TemplateFieldInput key={child.key} field={child} value={object[child.key]} onChange={next => onChange(setExerciseTemplateField(object, [child.key], next))} readOnly={readOnly} path={[...path, child.key]} issues={issues} mode={mode} />)}<RetainedFields value={object} fields={field.properties ?? []} readOnly={readOnly} onRemove={key => onChange(setExerciseTemplateField(object, [key], undefined))} /></Stack>;
  } else if (field.type === "array") {
    const entries = Array.isArray(value) ? value : [];
    control = <Stack gap={3}>{entries.map((entry, index) => <Box key={index} borderWidth="1px" borderRadius="md" p={3}>
      <HStack justify="space-between" mb={2}><Text fontSize="sm" fontWeight="medium">{label} {index + 1}</Text><HStack gap={1}>
        <Button size="xs" variant="ghost" disabled={readOnly || index === 0} onClick={() => { const next = entries.slice(); [next[index - 1], next[index]] = [next[index], next[index - 1]]; onChange(next); }} aria-label={`Move ${label} ${index + 1} up`}>Move up</Button>
        <Button size="xs" variant="ghost" disabled={readOnly} onClick={() => onChange(entries.filter((_, current) => current !== index))} aria-label={`Remove ${label} ${index + 1}`}>Remove</Button>
      </HStack></HStack>
      {field.element && <TemplateFieldInput field={{ ...field.element, label: "Value", required: true }} value={entry} onChange={next => onChange(entries.map((current, currentIndex) => currentIndex === index ? next : current))} readOnly={readOnly} path={[...path, index]} issues={issues} mode={mode} />}
    </Box>)}<Button size="sm" variant="outline" alignSelf="start" disabled={readOnly || (field.maxItems !== undefined && entries.length >= field.maxItems)} onClick={() => onChange([...entries, field.element ? emptyExerciseTemplateField(field.element) : ""])}>Add {label.toLowerCase()} entry</Button>
      {field.minItems !== undefined || field.maxItems !== undefined ? <Text fontSize="xs" color="fg.muted">{field.minItems === field.maxItems ? `Exactly ${field.minItems} entries` : `${field.minItems ?? 0} minimum${field.maxItems !== undefined ? `, ${field.maxItems} maximum` : ""}`}</Text> : null}
    </Stack>;
  } else if (field.type === "enum" || field.type === "boolean") {
    const choices = field.type === "boolean" ? [true, false] : field.values ?? [];
    control = <NativeSelect.Root disabled={readOnly}><NativeSelect.Field id={id} value={String(value)} onChange={event => onChange(choices.find(choice => String(choice) === event.target.value))}>{choices.map(choice => <option key={String(choice)} value={String(choice)}>{typeof choice === "boolean" ? choice ? "Yes" : "No" : String(choice)}</option>)}</NativeSelect.Field><NativeSelect.Indicator /></NativeSelect.Root>;
  } else if (field.type === "number" || field.type === "integer") {
    control = <Input id={id} type="number" value={typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" ? value : ""} min={field.minimum ?? (field.exclusiveMinimum !== undefined ? field.exclusiveMinimum + (field.type === "integer" ? 1 : Number.EPSILON) : undefined)} max={field.maximum} step={field.type === "integer" ? 1 : "any"} readOnly={readOnly} onChange={event => onChange(event.target.value === "" ? "" : Number(event.target.value))} />;
  } else {
    control = <Textarea id={id} rows={field.key === "src" || field.key === "language" ? 1 : 3} value={typeof value === "string" ? value : String(value ?? "")} maxLength={field.maxLength} readOnly={readOnly} onChange={event => onChange(event.target.value)} />;
  }
  return <Field.Root invalid={errors.length > 0} required={field.required && mode === "item"}>
    <HStack justify="space-between" w="full"><Field.Label htmlFor={id}>{label}{field.required && mode === "item" ? <Field.RequiredIndicator /> : null}</Field.Label>{canUnset && !absent ? <Button size="xs" variant="ghost" disabled={readOnly} onClick={() => onChange(undefined)}>Clear</Button> : null}</HStack>
    {field.description ? <Field.HelperText>{field.description}</Field.HelperText> : null}
    <Box w="full">{control}</Box>{errors.map((error, index) => <Field.ErrorText key={index}>{error.message}</Field.ErrorText>)}
  </Field.Root>;
}

export function ExerciseTemplateEditor({ exerciseType, value, onChange, body = "", onBodyChange, readOnly, mode = "item", issues = [], itemLanguage }: ExerciseTemplateEditorProps) {
  const template = exerciseTemplateById(exerciseType);
  if (!template) return <Text role="alert">This exercise template is unavailable.</Text>;
  return <Stack gap={5}>
    {mode === "defaults" ? <Text fontSize="sm" color="fg.muted">Language is selected when creating an item.</Text> : itemLanguage ? <Stack gap={2}>
      <Text fontSize="sm">Language: {contentLanguageLabel(itemLanguage)}</Text>
      {value.language !== itemLanguage ? <HStack flexWrap="wrap"><Text color="fg.warning" fontSize="sm">The saved exercise language does not match this item.</Text><Button size="sm" variant="outline" disabled={readOnly} onClick={() => onChange({ ...value, language: itemLanguage })}>Use {contentLanguageLabel(itemLanguage)}</Button></HStack> : null}
    </Stack> : null}
    {template.fields.filter(field => field.key !== "type" && !(field.key === "language" && (mode === "defaults" || itemLanguage))).map(field => <TemplateFieldInput key={field.key} field={field} value={value[field.key]} onChange={next => onChange(setExerciseTemplateField(value, [field.key], next) as ExerciseTemplateValue)} readOnly={readOnly} path={[field.key]} issues={issues} mode={mode} />)}
    <RetainedFields value={value} fields={template.fields} readOnly={readOnly} onRemove={key => onChange(setExerciseTemplateField(value, [key], undefined) as ExerciseTemplateValue)} />
    {onBodyChange ? <Field.Root><Field.Label>Exercise body</Field.Label><Field.HelperText>Additional instructions or supporting content in Markdown.</Field.HelperText><Textarea rows={5} value={body} readOnly={readOnly} onChange={event => onBodyChange(event.target.value)} /></Field.Root> : null}
  </Stack>;
}
