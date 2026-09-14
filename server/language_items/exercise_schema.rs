//! The deterministic subset emitted by the vendored Zod exercise schemas.
use serde_json::{Value, json};

pub fn initial_value(schema: &Value) -> Value {
    if let Some(value) = schema.get("default").or_else(|| schema.get("const")) {
        return value.clone();
    }
    if let Some(value) = schema
        .get("enum")
        .and_then(Value::as_array)
        .and_then(|values| values.first())
    {
        return value.clone();
    }
    if let Some(branch) = schema
        .get("anyOf")
        .or_else(|| schema.get("oneOf"))
        .and_then(Value::as_array)
        .and_then(|branches| branches.first())
    {
        return initial_value(branch);
    }
    match schema.get("type").and_then(Value::as_str) {
        Some("object") => {
            let mut fields = serde_json::Map::new();
            if let Some(properties) = schema.get("properties").and_then(Value::as_object) {
                for (key, child) in properties {
                    let required = schema
                        .get("required")
                        .and_then(Value::as_array)
                        .is_some_and(|values| {
                            values.iter().any(|value| value.as_str() == Some(key))
                        });
                    if required || child.get("default").is_some() {
                        fields.insert(key.clone(), initial_value(child));
                    }
                }
            }
            Value::Object(fields)
        }
        Some("array") => {
            let count = schema
                .get("minItems")
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .min(100);
            Value::Array(
                (0..count)
                    .map(|_| {
                        schema
                            .get("items")
                            .map(initial_value)
                            .unwrap_or(Value::Null)
                    })
                    .collect(),
            )
        }
        Some("number" | "integer") => schema.get("minimum").cloned().unwrap_or(json!(1)),
        Some("boolean") => json!(false),
        Some("null") => Value::Null,
        _ => json!(""),
    }
}

pub fn validate(schema: &Value, value: &Value, path: &str, issues: &mut Vec<(String, String)>) {
    validate_inner(schema, schema, value, path, issues, 0);
}

fn validate_inner(
    root: &Value,
    schema: &Value,
    value: &Value,
    path: &str,
    issues: &mut Vec<(String, String)>,
    depth: u16,
) {
    if issues.len() >= 100 {
        return;
    }
    let add =
        |issues: &mut Vec<(String, String)>, message: String| issues.push((path.into(), message));
    if depth > 64 {
        add(issues, "Exercise content is nested too deeply.".into());
        return;
    }
    if schema == &Value::Bool(false) {
        add(issues, "This value is not allowed.".into());
        return;
    }
    if let Some(reference) = schema.get("$ref").and_then(Value::as_str) {
        match reference
            .strip_prefix('#')
            .and_then(|pointer| root.pointer(pointer))
        {
            Some(target) => validate_inner(root, target, value, path, issues, depth + 1),
            None => add(
                issues,
                "The exercise schema contains an unresolved reference.".into(),
            ),
        }
        return;
    }
    for keyword in ["anyOf", "oneOf", "allOf"] {
        if let Some(branches) = schema.get(keyword).and_then(Value::as_array) {
            let valid = branches
                .iter()
                .filter(|branch| {
                    let mut branch_issues = vec![];
                    validate_inner(root, branch, value, path, &mut branch_issues, depth + 1);
                    branch_issues.is_empty()
                })
                .count();
            if (keyword == "anyOf" && valid == 0)
                || (keyword == "oneOf" && valid != 1)
                || (keyword == "allOf" && valid != branches.len())
            {
                add(
                    issues,
                    "The value does not match the exercise's permitted structure.".into(),
                );
            }
        }
    }
    if let Some(condition) = schema.get("if") {
        let mut condition_issues = vec![];
        validate_inner(
            root,
            condition,
            value,
            path,
            &mut condition_issues,
            depth + 1,
        );
        if let Some(branch) = schema.get(if condition_issues.is_empty() {
            "then"
        } else {
            "else"
        }) {
            validate_inner(root, branch, value, path, issues, depth + 1);
        }
    }
    if let Some(forbidden) = schema.get("not") {
        let mut forbidden_issues = vec![];
        validate_inner(
            root,
            forbidden,
            value,
            path,
            &mut forbidden_issues,
            depth + 1,
        );
        if forbidden_issues.is_empty() {
            add(
                issues,
                "The value matches a forbidden exercise structure.".into(),
            );
        }
    }
    if schema
        .get("const")
        .is_some_and(|expected| expected != value)
    {
        add(
            issues,
            "The value differs from the fixed exercise setting.".into(),
        );
    }
    if schema
        .get("enum")
        .and_then(Value::as_array)
        .is_some_and(|values| !values.contains(value))
    {
        add(issues, "Select one of the permitted values.".into());
    }
    let matches_type = |kind: &str| match kind {
        "object" => value.is_object(),
        "array" => value.is_array(),
        "string" => value.is_string(),
        "number" => value.is_number(),
        "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
        "boolean" => value.is_boolean(),
        "null" => value.is_null(),
        _ => false,
    };
    if let Some(kind) = schema.get("type") {
        let correct = kind.as_str().is_some_and(&matches_type)
            || kind
                .as_array()
                .is_some_and(|kinds| kinds.iter().filter_map(Value::as_str).any(&matches_type));
        if !correct {
            add(issues, format!("Expected a value of type {kind}."));
            return;
        }
    }
    if let Some(object) = value.as_object() {
        if let Some(required) = schema.get("required").and_then(Value::as_array) {
            for key in required.iter().filter_map(Value::as_str) {
                if !object.contains_key(key) {
                    issues.push((format!("{path}.{key}"), "This field is required.".into()));
                }
            }
        }
        let properties = schema.get("properties").and_then(Value::as_object);
        for (key, child) in object {
            if let Some(child_schema) = properties.and_then(|fields| fields.get(key)) {
                validate_inner(
                    root,
                    child_schema,
                    child,
                    &format!("{path}.{key}"),
                    issues,
                    depth + 1,
                );
            } else if schema.get("additionalProperties") == Some(&Value::Bool(false)) {
                issues.push((
                    format!("{path}.{key}"),
                    "This field is not part of the pinned exercise schema.".into(),
                ));
            } else if let Some(additional) = schema
                .get("additionalProperties")
                .filter(|value| value.is_object())
            {
                validate_inner(
                    root,
                    additional,
                    child,
                    &format!("{path}.{key}"),
                    issues,
                    depth + 1,
                );
            }
        }
    }
    if let Some(array) = value.as_array() {
        if schema
            .get("minItems")
            .and_then(Value::as_u64)
            .is_some_and(|min| array.len() < min as usize)
        {
            add(issues, "Add the required number of entries.".into());
        }
        if schema
            .get("maxItems")
            .and_then(Value::as_u64)
            .is_some_and(|max| array.len() > max as usize)
        {
            add(
                issues,
                "There are more entries than this exercise permits.".into(),
            );
        }
        if schema.get("uniqueItems").and_then(Value::as_bool) == Some(true)
            && array
                .iter()
                .enumerate()
                .any(|(index, entry)| array[..index].contains(entry))
        {
            add(issues, "Entries must be unique.".into());
        }
        for (index, entry) in array.iter().enumerate() {
            let items = schema.get("items");
            if let Some(item_schema) = items.and_then(|items| {
                items
                    .as_array()
                    .and_then(|items| items.get(index))
                    .or_else(|| items.is_object().then_some(items))
            }) {
                validate_inner(
                    root,
                    item_schema,
                    entry,
                    &format!("{path}.{index}"),
                    issues,
                    depth + 1,
                );
            }
        }
    }
    if let Some(text) = value.as_str() {
        let len = text.chars().count();
        if schema
            .get("minLength")
            .and_then(Value::as_u64)
            .is_some_and(|min| len < min as usize)
        {
            add(issues, "The text is shorter than permitted.".into());
        }
        if schema
            .get("maxLength")
            .and_then(Value::as_u64)
            .is_some_and(|max| len > max as usize)
        {
            add(issues, "The text is longer than permitted.".into());
        }
        if let Some(pattern) = schema.get("pattern").and_then(Value::as_str) {
            match regex::Regex::new(pattern) {
                Ok(expression) if expression.is_match(text) => {}
                _ => add(
                    issues,
                    "The text does not match the required pattern.".into(),
                ),
            }
        }
    }
    if let Some(number) = value.as_f64() {
        for (key, comparison) in [
            ("minimum", 0_u8),
            ("maximum", 1),
            ("exclusiveMinimum", 2),
            ("exclusiveMaximum", 3),
        ] {
            if let Some(limit) = schema.get(key).and_then(Value::as_f64) {
                let invalid = match comparison {
                    0 => number < limit,
                    1 => number > limit,
                    2 => number <= limit,
                    _ => number >= limit,
                };
                if invalid {
                    add(
                        issues,
                        format!("The number does not satisfy {key} {limit}."),
                    );
                }
            }
        }
        if let Some(multiple) = schema.get("multipleOf").and_then(Value::as_f64)
            && (multiple <= 0.0 || ((number / multiple).round() - number / multiple).abs() > 1e-9)
        {
            add(issues, "The number is not an allowed multiple.".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn enforces_source_bounds_and_answer_structure() {
        let schema = json!({"type":"object","required":["segments"],"additionalProperties":false,
            "properties":{"segments":{"type":"array","minItems":3,"maxItems":4,"items":{"type":"object","required":["answer"],"properties":{"answer":{"type":"string"}}}}}});
        let mut issues = vec![];
        validate(
            &schema,
            &json!({"segments":[{},{}],"unknown":true}),
            "data",
            &mut issues,
        );
        assert!(issues.iter().any(|(path, _)| path == "data.unknown"));
        assert!(issues.iter().any(|(path, _)| path == "data.segments"));
        assert!(
            issues
                .iter()
                .any(|(path, _)| path == "data.segments.0.answer")
        );
    }
}
