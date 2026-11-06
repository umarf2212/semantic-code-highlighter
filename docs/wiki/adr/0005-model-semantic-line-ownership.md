# ADR 0005: Let the model choose the dominant responsibility of an indivisible line

Status: accepted

## Context

AST depth is a structural fact, not evidence of semantic importance. A parsing callback can hide the infrastructure registration that contains it on one whole line. Folder and helper names also become unreliable when responsibilities are scattered. The previous model prompt supplied an ontology but little guidance on these decisions.

## Decision

Use prompt v2 to ask for whole-file understanding, same-file implementation tracing, explicit category distinctions, one dominant purpose, evidence-based confidence, and abstention for opaque operations. Keep ontology v1 and the existing bounded source collection.

Schema v2 adds required `lineOwners`, choosing exactly one existing AST candidate for each supplied ambiguous single line. Candidates are single-line regions deeper than every multi-line region on that line. Validate completeness, uniqueness, and candidate membership before displaying any result. The existing one-repair limit applies.

Region model v3 uses that choice before its deterministic fallback. The chosen owner's confidence and unknown state are authoritative, even if another candidate could be colored. Multi-line ownership is unchanged. ADR 0003 remains the fallback for the local provider and results without model choices.

Cache keys include the schema version as well as prompt and region versions. Persistence retains only structural ownership IDs/lines in addition to the existing privacy-safe classifications.

## Consequences

- The model chooses the primary interpretation where AST depth alone is insufficient.
- No sub-line decoration, free-form ranges, additional repository collection, or extra classification pass is needed.
- The larger prompt and ownership output add tokens; model selection remains configurable and network use remains opt-in.
- Deterministic tests verify protocol and rendering. A synthetic tangled-code evaluation measures selected visible lines across path/name variations; it cannot establish real-repository or live-model accuracy on its own.
