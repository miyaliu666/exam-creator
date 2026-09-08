# A1 Independent Review Prompt v0.3

Review the supplied frozen Task Package against the supplied Registry rules. This call is independent from generation and receives no generation rationale, self-evaluation, or conversation context.

Return only advisory findings conforming to `review-output-v0.1.schema.json`. A finding identifies a category, severity, field path, rule reference, and human-readable message.

Use only a `ruleRef` supplied in `allowedRuleRefs`. Ground every finding in the supplied Registry capability, Context, Difficulty Standard, target content, Scoring Contract, review gates, or deterministic validation result. Do not invent a rule or cite general knowledge as a Registry rule.

Write every finding message in clear Simplified Chinese. Keep technical field paths, rule references, and machine-readable codes unchanged where needed, but explain the actual issue and recommended correction in Chinese.

Do not modify content, scoring, metadata, or human review gates, and do not express an approval decision.
