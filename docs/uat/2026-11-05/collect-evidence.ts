import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import ts from 'typescript';
import { TypeScriptRegionExtractor } from '../../../src/analysis/region-extractor';
import { LocalHeuristicClassifier } from '../../../src/analysis/local-classifier';
import { DefaultSourceFilter } from '../../../src/analysis/source-filter';
import { prepareAgentAnalysis, classifyFromAgentMap } from '../../../src/analysis/agent-map';
import { buildResponsibilitySpans } from '../../../src/visualization/line-map';

const output = path.resolve('docs/uat/2026-11-05');
const repos = [
  { name: 'hackathon-starter', file: 'controllers/contact.js' },
  { name: 'realworld', file: 'src/app/routes/article/article.service.ts' },
  { name: 'express', file: 'lib/utils.js' },
  { name: 'nodebb', file: 'src/posts/create.js' }
];
const extractor = new TypeScriptRegionExtractor();
const classifier = new LocalHeuristicClassifier();
const filter = new DefaultSourceFilter(256 * 1024);
const reports = [];
for (const repo of repos) {
  const root = path.resolve('.qa/uat/repos', repo.name);
  const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const remote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const all = ts.sys.readDirectory(root, ['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs', '.mts', '.cts'],
    ['**/node_modules/**', '**/.git/**', '**/.semantic-code/**', '**/dist/**', '**/build/**', '**/coverage/**']).sort();
  let excluded = 0;
  let overRegions = 0;
  let noRegions = 0;
  const files = [];
  for (const file of all) {
    const sourceCode = await readFile(file, 'utf8');
    if (!filter.evaluate(file, sourceCode).allowed) { excluded++; continue; }
    const regions = extractor.extract(file, sourceCode);
    if (regions.length === 0) { noRegions++; continue; }
    if (regions.length > 220) { overRegions++; continue; }
    const request = { filePath: path.relative(root, file), sourceCode, regions,
      projectContext: { workspaceRoot: root, language: file.endsWith('.ts') ? 'typescript' : 'javascript' } };
    const started = performance.now();
    const local = await classifier.classify(request);
    const spans = buildResponsibilitySpans(regions, local, 0.5);
    files.push({ file: request.filePath, regions: regions.length,
      elapsedMs: +(performance.now() - started).toFixed(3),
      coloredLines: spans.reduce((sum, span) => sum + span.endLine - span.startLine + 1, 0),
      categories: [...new Set(spans.map(span => span.responsibility))] });
  }
  const selectedSource = await readFile(path.join(root, repo.file), 'utf8');
  const selectedRegions = extractor.extract(repo.file, selectedSource);
  const request = { filePath: repo.file, sourceCode: selectedSource, regions: selectedRegions,
    projectContext: { workspaceRoot: root, language: repo.file.endsWith('.ts') ? 'typescript' : 'javascript' } };
  const local = await classifier.classify(request);
  const regionView = selectedRegions.map(region => ({ id: region.id, type: region.type, name: region.name,
    parentId: region.parentId, start: region.startLine + 1, end: region.endLine + 1,
    source: region.source.split('\n')[0],
    local: local.regions.find(item => item.regionId === region.id)?.responsibility }));
  await mkdir(path.join(output, 'evidence'), { recursive: true });
  await writeFile(path.join(output, 'evidence', `${repo.name}-regions.json`), JSON.stringify(regionView, null, 2) + '\n');
  const prepared = await prepareAgentAnalysis(root, [path.join(root, repo.file)]);
  let agent;
  try {
    const map = JSON.parse(await readFile(path.join(root, '.semantic-code/map.json'), 'utf8'));
    const result = classifyFromAgentMap(map, request);
    const spans = buildResponsibilitySpans(selectedRegions, result, 0.5);
    agent = { valid: true, categories: [...new Set(spans.map(span => span.responsibility))],
      spans: spans.map(span => ({ ...span, startLine: span.startLine + 1, endLine: span.endLine + 1 })) };
  } catch (error) { agent = { valid: false, message: String(error) }; }
  reports.push({ ...repo, remote, commit, discovered: all.length, excluded, noRegions, overRegions,
    analyzed: files.length, selectedRegions: selectedRegions.length, prepared, files, agent });
  console.log(`${repo.name}: ${all.length} discovered; ${files.length} locally analyzed; ${overRegions} over default region limit; selected ${selectedRegions.length} regions`);
}
await writeFile(path.join(output, 'evidence', 'repository-results.json'), JSON.stringify({
  collectedAt: new Date().toISOString(), minimumConfidence: 0.5, opacity: 0.12, defaultRegionLimit: 220,
  note: 'Local timings cover classification and line ownership, exclude parsing, UI rendering and cache. Coverage is not semantic accuracy. Agent maps are authored by the same agent conducting this UAT.',
  reports
}, null, 2) + '\n');
