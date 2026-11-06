# Region Model and Visual Precedence

Region model version: `3`

The TypeScript compiler AST determines ranges and hierarchy. Classification never invents line numbers.

Meaningful candidates include functions, methods, classes, data declarations, branches, loops, switch cases, try/catch/finally blocks, callbacks, imports, and executable statements. Plain brace blocks are not emitted on their own.

Offsets use half-open source ranges. Lines are zero-based and inclusive at both ends for convenient editor mapping. Region IDs are deterministic for unchanged source and encode type plus offsets.

## Why statements matter

Calls such as `await repository.find(...)`, calculations, and `return normalize(...)` often have no nested braces. Emitting statement candidates lets a single function contain visible validation, I/O, business, and transformation zones.

## Rendering invariant

AST ranges may overlap, but rendered background spans must not. The visualizer flattens classifications by line:

1. Use a validated model ownership choice for an ambiguous single line when present; otherwise prefer the deepest specific child.
2. Use a parent's responsibility only for lines not owned by a child.
3. Do not cover specific children with a grey mixed parent.
4. Coalesce adjacent lines with the same final responsibility.

Unknown and below-threshold child regions still own their structural lines but emit
no decoration. A classified parent cannot bleed through and make those uncertain
lines look known.

For local results (or results without model ownership), one-line inline callbacks are the narrow exception to structural shielding. When an
unknown callback, or an unknown descendant inside its one-line body, shares that
line with an evidenced one-line containing statement, the statement owns the
indivisible whole line, provided every callback crossed in a nested chain is also
unknown. A specifically classified below-threshold callback still shields the line,
as do callbacks against parent functions or other broad regions; multi-line
uncertain children remain uncolored.

Confidence below the configured threshold is not rendered. Above that threshold,
all categories use one fixed subtle opacity; qualitative confidence belongs on
hover so hue remains the primary visual vocabulary.

## Model ownership on indivisible lines

If at least two single-line AST regions occupy a line, the model can select which best expresses the whole line's purpose. Candidates must be deeper than every multi-line region on that line. A broad parent can therefore never use this mechanism to cover a multi-line child. Choices include inline statements/callbacks and same-line siblings; there is no hardcoded category priority. AST extraction itself is unchanged.

The selected owner's confidence still controls visibility, and its rationale and breadcrumb appear on hover. Selection of an unknown or below-threshold owner does not fall back to another color. The same decisions feed decorations, lenses, and the responsibility summary and are preserved in cached results. See [ADR 0005](adr/0005-model-semantic-line-ownership.md).
