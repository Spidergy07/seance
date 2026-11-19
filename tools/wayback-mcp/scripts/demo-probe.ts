// A thin CLI driver over the Wayback MCP server's own tool functions
// (cdx_search, find_swf, check_capture), used once to find brand-safe demo URLs
// for Seance (task 48). It wraps the real fetch with a counter so a run stays
// within the archive-request budget. This is the same logic the MCP server
// exposes; running it directly is how the tools were exercised against the live
// archive for the demo hunt. Results are recorded in docs/demo-urls.md.
//
//   npx tsx tools/wayback-mcp/scripts/demo-probe.ts search <url> [from] [to]
//   npx tsx tools/wayback-mcp/scripts/demo-probe.ts swf <url> [year]
//   npx tsx tools/wayback-mcp/scripts/demo-probe.ts check <url> <timestamp>

import { defaultHttpDeps, type HttpDeps } from '../../../api/http.js';
import {
  cdxSearch,
  findSwf,
  checkCapture,
  type WaybackDeps,
} from '../src/wayback.js';

let requests = 0;
const base = defaultHttpDeps();
const http: HttpDeps = {
  ...base,
  fetch: (input, init) => {
    requests += 1;
    process.stderr.write(`  [request ${requests}] ${String(input).slice(0, 110)}\n`);
    return base.fetch(input, init);
  },
};
const deps: WaybackDeps = { http };

async function main(): Promise<void> {
  const [command, url, a, b] = process.argv.slice(2);
  if (command === undefined || url === undefined) {
    process.stderr.write('usage: demo-probe <search|swf|check> <url> [..]\n');
    process.exitCode = 1;
    return;
  }

  let result: unknown;
  if (command === 'search') {
    const params: Parameters<typeof cdxSearch>[0] = { url };
    if (a !== undefined) params.from = a;
    if (b !== undefined) params.to = b;
    result = await cdxSearch(params, deps);
  } else if (command === 'swf') {
    const params: Parameters<typeof findSwf>[0] = { url };
    if (a !== undefined) params.year = a;
    result = await findSwf(params, deps);
  } else if (command === 'check') {
    if (a === undefined) {
      throw new Error('check needs a timestamp');
    }
    result = await checkCapture({ url, timestamp: a }, deps);
  } else {
    throw new Error(`unknown command: ${command}`);
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.stderr.write(`\n== archive requests this run: ${requests} ==\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.stderr.write(`archive requests this run: ${requests}\n`);
  process.exitCode = 1;
});
