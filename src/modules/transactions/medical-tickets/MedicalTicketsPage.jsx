import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import PageHeader from "../../../components/ui/PageHeader";
import Breadcrumb from "../../../components/ui/Breadcrumb";
import HierarchySelector from "../../../components/common/HierarchySelector";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import Input from "../../../components/ui/Input";
import Select from "../../../components/ui/Select";
import Table from "../../../components/ui/Table";
import { useToast } from "../../../components/ui/Toast";
import { useGlobalApp } from "../../../context/useGlobalApp";
import { useAuth } from "../../../context/AuthContext";
import invoke from "../../../api/tauriApi";
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import { buildHierarchyLabel } from "../../../utils/reportUtils";
import {
  ClipboardList,
  Hash,
  Clock,
  Save,
  Building2,
  HelpCircle,
  CalendarDays,
  CalendarRange,
  Lock,
  Unlock,
  RotateCcw,
  Sun,
  Moon,
  Calculator,
  Trash2,
  Edit2,
  Search,
  Printer,
  AlertCircle,
   GraduationCap,
   Baby,
   Layers,
   Copy,
} from "lucide-react";
import Pagination from "../../../components/ui/Pagination";
import useKeyboardShortcuts from "../../../hooks/useKeyboardShortcuts";
import PrintableTable from "../../../components/common/PrintableTable";
import useReportSignatures from "../../../hooks/useReportSignatures";
import StatsBar from "../../../components/common/StatsBar";
import ExportMenu from "../../../components/ui/ExportMenu";
import { executePrint } from "../../../utils/exportPrint";
import MedicalTicketsGridEntry from "../../../components/forms/MedicalTicketsGridEntry";
import useLockGuard from "../../../hooks/useLockGuard";

const MedicalTicketsPage = () => {
  const { user } = useAuth();
  const { hierarchyNames, activeHierarchy, workspaceMode, checkIsMonthLocked } = useGlobalApp();
  const { signatures, loadSignatures: ensureSignaturesLoaded } = useReportSignatures();
  const toast = useToast();
  const location = useLocation();

  // --- الحالة الأساسية ---
  const [hierarchy, setHierarchy] = useState({
    branchId: location.state?.branchId || activeHierarchy.branchId || "",
    areaId: location.state?.areaId || activeHierarchy.areaId || "",
    clinicId: location.state?.clinicId || activeHierarchy.clinicId || "",
    dispenseMonth:
      location.state?.dispenseMonth || activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7),
  });

  const { isLocked, LockBanner } = useLockGuard(hierarchy.dispenseMonth);

  const [isLocationFixed, setIsLocationFixed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [entryMode, setEntryMode] = useState("weekly"); // 'weekly', 'monthly', or 'daily'
  const [selectedCategory, setSelectedCategory] = useState("رضع");
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [entryDate, setEntryDate] = useState(
    new Date().toISOString().substring(0, 10),
  );

  const [records, setRecords] = useState([]);
  const [, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingConflict, setPendingConflict] = useState(null);
  // Set to true whenever the user EDITS the monthly form. Consumed by
  // requestEntryModeSwitch: if the monthly form was changed since the last
  // weekly↔monthly carry, the monthly value is authoritative and overwrites
  // the weekly split on return (otherwise the original صباحي/مسائي split is
  // preserved through a plain round-trip).
  const monthlyEditedRef = useRef(false);

  // حالة البحث والترقيم
  const [currentPageOwned, setCurrentPageOwned] = useState(1);
  const [currentPageSupported, setCurrentPageSupported] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLockStatus, setFilterLockStatus] = useState("all");
  const [filterHighVolume, setFilterHighVolume] = useState(false);
  const [tableViewMode, setTableViewMode] = useState("all"); // 'all', 'owned', 'supported'

  // --- بيانات النموذج ---
  const [weeklyForm, setWeeklyForm] = useState({
    morning_56b: "",
    morning_56c: "",
    evening_56b: "",
    evening_56c: "",
  });

  const [supportedWeeklyForm, setSupportedWeeklyForm] = useState({
    morning_authority: "",
    morning_students: "",
    morning_infants: "",
    evening_authority: "",
    evening_students: "",
    evening_infants: "",
  });

  const [monthlyForm, setMonthlyForm] = useState([
    { week: 1, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
    { week: 2, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
    { week: 3, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
    { week: 4, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
  ]);   
  useEffect(() => {
    // Load records whenever a month is selected — branchId may be empty in
    // "all branches" mode, in which case the backend returns every branch.
    if (hierarchy.dispenseMonth) loadRecords();
  }, [hierarchy, isSupported]); // eslint-disable-line react-hooks/exhaustive-deps

  
  const loadRecords = async () => {
    if (!hierarchy.dispenseMonth) {
      return;
    }
    setLoading(true);
    try {
      const data = await invoke("get_medical_tickets_report", {
        branchId:
          hierarchy.branchId && !isNaN(parseInt(hierarchy.branchId))
            ? parseInt(hierarchy.branchId)
            : null,
        areaId: null,
        clinicId: null,
        dispenseMonth: hierarchy.dispenseMonth,
      });
      setRecords(data);
    } catch (err) {
      toast.error("فشل تحميل السجلات");
    } finally {
      setLoading(false);
    }
  };

  // ── Shared save + duplicate/overwrite guard (mirrors quick entry) ──────
  // Builds a payload once, then either saves it directly or — when a period
  // was already entered with DIFFERENT values, or a عام entry would silently
  // wipe per-category rows (and vice versa) — asks the user for consent via
  // the "استبدال البيانات" confirmation modal before overwriting.
  const performSave = async (payload, { successMsg, logDetails, resetFn }) => {
    setSaving(true);
    try {
      await invoke("save_medical_tickets_bulk", { data: payload });

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'BULK_UPDATE',
        tableName: 'medical_tickets',
        recordId: null,
        details: logDetails
      });

      toast.success(successMsg);
      loadRecords();
      if (resetFn) resetFn();
    } catch (err) {
      // Surface the real backend message (e.g. the triple-isolation lock
      // error "هذا الشهر مقفل على مستوى إدخال 'الفرع'") instead of a generic one.
      toast.error(typeof err === "string" && err ? err : "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  const detectSaveConflicts = async (payload) => {
    const labels = [];
    const generalWarnings = [];
    // Identity keys of the payload rows that would be overwritten — used by
    // "تجاوز وحفظ الباقي" to drop ONLY the conflicting periods and save the rest.
    const skipKeys = [];
    const scope = payload[0] || {};

    // 1) Value-aware duplicate check via backend (same identity, different
    //    values → the real data-corruption risk). Identical re-saves pass.
    //    The backend is period-family aware: a weekly save also flags an
    //    existing monthly (موحد) row for the same scope, and vice versa.
    const alreadyExists = await invoke('check_medical_tickets_exist', { data: payload });
    if (Array.isArray(alreadyExists) && alreadyExists.length > 0) {
      alreadyExists.forEach(k => {
        const periodLabel = k.period === 'مسائي' ? 'مسائي' : k.period === 'موحد' ? 'شهري' : 'صباحي';
        labels.push(`${periodLabel} — أسبوع ${k.week_number} — فئة ${k.category}`);
        skipKeys.push({
          branch_id: k.branch_id, area_id: k.area_id, clinic_id: k.clinic_id,
          week_number: k.week_number, category: k.category, period: k.period,
          supported: isSupported,
        });
      });
    }

    // 2) عام ↔ فئات replacement warning (free tickets only). Queried directly
    //    from the backend (fresh DB read) so the warning can NEVER be skipped
    //    by an unloaded/async client-side records state.
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
          skipKeys.push({
            branch_id: scope.branch_id, area_id: scope.area_id, clinic_id: scope.clinic_id,
            week_number: c.week_number, category: c.category, period: c.period,
            supported: false,
          });
        });
      }
    }

    if (labels.length === 0 && generalWarnings.length === 0) return null;
    return { labels, generalWarnings, skipKeys };
  };

  // ── Skip-and-save-the-rest (تجاوز وحفظ الباقي) ──────────────────────
  // Drops only the conflicting rows from the payload and saves everything else
  // unchanged, so the user can keep the previously-saved periods (e.g. the
  // weekly data) while still persisting the other weeks/periods they typed.
  const skipConflicts = async () => {
    if (!pendingConflict) return;
    const { payload, skipKeys, successMsg, logDetails, resetFn } = pendingConflict;
    setPendingConflict(null);
    const remaining = (payload || []).filter((item) => {
      const itemUnified = String(item.period).includes('موحد');
      return !(skipKeys || []).some((k) => {
        const sameIdentity =
          String(k.branch_id ?? '') === String(item.branch_id ?? '') &&
          String(k.area_id ?? '') === String(item.area_id ?? '') &&
          String(k.clinic_id ?? '') === String(item.clinic_id ?? '') &&
          Number(k.week_number) === Number(item.week_number) &&
          String(k.category ?? '') === String(item.category ?? '') &&
          !!k.supported === !!item.is_supported_clinic;
        if (!sameIdentity) return false;
        // Exact period match OR cross-family (موحد ↔ صباحي/مسائي): the incoming
        // row would replace the stored one, so it belongs to the skip set.
        const keyUnified = String(k.period).includes('موحد');
        return k.period === item.period || itemUnified !== keyUnified;
      });
    });

    if (remaining.length === 0) {
      toast.info("تم تجاوز جميع الفترات المتعارضة — لم يتم حفظ أي بيانات.");
      if (resetFn) resetFn();
      return;
    }
    await performSave(remaining, {
      successMsg: `${successMsg} (مع تجاوز الفترات المتعارضة)`,
      logDetails,
      resetFn,
    });
  };

  const confirmOverwrite = async () => {
    if (!pendingConflict) return;
    const { payload, successMsg, logDetails, resetFn } = pendingConflict;
    setPendingConflict(null);
    await performSave(payload, { successMsg, logDetails, resetFn });
  };

  // ── Pre-save triple-isolation check ────────────────────────────────
  // Fails EARLY (before the user fills the form) when the selected month is
  // already locked at a different hierarchy level. Mirrors the backend
  // enforce_isolation_lock so the user never wastes time entering data that
  // the save will reject.
  const checkIsolationBeforeSave = async () => {
    if (!hierarchy.branchId || isEditing) return true;
    const myLevel = hierarchy.clinicId ? "clinic" : hierarchy.areaId ? "area" : "branch";
    try {
      const lockedLevel = await invoke("get_month_isolation_rule", {
        branchId: parseInt(hierarchy.branchId),
        dispenseMonth: hierarchy.dispenseMonth,
      });
      if (lockedLevel && lockedLevel !== myLevel) {
        const names = { branch: "الفرع", area: "المنطقة", clinic: "العيادة" };
        toast.error(
          `خطأ في العزل الثلاثي: هذا الشهر مقفل على مستوى إدخال '${names[lockedLevel] || lockedLevel}'. ` +
          `لا يمكن الإدخال على مستوى '${names[myLevel] || myLevel}'.`
        );
        return false;
      }
    } catch (err) {
      console.error("Failed to fetch isolation rule:", err);
    }
    return true;
  };

  const handleWeeklySave = async () => {
    if (!hierarchy.branchId) {
      toast.warning("يرجى اختيار الموقع للإدخال");
      return;
    }
    if (!(await checkIsolationBeforeSave())) return;
    let payload = [];
      if (isSupported) {
        // Authority
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "هيئة",
          period: "صباحي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.morning_authority) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "هيئة",
          period: "مسائي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.evening_authority) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
        // Students
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "طلاب",
          period: "صباحي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.morning_students) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "طلاب",
          period: "مسائي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.evening_students) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
        // Infants
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "رضع",
          period: "صباحي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.morning_infants) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
        payload.push({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: "رضع",
          period: "مسائي",
          week_number: selectedWeek,
          ticket_56b_count: parseInt(supportedWeeklyForm.evening_infants) || 0,
          ticket_56c_count: 0,
          is_supported_clinic: true,
        });
      } else {
        payload = [
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            category: selectedCategory,
            period: "صباحي",
            week_number: selectedWeek,
            ticket_56b_count: parseInt(weeklyForm.morning_56b) || 0,
            ticket_56c_count: parseInt(weeklyForm.morning_56c) || 0,
            is_supported_clinic: false,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            category: selectedCategory,
            period: "مسائي",
            week_number: selectedWeek,
            ticket_56b_count: parseInt(weeklyForm.evening_56b) || 0,
            ticket_56c_count: parseInt(weeklyForm.evening_56c) || 0,
            is_supported_clinic: false,
          },
        ];
      }
      if (!isEditing) {
        const conflict = await detectSaveConflicts(payload);
        if (conflict) {
          setPendingConflict({
            payload,
            ...conflict,
            successMsg: "تم حفظ بيانات الأسبوع بنجاح",
            logDetails: `حفظ تذاكر أسبوعية للأسبوع ${selectedWeek} لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth} (${isSupported ? 'مدعم' : 'مجاني'})`,
            resetFn: () => {
              setWeeklyForm({
                morning_56b: "",
                morning_56c: "",
                evening_56b: "",
                evening_56c: "",
              });
              setSupportedWeeklyForm({
                morning_authority: "",
                morning_students: "",
                morning_infants: "",
                evening_authority: "",
                evening_students: "",
                evening_infants: "",
              });
              setIsEditing(false);
            },
          });
          return;
        }
      }

      await performSave(payload, {
        successMsg: "تم حفظ بيانات الأسبوع بنجاح",
        logDetails: `حفظ تذاكر أسبوعية للأسبوع ${selectedWeek} لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth} (${isSupported ? 'مدعم' : 'مجاني'})`,
        resetFn: () => {
          setWeeklyForm({
            morning_56b: "",
            morning_56c: "",
            evening_56b: "",
            evening_56c: "",
          });
          setSupportedWeeklyForm({
            morning_authority: "",
            morning_students: "",
            morning_infants: "",
            evening_authority: "",
            evening_students: "",
            evening_infants: "",
          });
          setIsEditing(false);
        },
      });
  };

  const handleMonthlySave = async () => {
    if (!hierarchy.branchId) {
      toast.warning("يرجى اختيار الموقع للإدخال");
      return;
    }
    if (!(await checkIsolationBeforeSave())) return;
    let payload = [];
      if (isSupported) {
        monthlyForm.forEach(item => {
          payload.push({
            branch_id: parseInt(hierarchy.branchId),
            area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            category: "هيئة",
            period: "موحد",
            week_number: item.week,
            ticket_56b_count: parseInt(item.authority) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
          });
          payload.push({
            branch_id: parseInt(hierarchy.branchId),
            area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            category: "طلاب",
            period: "موحد",
            week_number: item.week,
            ticket_56b_count: parseInt(item.students) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
          });
          payload.push({
            branch_id: parseInt(hierarchy.branchId),
            area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
            clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
            dispense_month: hierarchy.dispenseMonth,
            category: "رضع",
            period: "موحد",
            week_number: item.week,
            ticket_56b_count: parseInt(item.infants) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
          });
        });
      } else {
        payload = monthlyForm.map((item) => ({
          branch_id: parseInt(hierarchy.branchId),
          area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispense_month: hierarchy.dispenseMonth,
          category: selectedCategory,
          period: "موحد",
          week_number: item.week,
          ticket_56b_count: parseInt(item.tickets_56b) || 0,
          ticket_56c_count: parseInt(item.tickets_56c) || 0,
          is_supported_clinic: false,
        }));
      }
      if (!isEditing) {
        const conflict = await detectSaveConflicts(payload);
        if (conflict) {
          setPendingConflict({
            payload,
            ...conflict,
            successMsg: "تم حفظ بيانات الشهر بنجاح",
            logDetails: `حفظ تذاكر شهرية لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth} (${isSupported ? 'مدعم' : 'مجاني'})`,
            resetFn: () => {
              setMonthlyForm([
                { week: 1, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
                { week: 2, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
                { week: 3, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
                { week: 4, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
              ]);
            },
          });
          return;
        }
      }

      await performSave(payload, {
        successMsg: "تم حفظ بيانات الشهر بنجاح",
        logDetails: `حفظ تذاكر شهرية لفرع ${hierarchy.branchId} شهر ${hierarchy.dispenseMonth} (${isSupported ? 'مدعم' : 'مجاني'})`,
        resetFn: () => {
          setMonthlyForm([
            { week: 1, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
            { week: 2, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
            { week: 3, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
            { week: 4, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" },
          ]);
        },
      });
  };

  const handleDailySave = async () => {
    if (!hierarchy.clinicId) {
      toast.warning("الإدخال اليومي متاح فقط في وضع العيادات");
      return;
    }
    if (!(await checkIsolationBeforeSave())) return;
    
    // Calculate week number based on date: 1-7 (W1), 8-15 (W2), 16-22 (W3), 23+ (W4)
    const day = new Date(entryDate).getDate();
    const calculatedWeek = day <= 7 ? 1 : day <= 15 ? 2 : day <= 22 ? 3 : 4;
    
    let payload = [];
      if (isSupported) {
        payload = [
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "هيئة",
            period: "صباحي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.morning_authority) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "هيئة",
            period: "مسائي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.evening_authority) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "طلاب",
            period: "صباحي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.morning_students) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "طلاب",
            period: "مسائي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.evening_students) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "رضع",
            period: "صباحي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.morning_infants) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: "رضع",
            period: "مسائي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(supportedWeeklyForm.evening_infants) || 0,
            ticket_56c_count: 0,
            is_supported_clinic: true,
            entry_date: entryDate,
          },
        ];
      } else {
        payload = [
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: selectedCategory,
            period: "صباحي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(weeklyForm.morning_56b) || 0,
            ticket_56c_count: parseInt(weeklyForm.morning_56c) || 0,
            is_supported_clinic: false,
            entry_date: entryDate,
          },
          {
            branch_id: parseInt(hierarchy.branchId),
            area_id: parseInt(hierarchy.areaId),
            clinic_id: parseInt(hierarchy.clinicId),
            dispense_month: hierarchy.dispenseMonth,
            category: selectedCategory,
            period: "مسائي",
            week_number: calculatedWeek,
            ticket_56b_count: parseInt(weeklyForm.evening_56b) || 0,
            ticket_56c_count: parseInt(weeklyForm.evening_56c) || 0,
            is_supported_clinic: false,
            entry_date: entryDate,
          },
        ];
      }
      if (!isEditing) {
        const conflict = await detectSaveConflicts(payload);
        if (conflict) {
          setPendingConflict({
            payload,
            ...conflict,
            successMsg: `تم حفظ بيانات اليوم (${isSupported ? 'مدعم' : 'مجاني'}) بنجاح (الأسبوع ${calculatedWeek})`,
            logDetails: `حفظ تذاكر يومية لتاريخ ${entryDate} لعيادة ${hierarchy.clinicId} (${isSupported ? 'مدعم' : 'مجاني'})`,
            resetFn: () => {
              setWeeklyForm({
                morning_56b: "",
                morning_56c: "",
                evening_56b: "",
                evening_56c: "",
              });
              setSupportedWeeklyForm({
                morning_authority: "",
                morning_students: "",
                morning_infants: "",
                evening_authority: "",
                evening_students: "",
                evening_infants: "",
              });
              setIsEditing(false);
            },
          });
          return;
        }
      }

      await performSave(payload, {
        successMsg: `تم حفظ بيانات اليوم (${isSupported ? 'مدعم' : 'مجاني'}) بنجاح (الأسبوع ${calculatedWeek})`,
        logDetails: `حفظ تذاكر يومية لتاريخ ${entryDate} لعيادة ${hierarchy.clinicId} (${isSupported ? 'مدعم' : 'مجاني'})`,
        resetFn: () => {
          setWeeklyForm({
            morning_56b: "",
            morning_56c: "",
            evening_56b: "",
            evening_56c: "",
          });
          setSupportedWeeklyForm({
            morning_authority: "",
            morning_students: "",
            morning_infants: "",
            evening_authority: "",
            evening_students: "",
            evening_infants: "",
          });
          setIsEditing(false);
        },
      });
  };

  // ── Two-way isolation between weekly & monthly entry systems ───────────
  // Switching between the أسبوعي (صباحي/مسائي flat fields) and الشهري
  // (unified موحد value per week) forms NEVER silently discards typed data:
  // a confirmation dialog warns first, and on approval the in-memory values
  // are carried into the target system's shape — weekly flat fields are
  // summed (صباحي+مسائي) into the matching week's unified cell, and the
  // unified cell becomes the morning side of the weekly form (evening 0) so
  // the total is preserved in both directions. A source form with no values
  // leaves the target form untouched (loaded data is never clobbered).
  // ── Saved-data merge on entry-mode switch ─────────────────────────────
  // The carry above only moves what the user just typed. Data ALREADY SAVED
  // under the other system (weekly صباحي/مسائي rows or monthly موحد rows) is
  // pulled from the loaded `records` so the target form never looks empty when
  // the previous system holds data for the same scope — this fixes the report
  // "boxes appear without loading the data saved under the previous system".
  // Only EMPTY cells are filled: the in-memory carry / user edits always win.
  const fillFromSavedRecords = (target) => {
    if (target === "daily") return; // daily mode loads its own records per entry_date
    if (!Array.isArray(records) || records.length === 0) return;
    if (!hierarchy.branchId || !hierarchy.dispenseMonth) return;
    const scopeRows = records.filter((r) =>
      String(r.branch_id) === String(hierarchy.branchId) &&
      (hierarchy.areaId ? String(r.area_id) === String(hierarchy.areaId) : r.area_id == null) &&
      (hierarchy.clinicId ? String(r.clinic_id) === String(hierarchy.clinicId) : r.clinic_id == null) &&
      String(r.dispense_month) === String(hierarchy.dispenseMonth) &&
      !!r.is_supported_clinic === isSupported
    );
    if (scopeRows.length === 0) return;

    const sum = (list, field) => list.reduce((s, r) => s + (Number(r[field]) || 0), 0);
    const catList = (list, cat) => (cat === "عام" ? list : list.filter((r) => r.category === cat));

    if (target === "monthly") {
      // Fill ALL week cells (the monthly form shows the whole month).
      setMonthlyForm((prev) =>
        prev.map((item) => {
          const n = { ...item };
          const rows = scopeRows.filter((r) => Number(r.week_number) === Number(item.week));
          const weekly = rows.filter((r) => r.period === "صباحي" || r.period === "مسائي");
          const unified = rows.filter((r) => r.period === "موحد");
          if (isSupported) {
            const put = (key, cat) => {
              if (parseInt(n[key]) > 0) return;
              const v = sum(catList(weekly, cat), "ticket_56b_count") + sum(catList(unified, cat), "ticket_56b_count");
              n[key] = v > 0 ? String(v) : n[key];
            };
            put("authority", "هيئة");
            put("students", "طلاب");
            put("infants", "رضع");
          } else {
            if (!(parseInt(n.tickets_56b) > 0)) {
              const v = sum(catList(weekly, selectedCategory), "ticket_56b_count") + sum(catList(unified, selectedCategory), "ticket_56b_count");
              n.tickets_56b = v > 0 ? String(v) : n.tickets_56b;
            }
            if (!(parseInt(n.tickets_56c) > 0)) {
              const v = sum(catList(weekly, selectedCategory), "ticket_56c_count") + sum(catList(unified, selectedCategory), "ticket_56c_count");
              n.tickets_56c = v > 0 ? String(v) : n.tickets_56c;
            }
          }
          return n;
        })
      );
    } else {
      // Weekly target: fill the current week's صباحي/مسائي from saved rows.
      const rows = scopeRows.filter((r) => Number(r.week_number) === Number(selectedWeek));
      const morning = rows.filter((r) => r.period === "صباحي");
      const evening = rows.filter((r) => r.period === "مسائي");
      const unified = rows.filter((r) => r.period === "موحد");
      if (isSupported) {
        setSupportedWeeklyForm((prev) => {
          const n = { ...prev };
          const putM = (key, cat) => {
            if (parseInt(n[key]) > 0) return;
            const v = sum(catList(morning, cat), "ticket_56b_count") + sum(catList(unified, cat), "ticket_56b_count");
            n[key] = v > 0 ? String(v) : n[key];
          };
          const putE = (key, cat) => {
            if (parseInt(n[key]) > 0) return;
            const v = sum(catList(evening, cat), "ticket_56b_count");
            n[key] = v > 0 ? String(v) : n[key];
          };
          putM("morning_authority", "هيئة");
          putM("morning_students", "طلاب");
          putM("morning_infants", "رضع");
          putE("evening_authority", "هيئة");
          putE("evening_students", "طلاب");
          putE("evening_infants", "رضع");
          return n;
        });
      } else {
        setWeeklyForm((prev) => {
          const n = { ...prev };
          const putM = (keyB, keyC) => {
            if (!(parseInt(n[keyB]) > 0)) {
              const v = sum(catList(morning, selectedCategory), "ticket_56b_count") + sum(catList(unified, selectedCategory), "ticket_56b_count");
              n[keyB] = v > 0 ? String(v) : n[keyB];
            }
            if (!(parseInt(n[keyC]) > 0)) {
              const v = sum(catList(morning, selectedCategory), "ticket_56c_count") + sum(catList(unified, selectedCategory), "ticket_56c_count");
              n[keyC] = v > 0 ? String(v) : n[keyC];
            }
          };
          const putE = (keyB, keyC) => {
            if (!(parseInt(n[keyB]) > 0)) {
              const v = sum(catList(evening, selectedCategory), "ticket_56b_count");
              n[keyB] = v > 0 ? String(v) : n[keyB];
            }
            if (!(parseInt(n[keyC]) > 0)) {
              const v = sum(catList(evening, selectedCategory), "ticket_56c_count");
              n[keyC] = v > 0 ? String(v) : n[keyC];
            }
          };
          putM("morning_56b", "morning_56c");
          putE("evening_56b", "evening_56c");
          return n;
        });
      }
    }
  };

  const requestEntryModeSwitch = (target) => {
    if (target === entryMode) return;
    // quick_clinics is a separate grid surface — switch without isolation.
    if (target === 'quick_clinics') {
      setEntryMode(target);
      return;
    }
    const fromMonthly = entryMode === 'monthly';
    const toMonthly = target === 'monthly';
    // Only weekly/daily ↔ monthly changes the data shape and needs isolation.
    if (!fromMonthly && !toMonthly) {
      setEntryMode(target);
      return;
    }

    const labels = { weekly: 'الأسبوعي', monthly: 'الشهري', daily: 'اليومي' };
    const currentLabel = labels[entryMode] || entryMode;
    const targetLabel = labels[target] || target;
    const currentDesc = entryMode === 'monthly'
      ? 'شهري موحد'
      : (entryMode === 'daily' ? `تاريخ ${entryDate}` : `أسبوع ${selectedWeek}`);
    const targetDesc = target === 'monthly'
      ? 'شهري موحد'
      : (target === 'daily' ? `تاريخ ${entryDate}` : `أسبوع ${selectedWeek}`);

    const msg = `أنت حالياً بنظام الإدخال ${currentLabel} (${currentDesc}).\n` +
      `هل تريد الانتقال إلى نظام الإدخال ${targetLabel} (${targetDesc})؟\n\n` +
      `سيتم نقل القيم المدخلة حالياً إلى النظام الجديد دون مسحها.`;
    if (!window.confirm(msg)) return;

    if (toMonthly) {
      // weekly/daily → monthly: sum صباحي+مسائي into the unified week cell.
      const hasValue = [
        weeklyForm.morning_56b, weeklyForm.morning_56c,
        weeklyForm.evening_56b, weeklyForm.evening_56c,
        supportedWeeklyForm.morning_authority, supportedWeeklyForm.morning_students,
        supportedWeeklyForm.morning_infants, supportedWeeklyForm.evening_authority,
        supportedWeeklyForm.evening_students, supportedWeeklyForm.evening_infants,
      ].some(x => parseInt(x) > 0);
      if (hasValue) {
        const sum = (a, b) => ((parseInt(a) || 0) + (parseInt(b) || 0)).toString();
        setMonthlyForm(prev => prev.map((item, i) => {
          if (i !== selectedWeek - 1) return item;
          return {
            ...item,
            tickets_56b: sum(weeklyForm.morning_56b, weeklyForm.evening_56b),
            tickets_56c: sum(weeklyForm.morning_56c, weeklyForm.evening_56c),
            authority: sum(supportedWeeklyForm.morning_authority, supportedWeeklyForm.evening_authority),
            students: sum(supportedWeeklyForm.morning_students, supportedWeeklyForm.evening_students),
            infants: sum(supportedWeeklyForm.morning_infants, supportedWeeklyForm.evening_infants),
          };
        }));
      }
      // The carry is programmatic, not a user edit — reset the flag (whether
      // or not values were carried) so a later monthly→weekly return treats
      // this switch as a plain round-trip and never lingers true.
      monthlyEditedRef.current = false;
    } else {
      // monthly → weekly/daily: if the user EDITED the monthly form since the
      // last carry, the monthly value is authoritative — overwrite the split
      // (unified total lands on the morning side, evening 0) so the user's
      // latest monthly edit is what the weekly form shows. Otherwise (plain
      // round-trip) fill only the EMPTY weekly fields so any صباحي/مسائي split
      // the user originally typed is kept losslessly.
      const item = monthlyForm[selectedWeek - 1] || {};
      const unifiedHasValue = [item.tickets_56b, item.tickets_56c, item.authority, item.students, item.infants]
        .some(x => parseInt(x) > 0);
      if (unifiedHasValue) {
        const s = (x) => (parseInt(x) || 0).toString();
        if (monthlyEditedRef.current) {
          // User edited monthly → monthly wins; show its total in the week form.
          setWeeklyForm({
            morning_56b: s(item.tickets_56b),
            morning_56c: s(item.tickets_56c),
            evening_56b: '0',
            evening_56c: '0',
          });
          setSupportedWeeklyForm({
            morning_authority: s(item.authority),
            morning_students: s(item.students),
            morning_infants: s(item.infants),
            evening_authority: '0',
            evening_students: '0',
            evening_infants: '0',
          });
        } else {
          // Plain round-trip → preserve the original split.
          const fillOr = (prevVal, monthVal) => {
            if (parseInt(prevVal) > 0) return prevVal; // keep existing split
            const m = parseInt(monthVal);
            return m > 0 ? m.toString() : prevVal;     // fill from unified if any
          };
          setWeeklyForm(prev => ({
            morning_56b: fillOr(prev.morning_56b, item.tickets_56b),
            morning_56c: fillOr(prev.morning_56c, item.tickets_56c),
            evening_56b: fillOr(prev.evening_56b, ''),
            evening_56c: fillOr(prev.evening_56c, ''),
          }));
          setSupportedWeeklyForm(prev => ({
            morning_authority: fillOr(prev.morning_authority, item.authority),
            morning_students: fillOr(prev.morning_students, item.students),
            morning_infants: fillOr(prev.morning_infants, item.infants),
            evening_authority: fillOr(prev.evening_authority, ''),
            evening_students: fillOr(prev.evening_students, ''),
            evening_infants: fillOr(prev.evening_infants, ''),
          }));
        }
      }
      monthlyEditedRef.current = false;
    }
    // Pull data already saved under the other system into the target form so
    // switching never shows empty boxes when the previous system holds data.
    fillFromSavedRecords(target);
    setEntryMode(target);
  };

  const handleCopyPreviousWeek = () => {
    if (selectedWeek <= 1) {
      toast.warning("هذا هو الأسبوع الأول، لا يوجد أسبوع سابق للنسخ.");
      return;
    }
    const prevWeek = selectedWeek - 1;
    const prevRecords = records.filter(r => {
      const matchesHierarchy = r.branch_id?.toString() === hierarchy.branchId?.toString() &&
                               (hierarchy.areaId ? r.area_id?.toString() === hierarchy.areaId.toString() : true) &&
                               (hierarchy.clinicId ? r.clinic_id?.toString() === hierarchy.clinicId.toString() : true);
      const matchesType = !!r.is_supported_clinic === !!isSupported;
      const matchesWeek = r.week_number === prevWeek;
      return matchesHierarchy && matchesType && matchesWeek;
    });

    if (prevRecords.length === 0) {
      toast.warning(`لا توجد بيانات مسجلة في الأسبوع ${prevWeek} لنسخها.`);
      return;
    }

    if (isSupported) {
      const mAuth = prevRecords.find(r => r.period === "صباحي" && r.category === "هيئة");
      const mStud = prevRecords.find(r => r.period === "صباحي" && r.category === "طلاب");
      const mInf = prevRecords.find(r => r.period === "صباحي" && r.category === "رضع");
      const eAuth = prevRecords.find(r => r.period === "مسائي" && r.category === "هيئة");
      const eStud = prevRecords.find(r => r.period === "مسائي" && r.category === "طلاب");
      const eInf = prevRecords.find(r => r.period === "مسائي" && r.category === "رضع");
      
      setSupportedWeeklyForm({
          morning_authority: mAuth ? mAuth.ticket_56b_count.toString() : "",
          morning_students: mStud ? mStud.ticket_56b_count.toString() : "",
          morning_infants: mInf ? mInf.ticket_56b_count.toString() : "",
          evening_authority: eAuth ? eAuth.ticket_56b_count.toString() : "",
          evening_students: eStud ? eStud.ticket_56b_count.toString() : "",
          evening_infants: eInf ? eInf.ticket_56b_count.toString() : "",
      });
    } else {
      const morning = prevRecords.find(r => r.period === "صباحي" && r.category === selectedCategory);
      const evening = prevRecords.find(r => r.period === "مسائي" && r.category === selectedCategory);
      setWeeklyForm({
          morning_56b: morning ? morning.ticket_56b_count.toString() : "",
          morning_56c: morning ? morning.ticket_56c_count.toString() : "",
          evening_56b: evening ? evening.ticket_56b_count.toString() : "",
          evening_56c: evening ? evening.ticket_56c_count.toString() : "",
      });
    }
    toast.success(`تم استيراد بيانات الأسبوع ${prevWeek} بنجاح.`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      const target = e.target;
      if (target.tagName.toLowerCase() === 'input') {
        e.preventDefault();
        const formInputs = Array.from(document.querySelectorAll('input:not([disabled])'));
        const index = formInputs.indexOf(target);
        if (index > -1 && index < formInputs.length - 1) {
          formInputs[index + 1].focus();
        }
      }
    }
  };

  const handleEditRow = (row, isSupportedRow) => {
    // Find matching records
    const matchingRecords = records.filter(r => {
      const rIsSupported = r.is_supported_clinic === 1 || r.is_supported_clinic === true;
      if (rIsSupported !== isSupportedRow) return false;
      
      const key = r.clinic_id ? `clinic_${r.clinic_id}` : (r.area_id ? `area_${r.area_id}` : `branch_${r.branch_id}`);
      const matchesKey = key === row.id;
      if (!matchesKey) return false;
      
      // For owned clinics, we also need to match the specific category
      if (!isSupportedRow && r.category !== row.category) return false;
      
      return true;
    });

    if (matchingRecords.length === 0) return;

    setIsEditing(true);

    // Populate monthly form
    const nextMonthly = [1, 2, 3, 4].map(w => {
      if (isSupportedRow) {
        const auth = matchingRecords.find(r => r.week_number === w && r.category === "هيئة");
        const stud = matchingRecords.find(r => r.week_number === w && r.category === "طلاب");
        const inf = matchingRecords.find(r => r.week_number === w && r.category === "رضع");
        return {
          week: w,
          authority: auth ? auth.ticket_56b_count.toString() : "",
          students: stud ? stud.ticket_56b_count.toString() : "",
          infants: inf ? inf.ticket_56b_count.toString() : "",
          tickets_56b: "",
          tickets_56c: ""
        };
      } else {
        const rec = matchingRecords.find(r => r.week_number === w);
        return {
          week: w,
          tickets_56b: rec ? rec.ticket_56b_count.toString() : "",
          tickets_56c: rec ? rec.ticket_56c_count.toString() : "",
          authority: "",
          students: "",
          infants: ""
        };
      }
    });

    setMonthlyForm(nextMonthly);
    // Data loaded programmatically for editing is not a user edit — reset the
    // flag so the next monthly→weekly return treats it as a plain round-trip
    // (fillOr) instead of overwriting the weekly split.
    monthlyEditedRef.current = false;
    
    // Maintain current mode if it's daily or weekly
    if (entryMode === "daily") {
        // Find if there's an entry date in the matching records to set
        const firstWithDate = matchingRecords.find(r => r.entry_date);
        if (firstWithDate) setEntryDate(firstWithDate.entry_date);
    } else if (entryMode === "weekly") {
        // Just stay in weekly
    } else {
        setEntryMode("monthly");
    }
    if (!isSupportedRow) {
      setSelectedCategory(row.category);
    }
    setIsSupported(isSupportedRow);
    
    // If it was a daily/weekly record, we might want to populate weekly form too, 
    // but the user mostly works in aggregated monthly mode for editing.
    if (!isSupportedRow && matchingRecords.length > 0) {
        // If we are in daily mode, try to find records for the currently set entryDate or the first available record's date
        const targetDate = entryMode === "daily" ? (matchingRecords.find(r => r.entry_date === entryDate) ? entryDate : matchingRecords.find(r => r.entry_date)?.entry_date) : null;
        
        const dayRecords = targetDate ? matchingRecords.filter(r => r.entry_date === targetDate) : matchingRecords;
        const morning = dayRecords.find(r => r.period === "صباحي");
        const evening = dayRecords.find(r => r.period === "مسائي");

        setWeeklyForm({
            morning_56b: morning ? morning.ticket_56b_count.toString() : "",
            morning_56c: morning ? morning.ticket_56c_count.toString() : "",
            evening_56b: evening ? evening.ticket_56b_count.toString() : "",
            evening_56c: evening ? evening.ticket_56c_count.toString() : "",
        });
    } else if (isSupportedRow && matchingRecords.length > 0) {
        const targetDate = entryMode === "daily" ? (matchingRecords.find(r => r.entry_date === entryDate) ? entryDate : matchingRecords.find(r => r.entry_date)?.entry_date) : null;
        const dayRecords = targetDate ? matchingRecords.filter(r => r.entry_date === targetDate) : matchingRecords;

        const mAuth = dayRecords.find(r => r.period === "صباحي" && r.category === "هيئة");
        const mStud = dayRecords.find(r => r.period === "صباحي" && r.category === "طلاب");
        const mInf = dayRecords.find(r => r.period === "صباحي" && r.category === "رضع");
        const eAuth = dayRecords.find(r => r.period === "مسائي" && r.category === "هيئة");
        const eStud = dayRecords.find(r => r.period === "مسائي" && r.category === "طلاب");
        const eInf = dayRecords.find(r => r.period === "مسائي" && r.category === "رضع");
        
        setSupportedWeeklyForm({
            morning_authority: mAuth ? mAuth.ticket_56b_count.toString() : "",
            morning_students: mStud ? mStud.ticket_56b_count.toString() : "",
            morning_infants: mInf ? mInf.ticket_56b_count.toString() : "",
            evening_authority: eAuth ? eAuth.ticket_56b_count.toString() : "",
            evening_students: eStud ? eStud.ticket_56b_count.toString() : "",
            evening_infants: eInf ? eInf.ticket_56b_count.toString() : "",
        });
    }
    
    // Set location
    const firstRec = matchingRecords[0];
    setHierarchy({
      branchId: firstRec.branch_id?.toString() || "",
      areaId: firstRec.area_id?.toString() || "",
      clinicId: firstRec.clinic_id?.toString() || "",
      dispenseMonth: firstRec.dispense_month || hierarchy.dispenseMonth
    });
    setIsLocationFixed(true);
    
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.info("تم تحميل البيانات للتعديل (وضع الإدخال الشهري)");
  };

  const handleDeleteRow = async (row, isSupportedRow) => {
    if (!window.confirm("هل أنت متأكد من حذف كافة سجلات هذه الجهة لهذا الشهر؟")) return;

    const matchingRecords = records.filter(r => {
      const rIsSupported = r.is_supported_clinic === 1 || r.is_supported_clinic === true;
      if (rIsSupported !== isSupportedRow) return false;
      
      const key = r.clinic_id ? `clinic_${r.clinic_id}` : (r.area_id ? `area_${r.area_id}` : `branch_${r.branch_id}`);
      return key === row.id && r.category === row.category;
    });

    const ids = matchingRecords.map(r => r.id);
    if (ids.length === 0) return;

    setSaving(true);
    try {
      // Deleting multiple records
      for (const id of ids) {
        await invoke("delete_medical_tickets", { id });
      }

      await invoke('log_frontend_action', {
        userId: user ? user.id : null,
        action: 'DELETE',
        tableName: 'medical_tickets',
        recordId: null,
        details: `حذف سجلات تذاكر طبية للجهة ${row.name} الفئة ${row.category || 'عام'}`
      });

      toast.success("تم حذف السجلات بنجاح");
      loadRecords();
    } catch (err) {
      toast.error(`فشل الحذف: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const categories = ["هيئة", "طلاب", "رضع", "المرأة المعيلة"];
  const supportedCategories = ["هيئة", "طلاب", "رضع"];

  // Helper to aggregate records for table display
  const getAggregatedData = (supported) => {
    let filtered = records.filter(
      (r) =>
        r.is_supported_clinic === (supported ? 1 : 0) ||
        r.is_supported_clinic === supported,
    );

    // Filter by Hierarchy (Smart Context)
    if (hierarchy.areaId) {
      filtered = filtered.filter(r => r.area_id?.toString() === hierarchy.areaId.toString());
    }
    if (hierarchy.clinicId) {
      filtered = filtered.filter(r => r.clinic_id?.toString() === hierarchy.clinicId.toString());
    }

    // Determine grouping key based on what's available
    // If clinic_id is present, group by clinic. If not, check area, then branch.
    const getGroupKey = (r) => {
      if (r.clinic_id) return `clinic_${r.clinic_id}`;
      if (r.area_id) return `area_${r.area_id}`;
      return `branch_${r.branch_id}`;
    };

    const groupKeys = [...new Set(filtered.map(getGroupKey))];

    // Get unique months as well if needed, but here it's usually filtered by month
    if (!supported) {
      // Owned: Group by Level + Category
      return groupKeys.flatMap((key) => {
        const levelRecords = filtered.filter((r) => getGroupKey(r) === key);
        const name =
          levelRecords[0]?.clinic_name ||
          levelRecords[0]?.area_name ||
          levelRecords[0]?.branch_name ||
          "جهة غير محددة";
        const cats = [...new Set(levelRecords.map((r) => r.category))];

        return cats.map((cat) => {
          const catRecords = levelRecords.filter((r) => r.category === cat);
          const data = {
            id: key,
            name: name,
            category: cat,
            total_56b: 0,
            total_56c: 0,
          };
          [1, 2, 3, 4].forEach((w) => {
            const weekRecs = catRecords.filter((r) => r.week_number === w);
            const w56b = weekRecs.reduce(
              (sum, r) => sum + r.ticket_56b_count,
              0,
            );
            const w56c = weekRecs.reduce(
              (sum, r) => sum + r.ticket_56c_count,
              0,
            );
            data[`w${w}_56b`] = w56b;
            data[`w${w}_56c`] = w56c;
            data.total_56b += w56b;
            data.total_56c += w56c;
          });
          return data;
        });
      });
    } else {
      // Supported: Group by Level ONLY, Categories are columns
      return groupKeys.map((key) => {
        const levelRecords = filtered.filter((r) => getGroupKey(r) === key);
        const name =
          levelRecords[0]?.clinic_name ||
          levelRecords[0]?.area_name ||
          levelRecords[0]?.branch_name ||
          "جهة غير محددة";
        const data = { id: key, name: name, total: 0 };

        [1, 2, 3, 4].forEach((w) => {
          const weekRecs = levelRecords.filter((r) => r.week_number === w);
          supportedCategories.forEach((cat) => {
            const catRecs = weekRecs.filter((r) => r.category === cat);
            const sum = catRecs.reduce(
              (acc, curr) =>
                acc + curr.ticket_56b_count + curr.ticket_56c_count,
              0,
            );
            data[`w${w}_${cat}`] = sum;
            data.total += sum;
            data[`total_${cat}`] = (data[`total_${cat}`] || 0) + sum;
          });
        });
        return data;
      });
    }
  };

  const baselineAvgVolume = useMemo(() => {
    if (records.length === 0) return 0;
    const total = records.reduce((s, r) => s + r.ticket_56b_count + r.ticket_56c_count, 0);
    return total / records.length;
  }, [records]);

  // Helper to get filtered and paginated data
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getProcessedData = (supported) => {
    const rawData = getAggregatedData(supported);
    let filtered = rawData.filter((row) =>
      row.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );

    // Smart Filters
    if (filterLockStatus !== 'all') {
      filtered = filtered.filter(() => {
        const isLocked = checkIsMonthLocked(hierarchy.dispenseMonth);
        return filterLockStatus === 'locked' ? isLocked : !isLocked;
      });
    }

    if (filterHighVolume) {
      filtered = filtered.filter(row => {
        const vol = (row.total_56b || 0) + (row.total_56c || 0) + (row.total || 0);
        return vol > baselineAvgVolume * 5; // Using 5x average for tickets as they vary wildly
      });
    }

    const currentPage = supported ? currentPageSupported : currentPageOwned;
    const startIndex = (currentPage - 1) * rowsPerPage;
    const paginated = filtered.slice(startIndex, startIndex + rowsPerPage);

    return {
      data: paginated,
      allData: filtered,
      totalCount: filtered.length,
      totalPages: Math.ceil(filtered.length / rowsPerPage),
    };
  };

  useEffect(() => {
    setCurrentPageOwned(1);
    setCurrentPageSupported(1);
  }, [searchTerm, filterLockStatus, filterHighVolume]);

  const statsItems = useMemo(() => {
    if (isSupported) {
      const allData = getProcessedData(true).allData;
      const totalAuth = allData.reduce((s, r) => s + (parseInt(r.total_هيئة) || 0), 0);
      const totalStud = allData.reduce((s, r) => s + (parseInt(r.total_طلاب) || 0), 0);
      const totalInf = allData.reduce((s, r) => s + (parseInt(r.total_رضع) || 0), 0);
      const total = totalAuth + totalStud + totalInf;

      return [
        { label: 'هيئة', value: totalAuth, icon: Building2, color: 'text-blue-600', trend: totalAuth > 0 ? '+%' : '' },
        { label: 'طلاب', value: totalStud, icon: GraduationCap, color: 'text-indigo-600' },
        { label: 'رضع', value: totalInf, icon: Baby, color: 'text-emerald-600' },
        { label: 'الإجمالي', value: total, icon: Calculator, color: 'text-[var(--color-primary)]' },
      ];
    } else {
      const allData = getProcessedData(false).allData;
      const total56b = allData.reduce((s, r) => s + (parseInt(r.total_56b) || 0), 0);
      const total56c = allData.reduce((s, r) => s + (parseInt(r.total_56c) || 0), 0);
      const total = total56b + total56c;

      return [
        { label: 'تذاكر 56ب', value: total56b, icon: Hash, color: 'text-blue-600' },
        { label: 'تذاكر 56ج', value: total56c, icon: Hash, color: 'text-emerald-600' },
        { label: 'الإجمالي العام', value: total, icon: Calculator, color: 'text-[var(--color-primary)]' },
      ];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [records, isSupported, searchTerm]);

  // --- مساعدات النشاط اليومي ---
  const daysInMonth = useMemo(() => {
    if (!hierarchy.dispenseMonth) return [];
    const [year, month] = hierarchy.dispenseMonth.split('-').map(Number);
    const date = new Date(year, month, 0);
    const count = date.getDate();
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [hierarchy.dispenseMonth]);

  const dailyActivity = useMemo(() => {
    const relevant = records.filter(r => {
        const matchesHierarchy = r.clinic_id?.toString() === hierarchy.clinicId?.toString();
        // Separation: Filter by is_supported_clinic based on current mode
        const matchesMode = !!r.is_supported_clinic === !!isSupported;
        return matchesHierarchy && matchesMode && r.entry_date;
    });
    
    const activity = {};
    relevant.forEach(r => {
        activity[r.entry_date] = true;
    });
    return activity;
  }, [records, hierarchy.clinicId, isSupported]);

  const handleSelectDay = (dayNum) => {
    const [year, month] = hierarchy.dispenseMonth.split('-');
    const formattedDay = dayNum.toString().padStart(2, '0');
    const newDate = `${year}-${month}-${formattedDay}`;
    setEntryDate(newDate);
    
    // محاولة تحميل البيانات الموجودة لهذا اليوم
    const dayRecords = records.filter(r => 
        r.entry_date === newDate && 
        r.clinic_id?.toString() === hierarchy.clinicId?.toString() &&
        (isSupported ? true : r.category === selectedCategory)
    );
    
    if (dayRecords.length > 0) {
        if (isSupported) {
            const mAuth = dayRecords.find(r => r.period === "صباحي" && r.category === "هيئة");
            const mStud = dayRecords.find(r => r.period === "صباحي" && r.category === "طلاب");
            const mInf = dayRecords.find(r => r.period === "صباحي" && r.category === "رضع");
            const eAuth = dayRecords.find(r => r.period === "مسائي" && r.category === "هيئة");
            const eStud = dayRecords.find(r => r.period === "مسائي" && r.category === "طلاب");
            const eInf = dayRecords.find(r => r.period === "مسائي" && r.category === "رضع");
            
            setSupportedWeeklyForm({
                morning_authority: mAuth ? mAuth.ticket_56b_count.toString() : "",
                morning_students: mStud ? mStud.ticket_56b_count.toString() : "",
                morning_infants: mInf ? mInf.ticket_56b_count.toString() : "",
                evening_authority: eAuth ? eAuth.ticket_56b_count.toString() : "",
                evening_students: eStud ? eStud.ticket_56b_count.toString() : "",
                evening_infants: eInf ? eInf.ticket_56b_count.toString() : "",
            });
        } else {
            const morning = dayRecords.find(r => r.period === "صباحي");
            const evening = dayRecords.find(r => r.period === "مسائي");
            setWeeklyForm({
                morning_56b: morning ? morning.ticket_56b_count.toString() : "",
                morning_56c: morning ? morning.ticket_56c_count.toString() : "",
                evening_56b: evening ? evening.ticket_56b_count.toString() : "",
                evening_56c: evening ? evening.ticket_56c_count.toString() : "",
            });
        }
        toast.info(`تم تحميل بيانات يوم ${dayNum}`);
    } else {
        setWeeklyForm({ morning_56b: "", morning_56c: "", evening_56b: "", evening_56c: "" });
        setSupportedWeeklyForm({ morning_authority: "", morning_students: "", morning_infants: "", evening_authority: "", evening_students: "", evening_infants: "" });
    }
  };

  const resetAllForms = () => {
    setWeeklyForm({
      morning_56b: "",
      morning_56c: "",
      evening_56b: "",
      evening_56c: "",
    });
    setSupportedWeeklyForm({
      morning_authority: "",
      morning_students: "",
      morning_infants: "",
      evening_authority: "",
      evening_students: "",
      evening_infants: "",
    });
    setMonthlyForm(monthlyForm.map(f => ({ ...f, tickets_56b: "", tickets_56c: "", authority: "", students: "", infants: "" })));
    toast.info("تم تصفير جميع الخانات");
  };

  useKeyboardShortcuts([
    {
      key: "r",
      alt: true,
      handler: resetAllForms,
      description: "تفريغ الخانات",
    },
    {
      key: "p",
      ctrl: true,
      handler: async () => { await ensureSignaturesLoaded(); executePrint({ orientation: 'landscape', fontSize: 'md', margins: 'standard', showPageNumbers: true, showSignatures: true }); },
      description: "طباعة",
    },
    {
      key: "n",
      alt: true,
      handler: () =>
        document.querySelector('[data-focus="first-input"]')?.focus(),
      description: "سجل جديد",
    },
    {
      key: "Escape",
      handler: () => {
        setIsLocationFixed(false);
        setEntryMode("weekly");
        setIsEditing(false);
        setWeeklyForm({
          morning_56b: "",
          morning_56c: "",
          evening_56b: "",
          evening_56c: "",
        });
        setSupportedWeeklyForm({
          morning_authority: "",
          morning_students: "",
          morning_infants: "",
          evening_authority: "",
          evening_students: "",
          evening_infants: "",
        });
        toast.info("تم التراجع عن العمليات الحالية");
      },
      description: "إلغاء التعديل / التراجع عن الإدخال",
    },
  ]);

  // Export Configuration
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ownedExportColumns = [
    { header: "العيادة/الجهة", accessor: "name" },
    { header: "الصنف", accessor: "category" },
    { header: "أسبوع 1 - 56ب", accessor: "w1_56b" },
    { header: "أسبوع 1 - 56ج", accessor: "w1_56c" },
    { header: "أسبوع 2 - 56ب", accessor: "w2_56b" },
    { header: "أسبوع 2 - 56ج", accessor: "w2_56c" },
    { header: "أسبوع 3 - 56ب", accessor: "w3_56b" },
    { header: "أسبوع 3 - 56ج", accessor: "w3_56c" },
    { header: "أسبوع 4 - 56ب", accessor: "w4_56b" },
    { header: "أسبوع 4 - 56ج", accessor: "w4_56c" },
    { header: "إجمالي 56ب", accessor: "total_56b" },
    { header: "إجمالي 56ج", accessor: "total_56c" },
  ];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supportedExportColumns = [
    { header: "العيادة/الجهة", accessor: "name" },
    ...([1, 2, 3, 4].flatMap(w => supportedCategories.map(c => ({ header: `أسبوع ${w} - ${c}`, accessor: `w${w}_${c}` })))),
    ...supportedCategories.map(c => ({ header: `إجمالي ${c}`, accessor: `total_${c}` })),
    { header: "الإجمالي العام", accessor: "total" },
  ];

    const exportProps = useMemo(() => {
    const ownedData = getProcessedData(false).allData;
    const supportedData = getProcessedData(true).allData;

    // ── DIAGNOSTIC ────────────────────────────────────────────────────
    console.log('[MT-exportProps] owned:', ownedData.length, 'supported:', supportedData.length, 'mode:', tableViewMode);
    if (ownedData.length > 0) console.log('[MT-exportProps] sample row:', JSON.stringify(ownedData[0]));

    if (tableViewMode === 'supported') {
      return { data: supportedData, columns: supportedExportColumns };
    }
    if (tableViewMode === 'owned') {
      return { data: ownedData, columns: ownedExportColumns };
    }
    // tableViewMode === 'all'
    if (ownedData.length > 0 && supportedData.length === 0) {
      return { data: ownedData, columns: ownedExportColumns };
    }
    if (supportedData.length > 0 && ownedData.length === 0) {
      return { data: supportedData, columns: supportedExportColumns };
    }
    if (ownedData.length > 0 && supportedData.length > 0) {
      return { data: ownedData, columns: ownedExportColumns };
    }
    return { data: [], columns: ownedExportColumns };
  }, [tableViewMode, getProcessedData, ownedExportColumns, supportedExportColumns]);

  const handlePremiumExport = async (type, { data: exportData, columns: _columns, options }) => {
    try {
      const enrichedOptions = { ...options };

      // Build multi-table config for Word/PDF so both owned and supported
      // tables are included regardless of the current tableViewMode.
      const ownedData = getProcessedData(false).allData;
      const supportedData = getProcessedData(true).allData;

      // ── DIAGNOSTIC: log data at export time ──────────────────────────
      if (ownedData.length > 0) {
        console.log('[MT-Export] ownedData[0]:', JSON.stringify(ownedData[0]));
        console.log('[MT-Export] ownedData.length:', ownedData.length);
        console.log('[MT-Export] exportData?.length:', exportData?.length);
        console.log('[MT-Export] tableViewMode:', tableViewMode);
      } else {
        console.warn('[MT-Export] ownedData is EMPTY — records.length:', records.length);
      }
      const multiTables = [];
      if (ownedData.length > 0) {
        multiTables.push({ data: ownedData, columns: ownedExportColumns, title: 'العيادات المملوكة' });
      }
      if (supportedData.length > 0) {
        multiTables.push({ data: supportedData, columns: supportedExportColumns, title: 'العيادات المدعومة' });
      }
      const wordPdfOptions = multiTables.length > 0
        ? { ...enrichedOptions, tables: multiTables }
        : enrichedOptions;

      if (type === 'excel') {
        const sheetsData = {};
        
        if (tableViewMode === 'all' || tableViewMode === 'owned') {
          if (ownedData.length > 0) sheetsData['العيادات المملوكة'] = { data: ownedData, columns: ownedExportColumns, options: enrichedOptions };
        }
        if (tableViewMode === 'all' || tableViewMode === 'supported') {
          if (supportedData.length > 0) sheetsData['العيادات المدعومة'] = { data: supportedData, columns: supportedExportColumns, options: enrichedOptions };
        }
        
        // Compute stats for export
        const allDataOwned = getProcessedData(false).allData;
        const total56b = allDataOwned.reduce((s, r) => s + (parseInt(r.total_56b) || 0), 0);
        const total56c = allDataOwned.reduce((s, r) => s + (parseInt(r.total_56c) || 0), 0);
        
        const allDataSupported = getProcessedData(true).allData;
        const totalAuth = allDataSupported.reduce((s, r) => s + (parseInt(r.total_هيئة) || 0), 0);
        const totalStud = allDataSupported.reduce((s, r) => s + (parseInt(r.total_طلاب) || 0), 0);
        const totalInf = allDataSupported.reduce((s, r) => s + (parseInt(r.total_رضع) || 0), 0);
        const totalSupported = totalAuth + totalStud + totalInf;
        
        const globalOptions = {
          fileName: `medical_tickets_${hierarchy.dispenseMonth}`,
          title: 'منصرف التذاكر الطبية',
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [
              ['إجمالي تذاكر 56ب (مملوكة)', total56b.toLocaleString()],
              ['إجمالي تذاكر 56ج (مملوكة)', total56c.toLocaleString()],
              ['المجموع الكلي (مملوكة)', (total56b + total56c).toLocaleString()],
              ['تذاكر مدعومة', totalSupported.toLocaleString()],
            ]
          }
        };
        await exportMultiSheetExcel(sheetsData, globalOptions);
        toast.success('تم تصدير Excel بنجاح');
        return true;
      }
            const activeData = tableViewMode === 'supported' ? supportedData : ownedData;
      const activeCols = tableViewMode === 'supported' ? supportedExportColumns : ownedExportColumns;
      if (type === 'word') { await exportToWord(activeData.length > 0 ? activeData : exportData, activeCols, wordPdfOptions); toast.success('تم تصدير Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(activeData.length > 0 ? activeData : exportData, activeCols, wordPdfOptions); toast.success('تم تصدير PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  // ── Entry-form quick export (weekly / monthly forms) ───────────────────
  // Exports exactly what is typed in the current form (pre-save) with a
  // totals row — same Excel/Word/PDF/print menu used everywhere else.
    const formExportColumns = (() => {
    if (entryMode === 'monthly') {
      return isSupported
        ? [
            { header: 'الأسبوع', accessor: 'week', exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : `أسبوع ${r.week}` },
            { header: 'هيئة', accessor: 'authority', exportAccessor: (r) => r.authority || 0 },
            { header: 'طلاب', accessor: 'students', exportAccessor: (r) => r.students || 0 },
            { header: 'رضع', accessor: 'infants', exportAccessor: (r) => r.infants || 0 },
          ]
        : [
            { header: 'الأسبوع', accessor: 'week', exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : `أسبوع ${r.week}` },
            { header: '56ب', accessor: 'tickets_56b', exportAccessor: (r) => r.tickets_56b || 0 },
            { header: '56ج', accessor: 'tickets_56c', exportAccessor: (r) => r.tickets_56c || 0 },
          ];
    }
    // weekly form — single row for the selected week
    if (isSupported) {
      return [
        { header: 'الفترة', accessor: 'label', exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : r.label },
        { header: 'صباحي هيئة', accessor: 'morning_authority', exportAccessor: (r) => r.morning_authority || 0 },
        { header: 'صباحي طلاب', accessor: 'morning_students', exportAccessor: (r) => r.morning_students || 0 },
        { header: 'صباحي رضع', accessor: 'morning_infants', exportAccessor: (r) => r.morning_infants || 0 },
        { header: 'مسائي هيئة', accessor: 'evening_authority', exportAccessor: (r) => r.evening_authority || 0 },
        { header: 'مسائي طلاب', accessor: 'evening_students', exportAccessor: (r) => r.evening_students || 0 },
        { header: 'مسائي رضع', accessor: 'evening_infants', exportAccessor: (r) => r.evening_infants || 0 },
      ];
    }
    return [
      { header: 'الفترة', accessor: 'label', exportAccessor: (r) => r.isTotalRow ? 'الإجمالي' : r.label },
      { header: 'صباحي 56ب', accessor: 'morning_56b', exportAccessor: (r) => r.morning_56b || 0 },
      { header: 'صباحي 56ج', accessor: 'morning_56c', exportAccessor: (r) => r.morning_56c || 0 },
      { header: 'مسائي 56ب', accessor: 'evening_56b', exportAccessor: (r) => r.evening_56b || 0 },
      { header: 'مسائي 56ج', accessor: 'evening_56c', exportAccessor: (r) => r.evening_56c || 0 },
    ];
  })();

  const formExportData = (() => {
    if (entryMode === 'monthly') {
      const rows = monthlyForm.map(item => ({
        week: item.week,
        tickets_56b: parseInt(item.tickets_56b) || 0,
        tickets_56c: parseInt(item.tickets_56c) || 0,
        authority: parseInt(item.authority) || 0,
        students: parseInt(item.students) || 0,
        infants: parseInt(item.infants) || 0,
      }));
      const totals = {
        isTotalRow: true,
        week: 'الإجمالي',
        tickets_56b: rows.reduce((s, r) => s + r.tickets_56b, 0),
        tickets_56c: rows.reduce((s, r) => s + r.tickets_56c, 0),
        authority: rows.reduce((s, r) => s + r.authority, 0),
        students: rows.reduce((s, r) => s + r.students, 0),
        infants: rows.reduce((s, r) => s + r.infants, 0),
      };
      return [...rows, totals];
    }
    const row = isSupported
      ? {
          label: `الأسبوع ${selectedWeek}`,
          morning_authority: parseInt(supportedWeeklyForm.morning_authority) || 0,
          morning_students: parseInt(supportedWeeklyForm.morning_students) || 0,
          morning_infants: parseInt(supportedWeeklyForm.morning_infants) || 0,
          evening_authority: parseInt(supportedWeeklyForm.evening_authority) || 0,
          evening_students: parseInt(supportedWeeklyForm.evening_students) || 0,
          evening_infants: parseInt(supportedWeeklyForm.evening_infants) || 0,
        }
      : {
          label: `الأسبوع ${selectedWeek}`,
          morning_56b: parseInt(weeklyForm.morning_56b) || 0,
          morning_56c: parseInt(weeklyForm.morning_56c) || 0,
          evening_56b: parseInt(weeklyForm.evening_56b) || 0,
          evening_56c: parseInt(weeklyForm.evening_56c) || 0,
        };
    const sum = (k) => row[k] || 0;
    const totals = isSupported
      ? {
          isTotalRow: true,
          label: 'الإجمالي',
          morning_authority: sum('morning_authority'), morning_students: sum('morning_students'), morning_infants: sum('morning_infants'),
          evening_authority: sum('evening_authority'), evening_students: sum('evening_students'), evening_infants: sum('evening_infants'),
        }
      : {
          isTotalRow: true,
          label: 'الإجمالي',
          morning_56b: sum('morning_56b'), morning_56c: sum('morning_56c'),
          evening_56b: sum('evening_56b'), evening_56c: sum('evening_56c'),
        };
    return [row, totals];
  })();

  const formExportOptions = {
    title: `التذاكر الطبية ${isSupported ? 'المدعومة' : 'المجانية'} — ${entryMode === 'weekly' ? `أسبوع ${selectedWeek}` : 'شهري'}`,
    fileName: `medical_tickets_${isSupported ? 'supported' : 'free'}_${entryMode}_${hierarchy.dispenseMonth}`,
    subtitle: `${hierarchyNames.clinic || hierarchyNames.area || hierarchyNames.branch} — شهر ${hierarchy.dispenseMonth}`,
    monthLabel: hierarchy.dispenseMonth,
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="no-print space-y-6">
        <Breadcrumb
          items={[{ label: "العمليات اليومية" }, { label: "التذاكر الطبية" }]}
        />

        <PageHeader
          title="منصرف التذاكر الطبية"
          icon={ClipboardList}
          description="تسجيل أعداد التذاكر الطبية (56ب، 56ج) بنظام أسبوعي أو شهري."
          actions={
            <ExportMenu 
              data={exportProps.data} 
              columns={exportProps.columns} 
              onCustomExport={handlePremiumExport} 
              options={{
                title: 'منصرف التذاكر الطبية',
                fileName: `medical_tickets_${hierarchy.dispenseMonth}`,
                month: hierarchy.dispenseMonth,
                hierarchyLabel: buildHierarchyLabel(workspaceMode, hierarchyNames),
                tables: (() => {
                  const ownedData = getProcessedData(false).allData;
                  const supportedData = getProcessedData(true).allData;
                  const multiTables = [];
                  if (tableViewMode === 'all' || tableViewMode === 'owned') {
                    if (ownedData.length > 0) multiTables.push({ data: ownedData, columns: ownedExportColumns, title: 'العيادات المملوكة' });
                  }
                  if (tableViewMode === 'all' || tableViewMode === 'supported') {
                    if (supportedData.length > 0) multiTables.push({ data: supportedData, columns: supportedExportColumns, title: 'العيادات المدعومة' });
                  }
                  return multiTables;
                })(),
              }} 
            />
          }
        />

        <StatsBar items={statsItems} />

        {/* --- Selection Bar --- */}
        {/* NOTE: no overflow-hidden — it would clip the AutoComplete dropdowns
            inside HierarchySelector (the list gets cut off mid-scroll). */}
        <Card className="p-0 border-none shadow-xl bg-gradient-to-r from-[var(--color-bg-card)] to-[var(--color-bg)]">
          <div className="p-6 space-y-6">
            <div className="flex items-center gap-2 text-lg font-black text-[var(--color-primary)]">
              <Building2 size={22} />
              <span>تحديد الموقع</span>
            </div>

            <div className="w-full">
              <HierarchySelector
                onSelectionChange={(data) =>
                  setHierarchy(prev => ({ ...prev, ...data }))
                }
                initialBranch={hierarchy.branchId}
                initialArea={hierarchy.areaId}
                initialClinic={hierarchy.clinicId}
                initialMonth={hierarchy.dispenseMonth}
                compact={false}
                disabled={isLocationFixed}
              />
            </div>

            <LockBanner />

            <div className="flex flex-col md:flex-row items-center gap-8 pt-4 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-4">
                <span className="text-xs font-black opacity-60">
                  نوع العيادة:
                </span>
                <div className="flex p-1 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
                  <button
                    onClick={() => !isLocationFixed && setIsSupported(false)}
                    className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${!isSupported ? "bg-[var(--color-primary)] text-white shadow-lg" : "opacity-40"}`}
                  >
                    <Building2 size={14} /> مملوكة
                  </button>
                  <button
                    onClick={() => !isLocationFixed && setIsSupported(true)}
                    className={`px-6 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${isSupported ? "bg-emerald-500 text-white shadow-lg" : "opacity-40"}`}
                  >
                    <HelpCircle size={14} /> مدعومة
                  </button>
                </div>
              </div>

              <Button
                variant={isLocationFixed ? "secondary" : "cta"}
                icon={isLocationFixed ? Unlock : Lock}
                onClick={() => setIsLocationFixed(!isLocationFixed)}
                className="md:mr-auto px-8 rounded-xl"
              >
                {isLocationFixed ? "تعديل الموقع" : "تثبيت الموقع"}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {hierarchy.branchId && (
        <div className="no-print animate-slideUp space-y-6">
          {/* --- Entry Controls --- */}
          <Card className="p-6 border-none shadow-lg bg-[var(--color-primary)]/5">
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div className="flex items-center gap-3">
                <div className="bg-[var(--color-bg-card)]/40 p-2 rounded-lg">
                  <CalendarDays
                    size={20}
                    className="text-[var(--color-primary)]"
                  />
                </div>
                <div>
                  <h3 className="font-black text-sm">
                    إدخال التذاكر للعيادات{" "}
                    {isSupported ? "المدعومة" : "المملوكة"}
                  </h3>
                  <p className="text-[10px] opacity-60 uppercase font-bold tracking-widest">
                    {hierarchyNames.clinic ||
                      hierarchyNames.area ||
                      hierarchyNames.branch}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 bg-[var(--color-bg-card)]/40 p-1 rounded-2xl border border-[var(--color-border)]">
                <button
                  onClick={() => requestEntryModeSwitch("weekly")}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${entryMode === "weekly" ? "bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-md" : "opacity-60"}`}
                >
                  <CalendarDays size={14} /> إدخال أسبوعي
                </button>
                <button
                  onClick={() => requestEntryModeSwitch("monthly")}
                  className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${entryMode === "monthly" ? "bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-md" : "opacity-60"}`}
                >
                  <CalendarRange size={14} /> إدخال شهري
                </button>
                {hierarchy.clinicId && (
                  <button
                    onClick={() => requestEntryModeSwitch("daily")}
                    className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${entryMode === "daily" ? "bg-[var(--color-bg-card)] text-[var(--color-primary)] shadow-md" : "opacity-60"}`}
                  >
                    <ClipboardList size={14} /> إدخال يومي
                  </button>
                )}
                {hierarchy.areaId && !hierarchy.clinicId && (
                  <button
                    onClick={() => requestEntryModeSwitch("quick_clinics")}
                    className={`px-6 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${entryMode === "quick_clinics" ? "bg-indigo-500 text-white shadow-md" : "opacity-60"}`}
                  >
                    <Layers size={14} /> إدخال سريع للعيادات
                  </button>
                )}
              </div>

              {!isSupported && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black opacity-60">الفئة:</span>
                  <select
                    className="bg-[var(--color-bg-card)] border-none rounded-xl px-4 py-2 text-xs font-black outline-none focus:ring-2 focus:ring-primary/20 text-[var(--color-text)]"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                  >
                    <option value="عام">عام (الكل)</option>
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </Card>

          {/* --- Entry Form --- */}
          {entryMode === "quick_clinics" ? (
              <MedicalTicketsGridEntry branchId={hierarchy.branchId} areaId={hierarchy.areaId} dispenseMonth={hierarchy.dispenseMonth} isLocked={isLocked} />
          ) : entryMode === "weekly" ? (
            <Card className="p-8 border-[var(--color-primary)]/20 shadow-2xl relative">
              <div className="absolute top-0 right-0 w-32 h-32 overflow-hidden pointer-events-none rounded-tr-2xl"><div className="absolute top-0 right-0 w-32 h-32 bg-[var(--color-primary)]/5 rounded-bl-full -mr-4 -mt-4" /></div>

              <div className="flex flex-col items-center gap-8">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-black opacity-60">
                    اختر الأسبوع:
                  </span>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map((w) => (
                      <button
                        key={w}
                        onClick={() => setSelectedWeek(w)}
                        className={`w-12 h-12 rounded-2xl font-black text-sm transition-all border ${selectedWeek === w ? "bg-[var(--color-primary)] text-white border-transparent shadow-lg scale-110" : "bg-[var(--color-bg-card)] border-[var(--color-border)] text-[var(--color-text)] opacity-60 hover:opacity-100"}`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl" onKeyDown={handleKeyDown}>
                  {/* Morning */}
                  <div className="p-8 rounded-[40px] bg-[var(--color-success-bg)] border-2 border-[var(--color-success)]/20 space-y-6 relative group">
                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12 group-hover:rotate-0 transition-transform">
                      <Sun size={24} />
                    </div>
                    <h4 className="text-lg font-black text-emerald-700 flex items-center gap-2">
                      الفترة الصباحية
                    </h4>
                    {isSupported ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input
                          label="هيئة"
                          hint="عدد تذاكر موظفي الهيئة وعائلاتهم في العيادات المدعمة"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_authority}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_authority: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="طلاب"
                          hint="عدد تذاكر طلاب المدارس المشمولين بالتأمين الصحي"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_students}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_students: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="رضع"
                          hint="عدد تذاكر الأطفال دون سن المدرسة"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_infants}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_infants: e.target.value})}
                          disabled={isLocked}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="تذاكر 56ب"
                          hint="تذكرة 56ب: تذكرة العلاج الخارجي لغير المؤمن عليهم (الفئات المستفيدة بالمجان)"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.morning_56b}
                          data-focus="first-input"
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              morning_56b: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                        <Input
                          label="تذاكر 56ج"
                          hint="تذكرة 56ج: تذكرة العلاج الخارجي للمؤمن عليهم (موظفي الهيئة والمعاشات)"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.morning_56c}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              morning_56c: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                      </div>
                    )}
                  </div>

                  {/* Evening */}
                  <div className="p-8 rounded-[40px] bg-[var(--color-info-bg)] border-2 border-[var(--color-info)]/20 space-y-6 relative group">
                    <div className="absolute -top-4 -right-4 bg-indigo-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12 group-hover:rotate-0 transition-transform">
                      <Moon size={24} />
                    </div>
                    <h4 className="text-lg font-black text-indigo-700 flex items-center gap-2">
                      الفترة المسائية
                    </h4>
                    {isSupported ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Input
                          label="هيئة"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_authority}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_authority: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="طلاب"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_students}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_students: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="رضع"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_infants}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_infants: e.target.value})}
                          disabled={isLocked}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="تذاكر 56ب"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.evening_56b}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              evening_56b: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                        <Input
                          label="تذاكر 56ج"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.evening_56c}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              evening_56c: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full max-w-4xl pt-6">
                  {selectedWeek > 1 && (
                    <Button
                      variant="outline"
                      icon={Copy}
                      onClick={handleCopyPreviousWeek}
                      title="نسخ بيانات الأسبوع السابق"
                    >
                      نسخ
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    onClick={() => {
                      setWeeklyForm({
                        morning_56b: "",
                        morning_56c: "",
                        evening_56b: "",
                        evening_56c: "",
                      });
                      setSupportedWeeklyForm({
                        morning_authority: "", morning_students: "", morning_infants: "",
                        evening_authority: "", evening_students: "", evening_infants: ""
                      });
                    }}
                  >
                    إعادة تعيين
                  </Button>
                  <ExportMenu
                    data={formExportData}
                    columns={formExportColumns}
                    options={formExportOptions}
                    disabled={saving}
                  />
                  <Button
                    variant="primary"
                    icon={isLocked ? Lock : Save}
                    className="flex-1 py-4 rounded-2xl shadow-xl"
                    loading={saving}
                    disabled={isLocked}
                    onClick={handleWeeklySave}
                  >
                    {isLocked
                      ? "الشهر مقفل"
                      : `حفظ بيانات الأسبوع ${selectedWeek}`}
                  </Button>
                </div>
              </div>
            </Card>
          ) : entryMode === "monthly" ? (
            <Card className="p-8 border-emerald-500/20 shadow-2xl">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {monthlyForm.map((item, idx) => (
                  <div
                    key={item.week}
                    className="p-6 rounded-3xl bg-[var(--color-bg)] border border-[var(--color-border)] space-y-4 hover:border-[var(--color-primary)] transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="w-8 h-8 rounded-full bg-[var(--color-bg-card)] text-[var(--color-text-muted)] text-[10px] font-black flex items-center justify-center group-hover:bg-[var(--color-primary)] group-hover:text-white transition-colors">
                        {item.week}
                      </span>
                      <h4 className="text-xs font-black opacity-60">
                        الأسبوع {["الأول", "الثاني", "الثالث", "الرابع"][idx]}
                      </h4>
                    </div>
                    <div className="space-y-4">
                      {isSupported ? (
                        <div className="space-y-2">
                          <Input
                            label="هيئة"
                            type="number"
                            placeholder="0"
                            value={item.authority}
                            onChange={(e) => {
                              monthlyEditedRef.current = true;
                              const next = [...monthlyForm];
                              next[idx].authority = e.target.value;
                              setMonthlyForm(next);
                            }}
                            disabled={isLocked}
                          />
                          <Input
                            label="طلاب"
                            type="number"
                            placeholder="0"
                            value={item.students}
                            onChange={(e) => {
                              monthlyEditedRef.current = true;
                              const next = [...monthlyForm];
                              next[idx].students = e.target.value;
                              setMonthlyForm(next);
                            }}
                            disabled={isLocked}
                          />
                          <Input
                            label="رضع"
                            type="number"
                            placeholder="0"
                            value={item.infants}
                            onChange={(e) => {
                              monthlyEditedRef.current = true;
                              const next = [...monthlyForm];
                              next[idx].infants = e.target.value;
                              setMonthlyForm(next);
                            }}
                            disabled={isLocked}
                          />
                        </div>
                      ) : (
                        <>
                          <Input
                            label="تذاكر 56ب"
                            type="number"
                            placeholder="0"
                            value={item.tickets_56b}
                            onChange={(e) => {
                              monthlyEditedRef.current = true;
                              const next = [...monthlyForm];
                              next[idx].tickets_56b = e.target.value;
                              setMonthlyForm(next);
                            }}
                            disabled={isLocked}
                          />
                          <Input
                            label="تذاكر 56ج"
                            type="number"
                            placeholder="0"
                            value={item.tickets_56c}
                            onChange={(e) => {
                              monthlyEditedRef.current = true;
                              const next = [...monthlyForm];
                              next[idx].tickets_56c = e.target.value;
                              setMonthlyForm(next);
                            }}
                            disabled={isLocked}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 pt-8">
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  onClick={() =>
                    setMonthlyForm(
                      monthlyForm.map((p) => ({
                        ...p,
                        tickets_56b: "",
                        tickets_56c: "",
                        authority: "",
                        students: "",
                        infants: "",
                      })),
                    )
                  }
                >
                  إعادة تعيين
                </Button>
                <ExportMenu
                  data={formExportData}
                  columns={formExportColumns}
                  options={formExportOptions}
                  disabled={saving}
                />
                <Button
                  variant="success"
                  icon={isLocked ? Lock : Save}
                  className="flex-1 py-4 rounded-2xl shadow-xl"
                  loading={saving}
                  disabled={isLocked}
                  onClick={handleMonthlySave}
                >
                  {isLocked ? "الشهر مقفل" : "حفظ جميع الفترات"}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="p-8 border-amber-500/20 shadow-2xl relative">
                <div className="flex flex-col gap-8 w-full">
                  {/* الصف العلوي: التقويم + التاريخ + العنوان */}
                  <div className="flex flex-row items-stretch gap-6 w-full">
                    {/* جدول نشاط التقويم */}
                    <div className="w-[320px] shrink-0 space-y-3">
                      <div className="flex items-center gap-2 text-xs font-black text-[var(--color-primary)] opacity-80 uppercase tracking-widest px-2">
                          <CalendarDays size={14} />
                          <span>متابعة الإدخال اليومي {isSupported ? '(مدعمة)' : '(مملوكة)'}</span>
                      </div>
                      <div className="bg-[var(--color-bg-card)]/40 p-4 rounded-[32px] border border-[var(--color-border)] shadow-inner">
                          <div className="grid grid-cols-7 gap-2">
                              {['س', 'ح', 'ن', 'ث', 'أر', 'خ', 'ج'].map(d => (
                                  <div key={d} className="text-[10px] font-black text-center opacity-40 py-1">{d}</div>
                              ))}
                              {daysInMonth.map(d => {
                                  const [year, month] = hierarchy.dispenseMonth.split('-');
                                  const dateStr = `${year}-${month}-${d.toString().padStart(2, '0')}`;
                                  const hasData = dailyActivity[dateStr];
                                  const isSelected = entryDate === dateStr;
                                  return (
                                      <button
                                          key={d}
                                          onClick={() => handleSelectDay(d)}
                                          className={`
                                              h-10 rounded-xl text-xs font-black transition-all flex items-center justify-center relative
                                              ${isSelected ? 'bg-[var(--color-primary)] text-white shadow-lg scale-110 z-10' : 
                                                hasData ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30' : 
                                                'bg-[var(--color-bg-card)] border border-[var(--color-border)] text-[var(--color-text)] opacity-60 hover:opacity-100'}
                                          `}
                                      >
                                          {d}
                                          {hasData && !isSelected && (
                                              <div className="absolute top-1 right-1 w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                          )}
                                      </button>
                                  );
                              })}
                          </div>
                          <div className="mt-3 flex items-center gap-4 px-2">
                              <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${isSupported ? 'bg-indigo-500' : 'bg-emerald-500'}`} />
                                  <span className="text-[10px] font-bold opacity-60">تم إدخال {isSupported ? '(مدعم)' : '(مجاني)'}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                  <div className="w-2 h-2 rounded-full bg-[var(--color-primary)]" />
                                  <span className="text-[10px] font-bold opacity-60">اليوم المحدد</span>
                              </div>
                          </div>
                      </div>
                    </div>

                    {/* العنوان + التاريخ المختار */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-4">
                        <h3 className={`text-2xl font-black ${isSupported ? 'text-indigo-700' : 'text-emerald-700'} flex items-center gap-3`}>
                            {isSupported ? (
                                <><div className="w-3 h-8 bg-indigo-500 rounded-full" /> السجل اليومي - التذاكر المدعمة</>
                            ) : (
                                <><div className="w-3 h-8 bg-emerald-500 rounded-full" /> السجل اليومي - التذاكر المجانية</>
                            )}
                        </h3>
                        <p className="text-xs font-bold opacity-60">يرجى إدخال البيانات للفترتين الصباحية والمسائية</p>
                        <div className="flex items-center gap-4 bg-[var(--color-warning-bg)] p-4 rounded-2xl border border-[var(--color-warning)]/20 w-full max-w-sm justify-center">
                          <span className="text-xs font-black text-amber-800">
                            التاريخ المختار (DD/MM/YYYY):
                          </span>
                          <div className="flex flex-col gap-1">
                            <div 
                              className="flex items-center gap-3 p-2 px-4 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm cursor-pointer hover:border-[var(--color-primary)] transition-all relative group"
                              onClick={(e) => e.currentTarget.querySelector('input')?.showPicker()}
                            >
                              <CalendarDays size={18} className="text-[var(--color-primary)] group-hover:scale-110 transition-transform" />
                              <span className="text-sm font-black text-[var(--color-text)]">
                                {(() => {
                                  if (!entryDate) return '--------';
                                  const [y, m, d] = entryDate.split('-');
                                  return `${d}/${m}/${y}`;
                                })()}
                              </span>
                              <input
                                type="date"
                                value={entryDate}
                                onChange={(e) => {
                                    setEntryDate(e.target.value);
                                    const dayNum = parseInt(e.target.value.split('-')[2]);
                                    if (dayNum) handleSelectDay(dayNum);
                                }}
                                className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
                              />
                            </div>
                            <span className="text-[10px] font-black text-[var(--color-primary)] text-center">
                                (الأسبوع {new Date(entryDate).getDate() <= 7 ? 1 : new Date(entryDate).getDate() <= 15 ? 2 : new Date(entryDate).getDate() <= 22 ? 3 : 4})
                            </span>
                          </div>
                        </div>
                    </div>
                  </div>

                  {/* صناديق الإدخال بكامل العرض */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-4xl mx-auto">
                  {/* Morning */}
                  <div className="p-8 rounded-[40px] bg-[var(--color-success-bg)] border-2 border-[var(--color-success)]/20 space-y-6 relative group">
                    <div className="absolute -top-4 -right-4 bg-emerald-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform rotate-12 group-hover:rotate-0 transition-transform">
                      <Sun size={24} />
                    </div>
                    <h4 className="text-lg font-black text-emerald-700 flex items-center gap-2">
                      الفترة الصباحية
                    </h4>
                    {isSupported ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <Input
                          label="هيئة"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_authority}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_authority: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="طلاب"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_students}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_students: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="رضع"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.morning_infants}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, morning_infants: e.target.value})}
                          disabled={isLocked}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="تذاكر 56ب"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.morning_56b}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              morning_56b: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                        <Input
                          label="تذاكر 56ج"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.morning_56c}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              morning_56c: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                      </div>
                    )}
                  </div>

                  {/* Evening */}
                  <div className="p-8 rounded-[40px] bg-[var(--color-info-bg)] border-2 border-[var(--color-info)]/20 space-y-6 relative group">
                    <div className="absolute -top-4 -right-4 bg-indigo-500 text-white w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transform -rotate-12 group-hover:rotate-0 transition-transform">
                      <Moon size={24} />
                    </div>
                    <h4 className="text-lg font-black text-indigo-700 flex items-center gap-2">
                      الفترة المسائية
                    </h4>
                    {isSupported ? (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        <Input
                          label="هيئة"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_authority}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_authority: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="طلاب"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_students}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_students: e.target.value})}
                          disabled={isLocked}
                        />
                        <Input
                          label="رضع"
                          type="number"
                          placeholder="0"
                          value={supportedWeeklyForm.evening_infants}
                          onChange={(e) => setSupportedWeeklyForm({...supportedWeeklyForm, evening_infants: e.target.value})}
                          disabled={isLocked}
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-4">
                        <Input
                          label="تذاكر 56ب"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.evening_56b}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              evening_56b: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                        <Input
                          label="تذاكر 56ج"
                          type="number"
                          icon={Hash}
                          placeholder="0"
                          value={weeklyForm.evening_56c}
                          onChange={(e) =>
                            setWeeklyForm({
                              ...weeklyForm,
                              evening_56c: e.target.value,
                            })
                          }
                          disabled={isLocked}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-4 w-full max-w-4xl pt-6">
                  <Button
                    variant="secondary"
                    icon={RotateCcw}
                    onClick={() =>
                      setWeeklyForm({
                        morning_56b: "",
                        morning_56c: "",
                        evening_56b: "",
                        evening_56c: "",
                      })
                    }
                  >
                    إعادة تعيين
                  </Button>
                  <Button
                    variant="primary"
                    icon={isLocked ? Lock : Save}
                    className="flex-1 py-4 rounded-2xl shadow-xl bg-amber-600 hover:bg-amber-700 border-none"
                    loading={saving}
                    disabled={isLocked}
                    onClick={handleDailySave}
                  >
                    {isLocked ? "الشهر مقفل" : "حفظ بيانات اليوم"}
                  </Button>
                </div>
                </div>
            </Card>
          )}
        </div>
      )}

      {/* --- Summary Tables --- */}
      <div className="space-y-8 pt-8">
        <Card className="no-print p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-md flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4 w-full">
            <div className="flex items-center gap-4 flex-1 min-w-[300px]">
              <Search size={18} className="text-[var(--color-primary)]" />
              <input
                type="text"
                placeholder="بحث باسم العيادة أو الجهة..."
                className="flex-1 bg-transparent border-none outline-none text-sm font-bold text-[var(--color-text)]"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {/* Smart Filters */}
            <div className="flex items-center gap-2 pl-4 border-r border-[var(--color-border)]">
              <button
                onClick={() => setFilterLockStatus(prev => prev === 'all' ? 'unlocked' : prev === 'unlocked' ? 'locked' : 'all')}
                className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterLockStatus === 'locked' ? 'bg-amber-500 text-white border-transparent shadow-md' :
                  filterLockStatus === 'unlocked' ? 'bg-emerald-500 text-white border-transparent shadow-md' :
                  'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50'
                }`}
                title={filterLockStatus === 'locked' ? 'عرض السجلات المقفلة فقط' : filterLockStatus === 'unlocked' ? 'عرض السجلات المفتوحة فقط' : 'كل الحالات'}
              >
                {filterLockStatus === 'locked' ? <Lock size={14} /> : <Unlock size={14} />}
                <span>
                  {filterLockStatus === 'all' ? 'حالة القفل' : filterLockStatus === 'locked' ? 'مقفل' : 'مفتوح'}
                </span>
              </button>

              <button
                onClick={() => setFilterHighVolume(!filterHighVolume)}
                className={`px-4 py-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterHighVolume ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20' :
                  'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-slate-50'
                }`}
                title="عرض الجهات ذات الاستهلاك المرتفع (تنبيه الكثافة)"
              >
                <AlertCircle size={14} />
                <span>تنبيه الكثافة</span>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
            <span className="text-xs font-black opacity-60">عرض السجلات:</span>
            <div className="flex p-1 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
              <button
                onClick={() => setTableViewMode('all')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${tableViewMode === 'all' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'opacity-60 hover:opacity-100'}`}
              >
                <Layers size={14} /> الكل
              </button>
              <button
                onClick={() => setTableViewMode('owned')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${tableViewMode === 'owned' ? 'bg-[var(--color-primary)] text-white shadow-md' : 'opacity-60 hover:opacity-100'}`}
              >
                <Building2 size={14} /> مملوكة فقط
              </button>
              <button
                onClick={() => setTableViewMode('supported')}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${tableViewMode === 'supported' ? 'bg-emerald-500 text-white shadow-md' : 'opacity-60 hover:opacity-100'}`}
              >
                <HelpCircle size={14} /> مدعومة فقط
              </button>
            </div>
          </div>
        </Card>
        {/* Owned Clinics Table */}
        {(tableViewMode === 'all' || tableViewMode === 'owned') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-sm font-black text-[var(--color-primary)]">
            <Building2 size={18} />
            <span>سجلات العيادات المملوكة</span>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-lg overflow-hidden no-print">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <tr className="text-[var(--color-text)] font-black uppercase">
                    <th className="p-4 w-12 text-center">#</th>
                    <th className="p-4">العيادة</th>
                    <th className="p-4">الصنف</th>
                    <th
                      className="p-4 text-center border-x border-[var(--color-border)]"
                      colSpan={2}
                    >
                      الأول
                    </th>
                    <th
                      className="p-4 text-center border-x border-[var(--color-border)]"
                      colSpan={2}
                    >
                      الثاني
                    </th>
                    <th
                      className="p-4 text-center border-x border-[var(--color-border)]"
                      colSpan={2}
                    >
                      الثالث
                    </th>
                    <th
                      className="p-4 text-center border-x border-[var(--color-border)]"
                      colSpan={2}
                    >
                      الرابع
                    </th>
                    <th
                      className="p-4 text-center bg-[var(--color-primary)]/5"
                      colSpan={2}
                    >
                      الإجمالي
                    </th>
                    <th className="p-4 text-center no-print">إجراءات</th>
                  </tr>
                  <tr className="bg-[var(--color-bg-card)] text-[10px] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <th colSpan={3}></th>
                    <th className="p-2 border-x">56ب</th>
                    <th className="p-2 border-x">56ج</th>
                    <th className="p-2 border-x">56ب</th>
                    <th className="p-2 border-x">56ج</th>
                    <th className="p-2 border-x">56ب</th>
                    <th className="p-2 border-x">56ج</th>
                    <th className="p-2 border-x">56ب</th>
                    <th className="p-2 border-x">56ج</th>
                    <th className="p-2 bg-[var(--color-primary)]/10">56ب</th>
                    <th className="p-2 bg-[var(--color-primary)]/10">56ج</th>
                    <th className="no-print"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {getProcessedData(false).data.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات حالياً</td>
                    </tr>
                  ) : (
                    getProcessedData(false).data.map((row, i) => (
                    <tr key={i} className="hover:bg-[var(--color-primary)]/5 transition-colors text-[var(--color-text)]">
                      <td className="p-4 text-center opacity-50">{i + 1}</td>
                      <td className="p-4 font-black">{row.name}</td>
                      <td className="p-4 font-bold text-[var(--color-primary)]">
                        {row.category}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w1_56b}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w1_56c}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w2_56b}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w2_56c}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w3_56b}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w3_56c}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w4_56b}
                      </td>
                      <td className="p-4 text-center border-x font-mono">
                        {row.w4_56c}
                      </td>
                      <td className="p-4 text-center bg-[var(--color-primary)]/5 font-black text-[var(--color-primary)]">
                        {row.total_56b}
                      </td>
                      <td className="p-4 text-center bg-[var(--color-primary)]/5 font-black text-[var(--color-primary)]">
                        {row.total_56c}
                      </td>
                      <td className="p-4 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            disabled={isLocked}
                            onClick={() => handleEditRow(row, false)}
                            className={`p-2 rounded-lg transition-all ${isLocked ? "text-slate-300 opacity-50" : "text-blue-500 hover:bg-blue-100"}`}
                            title={isLocked ? "مقفل" : "تعديل"}
                          >
                            {isLocked ? (
                              <Lock size={14} />
                            ) : (
                              <Edit2 size={14} />
                            )}
                          </button>
                          <button
                            disabled={isLocked}
                            onClick={() => handleDeleteRow(row, false)}
                            className={`p-2 rounded-lg transition-all ${isLocked ? "text-slate-300 opacity-50" : "text-red-500 hover:bg-red-100"}`}
                            title={isLocked ? "مقفل" : "حذف"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
                <tfoot className="print-table-footer">
                  <tr className="bg-[var(--color-bg)] border-t-2 border-[var(--color-border)] font-bold text-[var(--color-text)]">
                    <td colSpan="3" className="p-4 text-right">
                      الإجمالي المفلتر ({getProcessedData(false).totalCount} سجل):
                    </td>
                    {[1, 2, 3, 4].map((w) => {
                      const allData = getProcessedData(false).data;
                      const sum56b = allData.reduce((s, r) => s + (parseInt(r[`w${w}_56b`]) || 0), 0);
                      const sum56c = allData.reduce((s, r) => s + (parseInt(r[`w${w}_56c`]) || 0), 0);
                      return (
                        <React.Fragment key={w}>
                          <td className="p-4 text-center border-x font-black text-[var(--color-primary)]">{sum56b || '-'}</td>
                          <td className="p-4 text-center border-x font-black text-[var(--color-primary)]">{sum56c || '-'}</td>
                        </React.Fragment>
                      );
                    })}
                    <td className="p-4 text-center bg-[var(--color-primary)]/10 font-black text-[var(--color-primary)]">
                      {getProcessedData(false).data.reduce((s, r) => s + (parseInt(r.total_56b) || 0), 0)}
                    </td>
                    <td className="p-4 text-center bg-[var(--color-primary)]/10 font-black text-[var(--color-primary)]">
                      {getProcessedData(false).data.reduce((s, r) => s + (parseInt(r.total_56c) || 0), 0)}
                    </td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="no-print">
              <Pagination
                currentPage={currentPageOwned}
                totalPages={getProcessedData(false).totalPages}
                totalRecords={getProcessedData(false).totalCount}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPageOwned}
                onRowsPerPageChange={setRowsPerPage}
              />
            </div>
          </div>

          {/* Print Only Table - Owned */}
          {getProcessedData(false).allData.length > 0 && (
          <div className="only-print">
            <h3 className="text-center font-bold mb-4">سجلات العيادات المملوكة - كامل الشهر</h3>
            <table className="w-full text-right text-[10px] border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr className="border border-slate-300">
                  <th className="p-2 border border-slate-300">العيادة</th>
                  <th className="p-2 border border-slate-300">الصنف</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={2}>الأول</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={2}>الثاني</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={2}>الثالث</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={2}>الرابع</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={2}>الإجمالي</th>
                </tr>
                <tr className="border border-slate-300 bg-slate-50 text-[9px]">
                  <th className="p-1 border border-slate-300" colSpan={2}></th>
                  <th className="p-1 border border-slate-300 text-center">56ب</th>
                  <th className="p-1 border border-slate-300 text-center">56ج</th>
                  <th className="p-1 border border-slate-300 text-center">56ب</th>
                  <th className="p-1 border border-slate-300 text-center">56ج</th>
                  <th className="p-1 border border-slate-300 text-center">56ب</th>
                  <th className="p-1 border border-slate-300 text-center">56ج</th>
                  <th className="p-1 border border-slate-300 text-center">56ب</th>
                  <th className="p-1 border border-slate-300 text-center">56ج</th>
                  <th className="p-1 border border-slate-300 text-center bg-slate-200">56ب</th>
                  <th className="p-1 border border-slate-300 text-center bg-slate-200">56ج</th>
                </tr>
              </thead>
              <tbody>
                {getProcessedData(false).allData.map((row, i) => (
                  <tr key={i} className="border border-slate-300">
                    <td className="p-1 border border-slate-300 font-bold">{row.name}</td>
                    <td className="p-1 border border-slate-300">{row.category}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w1_56b}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w1_56c}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w2_56b}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w2_56c}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w3_56b}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w3_56c}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w4_56b}</td>
                    <td className="p-1 border border-slate-300 text-center">{row.w4_56c}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-50">{row.total_56b}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-50">{row.total_56c}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold">
                <tr className="border border-slate-300">
                  <td colSpan={2} className="p-2 border border-slate-300 text-right">
                    الإجمالي العام ({getProcessedData(false).allData.length} سجل):
                  </td>
                  {[1, 2, 3, 4].map((w) => {
                    const allData = getProcessedData(false).allData;
                    const sum56b = allData.reduce((s, r) => s + (parseInt(r[`w${w}_56b`]) || 0), 0);
                    const sum56c = allData.reduce((s, r) => s + (parseInt(r[`w${w}_56c`]) || 0), 0);
                    return (
                      <React.Fragment key={w}>
                        <td className="p-1 border border-slate-300 text-center">{sum56b}</td>
                        <td className="p-1 border border-slate-300 text-center">{sum56c}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className="p-1 border border-slate-300 text-center bg-slate-200 font-black">
                    {getProcessedData(false).allData.reduce((s, r) => s + (parseInt(r.total_56b) || 0), 0)}
                  </td>
                  <td className="p-1 border border-slate-300 text-center bg-slate-200 font-black">
                    {getProcessedData(false).allData.reduce((s, r) => s + (parseInt(r.total_56c) || 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}


        </div>
        )}

        {/* Supported Clinics Table */}
        {(tableViewMode === 'all' || tableViewMode === 'supported') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-sm font-black text-emerald-600">
            <HelpCircle size={18} />
            <span>سجلات العيادات المدعومة</span>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-lg overflow-hidden no-print">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <tr className="text-[var(--color-text)] font-black uppercase">
                    <th className="p-4 w-12 text-center" rowSpan={2}>
                      #
                    </th>
                    <th className="p-4" rowSpan={2}>
                      العيادة
                    </th>
                    <th
                      className="p-4 text-center border-x border-emerald-100"
                      colSpan={3}
                    >
                      الأول
                    </th>
                    <th
                      className="p-4 text-center border-x border-emerald-100"
                      colSpan={3}
                    >
                      الثاني
                    </th>
                    <th
                      className="p-4 text-center border-x border-emerald-100"
                      colSpan={3}
                    >
                      الثالث
                    </th>
                    <th
                      className="p-4 text-center border-x border-emerald-100"
                      colSpan={3}
                    >
                      الرابع
                    </th>
                    <th
                      className="p-4 text-center bg-emerald-100/30"
                      colSpan={4}
                    >
                      الإجمالي العام
                    </th>
                    <th className="p-4 text-center no-print" rowSpan={2}>
                      إجراءات
                    </th>
                  </tr>
                  <tr className="bg-[var(--color-bg-card)] text-[10px] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    <th className="p-2 border-x">هيئة</th>
                    <th className="p-2 border-x">طلاب</th>
                    <th className="p-2 border-x">رضع</th>
                    <th className="p-2 border-x">هيئة</th>
                    <th className="p-2 border-x">طلاب</th>
                    <th className="p-2 border-x">رضع</th>
                    <th className="p-2 border-x">هيئة</th>
                    <th className="p-2 border-x">طلاب</th>
                    <th className="p-2 border-x">رضع</th>
                    <th className="p-2 border-x">هيئة</th>
                    <th className="p-2 border-x">طلاب</th>
                    <th className="p-2 border-x">رضع</th>
                    <th className="p-2">هيئة</th>
                    <th className="p-2">طلاب</th>
                    <th className="p-2">رضع</th>
                    <th className="p-2 bg-emerald-100/30">الكل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {getProcessedData(true).data.length === 0 ? (
                    <tr>
                      <td colSpan={19} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات حالياً</td>
                    </tr>
                  ) : (
                    getProcessedData(true).data.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-[var(--color-primary)]/5 transition-colors text-[var(--color-text)]"
                    >
                      <td className="p-4 text-center opacity-50">{i + 1}</td>
                      <td className="p-4 font-black">{row.name}</td>
                      {[1, 2, 3, 4].map((w) => (
                        <React.Fragment key={w}>
                          <td className="p-4 text-center border-x font-mono">
                            {row[`w${w}_هيئة`]}
                          </td>
                          <td className="p-4 text-center border-x font-mono">
                            {row[`w${w}_طلاب`]}
                          </td>
                          <td className="p-4 text-center border-x font-mono">
                            {row[`w${w}_رضع`]}
                          </td>
                        </React.Fragment>
                      ))}
                      <td className="p-4 text-center font-black text-blue-600 bg-blue-50/10">
                        {row.total_هيئة?.toLocaleString() || 0}
                      </td>
                      <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/10">
                        {row.total_طلاب?.toLocaleString() || 0}
                      </td>
                      <td className="p-4 text-center font-black text-amber-600 bg-amber-50/10">
                        {row.total_رضع?.toLocaleString() || 0}
                      </td>
                      <td className="p-4 text-center bg-emerald-100/20 font-black text-emerald-700">
                        {row.total.toLocaleString()}
                      </td>
                      <td className="p-4 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            disabled={isLocked}
                            onClick={() => handleEditRow(row, true)}
                            className={`p-2 rounded-lg transition-all ${isLocked ? "text-slate-300 opacity-50" : "text-blue-500 hover:bg-blue-100"}`}
                            title={isLocked ? "مقفل" : "تعديل"}
                          >
                            {isLocked ? (
                              <Lock size={14} />
                            ) : (
                              <Edit2 size={14} />
                            )}
                          </button>
                          <button
                            disabled={isLocked}
                            onClick={() => handleDeleteRow(row, true)}
                            className={`p-2 rounded-lg transition-all ${isLocked ? "text-slate-300 opacity-50" : "text-red-500 hover:bg-red-100"}`}
                            title={isLocked ? "مقفل" : "حذف"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )))}
                </tbody>
                <tfoot className="print-table-footer">
                  <tr className="bg-[var(--color-bg)] border-t-2 border-[var(--color-border)] font-bold text-[var(--color-text)]">
                    <td colSpan="2" className="p-4 text-right">
                      الإجمالي المفلتر ({getProcessedData(true).totalCount} سجل):
                    </td>
                    {[1, 2, 3, 4].map((w) => {
                      const allData = getProcessedData(true).data;
                      return supportedCategories.map((cat) => {
                        const sum = allData.reduce((s, r) => s + (parseInt(r[`w${w}_${cat}`]) || 0), 0);
                        return (
                          <td key={`${w}_${cat}`} className="p-4 text-center border-x font-black">
                            {sum || '-'}
                          </td>
                        );
                      });
                    })}
                    <td className="p-4 text-center font-black text-blue-600 bg-blue-50/10">
                      {getProcessedData(true).data.reduce((s, r) => s + (parseInt(r.total_هيئة) || 0), 0)}
                    </td>
                    <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/10">
                      {getProcessedData(true).data.reduce((s, r) => s + (parseInt(r.total_طلاب) || 0), 0)}
                    </td>
                    <td className="p-4 text-center font-black text-amber-600 bg-amber-50/10">
                      {getProcessedData(true).data.reduce((s, r) => s + (parseInt(r.total_رضع) || 0), 0)}
                    </td>
                    <td className="p-4 text-center bg-[var(--color-primary)]/10 font-black text-[var(--color-primary)]">
                      {getProcessedData(true).data.reduce((s, r) => s + (parseInt(r.total) || 0), 0)}
                    </td>
                    <td className="no-print"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="no-print">
              <Pagination
                currentPage={currentPageSupported}
                totalPages={getProcessedData(true).totalPages}
                totalRecords={getProcessedData(true).totalCount}
                rowsPerPage={rowsPerPage}
                onPageChange={setCurrentPageSupported}
                onRowsPerPageChange={setRowsPerPage}
              />
            </div>
          </div>

          {/* Print Only Table - Supported */}
          {getProcessedData(true).allData.length > 0 && (
          <div className="only-print mt-8">
            <h3 className="text-center font-bold mb-4">سجلات العيادات المدعومة - كامل الشهر</h3>
            <table className="w-full text-right text-[10px] border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr className="border border-slate-300">
                  <th className="p-2 border border-slate-300" rowSpan={2}>العيادة</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الأول</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الثاني</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الثالث</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الرابع</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={4}>الإجمالي العام</th>
                </tr>
                <tr className="border border-slate-300">
                  <th className="p-1 border border-slate-300">هيئة</th>
                  <th className="p-1 border border-slate-300">طلاب</th>
                  <th className="p-1 border border-slate-300">رضع</th>
                  <th className="p-1 border border-slate-300">هيئة</th>
                  <th className="p-1 border border-slate-300">طلاب</th>
                  <th className="p-1 border border-slate-300">رضع</th>
                  <th className="p-1 border border-slate-300">هيئة</th>
                  <th className="p-1 border border-slate-300">طلاب</th>
                  <th className="p-1 border border-slate-300">رضع</th>
                  <th className="p-1 border border-slate-300">هيئة</th>
                  <th className="p-1 border border-slate-300">طلاب</th>
                  <th className="p-1 border border-slate-300">رضع</th>
                  <th className="p-1 border border-slate-300">هيئة</th>
                  <th className="p-1 border border-slate-300">طلاب</th>
                  <th className="p-1 border border-slate-300">رضع</th>
                  <th className="p-1 border border-slate-300">الكل</th>
                </tr>
              </thead>
              <tbody>
                {getProcessedData(true).allData.map((row, i) => (
                  <tr key={i} className="border border-slate-300">
                    <td className="p-1 border border-slate-300 font-bold">{row.name}</td>
                    {[1, 2, 3, 4].map(w => (
                      <React.Fragment key={w}>
                        <td className="p-1 border border-slate-300 text-center">{row[`w${w}_هيئة`]}</td>
                        <td className="p-1 border border-slate-300 text-center">{row[`w${w}_طلاب`]}</td>
                        <td className="p-1 border border-slate-300 text-center">{row[`w${w}_رضع`]}</td>
                      </React.Fragment>
                    ))}
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-50">{row.total_هيئة}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-50">{row.total_طلاب}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-50">{row.total_رضع}</td>
                    <td className="p-1 border border-slate-300 text-center font-bold bg-slate-200">{row.total}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-100 font-bold">
                <tr className="border border-slate-300">
                  <td className="p-2 border border-slate-300 text-right">
                    الإجمالي العام ({getProcessedData(true).allData.length} سجل):
                  </td>
                  {[1, 2, 3, 4].map((w) => {
                    const allData = getProcessedData(true).allData;
                    return supportedCategories.map((cat) => {
                      const sum = allData.reduce((s, r) => s + (parseInt(r[`w${w}_${cat}`]) || 0), 0);
                      return (
                        <td key={`${w}_${cat}`} className="p-1 border border-slate-300 text-center">
                          {sum}
                        </td>
                      );
                    });
                  })}
                  <td className="p-1 border border-slate-300 text-center font-bold bg-slate-100">
                    {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_هيئة) || 0), 0)}
                  </td>
                  <td className="p-1 border border-slate-300 text-center font-bold bg-slate-100">
                    {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_طلاب) || 0), 0)}
                  </td>
                  <td className="p-1 border border-slate-300 text-center font-bold bg-slate-100">
                    {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_رضع) || 0), 0)}
                  </td>
                  <td className="p-1 border border-slate-300 text-center font-black bg-slate-200">
                    {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total) || 0), 0)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          )}

      {/* ── Print Footer — Unified Signatures (shows only at end in print) ── */}
      <div className="only-print print-footer-signatures print-footer-unified" style={{
        display: 'flex',
        justifyContent: 'space-between',
        textAlign: 'center',
        marginTop: '32px',
        paddingTop: '12px',
        borderTop: '2px solid #94a3b8',
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
            مُعد التقرير
          </p>
          <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>الاسم: {signatures.preparerName || '...........................'}</p>
          <p style={{ fontSize: '9px', color: '#94a3b8' }}>التوقيع: ..........................</p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
            مدير الصيدلية / الإدارة
          </p>
          <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>الاسم: {signatures.managerName || '...........................'}</p>
          <p style={{ fontSize: '9px', color: '#94a3b8' }}>التوقيع: ..........................</p>
        </div>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '10px', fontWeight: 700, textDecoration: 'underline', color: '#475569', marginBottom: '24px' }}>
            رقم الاعتماد
          </p>
          <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600 }}>
            {signatures.approvalNumber || '...........................'}
          </p>
          <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600, marginTop: '12px' }}>
            التاريخ: {new Date().toLocaleDateString('ar-EG')}
          </p>
        </div>
      </div>
      {/* Stamp line — full width below the 3 columns */}
      <div style={{ textAlign: 'center', marginTop: '16px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }} className="only-print">
        <p style={{ fontSize: '9px', color: '#94a3b8' }}>
          ختم الإدارة: ........................................................
        </p>
      </div>

        </div>
        )}
      </div>

      {/* Duplicate / overwrite confirmation (mirrors quick entry) */}
      <ConfirmModal
        isOpen={!!pendingConflict}
        onConfirm={confirmOverwrite}
        onCancel={() => setPendingConflict(null)}
        onSkip={skipConflicts}
        skipText="تجاوز وحفظ الباقي"
        title="تم إدخال الفترة من قبل"
        message={
          pendingConflict
            ? [
                pendingConflict.labels.length > 0
                  ? `الفترات التالية مدخلة من قبل بقيم مختلفة: ${pendingConflict.labels.join('، ')}.`
                  : '',
                pendingConflict.generalWarnings.length > 0
                  ? `تنبيه: ${pendingConflict.generalWarnings.join(' — ')}.`
                  : '',
              ]
                .filter(Boolean)
                .join(' ')
            : ''
        }
        detail="يمكنك الذهاب للتعديل إذا كنت تريد تغيير البيانات — هل تريد استبدال القيم الحالية؟"
        confirmText="استبدال البيانات"
        cancelText="إلغاء"
        variant="warning"
        loading={saving}
      />
    </div>
  );
};

export default MedicalTicketsPage;
