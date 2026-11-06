# ADR 0006: Separate semantic reasoning from the extension's model transport

Status: accepted

## Context

A user with an existing coding-agent session should be able to ask that agent to understand a codebase and produce semantic mappings. Requiring a direct model API inside the extension unnecessarily couples reasoning, credentials, and rendering, and restricts context to the request payload.

## Decision

Make the agent artifact provider the default. Export reusable classification instructions, exact AST metadata, source hashes, and a JSON Schema through Prepare Agent Analysis and a development CLI. The user's coding agent reads the repository with its own tools and writes map.json. The extension validates and renders that artifact, without invoking models or accessing subscription credentials. Local heuristics and the existing opt-in OpenAI adapter remain available.

Agent artifact format v1 wraps schema v2 classifications in versioned per-file records. Its offline region limit is independent of the API cap. Version mismatches, stale source hashes, duplicate paths, omitted or fabricated region IDs, and invalid ownership choices reject loading. File loads bypass the classification cache; map changes invalidate visible analysis. The existing ontology and visual precedence are preserved.

## Consequences

- Model choice and repository investigation belong to the user's coding-agent session.
- Setup requires agent-authored output; absence of a map never silently calls an API or falls back to heuristics.
- Artifact rationales are user-owned repository data, distinct from privacy-sanitized extension cache entries.
- Cross-file semantic freshness is the agent's responsibility; per-file hashes prove source identity, not dependency-aware validity.
- Preparation and import remain bounded, with source exclusions, regular-file checks, and explicit size/region/file limits.
