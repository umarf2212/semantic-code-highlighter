# ADR 0001: Core-first semantic heatmap

Status: accepted

## Decision

Ship and evaluate the file-level responsibility background map before architecture dashboards or repository intelligence. Extract statement regions in addition to structural blocks. Provide a deterministic local classifier for immediate use and development, while keeping LLM classification behind an adapter.

## Consequences

- The extension demonstrates its main value without credentials or network access.
- Local labels are explicitly lower-fidelity and advisory.
- AST extraction and visual precedence are independently testable.
- Future classifiers can improve meaning without replacing the editor integration.

