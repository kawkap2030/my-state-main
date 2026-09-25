import React, { useState, useEffect, useMemo } from 'react';
import { useGlobalApp } from '../../context/useGlobalApp';
import invoke from '../../api/tauriApi';
import { History, Search, Loader2, RefreshCw, X, Lock, Unlock, AlertCircle, Printer, Hash, DollarSign, Package, Users } from 'lucide-react';
import Card from '../ui/Card';
import Modal from '../ui/Modal';
import Pagination from '../ui/Pagination';
import ConfirmModal from '../ui/ConfirmModal';
import ActionButtons from './ActionButtons';
import StatsBar from './StatsBar';
import ExportMenu from '../ui/ExportMenu';
import { useToast } from '../ui/Toast';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import PrintableTable from './PrintableTable';
import { executePrint } from '../../utils/exportPrint';

// Arabic month names for display
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const formatMonthArabic = (monthStr) => {
  if (!monthStr) return '';
  const [year, month] = monthStr.split('-');
  if (!year || !month) return monthStr;
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return monthStr;
  return `${ARABIC_MONTHS[idx]} ${year}`;
};

const formatNumber = (num) => {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('en-US', { maximumFractionDigits: 4 });
};


const MonthlyHistoryTable = ({ mode, refreshTrigger, onEdit, onRefresh, hideDirectPrint = false }) => {
  const { activeHierarchy, checkIsMonthLocked } = useGlobalApp();
  const toast = useToast();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState({});
  const [areas, setAreas] = useState({});
  const [clinics, setClinics] = useState({});
  const [supplyCategories, setSupplyCategories] = useState([]); // New state for supplies mode filtering

  
  // Filter state
  const [filterMonth, setFilterMonth] = useState(activeHierarchy.dispenseMonth || '');
  const [filterBranch, setFilterBranch] = useState(activeHierarchy.branchId?.toString() || '');
  const [filterArea, setFilterArea] = useState(activeHierarchy.areaId?.toString() || '');
  const [filterClinic, setFilterClinic] = useState(activeHierarchy.clinicId?.toString() || '');
  
  // View/Delete Modal State
  const [viewRecord, setViewRecord] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Sync with Global Context (Smart Context)
  useEffect(() => {
    if (activeHierarchy.dispenseMonth) setFilterMonth(activeHierarchy.dispenseMonth);
    if (activeHierarchy.branchId) setFilterBranch(activeHierarchy.branchId.toString());
    if (activeHierarchy.areaId) setFilterArea(activeHierarchy.areaId.toString());
    else setFilterArea('');
    if (activeHierarchy.clinicId) setFilterClinic(activeHierarchy.clinicId.toString());
    else setFilterClinic('');
  }, [activeHierarchy]);

  // Pagination & Search State
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState(''); // Patient category filter (Authority, Students, etc.)
  const [filterLockStatus, setFilterLockStatus] = useState('all'); // all, locked, unlocked
  const [filterHighValue, setFilterHighValue] = useState(false);
  const [filterSubCategory, setFilterSubCategory] = useState(''); // New: Sub-filter for specific category in supplies mode
  
  // Resolve location name for a record
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getLocationName = (record) => {
    if (record.clinic_id) return clinics[record.clinic_id] || '—';
    if (record.area_id) return `المنطقة: ${areas[record.area_id] || '—'}`;
    return `الفرع: ${branches[record.branch_id] || '—'}`;
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getLocationSub = (record) => {
    const parts = [];
    if (record.area_id && areas[record.area_id]) parts.push(`منطقة ${areas[record.area_id]}`);
    if (record.branch_id && branches[record.branch_id]) parts.push(`فرع ${branches[record.branch_id]}`);
    return parts.join(' - ');
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, refreshTrigger]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Master Data Names for Mapping
      const [bList, aList, cList, scList] = await Promise.all([
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all'),
        invoke('get_supply_categories')
      ]);
      
      const bMap = bList.reduce((acc, b) => ({ ...acc, [b.id]: b.name }), {});
      const aMap = aList.reduce((acc, a) => ({ ...acc, [a.id]: a.name }), {});
      const cMap = cList.reduce((acc, c) => ({ ...acc, [c.id]: c.name }), {});
      
      setBranches(bMap);
      setAreas(aMap);
      setClinics(cMap);

      setSupplyCategories(scList);

      // 2. Fetch Records (Unlimited report commands; free/supported read their own split tables)
      if (mode === 'supplies') {
        const results = await invoke('get_report_monthly_supplies_dispensed', {
          branchId: null, areaId: null, clinicId: null, dispenseMonth: null
        });
        setRecords(results);
        return;
      }

      const [freeResults, supportedResults] = await Promise.all([
        invoke('get_report_free_monthly_drugs_dispensed', { branchId: null, areaId: null, clinicId: null, dispenseMonth: null }),
        invoke('get_report_supported_monthly_drugs_dispensed', { branchId: null, areaId: null, clinicId: null, dispenseMonth: null }),
      ]);

      // Type-aware display: a page only shows records that actually contain data
      // of its own type. A row created only with Free data must not appear in the
      // Supported history, and vice versa (no fake zero-value records).
      const freeFiltered = freeResults.filter((r) =>
        (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) +
        (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0) > 0
      );
      const supportedFiltered = supportedResults.filter((r) =>
        (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) +
        (r.drugs_supported_infants_value || 0) > 0
      );

      let typeFiltered;
      if (mode === 'free') {
        typeFiltered = freeFiltered;
      } else if (mode === 'supported') {
        typeFiltered = supportedFiltered;
      } else {
        // 'all': combine both split tables by logical key
        // (branch + area + clinic + month). A merged row keeps the id of each
        // side so deletion removes both tables.
        const keyOf = (r) => `${r.branch_id}|${r.area_id || 0}|${r.clinic_id || 0}|${r.dispense_month}`;
        const merged = new Map();
        for (const r of freeFiltered) {
          merged.set(keyOf(r), {
            id: `f${r.id}`,
            freeId: r.id,
            supId: null,
            branch_id: r.branch_id,
            area_id: r.area_id,
            clinic_id: r.clinic_id,
            dispense_month: r.dispense_month,
            notes: r.notes,
            drugs_free_authority: r.drugs_free_authority,
            drugs_free_students: r.drugs_free_students,
            drugs_free_infants: r.drugs_free_infants,
            drugs_free_breadwinner_women: r.drugs_free_breadwinner_women,
            drugs_supported_authority_value: 0,
            drugs_supported_authority_patient_share: 0,
            drugs_supported_students_value: 0,
            drugs_supported_students_patient_share: 0,
            drugs_supported_infants_value: 0,
            drugs_supported_infants_patient_share: 0,
          });
        }
        for (const r of supportedFiltered) {
          const k = keyOf(r);
          const existing = merged.get(k);
          if (existing) {
            existing.supId = r.id;
            existing.drugs_supported_authority_value = r.drugs_supported_authority_value;
            existing.drugs_supported_authority_patient_share = r.drugs_supported_authority_patient_share;
            existing.drugs_supported_students_value = r.drugs_supported_students_value;
            existing.drugs_supported_students_patient_share = r.drugs_supported_students_patient_share;
            existing.drugs_supported_infants_value = r.drugs_supported_infants_value;
            existing.drugs_supported_infants_patient_share = r.drugs_supported_infants_patient_share;
            existing.notes = existing.notes || r.notes;
          } else {
            merged.set(k, {
              id: `s${r.id}`,
              freeId: null,
              supId: r.id,
              branch_id: r.branch_id,
              area_id: r.area_id,
              clinic_id: r.clinic_id,
              dispense_month: r.dispense_month,
              notes: r.notes,
              drugs_free_authority: 0,
              drugs_free_students: 0,
              drugs_free_infants: 0,
              drugs_free_breadwinner_women: 0,
              drugs_supported_authority_value: r.drugs_supported_authority_value,
              drugs_supported_authority_patient_share: r.drugs_supported_authority_patient_share,
              drugs_supported_students_value: r.drugs_supported_students_value,
              drugs_supported_students_patient_share: r.drugs_supported_students_patient_share,
              drugs_supported_infants_value: r.drugs_supported_infants_value,
              drugs_supported_infants_patient_share: r.drugs_supported_infants_patient_share,
            });
          }
        }
        typeFiltered = [...merged.values()];
      }
      setRecords(typeFiltered);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = (record) => {
    setDeleteTarget(record);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      if (mode === 'supplies') {
        await invoke('delete_monthly_supplies_dispensed', { id: deleteTarget.id });
      } else if (mode === 'free') {
        await invoke('delete_free_monthly_drugs_dispensed', { id: deleteTarget.id });
      } else if (mode === 'supported') {
        await invoke('delete_supported_monthly_drugs_dispensed', { id: deleteTarget.id });
      } else {
        // 'all': combined rows are deleted from both split tables.
        if (deleteTarget.freeId) await invoke('delete_free_monthly_drugs_dispensed', { id: deleteTarget.freeId });
        if (deleteTarget.supId) await invoke('delete_supported_monthly_drugs_dispensed', { id: deleteTarget.supId });
      }
      toast.success('تم حذف السجل بنجاح');
      fetchData();
    } catch (error) {
      console.error("Failed to delete record:", error);
      toast.error('فشل في حذف السجل: ' + error);
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const clearFilters = () => {
    setFilterMonth(activeHierarchy.dispenseMonth || "");
    setFilterBranch(activeHierarchy.branchId?.toString() || "");
    setFilterArea(activeHierarchy.areaId?.toString() || "");
    setFilterClinic(activeHierarchy.clinicId?.toString() || "");
    setFilterCategory("");
    setSearchTerm("");
    setFilterLockStatus("all");
    setFilterHighValue(false);
    setFilterSubCategory("");
    setCurrentPage(1);
  };

  // ─── Stats Computation ───
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const computeStats = (data) => {
    if (mode === 'free') {
      return {
        count: data.length,
        authority: data.reduce((s, r) => s + (r.drugs_free_authority || 0), 0),
        students: data.reduce((s, r) => s + (r.drugs_free_students || 0), 0),
        infants: data.reduce((s, r) => s + (r.drugs_free_infants || 0), 0),
        breadwinner: data.reduce((s, r) => s + (r.drugs_free_breadwinner_women || 0), 0),
      };
    } else if (mode === 'supported') {
      return {
        count: data.length,
        value: data.reduce((s, r) => s + (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0), 0),
        share: data.reduce((s, r) => s + (r.drugs_supported_authority_patient_share || 0) + (r.drugs_supported_students_patient_share || 0) + (r.drugs_supported_infants_patient_share || 0), 0),
        authority: data.reduce((s, r) => s + (r.drugs_supported_authority_value || 0), 0),
        authority_share: data.reduce((s, r) => s + (r.drugs_supported_authority_patient_share || 0), 0),
        students: data.reduce((s, r) => s + (r.drugs_supported_students_value || 0), 0),
        students_share: data.reduce((s, r) => s + (r.drugs_supported_students_patient_share || 0), 0),
        infants: data.reduce((s, r) => s + (r.drugs_supported_infants_value || 0), 0),
        infants_share: data.reduce((s, r) => s + (r.drugs_supported_infants_patient_share || 0), 0),
      };
    } else if (mode === 'all') {
      return {
        count: data.length,
        freeTotal: data.reduce((s, r) => s + (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) + (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0), 0),
        supportedValue: data.reduce((s, r) => s + (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0), 0),
        patientShare: data.reduce((s, r) => s + (r.drugs_supported_authority_patient_share || 0) + (r.drugs_supported_students_patient_share || 0) + (r.drugs_supported_infants_patient_share || 0), 0),
      };
    } else {
      return {
        count: data.length,
        consumer: data.reduce((s, r) => s + (r.consumer_value || 0), 0),
        collective: data.reduce((s, r) => s + (r.collective_entities_value || 0), 0),
      };
    }
  };

   
  const allStats = useMemo(() => {
    const contextRecords = records.filter((record) => {
      if (filterMonth && record.dispense_month !== filterMonth) return false;
      if (filterBranch && record.branch_id?.toString() !== filterBranch) return false;
      
      if (filterArea && record.area_id && record.area_id.toString() !== filterArea) return false;
      if (filterClinic && record.clinic_id && record.clinic_id.toString() !== filterClinic) return false;
      
      return true;
    });
    return computeStats(contextRecords);
  }, [
    records,
    filterMonth,
    filterBranch,
    filterArea,
    filterClinic,
    computeStats,
  ]);

  const baselineAvgValue = useMemo(() => {
    const contextRecords = records.filter((record) => {
      if (filterMonth && record.dispense_month !== filterMonth) return false;
      if (filterBranch && record.branch_id?.toString() !== filterBranch) return false;
      
      if (filterArea && record.area_id && record.area_id.toString() !== filterArea) return false;
      if (filterClinic && record.clinic_id && record.clinic_id.toString() !== filterClinic) return false;
      
      return true;
    });

    if (contextRecords.length === 0) return 0;
    const stats = computeStats(contextRecords);
    const total =
      mode === "free"
        ? stats.authority + stats.students + stats.infants + stats.breadwinner
        : mode === "supported"
          ? stats.value
          : (stats.consumer || 0) + (stats.collective || 0);
    return total / contextRecords.length;
  }, [records, filterMonth, filterBranch, filterArea, filterClinic, mode, computeStats]);

  // Filtered records
   
  const filteredRecords = useMemo(() => {
    return records.filter(record => {
      if (filterMonth && record.dispense_month !== filterMonth) return false;

      // Improved Filtering: Show records for the selected level AND any higher-level records for the same context
      // (e.g., if a clinic is selected, show clinic records, area records, and branch records)
      if (filterBranch && record.branch_id?.toString() !== filterBranch) return false;
      
      if (filterArea) {
        // If an area is selected, show records for that area OR branch-level records (area_id is null)
        if (record.area_id && record.area_id.toString() !== filterArea) return false;
      }
      
      if (filterClinic) {
        // If a clinic is selected, show records for that clinic OR area/branch-level records (clinic_id is null)
        if (record.clinic_id && record.clinic_id.toString() !== filterClinic) return false;
      }
      
      // Lock Status Filter
      const isLocked = checkIsMonthLocked(record.dispense_month);
      if (filterLockStatus === 'locked' && !isLocked) return false;
      if (filterLockStatus === 'unlocked' && isLocked) return false;

      // High Value Filter
      if (filterHighValue) {
        const getVal = (r) => {
          if (mode === 'free') return (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) + (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0);
          if (mode === 'supported') return (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0);
          return (r.consumer_value || 0) + (r.collective_entities_value || 0);
        };
        if (getVal(record) <= baselineAvgValue * 1.5) return false;
      }

      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const locName = getLocationName(record).toLowerCase();
        const locSub = getLocationSub(record).toLowerCase();
        const itemName = (record.item_name || '').toLowerCase();
        if (!locName.includes(s) && !locSub.includes(s) && !itemName.includes(s)) return false;
      }

      // Supply Type Filter (Supply vs Category)
      if (mode === 'supplies' && filterCategory) {
        if (filterCategory === 'supply' && !record.supply_id) return false;
        if (filterCategory === 'category' && !record.category_id) return false;
        
        // Sub-filter for specific category
        if (filterCategory === 'category' && filterSubCategory && record.category_id?.toString() !== filterSubCategory) return false;
      }

      return true;
    });
  }, [records, filterMonth, filterBranch, filterArea, filterClinic, searchTerm, filterLockStatus, filterHighValue, baselineAvgValue, checkIsMonthLocked, getLocationName, getLocationSub, filterCategory, filterSubCategory, mode]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return filteredRecords.slice(startIndex, startIndex + rowsPerPage);
  }, [filteredRecords, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredRecords.length / rowsPerPage);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filterMonth, filterBranch, filterArea, filterClinic, searchTerm, filterLockStatus, filterHighValue]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filtStats = useMemo(() => computeStats(filteredRecords), [filteredRecords, mode]);

  const statsBarItems = useMemo(() => {
    if (mode === 'free') {
      const isCatFilter = !!filterCategory;
      const getFiltVal = (key) => (!isCatFilter || filterCategory === key) ? filtStats[key] : 0;
      
      return [
        { label: 'سجلات المفلتر', value: allStats.count, filteredValue: filtStats.count, icon: Package, color: 'var(--color-primary)' },
        { label: 'هيئة', value: allStats.authority, filteredValue: getFiltVal('authority'), icon: Users, color: 'var(--color-primary)', suffix: ' ج.م' },
        { label: 'طلاب', value: allStats.students, filteredValue: getFiltVal('students'), icon: Users, color: 'var(--color-info)', suffix: ' ج.م' },
        { label: 'رضع', value: allStats.infants, filteredValue: getFiltVal('infants'), icon: Users, color: 'var(--color-success)', suffix: ' ج.م' },
        { label: 'معيلة', value: allStats.breadwinner, filteredValue: getFiltVal('breadwinner'), icon: Users, color: 'var(--color-warning)', suffix: ' ج.م' },
      ];
    } else if (mode === 'supported') {
      const allAuth = allStats.value - allStats.share;
      const filtAuth = filtStats.value - filtStats.share;
      const isCatFilter = !!filterCategory;

      return [
        { label: 'سجلات المفلتر', value: allStats.count, filteredValue: filtStats.count, icon: Package, color: 'var(--color-success)' },
        { label: 'قيمة الدواء', value: allStats.value, filteredValue: isCatFilter ? filtStats.value : filtStats.value, icon: DollarSign, color: 'var(--color-success)', suffix: ' ج.م' },
        { label: 'حصة المريض', value: allStats.share, filteredValue: isCatFilter ? filtStats.share : filtStats.share, icon: Users, color: 'var(--color-warning)', suffix: ' ج.م' },
        { label: 'تتحمله الهيئة', value: allAuth, filteredValue: filtAuth, icon: Hash, color: 'var(--color-primary)', suffix: ' ج.م' },
      ];
    } else {
      return [
        { label: 'عدد السجلات', value: allStats.count, filteredValue: filtStats.count, icon: Package, color: 'var(--color-info)' },
        { label: 'قيمة المستلزم', value: allStats.consumer, filteredValue: filtStats.consumer, icon: DollarSign, color: 'var(--color-info)', suffix: ' ج.م' },
        { label: 'قيمة التصنيف', value: allStats.collective, filteredValue: filtStats.collective, icon: DollarSign, color: 'var(--color-info)', suffix: ' ج.م' },
        { label: 'الإجمالي', value: (allStats.consumer || 0) + (allStats.collective || 0), filteredValue: (filtStats.consumer || 0) + (filtStats.collective || 0), icon: Hash, color: 'var(--color-primary)', suffix: ' ج.م' },
      ];
    }
  }, [allStats, filtStats, mode, filterCategory]);

  // ─── Highlight Logic ───
  const avgValue = useMemo(() => {
    if (filteredRecords.length === 0) return 0;
    const getVal = (r) => {
      if (mode === 'free') return (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) + (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0);
      if (mode === 'supported') return (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0);
      return (r.consumer_value || 0) + (r.collective_entities_value || 0);
    };
    return filteredRecords.reduce((s, r) => s + getVal(r), 0) / filteredRecords.length;
  }, [filteredRecords, mode]);

  // ─── Export Columns ───
  const exportColumns = useMemo(() => {
    if (mode === 'supported') {
      return [
        { header: "الشهر", accessor: (r) => formatMonthArabic(r.dispense_month) },
        { header: "الموقع", accessor: (r) => getLocationName(r) },
        { header: "التفصيل", accessor: (r) => getLocationSub(r) },
        { header: "هيئة (قيمة)", accessor: (r) => formatNumber(r.drugs_supported_authority_value) },
        { header: "هيئة (مساهمة مريض)", accessor: (r) => formatNumber(r.drugs_supported_authority_patient_share) },
        { header: "طلاب (قيمة)", accessor: (r) => formatNumber(r.drugs_supported_students_value) },
        { header: "طلاب (مساهمة مريض)", accessor: (r) => formatNumber(r.drugs_supported_students_patient_share) },
        { header: "رضيع (قيمة)", accessor: (r) => formatNumber(r.drugs_supported_infants_value) },
        { header: "رضيع (مساهمة مريض)", accessor: (r) => formatNumber(r.drugs_supported_infants_patient_share) },
        { header: "ملاحظات", accessor: (r) => r.notes || "" },
      ];
    } else if (mode === 'free') {
      return [
        { header: "الشهر", accessor: (r) => formatMonthArabic(r.dispense_month) },
        { header: "الموقع", accessor: (r) => getLocationName(r) },
        { header: "التفصيل", accessor: (r) => getLocationSub(r) },
        { header: "هيئة", accessor: (r) => formatNumber(r.drugs_free_authority) },
        { header: "طلاب", accessor: (r) => formatNumber(r.drugs_free_students) },
        { header: "رضيع", accessor: (r) => formatNumber(r.drugs_free_infants) },
        { header: "نساء معيلات", accessor: (r) => formatNumber(r.drugs_free_breadwinner_women) },
        { header: "ملاحظات", accessor: (r) => r.notes || "" },
      ];
    } else {
      // supplies
      return [
        { header: "الشهر", accessor: (r) => formatMonthArabic(r.dispense_month) },
        { header: "الموقع", accessor: (r) => getLocationName(r) },
        { header: "التصنيف", accessor: (r) => r.supply_sub_category_name || r.supply_category_name || "" },
        { header: "المستهلك", accessor: (r) => formatNumber(r.consumer_value) },
        { header: "الجهات الجماعية", accessor: (r) => formatNumber(r.collective_entities_value) },
        { header: "ملاحظات", accessor: (r) => r.notes || "" },
      ];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, branches, areas, clinics]);

  const getHighlightClass = (record) => {
    if (avgValue === 0) return '';
    const getVal = (r) => {
      if (mode === 'free') return (r.drugs_free_authority || 0) + (r.drugs_free_students || 0) + (r.drugs_free_infants || 0) + (r.drugs_free_breadwinner_women || 0);
      if (mode === 'supported') return (r.drugs_supported_authority_value || 0) + (r.drugs_supported_students_value || 0) + (r.drugs_supported_infants_value || 0);
      return (r.consumer_value || 0) + (r.collective_entities_value || 0);
    };
    const val = getVal(record);
    if (val > avgValue * 2) return 'bg-red-50/60 dark:bg-red-900/15';
    if (val > avgValue * 1.5) return 'bg-amber-50/60 dark:bg-amber-900/15';
    return '';
  };

  // ─── Keyboard Shortcuts ───
  useKeyboardShortcuts(
    hideDirectPrint ? [] : [
      { key: 'p', ctrl: true, handler: () => executePrint({ orientation: 'landscape', fontSize: 'md', margins: 'standard', showPageNumbers: true, showSignatures: true }), description: 'طباعة' },
    ]
  );

  if (loading) return (
    <div className="flex items-center justify-center p-20">
      <Loader2 className="animate-spin text-[var(--color-text-muted)]" size={40} />
    </div>
  );

  // ─── Render for Free Drugs Mode ───
  const renderFreeRows = () => {
    return paginatedRecords.map((record) => {
      let freeCategories = [];
      if (record.drugs_free_authority > 0) freeCategories.push({ id: 'authority', label: 'هيئة', value: record.drugs_free_authority, color: 'var(--color-primary)', bgColor: 'var(--color-primary-bg)' });
      if (record.drugs_free_students > 0) freeCategories.push({ id: 'students', label: 'طلاب', value: record.drugs_free_students, color: 'var(--color-info)', bgColor: 'var(--color-info-bg)' });
      if (record.drugs_free_infants > 0) freeCategories.push({ id: 'infants', label: 'رضع', value: record.drugs_free_infants, color: 'var(--color-success)', bgColor: 'var(--color-success-bg)' });
      if (record.drugs_free_breadwinner_women > 0) freeCategories.push({ id: 'breadwinner', label: 'معيلة', value: record.drugs_free_breadwinner_women, color: 'var(--color-warning)', bgColor: 'var(--color-warning-bg)' });

      // Apply category filter
      if (filterCategory) {
        freeCategories = freeCategories.filter(c => c.id === filterCategory);
      }

      if (freeCategories.length === 0 && !filterCategory) {
        freeCategories.push({ id: 'authority', label: 'هيئة', value: record.drugs_free_authority, color: 'var(--color-primary)', bgColor: 'var(--color-primary-bg)' });
      }

      const hlClass = getHighlightClass(record);
      const isLocked = checkIsMonthLocked(record.dispense_month);
      return freeCategories.map((cat, catIndex) => (
        <tr key={`${record.id}-${catIndex}`} className={`hover:bg-[var(--color-bg)]/50 transition-colors border-b border-[var(--color-border)] ${hlClass}`}>
          {catIndex === 0 && (
            <td className="p-4 border-r-4 border-r-[var(--color-primary)]" rowSpan={freeCategories.length}>
              <div className="font-bold text-sm text-[var(--color-text)]">{getLocationName(record)}</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">{getLocationSub(record)}</div>
            </td>
          )}
          {catIndex === 0 && (
            <td className="p-4 text-center" rowSpan={freeCategories.length}>
              <span className="text-xs font-black text-[var(--color-text)]">{record.dispense_month}</span>
            </td>
          )}
          <td className="p-4 text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black" style={{ backgroundColor: cat.bgColor, color: cat.color }}>
              {cat.label}
            </span>
          </td>
          <td className="p-4 text-center font-black text-[var(--color-text)]">{formatNumber(cat.value)}</td>
          {catIndex === 0 && (
            <td className="p-4 no-print" rowSpan={freeCategories.length}>
              <ActionButtons
                onView={() => setViewRecord(record)}
                onEdit={onEdit ? () => onEdit(record) : undefined}
                onDelete={() => requestDelete(record)}
                isLocked={isLocked}
              />
            </td>
          )}
        </tr>
      ));
    });
  };

  // ─── Render for Supported Drugs Mode ───
  const renderSupportedRows = () => {
    return paginatedRecords.map((record) => {
      let supportedCategories = [];
      if (record.drugs_supported_authority_value > 0) supportedCategories.push({ id: 'authority', label: 'هيئة', value: record.drugs_supported_authority_value, share: record.drugs_supported_authority_patient_share || 0, color: 'var(--color-primary)', bgColor: 'var(--color-primary-bg)' });
      if (record.drugs_supported_students_value > 0) supportedCategories.push({ id: 'students', label: 'طلاب', value: record.drugs_supported_students_value, share: record.drugs_supported_students_patient_share || 0, color: 'var(--color-info)', bgColor: 'var(--color-info-bg)' });
      if (record.drugs_supported_infants_value > 0) supportedCategories.push({ id: 'infants', label: 'رضع', value: record.drugs_supported_infants_value, share: record.drugs_supported_infants_patient_share || 0, color: 'var(--color-success)', bgColor: 'var(--color-success-bg)' });

      // Apply category filter
      if (filterCategory) {
        supportedCategories = supportedCategories.filter(c => c.id === filterCategory);
      }

      if (supportedCategories.length === 0 && !filterCategory) {
        supportedCategories.push({ id: 'authority', label: 'هيئة', value: 0, share: 0, color: 'var(--color-primary)', bgColor: 'var(--color-primary-bg)' });
      }

      const hlClass = getHighlightClass(record);
      const isLocked = checkIsMonthLocked(record.dispense_month);
      return supportedCategories.map((cat, catIndex) => (
        <tr key={`${record.id}-${catIndex}`} className={`hover:bg-[var(--color-bg)]/50 transition-colors border-b border-[var(--color-border)] ${hlClass}`}>
          {catIndex === 0 && (
            <td className="p-4 border-r-4 border-r-[var(--color-success)]" rowSpan={supportedCategories.length}>
              <div className="font-bold text-sm text-[var(--color-text)]">{getLocationName(record)}</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">{getLocationSub(record)}</div>
            </td>
          )}
          {catIndex === 0 && (
            <td className="p-4 text-center" rowSpan={supportedCategories.length}>
              <span className="text-xs font-black text-[var(--color-text)]">{record.dispense_month}</span>
            </td>
          )}
          <td className="p-4 text-center">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black" style={{ backgroundColor: cat.bgColor, color: cat.color }}>
              {cat.label}
            </span>
          </td>
          <td className="p-4 text-center font-bold" style={{ color: cat.color }}>{formatNumber(cat.value)}</td>
          <td className="p-4 text-center font-bold text-amber-500">{formatNumber(cat.share)}</td>
          <td className="p-4 text-center font-bold text-[var(--color-success)]">{formatNumber(cat.value - cat.share)}</td>
          {catIndex === 0 && (
            <td className="p-4 no-print" rowSpan={supportedCategories.length}>
              <ActionButtons
                onView={() => setViewRecord(record)}
                onEdit={onEdit ? () => onEdit(record) : undefined}
                onDelete={() => requestDelete(record)}
                isLocked={isLocked}
              />
            </td>
          )}
        </tr>
      ));
    });
  };

  // ─── Render for Supplies Mode ───
  const renderSuppliesRows = () => {
    return paginatedRecords.map((record) => {
      const hlClass = getHighlightClass(record);
      const isLocked = checkIsMonthLocked(record.dispense_month);
      return (
      <tr key={record.id} className={`hover:bg-[var(--color-bg)]/50 transition-colors border-b border-[var(--color-border)] ${hlClass}`}>
        <td className="p-4">
          <div className="flex flex-col text-right">
            <span className="text-sm font-black text-[var(--color-info)]">{record.item_name}</span>
            <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
              {record.clinic_id ? clinics[record.clinic_id] : (record.area_id ? areas[record.area_id] : branches[record.branch_id])}
            </span>
          </div>
        </td>
        <td className="p-4 text-center">
          <span className="text-xs font-black text-[var(--color-text)]">{record.dispense_month}</span>
        </td>
        <td className="p-4 text-center font-black text-[var(--color-info)]">{formatNumber(record.consumer_value)}</td>
        <td className="p-4 text-center font-black text-[var(--color-info)]">{formatNumber(record.collective_entities_value)}</td>
        <td className="p-4 text-center font-black text-[var(--color-text)]">{formatNumber(record.consumer_value + record.collective_entities_value)}</td>
        <td className="p-4 no-print">
          <ActionButtons
            onView={() => setViewRecord(record)}
            onEdit={onEdit ? () => onEdit(record) : undefined}
            onDelete={() => requestDelete(record)}
            isLocked={isLocked}
          />
        </td>
      </tr>
      );
    });
  };

  return (
    <>
      <Card className="overflow-hidden border-none shadow-xl shadow-black/5 dark:shadow-black/20" dir="rtl">
        {/* Header */}
      <div className={`no-print p-5 border-b border-[var(--color-border)] ${mode === 'supplies' ? 'bg-[var(--color-info-bg)]' : mode === 'supported' ? 'bg-[var(--color-success-bg)]' : 'bg-[var(--color-accent-cyan-bg)]'}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)] shadow-sm border border-[var(--color-border)]">
              <History size={20} />
            </div>
            <h3 className="text-lg font-black text-[var(--color-text)]">السجلات الحديثة</h3>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">بحث</span>
              <div className="relative">
                <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="ابحث هنا..."
                  className="p-2 pr-9 rounded-xl border border-[var(--color-border)] text-sm outline-none focus:ring-2 focus:ring-[var(--color-primary)]/20 transition-all bg-[var(--color-bg-card)] text-[var(--color-text)] font-bold w-40"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {mode === 'supplies' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">النوع</span>
                <select
                  className="p-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                  value={filterCategory}
                  onChange={(e) => {
                    setFilterCategory(e.target.value);
                    setFilterSubCategory('');
                  }}
                >
                  <option value="">-- الكل --</option>
                  <option value="supply">مستلزم محدد</option>
                  <option value="category">تصنيف عام</option>
                </select>
              </div>
            )}

            {mode === 'supplies' && filterCategory === 'category' && (
              <div className="flex items-center gap-2 animate-in slide-in-from-right-2 duration-300">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">التصنيف</span>
                <select
                  className="p-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                  value={filterSubCategory}
                  onChange={(e) => setFilterSubCategory(e.target.value)}
                >
                  <option value="">-- كل التصنيفات --</option>
                  {supplyCategories.map(cat => (
                    <option key={cat.id} value={cat.id.toString()}>{cat.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(mode === 'free' || mode === 'supported') && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[var(--color-text-muted)]">الفئة</span>
                <select
                  className="p-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] outline-none"
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                >
                  <option value="">-- جميع الفئات --</option>
                  <option value="authority">هيئة</option>
                  <option value="students">طلاب</option>
                  <option value="infants">رضع</option>
                  {mode === 'free' && <option value="breadwinner">معيلة</option>}
                </select>
              </div>
            )}

            {/* Modern Smart Filters */}
            <div className="flex items-center gap-2 px-3 border-r border-l border-[var(--color-border)] mx-2">
              <button
                onClick={() => setFilterLockStatus(prev => prev === 'all' ? 'unlocked' : prev === 'unlocked' ? 'locked' : 'all')}
                className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterLockStatus === 'locked' ? 'bg-amber-500 text-white border-transparent' :
                  filterLockStatus === 'unlocked' ? 'bg-emerald-500 text-white border-transparent' :
                  'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                }`}
                title={filterLockStatus === 'locked' ? 'عرض السجلات المقفلة فقط' : filterLockStatus === 'unlocked' ? 'عرض السجلات المفتوحة فقط' : 'كل الحالات'}
              >
                {filterLockStatus === 'locked' ? <Lock size={14} /> : <Unlock size={14} />}
                <span className="hidden lg:inline">
                  {filterLockStatus === 'all' ? 'حالة القفل' : filterLockStatus === 'locked' ? 'مقفل' : 'مفتوح'}
                </span>
              </button>

              <button
                onClick={() => setFilterHighValue(!filterHighValue)}
                className={`p-2 rounded-xl border transition-all flex items-center gap-2 text-xs font-bold ${
                  filterHighValue ? 'bg-red-500 text-white border-transparent shadow-lg shadow-red-500/20' :
                  'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                }`}
                title="عرض السجلات ذات القيمة المرتفعة (تنبيه مالي)"
              >
                <AlertCircle size={14} />
                <span className="hidden lg:inline">تنبيه مالي</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={clearFilters} className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-red-500 hover:text-white transition-all flex items-center gap-1">
                <X size={14} /> إزالة الفلتر
              </button>
              <button 
                onClick={() => {
                  fetchData();
                  if (onRefresh) onRefresh();
                }} 
                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-info)] hover:text-white transition-all flex items-center gap-1"
              >
                <RefreshCw size={14} /> تحديث
              </button>
              {!hideDirectPrint && (
              <button 
                onClick={() => executePrint({ orientation: 'landscape', fontSize: 'md', margins: 'standard', showPageNumbers: true, showSignatures: true })} 
                className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-sm font-bold bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-[var(--color-primary)] hover:text-white transition-all flex items-center gap-1"
                title="Ctrl+P"
              >
                <Printer size={14} /> طباعة
              </button>
              )}
              <ExportMenu 
                data={filteredRecords} 
                columns={exportColumns} 
                options={{ 
                  title: mode === 'supported' ? 'سجلات صرف الأدوية المدعمة' : mode === 'free' ? 'سجلات صرف الأدوية المجانية' : 'سجلات صرف المستلزمات',
                  fileName: `${mode}_monthly_history`,
                  hierarchyLabel: `شهر: ${filterMonth}`
                }} 
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-5 py-3 no-print">
        <StatsBar stats={statsBarItems} accentColor={mode === 'supported' ? 'var(--color-success)' : mode === 'supplies' ? 'var(--color-info)' : 'var(--color-accent-cyan)'} />
      </div>

      {/* Table */}
      <PrintableTable title={mode === 'free' ? 'تقرير منصرف الدواء المجاني' : mode === 'supported' ? 'تقرير منصرف الدواء المدعم' : 'تقرير منصرف المستلزمات'}>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse print-actions-hide">
          <thead>
            <tr className="text-white text-xs font-black uppercase tracking-wide" style={{ backgroundColor: mode === 'supported' ? 'var(--color-success)' : mode === 'supplies' ? 'var(--color-info)' : 'var(--color-accent-cyan)' }}>
              <th className="p-4 text-right">
                {mode === 'supplies' ? 'المستلزم / الموقع' : 'العيادة'}
              </th>
              <th className="p-4 text-center">الشهر</th>
              {mode === 'free' ? (
                <>
                  <th className="p-4 text-center">الفئة</th>
                  <th className="p-4 text-center">القيمة</th>
                </>
              ) : mode === 'supported' ? (
                <>
                  <th className="p-4 text-center">الفئة</th>
                  <th className="p-4 text-center">قيمة الدواء</th>
                  <th className="p-4 text-center">ما يتحمله المريض</th>
                  <th className="p-4 text-center">ما تتحمله الهيئة</th>
                </>
              ) : (
                <>
                  <th className="p-4 text-center">قيمة المستلزم</th>
                  <th className="p-4 text-center">قيمة التصنيف</th>
                  <th className="p-4 text-center">الإجمالي</th>
                </>
              )}
              <th className="p-4 text-center no-print">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="10" className="p-16 text-center text-[var(--color-text-muted)] font-bold">
                  <div className="flex flex-col items-center gap-3 opacity-50">
                    <History size={48} />
                    <p>لا توجد سجلات مدخلة بعد</p>
                  </div>
                </td>
              </tr>
            ) : (
              mode === 'free' ? renderFreeRows() :
              mode === 'supported' ? renderSupportedRows() :
              renderSuppliesRows()
            )}
          </tbody>
          {filteredRecords.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)]" style={{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-card))' }}>
                <td className="p-4 font-black text-sm text-[var(--color-text)]">
                  إجمالي المفلتر ({filteredRecords.length} سجل{records.length !== filteredRecords.length ? ` من ${records.length}` : ''})
                </td>
                <td className="p-4"></td>
                {mode === 'free' ? (
                  <>
                    <td className="p-4"></td>
                    <td className="p-4 text-center font-black text-[var(--color-primary)]">
                      {formatNumber(
                        (!filterCategory || filterCategory === 'authority' ? filtStats.authority : 0) +
                        (!filterCategory || filterCategory === 'students' ? filtStats.students : 0) +
                        (!filterCategory || filterCategory === 'infants' ? filtStats.infants : 0) +
                        (!filterCategory || filterCategory === 'breadwinner' ? filtStats.breadwinner : 0)
                      )}
                    </td>
                  </>
                ) : mode === 'supported' ? (
                  <>
                    <td className="p-4"></td>
                    <td className="p-4 text-center font-black text-[var(--color-success)]">
                      {formatNumber(
                        (filterCategory === 'authority' ? filtStats.authority : 
                         filterCategory === 'students' ? filtStats.students : 
                         filterCategory === 'infants' ? filtStats.infants : 
                         filtStats.value)
                      )}
                    </td>
                    <td className="p-4 text-center font-black text-amber-500">
                      {formatNumber(
                        (filterCategory === 'authority' ? filtStats.authority_share : 
                         filterCategory === 'students' ? filtStats.students_share : 
                         filterCategory === 'infants' ? filtStats.infants_share : 
                         filtStats.share)
                      )}
                    </td>
                    <td className="p-4 text-center font-black text-[var(--color-primary)]">
                      {formatNumber(
                        (filterCategory === 'authority' ? filtStats.authority - filtStats.authority_share : 
                         filterCategory === 'students' ? filtStats.students - filtStats.students_share : 
                         filterCategory === 'infants' ? filtStats.infants - filtStats.infants_share : 
                         filtStats.value - filtStats.share)
                      )}
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-4 text-center font-black text-[var(--color-info)]">{formatNumber(filtStats.consumer)}</td>
                    <td className="p-4 text-center font-black text-[var(--color-info)]">{formatNumber(filtStats.collective)}</td>
                    <td className="p-4 text-center font-black text-[var(--color-primary)]">{formatNumber((filtStats.consumer || 0) + (filtStats.collective || 0))}</td>
                  </>
                )}
                <td className="p-4 no-print"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      </PrintableTable>

      <div className="no-print">
        <Pagination 
          currentPage={currentPage}
        totalPages={totalPages}
        totalRecords={filteredRecords.length}
        rowsPerPage={rowsPerPage}
        onPageChange={setCurrentPage}
        onRowsPerPageChange={setRowsPerPage}
      />
      </div>
    </Card>

    <ConfirmModal
      isOpen={!!deleteTarget}
      onClose={() => setDeleteTarget(null)}
      onConfirm={confirmDelete}
      title="تأكيد الحذف"
      message={`هل أنت متأكد من حذف سجل الصرف لشهر ${deleteTarget?.dispense_month}؟`}
      loading={deleteLoading}
    />

    <Modal
        isOpen={!!viewRecord}
        onClose={() => setViewRecord(null)}
        title={`تفاصيل السجل المنصرف - ${viewRecord ? viewRecord.dispense_month : ''}`}
        wide={true}
      >
        {viewRecord && (
          <div className="space-y-6" dir="rtl">
            <div className="p-4 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)] shadow-sm">
              <h4 className="text-sm font-black text-[var(--color-text-muted)] mb-3 pb-2 border-b border-[var(--color-border)]">معلومات الجهة</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الجهة المعنية</span>
                  <span className="text-sm font-black text-[var(--color-text)]">{getLocationName(viewRecord)}</span>
                  {getLocationSub(viewRecord) && (
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mt-1">{getLocationSub(viewRecord)}</span>
                  )}
                </div>
                <div>
                  <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الشهر</span>
                  <span className="text-sm font-black text-[var(--color-text)]">{viewRecord.dispense_month}</span>
                </div>
              </div>
            </div>

            {(mode === 'free' || mode === 'all') && (
              <div className="p-4 bg-[var(--color-accent-cyan-bg)] rounded-xl border border-[var(--color-accent-cyan)]/20 shadow-sm">
                <h4 className="text-sm font-black text-[var(--color-accent-cyan)] mb-3 pb-2 border-b border-[var(--color-accent-cyan)]/20">الأدوية المجانية (ج.م)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">هيئة</span>
                    <span className="text-sm font-black text-[var(--color-text)]">{formatNumber(viewRecord.drugs_free_authority)}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">طلاب</span>
                    <span className="text-sm font-black text-[var(--color-text)]">{formatNumber(viewRecord.drugs_free_students)}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">رضع</span>
                    <span className="text-sm font-black text-[var(--color-text)]">{formatNumber(viewRecord.drugs_free_infants)}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">معيلة</span>
                    <span className="text-sm font-black text-[var(--color-text)]">{formatNumber(viewRecord.drugs_free_breadwinner_women)}</span>
                  </div>
                </div>
              </div>
            )}

            {(mode === 'supported' || mode === 'all') && (
              <div className="p-4 bg-[var(--color-success-bg)] rounded-xl border border-[var(--color-success)]/20 shadow-sm">
                <h4 className="text-sm font-black text-[var(--color-success)] mb-3 pb-2 border-b border-[var(--color-success)]/20">الأدوية المدعمة (ج.م)</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 text-center">
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-[var(--color-text-muted)]">هيئة</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold">قيمة: <span className="font-black text-[var(--color-success)]">{formatNumber(viewRecord.drugs_supported_authority_value)}</span></span>
                      <span className="text-xs font-bold">حصة مريض: <span className="font-black text-[var(--color-warning)]">{formatNumber(viewRecord.drugs_supported_authority_patient_share)}</span></span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-[var(--color-text-muted)]">طلاب</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold">قيمة: <span className="font-black text-[var(--color-success)]">{formatNumber(viewRecord.drugs_supported_students_value)}</span></span>
                      <span className="text-xs font-bold">حصة مريض: <span className="font-black text-[var(--color-warning)]">{formatNumber(viewRecord.drugs_supported_students_patient_share)}</span></span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="block text-xs font-bold text-[var(--color-text-muted)]">رضع</span>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold">قيمة: <span className="font-black text-[var(--color-success)]">{formatNumber(viewRecord.drugs_supported_infants_value)}</span></span>
                      <span className="text-xs font-bold">حصة مريض: <span className="font-black text-[var(--color-warning)]">{formatNumber(viewRecord.drugs_supported_infants_patient_share)}</span></span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {(mode === 'supplies' || mode === 'all') && (
              <div className="p-4 bg-[var(--color-info-bg)] rounded-xl border border-[var(--color-info)]/20 shadow-sm">
                <h4 className="text-sm font-black text-[var(--color-info)] mb-3 pb-2 border-b border-[var(--color-info)]/20">المستلزمات الطبية (ج.م)</h4>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">قيمة المستلزم</span>
                    <span className="text-xl font-black text-[var(--color-info)]">{formatNumber(viewRecord.consumer_value)}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">قيمة التصنيف</span>
                    <span className="text-xl font-black text-[var(--color-info)]">{formatNumber(viewRecord.collective_entities_value)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--color-info)]/20 text-center">
                  <span className="block text-xs font-bold text-[var(--color-text-muted)] mb-1">الإجمالي</span>
                  <span className="text-xl font-black text-[var(--color-primary)]">{formatNumber((viewRecord.consumer_value || 0) + (viewRecord.collective_entities_value || 0))}</span>
                </div>
              </div>
            )}

            {viewRecord.notes && (
              <div className="p-4 bg-[var(--color-warning-bg)] rounded-xl border border-[var(--color-warning)]/20 shadow-sm">
                <h4 className="text-sm font-black text-[var(--color-warning)] mb-2">ملاحظات</h4>
                <p className="text-sm font-bold text-[var(--color-text)] whitespace-pre-wrap">{viewRecord.notes}</p>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <button onClick={() => setViewRecord(null)} className="px-6 py-2 rounded-xl bg-[var(--color-bg-card)] border border-[var(--color-border)] text-sm font-bold text-[var(--color-text)] hover:bg-[var(--color-bg)] transition-colors">
                إغلاق
              </button>
            </div>
          </div>
        )}
      </Modal>

    <ConfirmModal
      isOpen={!!deleteTarget}
      onConfirm={confirmDelete}
      onCancel={() => setDeleteTarget(null)}
      title="تأكيد الحذف"
      message="هل أنت متأكد من حذف هذا السجل؟ لا يمكن التراجع عن هذا الإجراء."
      detail={deleteTarget ? `${mode === 'supplies' ? (deleteTarget.item_name || '') : getLocationName(deleteTarget)} — ${deleteTarget.dispense_month}` : ''}
      loading={deleteLoading}
    />
    </>
  );
};

export default MonthlyHistoryTable;
