# ADR 0007: Reproduce the UAT as an isolated Codespaces showcase

Status: accepted

## Context

The recorded real-repository UAT is useful evidence, but a tester should also be able to open a browser editor with the extension and examples already prepared. The agent provider and its prompt/ownership dependencies were previously only present in the development working tree. The current main/Marketplace release must not be confused with the tested development build.

## Decision

Publish the existing tested agent implementation and a Codespaces recipe on a dedicated demo branch. Build and install the VSIX from that branch's source. A Node 22 dev container opens a dedicated `demo` workspace, downloads four public repositories at fixed commits, and validates archived maps with the same classifier used by the extension. Rewrite only workspace-relative file paths; do not change source, category decisions, source hashes, region IDs or the ontology/prompt/schema/region versions.

Declare the extension as a workspace extension so Node.js and filesystem operations run in the remote host. Enable analyze-on-open only in the demo workspace. The normal extension default remains manual analysis. Post-attach installation checks host compatibility and artifact identity; it does not configure credentials or call a model.

## Consequences

- Each Codespace has its own prepared files and editor state. Users use GitHub's own quota, permissions and billing controls.
- Startup contacts public GitHub and dependency/image registries. It does not install or execute the example applications or contact a model provider.
- Existing checkout edits are preserved and stale maps are rejected. The generated showcase map is replaced only after all entries validate.
- The four curated files are demonstration artifacts, not repository-wide coverage or independent accuracy evidence.
- A ready configuration and a locally passing setup are distinct from a live Codespace/browser acceptance check. Report any unavailable Codespaces access explicitly.
- Example clones, generated metadata and setup state remain ignored and excluded from the VSIX. No public ports, secrets, billing changes or account-wide security relaxations are part of the recipe.
