# Semantic Code Highlighter

Semantic Code Highlighter is an experimental VS Code extension that turns a source file into a subtle, responsibility-based map. Instead of recoloring syntax, it gives meaningful code regions low-opacity background bands for business logic, validation, utilities, data, infrastructure, external I/O, and transformations.

The project is intentionally being built core-first. The initial scaffold in this branch only establishes the extension, build, test, and CI foundation. Feature branches add the semantic model, AST extraction, visualization, classifiers, caching/privacy, and focused navigation without compromising the normal editor experience.

See [`docs/wiki/`](docs/wiki/) as it is introduced for the LLM-readable product and architecture record.

## Development

```bash
npm install
npm run check
npm test
npm run compile
```

Press `F5` in VS Code to launch an Extension Development Host.

## Status

Experimental pre-release. Classification is advisory and must never be treated as a source of truth.

