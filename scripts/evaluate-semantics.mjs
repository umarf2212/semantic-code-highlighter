import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

await build({
  entryPoints: ["scripts/semantic-evaluation.ts"],
  outfile: ".qa/semantic-evaluation.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external"
});
await import(pathToFileURL(resolve(".qa/semantic-evaluation.cjs")).href);
