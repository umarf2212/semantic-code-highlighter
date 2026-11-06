# Agent-authored semantic maps

The extension renders semantic decisions; it need not host the model that makes them. The default `agent` provider consumes `.semantic-code/map.json` authored in a normal coding-agent session. There is no API key, model subprocess, or subscription credential integration in the extension. API classification remains an optional provider.

## Workflow

1. Run **Semantic Code: Prepare Agent Analysis** in the target workspace. It writes SPEC.md, requests.json, and map.schema.json into `.semantic-code`. It preserves any existing map.json.
2. Ask your coding agent: “Read `.semantic-code/SPEC.md`, inspect the codebase, and generate `.semantic-code/map.json`.” The agent can follow relevant implementations, callers, tests, and documentation across files using its own authorized access.
3. Use `semanticCode.provider: agent`, then **Analyze Current File** or **Analyze Workspace**. The extension checks the map against the current file and draws the existing responsibility bands.

From the extension development repository, `npm run prepare:agent -- /path/to/codebase` provides the same export without requiring the installed extension. No target-repository dependency installation is needed. VS Code preparation respects existing workspace/file/region settings. CLI preparation allows up to 500 eligible files, 256 KB per file, and 10,000 regions per file. Excluded and over-limit files are counted explicitly; this is not a promise of unlimited coverage. Supported output languages remain JS/TS.

## Artifact contract

The header contains format, ontology, region-model, prompt, and schema versions. Each file entry has a normalized workspace-relative path, SHA-256 hash of the exact source text, and a classification with regions and lineOwners. The agent copies IDs and hashes from requests.json; it does not invent ranges. The generated JSON Schema is the machine-readable contract. The existing ontology, dominant-purpose instruction, confidence handling, and single-line semantic arbitration apply unchanged.

Unknown code is explicitly unknown; missing entries are incomplete work and are reported when loaded. An invalid classification never paints a partial file. Larger repositories can regenerate/update subsets while retaining other compatible entries; maps have a 500-file and 16-MB cap.

## Updates and ownership

Source changes clear colors immediately and make the corresponding old hash fail. Map creation/replacement/deletion clears displayed maps. Reload manually, or enable analyzeOnOpen for the active saved file. Agent loads bypass the extension cache. Changing model providers also clears prior results.

Cross-file context is considered by the agent, not automatically tracked by the extension. A dependency or policy change can invalidate reasoning without changing a consumer's own source hash. Ask the agent to refresh affected mappings after such changes. The extension does not claim dependency-aware freshness.

SPEC.md, requests.json, and map.schema.json are generated files. map.json is user-owned model output, may contain rationale text and identifiers, and should be reviewed before sharing or committing. The extension never automatically launches an agent or changes source code. Use the coding-agent host's own permission and authentication mechanisms.

The checked-in example is under `test/fixtures/tangled-workspace/.semantic-code`. Open that fixture directory as the workspace root to load its utils.ts mapping directly. It is a reference example, not a blind accuracy evaluation.
