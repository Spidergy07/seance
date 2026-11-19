// Vite resolves a CSS import for its side effect (it injects the stylesheet).
// TypeScript needs a module declaration so `import './theme.css'` typechecks
// under `types: []`. The import has no runtime value in the type system.
declare module '*.css';
