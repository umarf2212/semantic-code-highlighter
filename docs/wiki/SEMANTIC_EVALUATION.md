# Semantic evaluation

## What this project does

This VS Code extension turns JavaScript/TypeScript AST regions into subtle, mutually exclusive whole-line responsibility bands. Extraction determines valid ranges; a local heuristic or opt-in OpenAI model assigns responsibility; validation, caching, and line ownership determine the visible map. Hovers explain decisions, while a lens and summary reuse the same map.

The local provider is a private demonstration baseline. Its path/name/regex evidence cannot reliably recover meaning from poorly organized code. The model receives the complete eligible file and bounded explicit project context, so it can follow same-file helpers even when their names and placement are misleading. It cannot inspect implementation bodies in other files under the current privacy boundary.

## Tangled fixture and rubric

`test/fixtures/tangled-workspace/utils.ts` is synthetic, intentionally mixing handler registration, parsing, validation, member pricing, serialization, deferred work, and file writes. Helpers appear after callers and have misleading names. `expectations.json` is an independent, reviewable rubric for 16 selected whole lines, with reasons; it is never sent to the model.

The benchmark repeats this code under a misleading utility path, a domain path, and neutral helper names. These are robustness probes of one fixture, not three independent repositories. Expectations are intentionally scoped to clear lines; they do not score every declaration, brace, broad parent, or possible responsibility.

Run:

```sh
npm run eval:semantic
# With OPENAI_API_KEY already set in the environment:
npm run eval:semantic -- --provider openai --model YOUR_MODEL
```

The CLI reports JSON with visible-line accuracy, known-line coverage, rendered precision, and individual mismatches. It uses the production extractor, classifier, validator, and renderer with minimum confidence 0.5. Uncolored lines count as unknown; abstention therefore lowers accuracy/coverage on known lines instead of artificially improving the score. Model explanations and credentials are never included in reports. Model runs use three requests, each with at most one semantic-validation repair. There is no implicit model default in the CLI; record model identity with any quality claim.

## Recorded local baseline

For local classifier v4, measured on 2026-09-06:

| Variant | Correct selected lines | Known-line coverage | Rendered precision |
| --- | --- | --- | --- |
| Misleading utility path | 9/16 (56.25%) | 100% | 56.25% |
| Domain path | 10/16 (62.5%) | 100% | 62.5% |
| Neutral helper names | 11/16 (68.75%) | 86.67% | 76.92% |

The baseline demonstrates both naming sensitivity and confidently wrong colors. It is not evidence that prompt v2 improves live-model accuracy. No live OpenAI comparison was run during this implementation because the session had no `OPENAI_API_KEY`. Provider tests use mocked responses. No Extension Development Host visual smoke test was performed for this change.

Before claiming a model quality improvement, run the same rubric with the intended model, inspect the disagreements, repeat for consistency, and expand to unfamiliar real application files with independently reviewed labels. Rubric changes must reflect a clarified interpretation, not accommodate a model's wrong answer.

## Product questions for a later iteration

The current implementation follows the user's preference for one model-selected best category and is concrete enough to proceed without a grilling session. The remaining choices are:

1. What latency and API cost per file are acceptable for better accuracy? The extension retains its existing configurable model default; changing the prompt does not make a small model a frontier model.
2. Should cloud analysis be allowed to fetch bounded imported implementation bodies? For now it uses the current file only, plus the previously disclosed project context.
3. Which real codebase and disputed lines should become the next independently reviewed evaluation set? The current synthetic fixture exercises specific failure modes but cannot establish general quality.

These are future scope decisions, not prerequisites for the shipped prompt and line-ownership changes.

## Agent-authored reference map

The tangled fixture includes `.semantic-code/SPEC.md`, exported metadata/schema, and a map authored by the coding agent in this development session. Run `npm run eval:semantic -- --provider agent` to exercise loading, source validation, and visible-line evaluation without an API key. This checks only the original fixture path, since the artifact is tied to its exact path and content. The authored reference matches all 16 selected rubric lines, but this is not a blind model-quality result: the author had access to the rubric. It demonstrates the provider-independent file workflow.
