import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import checker from "vite-plugin-checker";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // ── vite-plugin-checker ────────────────────────────────────────────
    // يلتقط أخطاء ESLint/JSX مبكراً داخل المحرر وسطر الأوامر (وليس فقط في
    // طبقة المتصفح عند فشل الترجمة). أخطاء CSS تُلتقط قبل التشغيل عبر
    // `npm run check:css` (تُشغَّل تلقائياً عبر predev/prebuild).
    // لا يُفعَّل أثناء vitest (يقرأ vite.config.js ويُفعِّل كل الإضافات)،
    // حتى لا يُبطئ الاختبارات بتشغيل eslint في الخلفية.
    ...(process.env.VITEST ? [] : [
      checker({
        eslint: {
          lintCommand: "eslint src",
        },
        // لا تفتح النافذة المنبثقة تلقائياً عند الإقلاع — الأخطاء تظهر في
        // الطرفية والمحرر، ويمكن فتح الطبقة يدوياً عند الحاجة.
        overlay: { initialIsOpen: false },
      }),
    ]),
  ],

  // Prevent vite from obscuring rust errors
  clearScreen: false,

  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
  },

  // Tauri expects a fixed port
  server: {
    port: 5174,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      // ── حارس مسار المراقبة (Windows-safe) ─────────────────────────────
      // أنماط glob مثل "**/src-tauri/**" لا تطابق المسارات المطلقة على
      // Windows (مشكلة الـ backslash)، فكان chokidar يراقب ملفات cargo
      // المؤقتة داخل src-tauri/target وينهار بـ EBADF أثناء البناء الطويل
      // (ينتج عنه خطأ "beforeDevCommand terminated"). الدالة أدناه تطبّع
      // المسار (تحويل backslash) ثم تطابقه بدقة — تمنع مراقبة مجلدات
      // البناء/قواعد البيانات/النسخ الاحتياطية نهائياً.
      ignored: [
        (watchPath) => {
          const p = String(watchPath).replace(/\\/g, "/");
          return (
            /(^|\/)node_modules(\/|$)/.test(p) ||
            /(^|\/)src-tauri(\/|$)/.test(p) ||
            /(^|\/)dist(\/|$)/.test(p) ||
            /(^|\/)backups(\/|$)/.test(p) ||
            /(^|\/)\.git(\/|$)/.test(p) ||
            /\.(db|db-shm|db-wal|sqlite|sqlite3|zip|tmp)$/i.test(p)
          );
        },
        "**/*.db*",
        "**/*.sqlite*",
        "**/temp_restore/**",
        "**/*.zip",
        "**/*.tmp",
      ],
    },
  },
  css: {
    devSourcemap: true,
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
          // NOTE: jspdf / jspdf-autotable / html2pdf.js are intentionally NOT
          // forced into a manual `pdf` chunk. exportPdf.js already lazy-loads
          // them via dynamic import(). Manual-chunking them made Vite hoist the
          // shared __vitePreload helper into that chunk, which forced the whole
          // jspdf payload to be parsed at startup. Without the manual chunk,
          // Vite emits a naturally-lazy chunk only fetched when PDF export runs.
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
