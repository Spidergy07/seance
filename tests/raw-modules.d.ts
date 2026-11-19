// Vite serves `?raw` imports as the file's text. Tests use this to load HTML
// fixtures as strings without a browser or Node fs typings.
declare module '*?raw' {
  const content: string;
  export default content;
}
