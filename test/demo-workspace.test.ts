import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { demoManifestSchema, prepareDemoWorkspace, verifyDemoWorkspace } from "../scripts/demo-workspace";
import { AGENT_MAP_HEADER, sourceHash } from "../src/analysis/agent-map";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";

const execute = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "semantic-codespaces-demo-"));
  roots.push(root);
  const checkout = path.join(root, "demo/examples/sample");
  const source = "export const SAMPLE_LIMIT = 12;\n";
  await mkdir(checkout, { recursive: true });
  await mkdir(path.join(root, "maps"));
  await writeFile(path.join(checkout, "sample.ts"), source);
  const git = (...args: string[]) => execute("git", ["-C", checkout, ...args]);
  await git("init", "--quiet");
  await git("remote", "add", "origin", "https://github.com/example/sample.git");
  await git("add", "sample.ts");
  await git("-c", "user.name=Demo Fixture", "-c", "user.email=demo@example.invalid", "commit", "--quiet", "-m", "fixture");
  const commit = (await git("rev-parse", "HEAD")).stdout.trim();
  const manifest = {
    formatVersion: 1,
    repositories: [{ id: "sample", url: "https://github.com/example/sample.git", commit,
      file: "sample.ts", map: "maps/sample.json" }]
  };
  await writeFile(path.join(root, "demo/repositories.json"), JSON.stringify(manifest));
  const regions = new TypeScriptRegionExtractor().extract("sample.ts", source);
  await writeFile(path.join(root, "maps/sample.json"), JSON.stringify({ ...AGENT_MAP_HEADER,
    files: [{ filePath: "sample.ts", sourceHash: sourceHash(source), classification: {
      regions: regions.map((region) => ({ regionId: region.id, responsibility: "data", confidence: 0.9,
        explanation: "Defines the sample constant." })), lineOwners: []
    } }]
  }));
  return { root, checkout, source, manifest };
}

describe("Codespaces showcase preparation", () => {
  it("loads archived maps under their actual workspace paths and can be rerun offline", async () => {
    const { root } = await fixture();
    await prepareDemoWorkspace(root);
    const first = await readFile(path.join(root, "demo/.semantic-code/map.json"), "utf8");
    await prepareDemoWorkspace(root);
    expect(await readFile(path.join(root, "demo/.semantic-code/map.json"), "utf8")).toBe(first);
    const summary = await verifyDemoWorkspace(root);
    expect(summary.files[0]?.filePath).toBe("examples/sample/sample.ts");
    expect(summary.regionCount).toBeGreaterThan(0);
  });

  it("preserves edits and the last valid map when a sample no longer matches its source hash", async () => {
    const { root, checkout, source } = await fixture();
    await prepareDemoWorkspace(root);
    const map = await readFile(path.join(root, "demo/.semantic-code/map.json"), "utf8");
    await writeFile(path.join(checkout, "sample.ts"), source + "// tester edit\n");
    await expect(prepareDemoWorkspace(root)).rejects.toThrow("stale");
    expect(await readFile(path.join(checkout, "sample.ts"), "utf8")).toContain("tester edit");
    expect(await readFile(path.join(root, "demo/.semantic-code/map.json"), "utf8")).toBe(map);
  });

  it("refuses a different pinned revision without checking it out over the current work", async () => {
    const { root, checkout, source, manifest } = await fixture();
    manifest.repositories[0]!.commit = "a".repeat(40);
    await writeFile(path.join(root, "demo/repositories.json"), JSON.stringify(manifest));
    await expect(prepareDemoWorkspace(root)).rejects.toThrow("checkout does not match");
    expect(await readFile(path.join(checkout, "sample.ts"), "utf8")).toBe(source);
  });

  it("rejects a sample symlink resolving outside the workspace", async () => {
    const { root, checkout, source } = await fixture();
    await writeFile(path.join(root, "outside.ts"), source);
    await rm(path.join(checkout, "sample.ts"));
    await symlink(path.join(root, "outside.ts"), path.join(checkout, "sample.ts"));
    await expect(prepareDemoWorkspace(root)).rejects.toThrow("regular file inside the demo workspace");
  });

  it("rejects path traversal and duplicate repository destinations", async () => {
    const { manifest } = await fixture();
    expect(demoManifestSchema.safeParse({ ...manifest,
      repositories: [{ ...manifest.repositories[0], file: "../outside.ts" }] }).success).toBe(false);
    expect(demoManifestSchema.safeParse({ ...manifest,
      repositories: [manifest.repositories[0], manifest.repositories[0]] }).success).toBe(false);
  });
});
