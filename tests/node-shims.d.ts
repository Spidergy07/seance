// Minimal ambient types for the Node built-ins a couple of tests use to read
// source files from disk. The project sets `types: []` and does not depend on
// `@types/node`, so we declare just the one function we call. Runtime support
// comes from Node itself; this only satisfies `tsc`.
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
