import React, { useState, useEffect, useRef } from 'react';
import {
  Save, RefreshCw, AlertCircle, MapPin, Hospital, Building2,
  Calculator, CheckSquare, Square, Edit2, Trash2, Calendar,
  CalendarDays, Copy, Search, Zap, RotateCcw
} from 'lucide-react';
import invoke from '../../api/tauriApi';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../context/AuthContext';
import { useGlobalApp } from '../../context/useGlobalApp';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import Select from '../ui/Select';
import MonthInput from '../ui/MonthInput';
import ExportMenu from '../ui/ExportMenu';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useLockGuard from '../../hooks/useLockGuard';

/**
 * QuickTicketsEntry — High-Performance, Professional Bulk Ticket Entry adaptation:
 *   - Supports System Modes: Weekly (أسبوعي) and Monthly Unified (شهري - موحد)
 *   - Seamless Keyboard Grid Navigation (Arrow keys & Enter for instant cell jumps)
 *   - Fast Row/Table Actions (Copy Previous Row, Clear Table, Live Search)
 *   - Dynamic Level Adaptation: Branches / Areas / Clinics
 *   - Live Row & Column Totals
 */
const QuickTicketsEntry = ({ level, dispenseMonth, onMonthChange }) => {
  const [branches, setBranches] = useState([]);
  const [areas, setAreas] = useState([]);
  const [clinics, setClinics] = useState([]);
  const [selectedBranch, setSelectedBranch] = useState(''); // '' = الكل (branches level)
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedClinicIds, setSelectedClinicIds] = useState([]); // [] = all clinics of the area
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // ── System Mode: 'weekly' (أسبوعي) vs 'monthly' (شهري - موحد) ─────────────
  // Preferences are persisted to localStorage so the user's last choice of
  // entry system, week and copy-source week survive page reloads.
  const PREFS_KEY = 'quickTicketsEntryPrefs';
  const readPrefs = () => {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
  };
  const [entrySystem, setEntrySystem] = useState(() => {
    const p = readPrefs();
    return p.entrySystem === 'monthly' ? 'monthly' : 'weekly';
  });
  const [copySourceWeek, setCopySourceWeek] = useState(() => {
    const w = parseInt(readPrefs().copySourceWeek, 10);
    return w >= 1 && w <= 4 ? w : 1; // weekly source for the monthly copy button (1..4)
  });
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const w = parseInt(readPrefs().selectedWeek, 10);
    return w >= 1 && w <= 4 ? w : 1;
  });

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ entrySystem, selectedWeek, copySourceWeek }));
    } catch { /* ignore quota/availability errors */ }
  }, [entrySystem, selectedWeek, copySourceWeek]);

  // ── Print: Ctrl+P → same PrintPreviewModal as ExportMenu → "طباعة التقرير" ──
  // Uses the established useKeyboardShortcuts hook: a single keydown listener
  // (cleaned up on unmount) that preventDefault()s the native print dialog and
  // only opens the unified print preview. No window.print()/executePrint()
  // direct path is ever triggered from here.
  useKeyboardShortcuts([
    { key: 'p', ctrl: true, handler: () => exportMenuRef.current?.openPrintPreview(), description: 'معاينة الطباعة' },
  ]);

  const [isSupported, setIsSupported] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('عام');
  const [pendingConflict, setPendingConflict] = useState(null);

  const toast = useToast();
  const { user } = useAuth();
  const { setWorkspaceMode, isIsolationExceptionActive } = useGlobalApp();
  const { isLocked, checkAndWarn, LockBanner } = useLockGuard(dispenseMonth);
  const savedDataRef = useRef([]);
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same print-preview
  // modal that ExportMenu → "طباعة التقرير" opens (via the shared imperative
  // API: openPrintPreview → printRequest → PrintPreviewModal). Mirrors the
  // unified print path used by MonthlyHistoryTable.
  const exportMenuRef = useRef(null);
  // Holds rows converted to the TARGET system's shape while switching
  // weekly ↔ monthly (see requestSystemSwitch) until the next load merges them
  // on top of the backend data — so nothing typed is ever silently cleared.
  const carryOverRef = useRef(null);
  // In-memory snapshot of the monthly grid (all 4 weeks) while in monthly mode,
  // so a monthly → weekly → monthly round-trip restores unsaved weeks 2–4
  // instead of dropping them (the weekly view only carries the selected week).
  const monthlyScratchRef = useRef(null);
  // Guards against stale async writes: only the LATEST loadGridData invocation
  // may commit its result (React StrictMode double-invokes effects in dev).
  const loadSeqRef = useRef(0);

  // ── Fetch scope lists ────────────────────────────────────────────────
  useEffect(() => {
    invoke('get_branches').then(setBranches).catch(console.error);
  }, []);

  useEffect(() => {
    if (!selectedBranch || level === 'branches') {
      setAreas([]);
      setSelectedArea('');
      return;
    }
    invoke('get_areas', { branchId: parseInt(selectedBranch) })
      .then(a => {
        const list = a || [];
        setAreas(list);
        setSelectedArea(prev => list.some(x => String(x.id) === String(prev)) ? prev : '');
      })
      .catch(console.error);
  }, [selectedBranch, level]);

  useEffect(() => {
    if (level !== 'clinics' || !selectedArea) {
      setClinics([]);
      setSelectedClinicIds([]);
      return;
    }
    invoke('get_clinics', { areaId: parseInt(selectedArea) })
      .then(c => {
        const list = c || [];
        setClinics(list);
        setSelectedClinicIds(list.map(x => x.id));
      })
      .catch(console.error);
  }, [selectedArea, level]);

  // ── Month isolation lock awareness (mirrors HierarchySelector) ─────────
  // The regular page forces its workspace mode from the month's isolation
  // rule via HierarchySelector. The quick entry must do the same: when a
  // branch + month is selected, consult get_month_isolation_rule and switch
  // the workspace mode to the locked level (unless an isolation exception is
  // active). This prevents showing stale data from a previous month's level
  // (e.g. August locked at branches while July was locked at clinics).
  useEffect(() => {
    const fetchLock = async () => {
      if (!selectedBranch || !dispenseMonth) return;
      try {
        const locked = await invoke('get_month_isolation_rule', {
          branchId: parseInt(selectedBranch),
          dispenseMonth,
        });
        if (locked && !isIsolationExceptionActive) {
          const mode = locked === 'branch' ? 'branches'
            : locked === 'area' ? 'areas' : 'clinics';
          setWorkspaceMode(mode);
        }
      } catch (err) {
        console.error('Failed to fetch isolation rule:', err);
      }
    };
    fetchLock();
  }, [selectedBranch, dispenseMonth, isIsolationExceptionActive, setWorkspaceMode]);

  const scopeReady = () => {
    if (!dispenseMonth) return false;
    if (level === 'areas' || level === 'clinics') {
      if (!selectedBranch) return false;
      if (level === 'clinics' && !selectedArea) return false;
    }
    return true;
  };

  const loadGridData = async () => {
    if (!scopeReady()) {
      setData([]);
      return;
    }
    if (level === 'clinics' && selectedClinicIds.length === 0 && clinics.length > 0) {
      setData([]);
      return;
    }

    // Only the LATEST invocation may commit (StrictMode double-invokes effects
    // in dev, and rapid week/scope changes can race) — otherwise a stale fetch
    // could overwrite the merged carry-over result.
    const seq = ++loadSeqRef.current;
    setLoading(true);
    try {
      const branchIds = selectedBranch ? [parseInt(selectedBranch)] : [];
      const areaIds = level === 'clinics' && selectedArea ? [parseInt(selectedArea)] : [];
      const clinicIds = level === 'clinics' ? selectedClinicIds : [];
      const batchData = await invoke('get_tickets_batch_for_branch', {
        level,
        branchIds,
        areaIds,
        clinicIds,
        dispenseMonth,
        weekNumber: entrySystem === 'weekly' ? selectedWeek : null,
        category: isSupported ? null : selectedCategory,
      });

      // ── Two-way system-switch carry-over ──────────────────────────────
      // When the user switches weekly ↔ monthly (after confirming), the values
      // they typed in the previous system are NOT cleared: they are re-applied
      // here on top of whatever the backend returns for the new system, so
      // editing continues seamlessly (e.g. week 1 weekly → week 1 monthly, and
      // the reverse).
      let rows = batchData || [];

      // ── Monthly scratch restore FIRST (round-trip monthly→weekly→monthly) ─
      // When coming BACK to monthly, weeks 2–4 that were typed but never saved
      // are restored from the snapshot taken while leaving monthly mode — the
      // weekly view only carries the selected week. The snapshot is tagged with
      // isSupported so a free-mode snapshot never bleeds into supported rows
      // and vice versa (each mode keeps its own isolation cycle).
      let scratchApplied = false;
      if (entrySystem === 'monthly' && matchesPendingRef(monthlyScratchRef.current)) {
        scratchApplied = true;
        const scratch = monthlyScratchRef.current;
        rows = rows.map(r => {
          const scr = scratch.rows.find(s => rowKey(s) === rowKey(r));
          if (!scr || !scr.weeks) return r;
          const weeks = (r.weeks && r.weeks.length === 4)
            ? r.weeks.map(w => ({ ...w }))
            : [0, 1, 2, 3].map(() => zeroWeek());
          scr.weeks.forEach((w, wi) => {
            if (w && wi < 4) weeks[wi] = { ...weeks[wi], ...w };
          });
          return { ...r, weeks };
        });
      }

      // ── Two-way system-switch carry-over SECOND ───────────────────────
      // When the user switches weekly ↔ monthly (after confirming), the values
      // they typed in the previous system are NOT cleared: they are re-applied
      // on top of the restored/backend rows, so editing continues seamlessly
      // (e.g. week 1 weekly → week 1 monthly, and the reverse). Running this
      // AFTER the scratch restore means the user's latest selected-week edits
      // win over the older snapshot. The carry is tagged with isSupported +
      // selectedCategory so neither the free↔supported toggle nor a category
      // change can consume a pending carry from another mode/funding category.
      // NOTE: the category comparison mirrors the write site exactly
      // (isSupported ? null : selectedCategory) — for supported mode the tag is
      // null while selectedCategory state may linger at a free-mode value, so
      // comparing directly to selectedCategory would always drop the carry.
      const carry = carryOverRef.current;
      let carryApplied = false;
      if (matchesPendingRef(carry, { target: entrySystem })) {
        carryApplied = true;
        rows = rows.map(r => {
          const carried = carry.rows[rowKey(r)];
          if (!carried) return r;
          if (carry.target === 'monthly') {
            const weeks = (r.weeks && r.weeks.length === 4)
              ? r.weeks.map(w => ({ ...w }))
              : [0, 1, 2, 3].map(() => zeroWeek());
            const wi = Math.min(Math.max(selectedWeek, 1), 4) - 1;
            weeks[wi] = { ...weeks[wi], ...carried.weeks[wi] };
            return { ...r, weeks };
          }
          return { ...r, ...carried };
        });
      }

      // Only the LATEST load commits (StrictMode double-invokes effects in
      // dev). The merges are idempotent, so re-reading the same refs is safe.
      // Each ref is consumed ONLY if its guard actually matched — an unapplied
      // carry/scratch (e.g. a quick free→supported toggle mid-load) survives so
      // a matching mode/category load can still apply it later, instead of a
      // non-matching commit silently destroying the pending data.
      if (seq !== loadSeqRef.current) return;
      if (scratchApplied) monthlyScratchRef.current = null;
      if (carryApplied) carryOverRef.current = null;
      setData(rows);
      savedDataRef.current = rows;
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      console.error('Error loading tickets:', err);
      setData([]);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    loadGridData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, selectedBranch, selectedArea, selectedClinicIds, dispenseMonth, entrySystem, selectedWeek, isSupported, selectedCategory]);

  const handleInputChange = (rowIndex, field, value) => {
    const newData = [...data];
    newData[rowIndex][field] = Math.max(0, parseInt(value) || 0);
    setData(newData);
  };

  // ── Monthly mode: edit a single week's counter (weeks[weekIdx]) ───────
  // The monthly grid shows ONE unified value per week per column — the sum of
  // صباحي+مسائي — exactly like the regular page's monthly form. Writing a new
  // value stores it on the morning side (موحد lives there) and zeroes the
  // evening side so the displayed total always matches what will be saved.
  const WEEK_PAIR = {
    morning_56b: 'evening_56b', morning_56c: 'evening_56c',
    morning_authority: 'evening_authority',
    morning_students: 'evening_students',
    morning_infants: 'evening_infants',
  };
  const zeroWeek = () => ({
    morning_56b: 0, morning_56c: 0, evening_56b: 0, evening_56c: 0,
    morning_authority: 0, morning_students: 0, morning_infants: 0,
    evening_authority: 0, evening_students: 0, evening_infants: 0,
  });
  const weekCellValue = (row, weekIdx, field) => {
    const wk = row.weeks && row.weeks[weekIdx];
    if (!wk) return 0;
    return (wk[field] || 0) + (wk[WEEK_PAIR[field]] || 0);
  };
  const handleWeekInputChange = (rowIndex, weekIdx, field, value) => {
    const newData = [...data];
    const row = { ...newData[rowIndex] };
    const weeks = (row.weeks || []).map(w => ({ ...w }));
    while (weeks.length < 4) weeks.push(zeroWeek());
    const wk = weeks[weekIdx];
    const v = Math.max(0, parseInt(value) || 0);
    wk[field] = v;
    if (WEEK_PAIR[field]) wk[WEEK_PAIR[field]] = 0;
    row.weeks = weeks;
    newData[rowIndex] = row;
    setData(newData);
  };

  // ── Keyboard Grid Navigation (Arrow Keys & Enter) ─────────────────────
  const handleKeyDown = (e, rowIndex, colIndex, maxCols) => {
    let nextRow = rowIndex;
    let nextCol = colIndex;

    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextRow = Math.min(data.length - 1, rowIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextRow = Math.max(0, rowIndex - 1);
    } else if (e.key === 'ArrowLeft') { // In RTL, Left moves to next column
      e.preventDefault();
      if (colIndex < maxCols - 1) {
        nextCol = colIndex + 1;
      } else if (rowIndex < data.length - 1) {
        nextRow = rowIndex + 1;
        nextCol = 0;
      }
    } else if (e.key === 'ArrowRight') { // In RTL, Right moves to previous column
      e.preventDefault();
      if (colIndex > 0) {
        nextCol = colIndex - 1;
      } else if (rowIndex > 0) {
        nextRow = rowIndex - 1;
        nextCol = maxCols - 1;
      }
    } else {
      return;
    }

    const nextId = `cell-${nextRow}-${nextCol}`;
    const el = document.getElementById(nextId);
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
    }
  };

  // ── Quick Row Copy Action ─────────────────────────────────────────────
  const handleCopyPreviousRow = (rowIndex) => {
    if (checkAndWarn()) return;
    if (rowIndex <= 0) {
      toast.info('لا يوجد صف سابق للنسخ منه');
      return;
    }
    const prevRow = data[rowIndex - 1];
    const newData = [...data];
    newData[rowIndex] = {
      ...newData[rowIndex],
      morning_56b: prevRow.morning_56b,
      morning_56c: prevRow.morning_56c,
      evening_56b: prevRow.evening_56b,
      evening_56c: prevRow.evening_56c,
      morning_authority: prevRow.morning_authority,
      morning_students: prevRow.morning_students,
      morning_infants: prevRow.morning_infants,
      evening_authority: prevRow.evening_authority,
      evening_students: prevRow.evening_students,
      evening_infants: prevRow.evening_infants,
      weeks: entrySystem === 'monthly' ? (prevRow.weeks || []).map(w => ({ ...w })) : newData[rowIndex].weeks,
    };
    setData(newData);
    toast.success('تم نسخ قيم الصف السابق بنجاح');
  };

  // ── Reset All Values in Grid ──────────────────────────────────────────
  const handleResetAllValues = () => {
    if (checkAndWarn()) return;
    if (!window.confirm('هل أنت متأكد من تصفير كافة الأرقام المدخلة في هذا الجدول؟')) return;
    const newData = data.map(r => ({
      ...r,
      morning_56b: 0, morning_56c: 0, evening_56b: 0, evening_56c: 0,
      morning_authority: 0, morning_students: 0, morning_infants: 0,
      evening_authority: 0, evening_students: 0, evening_infants: 0,
      weeks: entrySystem === 'monthly' ? [0, 1, 2, 3].map(() => zeroWeek()) : (r.weeks || []),
    }));
    setData(newData);
    toast.info('تم تصفير قيم الجدول');
  };

  // ── Monthly quick-fill: copy the SELECTED week to the other weeks ──────
  const handleCopyFromWeek = () => {
    if (checkAndWarn()) return;
    if (data.length === 0) return;
    const srcIdx = Math.min(Math.max(copySourceWeek, 1), 4) - 1;
    const hasSourceValues = data.some(r => {
      const w = r.weeks && r.weeks[srcIdx];
      if (!w) return false;
      return Object.keys(w).some(k => (w[k] || 0) > 0);
    });
    if (!hasSourceValues) {
      toast.info(`لا توجد قيم مدخلة في الأسبوع ${copySourceWeek} لتُنسخ`);
      return;
    }
    if (!window.confirm(`سيتم نسخ قيم الأسبوع ${copySourceWeek} إلى بقية الأسابيع لجميع الجهات في هذا الشهر — متابعة؟`)) return;
    const newData = data.map(r => {
      const weeks = (r.weeks && r.weeks.length === 4)
        ? r.weeks.map(w => ({ ...w }))
        : [0, 1, 2, 3].map(() => zeroWeek());
      const src = { ...weeks[srcIdx] };
      for (let i = 0; i < 4; i++) {
        if (i !== srcIdx) weeks[i] = { ...src };
      }
      return { ...r, weeks };
    });
    setData(newData);
    toast.success(`تم نسخ الأسبوع ${copySourceWeek} إلى بقية الأسابيع لجميع الجهات`);
  };

  // ── Monthly quick-fill: clear all four weeks (all rows) ───────────────
  const handleClearAllWeeks = () => {
    if (checkAndWarn()) return;
    if (data.length === 0) return;
    if (!window.confirm('هل أنت متأكد من مسح قيم الأسابيع الأربعة كاملة في هذا الجدول؟')) return;
    const newData = data.map(r => ({ ...r, weeks: [0, 1, 2, 3].map(() => zeroWeek()) }));
    setData(newData);
    toast.info('تم مسح جميع الأسابيع');
  };

  const rowKey = (row) =>
    row.clinic_id && row.clinic_id > 0
      ? `clinic-${row.clinic_id}`
      : (row.area_id && row.area_id > 0 ? `area-${row.area_id}` : `branch-${row.branch_id || 0}`);

  // ── Pending-mode contract for the two-way isolation refs ────────────────
  // Single source of truth for whether a pending carry/scratch belongs to the
  // CURRENT screen state: ticket type, funding category, dispense month,
  // isolation level, and the exact branch/area/clinic scope. Both loadGridData
  // guards use this helper so the tag fields (written in requestSystemSwitch)
  // can never drift apart from the comparison fields.
  const matchesPendingRef = (ref, opts = {}) => {
    if (!ref) return false;
    if (opts.target && ref.target !== opts.target) return false;
    const sameClinics = (ref.clinicIds || []).join(',') === (selectedClinicIds || []).join(',');
    return ref.isSupported === isSupported
      && ref.category === (isSupported ? null : selectedCategory)
      && ref.month === dispenseMonth
      && ref.level === level
      && ref.branchId === (selectedBranch ? String(selectedBranch) : null)
      && ref.areaId === (selectedArea ? String(selectedArea) : null)
      && sameClinics;
  };

  // ── Two-way isolation between weekly & monthly entry systems ───────────
  // Switching systems NEVER silently discards what was typed: a confirmation
  // dialog warns first, and on approval the current in-memory values are
  // converted into the target system's shape and carried over by the next
  // loadGridData() — weekly flat fields → weeks[selectedWeek-1] of monthly,
  // and monthly weeks[selectedWeek-1] → the weekly flat fields. Saving is a
  // separate, explicit step, so no record is written before the user asks.
  const requestSystemSwitch = (target) => {
    if (target === entrySystem) return;
    const currentLabel = entrySystem === 'weekly' ? 'الأسبوعي' : 'الشهري';
    const targetLabel = target === 'weekly' ? 'الأسبوعي' : 'الشهري';
    const currentDesc = entrySystem === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري موحد';
    const targetDesc = target === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري موحد';
    const msg = `أنت حالياً بنظام الإدخال ${currentLabel} (${currentDesc}).\nهل تريد الانتقال إلى نظام الإدخال ${targetLabel} (${targetDesc})؟\n\nسيتم نقل القيم المدخلة حالياً إلى النظام الجديد دون مسحها.`;
    if (!window.confirm(msg)) return;

    // When LEAVING monthly mode, snapshot the full 4-week grid so a later
    // return to monthly restores weeks 2–4 that were typed but never saved
    // (the weekly view only carries the selected week). Consumed by the next
    // monthly loadGridData(). Tagged with isSupported (+ funding category for
    // free mode) so each mode/category keeps its own snapshot — a free-mode
    // snapshot is never applied to supported rows and vice versa.
    if (entrySystem === 'monthly') {
      monthlyScratchRef.current = {
        isSupported,
        category: isSupported ? null : selectedCategory,
        month: dispenseMonth,
        level,
        branchId: selectedBranch ? String(selectedBranch) : null,
        areaId: selectedArea ? String(selectedArea) : null,
        clinicIds: selectedClinicIds || [],
        rows: data.map(r => ({
          ...r,
          weeks: (r.weeks || []).map(w => ({ ...w })),
        })),
      };
    }

    const wi = Math.min(Math.max(selectedWeek, 1), 4) - 1;
    const carriedRows = {};
    data.forEach(row => {
      const key = rowKey(row);
      if (target === 'monthly') {
        // weekly → monthly: flat fields land in weeks[selectedWeek-1]
        const weeks = [0, 1, 2, 3].map(() => zeroWeek());
        const wk = weeks[wi];
        wk.morning_56b = row.morning_56b || 0;
        wk.morning_56c = row.morning_56c || 0;
        wk.evening_56b = row.evening_56b || 0;
        wk.evening_56c = row.evening_56c || 0;
        wk.morning_authority = row.morning_authority || 0;
        wk.morning_students = row.morning_students || 0;
        wk.morning_infants = row.morning_infants || 0;
        wk.evening_authority = row.evening_authority || 0;
        wk.evening_students = row.evening_students || 0;
        wk.evening_infants = row.evening_infants || 0;
        carriedRows[key] = { weeks };
      } else {
        // monthly → weekly: weeks[selectedWeek-1] becomes the flat fields
        const wk = (row.weeks && row.weeks[wi]) || zeroWeek();
        carriedRows[key] = {
          morning_56b: wk.morning_56b || 0,
          morning_56c: wk.morning_56c || 0,
          evening_56b: wk.evening_56b || 0,
          evening_56c: wk.evening_56c || 0,
          morning_authority: wk.morning_authority || 0,
          morning_students: wk.morning_students || 0,
          morning_infants: wk.morning_infants || 0,
          evening_authority: wk.evening_authority || 0,
          evening_students: wk.evening_students || 0,
          evening_infants: wk.evening_infants || 0,
        };
      }
    });
    carryOverRef.current = {
      target,
      isSupported,
      category: isSupported ? null : selectedCategory,
      month: dispenseMonth,
      level,
      branchId: selectedBranch ? String(selectedBranch) : null,
      areaId: selectedArea ? String(selectedArea) : null,
      clinicIds: selectedClinicIds || [],
      rows: carriedRows,
    };
    setEntrySystem(target);
  };

  const calculateTotals = (rows = data) => {
    const totals = {
      morning_56b: 0, morning_56c: 0, evening_56b: 0, evening_56c: 0,
      morning_authority: 0, morning_students: 0, morning_infants: 0,
      evening_authority: 0, evening_students: 0, evening_infants: 0,
    };
    const weekTotals = [0, 1, 2, 3].map(() => zeroWeek());
    rows.forEach(row => {
      Object.keys(totals).forEach(k => { totals[k] += row[k] || 0; });
      if (entrySystem === 'monthly') {
        (row.weeks || []).forEach((wk, wi) => {
          if (!wk || wi > 3) return;
          Object.keys(weekTotals[wi]).forEach(k => { weekTotals[wi][k] += wk[k] || 0; });
        });
      }
    });
    return { totals, weekTotals };
  };

  const { totals, weekTotals } = calculateTotals();

  const performSave = async (payload) => {
    await invoke('save_medical_tickets_bulk', { data: payload });
    await invoke('log_frontend_action', {
      userId: user ? user.id : null,
      action: 'BATCH_UPDATE',
      tableName: 'medical_tickets',
      recordId: null,
      details: `الإدخال السريع للتذاكر (${entrySystem === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري موحد'}) - ${level === 'branches' ? 'فروع' : level === 'areas' ? 'مناطق' : 'عيادات'} - شهر ${dispenseMonth}`
    });
    toast.success(`تم حفظ ${payload.length} سجل بنجاح!`);
    await loadGridData();
  };

  const handleSaveAll = async () => {
    if (checkAndWarn()) return;
    setSaving(true);
    try {
      const payload = [];

      for (const row of data) {
        const scopeClinicId = row.clinic_id && row.clinic_id > 0 ? row.clinic_id : null;
        const scopeAreaId = row.area_id && row.area_id > 0 ? row.area_id : null;

        if (entrySystem === 'monthly') {
          // ── Monthly Unified Mode — ALL weeks saved in one go ──────────
          // The monthly grid shows 4 week columns (weeks[0..3]); each week is
          // saved as a unified 'موحد' record with its own week_number — exactly
          // like the regular page's monthly form. A monthly save REPLACES the
          // weekly (صباحي/مسائي) rows of the same scope+week (backend handles
          // that so reports never double count).
          const weeks = (row.weeks && row.weeks.length === 4)
            ? row.weeks
            : [0, 1, 2, 3].map(() => zeroWeek());
          if (isSupported) {
            const categories = [
              { field: 'morning_authority', cat: 'هيئة' },
              { field: 'morning_students', cat: 'طلاب' },
              { field: 'morning_infants', cat: 'رضع' },
            ];
            weeks.forEach((wk, wi) => {
              for (const c of categories) {
                const count = weekCellValue(row, wi, c.field);
                if (count > 0) {
                  payload.push({
                    branch_id: parseInt(row.branch_id),
                    area_id: scopeAreaId,
                    clinic_id: scopeClinicId,
                    category: c.cat,
                    period: 'موحد',
                    ticket_56b_count: count,
                    ticket_56c_count: 0,
                    dispense_month: dispenseMonth,
                    week_number: wi + 1,
                    is_supported_clinic: true
                  });
                }
              }
            });
          } else {
            weeks.forEach((wk, wi) => {
              const b = weekCellValue(row, wi, 'morning_56b');
              const c = weekCellValue(row, wi, 'morning_56c');
              if (b > 0 || c > 0) {
                payload.push({
                  branch_id: parseInt(row.branch_id),
                  area_id: scopeAreaId,
                  clinic_id: scopeClinicId,
                  category: selectedCategory,
                  period: 'موحد',
                  ticket_56b_count: b,
                  ticket_56c_count: c,
                  dispense_month: dispenseMonth,
                  week_number: wi + 1,
                  is_supported_clinic: false
                });
              }
            });
          }
        } else {
          // ── Weekly Mode (week_number = selectedWeek, period = صباحي/مسائي) ─
          if (isSupported) {
            const categories = [
              { field: 'morning_authority', cat: 'هيئة', period: 'صباحي' },
              { field: 'evening_authority', cat: 'هيئة', period: 'مسائي' },
              { field: 'morning_students', cat: 'طلاب', period: 'صباحي' },
              { field: 'evening_students', cat: 'طلاب', period: 'مسائي' },
              { field: 'morning_infants', cat: 'رضع', period: 'صباحي' },
              { field: 'evening_infants', cat: 'رضع', period: 'مسائي' },
            ];
            for (const c of categories) {
              const count = row[c.field];
              if (count > 0) {
                payload.push({
                  branch_id: parseInt(row.branch_id),
                  area_id: scopeAreaId,
                  clinic_id: scopeClinicId,
                  category: c.cat,
                  period: c.period,
                  ticket_56b_count: count,
                  ticket_56c_count: 0,
                  dispense_month: dispenseMonth,
                  week_number: selectedWeek,
                  is_supported_clinic: true
                });
              }
            }
          } else {
            if (row.morning_56b > 0 || row.morning_56c > 0) {
              payload.push({
                branch_id: parseInt(row.branch_id),
                area_id: scopeAreaId,
                clinic_id: scopeClinicId,
                category: selectedCategory,
                period: 'صباحي',
                ticket_56b_count: row.morning_56b,
                ticket_56c_count: row.morning_56c,
                dispense_month: dispenseMonth,
                week_number: selectedWeek,
                is_supported_clinic: false
              });
            }
            if (row.evening_56b > 0 || row.evening_56c > 0) {
              payload.push({
                branch_id: parseInt(row.branch_id),
                area_id: scopeAreaId,
                clinic_id: scopeClinicId,
                category: selectedCategory,
                period: 'مسائي',
                ticket_56b_count: row.evening_56b,
                ticket_56c_count: row.evening_56c,
                dispense_month: dispenseMonth,
                week_number: selectedWeek,
                is_supported_clinic: false
              });
            }
          }
        }
      }

      if (payload.length > 0) {
        const alreadyExists = await invoke('check_medical_tickets_exist', { data: payload });
        const labels = [];
        if (Array.isArray(alreadyExists) && alreadyExists.length > 0) {
          alreadyExists.forEach(k => {
            const row = data.find(r =>
              k.clinic_id ? r.clinic_id === k.clinic_id
                          : (k.area_id ? r.area_id === k.area_id : r.branch_id === k.branch_id)
            );
            const scope = row
              ? (row.clinic_name || row.area_name || row.branch_name || `عيادة ${k.clinic_id}`)
              : (k.clinic_id ? `عيادة ${k.clinic_id}` : (k.area_id ? `منطقة ${k.area_id}` : `فرع ${k.branch_id}`));
            const periodLabel = k.period === 'مسائي' ? 'مسائي' : k.period === 'موحد' ? 'شهري' : 'صباحي';
            labels.push(`${periodLabel} — أسبوع ${k.week_number} — فئة ${k.category} (${scope})`);
          });
        }

        const generalWarnings = [];
        if (!isSupported) {
          const generalConflicts = await invoke('check_general_category_conflicts', { data: payload });
          if (Array.isArray(generalConflicts) && generalConflicts.length > 0) {
            generalConflicts.forEach(c => {
              const periodLabel = c.period === 'مسائي' ? 'مسائي' : c.period === 'موحد' ? 'شهري' : 'صباحي';
              if (c.category === 'عام') {
                generalWarnings.push(`سيتم استبدال بيانات الفئات (${c.existing_categories.join('، ')}) ببيانات عام — ${periodLabel} أسبوع ${c.week_number}`);
              } else {
                generalWarnings.push(`سيتم استبدال بيانات عام المدخلة سابقاً بفئة ${c.category} — ${periodLabel} أسبوع ${c.week_number}`);
              }
            });
          }
        }

        if (labels.length > 0 || generalWarnings.length > 0) {
          setPendingConflict({ payload, labels, generalWarnings });
          return;
        }

        await performSave(payload);
      } else {
        toast.info('لم يتم إدخال أي قيم جديدة');
      }
    } catch (err) {
      toast.error(`حدث خطأ: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const confirmOverwrite = async () => {
    if (checkAndWarn()) return;
    if (!pendingConflict) return;
    const { payload } = pendingConflict;
    setSaving(true);
    try {
      await performSave(payload);
    } catch (err) {
      toast.error(`حدث خطأ: ${err}`);
    } finally {
      setSaving(false);
      setPendingConflict(null);
    }
  };

  const toggleClinic = (id) => {
    setSelectedClinicIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleEditRow = (row) => {
    const key = rowKey(row);
    const saved = savedDataRef.current.find(r => rowKey(r) === key);
    if (!saved) {
      toast.info('لا توجد بيانات محفوظة لهذه الجهة');
      return;
    }
    setData(prev => prev.map(r => (rowKey(r) === key ? { ...saved } : r)));
    toast.success('تم استرجاع بيانات الجهة من آخر حفظ');
  };

  const handleDeleteRow = async (row) => {
    if (checkAndWarn()) return;
    const entityName = row.clinic_name || row.area_name || row.branch_name || 'هذه الجهة';
    const periodDesc = entrySystem === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري موحد';
    if (!window.confirm(`هل أنت متأكد من حذف سجلات ${entityName} (${periodDesc})؟`)) return;

    setSaving(true);
    try {
      const deleted = await invoke('delete_medical_tickets_by_scope', {
        branchId: parseInt(row.branch_id),
        areaId: row.area_id && row.area_id > 0 ? row.area_id : null,
        clinicId: row.clinic_id && row.clinic_id > 0 ? row.clinic_id : null,
        dispenseMonth,
        weekNumber: entrySystem === 'weekly' ? selectedWeek : null,
        isSupported,
        category: isSupported ? null : selectedCategory,
      });

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'DELETE',
        tableName: 'medical_tickets',
        recordId: null,
        details: `حذف سجلات تذاكر طبية للجهة ${entityName} (${isSupported ? 'مدعم' : 'مجاني'}) شهر ${dispenseMonth} ${periodDesc}`
      });

      toast.success(deleted > 0 ? `تم حذف ${deleted} سجل بنجاح` : 'تم حذف السجلات بنجاح');
      await loadGridData();
    } catch (err) {
      toast.error(`فشل الحذف: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const branchOptions = branches.map(b => ({ value: String(b.id), label: b.name }));
  const areaOptions = areas.map(a => ({ value: String(a.id), label: a.name }));
  const entityLabel = level === 'branches' ? 'الفرع' : level === 'areas' ? 'المنطقة' : 'المنطقة / العيادة';

  // Filter data by search query
  const filteredData = data.filter(r => {
    if (!searchQuery.trim()) return true;
    const name = (r.clinic_name || r.area_name || r.branch_name || '').toLowerCase();
    const area = (r.area_name || '').toLowerCase();
    const branch = (r.branch_name || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || area.includes(q) || branch.includes(q);
  });

  const groupedData = filteredData.reduce((acc, row) => {
    const key = row.area_name || row.branch_name || 'بدون منطقة';
    if (!acc[key]) acc[key] = [];
    acc[key].push(row);
    return acc;
  }, {});

  // ── Dynamic export columns (مجاني / مدعوم × أسبوعي / شهري) ────────────
  // ExportMenu lazily loads Excel/Word/PDF engines on first click, so this
  // costs nothing at render time. Columns mirror exactly what the grid shows:
  // weekly = صباحي/مسائي pairs; monthly = 4 week columns (weekCellValue sums
  // the morning+evening pair, matching the unified موحد value being saved).
  const exportColumns = (() => {
    const cols = [{
      header: entityLabel,
      exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : (r.clinic_name || r.area_name || r.branch_name || `#${r.branch_id || r.area_id || r.clinic_id || ''}`),
    }];
    if (isSupported) {
      const cats = [
        { field: 'authority', label: 'هيئة' },
        { field: 'students', label: 'طلاب' },
        { field: 'infants', label: 'رضع' },
      ];
      if (entrySystem === 'weekly') {
        cats.forEach(c => cols.push({ header: `صباحي ${c.label}`, exportAccessor: (r) => r[`morning_${c.field}`] || 0 }));
        cats.forEach(c => cols.push({ header: `مسائي ${c.label}`, exportAccessor: (r) => r[`evening_${c.field}`] || 0 }));
      } else {
        for (let wi = 0; wi < 4; wi++) {
          cats.forEach(c => cols.push({ header: `أسبوع ${wi + 1} ${c.label}`, exportAccessor: (r) => weekCellValue(r, wi, `morning_${c.field}`) }));
        }
      }
    } else if (entrySystem === 'weekly') {
      cols.push({ header: 'صباحي 56ب', exportAccessor: (r) => r.morning_56b || 0 });
      cols.push({ header: 'صباحي 56ج', exportAccessor: (r) => r.morning_56c || 0 });
      cols.push({ header: 'مسائي 56ب', exportAccessor: (r) => r.evening_56b || 0 });
      cols.push({ header: 'مسائي 56ج', exportAccessor: (r) => r.evening_56c || 0 });
    } else {
      for (let wi = 0; wi < 4; wi++) {
        cols.push({ header: `أسبوع ${wi + 1} 56ب`, exportAccessor: (r) => weekCellValue(r, wi, 'morning_56b') });
        cols.push({ header: `أسبوع ${wi + 1} 56ج`, exportAccessor: (r) => weekCellValue(r, wi, 'morning_56c') });
      }
    }
    return cols;
  })();

  const exportOptions = {
    title: `التذاكر الطبية ${isSupported ? 'المدعومة' : 'المجانية'} — ${entrySystem === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري موحد'}`,
    fileName: `medical_tickets_${isSupported ? 'supported' : 'free'}_${entrySystem === 'weekly' ? `week${selectedWeek}` : 'monthly'}`,
    subtitle: `${level === 'branches' ? 'فروع' : level === 'areas' ? 'مناطق' : 'عيادات'} — شهر ${dispenseMonth}`,
    monthLabel: dispenseMonth,
  };

  // ── Export data with a totals row appended ────────────────────────────
  // Exports the FILTERED rows currently shown (groupedData is built from
  // filteredData), so the file matches the screen when search is active.
  // The totals row reuses the SAME shapes calculateTotals() already produces:
  // flat counters for weekly and a summed `weeks[0..3]` array for monthly — so
  // Excel/PDF/Word all render a final 'الإجمالي' row without any export-engine
  // changes. Marked with isTotalRow so the entity column shows 'الإجمالي'.
  const exportData = (() => {
    if (!filteredData || filteredData.length === 0) return [];
    const { totals: filteredTotals, weekTotals: filteredWeekTotals } = calculateTotals(filteredData);
    if (entrySystem === 'weekly') {
      return [...filteredData, { isTotalRow: true, ...filteredTotals }];
    }
    return [...filteredData, { isTotalRow: true, weeks: filteredWeekTotals.map(w => ({ ...w })) }];
  })();

  return (
    <div className="space-y-4 animate-slideUp" dir="rtl">
      <LockBanner />

      {/* ── Scope Bar ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-indigo-50/90 via-purple-50/90 to-blue-50/90 dark:from-indigo-950/30 dark:via-purple-950/30 dark:to-blue-950/30 p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/40 shadow-sm space-y-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 font-black text-sm text-indigo-800 dark:text-indigo-300">
            <Building2 size={18} className="text-indigo-600 dark:text-indigo-400" />
            <span>نطاق الإدخال السريع — {
              level === 'branches' ? 'فروع (اختر فرعاً أو الكل)' :
              level === 'areas' ? 'مناطق (اختر الفرع لتظهر جميع مناطقه)' :
              'عيادات (اختر الفرع والمنطقة ثم عيادة أو أكثر)'
            }</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-slate-500 dark:text-slate-400">نظام الإدخال:</span>
            <div className="flex p-1 bg-white dark:bg-slate-800 rounded-xl border border-indigo-200 dark:border-indigo-900/50 shadow-inner">
              <button
                type="button"
                onClick={() => requestSystemSwitch('weekly')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  entrySystem === 'weekly'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
                }`}
              >
                <Calendar size={14} />
                <span>أسبوعي</span>
              </button>
              <button
                type="button"
                onClick={() => requestSystemSwitch('monthly')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  entrySystem === 'monthly'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-purple-50 dark:hover:bg-purple-950/50'
                }`}
              >
                <CalendarDays size={14} />
                <span>شهري (موحد)</span>
              </button>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[220px] flex-1">
            <Select
              label="الفرع الرئيسي"
              icon={Building2}
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              options={branchOptions}
              placeholder={level === 'branches' ? 'الكل (جميع الفروع)' : 'اختر الفرع...'}
            />
          </div>

          {level === 'areas' && (
            <div className="min-w-[220px] flex-1">
              <label className="field-label">
                <MapPin size={16} />
                <span>المناطق</span>
              </label>
              <div className="h-11 flex items-center px-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-card)] text-sm font-bold text-indigo-600">
                {selectedBranch ? `سيتم عرض جميع مناطق الفرع (${areas.length})` : 'اختر الفرع أولاً'}
              </div>
            </div>
          )}

          {level === 'clinics' && (
            <div className="min-w-[220px] flex-1">
              <Select
                label="المنطقة الإحصائية"
                icon={MapPin}
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                options={areaOptions}
                placeholder="اختر المنطقة..."
                disabled={!selectedBranch}
              />
            </div>
          )}

          <div className="min-w-[180px]">
            <MonthInput value={dispenseMonth} onChange={onMonthChange} label="شهر الصرف" />
          </div>
        </div>

        {level === 'clinics' && selectedArea && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
              <Hospital size={14} /> العيادات:
            </span>
            {clinics.map(c => {
              const checked = selectedClinicIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleClinic(c.id)}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    checked
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                  }`}
                >
                  {checked ? <CheckSquare size={13} /> : <Square size={13} />}
                  {c.name}
                </button>
              );
            })}
            <div className="flex gap-1 mr-2">
              <button
                type="button"
                onClick={() => setSelectedClinicIds(clinics.map(c => c.id))}
                className="px-2 py-1 rounded-lg text-[10px] font-black bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100"
              >
                تحديد الكل
              </button>
              <button
                type="button"
                onClick={() => setSelectedClinicIds([])}
                className="px-2 py-1 rounded-lg text-[10px] font-black bg-red-50 text-red-500 border border-red-200 hover:bg-red-100"
              >
                إلغاء الكل
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Header Controls (System / Week / Type / Search / Actions) ───── */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-[var(--color-border)] shadow-sm no-print">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Week Selector (Only in Weekly mode) */}
          {entrySystem === 'weekly' ? (
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-slate-700 dark:text-slate-200">الأسبوع:</span>
              {[1, 2, 3, 4].map(w => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setSelectedWeek(w)}
                  className={`w-9 h-9 rounded-xl font-black text-sm transition-all ${
                    selectedWeek === w
                      ? 'bg-indigo-600 text-white shadow-md scale-105'
                      : 'bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-indigo-50'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-black">
              <CalendarDays size={16} />
              <span>إدخال الإجمالي الشهري الموحد (شهر {dispenseMonth})</span>
            </div>
          )}

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden md:block" />

          {/* Ticket Type (Free vs Supported) */}
          <div className="flex items-center gap-2">
            <span className="font-black text-sm text-slate-700 dark:text-slate-200">النوع:</span>
            <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setIsSupported(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  !isSupported ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-blue-600'
                }`}
              >
                مجاني (56ب/56ج)
              </button>
              <button
                type="button"
                onClick={() => setIsSupported(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                  isSupported ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-emerald-600'
                }`}
              >
                مدعوم
              </button>
            </div>
          </div>

          {/* Funding Category (Free tickets only) */}
          {!isSupported && (
            <div className="flex items-center gap-2">
              <span className="font-black text-sm text-slate-700 dark:text-slate-200">الفئة:</span>
              <div className="flex p-1 bg-slate-100 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 flex-wrap">
                {['عام', 'هيئة', 'طلاب', 'رضع', 'المرأة المعيلة'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-black transition-all ${
                      selectedCategory === cat
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {cat === 'عام' ? 'عام (الكل)' : cat}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls & Search */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative min-w-[160px]">
            <Search size={14} className="absolute right-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="تصفية السطور..."
              className="w-full pl-3 pr-8 py-1.5 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 focus:text-slate-900 dark:focus:text-white"
            />
          </div>

          <button
            type="button"
            onClick={handleResetAllValues}
            disabled={saving || data.length === 0 || isLocked}
            className="p-2 rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-all text-xs font-bold flex items-center gap-1 disabled:opacity-40"
            title="تصفية الأرقام"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">تصفية</span>
          </button>

          {entrySystem === 'monthly' && (
            <>
              <div className="flex items-center gap-1 p-1 rounded-xl border border-indigo-200 dark:border-indigo-900/40 bg-white dark:bg-slate-800 shadow-sm">
                <select
                  value={copySourceWeek}
                  onChange={(e) => setCopySourceWeek(parseInt(e.target.value, 10))}
                  disabled={saving || data.length === 0 || isLocked}
                  className="bg-transparent text-xs font-black text-indigo-600 dark:text-indigo-400 px-1 py-1 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40 cursor-pointer"
                  title="اختر الأسبوع المصدر للنسخ"
                >
                  {[1, 2, 3, 4].map(w => (
                    <option key={w} value={w}>الأسبوع {w}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCopyFromWeek}
                  disabled={saving || data.length === 0 || isLocked}
                  className="px-2 py-1 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-all text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                  title={`نسخ قيم الأسبوع ${copySourceWeek} إلى بقية الأسابيع لجميع الجهات`}
                >
                  <Copy size={14} />
                  <span className="hidden sm:inline">نسخ</span>
                </button>
              </div>
              <button
                type="button"
                onClick={handleClearAllWeeks}
                disabled={saving || data.length === 0 || isLocked}
                className="p-2 rounded-xl text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-red-200 dark:border-red-900/40 transition-all text-xs font-bold flex items-center gap-1 disabled:opacity-40"
                title="مسح قيم الأسابيع الأربعة كاملة"
              >
                <Trash2 size={14} />
                <span className="hidden sm:inline">مسح الأسابيع</span>
              </button>
            </>
          )}

          <Button onClick={loadGridData} variant="secondary" icon={RefreshCw} disabled={saving}>
            تحديث
          </Button>

          <ExportMenu
            ref={exportMenuRef}
            data={exportData}
            columns={exportColumns}
            options={exportOptions}
            disabled={saving || data.length === 0}
          />

          <Button onClick={handleSaveAll} variant="success" icon={Save} loading={saving} disabled={saving || isLocked}>
            حفظ الكل
          </Button>
        </div>
      </div>

      {/* ── Keyboard Shortcuts Legend ──────────────────────────────────── */}
      {scopeReady() && !loading && data.length > 0 && (
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-900/50 px-3 py-1.5 rounded-xl border border-slate-200/60 dark:border-slate-800 no-print">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-amber-500 animate-pulse" />
            <span>تنقل سريع باللوحة: استخدم أسهم الاتجاهات <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">↑</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">↓</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">←</kbd> <kbd className="px-1 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">→</kbd> أو <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-700 font-mono text-[10px]">Enter</kbd> للانتقال المباشر بين الخانات.</span>
          </div>
          <div className="font-mono text-indigo-600 dark:text-indigo-400">
            {filteredData.length} جهة ({entrySystem === 'weekly' ? `أسبوع ${selectedWeek}` : 'إجمالي شهري'})
          </div>
        </div>
      )}

      {/* ── Scope hint / loading / grid state ──────────────────────────── */}
      {!scopeReady() && (
        <div className="p-8 text-center opacity-60 bg-white dark:bg-slate-800 rounded-2xl border border-[var(--color-border)] no-print">
          <AlertCircle className="mx-auto mb-2 text-amber-500" size={32} />
          <p className="font-bold text-slate-700 dark:text-slate-300">
            {!dispenseMonth ? 'الرجاء تحديد الشهر أولاً'
              : (level === 'areas' || level === 'clinics') && !selectedBranch ? 'الرجاء تحديد الفرع أولاً'
              : level === 'clinics' && !selectedArea ? 'الرجاء تحديد المنطقة أولاً'
              : 'الرجاء إكمال تحديد النطاق'}
          </p>
        </div>
      )}

      {scopeReady() && loading && (
        <div className="p-8 text-center bg-white dark:bg-slate-800 rounded-2xl border border-[var(--color-border)] no-print">
          <RefreshCw className="animate-spin mx-auto text-indigo-600" size={32} />
          <p className="mt-2 text-xs font-bold text-slate-500">جاري تحميل بيانات الشبكة السريعة...</p>
        </div>
      )}

      {scopeReady() && !loading && data.length === 0 && (
        <div className="p-8 text-center opacity-60 bg-white dark:bg-slate-800 rounded-2xl border border-[var(--color-border)] no-print">
          <AlertCircle className="mx-auto mb-2 text-slate-400" size={32} />
          <p className="font-bold text-slate-600 dark:text-slate-400">لا توجد جهات لعرضها في هذا النطاق</p>
        </div>
      )}

      {/* ── FREE TICKETS TABLE (مجاني 56ب / 56ج) ────────────────────────── */}
      {scopeReady() && !loading && !isSupported && filteredData.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] shadow-sm bg-white dark:bg-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-10 font-black">
              <tr>
                <th className="p-3 border-b border-[var(--color-border)] min-w-[180px]">{entityLabel}</th>
                {entrySystem === 'weekly' ? (
                  <>
                    <th className="p-3 border-b border-[var(--color-border)] bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 text-center" colSpan="2">صباحي</th>
                    <th className="p-3 border-b border-[var(--color-border)] bg-indigo-100 dark:bg-indigo-950/60 text-indigo-900 dark:text-indigo-300 text-center" colSpan="2">مسائي</th>
                  </>
                ) : (
                  <>
                    {[1, 2, 3, 4].map(w => (
                      <th key={`fw-${w}`} className="p-3 border-b border-[var(--color-border)] bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 text-center" colSpan="2">أسبوع {w}</th>
                    ))}
                  </>
                )}
                <th className="p-3 border-b border-[var(--color-border)] text-center text-slate-600 dark:text-slate-400 min-w-[70px]">إجمالي</th>
                <th className="p-3 border-b border-[var(--color-border)] text-center text-slate-500 min-w-[110px] no-print">الإجراءات</th>
              </tr>
              <tr>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                {entrySystem === 'weekly' ? (
                  <>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 min-w-[110px]">56ب</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-amber-100/60 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 min-w-[110px]">56ج</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 min-w-[110px]">56ب</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-indigo-100/60 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 min-w-[110px]">56ج</th>
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map(wi => (
                      <React.Fragment key={`fws-${wi}`}>
                        <th className="p-2 border-b border-[var(--color-border)] text-center bg-purple-100/60 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 min-w-[110px]">56ب</th>
                        <th className="p-2 border-b border-[var(--color-border)] text-center bg-purple-100/60 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 min-w-[110px]">56ج</th>
                      </React.Fragment>
                    ))}
                  </>
                )}
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {Object.entries(groupedData).map(([areaName, rows]) => (
                <React.Fragment key={areaName}>
                  <tr className="bg-slate-100/80 dark:bg-slate-900/80">
                    <td colSpan={entrySystem === 'weekly' ? 7 : 11} className="p-2.5 font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 text-xs">
                      <MapPin size={15} className="text-amber-500" />
                      <span>{areaName}</span>
                    </td>
                  </tr>
                  {rows.map((row) => {
                    const dataIndex = data.indexOf(row);
                    const rowSum = entrySystem === 'weekly'
                      ? row.morning_56b + row.morning_56c + row.evening_56b + row.evening_56c
                      : [0, 1, 2, 3].reduce(
                          (s, wi) => s + weekCellValue(row, wi, 'morning_56b') + weekCellValue(row, wi, 'morning_56c'),
                          0
                        );
                    const maxCols = entrySystem === 'weekly' ? 4 : 8;

                    return (
                      <tr key={rowKey(row)} className="hover:bg-indigo-50/40 dark:hover:bg-slate-700/40 transition-colors">
                        <td className="p-2.5 font-bold flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                          <Hospital size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span>{row.clinic_name || row.branch_name}</span>
                        </td>

                        {entrySystem === 'weekly' ? (
                          <>
                            {/* Cell 0: Morning 56b */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-0`}
                                type="number"
                                value={row.morning_56b}
                                onChange={e => handleInputChange(dataIndex, 'morning_56b', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 0, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-amber-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.morning_56b}</span>
                            </td>

                            {/* Cell 1: Morning 56c */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-1`}
                                type="number"
                                value={row.morning_56c}
                                onChange={e => handleInputChange(dataIndex, 'morning_56c', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 1, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-amber-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.morning_56c}</span>
                            </td>

                            {/* Cell 2: Evening 56b */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-2`}
                                type="number"
                                value={row.evening_56b}
                                onChange={e => handleInputChange(dataIndex, 'evening_56b', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 2, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.evening_56b}</span>
                            </td>

                            {/* Cell 3: Evening 56c */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-3`}
                                type="number"
                                value={row.evening_56c}
                                onChange={e => handleInputChange(dataIndex, 'evening_56c', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 3, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-indigo-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.evening_56c}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            {[0, 1, 2, 3].map(wi => (
                              <React.Fragment key={wi}>
                                {/* Week {wi + 1}: 56b / 56c (unified monthly) */}
                                <td className="p-1">
                                  <input
                                    id={`cell-${dataIndex}-${wi * 2}`}
                                    type="number"
                                    value={weekCellValue(row, wi, 'morning_56b')}
                                    onChange={e => handleWeekInputChange(dataIndex, wi, 'morning_56b', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, dataIndex, wi * 2, maxCols)}
                                    disabled={isLocked}
                                    className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-purple-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                    min="0"
                                  />
                                  <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{weekCellValue(row, wi, 'morning_56b')}</span>
                                </td>
                                <td className="p-1">
                                  <input
                                    id={`cell-${dataIndex}-${wi * 2 + 1}`}
                                    type="number"
                                    value={weekCellValue(row, wi, 'morning_56c')}
                                    onChange={e => handleWeekInputChange(dataIndex, wi, 'morning_56c', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, dataIndex, wi * 2 + 1, maxCols)}
                                    disabled={isLocked}
                                    className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-purple-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                    min="0"
                                  />
                                  <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{weekCellValue(row, wi, 'morning_56c')}</span>
                                </td>
                              </React.Fragment>
                            ))}
                          </>
                        )}

                        {/* Row Total Badge */}
                        <td className="p-2 text-center font-mono font-black text-xs text-indigo-700 dark:text-indigo-300">
                          <span className={`px-2 py-1 rounded-lg ${rowSum > 0 ? 'bg-indigo-100 dark:bg-indigo-950/80' : 'opacity-40'}`}>
                            {rowSum}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-2 text-center whitespace-nowrap no-print">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyPreviousRow(dataIndex)}
                              disabled={dataIndex === 0 || isLocked}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all disabled:opacity-20"
                              title="نسخ قيم الصف السابق"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditRow(row)}
                              disabled={isLocked}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all disabled:opacity-30"
                              title="تعديل (استرجاع من آخر حفظ)"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={saving || isLocked}
                              onClick={() => handleDeleteRow(row)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all disabled:opacity-40"
                              title="حذف سجلات هذه الجهة"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-indigo-600 dark:bg-indigo-900 text-white font-black">
              <tr>
                <td className="p-3 border-t border-indigo-500 flex items-center gap-2">
                  <Calculator size={16} /> الإجمالي
                </td>
                {entrySystem === 'weekly' ? (
                  <>
                    <td className="p-3 border-t border-indigo-500 text-center font-mono">{totals.morning_56b}</td>
                    <td className="p-3 border-t border-indigo-500 text-center font-mono">{totals.morning_56c}</td>
                    <td className="p-3 border-t border-indigo-500 text-center font-mono">{totals.evening_56b}</td>
                    <td className="p-3 border-t border-indigo-500 text-center font-mono">{totals.evening_56c}</td>
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map(wi => (
                      <React.Fragment key={`ft-${wi}`}>
                        <td className="p-3 border-t border-indigo-500 text-center font-mono">{weekTotals[wi].morning_56b + weekTotals[wi].evening_56b}</td>
                        <td className="p-3 border-t border-indigo-500 text-center font-mono">{weekTotals[wi].morning_56c + weekTotals[wi].evening_56c}</td>
                      </React.Fragment>
                    ))}
                  </>
                )}
                <td className="p-3 border-t border-indigo-500 text-center font-mono">
                  {entrySystem === 'weekly'
                    ? totals.morning_56b + totals.morning_56c + totals.evening_56b + totals.evening_56c
                    : totals.morning_56b + totals.morning_56c + totals.evening_56b + totals.evening_56c}
                </td>
                <td className="p-3 border-t border-indigo-500"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── SUPPORTED TICKETS TABLE (مدعم) ───────────────────────────────── */}
      {scopeReady() && !loading && isSupported && filteredData.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)] shadow-sm bg-white dark:bg-slate-800">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-100 dark:bg-slate-900 sticky top-0 z-10 font-black">
              <tr>
                <th className="p-3 border-b border-[var(--color-border)] min-w-[180px]">{entityLabel}</th>
                {entrySystem === 'weekly' ? (
                  <>
                    <th className="p-3 border-b border-[var(--color-border)] bg-blue-100 dark:bg-blue-950/60 text-blue-900 dark:text-blue-300 text-center" colSpan="3">صباحي</th>
                    <th className="p-3 border-b border-[var(--color-border)] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-300 text-center" colSpan="3">مسائي</th>
                  </>
                ) : (
                  <>
                    {[1, 2, 3, 4].map(w => (
                      <th key={`sw-${w}`} className="p-3 border-b border-[var(--color-border)] bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-300 text-center" colSpan="3">أسبوع {w}</th>
                    ))}
                  </>
                )}
                <th className="p-3 border-b border-[var(--color-border)] text-center text-slate-600 dark:text-slate-400 min-w-[70px]">إجمالي</th>
                <th className="p-3 border-b border-[var(--color-border)] text-center text-slate-500 min-w-[110px] no-print">الإجراءات</th>
              </tr>
              <tr>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                {entrySystem === 'weekly' ? (
                  <>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-100/60 text-blue-800 min-w-[110px]">هيئة</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-100/60 text-blue-800 min-w-[110px]">طلاب</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-blue-100/60 text-blue-800 min-w-[110px]">رضع</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-100/60 text-emerald-800 min-w-[110px]">هيئة</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-100/60 text-emerald-800 min-w-[110px]">طلاب</th>
                    <th className="p-2 border-b border-[var(--color-border)] text-center bg-emerald-100/60 text-emerald-800 min-w-[110px]">رضع</th>
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map(wi => (
                      <React.Fragment key={`sws-${wi}`}>
                        <th className="p-2 border-b border-[var(--color-border)] text-center bg-purple-100/60 text-purple-800 min-w-[110px]">هيئة</th>
                        <th className="p-2 border-b border-[var(--color-border)] text-center bg-purple-100/60 text-purple-800 min-w-[110px]">طلاب</th>
                        <th className="p-2 border-b border-[var(--color-border)] text-center bg-purple-100/60 text-purple-800 min-w-[110px]">رضع</th>
                      </React.Fragment>
                    ))}
                  </>
                )}
                <th className="p-2 border-b border-[var(--color-border)]"></th>
                <th className="p-2 border-b border-[var(--color-border)]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {Object.entries(groupedData).map(([areaName, rows]) => (
                <React.Fragment key={areaName}>
                  <tr className="bg-slate-100/80 dark:bg-slate-900/80">
                    <td colSpan={entrySystem === 'weekly' ? 9 : 15} className="p-2.5 font-black text-slate-700 dark:text-slate-300 flex items-center gap-2 text-xs">
                      <MapPin size={15} className="text-amber-500" />
                      <span>{areaName}</span>
                    </td>
                  </tr>
                  {rows.map((row) => {
                    const dataIndex = data.indexOf(row);
                    const rowSum = entrySystem === 'weekly'
                      ? row.morning_authority + row.morning_students + row.morning_infants +
                        row.evening_authority + row.evening_students + row.evening_infants
                      : [0, 1, 2, 3].reduce(
                          (s, wi) => s + weekCellValue(row, wi, 'morning_authority') + weekCellValue(row, wi, 'morning_students') + weekCellValue(row, wi, 'morning_infants'),
                          0
                        );
                    const maxCols = entrySystem === 'weekly' ? 6 : 12;

                    return (
                      <tr key={rowKey(row)} className="hover:bg-indigo-50/40 dark:hover:bg-slate-700/40 transition-colors">
                        <td className="p-2.5 font-bold flex items-center gap-2 text-xs text-slate-800 dark:text-slate-200">
                          <Hospital size={14} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{row.clinic_name || row.branch_name}</span>
                        </td>

                        {entrySystem === 'weekly' ? (
                          <>
                            {/* Cell 0: Morning Authority */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-0`}
                                type="number"
                                value={row.morning_authority}
                                onChange={e => handleInputChange(dataIndex, 'morning_authority', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 0, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.morning_authority}</span>
                            </td>

                            {/* Cell 1: Morning Students */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-1`}
                                type="number"
                                value={row.morning_students}
                                onChange={e => handleInputChange(dataIndex, 'morning_students', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 1, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.morning_students}</span>
                            </td>

                            {/* Cell 2: Morning Infants */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-2`}
                                type="number"
                                value={row.morning_infants}
                                onChange={e => handleInputChange(dataIndex, 'morning_infants', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 2, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.morning_infants}</span>
                            </td>

                            {/* Cell 3: Evening Authority */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-3`}
                                type="number"
                                value={row.evening_authority}
                                onChange={e => handleInputChange(dataIndex, 'evening_authority', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 3, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.evening_authority}</span>
                            </td>

                            {/* Cell 4: Evening Students */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-4`}
                                type="number"
                                value={row.evening_students}
                                onChange={e => handleInputChange(dataIndex, 'evening_students', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 4, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.evening_students}</span>
                            </td>

                            {/* Cell 5: Evening Infants */}
                            <td className="p-1">
                              <input
                                id={`cell-${dataIndex}-5`}
                                type="number"
                                value={row.evening_infants}
                                onChange={e => handleInputChange(dataIndex, 'evening_infants', e.target.value)}
                                onKeyDown={e => handleKeyDown(e, dataIndex, 5, maxCols)}
                                disabled={isLocked}
                                className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-emerald-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                min="0"
                              />
                              <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{row.evening_infants}</span>
                            </td>
                          </>
                        ) : (
                          <>
                            {[0, 1, 2, 3].map(wi => (
                              <React.Fragment key={wi}>
                                {/* Week {wi + 1}: هيئة / طلاب / رضع (unified monthly) */}
                                <td className="p-1">
                                  <input
                                    id={`cell-${dataIndex}-${wi * 3}`}
                                    type="number"
                                    value={weekCellValue(row, wi, 'morning_authority')}
                                    onChange={e => handleWeekInputChange(dataIndex, wi, 'morning_authority', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, dataIndex, wi * 3, maxCols)}
                                    disabled={isLocked}
                                    className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-purple-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                    min="0"
                                  />
                                  <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{weekCellValue(row, wi, 'morning_authority')}</span>
                                </td>
                                <td className="p-1">
                                  <input
                                    id={`cell-${dataIndex}-${wi * 3 + 1}`}
                                    type="number"
                                    value={weekCellValue(row, wi, 'morning_students')}
                                    onChange={e => handleWeekInputChange(dataIndex, wi, 'morning_students', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, dataIndex, wi * 3 + 1, maxCols)}
                                    disabled={isLocked}
                                    className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-purple-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                    min="0"
                                  />
                                  <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{weekCellValue(row, wi, 'morning_students')}</span>
                                </td>
                                <td className="p-1">
                                  <input
                                    id={`cell-${dataIndex}-${wi * 3 + 2}`}
                                    type="number"
                                    value={weekCellValue(row, wi, 'morning_infants')}
                                    onChange={e => handleWeekInputChange(dataIndex, wi, 'morning_infants', e.target.value)}
                                    onKeyDown={e => handleKeyDown(e, dataIndex, wi * 3 + 2, maxCols)}
                                    disabled={isLocked}
                                    className="w-full min-w-[96px] p-2.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50/50 dark:bg-slate-900/50 focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-purple-500 text-center font-black font-mono text-[15px] text-slate-800 dark:text-slate-100 dark:focus:text-white disabled:opacity-50 disabled:cursor-not-allowed print:hidden"
                                    min="0"
                                  />
                                  <span className="hidden print:block w-full min-w-[96px] p-2.5 text-center font-black font-mono text-[15px] text-slate-800">{weekCellValue(row, wi, 'morning_infants')}</span>
                                </td>
                              </React.Fragment>
                            ))}
                          </>
                        )}

                        {/* Row Total Badge */}
                        <td className="p-2 text-center font-mono font-black text-xs text-emerald-700 dark:text-emerald-300">
                          <span className={`px-2 py-1 rounded-lg ${rowSum > 0 ? 'bg-emerald-100 dark:bg-emerald-950/80' : 'opacity-40'}`}>
                            {rowSum}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="p-2 text-center whitespace-nowrap no-print">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleCopyPreviousRow(dataIndex)}
                              disabled={dataIndex === 0 || isLocked}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-all disabled:opacity-20"
                              title="نسخ قيم الصف السابق"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleEditRow(row)}
                              disabled={isLocked}
                              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-all disabled:opacity-30"
                              title="تعديل (استرجاع من آخر حفظ)"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={saving || isLocked}
                              onClick={() => handleDeleteRow(row)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 transition-all disabled:opacity-40"
                              title="حذف سجلات هذه الجهة"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
            <tfoot className="bg-emerald-600 dark:bg-emerald-900 text-white font-black">
              <tr>
                <td className="p-3 border-t border-emerald-500 flex items-center gap-2">
                  <Calculator size={16} /> الإجمالي
                </td>
                {entrySystem === 'weekly' ? (
                  <>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.morning_authority}</td>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.morning_students}</td>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.morning_infants}</td>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.evening_authority}</td>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.evening_students}</td>
                    <td className="p-3 border-t border-emerald-500 text-center font-mono">{totals.evening_infants}</td>
                  </>
                ) : (
                  <>
                    {[0, 1, 2, 3].map(wi => (
                      <React.Fragment key={`st-${wi}`}>
                        <td className="p-3 border-t border-emerald-500 text-center font-mono">{weekTotals[wi].morning_authority + weekTotals[wi].evening_authority}</td>
                        <td className="p-3 border-t border-emerald-500 text-center font-mono">{weekTotals[wi].morning_students + weekTotals[wi].evening_students}</td>
                        <td className="p-3 border-t border-emerald-500 text-center font-mono">{weekTotals[wi].morning_infants + weekTotals[wi].evening_infants}</td>
                      </React.Fragment>
                    ))}
                  </>
                )}
                <td className="p-3 border-t border-emerald-500 text-center font-mono">
                  {entrySystem === 'weekly'
                    ? totals.morning_authority + totals.morning_students + totals.morning_infants +
                      totals.evening_authority + totals.evening_students + totals.evening_infants
                    : totals.morning_authority + totals.morning_students + totals.morning_infants +
                      totals.evening_authority + totals.evening_students + totals.evening_infants}
                </td>
                <td className="p-3 border-t border-emerald-500"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* ── Summary Stats Badges ────────────────────────────────────────── */}
      {scopeReady() && !loading && data.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
          <div className="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-900/40">
            <p className="text-xs text-blue-600 dark:text-blue-400 font-bold mb-1">إجمالي 56ب</p>
            <p className="text-2xl font-black font-mono text-blue-700 dark:text-blue-300">
              {totals.morning_56b + totals.evening_56b}
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/40 p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/40">
            <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-1">إجمالي 56ج</p>
            <p className="text-2xl font-black font-mono text-emerald-700 dark:text-emerald-300">
              {totals.morning_56c + totals.evening_56c}
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-2xl border border-amber-200 dark:border-amber-900/40">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-bold mb-1">عدد الجهات المعروضة</p>
            <p className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300">
              {filteredData.length} / {data.length}
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-950/40 p-4 rounded-2xl border border-purple-200 dark:border-purple-900/40">
            <p className="text-xs text-purple-600 dark:text-purple-400 font-bold mb-1">المجموعات الإحصائية</p>
            <p className="text-2xl font-black font-mono text-purple-700 dark:text-purple-300">
              {Object.keys(groupedData).length}
            </p>
          </div>
        </div>
      )}

      {/* Overwrite Confirmation Modal */}
      <ConfirmModal
        isOpen={!!pendingConflict}
        onConfirm={confirmOverwrite}
        onCancel={() => setPendingConflict(null)}
        title="تم إدخال الفترة من قبل"
        message={pendingConflict
          ? [
              pendingConflict.labels.length > 0
                ? `الفترات التالية مدخلة من قبل بقيم مختلفة: ${pendingConflict.labels.join('، ')}.`
                : '',
              ...(pendingConflict.generalWarnings || []),
            ].filter(Boolean).join(' ')
          : ''}
        detail="يمكنك الذهاب للتعديل إذا كنت تريد تغيير البيانات — هل تريد استبدال القيم الحالية؟"
        confirmText="استبدال البيانات"
        cancelText="إلغاء"
        variant="warning"
        loading={saving}
      />
    </div>
  );
};

export default QuickTicketsEntry;
