import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { AGENT_MAP_HEADER, AgentMapClassifier, classifyFromAgentMap, prepareAgentAnalysis, sourceHash } from "../src/analysis/agent-map";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import { buildResponsibilitySpans } from "../src/visualization/line-map";

const sourceCode = 'const x = JSON.parse(raw);';
const regions = new TypeScriptRegionExtractor().extract("file.ts", sourceCode);
const request = { filePath: "file.ts", sourceCode, regions, projectContext: { workspaceRoot: "", language: "typescript" } };
const map = { ...AGENT_MAP_HEADER, files: [{ filePath: "file.ts", sourceHash: sourceHash(sourceCode), classification: {
  lineOwners: [], regions: regions.map((region) => ({ regionId: region.id, responsibility: "transformation", confidence: 0.9, explanation: "Parses a representation." }))
} }] };
const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "semantic-agent-")); roots.push(root);
  await writeFile(path.join(root, "file.ts"), sourceCode);
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("agent map workflow", () => {
  it("exports a spec and metadata, loads an independently authored map, and observes replacements", async () => {
    const root = await fixture();
    const exported = await prepareAgentAnalysis(root, [path.join(root, "file.ts")]);
    expect(exported.fileCount).toBe(1);
    const requests = JSON.parse(await readFile(path.join(exported.directory, "requests.json"), "utf8"));
    expect(requests.files[0].sourceHash).toBe(sourceHash(sourceCode));
    expect(requests.files[0]).not.toHaveProperty("sourceCode");
    const spec = await readFile(path.join(exported.directory, "SPEC.md"), "utf8");
    expect(spec).toContain("across the codebase");
    const schema = JSON.parse(await readFile(path.join(exported.directory, "map.schema.json"), "utf8"));
    expect(schema.required).toContain("files");
    const location = path.join(exported.directory, "map.json");
    await writeFile(location, JSON.stringify(map));
    const classifier = new AgentMapClassifier(root);
    const result = await classifier.classify(request);
    expect(buildResponsibilitySpans(regions, result, 0.5)[0]?.responsibility).toBe("transformation");
    await prepareAgentAnalysis(root, [path.join(root, "file.ts")]);
    expect(JSON.parse(await readFile(location, "utf8"))).toEqual(map);
    await writeFile(location, JSON.stringify({ ...map, files: [] }));
    await expect(classifier.classify(request)).rejects.toThrow("no entry");
  });

  it("rejects stale source, bad versions, duplicate paths, and incomplete region coverage", () => {
    expect(() => classifyFromAgentMap(map, { ...request, sourceCode: sourceCode + "\n" })).toThrow("stale");
    expect(() => classifyFromAgentMap({ ...map, promptVersion: "old" }, request)).toThrow("versions");
    expect(() => classifyFromAgentMap({ ...map, files: [...map.files, ...map.files] }, request)).toThrow("duplicate");
    expect(() => classifyFromAgentMap({ ...map, files: [{ ...map.files[0], classification: { regions: [], lineOwners: [] } }] }, request)).toThrow("omitted");
  });

  it("rejects path traversal and region IDs invented by an agent", () => {
    expect(() => classifyFromAgentMap({ ...map, files: [{ ...map.files[0], filePath: "../file.ts" }] }, request)).toThrow();
    const wrong = structuredClone(map);
    wrong.files[0]!.classification.regions[0]!.regionId = "invented";
    expect(() => classifyFromAgentMap(wrong, request)).toThrow("unknown region");
  });

  it("does not export filtered, external, or oversized sources", async () => {
    const root = await fixture();
    const outside = await fixture();
    await writeFile(path.join(root, "secrets.ts"), "const password = 1;");
    await writeFile(path.join(root, "large.ts"), "x".repeat(1000));
    const result = await prepareAgentAnalysis(root, [path.join(root, "file.ts"), path.join(root, "secrets.ts"), path.join(root, "large.ts"), path.join(outside, "file.ts")], { maximumFiles: 500, maximumBytes: 100, maximumRegions: 400 });
    expect(result).toMatchObject({ fileCount: 1, skipped: 3 });
  });

  it("rejects symlinked artifact directories and maps", async () => {
    const root = await fixture();
    const outside = await fixture();
    await symlink(outside, path.join(root, ".semantic-code"));
    await expect(prepareAgentAnalysis(root, [path.join(root, "file.ts")])).rejects.toThrow("real directory");
    await rm(path.join(root, ".semantic-code"));
    await mkdir(path.join(root, ".semantic-code"));
    await writeFile(path.join(outside, "map.json"), JSON.stringify(map));
    await symlink(path.join(outside, "map.json"), path.join(root, ".semantic-code", "map.json"));
    await expect(new AgentMapClassifier(root).classify(request)).rejects.toThrow("Cannot read");
  });

  it("accepts offline maps beyond the API's 400-region cap", () => {
    const sourceCode = Array.from({ length: 401 }, (_, index) => `const value${index} = ${index};`).join("\n");
    const regions = new TypeScriptRegionExtractor().extract("large.ts", sourceCode);
    const classification = { lineOwners: [], regions: regions.map((region) => ({
      regionId: region.id, responsibility: "data", confidence: 0.9, explanation: "Declares a constant."
    })) };
    const result = classifyFromAgentMap({ ...AGENT_MAP_HEADER, files: [{
      filePath: "large.ts", sourceHash: sourceHash(sourceCode), classification
    }] }, { ...request, filePath: "large.ts", sourceCode, regions });
    expect(result.regions).toHaveLength(401);
  });

  it("does not load a map after cancellation", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(new AgentMapClassifier("").classify({ ...request, signal: controller.signal })).rejects.toThrow();
  });
});
