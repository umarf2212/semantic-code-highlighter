# North Star and Non-goals

## One job

Help a developer scan an unfamiliar source file and quickly locate responsibility zones without making the code harder to read.

The core interaction is:

```text
open file → analyze → see subtle responsibility bands → inspect a hover if needed → toggle off instantly
```

The extension classifies responsibility, not syntax. It never edits source, inserts comments, replaces the theme, or presents model output as fact.

## Product invariants

- Background bands are whole-line, subtle, stable, and mutually exclusive.
- A specific child region wins over a broad parent on shared lines; the model may arbitrate between AST candidates occupying one indivisible line.
- Ordinary statements may be semantic regions; blocks alone cannot reveal I/O and transformations inside a function.
- Manual current-file analysis works before codebase-wide features are considered complete.
- The editor remains fully useful when classification fails or is disabled.
- Network analysis is explicit, filtered, disclosed, and cached.

## Non-goals for v0.1

- Architecture dashboards or dependency graphs
- Git, ownership, test-coverage, or runtime analysis
- Smell detection or refactoring advice
- Autonomous source modification
- Multi-language support beyond JavaScript and TypeScript families
- A project-wide knowledge graph

