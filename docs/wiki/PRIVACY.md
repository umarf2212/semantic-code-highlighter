# Privacy and Data Sent

The default `local` classifier is deterministic and sends nothing over the network.

The `openai` provider runs only after the user selects it and explicitly invokes analysis. Its API key is stored in VS Code `SecretStorage`, never in settings or the repository. Requests set `store: false` and contain:

- Relative file path
- VS Code language ID
- AST region types, line ranges, names, IDs, and hierarchy
- Optional bounded package dependency names and explicit `.semantic-code.md` instructions
- Current source text once

The absolute workspace root is not sent. Before the first OpenAI cache miss in a workspace, a modal disclosure names the data and destination. Cancellation sends nothing.

The source filter rejects `.env*`, credentials/secrets files, private keys and certificates, dependency/build/generated directories, generated/minified files, obvious embedded key material, unsupported extensions, and files over the configured size limit. Requests also have a configurable region limit.

Cached results contain region classifications and short explanations, not source text. See [Cache Invalidation](CACHE.md).

Opt-in analyze-on-open never starts OpenAI requests until the workspace has already
accepted the first-send disclosure through a manual analysis.
