# Privacy and Data Sent

The default `local` classifier is deterministic and sends nothing over the network.

The `openai` provider runs only after the user selects it and explicitly invokes analysis. Its API key is stored in VS Code `SecretStorage`, never in settings or the repository. Requests set `store: false` and contain:

- Relative file path
- VS Code language ID
- AST region types, line ranges, names, IDs, and hierarchy
- Optional bounded package/project instructions
- Current source text once

The absolute workspace root is not sent. Source filtering, first-send disclosure, size limits, and cache behavior are specified in their implementation branch.

