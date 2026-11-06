import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.length === 3 && process.argv[2] === "--check";
if (process.argv.length > 2 && !checkOnly) throw new Error("Usage: node scripts/install-codespaces-extension.mjs [--check]");
if (!checkOnly && process.env.CODESPACES !== "true") {
  throw new Error("Automatic installation is restricted to Codespaces. Use --check for a local preflight.");
}
const manifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const id = `${manifest.publisher}.${manifest.name}`;
const artifact = path.join(root, "artifacts/semantic-code-highlighter.vsix");
const digest = createHash("sha256").update(await readFile(artifact)).digest("hex");
let cli;
let version;
for (const candidate of ["code", "code-insiders"]) {
  try {
    const output = execFileSync(candidate, ["--version"], { encoding: "utf8", timeout: 30_000 });
    const match = output.match(/^(\d+)\.(\d+)\.(\d+)/m);
    if (!match || Number(match[1]) !== 1 || Number(match[2]) < 125) {
      throw new Error(`VS Code ${match?.[0] ?? "unknown"} does not meet ${manifest.engines.vscode}.`);
    }
    cli = candidate;
    version = match[0];
    break;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
if (!cli) throw new Error("VS Code remote CLI is unavailable. Reattach the Codespace and rerun this script.");
if (checkOnly) {
  console.log(`Preflight passed: ${id}@${manifest.version}; VS Code ${version}; packaged VSIX available. No extension was installed.`);
} else {
  const stamp = path.join(root, ".qa/codespaces/installed-extension.json");
  let installed;
  try { installed = JSON.parse(await readFile(stamp, "utf8")); } catch { /* First attachment. */ }
  const extensions = execFileSync(cli, ["--list-extensions"], { encoding: "utf8", timeout: 30_000 }).split(/\r?\n/);
  if (installed?.digest !== digest || !extensions.includes(id)) {
    execFileSync(cli, ["--install-extension", artifact, "--force"], { stdio: "inherit", timeout: 120_000 });
    await mkdir(path.dirname(stamp), { recursive: true });
    await writeFile(stamp, JSON.stringify({ id, version: manifest.version, digest, vscode: version }, null, 2) + "\n");
    console.log("Showcase extension installed. Open a linked example in demo/README.md; reload the window once if needed.");
  } else {
    console.log("The current showcase extension is already installed.");
  }
}
