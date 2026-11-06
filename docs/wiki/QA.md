# Quality assurance

## Release gate

The semantic map is a visual navigation aid, so unit tests alone are not a sufficient release gate. A release candidate must pass both deterministic tests and an Extension Development Host check.

## Automated checks

Run from the repository root:

```sh
npm run check
npm test
npm run compile
npm run package:vsix
```

The suite covers region extraction, hierarchy, classification validation, line ownership, low-confidence shielding, cache identity, source filtering, project context, concurrency, and provider adapters.

## Extension Development Host smoke test

1. Open this repository in VS Code and press `F5`.
2. Open `test/fixtures/demo-workspace/order-service.ts` in the development host.
3. Run **Semantic Code: Analyze Current File**.
4. Confirm that validation, business-logic/calculation, external I/O, transformation, and data areas use subtle, mutually exclusive whole-line bands.
5. Focus **External I/O** with the responsibility lens, then restore all responsibilities.
6. Toggle the map off and on from the status bar. Both the provider and map state must remain visible.
7. Edit the file once. Stale decoration must disappear until the file is analyzed again.

## Representative-repository check

The 2026-08-10 pre-release check used a shallow clone of Microsoft's `vscode-extension-samples` repository. `decorator-sample/src/extension.ts` activated and analyzed successfully with the local provider in VS Code 1.126.0 on macOS arm64. The check intentionally keeps the clone under the ignored `.qa/` directory so test material never enters the package.

Use this pass to look for over-coloring and under-coloring, not just crashes. Ambiguous code should remain uncolored; obvious platform setup, data movement, validation, I/O, and domain rules should be recognizable.

## Manual provider checks

OpenAI checks require a user-supplied key in VS Code SecretStorage. Before release, verify the first-send disclosure, cancellation both before dispatch and in flight, `store: false`, structured-output validation and retry, sequential workspace requests, cache reuse without persisted model rationale, provider/model identity, and failure behavior. Never put a test key in repository settings, fixtures, logs, screenshots, or issue reports.

## Real-repository UAT — 2026-11-05

The [feasibility assessment and screenshot report](../uat/2026-11-05/README.md) records an actual Extension Development Host run in VS Code 1.140.0 on macOS arm64 against pinned shallow clones of Hackathon Starter, RealWorld, Express and NodeBB. Four authored agent maps (340 regions) were validated and visually inspected. The run exercised preparation, hover, responsibility lens, summary navigation, toggling, edit invalidation, stale-map rejection, replacement and partial workspace-map reporting. Offline workspace analysis mapped 37 RealWorld files with zero failures. A separate deterministic local sweep analyzed 1,055 files; 129 exceeded the default 220-region limit.

The UAT found useful responsibility boundaries, but also first-run missing-map friction, a local email-I/O misclassification, large-file exclusions, colored whitespace, loss of provider identity while hidden, and progress remaining pending until a skip warning was dismissed. The agent maps were authored and assessed by the same agent, so screenshots and successful validation are demonstration evidence, not independent accuracy or reading-speed measurements. OpenAI, light/high-contrast themes and formal accessibility acceptance remain untested in that run. All 89 automated tests, type checking, compilation and VSIX packaging passed. Product behavior, ontology and visual precedence were not changed.
