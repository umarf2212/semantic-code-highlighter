# ADR 0003: Preserve evidenced one-line statements around unknown callbacks

Status: accepted

## Context

The renderer uses whole-line bands while the AST can describe sub-line regions. A callback such as `items.map(item => item.id)` is deeper than its containing return or variable statement, yet both occupy one indivisible editor line. Treating an unknown callback as the sole structural owner erased an otherwise well-evidenced transformation or platform-registration statement.

At the same time, allowing every classified ancestor to backfill uncertain children would make unknown multi-line regions look known and would weaken the trust contract established in ADR 0002.

## Decision

An unknown callback, or an unknown descendant within its one-line body, may yield ownership to its containing statement only when callback and statement occupy exactly one line, every callback crossed in a nested chain is unknown, the statement is renderable, and it is a real AST ancestor. A callback or descendant assigned a specific responsibility below the confidence threshold continues to shield the line. Unknown callbacks without an evidenced one-line statement, and all uncertain multi-line children, also continue to shield ancestor colors.

## Consequences

- Common inline registrations and mapping expressions retain a useful whole-line band.
- The exception is narrow, deterministic, and testable from AST hierarchy.
- The region-model version is incremented so cached maps cannot preserve the old ownership result.
- Sub-line responsibility visualization remains deferred; if introduced later, it requires a new visual contract.
