import { readFile } from "node:fs/promises";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { LocalHeuristicClassifier } from "../src/analysis/local-classifier";
import { AgentMapClassifier } from "../src/analysis/agent-map";
import path from "node:path";
import { OpenAIClassifier } from "../src/llm/openai-classifier";
import { buildResponsibilitySpans } from "../src/visualization/line-map";
import type { Responsibility } from "../src/domain/responsibility";
import type { CodeClassifier } from "../src/domain/classification";

type Expectation = { text: string; responsibility: Responsibility; reason: string };

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg, index) => index % 2 === 0 && !["--provider", "--model"].includes(arg)) || args.length % 2) {
    throw new Error("Usage: npm run eval:semantic -- --provider agent|local|openai [--model MODEL]");
  }
  const option = (name: string) => args[args.indexOf(name) + 1];
  const provider = args.includes("--provider") ? option("--provider") : "local";
  if (provider !== "agent" && provider !== "local" && provider !== "openai") throw new Error("Unknown provider.");
  let classifier: CodeClassifier = new LocalHeuristicClassifier();
  if (provider === "agent") classifier = new AgentMapClassifier(path.resolve("test/fixtures/tangled-workspace"));
  if (provider === "openai") {
    const model = args.includes("--model") ? option("--model") : undefined;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!model || !apiKey) throw new Error("OpenAI evaluation requires --model and OPENAI_API_KEY. Only the checked-in synthetic fixture is sent.");
    classifier = new OpenAIClassifier({ apiKey, model });
  }
  const source = await readFile("test/fixtures/tangled-workspace/utils.ts", "utf8");
  const expected = JSON.parse(await readFile("test/fixtures/tangled-workspace/expectations.json", "utf8")) as Expectation[];
  const variants = [
    { name: "misleading-utils-path", filePath: "utils.ts", rename: (s: string) => s },
    { name: "domain-path", filePath: "domain/checkout.ts", rename: (s: string) => s },
    { name: "neutral-names", filePath: "misc.ts", rename: (s: string) => s.replace(/\bformat\b/g, "stepA").replace(/\bhelper\b/g, "stepB") }
  ];
  const reports = [];
  for (const variant of provider === "agent" ? variants.slice(0, 1) : variants) {
    const sourceCode = variant.rename(source);
    const regions = new TypeScriptRegionExtractor().extract(variant.filePath, sourceCode);
    const result = await classifier.classify({
      filePath: variant.filePath, sourceCode, regions,
      projectContext: { workspaceRoot: "/synthetic-fixture", language: "typescript" }
    });
    const spans = buildResponsibilitySpans(regions, result, 0.5);
    const lines = sourceCode.split("\n");
    const cases = expected.map((item) => {
      const matches = lines.flatMap((line, index) => line.includes(variant.rename(item.text)) ? [index] : []);
      if (matches.length !== 1) throw new Error(`Expectation must match one line: ${item.text}`);
      const line = matches[0]!;
      const span = spans.find((span) => span.startLine <= line && span.endLine >= line);
      const actual = span?.responsibility ?? "unknown";
      return { line: line + 1, expected: item.responsibility, actual, correct: actual === item.responsibility, reason: item.reason };
    });
    const known = cases.filter((item) => item.expected !== "unknown");
    const rendered = cases.filter((item) => item.actual !== "unknown");
    reports.push({
      variant: variant.name,
      accuracy: cases.filter((item) => item.correct).length / cases.length,
      knownLineCoverage: known.filter((item) => item.actual !== "unknown").length / known.length,
      renderedPrecision: rendered.length ? rendered.filter((item) => item.correct).length / rendered.length : null,
      cases
    });
  }
  console.log(JSON.stringify({ classifier: `${classifier.id}:${classifier.version}`, minimumConfidence: 0.5, reports }, null, 2));
}

main().catch(() => {
  // Provider errors can carry request details; do not dump source or credentials.
  console.error("Semantic evaluation failed. Check arguments, fixture anchors, and (for OpenAI) credentials/model access. No report was completed.");
  process.exitCode = 1;
});
