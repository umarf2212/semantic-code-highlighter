# ADR 0004: Constrain cloud source and persisted model data

Status: accepted

## Context

OpenAI analysis can transmit eligible source and bounded project context. Lexical workspace paths are not a sufficient boundary because source or context files can be symlinked outside a workspace. Reading an entire context file before truncating it also defeats the intended size bound. Separately, a model-generated explanation can repeat source identifiers or literals even when the cache does not deliberately store source text.

## Decision

- OpenAI analysis accepts only a regular, non-symlink source file. A workspace source must also resolve inside the real workspace root. An explicitly opened loose regular file remains eligible and is represented by basename only.
- Package context and `.semantic-code.md` must be regular, non-symlink files that resolve inside the real workspace boundary. Reads are byte-bounded; oversized package manifests are ignored.
- OpenAI explanations are available in the live result but removed before persistence. The cache namespace is versioned to v2 and activation removes legacy v1 entries that could contain prior model rationales.
- Local deterministic explanations may remain cached because they are fixed extension strings, not generated from source.

## Consequences

- Workspace symlink tricks cannot silently expand cloud-analysis scope beyond the confirmed root.
- Bounded context remains bounded in memory as well as in the request payload.
- A cached OpenAI hover after restart has label, confidence, and breadcrumb but no prior model rationale.
- Users who intentionally work through source symlinks can still use the local provider; cloud analysis requires opening the regular target within its real boundary.
