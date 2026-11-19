import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static frontend build. The archive proxy lives in `api/` and is deployed
// separately as a serverless function; it is not part of this bundle.
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
