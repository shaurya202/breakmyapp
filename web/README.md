# BreakMyApp web

- dev: `npm run dev` (Vite; set `VITE_CONVEX_URL` in web/.env)
- build: `npm run build` (tsc typecheck + vite bundle)
- deploy: `npm run build` then serve `dist/` as a static SPA (any host with SPA fallback)
