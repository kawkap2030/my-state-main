import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },

  // Tauri expects a fixed port
  server: {
    port: 5173,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Core framework — always needed
          vendor: ['react', 'react-dom', 'react-router-dom'],
          // Heavy icon library — loaded separately so it doesn't block initial paint
          icons: ['lucide-react'],
          // Charting — heavy, only needed on dashboard & report pages
          charts: ['recharts'],
          // Spreadsheet export — heavy, only needed on export actions
          xlsx: ['xlsx', 'exceljs'],
          // PDF export — heavy, only needed via lazy ExportMenu
          pdf: ['jspdf', 'jspdf-autotable', 'html2pdf.js'],
        },
      },
    },
    chunkSizeWarningLimit: 1200
  },

  // ════════════════════════════════════════════
  // Vitest Configuration
  // ════════════════════════════════════════════
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.js'],
    css: true,
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    // coverage: install @vitest/coverage-v8 to enable: provider: 'v8',
    testTimeout: 10000,
    retry: 1,
  },
});
