import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Note: `_generated/api.js` imports `convex/server` — Vite resolves it from the
// repo-root node_modules (nearest to ../convex). src imports of convex/* resolve
// from web/node_modules. Both copies are pinned to convex@1.48.0, so runtime
// proxies (api) and the React client (web) interoperate safely.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // convenience only; app talks to Convex cloud directly
    },
  },
});
