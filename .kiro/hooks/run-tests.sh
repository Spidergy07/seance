#!/usr/bin/env bash
# Seance test-on-change guard.
#
# Wired to the agent's postToolUse hook with a "write" matcher (see
# .kiro/agents/seance.json). It runs the vitest suite after a file-writing tool
# touches a TypeScript source or test file, so the rewriter invariants and the
# rest of the core logic are checked as the code changes.
#
# It reads the hook event JSON from stdin, so it can see which paths changed.
#
# Design choices:
#   - Stays silent and exits 0 during the planning phase (no package.json yet),
#     so it never nags before the build starts.
#   - Only runs tests when a changed path is a .ts/.tsx file under src/, api/,
#     or tests/. Doc/config edits do not trigger a run.
#   - One-shot `vitest run` (never watch mode), so it cannot become a
#     long-running process.
#   - Uses the local vitest via the "test" script / npx; no global install.

set -euo pipefail

# --- read the hook event (JSON on stdin) -----------------------------------
EVENT="$(cat || true)"

# Work from the project root (the hook runs with cwd = project dir).
ROOT="${KIRO_PROJECT_DIR:-$PWD}"
cd "$ROOT"

# --- planning-phase no-op ---------------------------------------------------
if [ ! -f "package.json" ]; then
  # No toolchain yet. Nothing to test.
  exit 0
fi

# --- decide whether a source/test file changed ------------------------------
# Pull path-like tokens out of the event JSON and keep the ones that look like
# TypeScript sources or tests in the directories we care about.
CHANGED="$(printf '%s' "$EVENT" \
  | grep -oE '[A-Za-z0-9_./-]+\.(ts|tsx)' \
  | grep -E '(^|/)(src|api|tests)/' \
  || true)"

if [ -z "$CHANGED" ]; then
  # The write did not touch a watched TypeScript file.
  exit 0
fi

echo "Seance: source change detected, running tests for:" >&2
printf '  %s\n' $CHANGED >&2

# --- run the suite (one-shot) ----------------------------------------------
# Prefer the package "test" script; fall back to npx vitest run.
if npm run | grep -qE '^\s*test\s'; then
  npm test --silent -- run
else
  npx --no-install vitest run
fi
