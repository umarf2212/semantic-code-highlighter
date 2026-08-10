# Cache Invalidation

Cache format version: `1`

Results live in VS Code workspace state, not in the user's repository. The cache retains at most 200 recent entries and stores classifications/explanations, not source text.

The SHA-256 key includes:

- Relative file path and complete current source text
- Language
- Relevant package/project instructions
- Provider/model identity and classifier version
- Ontology version
- Region-model version
- Prompt version

A change to any of those inputs produces a miss. A content edit also clears visible decorations immediately, so stale colors are never presented as current. Disabling caching bypasses both reads and writes. `Semantic Code: Clear Cached Analysis` clears persisted results and visible analysis; `Clear Visible Analysis` only hides the current session's results.

