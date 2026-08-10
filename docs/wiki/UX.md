# User Experience Decisions

## Primary flow

Open a supported file and run `Semantic Code: Analyze Current File` (or use the editor-title palette icon). The extension checks the source filter, extracts AST regions, uses an unchanged cached result when possible, otherwise classifies, and then paints the visible editors for that document.

Analysis is manual, cancellable, and progress-labelled. A compact status-bar message reports visible region and responsibility counts and marks cache hits. The command is safe to rerun.

## Visual behavior

- Whole-line tints use one low opacity, configurable from `0.04` to `0.25`.
- One line gets at most one responsibility color.
- Specific nested regions win over mixed parents.
- Low-confidence and unknown regions remain normal editor background.
- Hover shows a human label, qualitative confidence, short rationale, and region breadcrumb.
- Toggle is instant and never invokes a classifier.
- Any content edit clears the old map immediately; rerun is explicit.

## Failure behavior

Unsupported, protected, oversized, overly complex, or regionless files produce an actionable message and no decoration. Provider, key, network, and validation failures leave the editor unchanged. Cancellation is quiet apart from a short status message.

