# Prompt and Schema Versions

- Prompt version: `2`
- Classification schema version: `2`
- Ontology version: `1`

The OpenAI adapter uses the Responses API with strict structured outputs. The provider receives the relative file path, language, compact region metadata and hierarchy, optional [bounded project context](PROJECT_CONTEXT.md), and the source code once. Region snippets are not duplicated in the payload and the absolute workspace root is omitted.

Every AST region must appear exactly once with a short explanation. The validator rejects unknown or duplicate IDs, omissions, arbitrary categories, confidence outside `0..1`, extra keys, and explanations over 240 characters. The required explanation shape is compatible with OpenAI strict structured outputs. Invalid semantic output is retried once with the same source payload plus a bounded repair reason, then fails without painting a partial map. OpenAI requests are capped at 400 regions to match the output schema.

The default model is `gpt-5.4-nano`, selected for a bounded classification workload. The model remains configurable because availability and project constraints vary.

## Purpose-first classification

The model reads the entire supplied file and follows same-file implementations and data flow, including helpers declared later. Paths, names, comments, and package vocabulary are supporting hints, not category rules. The prompt distinguishes domain calculations from representation changes, schema declarations from runtime validation, and service wiring from actual I/O. It asks for one dominant purpose, allows mixed only for broad regions without a coherent dominant purpose, and retains unknown for opaque behavior.

Region metadata includes exact half-open UTF-16 offsets as well as zero-based inclusive lines, so inline regions are distinguishable without duplicating source snippets. Source and project context are explicitly treated as untrusted evidence.

The payload includes `lineOwnershipChoices` for ambiguous single lines. The required output `lineOwners` array selects one existing candidate region for every such line (empty when there are none). The validator rejects omissions, duplicate lines, noncandidate IDs, and unsolicited line decisions. The renderer uses the selected region's category, confidence, and rationale; selecting unknown or below-threshold evidence leaves the line uncolored. This is semantic arbitration among AST regions, not model-generated source ranges. Local results omit these decisions and keep their deterministic fallback.

A prompt improvement is not an accuracy measurement. Use the [semantic evaluation](SEMANTIC_EVALUATION.md) with an explicit model to compare quality; mock provider tests verify the protocol only.

## Coding-agent artifact format

Agent map format v1 wraps file classifications with relative file paths, exact source SHA-256 hashes, and explicit format/ontology/region/prompt/schema versions. Preparation exports the same semantic instructions and AST metadata as a reusable SPEC.md plus requests.json and a generated JSON Schema. The user's coding agent can read relevant context across the repository and writes map.json outside the extension's inference process.

The artifact classification shape matches schema v2, but its offline validator permits up to 10,000 regions and line choices per file instead of imposing the OpenAI response cap of 400. Extension configuration may impose a lower extraction limit. The artifact holds at most 500 files and the loader caps the file at 16 MB. Every region and ownership decision for a loaded file is validated; missing file entries are reported individually. See [Agent Workflow](AGENT_WORKFLOW.md).
