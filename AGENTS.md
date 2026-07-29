# AGENTS.md — Drug Stats App

## Project Overview
Tauri + React + Vite desktop application for drug statistics management (منصرف الأدوية).
Uses Rust backend with SQLite, Tailwind CSS frontend, Vitest + Playwright for testing.

## Commands

### Development
- 
pm run dev — Start Vite dev server (port 5173)
- 
pm run tauri — Run Tauri CLI commands (e.g., 
pm run tauri dev)

### Build
- 
pm run build — Build frontend for production (outputs to dist/)
- 
pm run preview — Preview production build locally

### Lint
- 
pm run lint — Run ESLint on all files

### Tests
- 
pm run test — Run Vitest unit tests (non-watch mode)
- 
pm run test:watch — Run Vitest in watch mode
- 
pm run test:coverage — Run tests with coverage report
- 
pm run test:e2e — Run Playwright E2E tests
- 
pm run test:e2e:ui — Run Playwright in UI mode
- 
pm run test:all — Run all tests (unit + E2E)

## Project Structure
- src/ — React frontend source
  - modules/ — Feature modules (transactions, admin, reports, master-data, dashboard, auth, help)
  - components/ — Reusable UI components (ui/, common/, layout/, forms/, dashboard/)
  - context/ — React context providers (AuthContext, SmartNotificationContext)
  - hooks/ — Custom React hooks
  - outer/ — React Router configuration
  - 	ests/ — Unit tests (Vitest)
  - utils/ — Utility functions (exportPdf, exportExcel, etc.)
- src-tauri/ — Tauri/Rust backend
  - src/commands/ — Rust command handlers (20 command files)
  - src/db.rs — Database layer
  - src/lib.rs — Tauri library setup
  - src/main.rs — Tauri entry point
  - 	auri.conf.json — Tauri configuration
- schema.sql — Complete database schema (381 lines)
- e2e/ — Playwright E2E tests (to be created)

## Notes
- No TypeScript — project uses plain JavaScript/JSX
- No separate typecheck command (use 
pm run lint for static analysis)
- Coverage requires @vitest/coverage-v8 (not yet installed)
