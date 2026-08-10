# Project Context

Project-context version: `1`

The classifier receives only bounded context that materially improves responsibility labels:

- VS Code language ID
- Nearest `package.json` name, module type, private flag, and sorted dependency names (maximum 120 per group; manifests over 256,000 bytes are ignored)
- Nearest explicit `.semantic-code.md` instructions (maximum 8,000 UTF-8 bytes)

Package scripts, arbitrary manifest fields, directory listings, callers/callees, and unrelated files are not collected. Search never escapes the current workspace. The absolute workspace root remains internal and is excluded from the LLM prompt.

Context candidates must be regular, non-symlink files whose resolved path remains inside the resolved workspace root. Reads allocate only the configured byte cap, so oversized context cannot stall the extension host through an unbounded `readFile`.

`.semantic-code.md` is an opt-in project vocabulary aid. It should describe responsibility conventions, not contain secrets or broad agent instructions. Any change to bounded context invalidates the classification cache.
Instruction content matching obvious private-key or credential patterns is dropped.
