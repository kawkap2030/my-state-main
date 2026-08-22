// Cleans mixed-level ticket records for branch 2 / 2026-08:
//  - Takes a consistent backup (VACUUM INTO) first
//  - Deletes AREA-level and CLINIC-level medical_tickets rows
//  - Keeps BRANCH-level rows only
//  - Sets the isolation rule for that branch+month to 'branch'
// Runs inside a transaction; prints before/after state.
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');

const DB = path.join(__dirname, 'medicine_dispenser.db');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const BACKUP = path.join(__dirname, 'backups', `medicine_dispenser_backup_pre_cleanup_${stamp}.db`);

const db = new sqlite3.Database(DB);
const q = (sql, params = []) =>
  new Promise((res, rej) => db.all(sql, params, (e, r) => (e ? rej(e) : res(r))));
const run = (sql, params = []) =>
  new Promise((res, rej) => {
    db.run(sql, params, function (e) {
      if (e) rej(e);
      else res({ changes: this.changes, lastID: this.lastID });
    });
  });

(async () => {
  try {
    // 1) Consistent backup via VACUUM INTO (works even in WAL mode)
    await run(`VACUUM INTO '${BACKUP.replace(/'/g, "''")}'`);
    console.log('✅ BACKUP:', BACKUP);

    // 2) Snapshot BEFORE
    const before = await q(
      "SELECT id, area_id, clinic_id, period, category, tickets_56b, tickets_56c FROM medical_tickets WHERE dispense_month='2026-08' AND branch_id=2 ORDER BY area_id, clinic_id"
    );
    console.log('\nBEFORE (' + before.length + ' rows):');
    before.forEach((r) =>
      console.log(
        `  id=${r.id} level=${r.area_id !== null ? 'area' + (r.clinic_id !== null ? '/clinic' : '') : 'branch'} ${r.period} ${r.category} (56ب=${r.tickets_56b}, 56ج=${r.tickets_56c})`
      )
    );

    // 3) Transaction: delete area/clinic rows + set isolation rule
    await run('BEGIN');
    const del = await run(
      "DELETE FROM medical_tickets WHERE branch_id=2 AND dispense_month='2026-08' AND (area_id IS NOT NULL OR clinic_id IS NOT NULL)"
    );
    await run(
      "INSERT INTO dispensing_month_isolation (branch_id, dispense_month, isolation_level) VALUES (2, '2026-08', 'branch') " +
        "ON CONFLICT(branch_id, dispense_month) DO UPDATE SET isolation_level='branch'"
    );
    await run('COMMIT');
    console.log(`\n🗑️  Deleted ${del.changes} area/clinic-level rows`);

    // 4) Verify AFTER
    const after = await q(
      "SELECT id, area_id, clinic_id, period, category, tickets_56b, tickets_56c FROM medical_tickets WHERE dispense_month='2026-08' AND branch_id=2 ORDER BY area_id, clinic_id"
    );
    const rule = await q(
      "SELECT isolation_level FROM dispensing_month_isolation WHERE branch_id=2 AND dispense_month='2026-08'"
    );
    console.log('\nAFTER (' + after.length + ' rows — should be branch-only):');
    after.forEach((r) =>
      console.log(
        `  id=${r.id} level=${r.area_id !== null ? 'area/clinic' : 'branch'} ${r.period} ${r.category} (56ب=${r.tickets_56b}, 56ج=${r.tickets_56c})`
      )
    );
    console.log('\nIsolation rule:', rule[0] ? rule[0].isolation_level : 'MISSING');

    const allBranch = after.every((r) => r.area_id === null && r.clinic_id === null);
    const ruleOk = rule[0] && rule[0].isolation_level === 'branch';
    console.log(allBranch && ruleOk ? '\n✅ CLEANUP VERIFIED' : '\n❌ CLEANUP FAILED');
    process.exitCode = allBranch && ruleOk ? 0 : 1;
  } catch (e) {
    console.error('❌ ERROR:', e.message);
    try { await run('ROLLBACK'); } catch {}
    process.exitCode = 1;
  } finally {
    await new Promise((res) => db.close(() => res()));
  }
})();
