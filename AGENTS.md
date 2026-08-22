# AGENTS.md — منظومة إحصائيات الأدوية والمستلزمات الطبية (Drug Stats App)

## Project Overview
Tauri + React + Vite desktop application for drug statistics management (منصرف الأدوية).
Uses Rust backend with SQLite, Tailwind CSS frontend, Vitest + Playwright for testing.

## Commands

### Development
- 
pm run dev — Start Vite dev server (port 5174)
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

## Rust Toolchain (IMPORTANT)
- The project pins **nightly** via `src-tauri/rust-toolchain.toml`. Do NOT remove it.
- **Why:** stable rustc 1.97.1 crashes with `STATUS_ACCESS_VIOLATION` (0xc0000005) during codegen while compiling `zerocopy`'s SIMD code on Windows x86_64-msvc. Nightly 1.99.0 compiles it fine (verified: full `cargo build` succeeds).
- If the toolchain is ever unpinned and you hit `0xc0000005` / `STATUS_ACCESS_VIOLATION` while compiling `zerocopy`/`zerofrom-derive`, re-add the pin (`channel = "nightly"`) or build with `cargo +nightly build`.
- Diagnosed Aug 2026: crash target moves between crates (app_lib → zerocopy → zerofrom_derive), survives `cargo clean`, `strip=none`, `debug=2`, `codegen-units=1`, `-j 2`, toolchain reinstall and Defender exclusions — it is a stable-toolchain codegen bug, not app code.

## Rust Toolchain Requirement (important!)
- **rustc 1.97.1+ is REQUIRED** on Windows/MSVC. Older compilers (e.g. 1.95.0) crash with an internal compiler error (ICE) during full builds:
  `thread 'rustc' panicked ... assertion failed: bytes[len] == STR_SENTINEL` in `rustc_serialize` (exit code `0xc0000409` / `STATUS_STACK_BUFFER_OVERRUN`).
- The ICE happens only on full `cargo build` / `tauri dev` with debuginfo — `cargo check` may still pass, which makes it misleading.
- Fix if it recurs: `rustup update stable` (or `rustup toolchain install 1.97.1`), then re-add the Windows target and std component:
  `rustup target add x86_64-pc-windows-msvc` and `rustup component add rust-std --target x86_64-pc-windows-msvc`.
