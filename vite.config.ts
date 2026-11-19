import { defineConfig, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';
import type { ServerResponse } from 'node:http';

// Serve the archive proxies (`api/`) alongside the app during `vite dev`, so
// the whole thing works end to end on localhost without a separate process.
// In production the same `api/` functions deploy as serverless functions (see
// vercel.json); this middleware is dev-only. It loads the router through Vite's
// own module loader (`ssrLoadModule`), which resolves the TypeScript and the
// `.js` import extensions the source uses.
function apiDevServer(): Plugin {
  return {
    name: 'seance-api-dev',
    configureServer(server) {
      server.middlewares.use(
        async (
          req: Connect.IncomingMessage,
          res: ServerResponse,
          next: Connect.NextFunction,
        ) => {
          const path = req.url ?? '';
          if (!path.startsWith('/api/')) {
            next();
            return;
          }
          try {
            const module = await server.ssrLoadModule('/api/router.ts');
            const handleApiRequest = module.handleApiRequest as (
              request: Request,
            ) => Promise<Response | null>;

            const request = new Request(`http://localhost${path}`, {
              method: req.method ?? 'GET',
            });
            const response = await handleApiRequest(request);
            if (response === null) {
              next();
              return;
            }
            res.statusCode = response.status;
            response.headers.forEach((value, key) => res.setHeader(key, value));
            const body = Buffer.from(await response.arrayBuffer());
            res.end(body);
          } catch (error) {
            server.config.logger.error(
              `api dev middleware failed: ${String(error)}`,
            );
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.end(
              JSON.stringify({
                error: 'network',
                message: 'The local archive proxy failed. See the dev console.',
              }),
            );
          }
        },
      );
    },
  };
}

// Static frontend build. The archive proxy lives in `api/` and is deployed
// separately as a serverless function; it is not part of this bundle.
export default defineConfig({
  plugins: [react(), apiDevServer()],
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
