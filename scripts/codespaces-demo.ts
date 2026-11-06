import { prepareDemoWorkspace, verifyDemoWorkspace } from "./demo-workspace";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--verify")) {
  console.error("Usage: npm run demo:prepare | npm run demo:verify");
  process.exitCode = 1;
} else {
  const action = args[0] === "--verify" ? verifyDemoWorkspace : prepareDemoWorkspace;
  action(process.cwd()).catch((error: unknown) => {
    console.error(`Demo setup failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
