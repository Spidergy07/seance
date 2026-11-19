// A small Model Context Protocol server over stdio that exposes three Wayback
// Machine tools, so Kiro (or any MCP client) can look up captures while
// building and demoing Seance. The archive logic lives in `wayback.ts` and is
// reused from Seance's own `src/core` and `api/http.ts`, so these tools treat
// the archive with the same timeout and rate-limit care the app does.
//
// Run it with the tool's local `tsx` (see package.json `start`); it is
// registered for Kiro in `.kiro/settings/mcp.json`. Nothing is persisted.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { cdxSearch, checkCapture, findSwf } from './wayback.js';
import type {
  CdxSearchParams,
  CheckCaptureParams,
  FindSwfParams,
} from './wayback.js';

/** Wrap a result object as MCP text content (pretty JSON). */
function asText(value: unknown): { content: Array<{ type: 'text'; text: string }> } {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

/** Wrap an error as MCP text content, flagged as an error. */
function asError(error: unknown): {
  content: Array<{ type: 'text'; text: string }>;
  isError: true;
} {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: message }], isError: true };
}

const server = new McpServer({
  name: 'wayback-mcp',
  version: '0.1.0',
});

server.tool(
  'cdx_search',
  'Search the Internet Archive Wayback CDX index for captures of a URL. ' +
    'Keeps only working (HTTP 200) captures and collapses them to one per day ' +
    'by default, so you get the distinct days the page was saved and working.',
  {
    url: z.string().describe('Absolute http(s) URL of the page to look up.'),
    from: z.string().optional().describe('Lower bound timestamp prefix, e.g. "1998".'),
    to: z.string().optional().describe('Upper bound timestamp prefix, e.g. "2008".'),
    limit: z.number().int().positive().optional().describe('Max rows (default 200).'),
    onlyWorking: z.boolean().optional().describe('Keep only HTTP 200 (default true).'),
    collapseDaily: z.boolean().optional().describe('One capture per day (default true).'),
  },
  async (args) => {
    try {
      return asText(await cdxSearch(args as CdxSearchParams));
    } catch (error) {
      return asError(error);
    }
  },
);

server.tool(
  'check_capture',
  'Report the archived status of one capture: the capture at the exact ' +
    'timestamp when it exists, otherwise the closest one by time.',
  {
    url: z.string().describe('Absolute http(s) URL.'),
    timestamp: z.string().describe('14-digit Wayback timestamp (YYYYMMDDhhmmss).'),
  },
  async (args) => {
    try {
      return asText(await checkCapture(args as CheckCaptureParams));
    } catch (error) {
      return asError(error);
    }
  },
);

server.tool(
  'find_swf',
  'List the archived .swf (Flash) files a capture of a URL references. Picks ' +
    'the most recent working capture (within a year when given), fetches that ' +
    'page, and scans it for Flash embeds, objects, params, and links.',
  {
    url: z.string().describe('Absolute http(s) URL of the page to scan.'),
    year: z.string().optional().describe('Four-digit year to look within, e.g. "2004".'),
  },
  async (args) => {
    try {
      return asText(await findSwf(args as FindSwfParams));
    } catch (error) {
      return asError(error);
    }
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // A line on stderr so a human sees the server came up; stdout is the MCP
  // channel and must carry only protocol messages.
  process.stderr.write('wayback-mcp server ready on stdio\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`wayback-mcp failed to start: ${String(error)}\n`);
  process.exitCode = 1;
});
