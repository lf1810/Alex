import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import {resolve} from "node:path";

export default defineConfig(({mode}) => ({
  plugins: [react()],
  // Verification builds only need to prove that the application bundle compiles.
  // Skipping the large mutable project directory also prevents generated
  // render-job bundles from recursively copying themselves into the test output.
  publicDir: mode === "verification" || mode === "desktop" ? false : resolve(import.meta.dirname, "../public"),
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4318",
      "/media": "http://127.0.0.1:4318",
    },
  },
}));
