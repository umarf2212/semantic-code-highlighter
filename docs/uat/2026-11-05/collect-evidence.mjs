// Run from the extension repository root after cloning the repositories listed in README.md.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

await mkdir('.qa/uat', { recursive: true });
await build({
  entryPoints: ['docs/uat/2026-11-05/collect-evidence.ts'],
  outfile: '.qa/uat/collect-evidence.mjs',
  bundle: true, platform: 'node', format: 'esm', packages: 'external'
});
await import(pathToFileURL(resolve('.qa/uat/collect-evidence.mjs')).href);
