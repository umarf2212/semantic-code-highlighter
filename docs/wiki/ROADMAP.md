# Roadmap and Feature Gates

## MVP, in dependency order

1. Semantic domain and AST/statement region extraction
2. Non-overlapping background map with instant toggle
3. Provider-neutral classifier and one structured-output LLM adapter
4. Source filtering, privacy disclosure, secure credentials, and content cache
5. Current-file analysis UX, hover, progress, cancellation, and stale-result handling
6. Local Extension Development Host and representative-repository QA

## High-value follow-ups

1. Bounded, explicit workspace analysis
2. Opt-in analyze-on-open
3. Lightweight file responsibility statistics
4. Richer project context and alternate providers

The responsibility lens shipped immediately after the core map because it directly
supports navigation and requires no additional source transmission.

## Deferred until evidence justifies them

Architecture maps, dependency navigation, smells, Git awareness, test awareness, runtime traces, configurable ontologies, and additional languages. These require their own usability evidence and may not weaken the file-level map.
