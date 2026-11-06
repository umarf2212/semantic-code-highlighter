# Cache Invalidation

Cache format version: `2`

Results live in VS Code workspace state, not in the user's repository. The cache retains at most 200 recent entries and never stores source text. Local results may retain their fixed, deterministic explanations. OpenAI explanations are discarded before persistence because a model rationale could echo a source identifier or literal; cached OpenAI results retain only region IDs, responsibilities, and confidence.

Activation removes the legacy v1 cache namespace, which could contain OpenAI explanations.

The SHA-256 key includes:

- Relative file path and complete current source text
- Language
- Relevant package/project instructions
- Provider/model identity and classifier version
- Ontology version
- Region-model version
- Prompt and classification-schema versions

A change to any of those inputs produces a miss. A content edit also clears visible decorations immediately, so stale colors are never presented as current. Disabling caching bypasses both reads and writes. `Semantic Code: Clear Cached Analysis` clears persisted results and every in-memory map; `Clear Session Analysis` clears all in-memory maps and active lenses without deleting the v2 persisted cache.

Validated model line ownership decisions (line numbers and region IDs only) are persisted with classifications. Prompt v2, schema v2, and region model v3 invalidate earlier keys; cache storage remains v2 because no new source-derived text is stored.

The `agent` provider bypasses both cache reads and writes and reloads the user-owned artifact on analysis. Its source hash and version header protect against stale files and incompatible formats. A map-file watcher clears in-memory displays on creation, replacement, or deletion. Existing cache behavior applies to local and OpenAI classification.
