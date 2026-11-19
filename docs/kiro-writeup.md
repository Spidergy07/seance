# How Kiro was used to build Seance

This is a factual account for the Devpost "how Kiro was used" field. Every claim
here can be checked against the repository: the spec in `.kiro/specs/seance/`,
the steering docs in `.kiro/steering/`, the agent config in `.kiro/agents/`, the
build log in `docs/kiro-log.md`, and the git history.

## The Kiro surface

Seance was built with the Kiro CLI (`kiro-cli`), driven phase by phase through
non-interactive runs rather than one long open-ended chat. Each run was scoped
to one phase or one task from `tasks.md`, told to write the test first, run it,
implement, and commit. The git history reflects this: 64 commits, 59 of them
one per numbered task (task 1 through task 59, in order), the other 5 spec or
doc updates (`git log --oneline`). Working in small, scoped runs kept each
change reviewable and kept the test suite green between tasks.

## The custom agent

A custom agent, `seance` (`.kiro/agents/seance.json`), carried the project rules
into every run. Its prompt states the hard constraints: keep `src/core/` pure
(no DOM, no network, no React), route all archive traffic through the `api/`
proxy, keep archived HTML in a sandboxed iframe, use plain English with no hype
words, and never install globally or start long-running servers. It loads the
four steering docs and the three spec files as resources, so the same context
was present in every run without re-pasting it. Its tool and shell permissions
are allow-listed (for example `npm test`, `npm run *`, `node`), and destructive
commands (`git push`, `rm -rf`, global installs) are denied. Later it also
lists the local MCP server under `mcpServers`.

## The postToolUse test hook

The agent has a `postToolUse` hook matching the `write` tool. After any
file-writing tool runs, it calls `.kiro/hooks/run-tests.sh`. The script reads
the hook event JSON, and only runs the suite when a changed path is a `.ts`/
`.tsx` file under `src/`, `api/`, or `tests/`; doc and config edits do not
trigger it. It runs `vitest` once (never watch mode), so it cannot become a
long-running process, and it is a no-op before `package.json` exists.

What it did in practice: it ran the full suite on every source edit, which made
the test-driven loop visible. For each fix-round task the failing test was
written first, so the hook reported red immediately after that write, then green
after the implementation write. The build log records this per task (for
example task 27: "Wrote the test first (6 failing), then implemented"; task 45
here followed the same red-to-green order). The hook is why a broken edit was
caught at the moment it was made rather than later.

## Spec-driven development, and how it differed from vibe coding

The work was spec-first. `.kiro/specs/seance/` holds three files:

- `requirements.md`: user stories with EARS acceptance criteria, each with an ID
  (R1.1, R3.4, and so on).
- `design.md`: the architecture, the data flow, the link rewriter and its six
  invariants, the error-state table, and the traffic and time bounds.
- `tasks.md`: numbered build-order tasks. Each task cites the requirement IDs
  and design sections it satisfies, and lists its own "done" test.

Every task traces back to a requirement and a design section, and forward to a
test. That traceability is the main difference from vibe coding. Instead of
asking for a feature and accepting whatever came back, each run had a fixed
target (the task), a fixed contract (the cited requirements), and a fixed check
(the named test). When the running app failed in a browser, the fix was not an
ad-hoc patch: a new numbered task was added to `tasks.md`, often with a new
requirement (R2.6, R2.7, R3.9 through R3.14, R4.3, R4.6, R4.7, R5.5, R5.6,
R6.6, R6.7, R6.8, R8.7 through R8.10), the design doc was updated, a failing
test was written, and only then was the code changed. The fix rounds are
visible as Phases 6 through 13 in `tasks.md`, including the production fix
(task 56) where a Vercel deploy's logs showed the Edge runtime's `fetch` to the
archive failing, so the proxies were moved to the Node.js runtime under a new
task with its own tests. This kept late bug fixes to the same standard as the
first build instead of letting the codebase drift.

## Steering docs, and which mattered most

Four steering docs set the ground rules: `product.md` (scope), `tech.md`
(stack and the pure-core boundary), `structure.md` (the folder layout and
layering rules), and `voice.md` (the seance theme and the copy rules).

`structure.md` mattered most. Its rule that `src/core/` imports nothing from
`src/ui/`, `src/dom/`, or `src/archive/`, and performs no I/O, is what makes the
property tests meaningful: the rewriter, capture selection, and recovery math
are pure functions, so they can be tested exhaustively without a browser or a
network. Everything else followed from that boundary, including the injectable
dependencies that let the whole recovery pipeline run under `linkedom` in tests.
`voice.md` ran a close second, because it turned the spooky theme into a
checkable rule (every themed label is paired with a literal one, no hype words,
absolute dates), which a later copy-polish task (42) and a grep could verify.

## The MCP server

To deepen Kiro's role, the project includes a local Model Context Protocol
server in `tools/wayback-mcp/` (TypeScript, stdio, the official
`@modelcontextprotocol/sdk`, installed locally, no global install). It exposes
three tools over stdio:

- `cdx_search` (captures of a URL, status-200 filter, one per day),
- `check_capture` (the status of one capture), and
- `find_swf` (the archived `.swf` files a capture references).

The tool logic reuses Seance's own code: the CDX parsing and archive-URL
building from `src/core`, the timeout and retry helper from `api/http.ts`, and
the Flash detection from `src/dom/flash.ts`, so the server treats the archive
with the same rate-limit care the app does. It is registered for Kiro in the
`seance` agent config under `mcpServers`, with a workspace `mcp.json` template
at `tools/wayback-mcp/mcp.json`. The tool logic has nine offline tests with a
mocked fetch (`tests/tools/wayback.test.ts`); no test touches the live archive.

What it enabled: finding brand-safe demo URLs. Running the three tools against
the live archive (through `tools/wayback-mcp/scripts/demo-probe.ts`, which calls
the same functions the server exposes and counts every request) used 12 archive
requests to settle on two public-domain NASA education pages: `kids.msfc.nasa.gov`
(last working capture of the real site 12 April 2006, which the redirect-stub
rule in task 51 reports instead of a later 200 stub, with Flash in its
30 December 2005 capture whose `.swf` bytes the `/api/swf` proxy serves) and
`spacelink.nasa.gov` (last working capture 31 January 2005). The findings and
timestamps are in `docs/demo-urls.md`. The MCP server replaced hand-run archive
queries with a repeatable, typed interface.

## Property-based testing

The URL rewriter is the correctness-critical unit, so it has fast-check property
tests (`tests/core/url-rewriter.prop.test.ts`), run at 1000 cases each, for six
invariants from `design.md` section 4.3:

- I1 idempotence: rewriting an already-rewritten URL changes nothing.
- I2 confinement: every output starts with the archive prefix and its host is
  `web.archive.org`.
- I3 fragment preservation.
- I4 query preservation.
- I5 passthrough for non-resolvable schemes (`mailto:`, `data:`, and so on).
- I6 timestamp fidelity.

`tests/core/srcset-css.prop.test.ts` adds property tests that `srcset`
descriptors and CSS `url(...)` quoting survive rewriting, and the document-level
rewrite test asserts that after a full rewrite no element references a non-
archive host. Honest note: the build log records no instance of a property test
catching a surprise regression during the build; their value here is that they
lock the confinement and idempotence invariants, so any future change that let a
rewritten URL escape the archive, or that double-prefixed a URL, would fail the
suite. The confinement invariant (I2) is the one that most directly protects a
user, since it is what keeps the sandboxed restored page from reaching back out
to the live web.

## Kiro powers

The brief asked to try a power. `kiro-cli powers --help` shows the command has
only `install` and `uninstall` subcommands and no way to list or search the
catalog; `install` takes a catalog name or a local path. Logged in with a valid
session, several names relevant to this project were tried (`git`, `playwright`,
`vitest`, `typescript`, `mcp`, `browser`), and each returned "No power named
\"<name>\" in the catalog, and no directory at that path". So no power was
installed. Without a catalog listing in the CLI there was no way to discover a
power that fit, and none of the relevant guesses existed, so this is recorded
as "none fit".

## Numbers, for reference

- Spec: 3 files (requirements, design, tasks); 56 numbered tasks across 14
  phases (0 through 13). The three submission-cleanup tasks (57 through 59) are
  recorded in `docs/kiro-log.md` rather than `tasks.md`.
- Steering: 4 docs.
- Tests: 56 test files, 342 tests, all offline; 2 of them property-based
  (fast-check).
- MCP server: 3 tools, 9 offline tests, 12 live archive requests used for the
  demo hunt.
- Agent: 1 custom agent with 1 postToolUse test hook.
