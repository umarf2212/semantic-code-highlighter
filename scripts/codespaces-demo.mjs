import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, ".qa/codespaces/demo.cjs");
await mkdir(path.dirname(output), { recursive: true });
await build({ entryPoints: [path.join(root, "scripts/codespaces-demo.ts")], outfile: output,
  bundle: true, platform: "node", format: "cjs", packages: "external" });
try { execFileSync(process.execPath, [output, ...process.argv.slice(2)], { cwd: root, stdio: "inherit" }); }
catch (error) { process.exitCode = error.status ?? 1; }
