# wayback-mcp

A small local Model Context Protocol (MCP) server over stdio that exposes three
Internet Archive Wayback Machine lookup tools. It was built to deepen Kiro's
role in the Seance project: Kiro can call these tools while building and
demoing the app instead of hand-running archive queries.

The archive logic reuses Seance's own code so the behaviour matches the app:

- CDX parsing and archive-URL building from `src/core`.
- The timeout, retry, and rate-limit helper from `api/http.ts`.
- Flash detection from `src/dom/flash.ts`.

All archive traffic goes to `web.archive.org` only, and nothing is persisted
(consistent with Seance's R9.1/R9.5).

## Tools

- `cdx_search(url, from?, to?, limit?, onlyWorking?, collapseDaily?)` — captures
  of a URL from the CDX index. By default keeps only HTTP 200 captures and
  collapses to one per calendar day.
- `check_capture(url, timestamp)` — the archived status of one capture (exact
  timestamp, else the closest by time).
- `find_swf(url, year?)` — the archived `.swf` files a capture references. Picks
  the most recent working capture (within `year` when given), fetches that
  page, and scans it for Flash embeds, objects, params, and links. Two archive
  requests per call.

## Install and run

```bash
cd tools/wayback-mcp
npm install        # installs the MCP SDK, zod, and tsx locally (no global install)
npm run start      # starts the server on stdio
npm run typecheck
```

Registered for Kiro in `.kiro/settings/mcp.json`. The tool logic
(`src/wayback.ts`) is covered by offline tests with a mocked fetch under the
project's root vitest suite (`tests/tools/wayback.test.ts`); no test touches the
live archive.

## Registering with Kiro

The server is listed in the `seance` agent config
(`.kiro/agents/seance.json`, under `mcpServers`). For a workspace-wide
registration, copy `tools/wayback-mcp/mcp.json` to `.kiro/settings/mcp.json`:

```bash
cp tools/wayback-mcp/mcp.json .kiro/settings/mcp.json
```

(The template lives here because `.kiro/settings/` is write-protected in this
workspace's agent sandbox; the content is identical.) It launches the server
with the tool's own local `tsx`:

```json
{
  "mcpServers": {
    "wayback": {
      "command": "npm",
      "args": ["--prefix", "tools/wayback-mcp", "run", "start"],
      "env": {},
      "disabled": false,
      "autoApprove": ["cdx_search", "check_capture", "find_swf"]
    }
  }
}
```

