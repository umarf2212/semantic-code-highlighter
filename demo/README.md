# Try Semantic Code Highlighter

Open one of the four examples below. Responsibility bands load automatically; no API key or model call is needed. If the extension has just been installed and colors do not appear, run **Developer: Reload Window** once, then reopen the example. If VS Code asks about workspace trust, review this repository and trust it to enable the extension.

These are real, pinned GitHub repositories with curated maps for **one file in each repository**. Other files are available to browse but do not have prepared agent maps. The maps were authored during our UAT and are advisory, not independent accuracy ground truth.

| Example | Open this file | Try this task |
| --- | --- | --- |
| **RealWorld** | [Article service](examples/realworld/src/app/routes/article/article.service.ts) | Find `createArticle`: distinguish required-field checks, slug conversion and database calls. |
| **NodeBB** | [Post creation](examples/nodebb/src/posts/create.js) | Distinguish identifier validation, the database counter and the policy controlling IP logging. |
| **Hackathon Starter** | [Contact controller](examples/hackathon-starter/controllers/contact.js) | Find the email-sending operation, including the helper call at line 108. |
| **Express** | [HTTP utilities](examples/express/lib/utils.js) | Find `compileQueryParser`: distinguish configuration from rejection of an unsupported setting. |

Use **Go to Line** (`Ctrl+G` in most browser clients) to jump to RealWorld line 180, NodeBB line 38, Hackathon Starter line 108, or Express line 171.

## Read the bands

| Color | Responsibility |
| --- | --- |
| Green | Business rules, policy and workflow |
| Amber | Validation and preconditions |
| Orange | External I/O, including databases and services |
| Magenta | Parsing, mapping and transformation |
| Purple | Infrastructure and configuration |
| Teal | Data representations |
| Blue | General utilities |

Uncolored code can mean uncertain responsibility. In NodeBB, the plugin filter calls at lines 60 and 82 are deliberately unknown because their implementations depend on installed plugins.

## Try the controls

1. Hover a band for a textual category, explanation and confidence.
2. Run **Semantic Code: Focus Responsibility Lens** and choose **External I/O**. Other categories disappear while the source stays readable. Choose **Show all responsibilities** to restore them.
3. Run **Semantic Code: Show Responsibility Summary** and choose a category to jump to its first region.
4. Click **Semantic: Agent map** in the status bar to hide or show the bands.
5. Add a space in a mapped file. The bands disappear immediately because the map no longer matches the source. Undo the edit and run **Semantic Code: Analyze Current File** to restore them.

To try immediate heuristics on other files, change `semanticCode.provider` to `local` in this workspace's settings. Return it to `agent` for the curated examples. The offline classifier has lower semantic accuracy; it is not a replacement for the prepared maps.

Do not use **Prepare Agent Analysis** to recreate the showcase: it exports new requests for an agent; it does not create classifications. **Analyze Workspace** will report missing map entries for files outside the four curated examples.

## Rebuild and verify the setup

The Codespaces creation hook prepares these files automatically. To check them again, run from this terminal:

```sh
npm --prefix .. run demo:verify
```

To prepare missing repositories or restore a missing generated map:

```sh
npm --prefix .. run demo:prepare
```

Preparation verifies pinned commits, exact source hashes, region IDs and line ownership. It preserves existing checkout edits and refuses mismatched source instead of resetting files. Undo or explicitly restore your own edits before retrying. Repository dependencies and application servers are not needed.

The startup map lives in this workspace's ignored `.semantic-code` directory. Downloaded repositories live in ignored `examples/`. To edit the extension implementation, use **File: Open Folder** and open the parent `semantic-code-highlighter` folder. Rebuild the VSIX there and rerun `node scripts/install-codespaces-extension.mjs` from a Codespaces terminal.

Stop the codespace from **Codespaces: Stop Codespace** when finished; closing a browser tab does not stop compute. The [recorded UAT](../docs/uat/2026-11-05/README.md) contains before/after screenshots and limitations.
