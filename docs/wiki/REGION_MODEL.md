# Region Model and Visual Precedence

Region model version: `1`

The TypeScript compiler AST determines ranges and hierarchy. Classification never invents line numbers.

Meaningful candidates include functions, methods, classes, data declarations, branches, loops, switch cases, try/catch/finally blocks, callbacks, imports, and executable statements. Plain brace blocks are not emitted on their own.

Offsets use half-open source ranges. Lines are zero-based and inclusive at both ends for convenient editor mapping. Region IDs are deterministic for unchanged source and encode type plus offsets.

## Why statements matter

Calls such as `await repository.find(...)`, calculations, and `return normalize(...)` often have no nested braces. Emitting statement candidates lets a single function contain visible validation, I/O, business, and transformation zones.

## Rendering invariant

AST ranges may overlap, but rendered background spans must not. The visualizer flattens classifications by line:

1. Prefer the deepest specific child.
2. Use a parent's responsibility only for lines not owned by a child.
3. Do not cover specific children with a grey mixed parent.
4. Coalesce adjacent lines with the same final responsibility.

Unknown and below-threshold child regions still own their structural lines but emit
no decoration. A classified parent cannot bleed through and make those uncertain
lines look known.

Confidence below the configured threshold is not rendered. Above that threshold,
all categories use one fixed subtle opacity; qualitative confidence belongs on
hover so hue remains the primary visual vocabulary.
