# ISOLATION LOCK AUDIT — REPORT

**Date:** Aug 18, 2026
**Scope:** Month Lock, Branch Lock, Isolation Lock across all input pages

---

## 1. FINDINGS

### Month Lock: EXISTS ✅
- **Smart 4-month rule** (`dateUtils.js:isMonthLocked`): Months older than 4 months from current date are auto-locked
- **Manual lock** (`manual_locked_months` table): Admin can toggle lock per month via LockManagementPage
- **Combined check** (`checkIsMonthLocked` in GlobalAppContext): Merges smart + manual + master-unlock bypass

### Branch Lock: DOES NOT EXIST ❌
- No `branch_locks` table in schema
- No `branchLock`/`branch_lock` code in frontend or backend
- No per-branch locking mechanism exists

### Isolation Lock: EXISTS ✅ (different purpose)
- **Table:** `dispensing_month_isolation` (PK: `branch_id + dispense_month`)
- **Column:** `isolation_level` = 'branch' | 'area' | 'clinic'
- **Purpose:** Controls hierarchy level of data entry (which level gets rows), NOT whether data entry is allowed
- **NOT equivalent to Branch Lock** — it is a structural configuration, not a permission gate

### `useLockGuard` Hook: EXISTED BUT WAS UNUSED
- Located at `src/hooks/useLockGuard.js`
- Returns `{ isLocked, isManual, isSmart, statusLabel, checkAndWarn, guardSubmit, LockBanner }`
- Was imported by 0 pages before this fix

### `LockNotificationBanner` Component: PARTIALLY USED
- Only 2 of 7 input pages had it (MonthlyDispensedForm, InsulinDispensingPage)

---

## 2. IMPLEMENTATION SUMMARY

### Pattern adopted across all 7 input pages + 1 sub-component:

| Component | File | Changes |
|-----------|------|---------|
| MonthlyDispensedForm | `src/components/forms/MonthlyDispensedForm.jsx` | Replaced ad-hoc lock with `useLockGuard`; added `LockBanner`; disabled all inputs + reset button |
| DetailedSuppliesForm | `src/components/forms/DetailedSuppliesForm.jsx` | Added `useLockGuard` + `LockBanner`; disabled mode switcher, selects, inputs, textarea, save/reset buttons |
| DetailedDrugDispensingPage | `src/modules/transactions/drug-dispensing/DetailedDrugDispensingPage.jsx` | Added `useLockGuard` + `LockBanner`; disabled category select, drug autocomplete, quantity/cases/price inputs, copy-previous button, add-to-sublist button, save-all button |
| InsulinDispensingPage | `src/modules/transactions/insulin-dispensing/InsulinDispensingPage.jsx` | Added `useLockGuard` + `LockBanner`; replaced manual banner; disabled category/type selects, insulin autocomplete, quantity/cases/price inputs, previous-prices select, add-to-sublist button, save-all button |
| JudicialDispensingPage | `src/modules/transactions/judicial-dispensing/JudicialDispensingPage.jsx` | Added `useLockGuard` + `LockBanner`; disabled patient autocomplete, dispense quantity inputs, save button |
| GroupCostsPage | `src/modules/transactions/group-costs/GroupCostsPage.jsx` | Added `useLockGuard` + `LockBanner`; disabled group autocomplete, cost input, save button |
| MedicalTicketsPage | `src/modules/transactions/medical-tickets/MedicalTicketsPage.jsx` | Added `useLockGuard` + `LockBanner`; disabled all 25 ticket count inputs across weekly/monthly/daily modes |
| MedicalTicketsGridEntry | `src/components/forms/MedicalTicketsGridEntry.jsx` | Added `isLocked` prop; disabled 4 grid inputs + save button |

### Consistent pattern per page:
1. Import `useLockGuard` from `../../../hooks/useLockGuard`
2. Call `const { isLocked, LockBanner } = useLockGuard(hierarchy.dispenseMonth)`
3. Render `<LockBanner />` after `<HierarchySelector />` (above the form)
4. Add `disabled={isLocked}` to ALL form inputs (Input, Select, AutoComplete, textarea, native input)
5. Keep HierarchySelector (Month/Branch selectors) ENABLED — never disabled
6. Row-level history indicators (`checkIsMonthLocked(reg.dispense_month)`) kept as-is — different use case

### What was NOT changed:
- **No backend changes** — all changes are frontend-only
- **Month/Branch selectors remain enabled** — users can navigate and view data when locked
- **History table lock indicators** preserved — individual row-level month checks for display purposes
- **Row-level `checkIsMonthLocked` in history sections** preserved — these check historical records' months, not the current form month
- **No `manualLockedMonths` references removed** from history-filter logic — still needed for row-level filtering

---

## 3. VERIFICATION

- `cargo check` — PASS (0 errors, 0 warnings)
- ESLint (scoped) — PASS (0 errors on all 8 modified files)
- Production DB SHA256 — `AC903AAB5E239F46989C1C5FFB32969B73B2402BE8E284223B9DFB5384B768DA` (unchanged)

---

## 4. REMAINING ITEMS

- **Test Month Lock (Tests 1-2):** Pending user verification
- **Branch Lock:** Confirmed NOT IMPLEMENTED. If needed in the future, requires new `branch_locks` table + backend commands + frontend integration
