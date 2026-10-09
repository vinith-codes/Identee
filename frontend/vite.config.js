import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  assetsInclude: ["**/*.glb"],
  // jszip is only loaded when an admin downloads print files; listing it here
  // stops the dev server from reloading the page the first time that happens
  optimizeDeps: { include: ["jszip"] },
});
