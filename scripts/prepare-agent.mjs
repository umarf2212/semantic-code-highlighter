import { build } from "esbuild";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
await build({ entryPoints: ["scripts/prepare-agent.ts"], outfile: ".qa/prepare-agent.cjs", bundle: true, platform: "node", format: "cjs", packages: "external" });
await import(pathToFileURL(resolve(".qa/prepare-agent.cjs")).href);
