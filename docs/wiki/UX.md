# User Experience Decisions

## Primary flow

The default agent workflow starts with `Semantic Code: Prepare Agent Analysis`. Ask a coding agent to follow the generated `.semantic-code/SPEC.md` and write `map.json`. Then open a supported file and run `Semantic Code: Analyze Current File` (or use the editor-title palette icon). The extension checks the source filter, extracts AST regions, uses an unchanged cached result when possible, otherwise classifies, and then paints the visible editors for that document.

Analysis is manual, cancellable, and progress-labelled. A compact status-bar message reports visible region and responsibility counts and marks cache hits. The command is safe to rerun.

`semanticCode.analyzeOnOpen` is an opt-in convenience for the active saved file and
saved revisions. It waits briefly to avoid editor churn, never analyzes dirty or
non-file documents, and reuses the normal filters/cache. OpenAI automatic analysis
requires a prior manual disclosure acceptance; otherwise it stays dormant.

## Visual behavior

- Whole-line tints use one low opacity, configurable from `0.04` to `0.25`.
- One line gets at most one responsibility color.
- Specific nested regions win over mixed parents.
- Low-confidence and unknown regions remain normal editor background.
- Hover shows a human label, qualitative confidence, short rationale, and region breadcrumb. A cached OpenAI result omits the prior model rationale because source-derived explanations are not persisted.
- Toggle is instant and never invokes a classifier.
- The responsibility lens can show one category at a time without re-analysis;
  it lists only categories present in the active file, remains scoped to that file,
  and has a persistent status-bar indicator. Choosing “Show all” restores the map.
- The on-demand responsibility summary reports disjoint colored-line percentages;
  selecting a category focuses its lens and jumps to its first region.
- Any content edit clears the old map immediately. Manual mode waits for an explicit
  rerun; opt-in analyze-on-open may refresh after the file is saved.

## Failure behavior

Unsupported, protected, oversized, overly complex, or regionless files produce an actionable message and no decoration. Provider, key, network, and validation failures leave the editor unchanged. Cancellation is quiet apart from a short status message.

An analyzed active file has a persistent status-bar item naming the actual provider
(`Agent map`, `Local`, or `OpenAI · model`) and whether the map is hidden. Changing provider or
model clears the old map; an in-flight older generation cannot overwrite newer,
cleared, or edited state.

Agent maps are read directly on each analysis and are not persisted to the extension cache. Map-file creation, changes, or deletion invalidate displayed maps; opt-in automatic analysis can reload the active saved file. Missing, invalid, or stale maps give an actionable regeneration message and never silently fall back to heuristics or an API call.
