# GitHub Codespaces showcase

The `codex/codespaces-demo` branch contains a reproducible browser-based showcase of the current agent-map implementation. It does not change the Marketplace release or the main branch's provider defaults. See [ADR 0007](adr/0007-codespaces-showcase.md).

## Launch

[Open or resume the demo in GitHub Codespaces](https://codespaces.new/umarf2212/semantic-code-highlighter/tree/codex/codespaces-demo?quickstart=1).

Choose the two-core machine. GitHub's own account quota, policies and budget apply, including any student benefits; the repository does not inspect or change them. The initial build downloads the Node 22 image, installs this extension's dependencies, shallow-fetches four pinned repositories and packages a VSIX. First creation is slower than resuming an existing codespace.

The container opens `/workspaces/<repository>/demo`, a single folder workspace. This is intentional: the extension resolves one agent map relative to its workspace root. Setup rewrites each archived file path to `examples/<repository>/<source file>` and validates it against the unchanged source, exact AST region IDs, current format/schema versions and inline ownership choices. The resulting four-file map contains 340 regions.

The on-create hook runs `npm ci`, `npm run demo:prepare` and `npm run package:vsix` from the repository root. The post-attach hook installs the generated VSIX using the Codespaces VS Code CLI. It verifies VS Code 1.125 or newer, and uses a package checksum to avoid reinstalling an unchanged VSIX on each attachment. If neither `code` nor `code-insiders` is available, it fails with a reattachment instruction instead of claiming installation succeeded.

## What runs automatically

- `demo/repositories.json` pins the four public repository URLs, commits, selected files and archived map locations.
- `scripts/codespaces-demo.mjs` bundles and runs the deterministic setup/verification tool using the extension's actual extractor and agent-map loader.
- Example dependencies, application servers, databases, model requests and API keys are unnecessary. The setup never runs the downloaded repositories' package scripts.
- The demo alone enables `semanticCode.analyzeOnOpen` and selects `agent` through its workspace settings. General extension automatic-analysis defaults remain unchanged.
- `extensionKind: workspace` places the Node.js extension in the remote workspace host when VS Code is connected remotely. The editor still provides the same decorations, hover, lens and summary.
- No forwarded ports, public services, Codespaces secrets or expanded repository permissions are requested by the dev container.

This is a prepared reading aid, not a promise that the entire repository is agent-mapped. Only one file per repository has a map. Automatic analysis of other files cannot invent classifications; use the local provider or author additional maps explicitly. Prepared maps retain the UAT's same-agent evaluation limitation.

## Persistence and edits

Cloned repositories and generated metadata are ignored by the parent repository. Their files live on the codespace's disk and survive stopping/resuming that codespace. Setup reuses a checkout only if its origin and commit match the manifest, and validates the curated source hash before replacing the generated map. It never resets an existing checkout or discards tester edits. An interrupted first fetch can be retried.

The generated showcase `map.json` is replaced atomically after all four entries pass validation. The normal agent loader still rejects changed source immediately; a related implementation change can invalidate semantic reasoning even when a mapped consumer's own source hash remains unchanged.

Run `npm --prefix .. run demo:verify` from the demo terminal to check the current files and maps. Run `npm --prefix .. run demo:prepare` to download missing examples or regenerate the prepared metadata/map. Undo or explicitly restore edited example source before preparing again. These commands do not delete or reset user changes.

## Troubleshooting

**No bands:** open one of the four files linked from `demo/README.md`. Confirm that the workspace root is `demo`, the provider is `agent`, the workspace is trusted and the extension is installed in the Codespaces workspace host. Run **Semantic Code: Analyze Current File**. If a freshly installed extension has not activated, reload the window once.

**Extension installation failed:** reopen/reattach the Codespace. From the demo terminal run `node ../scripts/install-codespaces-extension.mjs`. Older VS Code hosts are rejected; update the host rather than bypassing the manifest requirement. The installer refuses to change an ordinary local VS Code installation; `--check` only performs a local preflight.

**Stale map:** undo the source edit and analyze again, or deliberately restore the sample. Setup refuses to recolor changed code with the archived labels.

**Wrong revision or origin:** use a fresh codespace or preserve your changes and fix the checkout deliberately. Preparation does not reset a user checkout.

**Opening the repository root:** if you open the parent folder instead of `demo`, the prepared map is no longer at the expected workspace root. Open `demo` again. Open the parent folder when developing the extension itself.

**CLI cannot create a codespace:** `gh codespace` requires a GitHub token with `codespace` scope. The connected GitHub repository plugin and a token with only `repo` scope cannot manage Codespaces. The launch link works through your normal GitHub browser session; account access, available student quota and the final creation screen remain controlled by GitHub.

Close compute with **Codespaces: Stop Codespace** or GitHub's Codespaces page. Closing the browser tab does not stop the machine; stopped instances still retain storage. No account-wide timeout or billing settings are changed by this configuration.

## Verification

Automated coverage checks path rewriting, repeated offline preparation, edited-source preservation, mismatched revisions, symlink rejection and manifest path/identity validation. CI prepares fresh pinned clones and loads each map through the real agent classifier after the normal check/test/compile/package steps. Creating and viewing a live Codespace requires separate Codespaces access; local setup checks alone do not prove the browser extension installed successfully.

### Live browser acceptance — 2026-11-07

Tested branch revision `2d2d85f33f7aa1ada0d58f0dcc54d8b4673a05e8` in a newly created two-core GitHub Codespace in Southeast Asia, using the browser editor:

- The container opened the intended `demo` workspace with all four example repositories and the generated agent map present.
- The post-attach terminal reported that `semantic-code.semantic-code-highlighter` installed successfully from the packaged VSIX.
- Opening the linked RealWorld `article.service.ts` activated the extension, displayed **Semantic: Agent map**, and rendered whole-line responsibility bands.
- The responsibility picker showed the mapped categories and line counts. Selecting **External I/O** activated the lens and its status-bar indicator.
- [GitHub Actions run 42276180328](https://github.com/umarf2212/semantic-code-highlighter/actions/runs/42276180328) passed the quality checks, VSIX packaging, fresh example preparation and verification of all 340 regions.

This browser smoke test covers installation, opening a prepared file, decoration rendering and lens selection. The broader desktop usability evidence, including screenshots, remains in the [real-repository UAT report](../uat/2026-11-05/README.md). Prepared classifications do not establish repository-wide coverage or independent semantic accuracy.
