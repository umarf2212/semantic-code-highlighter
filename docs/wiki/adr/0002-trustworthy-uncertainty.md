# ADR 0002: Trustworthy uncertainty and visible state

Status: accepted

## Decision

The local classifier only colors business logic when naming, path, or calculation evidence exists. Generic statements remain unknown. Unknown and low-confidence child ranges structurally shield their lines from parent colors.

Provider and lens state are persistent in the status bar. Lenses are file-scoped and list only present categories. Provider/model changes, edits, clears, and newer analysis generations invalidate older visible state.

## Consequences

- The zero-credential map may contain intentional uncolored gaps instead of a reassuring but misleading green wash.
- Users can always tell when a map is filtered, hidden, local, or cloud-classified.
- Results use content hashes across document close/reopen instead of transient editor versions.
