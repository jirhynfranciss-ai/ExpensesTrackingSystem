import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "framer-motion",
      "@supabase/supabase-js",
      "react-hot-toast",
      "lucide-react",
      "recharts",
      "date-fns",
      "clsx",
      "tailwind-merge",
    ],
    force: true,
  },
  build: {
    target: "es2020",
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/framer-motion")) {
            return "framer-motion";
          }
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3")) {
            return "charts";
          }
          if (id.includes("node_modules/lucide-react")) {
            return "lucide";
          }
          if (id.includes("node_modules/")) {
            return "vendor";
          }
        },
      },
    },
  },
});
