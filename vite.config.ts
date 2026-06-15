import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base so the build works under any path, incl. GitHub Pages
  // project sites served at https://<user>.github.io/<repo>/
  base: "./",
  plugins: [react()],
  server: { port: 5273, open: true },
});
