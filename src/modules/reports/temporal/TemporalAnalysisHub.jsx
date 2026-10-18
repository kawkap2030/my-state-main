import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import PrintableTable from '../../../components/common/PrintableTable';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import Modal from '../../../components/ui/Modal';
import MonthInput from '../../../components/ui/MonthInput';
import AutoComplete from '../../../components/ui/AutoComplete';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import { useGlobalApp } from '../../../context/useGlobalApp';
import html2canvas from 'html2canvas';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import { 
  BarChart3, Calendar, Search, 
  TrendingUp, Pill, Syringe, 
  Layers, LayoutGrid, Clock,
  Filter, Download, ArrowUpRight, ArrowDownRight,
  Grid3X3, Eye, Sparkles, Activity, X, Package
} from 'lucide-react';
import { aggregateRecordsByPrice, buildHierarchyLabel } from '../../../utils/reportUtils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
  PieChart, Pie, Legend, LineChart, Line, ReferenceLine
} from 'recharts';

const COLORS = [
  'var(--color-dash-1)', 
  'var(--color-dash-5)', 
  'var(--color-dash-3)', 
  'var(--color-dash-4)', 
  'var(--color-dash-6)', 
  'var(--color-dash-7)', 
  'var(--color-dash-2)'
];

const REPORT_TYPES = [
  { id: 'drugs', label: 'الأدوية التفصيلية', icon: Pill, color: 'var(--color-dash-3)' },
  { id: 'insulin', label: 'صرف الإنسولين', icon: Syringe, color: 'var(--color-dash-2)' },
  { id: 'groups', label: 'المجموعات الدوائية', icon: LayoutGrid, color: 'var(--color-dash-5)' },
  { id: 'supplies', label: 'المستلزمات الطبية', icon: Layers, color: 'var(--color-dash-4)' },
  { id: 'free_drugs', label: 'الأدوية المجانية', icon: Heart, color: 'var(--color-dash-6)' },
  { id: 'supported_drugs', label: 'الأدوية المدعمة', icon: DollarSign, color: 'var(--color-dash-2)' },
  { id: 'cost', label: 'تحليل التكلفة', icon: TrendingUp, color: 'var(--color-dash-1)' },
  { id: 'comparison', label: 'المقارنة الزمانية', icon: Clock, color: 'var(--color-dash-7)' },
  { id: 'reorder', label: 'مستشار الطلب', icon: Package, color: 'var(--color-dash-4)' },
];

import { Heart, DollarSign } from 'lucide-react';

// ── Utility Functions ──
const calculatePreviousPeriod = (startMonth, endMonth) => {
  const start = new Date(startMonth + '-01');
  const end = new Date(endMonth + '-01');
  const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  const prevEnd = new Date(start);
  prevEnd.setMonth(prevEnd.getMonth() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setMonth(prevStart.getMonth() - monthsDiff + 1);
  return { start: prevStart.toISOString().substring(0, 7), end: prevEnd.toISOString().substring(0, 7) };
};

const simpleLinearRegression = (points) => {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  points.forEach((y, i) => { sumX += i; sumY += y; sumXY += i * y; sumX2 += i * i; });
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { predicted: Math.max(0, slope * n + intercept), slope, intercept };
};

const getHeatColor = (value, maxVal) => {
  if (!value || !maxVal) return 'rgba(100,116,139,0.06)';
  const intensity = Math.min(value / maxVal, 1);
  if (intensity < 0.25) return `rgba(6,182,212,${0.08 + intensity * 0.3})`;
  if (intensity < 0.5) return `rgba(6,182,212,${0.2 + intensity * 0.4})`;
  if (intensity < 0.75) return `rgba(14,116,144,${0.3 + intensity * 0.4})`;
  return `rgba(8,145,178,${0.5 + intensity * 0.5})`;
};

// Synced Top Scrollbar Container Component
const SyncedTableContainer = ({ children }) => {
  const topScrollRef = useRef(null);
  const bottomScrollRef = useRef(null);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    const checkWidth = () => {
      if (bottomScrollRef.current) {
        setScrollWidth(bottomScrollRef.current.scrollWidth);
      }
    };
    checkWidth();
    const obs = new ResizeObserver(checkWidth);
    if (bottomScrollRef.current) obs.observe(bottomScrollRef.current);
    return () => obs.disconnect();
  }, []);

  const handleTopScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      bottomScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  };

  const handleBottomScroll = () => {
    if (topScrollRef.current && bottomScrollRef.current) {
      topScrollRef.current.scrollLeft = bottomScrollRef.current.scrollLeft;
    }
  };

  return (
    <div className="w-full relative">
      {scrollWidth > 0 && (
        <div
          ref={topScrollRef}
          onScroll={handleTopScroll}
          className="overflow-x-auto no-print h-3.5 mb-1 bg-cyan-500/15 dark:bg-slate-800 rounded-lg cursor-pointer"
          dir="rtl"
        >
          <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
        </div>
      )}
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto"
        dir="rtl"
      >
        {children}
      </div>
    </div>
  );
};

const TemporalAnalysisHub = () => {
  const toast = useToast();
  const { workspaceMode: globalWorkspaceMode, hierarchyNames: globalHierarchyNames } = useGlobalApp();
  const [loading, setLoading] = useState(false);
  const [activeReport, setActiveReport] = useState('drugs');
  const [adminMode, setAdminMode] = useState(false);
  const [data, setData] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const chartRef = useRef(null);

  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = useRef(null);
  useReportPrintShortcut(exportMenuRef);

  // ── Advanced Features State ──
  const [rawRecords, setRawRecords] = useState([]);
  const [previousPeriodTotal, setPreviousPeriodTotal] = useState(null);
  const [drillDownItem, setDrillDownItem] = useState(null);
  const [chartMode, setChartMode] = useState('bar'); // 'bar' | 'heatmap'
  const [topMovers, setTopMovers] = useState({ up: null, down: null });
  
  // Date Range State
  const [range, setRange] = useState({
    start: new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().substring(0, 7), // Last 3 months default
    end: new Date().toISOString().substring(0, 7)
  });

  const [hierarchy, setHierarchy] = useState({ 
    branchId: '', areaId: '', clinicId: '' 
  });

  const [metaData, setMetaData] = useState({ drugs: [], categories: [], groupCodes: [] });
  const [hierarchyNames, setHierarchyNames] = useState({ branches: [], areas: [], clinics: [] });

  useEffect(() => {
    loadMeta();
  }, []);

  const loadMeta = async () => {
    try {
      const [drugs, cats, groups, branches, areas, clinics] = await Promise.all([
        invoke('get_drugs'),
        invoke('get_drug_categories'),
        invoke('get_drug_groups'),
        invoke('get_branches'),
        invoke('get_areas_all'),
        invoke('get_clinics_all')
      ]);
      setMetaData({ drugs, categories: cats, groupCodes: groups });
      setHierarchyNames({ branches, areas, clinics });
    } catch (err) {
      console.error('Metadata load failed', err);
    }
  };

  const getEntityName = () => {
    if (hierarchy.clinicId) return hierarchyNames.clinics.find(c => String(c.id) === String(hierarchy.clinicId))?.name || 'عيادة';
    if (hierarchy.areaId) return hierarchyNames.areas.find(a => String(a.id) === String(hierarchy.areaId))?.name || 'منطقة';
    if (hierarchy.branchId) return hierarchyNames.branches.find(b => String(b.id) === String(hierarchy.branchId))?.name || 'فرع';
    return 'غير محدد';
  };

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      toast.warning('يرجى اختيار الفرع على الأقل');
      return;
    }
    if (range.start > range.end) {
      toast.error('تاريخ البداية لا يمكن أن يكون بعد تاريخ النهاية');
      return;
    }

    setLoading(true);
    try {
      let records = [];
      let aggregated = [];
      let enrichedRaw = [];

      const params = {
        branchId: parseInt(hierarchy.branchId),
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        startMonth: range.start,
        endMonth: range.end,
        // Handling Snake Case for some backend commands if needed
        branch_id: parseInt(hierarchy.branchId),
        area_id: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
        clinic_id: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
        start_month: range.start,
        end_month: range.end
      };

      switch (activeReport) {
        case 'drugs': {
          const activeMeta = await ensureMeta();
          records = await invoke('get_detailed_drug_dispensed_range', params);
          const enrichedDrugs = records.map(r => {
            const drug = activeMeta.drugs.find(d => String(d.id) === String(r.drug_id));
            const cat = activeMeta.categories.find(c => String(c.id) === String(drug?.category_id));
            return { ...r, drugName: drug?.name || 'صنف غير معروف', categoryName: cat?.name || 'بدون تصنيف' };
          });
          enrichedRaw = enrichedDrugs;
          aggregated = aggregateRecordsByPrice(enrichedDrugs, ['drug_id', 'drugName', 'categoryName', 'unit_price'], ['quantity', 'cases_count', 'total_cost']);
          break;
        }

        case 'insulin':
          records = await invoke('get_insulin_dispensed_range', params);
          enrichedRaw = records;
          aggregated = aggregateRecordsByPrice(records, ['name', 'price', 'category', 'type_'], ['quantity', 'cases_count', 'cost']);
          break;

        case 'groups': {
          const activeMetaGroups = await ensureMeta();
          records = await invoke('get_drug_groups_report_range', params);
          enrichedRaw = records.map(r => ({ ...r, groupName: activeMetaGroups.groupCodes.find(g => g.id === r.group_code_id)?.name || 'مجموعة غير معروفة' }));
          let groupKeys = ['group_code_id'];
          if (hierarchy.clinicId) groupKeys = ['clinic_id', 'group_code_id'];
          aggregated = aggregateRecordsByPrice(records, groupKeys, ['cost']);
          aggregated = aggregated.map(r => ({ ...r, groupName: activeMetaGroups.groupCodes.find(g => g.id === r.group_code_id)?.name || 'مجموعة غير معروفة' }));
          break;
        }

        case 'supplies': {
          records = await invoke('get_supplies_dispensed_range', params);
          const [allSupplies, allCats] = await Promise.all([invoke('get_supplies'), invoke('get_supply_categories')]);
          const recordsWithKeys = records.map(r => ({
            ...r,
            groupKey: adminMode ? (r.clinic_name || 'unassigned') : (r.supply_id ? `s_${r.supply_id}` : `c_${r.category_id}`),
            displayName: adminMode ? (r.clinic_name || 'جهة غير محددة') : (r.supply_id ? (allSupplies.find(s => s.id === r.supply_id)?.name || `مستلزم ${r.supply_id}`) : (allCats.find(c => c.id === r.category_id)?.name || `فئة مستلزمات ${r.category_id}`))
          }));
          enrichedRaw = recordsWithKeys;
          aggregated = aggregateRecordsByPrice(recordsWithKeys, ['groupKey', 'displayName'], ['consumer_value', 'collective_entities_value']);
          aggregated = aggregated.map(r => ({ ...r, supplyName: r.displayName }));
          break;
        }

        case 'free_drugs':
          records = await invoke('get_free_monthly_drugs_dispensed_range', params);
          enrichedRaw = records;
          aggregated = [
            { category: 'الهيئة', cost: records.reduce((sum, r) => sum + r.free_authority, 0) },
            { category: 'الطلاب', cost: records.reduce((sum, r) => sum + r.free_students, 0) },
            { category: 'الأطفال', cost: records.reduce((sum, r) => sum + r.free_infants, 0) },
            { category: 'المرأة المعيلة', cost: records.reduce((sum, r) => sum + r.free_women, 0) },
          ].filter(r => r.cost > 0);
          if (adminMode) {
            aggregated = aggregateRecordsByPrice(records, ['clinic_name'], ['free_authority', 'free_students', 'free_infants', 'free_women']);
            aggregated = aggregated.map(r => ({ ...r, category: r.clinic_name || 'جهة غير محددة', cost: r.free_authority + r.free_students + r.free_infants + r.free_women }));
          }
          break;

        case 'supported_drugs':
          records = await invoke('get_supported_monthly_drugs_dispensed_range', params);
          enrichedRaw = records;
          aggregated = [
            { category: 'الهيئة (مشاركة)', cost: records.reduce((sum, r) => sum + r.sup_authority, 0) },
            { category: 'الطلاب (مشاركة)', cost: records.reduce((sum, r) => sum + r.sup_students, 0) },
            { category: 'الأطفال (مشاركة)', cost: records.reduce((sum, r) => sum + r.sup_infants, 0) },
            { category: 'حصة المرضى (كلي)', cost: records.reduce((sum, r) => sum + r.sup_patient_share, 0) },
          ].filter(r => r.cost > 0);
          if (adminMode) {
            aggregated = aggregateRecordsByPrice(records, ['clinic_name'], ['sup_authority', 'sup_students', 'sup_infants', 'sup_patient_share']);
            aggregated = aggregated.map(r => ({ ...r, category: r.clinic_name || 'جهة غير محددة', cost: r.sup_authority + r.sup_students + r.sup_infants + r.sup_patient_share }));
          }
          break;

        case 'cost': {
          const multiMonthCost = await invoke('get_cost_breakdown_report', { 
            branchId: params.branchId,
            areaId: params.areaId,
            clinicId: params.clinicId,
            months: generateMonthList(range.start, range.end) 
          });
          aggregated = multiMonthCost || [];
          enrichedRaw = aggregated; // Cost report is already monthly-aggregated
          break;
        }

        case 'comparison': {
          // Fetch Range A and Range B
          const [resA, resB] = await Promise.all([
            invoke('get_cost_breakdown_report', { ...params, months: [range.start] }),
            invoke('get_cost_breakdown_report', { ...params, months: [range.end] })
          ]);
          
          const compMap = new Map();
          resA.forEach(r => compMap.set(r.category, { name: r.category, val1: r.cost, val2: 0 }));
          resB.forEach(r => {
            if (compMap.has(r.category)) {
              compMap.get(r.category).val2 = r.cost;
            } else {
              compMap.set(r.category, { name: r.category, val1: 0, val2: r.cost });
            }
          });
          aggregated = Array.from(compMap.values());
          break;
        }

        case 'reorder': {
          const activeMetaReorder = await ensureMeta();
          records = await invoke('get_detailed_drug_dispensed_range', params);
          
          const monthKey = 'dispense_month';
          const monthsList = [...new Set(records.map(r => r[monthKey]).filter(Boolean))];
          const numMonths = monthsList.length || 1;
          
          const drugMap = new Map();
          records.forEach(r => {
            if (!drugMap.has(r.drug_id)) {
              const drug = activeMetaReorder.drugs.find(d => String(d.id) === String(r.drug_id));
              const cat = activeMetaReorder.categories.find(c => String(c.id) === String(drug?.category_id));
              drugMap.set(r.drug_id, {
                drugId: r.drug_id,
                drugName: drug?.name || 'صنف غير معروف',
                categoryName: cat?.name || 'بدون تصنيف',
                totalQuantity: 0,
                monthlyData: {}
              });
            }
            const d = drugMap.get(r.drug_id);
            d.totalQuantity += parseFloat(r.quantity) || 0;
            const m = r[monthKey];
            if (m) d.monthlyData[m] = (d.monthlyData[m] || 0) + (parseFloat(r.quantity) || 0);
          });
          
          aggregated = Array.from(drugMap.values()).map(d => {
            const avg = d.totalQuantity / numMonths;
            const buffer = avg * 0.5; // 50% buffer for reorder
            const suggested = Math.ceil(avg + buffer);
            const maxMonthEntry = Object.entries(d.monthlyData).sort((a,b) => b[1]-a[1])[0];
            return {
              ...d,
              avgQuantity: avg,
              suggestedOrder: suggested,
              peakMonth: maxMonthEntry ? maxMonthEntry[0] : '-',
              peakQuantity: maxMonthEntry ? maxMonthEntry[1] : 0,
              cost: suggested // Using cost for sorting functionality
            };
          }).sort((a, b) => b.suggestedOrder - a.suggestedOrder);
          
          enrichedRaw = aggregated;
          break;
        }
      }

      setData(aggregated);
      setRawRecords(enrichedRaw);
      setActiveFilter('all');
      setChartMode('bar');
      setDrillDownItem(null);

      // ── Feature 1: Growth - Fetch Previous Period ──
      try {
        const prevPeriod = calculatePreviousPeriod(range.start, range.end);
        const prevMonths = generateMonthList(prevPeriod.start, prevPeriod.end);
        if (prevMonths.length > 0) {
          const prevData = await invoke('get_cost_breakdown_report', {
            branchId: params.branchId, areaId: params.areaId, clinicId: params.clinicId, months: prevMonths
          });
          setPreviousPeriodTotal((prevData || []).reduce((sum, r) => sum + r.cost, 0));
        } else { setPreviousPeriodTotal(null); }
      } catch { setPreviousPeriodTotal(null); }

      // ── Feature 5: Top Movers ──
      try {
        const rawForMovers = activeReport === 'cost' ? aggregated : enrichedRaw;
        const monthKey = activeReport === 'cost' ? 'month' : 'dispense_month';
        const months = [...new Set(rawForMovers.map(r => r[monthKey]).filter(Boolean))].sort();
        if (months.length >= 2) {
          const firstM = months[0], lastM = months[months.length - 1];
          const getName = (r) => {
            if (activeReport === 'drugs') return r.drugName;
            if (activeReport === 'insulin') return r.name;
            if (activeReport === 'groups') return r.groupName;
            if (activeReport === 'supplies') return r.displayName;
            if (activeReport === 'cost') return r.category;
            return r.category || r.clinic_name || '';
          };
          const getVal = (r) => {
            if (activeReport === 'drugs') return r.total_cost || 0;
            if (activeReport === 'insulin') return r.cost || 0;
            if (activeReport === 'supplies') return (r.consumer_value || 0) + (r.collective_entities_value || 0);
            if (activeReport === 'free_drugs') return r.free_authority + r.free_students + r.free_infants + r.free_women;
            if (activeReport === 'supported_drugs') return r.sup_authority + r.sup_students + r.sup_infants + r.sup_patient_share;
            return r.cost || 0;
          };
          const fMap = new Map(), lMap = new Map();
          rawForMovers.forEach(r => {
            const m = r[monthKey]; if (!m) return;
            const n = getName(r), v = getVal(r);
            if (m === firstM) fMap.set(n, (fMap.get(n) || 0) + v);
            if (m === lastM) lMap.set(n, (lMap.get(n) || 0) + v);
          });
          let bestUp = null, bestDown = null;
          [...new Set([...fMap.keys(), ...lMap.keys()])].forEach(k => {
            const oldV = fMap.get(k) || 0, newV = lMap.get(k) || 0;
            if (oldV === 0 && newV === 0) return;
            const diff = newV - oldV;
            const pct = oldV > 0 ? (diff / oldV) * 100 : (newV > 0 ? 100 : 0);
            if (!bestUp || pct > bestUp.pct) bestUp = { name: k, pct, oldVal: oldV, newVal: newV, firstMonth: firstM, lastMonth: lastM };
            if ((!bestDown || pct < bestDown.pct) && diff < 0) bestDown = { name: k, pct, oldVal: oldV, newVal: newV, firstMonth: firstM, lastMonth: lastM };
          });
          setTopMovers({ up: bestUp, down: bestDown });
        } else { setTopMovers({ up: null, down: null }); }
      } catch { setTopMovers({ up: null, down: null }); }

      toast.success(`تم جلب ${aggregated.length} سجل مجمع للفترة الزمنية`);
    } catch (err) {
      toast.error(`خطأ: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const generateMonthList = (start, end) => {
    const list = [];
    let curr = new Date(start);
    const stop = new Date(end);
    while (curr <= stop) {
      list.push(curr.toISOString().substring(0, 7));
      curr.setMonth(curr.getMonth() + 1);
    }
    return list;
  };

  const ensureMeta = async () => {
    if (metaData.drugs.length === 0) {
      const [drugs, cats, groups] = await Promise.all([
        invoke('get_drugs'),
        invoke('get_drug_categories'),
        invoke('get_drug_groups')
      ]);
      setMetaData({ drugs, categories: cats, groupCodes: groups });
      return { drugs, categories: cats, groupCodes: groups };
    }
    return metaData;
  };

  const setPresetRange = (type) => {
    const now = new Date();
    let start = new Date();
    switch (type) {
      case 'prev_month':
        start.setMonth(now.getMonth() - 1);
        setRange({ start: start.toISOString().substring(0, 7), end: start.toISOString().substring(0, 7) });
        break;
      case 'this_year':
        setRange({ start: `${now.getFullYear()}-01`, end: now.toISOString().substring(0, 7) });
        break;
      case 'last_3':
        start.setMonth(now.getMonth() - 2);
        setRange({ start: start.toISOString().substring(0, 7), end: now.toISOString().substring(0, 7) });
        break;
      case 'last_6':
        start.setMonth(now.getMonth() - 5);
        setRange({ start: start.toISOString().substring(0, 7), end: now.toISOString().substring(0, 7) });
        break;
      case 'last_12':
        start.setFullYear(now.getFullYear() - 1);
        start.setMonth(now.getMonth() + 1);
        setRange({ start: start.toISOString().substring(0, 7), end: now.toISOString().substring(0, 7) });
        break;
      case 'last_year':
        setRange({ start: `${now.getFullYear() - 1}-01`, end: `${now.getFullYear() - 1}-12` });
        break;
      case 'q1': setRange({ start: `${now.getFullYear()}-01`, end: `${now.getFullYear()}-03` }); break;
      case 'q2': setRange({ start: `${now.getFullYear()}-04`, end: `${now.getFullYear()}-06` }); break;
      case 'q3': setRange({ start: `${now.getFullYear()}-07`, end: `${now.getFullYear()}-09` }); break;
      case 'q4': setRange({ start: `${now.getFullYear()}-10`, end: `${now.getFullYear()}-12` }); break;
    }
  };

  const columns = useMemo(() => {
    switch (activeReport) {
      case 'drugs':
        return [
          { header: 'اسم الدواء', accessor: 'drugName' },
          { 
            header: 'التصنيف', 
            render: (r) => <span className="badge badge-success">{r.categoryName}</span>
          },
          { header: 'إجمالي الكمية', render: (r) => <span className="font-mono font-bold">{r.quantity.toLocaleString()}</span> },
          { header: 'إجمالي الحالات', render: (r) => <span className="font-mono text-slate-500">{r.cases_count}</span> },
          { header: 'السعر الثابت', render: (r) => <span className="text-slate-400 text-xs">{r.unit_price} ج.م</span> },
          { header: 'إجمالي التكلفة', render: (r) => <span className="font-black text-emerald-600">{r.total_cost.toLocaleString()} ج.م</span> },
        ];
      case 'insulin':
        return [
          { header: 'نوع الإنسولين', accessor: 'name' },
          { header: 'التصنيف', render: (r) => <span className="badge badge-info">{r.category}</span> },
          { header: 'النوع', render: (r) => <span className="text-xs opacity-60">{r.type_}</span> },
          { header: 'إجمالي الكمية', render: (r) => <span className="font-mono font-bold">{r.quantity.toLocaleString()}</span> },
          { header: 'سعر الوحدة', render: (r) => <span className="text-slate-400 text-xs">{r.price} ج.م</span> },
          { header: 'إجمالي التكلفة', render: (r) => <span className="font-black text-blue-600">{r.cost.toLocaleString()} ج.م</span> },
        ];
      case 'groups':
        return [
          { header: 'المجموعة الدوائية', accessor: 'groupName' },
          { header: 'التكلفة الإجمالية للفترة', render: (r) => <span className="font-black text-purple-600 text-lg">{r.cost.toLocaleString()} ج.م</span> },
        ];
      case 'supplies':
        return [
          { header: adminMode ? 'اسم العيادة/الجهة' : 'اسم المستلزم', accessor: 'supplyName' },
          { header: 'قيمة المستهلك', render: (r) => <span>{r.consumer_value.toLocaleString()} ج.م</span> },
          { header: 'قيمة الجهات', render: (r) => <span>{r.collective_entities_value.toLocaleString()} ج.م</span> },
          { header: 'الإجمالي', render: (r) => <span className="font-black text-amber-600">{(r.consumer_value + r.collective_entities_value).toLocaleString()} ج.م</span> },
        ];
      case 'free_drugs':
      case 'supported_drugs':
        return [
          { header: adminMode ? 'اسم العيادة/الجهة' : 'الفئة المستهدفة', accessor: 'category' },
          ...(adminMode && activeReport === 'free_drugs' ? [
            { header: 'الهيئة', render: (r) => <span className="text-[10px]">{r.free_authority?.toLocaleString()}</span> },
            { header: 'الطلاب', render: (r) => <span className="text-[10px]">{r.free_students?.toLocaleString()}</span> },
            { header: 'الأطفال', render: (r) => <span className="text-[10px]">{r.free_infants?.toLocaleString()}</span> },
            { header: 'معيلة', render: (r) => <span className="text-[10px]">{r.free_women?.toLocaleString()}</span> },
          ] : []),
          ...(adminMode && activeReport === 'supported_drugs' ? [
            { header: 'الهيئة', render: (r) => <span className="text-[10px]">{r.sup_authority?.toLocaleString()}</span> },
            { header: 'الطلاب', render: (r) => <span className="text-[10px]">{r.sup_students?.toLocaleString()}</span> },
            { header: 'الأطفال', render: (r) => <span className="text-[10px]">{r.sup_infants?.toLocaleString()}</span> },
            { header: 'حصة المريض', render: (r) => <span className="text-[10px]">{r.sup_patient_share?.toLocaleString()}</span> },
          ] : []),
          { header: 'إجمالي القيمة للفترة', render: (r) => <span className="font-black text-slate-700 dark:text-white">{r.cost.toLocaleString()} ج.م</span> },
          { 
            header: 'النسبة', 
            render: (r) => (
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">{((r.cost / (totalRangeCost || 1)) * 100).toFixed(1)}%</span>
              </div>
            ) 
          },
        ];
      case 'cost':
        return [
          { header: activeFilter === 'all' ? 'التصنيف' : 'الشهر', accessor: activeFilter === 'all' ? 'category' : 'month' },
          { header: 'التكلفة الإجمالية', render: (r) => <span className="font-black text-cyan-600">{r.cost.toLocaleString()} ج.م</span> },
        ];
      case 'comparison':
        return [
          { header: 'العنصر', accessor: 'name' },
          { header: `شهر (${range.start})`, render: (r) => <span className="font-mono">{r.val1.toLocaleString()}</span> },
          { header: `شهر (${range.end})`, render: (r) => <span className="font-mono font-bold text-primary">{r.val2.toLocaleString()}</span> },
          { 
            header: 'التغير', 
            render: (r) => {
              const diff = r.val2 - r.val1;
              const pct = r.val1 > 0 ? (diff / r.val1) * 100 : 0;
              const isUp = diff > 0;
              return (
                <div className={`flex items-center gap-1 font-black ${isUp ? 'text-rose-500' : 'text-emerald-500'}`}>
                   {isUp ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
                </div>
              );
            }
          },
        ];
      case 'reorder':
        return [
          { header: 'اسم الدواء', accessor: 'drugName' },
          { header: 'التصنيف', render: (r) => <span className="badge badge-success">{r.categoryName}</span> },
          { header: 'متوسط الاستهلاك', render: (r) => <span className="font-mono">{r.avgQuantity.toFixed(1)}</span> },
          { header: 'شهر الذروة', render: (r) => <span className="text-xs text-rose-500 font-bold">{r.peakMonth} <br/><span className="text-[10px]">({r.peakQuantity.toLocaleString()})</span></span> },
          { header: 'الكمية المقترحة', render: (r) => <span className="font-black text-emerald-600 text-lg bg-emerald-50 dark:bg-emerald-900/30 px-2 py-1 rounded">{r.suggestedOrder.toLocaleString()}</span> },
        ];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReport, data, range, adminMode, activeFilter]);

  // ── Filter System ──
  const getFilterField = () => {
    switch (activeReport) {
      case 'drugs': return 'categoryName';
      case 'insulin': return 'category';
      case 'cost': return 'category';
      default: return null;
    }
  };
  const getItemValue = (item) => {
    switch (activeReport) {
      case 'drugs': return item.total_cost || 0;
      case 'insulin': return item.cost || 0;
      case 'groups': return item.cost || 0;
      case 'supplies': return (item.consumer_value || 0) + (item.collective_entities_value || 0);
      case 'cost': case 'free_drugs': case 'supported_drugs': return item.cost || 0;
      case 'comparison': return item.val2 || 0;
      default: return 0;
    }
  };
  const getItemName = (item) => {
    switch (activeReport) {
      case 'drugs': return item.drugName;
      case 'insulin': return item.name;
      case 'groups': return item.groupName;
      case 'supplies': return item.supplyName;
      case 'cost': return activeFilter === 'all' ? item.category : item.month;
      case 'free_drugs': case 'supported_drugs': return item.category;
      case 'comparison': return item.name;
      case 'reorder': return item.drugName;
      default: return '';
    }
  };
  const filterField = getFilterField();
  const filterOptions = useMemo(() => {
    if (!filterField || data.length === 0) return [];
    return [...new Set(data.map(r => r[filterField]))].filter(Boolean);
  }, [data, filterField]);
  const filteredData = useMemo(() => {
    if (activeFilter === 'all' || !filterField) {
      if (activeReport === 'cost') {
        const map = new Map();
        data.forEach(r => {
          if (!map.has(r.category)) {
             map.set(r.category, { ...r });
          } else {
             map.get(r.category).cost += r.cost;
          }
        });
        return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
      }
      return data;
    }
    const res = data.filter(r => r[filterField] === activeFilter);
    if (activeReport === 'cost') {
      return res.sort((a, b) => (a.month || '').localeCompare(b.month || ''));
    }
    return res;
  }, [data, activeFilter, filterField, activeReport]);
   
   
  const totalRangeCost = useMemo(() => {
    return data.reduce((sum, r) => sum + getItemValue(r), 0);
  }, [data, activeReport]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTotalCost = useMemo(() => filteredData.reduce((sum, r) => sum + getItemValue(r), 0), [filteredData, activeReport]); // eslint-disable-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const topItem = useMemo(() => filteredData.length > 0 ? [...filteredData].sort((a, b) => getItemValue(b) - getItemValue(a))[0] : null, [filteredData, activeReport]);

  // ── Feature 1: Growth Percentage ──
  const growthPct = useMemo(() => {
    if (previousPeriodTotal === null || previousPeriodTotal === 0) return null;
    return ((filteredTotalCost - previousPeriodTotal) / previousPeriodTotal) * 100;
  }, [filteredTotalCost, previousPeriodTotal]);

  // ── Feature 2: Monthly Totals & Forecast ──
  const monthlyTotals = useMemo(() => {
    if (activeReport === 'cost') {
      const map = new Map();
      data.forEach(r => { if (r.month) { map.set(r.month, (map.get(r.month) || 0) + r.cost); } });
      return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total }));
    }
    if (rawRecords.length === 0) return [];
    const map = new Map();
    rawRecords.forEach(r => {
      const m = r.dispense_month; if (!m) return;
      map.set(m, (map.get(m) || 0) + getItemValue(r));
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, total]) => ({ month, total }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rawRecords, activeReport]);

  const forecastPoint = useMemo(() => {
    if (monthlyTotals.length < 2) return null;
    const result = simpleLinearRegression(monthlyTotals.map(m => m.total));
    if (!result) return null;
    const last = monthlyTotals[monthlyTotals.length - 1].month;
    const d = new Date(last + '-01'); d.setMonth(d.getMonth() + 1);
    return { month: d.toISOString().substring(0, 7), total: Math.round(result.predicted), isForecast: true };
  }, [monthlyTotals]);

  const trendChartData = useMemo(() => {
    if (monthlyTotals.length < 2) return [];
    const result = [...monthlyTotals];
    if (forecastPoint) result.push(forecastPoint);
    return result;
  }, [monthlyTotals, forecastPoint]);

  // ── Feature 3: Heatmap Data ──
  const heatmapData = useMemo(() => {
    if (activeReport === 'cost' && data.length > 0) {
      const categories = [...new Set(data.map(r => r.category))];
      const months = [...new Set(data.map(r => r.month))].filter(Boolean).sort();
      if (months.length < 2 || categories.length < 2) return null;
      const matrix = categories.map(cat => months.map(month => {
        const r = data.find(d => d.category === cat && d.month === month);
        return r ? r.cost : 0;
      }));
      return { categories, months, matrix, maxVal: Math.max(...matrix.flat(), 1) };
    }

    if (!rawRecords || rawRecords.length === 0) return null;

    // Determine month key and sorted months
    const firstRecord = rawRecords[0] || {};
    const monthKey = Object.hasOwn(firstRecord, 'dispense_month') ? 'dispense_month' : (Object.hasOwn(firstRecord, 'month') ? 'month' : null);
    if (!monthKey) return null;
    const months = [...new Set(rawRecords.map(r => r[monthKey]).filter(Boolean))].sort();
    if (months.length === 0) return null; // Permissive: allow 1 month for heatmap structure

    // Helper to get category name for a raw record
    const getCat = (r) => {
      if (activeReport === 'drugs') return r.categoryName || r.drugName;
      if (activeReport === 'insulin') return r.category || r.name;
      if (activeReport === 'groups') return r.groupName;
      if (activeReport === 'supplies') return r.displayName;
      return r.category || r.clinic_name || 'عام';
    };

    let categories = [];
    let matrix = [];

    // Special handling for free/supported drugs (unpivoting the 4 categories)
    if (activeReport === 'free_drugs' || activeReport === 'supported_drugs') {
      const subCats = activeReport === 'free_drugs' 
        ? [
            { id: 'free_authority', label: 'الهيئة' },
            { id: 'free_students', label: 'الطلاب' },
            { id: 'free_infants', label: 'الأطفال' },
            { id: 'free_women', label: 'المرأة المعيلة' }
          ]
        : [
            { id: 'sup_authority', label: 'الهيئة (مشاركة)' },
            { id: 'sup_students', label: 'الطلاب (مشاركة)' },
            { id: 'sup_infants', label: 'الأطفال (مشاركة)' },
            { id: 'sup_patient_share', label: 'حصة المرضى' }
          ];

      categories = subCats.map(c => c.label);
      matrix = subCats.map(c => months.map(month => 
        rawRecords.filter(r => r[monthKey] === month).reduce((s, r) => s + (r[c.id] || 0), 0)
      ));
    } else {
      // Standard report types
      const allCats = [...new Set(rawRecords.map(r => getCat(r)))].filter(Boolean);
      // Sort categories by total value and take top 15
      const catTotals = allCats.map(cat => ({
        name: cat,
        total: rawRecords.filter(r => getCat(r) === cat).reduce((s, r) => s + getItemValue(r), 0)
      })).sort((a, b) => b.total - a.total);
      
      categories = catTotals.slice(0, 15).map(c => c.name);
      matrix = categories.map(cat => months.map(month =>
        rawRecords.filter(r => getCat(r) === cat && r[monthKey] === month).reduce((s, r) => s + getItemValue(r), 0)
      ));
    }

    const flatMatrix = matrix.flat();
    if (flatMatrix.length === 0) return null;
    return { categories, months, matrix, maxVal: Math.max(...flatMatrix, 1) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, rawRecords, activeReport]);

  // ── Feature 4: Drill-Down Records ──
  const drillDownRecords = useMemo(() => {
    if (!drillDownItem) return [];
    const src = activeReport === 'cost' ? data : rawRecords;
    switch (activeReport) {
      case 'drugs': return src.filter(r => String(r.drug_id) === String(drillDownItem.drug_id) && Math.abs((r.unit_price || 0) - (drillDownItem.unit_price || 0)) < 0.01);
      case 'insulin': return src.filter(r => r.name === drillDownItem.name && Math.abs((r.price || 0) - (drillDownItem.price || 0)) < 0.01);
      case 'groups': return src.filter(r => r.group_code_id === drillDownItem.group_code_id);
      case 'supplies': return src.filter(r => r.groupKey === drillDownItem.groupKey);
      case 'cost': return activeFilter === 'all' ? data.filter(r => r.category === drillDownItem.category) : [drillDownItem];
      case 'free_drugs': case 'supported_drugs': return adminMode ? src.filter(r => (r.clinic_name || 'جهة غير محددة') === drillDownItem.category) : [drillDownItem];
      default: return [];
    }
  }, [drillDownItem, rawRecords, data, activeReport, activeFilter, adminMode]);

  const exportColumns = useMemo(() => {
    switch (activeReport) {
      case 'drugs':
        return [
          { header: 'اسم الدواء', exportAccessor: r => r.drugName },
          { header: 'التصنيف', exportAccessor: r => r.categoryName },
          { header: 'سعر الوحدة', exportAccessor: r => r.unit_price ? `${Number(r.unit_price).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` : '0 ج.م' },
          { header: 'إجمالي الكمية', exportAccessor: r => (r.quantity || 0).toLocaleString('ar-EG') },
          { header: 'عدد الحالات', exportAccessor: r => (r.cases_count || 0).toLocaleString('ar-EG') },
          { header: 'إجمالي التكلفة للفترة', exportAccessor: r => `${(r.total_cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.total_cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
        ];
      case 'insulin':
        return [
          { header: 'نوع الإنسولين', exportAccessor: r => r.name },
          { header: 'التصنيف', exportAccessor: r => r.category },
          { header: 'النوع', exportAccessor: r => r.type_ },
          { header: 'سعر الوحدة', exportAccessor: r => r.price ? `${Number(r.price).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` : '0 ج.م' },
          { header: 'إجمالي الكمية', exportAccessor: r => (r.quantity || 0).toLocaleString('ar-EG') },
          { header: 'عدد الحالات', exportAccessor: r => (r.cases_count || 0).toLocaleString('ar-EG') },
          { header: 'إجمالي التكلفة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
        ];
      case 'groups':
        return [
          { header: 'المجموعة الدوائية', exportAccessor: r => r.groupName },
          { header: 'التكلفة الإجمالية للفترة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
        ];
      case 'supplies':
        return [
          { header: adminMode ? 'اسم العيادة/الجهة' : 'اسم المستلزم', exportAccessor: r => adminMode ? (r.category || r.supplyName) : r.supplyName },
          { header: 'قيمة المستهلك', exportAccessor: r => `${(r.consumer_value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'قيمة الجهات', exportAccessor: r => `${(r.collective_entities_value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'الإجمالي العام', exportAccessor: r => `${((r.consumer_value || 0) + (r.collective_entities_value || 0)).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
        ];
      case 'free_drugs':
        if (adminMode) {
          return [
            { header: 'جهة/عيادة المنصرف', exportAccessor: r => r.category },
            { header: 'مجاني - الهيئة', exportAccessor: r => (r.free_authority || 0).toLocaleString('ar-EG') },
            { header: 'مجاني - الطلاب', exportAccessor: r => (r.free_students || 0).toLocaleString('ar-EG') },
            { header: 'مجاني - الأطفال', exportAccessor: r => (r.free_infants || 0).toLocaleString('ar-EG') },
            { header: 'مجاني - المرأة المعيلة', exportAccessor: r => (r.free_women || 0).toLocaleString('ar-EG') },
            { header: 'إجمالي القيمة للفترة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
            { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
          ];
        }
        return [
          { header: 'الفئة المستهدفة', exportAccessor: r => r.category },
          { header: 'إجمالي القيمة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
        ];
      case 'supported_drugs':
        if (adminMode) {
          return [
            { header: 'جهة/عيادة المنصرف', exportAccessor: r => r.category },
            { header: 'مدعم - الهيئة (مشاركة)', exportAccessor: r => (r.sup_authority || 0).toLocaleString('ar-EG') },
            { header: 'مدعم - الطلاب (مشاركة)', exportAccessor: r => (r.sup_students || 0).toLocaleString('ar-EG') },
            { header: 'مدعم - الأطفال (مشاركة)', exportAccessor: r => (r.sup_infants || 0).toLocaleString('ar-EG') },
            { header: 'حصة المريض المحصلة', exportAccessor: r => (r.sup_patient_share || 0).toLocaleString('ar-EG') },
            { header: 'إجمالي القيمة للفترة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
            { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
          ];
        }
        return [
          { header: 'الفئة المستهدفة', exportAccessor: r => r.category },
          { header: 'إجمالي القيمة', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
          { header: 'النسبة المئوية', exportAccessor: r => filteredTotalCost > 0 ? `${(((r.cost || 0) / (filteredTotalCost || 1)) * 100).toFixed(1)}%` : '0%' },
        ];
      case 'cost':
        return [
          { header: activeFilter === 'all' ? 'التصنيف' : 'الشهر', exportAccessor: r => activeFilter === 'all' ? r.category : r.month },
          { header: 'التكلفة الإجمالية', exportAccessor: r => `${(r.cost || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م` },
        ];
      case 'comparison':
        return [
          { header: 'العنصر', exportAccessor: r => r.name },
          { header: `شهر (${range.start})`, exportAccessor: r => (r.val1 || 0).toLocaleString('ar-EG') },
          { header: `شهر (${range.end})`, exportAccessor: r => (r.val2 || 0).toLocaleString('ar-EG') },
          { header: 'فارق التغير', exportAccessor: r => ((r.val2 || 0) - (r.val1 || 0)).toLocaleString('ar-EG') },
        ];
      case 'reorder':
        return [
          { header: 'اسم الدواء', exportAccessor: r => r.drugName },
          { header: 'التصنيف', exportAccessor: r => r.categoryName },
          { header: 'المتوسط الشهري', exportAccessor: r => (r.avgQuantity || 0).toLocaleString('ar-EG', { maximumFractionDigits: 1 }) },
          { header: 'شهر الذروة', exportAccessor: r => r.peakMonth },
          { header: 'الكمية المقترحة', exportAccessor: r => (r.suggestedOrder || 0).toLocaleString('ar-EG') },
        ];
      default:
        return [];
    }
  }, [activeReport, activeFilter, adminMode, range, filteredTotalCost]);

  const handleCustomExport = async (format, { data, columns, options }) => {
    // Let ExportMenu handle print natively (opens PrintSettingsModal)
    if (format === 'print') return false;

    let chartImage = null;
    if (chartRef.current) {
      try {
        const canvas = await html2canvas(chartRef.current, { scale: 2, backgroundColor: '#ffffff' });
        chartImage = canvas.toDataURL('image/png');
      } catch (err) {
        console.error('Failed to capture chart:', err);
      }
    }
    // Save outcome of whichever format branch below runs (true = saved,
    // false/unknown = cancelled: silent, no built-in fallback export).
    let saved = false;
    if (format === 'excel') {
      // Use multi-sheet export with summary + chart
      const reportLabel = REPORT_TYPES.find(r => r.id === activeReport)?.label || '';
      const totalCost = data.reduce((s, r) => {
        const val = parseFloat(String(r.cost || r.total_cost || 0).replace(/,/g, ''));
        return s + (isNaN(val) ? 0 : val);
      }, 0);
      const periodStr = `الفترة من: ${range.start} إلى: ${range.end}`;
      const exportOpts = {
        ...options,
        chartImage,
        hierarchyLabel: getEntityName(),
        periodLabel: periodStr,
        startMonth: range.start,
        endMonth: range.end,
        subtitle: options.subtitle || `الجهة: ${getEntityName()} | ${periodStr}`
      };
      const sheetsData = {
        'التقرير الرئيسي': { data, columns, options: exportOpts },
      };
      saved = await exportMultiSheetExcel(sheetsData, {
        fileName: options.fileName || 'temporal_' + activeReport,
        title: options.title || 'التحليل الزمني - ' + reportLabel,
        periodLabel: periodStr,
        hierarchyLabel: getEntityName(),
        chartImage,
        summaryData: {
          headers: ['المؤشر', 'القيمة'],
          rows: [
            ['نوع التقرير', reportLabel],
            ['النطاق الإداري', getEntityName()],
            ['عدد السجلات', String(data.length)],
            ['إجمالي التكلفة', totalCost.toLocaleString() + ' ج.م'],
            ['الفترة الزمنية', periodStr],
          ],
        },
      });
    } else {
      const periodStr = `الفترة من: ${range.start} إلى: ${range.end}`;
      const exportOpts = {
        ...options,
        chartImage,
        hierarchyLabel: getEntityName(),
        periodLabel: periodStr,
        startMonth: range.start,
        endMonth: range.end,
        subtitle: options.subtitle || `الجهة: ${getEntityName()} | ${periodStr}`
      };
      if (format === 'word') saved = await exportToWord(data, columns, exportOpts);
      else if (format === 'pdf') saved = await exportToPDF(data, columns, exportOpts);
      else return false;
    }

    return saved === true ? true : 'cancelled';
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="no-print space-y-6">
        <Breadcrumb items={[{ label: 'التقارير' }, { label: 'مركز التحليل الزمني الشامل' }]} />
        
        <PageHeader 
          title="مركز التحليل الزمني الشامل" 
          icon={BarChart3} 
          description="تحليل متتقدم للمنصرف عبر فترات زمنية مخصصة مع تجميع ذكي للبيانات المالية والكمية."
          actions={
            <ExportMenu 
              ref={exportMenuRef}
              data={filteredData} 
              columns={exportColumns}
              onCustomExport={handleCustomExport}
              options={{ 
                title: `تقرير التحليل الزمني - ${REPORT_TYPES.find(r => r.id === activeReport)?.label}`, 
                fileName: `temporal_${activeReport}`,
                hierarchyLabel: getEntityName(),
                periodLabel: `الفترة من: ${range.start} إلى: ${range.end}`,
                startMonth: range.start,
                endMonth: range.end,
                subtitle: `الجهة: ${getEntityName()} | الفترة من: ${range.start} إلى: ${range.end}`
              }} 
            />
          }
        />
      </div>

      <Card className="no-print p-6 border-none shadow-xl bg-[var(--color-bg-card)]">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7">
            <HierarchySelector 
              onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
              initialBranch={hierarchy.branchId}
              hideMonth 
            />
          </div>
          <div className="lg:col-span-5 space-y-4">
             <div className="flex items-center gap-2 mb-2 text-[var(--color-primary)] font-black text-xs uppercase tracking-widest">
                <Calendar size={14} />
                <span>نطاق التحليل الزمني</span>
             </div>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-[var(--color-bg)] p-4 rounded-3xl border border-[var(--color-border)] shadow-inner">
                <MonthInput
                  label="من شهر"
                  value={range.start}
                  onChange={(e) => setRange({...range, start: e.target.value})}
                />
                <MonthInput
                  label="إلى شهر"
                  value={range.end}
                  onChange={(e) => setRange({...range, end: e.target.value})}
                />
             </div>
             <div className="flex flex-wrap gap-2 pt-2">
                {[
                  { id: 'last_3', label: 'آخر 3 أشهر' },
                  { id: 'last_6', label: 'آخر 6 أشهر' },
                  { id: 'this_year', label: 'السنة الحالية' },
                  { id: 'last_year', label: 'السنة السابقة' },
                  { id: 'q1', label: 'Q1' }, { id: 'q2', label: 'Q2' },
                  { id: 'q3', label: 'Q3' }, { id: 'q4', label: 'Q4' },
                ].map(p => (
                  <button 
                    key={p.id}
                    onClick={() => setPresetRange(p.id)}
                    className="px-4 py-2 text-[10px] font-black rounded-xl bg-[var(--color-bg-card)] text-[var(--color-text-muted)] hover:bg-[var(--color-primary)]/10 hover:text-[var(--color-primary)] transition-all border border-[var(--color-border)]"
                  >
                    {p.label}
                  </button>
                ))}
             </div>
          </div>
        </div>
        <div className="mt-6 pt-6 border-t border-slate-100 flex justify-center">
            <Button variant="primary" icon={TrendingUp} onClick={handleFetch} loading={loading} className="px-20 h-12 rounded-2xl shadow-xl font-black text-lg">
              توليد التحليل الزمني
            </Button>
        </div>
      </Card>

      {/* ─── Report Selection Box (AutoComplete Supporting Long Names) ─── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between no-print gap-4 bg-[var(--color-bg-card)] p-5 rounded-3xl border border-[var(--color-border)] shadow-md">
        <div className="flex-1 max-w-xl">
          <AutoComplete
            value={activeReport}
            onChange={(id) => { if (id) { setActiveReport(id); setData([]); setActiveFilter('all'); } }}
            options={REPORT_TYPES}
            getOptionLabel={(r) => r.label}
            getOptionValue={(r) => r.id}
            label="نوع تقرير التحليل الزمني"
            placeholder="اختر نوع التقرير الإحصائي..."
            icon={BarChart3}
          />
        </div>

        {['free_drugs', 'supported_drugs', 'supplies'].includes(activeReport) && (
          <div className="flex items-center gap-3 bg-[var(--color-bg)] p-3 px-5 rounded-2xl border border-[var(--color-border)] shadow-sm shrink-0">
            <div className="flex flex-col items-end">
              <span className="text-xs font-black text-cyan-600 dark:text-cyan-400">الوضع الإداري التفصيلي</span>
              <span className="text-[10px] text-[var(--color-text-muted)]">تفاصيل العيادات والتوزيع الفئوي</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={adminMode}
                onChange={() => { setAdminMode(!adminMode); setData([]); }}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
            </label>
          </div>
        )}
      </div>

      {data.length > 0 && (
        <div className="space-y-6 animate-slideUp">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)] shadow-sm relative overflow-hidden">
              <p className="text-[10px] font-bold text-cyan-600 uppercase mb-1">إجمالي التكلفة</p>
              <h2 className="text-2xl font-black text-[var(--color-text)]">{filteredTotalCost.toLocaleString()}</h2>
              {growthPct !== null && (
                <div className={`flex items-center justify-center gap-1 mt-1 text-xs font-black ${growthPct >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {growthPct >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  <span>{Math.abs(growthPct).toFixed(1)}%</span>
                  <span className="text-[8px] font-normal text-[var(--color-text-muted)] mr-1">عن الفترة السابقة</span>
                </div>
              )}
              {growthPct === null && <p className="text-[10px] text-[var(--color-text-muted)]">جنيه مصري</p>}
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)] shadow-sm">
              <p className="text-[10px] font-bold text-purple-600 uppercase mb-1">عدد السجلات</p>
              <h2 className="text-2xl font-black text-[var(--color-text)]">{filteredData.length}</h2>
              <p className="text-[10px] text-slate-400">سجل نشط</p>
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)] shadow-sm">
              <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">أعلى قيمة</p>
              <h2 className="text-lg font-black text-[var(--color-text)] truncate" title={topItem ? getItemName(topItem) : ''}>{topItem ? getItemName(topItem) : 'لا يوجد'}</h2>
              <p className="text-[10px] text-slate-400">{topItem ? getItemValue(topItem).toLocaleString() : 0} ج.م</p>
            </Card>
            <Card className="p-5 text-center bg-[var(--color-bg-card)] border-[var(--color-border)] shadow-sm">
              <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">{forecastPoint ? 'التوقع القادم' : 'النطاق الزمني'}</p>
              {forecastPoint ? (
                <>
                  <h2 className="text-lg font-black text-amber-600">{forecastPoint.total.toLocaleString()}</h2>
                  <p className="text-[10px] text-slate-400">توقع شهر {forecastPoint.month}</p>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-black text-[var(--color-text)]">{range.start}</h2>
                  <p className="text-[10px] text-slate-400">إلى {range.end}</p>
                </>
              )}
            </Card>
          </div>

          {filterOptions.length > 0 && (
            <div className="flex gap-2 flex-wrap no-print bg-[var(--color-bg-card)] p-4 rounded-2xl border border-[var(--color-border)] shadow-sm">
              <div className="w-full mb-1 flex items-center gap-2">
                 <Filter size={14} className="text-[var(--color-primary)]" />
                 <span className="text-xs font-black text-[var(--color-text-muted)]">فلترة حسب التصنيف:</span>
              </div>
              <button onClick={() => setActiveFilter('all')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeFilter === 'all' ? 'bg-[var(--color-primary)] text-white shadow' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)] hover:border-[var(--color-primary)]/50'}`}>
                الكل
              </button>
              {filterOptions.map((opt, i) => (
                <button key={opt} onClick={() => setActiveFilter(opt)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all border ${activeFilter === opt ? 'text-white shadow-md' : 'bg-[var(--color-bg)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-[var(--color-primary)]/50'}`}
                  style={activeFilter === opt ? { background: COLORS[i % COLORS.length], borderColor: COLORS[i % COLORS.length] } : {}}>
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* ── Feature 5: Top Movers Alert ── */}
          {(topMovers.up || topMovers.down) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 no-print">
              {topMovers.up && (
                <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-800">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 flex items-center justify-center shrink-0"><ArrowUpRight size={20} className="text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-rose-600 uppercase">أعلى ارتفاع</p>
                    <p className="font-black text-sm text-[var(--color-text)] truncate">{topMovers.up.name}</p>
                    <p className="text-[10px] text-slate-500">{topMovers.up.oldVal.toLocaleString()} → {topMovers.up.newVal.toLocaleString()} ج.م</p>
                  </div>
                  <span className="text-lg font-black text-rose-500">+{topMovers.up.pct.toFixed(1)}%</span>
                </div>
              )}
              {topMovers.down && (
                <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shrink-0"><ArrowDownRight size={20} className="text-white" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-emerald-600 uppercase">أعلى انخفاض</p>
                    <p className="font-black text-sm text-[var(--color-text)] truncate">{topMovers.down.name}</p>
                    <p className="text-[10px] text-slate-500">{topMovers.down.oldVal.toLocaleString()} → {topMovers.down.newVal.toLocaleString()} ج.م</p>
                  </div>
                  <span className="text-lg font-black text-emerald-500">{topMovers.down.pct.toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}

          {/* ── Feature 2: Trend + Forecast Chart ── */}
          {trendChartData.length >= 2 && (
            <Card className="p-6 border-none shadow-xl no-print">
              <h3 className="font-black text-sm text-[var(--color-text)] mb-4 flex items-center gap-2">
                <Activity size={18} className="text-amber-500" /> التطور الشهري مع التوقع المستقبلي
              </h3>
              <div style={{ width: '100%', height: 300, backgroundColor: '#ffffff', padding: '10px', borderRadius: '12px' }} dir="ltr">
                <ResponsiveContainer>
                  <LineChart data={trendChartData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fontWeight: 'bold' }} />
                    <YAxis tickFormatter={v => v.toLocaleString()} tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(v) => v.toLocaleString() + ' ج.م'} contentStyle={{ direction: 'rtl', borderRadius: 12 }} />
                    <Line type="monotone" dataKey="total" stroke="var(--color-dash-1)" strokeWidth={3} dot={{ r: 5, fill: 'var(--color-dash-1)' }} activeDot={{ r: 8 }} name="الإجمالي" connectNulls />
                    {forecastPoint && (
                      <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={3} strokeDasharray="8 4" dot={{ r: 6, fill: '#f59e0b', strokeWidth: 2 }} name="التوقع" data={[trendChartData[trendChartData.length - 2], trendChartData[trendChartData.length - 1]]} />
                    )}
                    {forecastPoint && <ReferenceLine x={forecastPoint.month} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: 'متوقع', position: 'top', fill: '#f59e0b', fontSize: 11, fontWeight: 'bold' }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}

          {/* ── Main Data Table Card (Shown First) ── */}
          <Card className="p-0 overflow-hidden shadow-2xl border-none print:shadow-none">
            <div className="print:hidden">
              <SyncedTableContainer>
                <table className="w-full text-sm text-right" dir="rtl">
                  <thead className="text-xs text-white uppercase" style={{ background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-dark, #0e7490))' }}>
                    <tr>
                      <th className="px-6 py-4 font-bold tracking-wider">#</th>
                      {columns.map((col, i) => (
                        <th key={i} className="px-6 py-4 font-bold tracking-wider whitespace-nowrap">{col.header}</th>
                      ))}
                      <th className="px-6 py-4 text-center font-bold tracking-wider no-print">شريط النسبة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredData.map((row, i) => {
                      const val = getItemValue(row);
                      const pct = filteredTotalCost > 0 ? ((val / filteredTotalCost) * 100) : 0;
                      return (
                        <tr key={i} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)] transition-colors cursor-pointer group" onClick={() => setDrillDownItem(row)}>
                          <td className="px-6 py-4 font-bold text-slate-400">
                            <div className="flex items-center gap-1">
                              {i + 1}
                              <Eye size={12} className="opacity-0 group-hover:opacity-60 transition-opacity text-[var(--color-primary)]" />
                            </div>
                          </td>
                          {columns.map((col, cIdx) => (
                            <td key={cIdx} className="px-6 py-4 whitespace-nowrap">
                              {col.render ? col.render(row) : <span className="font-bold text-[var(--color-text)]">{row[col.accessor]}</span>}
                            </td>
                          ))}
                          <td className="px-6 py-4 no-print w-48">
                            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden flex items-center">
                              <div className="h-full rounded-full transition-all duration-1000 ease-out" style={{ width: `${pct}%`, background: COLORS[i % COLORS.length] }}></div>
                            </div>
                            <span className="text-[9px] font-bold text-slate-500 mt-1 block text-left">{pct.toFixed(1)}%</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)' }}>
                      <td className="px-6 py-4 text-right text-sm font-black text-white" colSpan={2}>الإجمالي</td>
                      <td className="px-6 py-4 text-left font-mono font-black text-cyan-300 text-lg" colSpan={columns.length}>
                        {filteredTotalCost.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </SyncedTableContainer>
            </div>

            <div className="hidden print:block">
               <PrintableTable title={`تقرير التحليل الزمني - ${REPORT_TYPES.find(r => r.id === activeReport)?.label}`} subtitle={`النطاق الزمني: ${range.start} إلى ${range.end} | الجهة: ${getEntityName()}`} hierarchyLabel={buildHierarchyLabel(globalWorkspaceMode, globalHierarchyNames)}>
                  <table className="w-full border-collapse" dir="rtl">
                    <thead>
                      <tr className="bg-slate-200 border-b-2 border-black">
                        <th className="px-4 py-2 text-right font-bold text-xs">#</th>
                        {columns.map((col, i) => (
                          <th key={i} className="px-4 py-2 text-right font-bold text-xs">{col.header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.map((row, i) => (
                        <tr key={i} className="border-b border-gray-300">
                          <td className="px-4 py-2 text-xs">{i + 1}</td>
                          {columns.map((col, cIdx) => (
                            <td key={cIdx} className="px-4 py-2 text-xs">
                              {col.render ? col.render(row) : row[col.accessor]}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-black font-black bg-slate-100">
                        <td className="px-4 py-2 text-right text-sm" colSpan={2}>الإجمالي المفلتر</td>
                        <td className="px-4 py-2 text-left text-sm" colSpan={columns.length - 1}>
                          {filteredTotalCost.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
               </PrintableTable>
            </div>
          </Card>

          {/* ── Chart Mode Toggle & Charts Section (Placed Below Table) ── */}
          {activeReport !== 'comparison' && (
            <div className="flex items-center justify-between no-print pt-4 border-t border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <button onClick={() => setChartMode('bar')} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${chartMode === 'bar' ? 'bg-[var(--color-primary)] text-white shadow' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
                  <BarChart3 size={14} /> الرسوم البيانية المنظمة
                </button>
                <button onClick={() => setChartMode('heatmap')} disabled={!heatmapData} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${!heatmapData ? 'opacity-30 cursor-not-allowed' : ''} ${chartMode === 'heatmap' ? 'bg-cyan-600 text-white shadow' : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border border-[var(--color-border)]'}`}>
                  <Grid3X3 size={14} /> الخريطة الحرارية
                </button>
              </div>
              <span className="text-[10px] font-bold text-[var(--color-text-muted)]">الرسم التوضيحي للنتائج أعلى 15 عنصر</span>
            </div>
          )}

          {/* ── Feature 3: Heatmap Matrix ── */}
          {chartMode === 'heatmap' && heatmapData && (
            <Card className="p-6 border-none shadow-xl no-print overflow-x-auto">
              <h3 className="font-black text-sm text-[var(--color-text)] mb-4 flex items-center gap-2">
                <Grid3X3 size={18} className="text-cyan-500" /> الخريطة الحرارية - كثافة الاستهلاك
              </h3>
              <div className="overflow-x-auto" dir="rtl">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="px-3 py-2 text-right font-black text-[var(--color-text-muted)] sticky right-0 bg-[var(--color-bg-card)] z-10 min-w-[140px]">التصنيف</th>
                      {heatmapData.months.map(m => <th key={m} className="px-2 py-2 text-center font-bold text-[var(--color-text-muted)] whitespace-nowrap">{m}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmapData.categories.map((cat, ri) => (
                      <tr key={cat} className="border-t border-[var(--color-border)]/30">
                        <td className="px-3 py-2 font-bold text-[var(--color-text)] sticky right-0 bg-[var(--color-bg-card)] z-10 truncate max-w-[180px]" title={cat}>{cat}</td>
                        {heatmapData.matrix[ri].map((val, ci) => (
                          <td key={ci} className="px-1 py-1 text-center">
                            <div className="mx-auto w-full min-w-[50px] py-2 rounded-lg font-bold text-[10px] transition-all hover:scale-110 cursor-default" style={{ background: getHeatColor(val, heatmapData.maxVal), color: val > heatmapData.maxVal * 0.5 ? 'white' : 'var(--color-text)' }} title={`${cat} - ${heatmapData.months[ci]}: ${val.toLocaleString()} ج.م`}>
                              {val > 0 ? val.toLocaleString() : '-'}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* ── Refactored Charts (Bar + Pie with Truncation & Margins Below Table) ── */}
          {chartMode === 'bar' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 no-print">
            <Card className="p-6 border-none shadow-xl bg-white dark:bg-slate-900">
              <h3 className="font-black text-sm text-[var(--color-text)] mb-6 flex items-center gap-2">
                <BarChart3 size={18} className="text-[var(--color-primary)]" /> توزيع القيم والتكاليف
              </h3>
              <div ref={chartRef} style={{ width: '100%', height: 400, backgroundColor: '#ffffff', padding: '12px', borderRadius: '16px' }} dir="ltr">
                <ResponsiveContainer>
                  <BarChart data={filteredData.slice(0, 15)} layout="vertical" margin={{ top: 10, right: 40, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey={(r) => getItemName(r)}
                      width={190}
                      tick={({ x, y, payload }) => {
                        const fullText = payload.value || '';
                        const truncated = fullText.length > 24 ? fullText.substring(0, 24) + '...' : fullText;
                        return (
                          <g transform={`translate(${x},${y})`}>
                            <text x={-6} y={3} dy={0} textAnchor="end" fill="#334155" fontSize={10} fontWeight="bold">
                              <title>{fullText}</title>
                              {truncated}
                            </text>
                          </g>
                        );
                      }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', direction: 'rtl' }}
                      formatter={(val, name, props) => [val.toLocaleString() + ' ج.م', props.payload ? getItemName(props.payload) : 'العنصر']}
                    />
                    <Bar dataKey={(r) => getItemValue(r)} radius={[0, 6, 6, 0]} barSize={18}>
                      {filteredData.slice(0, 15).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      <LabelList dataKey={(r) => getItemValue(r)} position="right" formatter={(v) => v.toLocaleString()} style={{ fontSize: 10, fontWeight: 'bold', fill: '#0891b2' }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-6 border-none shadow-xl bg-white dark:bg-slate-900">
              <h3 className="font-black text-sm text-[var(--color-text)] mb-6 flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-500" /> النسب المئوية للتحليل
              </h3>
              <div style={{ width: '100%', height: 400, backgroundColor: '#ffffff', padding: '12px', borderRadius: '16px' }} dir="ltr">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie
                      data={filteredData.slice(0, 10).filter(d => getItemValue(d) > 0)}
                      innerRadius={65}
                      outerRadius={105}
                      paddingAngle={3}
                      dataKey={(r) => getItemValue(r)}
                      nameKey={(r) => getItemName(r)}
                    >
                      {filteredData.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      formatter={(val, name) => [val.toLocaleString() + ' ج.م', name]}
                      contentStyle={{ direction: 'rtl', borderRadius: '12px', border: '1px solid #e2e8f0' }}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={70}
                      iconType="circle"
                      formatter={(value) => (
                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569' }} title={value}>
                          {value.length > 20 ? value.substring(0, 20) + '...' : value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>
          )}
        </div>
      )}

      {/* ── Feature 4: Drill-Down Modal ── */}
      <Modal isOpen={!!drillDownItem} onClose={() => setDrillDownItem(null)} title={`تفاصيل: ${drillDownItem ? getItemName(drillDownItem) : ''}`} wide maxWidthClass="max-w-3xl">
        {drillDownItem && drillDownRecords.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--color-bg)] border border-[var(--color-border)]">
              <Sparkles size={16} className="text-amber-500" />
              <span className="text-xs font-bold text-[var(--color-text-muted)]">{drillDownRecords.length} سجل تفصيلي</span>
              <span className="text-xs text-[var(--color-text-muted)] mr-auto">القيمة الإجمالية: <b className="text-[var(--color-text)]">{drillDownRecords.reduce((s, r) => s + getItemValue(r), 0).toLocaleString()} ج.م</b></span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="bg-[var(--color-bg)]">
                    <th className="px-4 py-3 text-right text-xs font-bold text-[var(--color-text-muted)]">#</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-[var(--color-text-muted)]">الشهر</th>
                    {activeReport === 'drugs' && <><th className="px-4 py-3 text-center text-xs font-bold">الكمية</th><th className="px-4 py-3 text-center text-xs font-bold">الحالات</th></>}
                    {activeReport === 'insulin' && <><th className="px-4 py-3 text-center text-xs font-bold">الكمية</th><th className="px-4 py-3 text-center text-xs font-bold">الحالات</th></>}
                    {activeReport === 'supplies' && <><th className="px-4 py-3 text-center text-xs font-bold">المستهلك</th><th className="px-4 py-3 text-center text-xs font-bold">الجهات</th></>}
                    <th className="px-4 py-3 text-center text-xs font-bold text-[var(--color-text-muted)]">التكلفة</th>
                  </tr>
                </thead>
                <tbody>
                  {drillDownRecords.map((r, idx) => (
                    <tr key={idx} className="border-t border-[var(--color-border)]/50 hover:bg-[var(--color-bg)]/50">
                      <td className="px-4 py-2 text-xs text-slate-400">{idx + 1}</td>
                      <td className="px-4 py-2 text-xs font-bold">{r.dispense_month || r.month || '-'}</td>
                      {activeReport === 'drugs' && <><td className="px-4 py-2 text-center text-xs">{r.quantity?.toLocaleString()}</td><td className="px-4 py-2 text-center text-xs">{r.cases_count}</td></>}
                      {activeReport === 'insulin' && <><td className="px-4 py-2 text-center text-xs">{r.quantity?.toLocaleString()}</td><td className="px-4 py-2 text-center text-xs">{r.cases_count}</td></>}
                      {activeReport === 'supplies' && <><td className="px-4 py-2 text-center text-xs">{r.consumer_value?.toLocaleString()}</td><td className="px-4 py-2 text-center text-xs">{r.collective_entities_value?.toLocaleString()}</td></>}
                      <td className="px-4 py-2 text-center text-xs font-black text-cyan-600">{getItemValue(r).toLocaleString()} ج.م</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {drillDownItem && drillDownRecords.length === 0 && (
          <p className="text-center text-sm text-slate-400 py-8">لا توجد سجلات تفصيلية لهذا العنصر</p>
        )}
      </Modal>

      {data.length === 0 && !loading && (
        <Card className="p-40 border-none shadow-xl text-center flex flex-col items-center gap-4 bg-[var(--color-bg-card)]">
          <Clock size={64} className="text-slate-200" />
          <p className="font-bold text-slate-400">بانتظار ضبط النطاق الزمني وتوليد التحليل...</p>
        </Card>
      )}
    </div>
  );
};

export default TemporalAnalysisHub;
