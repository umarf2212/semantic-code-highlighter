# Workspace Analysis

Workspace analysis is an explicit batch convenience, not a daemon.

`Semantic Code: Analyze Workspace` discovers supported JavaScript/TypeScript files while excluding dependencies, build output, generated folders, and the remaining per-file privacy filters. It caps discovery at `semanticCode.maxWorkspaceFiles` (default 50), shows the exact bounded scope, provider, cache behavior, and cloud-usage warning in a modal confirmation, then begins only after approval.

Local classification defaults to two concurrent files and is configurable up to four. OpenAI classification is always sequential to reduce rate and cost surprises. The operation reports the current file, is cancellable, reuses unchanged cache entries, counts skipped files, and keeps successful classifications available when those files are later opened.

There is no background watcher and no automatic workspace scan.

