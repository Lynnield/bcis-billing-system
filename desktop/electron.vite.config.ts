import { resolve } from "node:path";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
  },
  renderer: {
    // Production loads index.html via file://, where an absolute "/assets/..."
    // base (Vite's default) resolves against the filesystem root instead of
    // out/renderer/ and every asset 404s — a blank window with no errors in
    // the main process. Dev mode never hits this because it loads from the
    // Vite dev server's HTTP origin instead of loadFile(). Relative paths
    // work under both.
    base: "./",
    resolve: {
      alias: {
        "@": resolve("src/renderer/src"),
      },
    },
    plugins: [react(), tailwindcss()],
  },
});
