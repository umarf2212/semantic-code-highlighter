# Project Context

Project-context version: `1`

The classifier receives only bounded context that materially improves responsibility labels:

- VS Code language ID
- Nearest `package.json` name, module type, private flag, and sorted dependency names (maximum 120 per group)
- Nearest explicit `.semantic-code.md` instructions (maximum 8,000 characters)

Package scripts, arbitrary manifest fields, directory listings, callers/callees, and unrelated files are not collected. Search never escapes the current workspace. The absolute workspace root remains internal and is excluded from the LLM prompt.

`.semantic-code.md` is an opt-in project vocabulary aid. It should describe responsibility conventions, not contain secrets or broad agent instructions. Any change to bounded context invalidates the classification cache.
Instruction content matching obvious private-key or credential patterns is dropped.
