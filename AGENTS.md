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

## Current Build/Toolchain Status

### Recommended Toolchain
- **Approved toolchain (current):** Stable Rust **1.97.1** on `x86_64-pc-windows-msvc`.
- Forced on the project by `src-tauri/rust-toolchain.toml` (`channel = "1.97.1"`, `profile = "minimal"`).
- `cargo +stable check --no-default-features --offline` → **EXIT 0** (verified).
- `cargo build` → success (verified).
- `cargo build --release` → success (verified).
- Tauri release build produced the working executable:
  `src-tauri\target\release\drug-stats.exe` (built and run).

### Rust environment
- rustc 1.97.1
- cargo 1.97.1
- target: x86_64-pc-windows-msvc

### Historical note — Nightly (resolved, keep as record)
- During development the project pinned `nightly-2026-08-08` because older toolchains
  hit compiler ICE / `STATUS_HEAP_CORRUPTION` / `STATUS_ACCESS_VIOLATION` /
  `STATUS_STACK_BUFFER_OVERRUN` while compiling `zerocopy` / `webview2-com-sys` on
  Windows MSVC. These issues are resolved on stable 1.97.1.
- Nightly is **no longer required** and is **not** preferred.
- Do **not** delete the historical Nightly config backup at `src-tauri/rust-toolchain.toml.backup`.
- If stable build issues ever recur (e.g. `bytes[len] == STR_SENTINEL` ICE), ensure
  the stable toolchain + Windows target/std are installed:
  `rustup update stable`, `rustup target add x86_64-pc-windows-msvc`,
  `rustup component add rust-std --target x86_64-pc-windows-msvc`.

## Current Build/Toolchain Status (Vite)
- The `pluginName is not defined` / `[plugin externalize-deps]` error seen during
  development was a transient Vite/esbuild environment issue and is **resolved**.
- Last confirmed state: `VITE v7.3.1 ready`, `Local: http://localhost:5174/`.
- No change to `vite.config.js` is currently required for this issue. Do not modify Vite config.

## Functional Testing Status — Phase 1
- Admin pages: tested.
- Basic dispensing (صرف) pages: tested.
- Development build: working.
- Release `.exe` (`drug-stats.exe`): working — launched and tested.
- Printing & export: **not yet fully tested** (review pending).
- Reports review: **not yet complete**.
- Functional testing is **NOT complete**.

## Insulin Fixes — Phase Summary (stage record only)
The insulin dispensing issue comprised:
1. A second record was not saved when it was the same drug + same category at a **different price**.
2. Root cause: backend validation did not consider `unit_price` when checking category repetition.
3. Backend changed to allow the same drug/category at a **different price**.
4. Real duplicates (all record identity fields identical, including price) remain rejected.
5. Category filtering fixed per type: **مدعم (تجاري)** vs **مجاني**.
6. **الكل** mode fixed so it no longer forces choosing a single category.
7. Silent data loss on partial save prevented — failed records are now shown to the user.

## Open Functional Issues / Next Test Phases
### 1. Quick entry for branches (الإدخال السريع للفروع)
- Quick entry works and records appear inside the input fields themselves.
- However, they do not appear as separate records below the input area as expected.
- There is a logic-linking issue between quick entry and the pages:
  - Monthly supported drug dispensing (المنصرف الشهري للأدوية المدعمة)
  - Monthly free drug dispensing (المنصرف الشهري للأدوية المجانية)
- This can produce a conflicting branch-wide aggregate entry plus clinic entries for the same month.
- Requires an independent functional review.

### 2. Drug groups (المجموعات الدوائية)
- Individual entry works correctly and prevents duplicates.
- Batch/group entry allows duplicates / replacement.
- Requires an independent review.

### 3. Printing & export
- Final review not started yet.

### 4. Reports
- Final review not started yet.

### 5. Project cleanup
- Phase of removing unnecessary files not started yet.

## Status (do not treat as final)
- The project is currently in state: **Stable / Working Development & Release Build — Functional Review Ongoing**.
- It is **not** "Final / Production Complete".
- Remaining work includes: print/export review for reviewed input pages, reports review,
  report print/export review, identifying unnecessary files, identifying duplicate/redundant files,
  careful cleanup, and a final comprehensive post-cleanup test.

## Changelog (stage record)
Phase 1 stabilization:
- Migrated project toolchain documentation from Nightly to Stable 1.97.1.
- Verified Rust check/build/release build.
- Verified Tauri release executable generation.
- Vite/esbuild startup issue resolved.
- Insulin save/filter/all-mode issues fixed.
- Functional testing remains in progress.

