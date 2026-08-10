# Contributing

Thank you for helping make unfamiliar code easier to read.

## Product constraint

The north star is a quiet, trustworthy bird's-eye responsibility map inside the editor. A change must not weaken the current-file background map, modify user source, hide uncertainty, or turn advisory classification into a quality score. Read [`docs/wiki/NORTH_STAR.md`](docs/wiki/NORTH_STAR.md), [`docs/wiki/REGION_MODEL.md`](docs/wiki/REGION_MODEL.md), and [`docs/wiki/PRIVACY.md`](docs/wiki/PRIVACY.md) before changing core behavior.

## Development

```sh
npm install
npm run check
npm test
npm run compile
npm run package:vsix
```

Contributor tooling requires Node.js 22.

Press `F5` in VS Code for the fixture-based Extension Development Host. Follow [`docs/wiki/QA.md`](docs/wiki/QA.md) for the visual release gate.

## Pull requests

- Keep a branch focused on one independently reviewable capability.
- Add or update tests for region ownership, uncertainty, cache identity, privacy, provider validation, or concurrency when those areas change.
- Update the LLM wiki when shipped behavior or a product constraint changes.
- Never commit credentials, eligible proprietary source used for testing, `.qa/`, generated bundles, VSIX artifacts, or cached classifications.
- Include screenshots for visual changes and state whether local, OpenAI, or both providers were exercised.

Bug reports and feature requests should use the repository issue forms. Security-sensitive reports should not include source code, credentials, or private paths in public issues.
