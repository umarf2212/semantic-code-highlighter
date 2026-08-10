# Semantic Code Highlighter agent guide

The product north star is code-reading convenience: subtle, whole-line background bands that reveal semantic responsibility at a glance. Preserve that core before adding panels, graphs, statistics, or automated analysis.

Read [`docs/wiki/README.md`](docs/wiki/README.md) before changing product behavior. Update the relevant wiki page and ADR whenever a branch changes the ontology, region model, prompt/schema version, privacy boundary, cache key, or visual precedence.

Run `npm run check`, `npm test`, and `npm run compile` before handing off a change. Keep deterministic logic independent of the VS Code API wherever practical.

