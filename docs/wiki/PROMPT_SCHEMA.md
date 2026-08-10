# Prompt and Schema Versions

Prompt version: `1`  
Classification schema version: `1`  
Ontology version: `1`

The OpenAI adapter uses the Responses API with strict structured outputs. The provider receives the relative file path, language, compact region metadata and hierarchy, optional [bounded project context](PROJECT_CONTEXT.md), and the source code once. Region snippets are not duplicated in the payload and the absolute workspace root is omitted.

Every AST region must appear exactly once with a short explanation. The validator rejects unknown or duplicate IDs, omissions, arbitrary categories, confidence outside `0..1`, extra keys, and explanations over 240 characters. The required explanation shape is compatible with OpenAI strict structured outputs. Invalid semantic output is retried once with the same source payload plus a bounded repair reason, then fails without painting a partial map. OpenAI requests are capped at 400 regions to match the output schema.

The default model is `gpt-5.4-nano`, selected for a bounded classification workload. The model remains configurable because availability and project constraints vary.
