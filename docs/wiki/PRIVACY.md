# Privacy and Data Sent

The default `local` classifier is deterministic and sends nothing over the network.

The optional `openai` provider is used only when selected in `semanticCode.provider`. An eligible cache miss can be started by a manual current-file command, an explicitly confirmed bounded workspace run, or opt-in analyze-on-open after the workspace has previously accepted the complete disclosure. The API key is stored in VS Code `SecretStorage`, never in settings or the repository.

Each OpenAI classification attempt uses `store: false` and contains:

- Current eligible source text
- Workspace-relative file path, or basename only for a loose file
- VS Code language ID
- AST region types, line ranges, names, IDs, and hierarchy
- Optional bounded package name, module type, private flag, and dependency names
- Up to 8,000 UTF-8 bytes of explicit `.semantic-code.md` instructions

If the first structured result fails semantic validation, the same payload can be sent once more with a bounded repair reason. The extension does not send the absolute workspace root, package scripts, arbitrary manifest fields, directory listings, callers/callees, or unrelated files.

Before the first OpenAI dispatch in a workspace, a modal names the data, destination, `store: false`, possible one-time resend, and cancellation limitation. A first-time workspace run uses that same complete disclosure and also states the maximum number of files and possible API usage; it cannot silently mark a shorter consent as complete. Declining the disclosure prevents dispatch. Cancellation before dispatch sends nothing. Cancelling an in-flight request stops local waiting and result processing, but bytes may already have been transmitted and API usage may still occur.

The source filter rejects `.env*`, credentials/secrets files, private keys and certificates, dependency/build/generated directories, generated/minified files, obvious embedded key material, unsupported extensions, and files over the configured size limit. Requests also have a configurable region limit. OpenAI analysis rejects symlinked source files; workspace sources must resolve inside the real workspace boundary, while an explicitly opened loose file must be a regular file. Project-context files are also regular-file-only, resolved within the real workspace boundary, and read with byte caps; symlinked context files are rejected.

Cached results never contain source text. OpenAI explanations are removed before persistence because a model rationale could echo a source identifier or literal; cached OpenAI results retain region classifications and confidence only. Local explanations are fixed strings and may be cached. Activation removes the legacy v1 cache namespace. See [Cache Invalidation](CACHE.md).
