# Workspace Analysis

Workspace analysis is an explicit batch convenience, not a daemon.

`Semantic Code: Analyze Workspace` first chooses exactly one folder in a multi-root workspace, then discovers supported JavaScript/TypeScript files only inside that root while excluding dependencies, build output, generated folders, and the remaining per-file privacy filters. It caps discovery at `semanticCode.maxWorkspaceFiles` (default 50), freezes the provider/model plan, shows the exact bounded scope, provider, cache behavior, and cloud-usage warning in a modal confirmation, then begins only after approval.

Local classification defaults to two concurrent files and is configurable up to four. OpenAI classification is always sequential to reduce rate and cost surprises. The operation reports the current file, is cancellable, reuses unchanged cache entries, counts filtered and failed files separately, and keeps bounded content-hash-validated results available when those files are later opened. One file failure does not falsely stop sibling work.

There is no automatic workspace scan. A watcher for `.semantic-code/map.json` invalidates visible maps when the artifact changes.

With the default agent provider, Analyze Workspace loads existing mappings rather than invoking a model. Prepare Agent Analysis exports metadata for a chosen root; it does not generate labels. A separate coding-agent session inspects the codebase and authors the map. Agent map loading shares the configured local concurrency and uses source validation rather than cached classifications.
