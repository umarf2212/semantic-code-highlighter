import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  AGENT_MAP_HEADER,
  AgentMapClassifier,
  agentMapSchema,
  classifyFromAgentMap,
  prepareAgentAnalysis
} from "../src/analysis/agent-map";
import { evaluateCloudSourceBoundary } from "../src/analysis/cloud-source-boundary";
import { TypeScriptRegionExtractor } from "../src/analysis/region-extractor";
import type { ClassificationRequest } from "../src/domain/classification";

const execute = promisify(execFile);
const relativePath = z.string().min(1).refine((value) =>
  !value.includes("\\") && !value.includes(":") && !value.startsWith("/") &&
  value.split("/").every((part) => part && part !== "." && part !== ".."),
"Use a normalized relative path.");

export const demoManifestSchema = z.object({
  formatVersion: z.literal(1),
  repositories: z.array(z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    url: z.string().regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git$/),
    commit: z.string().regex(/^[a-f0-9]{40}$/),
    file: relativePath,
    map: relativePath
  }).strict()).min(1).max(10)
}).strict().refine((value) => new Set(value.repositories.map((repo) => repo.id)).size === value.repositories.length,
  "Repository IDs must be unique.");

export type DemoManifest = z.infer<typeof demoManifestSchema>;

export async function readDemoManifest(root: string): Promise<DemoManifest> {
  return demoManifestSchema.parse(JSON.parse(await readFile(path.join(root, "demo/repositories.json"), "utf8")));
}

async function git(directory: string, ...args: string[]): Promise<string> {
  const { stdout } = await execute("git", ["-C", directory, ...args], {
    timeout: 180_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" }
  });
  return stdout.trim();
}

async function regularDirectory(directory: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Use a real directory: ${directory}`);
}

async function prepareRepository(root: string, repo: DemoManifest["repositories"][number]): Promise<void> {
  const directory = path.join(root, "demo/examples", repo.id);
  try { await lstat(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(directory);
    await git(directory, "init", "--quiet");
    await git(directory, "remote", "add", "origin", repo.url);
  }
  await regularDirectory(directory);
  await regularDirectory(path.join(directory, ".git"));
  const remote = await git(directory, "remote", "get-url", "origin");
  if (remote !== repo.url) throw new Error(`${repo.id}: unexpected origin; existing checkout was preserved.`);
  let commit: string | undefined;
  try { commit = await git(directory, "rev-parse", "--verify", "HEAD"); } catch { /* An interrupted first fetch can be retried. */ }
  if (!commit) {
    if (await git(directory, "status", "--porcelain")) throw new Error(`${repo.id}: uncommitted files prevent initial checkout.`);
    console.log(`Downloading ${repo.id} at ${repo.commit.slice(0, 12)}…`);
    await git(directory, "fetch", "--depth", "1", "origin", repo.commit);
    await git(directory, "-c", "advice.detachedHead=false", "checkout", "--detach", "--quiet", "FETCH_HEAD");
    commit = await git(directory, "rev-parse", "HEAD");
  }
  if (commit !== repo.commit) throw new Error(`${repo.id}: checkout does not match the pinned commit; it was preserved.`);
  console.log(`Ready: ${repo.id}@${commit.slice(0, 12)}`);
}

async function requestFor(root: string, repo: DemoManifest["repositories"][number]): Promise<ClassificationRequest> {
  const workspaceRoot = path.join(root, "demo");
  const filePath = `examples/${repo.id}/${repo.file}`;
  const absolutePath = path.join(workspaceRoot, filePath);
  if (!(await evaluateCloudSourceBoundary(absolutePath, workspaceRoot)).allowed) {
    throw new Error(`${repo.id}: sample must be a regular file inside the demo workspace.`);
  }
  const sourceCode = await readFile(absolutePath, "utf8");
  return {
    filePath, sourceCode,
    regions: new TypeScriptRegionExtractor().extract(filePath, sourceCode),
    projectContext: { workspaceRoot, language: /\.[cm]?tsx?$/.test(repo.file) ? "typescript" : "javascript" }
  };
}

export async function prepareDemoWorkspace(root: string): Promise<void> {
  const manifest = await readDemoManifest(root);
  const examples = path.join(root, "demo/examples");
  await mkdir(examples, { recursive: true });
  await regularDirectory(path.join(root, "demo"));
  await regularDirectory(examples);
  for (const repo of manifest.repositories) await prepareRepository(root, repo);
  const files = [];
  const requests: ClassificationRequest[] = [];
  for (const repo of manifest.repositories) {
    const archive = agentMapSchema.parse(JSON.parse(await readFile(path.join(root, repo.map), "utf8")));
    const entry = archive.files.find((file) => file.filePath === repo.file);
    if (!entry) throw new Error(`${repo.id}: archived map does not contain ${repo.file}.`);
    const request = await requestFor(root, repo);
    requests.push(request);
    files.push({ ...entry, filePath: request.filePath });
  }
  const map = { ...AGENT_MAP_HEADER, files };
  // Validate every file before replacing the generated showcase map.
  for (const request of requests) classifyFromAgentMap(map, request);
  const prepared = await prepareAgentAnalysis(path.join(root, "demo"), requests.map((request) => path.join(root, "demo", request.filePath)));
  if (prepared.fileCount !== requests.length) throw new Error("Some showcase files were excluded; the previous map was preserved.");
  const temporaryMap = path.join(root, "demo/.semantic-code", `.map-${randomUUID()}.tmp`);
  await writeFile(temporaryMap, JSON.stringify(map, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  try { await rename(temporaryMap, path.join(root, "demo/.semantic-code/map.json")); }
  finally { await unlink(temporaryMap).catch(() => undefined); }
  await verifyDemoWorkspace(root);
}

export async function verifyDemoWorkspace(root: string) {
  const manifest = await readDemoManifest(root);
  const classifier = new AgentMapClassifier(path.join(root, "demo"));
  const files = [];
  for (const repo of manifest.repositories) {
    const directory = path.join(root, "demo/examples", repo.id);
    await regularDirectory(directory);
    await regularDirectory(path.join(directory, ".git"));
    if (await git(directory, "rev-parse", "HEAD") !== repo.commit) throw new Error(`${repo.id}: pinned commit changed.`);
    const result = await classifier.classify(await requestFor(root, repo));
    files.push({ repository: repo.id, filePath: result.filePath, regions: result.regions.length });
  }
  const summary = { files, fileCount: files.length, regionCount: files.reduce((sum, file) => sum + file.regions, 0) };
  console.log(`Verified ${summary.fileCount} showcase maps; ${summary.regionCount} regions; no model calls.`);
  return summary;
}
