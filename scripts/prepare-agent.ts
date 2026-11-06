import path from "node:path";
import ts from "typescript";
import { prepareAgentAnalysis } from "../src/analysis/agent-map";

const root = path.resolve(process.argv[2] ?? ".");
const files = ts.sys.readDirectory(root, [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"],
  ["**/node_modules/**", "**/.git/**", "**/.qa/**", "**/.semantic-code/**", "**/dist/**", "**/build/**", "**/coverage/**"]);
prepareAgentAnalysis(root, files).then((result) => {
  console.log(`Prepared ${result.fileCount} files in ${result.directory}; ${result.skipped} excluded or over limits. Ask your coding agent to follow SPEC.md and write map.json.`);
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Agent preparation failed.");
  process.exitCode = 1;
});
