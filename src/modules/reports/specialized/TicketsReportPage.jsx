import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import HierarchySelector from '../../../components/common/HierarchySelector';
import Card from '../../../components/ui/Card';
import Pagination from '../../../components/ui/Pagination';
import ExportMenu from '../../../components/ui/ExportMenu';
import { useToast } from '../../../components/ui/Toast';
import { useGlobalApp } from '../../../context/useGlobalApp';
import invoke from '../../../api/tauriApi';
import { 
  ClipboardList, Search, Clock, Building2, HelpCircle, Layers,
  Hash, BarChart3, TrendingUp, Filter, Sun, Moon, ListFilter,
  PieChart as PieChartIcon, BarChart as BarChartIcon, Baby, GraduationCap, Calculator,
  ChevronDown, ChevronRight
} from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend,
  Cell, PieChart, Pie, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import PrintableTable from '../../../components/common/PrintableTable';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import useReportSignatures from '../../../hooks/useReportSignatures';
import { exportMultiSheetExcel, exportToWord, exportToPDF } from '../../../utils/exportUtils';
import { toPng } from 'html-to-image';

const PERIOD_FILTERS = [
  { key: 'all', label: 'الكل', icon: Layers },
  { key: 'صباحي', label: 'صباحي', icon: Sun },
  { key: 'مسائي', label: 'مسائي', icon: Moon },
  { key: 'موحد', label: 'موحد', icon: ListFilter },
];

const TABLE_VIEW_MODES = [
  { key: 'all', label: 'الكل', icon: Layers, color: 'bg-[var(--color-primary)]' },
  { key: 'owned', label: 'مملوكة', icon: Building2, color: 'bg-[var(--color-primary)]' },
  { key: 'supported', label: 'مدعومة', icon: HelpCircle, color: 'bg-emerald-500' },
];

const categories = ["هيئة", "طلاب", "رضع"];

const TicketsReportPage = () => {
  const toast = useToast();
  const { activeHierarchy, workspaceMode, hierarchyNames } = useGlobalApp();
  const { signatures } = useReportSignatures();
  const [, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [prevData, setPrevData] = useState([]);
  const [hierarchy, setHierarchy] = useState({ 
    branchId: activeHierarchy.branchId || '', 
    areaId: activeHierarchy.areaId || '', 
    clinicId: activeHierarchy.clinicId || '', 
    dispenseMonth: activeHierarchy.dispenseMonth || new Date().toISOString().substring(0, 7) 
  });
  const [chartType, setChartType] = useState('bar');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [tableViewMode, setTableViewMode] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPageOwned, setCurrentPageOwned] = useState(1);
  const [currentPageSupported, setCurrentPageSupported] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  const [expandedOwnedAreas, setExpandedOwnedAreas] = useState({});
  const [expandedSupportedAreas, setExpandedSupportedAreas] = useState({});
  const toggleOwnedArea = (areaName) => setExpandedOwnedAreas(p => ({ ...p, [areaName]: !p[areaName] }));
  const toggleSupportedArea = (areaName) => setExpandedSupportedAreas(p => ({ ...p, [areaName]: !p[areaName] }));

  const chartRef = useRef(null);

  const handleFetch = async () => {
    if (!hierarchy.branchId) {
      setData([]);
      setPrevData([]);
      return;
    }
    setLoading(true);
    try {
      const currentMonthDate = new Date(hierarchy.dispenseMonth + '-01');
      currentMonthDate.setMonth(currentMonthDate.getMonth() - 1);
      const prevMonthStr = currentMonthDate.toISOString().substring(0, 7);

      const [records, prevRecords] = await Promise.all([
        invoke('get_medical_tickets_report', {
          branchId: parseInt(hierarchy.branchId),
          areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispenseMonth: hierarchy.dispenseMonth
        }),
        invoke('get_medical_tickets_report', {
          branchId: parseInt(hierarchy.branchId),
          areaId: hierarchy.areaId ? parseInt(hierarchy.areaId) : null,
          clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId) : null,
          dispenseMonth: prevMonthStr
        }).catch(() => []) // Fallback safely
      ]);
      setData(records);
      setPrevData(prevRecords);
    } catch (err) {
      toast.error(`خطأ: ${err}`);
    } finally {
      setLoading(false);
    }
  };

   
  useEffect(() => {
    handleFetch();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hierarchy.branchId, hierarchy.areaId, hierarchy.clinicId, hierarchy.dispenseMonth]);

  useEffect(() => {
    setCurrentPageOwned(1);
    setCurrentPageSupported(1);
  }, [searchTerm, periodFilter]);

  // Filter data by period, view mode, and search term
  const filteredData = useMemo(() => {
    let result = data;
    
    if (periodFilter !== 'all') {
      result = result.filter(r => r.period === periodFilter);
    }
    
    if (tableViewMode === 'owned') {
      result = result.filter(r => !(r.is_supported_clinic === 1 || r.is_supported_clinic === true));
    } else if (tableViewMode === 'supported') {
      result = result.filter(r => (r.is_supported_clinic === 1 || r.is_supported_clinic === true));
    }

    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(r => {
        const name = r.clinic_name || r.area_name || r.branch_name || "جهة غير محددة";
        return name.toLowerCase().includes(lowerSearch);
      });
    }

    return result;
  }, [data, periodFilter, tableViewMode, searchTerm]);

  // Aggregation logic matching the transaction page
  const getAggregatedData = (supported) => {
    let filtered = filteredData.filter(
      (r) => r.is_supported_clinic === (supported ? 1 : 0) || r.is_supported_clinic === supported,
    );

    if (hierarchy.areaId) {
      filtered = filtered.filter(r => r.area_id?.toString() === hierarchy.areaId.toString());
    }
    if (hierarchy.clinicId) {
      filtered = filtered.filter(r => r.clinic_id?.toString() === hierarchy.clinicId.toString());
    }

    const getGroupKey = (r) => {
      if (r.clinic_id) return `clinic_${r.clinic_id}`;
      if (r.area_id) return `area_${r.area_id}`;
      return `branch_${r.branch_id}`;
    };

    const groupKeys = [...new Set(filtered.map(getGroupKey))];

    if (!supported) {
      return groupKeys.flatMap((key) => {
        const levelRecords = filtered.filter((r) => getGroupKey(r) === key);
        const name = levelRecords[0]?.clinic_name || levelRecords[0]?.area_name || levelRecords[0]?.branch_name || "جهة غير محددة";
        const cats = [...new Set(levelRecords.map((r) => r.category))];

        return cats.map((cat) => {
          const catRecords = levelRecords.filter((r) => r.category === cat);
          const areaName = levelRecords[0]?.area_name || "منطقة غير محددة";
          const rowData = { id: key, name, areaName, category: cat, total_56b: 0, total_56c: 0 };
          [1, 2, 3, 4].forEach((w) => {
            const weekRecs = catRecords.filter((r) => r.week_number === w);
            const w56b = weekRecs.reduce((sum, r) => sum + r.ticket_56b_count, 0);
            const w56c = weekRecs.reduce((sum, r) => sum + r.ticket_56c_count, 0);
            rowData[`w${w}_56b`] = w56b || "-";
            rowData[`w${w}_56c`] = w56c || "-";
            rowData.total_56b += w56b;
            rowData.total_56c += w56c;
          });
          return rowData;
        });
      });
    } else {
      return groupKeys.map((key) => {
        const levelRecords = filtered.filter((r) => getGroupKey(r) === key);
        const name = levelRecords[0]?.clinic_name || levelRecords[0]?.area_name || levelRecords[0]?.branch_name || "جهة غير محددة";
        const areaName = levelRecords[0]?.area_name || "منطقة غير محددة";
        const rowData = { id: key, name, areaName, total: 0 };

        [1, 2, 3, 4].forEach((w) => {
          const weekRecs = levelRecords.filter((r) => r.week_number === w);
          categories.forEach((cat) => {
            const catRecs = weekRecs.filter((r) => r.category === cat);
            const sum = catRecs.reduce((acc, curr) => acc + curr.ticket_56b_count + curr.ticket_56c_count, 0);
            rowData[`w${w}_${cat}`] = sum || "-";
            rowData.total += sum;
            rowData[`total_${cat}`] = (rowData[`total_${cat}`] || 0) + sum;
          });
        });
        return rowData;
      });
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const getProcessedData = (supported) => {
    const rawData = getAggregatedData(supported);
    // searchTerm is already applied to filteredData, but we can safely filter again or just use rawData directly
    // since rawData is built from filteredData.
    let filtered = rawData; 
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

  // Stats
  const stats = useMemo(() => {
    const s = {
      total56b: 0, total56c: 0,
      ownedTotal: 0, supportedTotal: 0,
      supportedHayaa: 0, supportedTullab: 0, supportedRudda3: 0,
      ownedHayaa56b: 0, ownedHayaa56c: 0,
      ownedTullab56b: 0, ownedTullab56c: 0,
      ownedRudda356b: 0, ownedRudda356c: 0,
      ownedWoman56b: 0, ownedWoman56c: 0,
      periodStats: {},
      categoryStats: {},
      weeklyBreakdown: [0, 0, 0, 0],
    };
    filteredData.forEach(r => {
      const total = r.ticket_56b_count + r.ticket_56c_count;
      
      if (r.is_supported_clinic === 1 || r.is_supported_clinic === true) {
        s.supportedTotal += total;
        if (r.category === 'هيئة') s.supportedHayaa += total;
        if (r.category === 'طلاب') s.supportedTullab += total;
        if (r.category === 'رضع') s.supportedRudda3 += total;
      } else {
        s.ownedTotal += total;
        s.total56b += r.ticket_56b_count;
        s.total56c += r.ticket_56c_count;
        
        if (r.category === 'هيئة') {
          s.ownedHayaa56b += r.ticket_56b_count;
          s.ownedHayaa56c += r.ticket_56c_count;
        }
        if (r.category === 'طلاب') {
          s.ownedTullab56b += r.ticket_56b_count;
          s.ownedTullab56c += r.ticket_56c_count;
        }
        if (r.category === 'رضع') {
          s.ownedRudda356b += r.ticket_56b_count;
          s.ownedRudda356c += r.ticket_56c_count;
        }
        if (r.category === 'المرأة المعيلة') {
          s.ownedWoman56b += r.ticket_56b_count;
          s.ownedWoman56c += r.ticket_56c_count;
        }
      }

      // Period stats
      if (!s.periodStats[r.period]) s.periodStats[r.period] = 0;
      s.periodStats[r.period] += total;

      // Category stats
      if (!s.categoryStats[r.category]) s.categoryStats[r.category] = 0;
      s.categoryStats[r.category] += total;

      // Weekly
      if (r.week_number >= 1 && r.week_number <= 4) {
        s.weeklyBreakdown[r.week_number - 1] += total;
      }
    });
    return s;
  }, [filteredData]);

  const prevStats = useMemo(() => {
    const s = {
      total56b: 0, total56c: 0,
      ownedTotal: 0, supportedTotal: 0,
    };
    prevData.forEach(r => {
      if (periodFilter !== 'all' && r.period !== periodFilter) return;
      if (tableViewMode === 'owned' && (r.is_supported_clinic === 1 || r.is_supported_clinic === true)) return;
      if (tableViewMode === 'supported' && !(r.is_supported_clinic === 1 || r.is_supported_clinic === true)) return;

      const total = r.ticket_56b_count + r.ticket_56c_count;
      if (r.is_supported_clinic === 1 || r.is_supported_clinic === true) {
        s.supportedTotal += total;
      } else {
        s.ownedTotal += total;
        s.total56b += r.ticket_56b_count;
        s.total56c += r.ticket_56c_count;
      }
    });
    return s;
  }, [prevData, periodFilter, tableViewMode]);

  const calculateTrend = (current, previous) => {
    if (!previous || previous === 0) return null;
    const diff = current - previous;
    const percent = Math.round((diff / previous) * 100);
    return {
      value: percent,
      isPositive: percent > 0,
      isNeutral: percent === 0
    };
  };

  // Chart data
  const weeklyChartData = useMemo(() => [
    { name: 'الأسبوع 1', مملوكة: 0, مدعومة: 0 },
    { name: 'الأسبوع 2', مملوكة: 0, مدعومة: 0 },
    { name: 'الأسبوع 3', مملوكة: 0, مدعومة: 0 },
    { name: 'الأسبوع 4', مملوكة: 0, مدعومة: 0 },
  ].map((item, idx) => {
    filteredData.forEach(r => {
      if (r.week_number === idx + 1) {
        const total = r.ticket_56b_count + r.ticket_56c_count;
        if (r.is_supported_clinic === 1 || r.is_supported_clinic === true) {
          item.مدعومة += total;
        } else {
          item.مملوكة += total;
        }
      }
    });
    return item;
  }), [filteredData]);

  const categoryChartData = useMemo(() => 
    Object.entries(stats.categoryStats).map(([name, value]) => ({ name, value })),
  [stats]);

  const periodChartData = useMemo(() => 
    Object.entries(stats.periodStats).map(([name, value]) => ({ name, value })),
  [stats]);

  // Export columns for owned
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

  // Export columns for supported
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const supportedExportColumns = [
    { header: "العيادة/الجهة", accessor: "name" },
    ...([1, 2, 3, 4].flatMap(w => categories.map(c => ({ header: `أسبوع ${w} - ${c}`, accessor: `w${w}_${c}` })))),
    ...categories.map(c => ({ header: `إجمالي ${c}`, accessor: `total_${c}` })),
    { header: "الإجمالي العام", accessor: "total" },
  ];

  const handlePremiumExport = async (type, { data: exportData, columns, options }) => {
    try {
      let chartImage = null;
      if (chartRef.current) {
        try {
          chartImage = await toPng(chartRef.current, { quality: 0.85, pixelRatio: 1, backgroundColor: '#ffffff' });
        } catch (chartErr) {
          console.warn('Failed to capture chart image for export:', chartErr);
        }
      }
      const enrichedOptions = { ...options, chartImage };

      // Build multi-table config for Word/PDF so both owned and supported
      // tables are included regardless of the current tableViewMode.
      const ownedData = getProcessedData(false).allData;
      const supportedData = getProcessedData(true).allData;
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
        
        const globalOptions = {
          fileName: `tickets_report_${hierarchy.dispenseMonth}`,
          title: 'تقرير التذاكر الطبية',
          summaryData: {
            headers: ['الإحصائية', 'القيمة'],
            rows: [
              ['إجمالي تذاكر 56ب', stats.total56b.toLocaleString()],
              ['إجمالي تذاكر 56ج', stats.total56c.toLocaleString()],
              ['المجموع الكلي', (stats.total56b + stats.total56c).toLocaleString()],
              ['تذاكر مملوكة', stats.ownedTotal.toLocaleString()],
              ['تذاكر مدعومة', stats.supportedTotal.toLocaleString()],
            ]
          }
        };
        await exportMultiSheetExcel(sheetsData, globalOptions);
        toast.success('تم تصدير Excel بنجاح');
        return true;
      }
      if (type === 'word') { await exportToWord(exportData, columns, wordPdfOptions); toast.success('تم تصدير Word بنجاح'); return true; }
      if (type === 'pdf') { await exportToPDF(exportData, columns, wordPdfOptions); toast.success('تم تصدير PDF بنجاح'); return true; }
      return false;
    } catch (err) { console.error(err); return false; }
  };

  const grandTotal = stats.total56b + stats.total56c + stats.supportedTotal; // Grand total including supported

   
  const exportProps = useMemo(() => {
    if (tableViewMode === 'supported') {
      return { data: getProcessedData(true).allData, columns: supportedExportColumns };
    }
    return { data: getProcessedData(false).allData, columns: ownedExportColumns };
  }, [tableViewMode, getProcessedData, ownedExportColumns, supportedExportColumns]);

  const renderOwnedRows = () => {
    const paginatedData = getProcessedData(false).data;
    if (paginatedData.length === 0) return <tr><td colSpan={13} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات حالياً</td></tr>;
    
    const grouped = {};
    paginatedData.forEach(row => {
      const area = row.areaName || "منطقة غير محددة";
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(row);
    });
    
    let rows = [];
    let index = 1;
    const baseIndex = (currentPageOwned - 1) * rowsPerPage;

    Object.entries(grouped).forEach(([areaName, clinics]) => {
      const isExpanded = expandedOwnedAreas[areaName];
      
      const areaTotals = { total_56b: 0, total_56c: 0, w1_56b: 0, w1_56c: 0, w2_56b: 0, w2_56c: 0, w3_56b: 0, w3_56c: 0, w4_56b: 0, w4_56c: 0 };
      clinics.forEach(r => {
        areaTotals.total_56b += r.total_56b || 0;
        areaTotals.total_56c += r.total_56c || 0;
        [1,2,3,4].forEach(w => {
          areaTotals[`w${w}_56b`] += parseInt(r[`w${w}_56b`]) || 0;
          areaTotals[`w${w}_56c`] += parseInt(r[`w${w}_56c`]) || 0;
        });
      });

      rows.push(
        <tr key={`area_${areaName}`} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleOwnedArea(areaName)}>
          <td className="p-4 text-center">
            {isExpanded ? <ChevronDown size={16} className="inline text-slate-500" /> : <ChevronRight size={16} className="inline text-slate-500" />}
          </td>
          <td className="p-4 font-black text-slate-700" colSpan={2}>{areaName}</td>
          {[1,2,3,4].map(w => (
            <React.Fragment key={`area_${areaName}_w${w}`}>
              <td className="p-4 text-center font-bold">{areaTotals[`w${w}_56b`]}</td>
              <td className="p-4 text-center font-bold">{areaTotals[`w${w}_56c`]}</td>
            </React.Fragment>
          ))}
          <td className="p-4 text-center font-black text-blue-600 bg-blue-50/50">{areaTotals.total_56b}</td>
          <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/50">{areaTotals.total_56c}</td>
        </tr>
      );

      if (isExpanded) {
        clinics.forEach(row => {
          rows.push(
            <tr key={row.id + "_" + row.category} className="hover:bg-[var(--color-primary)]/5 transition-colors text-[var(--color-text)]">
              <td className="p-4 text-center opacity-50">{baseIndex + index}</td>
              <td className="p-4 font-black pl-8">{row.name}</td>
              <td className="p-4 font-bold text-[var(--color-primary)]">{row.category}</td>
              {[1,2,3,4].map(w => (
                <React.Fragment key={`${row.id}_w${w}`}>
                  <td className="p-4 text-center border-x font-mono">{row[`w${w}_56b`]}</td>
                  <td className="p-4 text-center border-x font-mono">{row[`w${w}_56c`]}</td>
                </React.Fragment>
              ))}
              <td className="p-4 text-center bg-[var(--color-primary)]/5 font-black text-[var(--color-primary)]">{row.total_56b}</td>
              <td className="p-4 text-center bg-[var(--color-primary)]/5 font-black text-[var(--color-primary)]">{row.total_56c}</td>
            </tr>
          );
          index++;
        });
      } else {
        index += clinics.length;
      }
    });
    return rows;
  };

  const renderSupportedRows = () => {
    const paginatedData = getProcessedData(true).data;
    if (paginatedData.length === 0) return <tr><td colSpan={18} className="p-8 text-center text-slate-500 font-bold">لا توجد سجلات حالياً</td></tr>;
    
    const grouped = {};
    paginatedData.forEach(row => {
      const area = row.areaName || "منطقة غير محددة";
      if (!grouped[area]) grouped[area] = [];
      grouped[area].push(row);
    });
    
    let rows = [];
    let index = 1;
    const baseIndex = (currentPageSupported - 1) * rowsPerPage;

    Object.entries(grouped).forEach(([areaName, clinics]) => {
      const isExpanded = expandedSupportedAreas[areaName];
      
      const areaTotals = {
        w1_هيئة: 0, w1_طلاب: 0, w1_رضع: 0,
        w2_هيئة: 0, w2_طلاب: 0, w2_رضع: 0,
        w3_هيئة: 0, w3_طلاب: 0, w3_رضع: 0,
        w4_هيئة: 0, w4_طلاب: 0, w4_رضع: 0,
        total_هيئة: 0, total_طلاب: 0, total_رضع: 0,
        total: 0
      };
      
      clinics.forEach(r => {
        areaTotals.total += r.total || 0;
        categories.forEach(cat => {
          areaTotals[`total_${cat}`] += parseInt(r[`total_${cat}`]) || 0;
          [1,2,3,4].forEach(w => {
            areaTotals[`w${w}_${cat}`] += parseInt(r[`w${w}_${cat}`]) || 0;
          });
        });
      });

      rows.push(
        <tr key={`s_area_${areaName}`} className="bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => toggleSupportedArea(areaName)}>
          <td className="p-4 text-center">
            {isExpanded ? <ChevronDown size={16} className="inline text-slate-500" /> : <ChevronRight size={16} className="inline text-slate-500" />}
          </td>
          <td className="p-4 font-black text-slate-700">{areaName}</td>
          {[1,2,3,4].map(w => (
            <React.Fragment key={`s_area_${areaName}_w${w}`}>
              <td className="p-4 text-center font-bold text-slate-500/80">{areaTotals[`w${w}_هيئة`]}</td>
              <td className="p-4 text-center font-bold text-slate-500/80">{areaTotals[`w${w}_طلاب`]}</td>
              <td className="p-4 text-center font-bold text-slate-500/80">{areaTotals[`w${w}_رضع`]}</td>
            </React.Fragment>
          ))}
          <td className="p-4 text-center font-black text-blue-600 bg-blue-50/50">{areaTotals.total_هيئة}</td>
          <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/50">{areaTotals.total_طلاب}</td>
          <td className="p-4 text-center font-black text-amber-600 bg-amber-50/50">{areaTotals.total_رضع}</td>
          <td className="p-4 text-center font-black bg-[var(--color-primary)]/10 text-[var(--color-primary)]">{areaTotals.total}</td>
        </tr>
      );

      if (isExpanded) {
        clinics.forEach(row => {
          rows.push(
            <tr key={row.id} className="hover:bg-[var(--color-primary)]/5 transition-colors text-[var(--color-text)]">
              <td className="p-4 text-center opacity-50">{baseIndex + index}</td>
              <td className="p-4 font-black pl-8">{row.name}</td>
              {[1,2,3,4].map(w => (
                <React.Fragment key={`${row.id}_w${w}`}>
                  <td className="p-4 text-center border-x font-mono">{row[`w${w}_هيئة`]}</td>
                  <td className="p-4 text-center border-x font-mono">{row[`w${w}_طلاب`]}</td>
                  <td className="p-4 text-center border-x font-mono">{row[`w${w}_رضع`]}</td>
                </React.Fragment>
              ))}
              <td className="p-4 text-center font-black text-blue-600 bg-blue-50/10">{row.total_هيئة}</td>
              <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/10">{row.total_طلاب}</td>
              <td className="p-4 text-center font-black text-amber-600 bg-amber-50/10">{row.total_رضع}</td>
              <td className="p-4 text-center font-black bg-[var(--color-primary)]/10 text-[var(--color-primary)]">{row.total}</td>
            </tr>
          );
          index++;
        });
      } else {
        index += clinics.length;
      }
    });
    return rows;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <Breadcrumb items={[{ label: 'التقارير' }, { label: 'تقرير التذاكر الطبية' }]} />
      
      <PageHeader 
        title="تقرير التذاكر الطبية" 
        icon={ClipboardList} 
        description="تقرير احترافي شامل لأعداد التذاكر الطبية (56ب، 56ج) — مقسم حسب النوع والأسابيع والفئات مع إمكانية الفلترة بالفترات."
        actions={
          <ExportMenu 
            data={exportProps.data} 
            columns={exportProps.columns} 
            onCustomExport={handlePremiumExport} 
            options={{ title: 'تقرير التذاكر الطبية', fileName: `tickets_report_${hierarchy.dispenseMonth}` }} 
          />
        }
      />

      {/* Filter Card */}
      <Card className="p-6 no-print">
        <div className="w-full">
          <HierarchySelector 
            onSelectionChange={(d) => setHierarchy(prev => ({ ...prev, ...d }))}
            initialBranch={hierarchy.branchId}
            initialArea={hierarchy.areaId}
            initialClinic={hierarchy.clinicId}
            initialMonth={hierarchy.dispenseMonth}
          />
        </div>
      </Card>

      {/* Stats Cards - Premium Design */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Row 1: 4 Main Stats */}
        <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-2xl p-5 shadow-xl shadow-blue-600/20">
          <div className="absolute top-0 left-0 w-20 h-20 bg-white/10 rounded-full -translate-x-8 -translate-y-8" />
          <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">تذاكر 56ب</p>
          <div className="flex justify-between items-end">
            <h2 className="text-3xl font-black">{stats.total56b.toLocaleString()}</h2>
            {(() => {
              const trend = calculateTrend(stats.total56b, prevStats.total56b);
              if (!trend) return null;
              return (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full w-fit ${trend.isPositive ? 'bg-emerald-500/20 text-emerald-100' : trend.isNeutral ? 'bg-white/10 text-white/70' : 'bg-red-500/20 text-red-100'}`}>
                  {trend.isPositive ? <TrendingUp size={12} /> : trend.isNeutral ? '-' : <TrendingUp size={12} className="rotate-180" />}
                  <span dir="ltr">{Math.abs(trend.value)}%</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-emerald-600 to-emerald-700 text-white rounded-2xl p-5 shadow-xl shadow-emerald-600/20">
          <div className="absolute top-0 left-0 w-20 h-20 bg-white/10 rounded-full -translate-x-8 -translate-y-8" />
          <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">تذاكر 56ج</p>
          <div className="flex justify-between items-end">
            <h2 className="text-3xl font-black">{stats.total56c.toLocaleString()}</h2>
            {(() => {
              const trend = calculateTrend(stats.total56c, prevStats.total56c);
              if (!trend) return null;
              return (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full w-fit ${trend.isPositive ? 'bg-emerald-500/20 text-emerald-100' : trend.isNeutral ? 'bg-white/10 text-white/70' : 'bg-red-500/20 text-red-100'}`}>
                  {trend.isPositive ? <TrendingUp size={12} /> : trend.isNeutral ? '-' : <TrendingUp size={12} className="rotate-180" />}
                  <span dir="ltr">{Math.abs(trend.value)}%</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-2xl p-5 shadow-xl shadow-violet-600/20">
          <div className="absolute top-0 left-0 w-20 h-20 bg-white/10 rounded-full -translate-x-8 -translate-y-8" />
          <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">المجموع الكلي للكل</p>
          <div className="flex justify-between items-end">
            <h2 className="text-3xl font-black">{grandTotal.toLocaleString()}</h2>
            {(() => {
              const prevGrandTotal = prevStats.total56b + prevStats.total56c + prevStats.supportedTotal;
              const trend = calculateTrend(grandTotal, prevGrandTotal);
              if (!trend) return null;
              return (
                <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full w-fit ${trend.isPositive ? 'bg-emerald-500/20 text-emerald-100' : trend.isNeutral ? 'bg-white/10 text-white/70' : 'bg-red-500/20 text-red-100'}`}>
                  {trend.isPositive ? <TrendingUp size={12} /> : trend.isNeutral ? '-' : <TrendingUp size={12} className="rotate-180" />}
                  <span dir="ltr">{Math.abs(trend.value)}%</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-700 to-slate-800 text-white rounded-2xl p-5 shadow-xl shadow-slate-700/20">
          <div className="absolute top-0 left-0 w-20 h-20 bg-white/10 rounded-full -translate-x-8 -translate-y-8" />
          <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">عدد الجهات المدخلة</p>
          <h2 className="text-3xl font-black">{getProcessedData(false).allData.length + getProcessedData(true).allData.length}</h2>
          <p className="text-[9px] mt-1 opacity-60">{getProcessedData(false).allData.length} مملوكة · {getProcessedData(true).allData.length} مدعومة</p>
        </div>

        {/* Row 2: Detailed Breakdowns */}
        <div className="lg:col-span-2 relative overflow-hidden bg-gradient-to-br from-cyan-600 to-cyan-700 text-white rounded-2xl p-5 shadow-xl shadow-cyan-600/20">
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full -translate-x-12 -translate-y-12" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">العيادات المملوكة</p>
              <h2 className="text-3xl font-black mb-3">{stats.ownedTotal.toLocaleString()}</h2>
            </div>
            <Building2 size={40} className="opacity-20" />
          </div>
          <div className="flex gap-2 text-[10px] font-bold p-2 rounded-xl border border-white/10 text-center divide-x divide-x-reverse divide-white/10 bg-black/20">
            <div className="flex-1 px-1">
              <span className="block text-sm mb-1 text-blue-200">هيئة</span>
              <div className="flex justify-between opacity-80 text-[10px]">
                <span>56ب: {stats.ownedHayaa56b.toLocaleString()}</span>
                <span>56ج: {stats.ownedHayaa56c.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex-1 px-1">
              <span className="block text-sm mb-1 text-emerald-200">طلاب</span>
              <div className="flex justify-between opacity-80 text-[10px]">
                <span>56ب: {stats.ownedTullab56b.toLocaleString()}</span>
                <span>56ج: {stats.ownedTullab56c.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex-1 px-1">
              <span className="block text-sm mb-1 text-amber-200">رضع</span>
              <div className="flex justify-between opacity-80 text-[10px]">
                <span>56ب: {stats.ownedRudda356b.toLocaleString()}</span>
                <span>56ج: {stats.ownedRudda356c.toLocaleString()}</span>
              </div>
            </div>
            <div className="flex-1 px-1">
              <span className="block text-sm mb-1 text-fuchsia-200">مرأة معيلة</span>
              <div className="flex justify-between opacity-80 text-[10px]">
                <span>56ب: {stats.ownedWoman56b.toLocaleString()}</span>
                <span>56ج: {stats.ownedWoman56c.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 relative overflow-hidden bg-gradient-to-br from-amber-500 to-amber-600 text-white rounded-2xl p-5 shadow-xl shadow-amber-500/20">
          <div className="absolute top-0 left-0 w-32 h-32 bg-white/10 rounded-full -translate-x-12 -translate-y-12" />
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] opacity-70 font-bold uppercase tracking-wider mb-1">العيادات المدعومة</p>
              <h2 className="text-3xl font-black mb-3">{stats.supportedTotal.toLocaleString()}</h2>
            </div>
            <HelpCircle size={40} className="opacity-20" />
          </div>
          <div className="flex gap-4 text-xs font-bold bg-black/20 p-3 rounded-xl border border-white/10">
            <div className="flex-1 text-center">
              <span className="block text-[10px] text-blue-200 mb-1">هيئة</span>
              <span className="text-lg">{stats.supportedHayaa.toLocaleString()}</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex-1 text-center">
              <span className="block text-[10px] text-emerald-200 mb-1">طلاب</span>
              <span className="text-lg">{stats.supportedTullab.toLocaleString()}</span>
            </div>
            <div className="w-px bg-white/10" />
            <div className="flex-1 text-center">
              <span className="block text-[10px] text-amber-200 mb-1">رضع</span>
              <span className="text-lg">{stats.supportedRudda3.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Period Distribution Cards */}
      {filteredData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 no-print">
          {Object.entries(stats.periodStats).map(([period, val]) => (
            <div key={period} className="bg-[var(--color-bg-card)] p-4 rounded-2xl border border-[var(--color-border)] flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${period === 'صباحي' ? 'bg-amber-50 text-amber-600' : period === 'مسائي' ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-50 text-cyan-600'}`}>
                    {period === 'صباحي' ? <Sun size={20} /> : period === 'مسائي' ? <Moon size={20} /> : <Clock size={20} />}
                  </div>
                  <div>
                    <span className="font-bold text-[var(--color-text)]">{period}</span>
                    <p className="text-[9px] text-[var(--color-text-muted)]">{grandTotal > 0 ? `${((val / grandTotal) * 100).toFixed(1)}%` : '0%'}</p>
                  </div>
               </div>
               <span className="text-xl font-black text-[var(--color-primary)]">{val.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}

      {/* Weekly Breakdown Cards */}
      {filteredData.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 no-print">
          {['الأول', 'الثاني', 'الثالث', 'الرابع'].map((label, idx) => (
            <div key={idx} className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-black text-[var(--color-text-muted)]">الأسبوع {label}</span>
                <span className="text-lg font-black text-[var(--color-primary)]">{stats.weeklyBreakdown[idx].toLocaleString()}</span>
              </div>
              <div className="w-full h-2 bg-[var(--color-bg)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-l from-[var(--color-primary)] to-blue-400 rounded-full transition-all duration-700"
                  style={{ width: `${grandTotal > 0 ? (stats.weeklyBreakdown[idx] / grandTotal) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Charts Section */}
      {filteredData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 no-print">
          <Card className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-md">
            <h3 className="text-sm font-bold text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
              <PieChartIcon size={16} />
              <span>مقارنة 56ب مقابل 56ج (مملوكة)</span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'تذاكر 56ب', value: stats.total56b, color: '#2563eb' },
                      { name: 'تذاكر 56ج', value: stats.total56c, color: '#059669' }
                    ]}
                    cx="50%" cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {[
                      { name: 'تذاكر 56ب', value: stats.total56b, color: '#2563eb' },
                      { name: 'تذاكر 56ج', value: stats.total56c, color: '#059669' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
          
          <Card className="p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-md">
            <h3 className="text-sm font-bold text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
              <PieChartIcon size={16} />
              <span>فئات العيادات المدعومة</span>
            </h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'هيئة', value: stats.supportedHayaa, color: '#3b82f6' },
                      { name: 'طلاب', value: stats.supportedTullab, color: '#10b981' },
                      { name: 'رضع', value: stats.supportedRudda3, color: '#f59e0b' }
                    ]}
                    cx="50%" cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {[
                      { name: 'هيئة', value: stats.supportedHayaa, color: '#3b82f6' },
                      { name: 'طلاب', value: stats.supportedTullab, color: '#10b981' },
                      { name: 'رضع', value: stats.supportedRudda3, color: '#f59e0b' }
                    ].map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>
      )}

      {/* Filter & View Controls */}
      <Card className="no-print p-4 bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-md flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-4 w-full">
          {/* Search */}
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

          {/* Period Filter */}
          <div className="flex items-center gap-2 pl-4 border-r border-[var(--color-border)]">
            <Filter size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-xs font-black text-[var(--color-text-muted)]">الفترة:</span>
            <div className="flex p-1 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
              {PERIOD_FILTERS.map(pf => (
                <button
                  key={pf.key}
                  onClick={() => setPeriodFilter(pf.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                    periodFilter === pf.key 
                      ? 'bg-[var(--color-primary)] text-white shadow-md' 
                      : 'opacity-60 hover:opacity-100 text-[var(--color-text)]'
                  }`}
                >
                  <pf.icon size={12} />
                  {pf.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table View Mode */}
        <div className="flex items-center gap-2 pt-2 border-t border-[var(--color-border)]">
          <span className="text-xs font-black opacity-60">عرض السجلات:</span>
          <div className="flex p-1 bg-[var(--color-bg)] rounded-xl border border-[var(--color-border)]">
            {TABLE_VIEW_MODES.map(mode => (
              <button
                key={mode.key}
                onClick={() => setTableViewMode(mode.key)}
                className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                  tableViewMode === mode.key 
                    ? `${mode.color} text-white shadow-md` 
                    : 'opacity-60 hover:opacity-100'
                }`}
              >
                <mode.icon size={14} />
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* === TABLES === */}
      <div className="space-y-8">

        {/* Owned Clinics Table */}
        {(tableViewMode === 'all' || tableViewMode === 'owned') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-sm font-black text-[var(--color-primary)]">
            <Building2 size={18} />
            <span>سجلات العيادات المملوكة</span>
            <span className="text-xs font-bold text-[var(--color-text-muted)] mr-2">({getProcessedData(false).totalCount} سجل)</span>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <tr className="text-[var(--color-text)] font-black uppercase">
                    <th className="p-4 w-12 text-center">#</th>
                    <th className="p-4">العيادة</th>
                    <th className="p-4">الصنف</th>
                    <th className="p-4 text-center border-x border-[var(--color-border)]" colSpan={2}>الأول</th>
                    <th className="p-4 text-center border-x border-[var(--color-border)]" colSpan={2}>الثاني</th>
                    <th className="p-4 text-center border-x border-[var(--color-border)]" colSpan={2}>الثالث</th>
                    <th className="p-4 text-center border-x border-[var(--color-border)]" colSpan={2}>الرابع</th>
                    <th className="p-4 text-center bg-[var(--color-primary)]/5" colSpan={2}>الإجمالي</th>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {renderOwnedRows()}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--color-bg)] border-t-2 border-[var(--color-border)] font-bold text-[var(--color-text)]">
                    <td colSpan="3" className="p-4 text-right">
                      الإجمالي ({getProcessedData(false).totalCount} سجل):
                    </td>
                    {[1, 2, 3, 4].map((w) => {
                      const allData = getProcessedData(false).allData;
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
                      {getProcessedData(false).allData.reduce((s, r) => s + (parseInt(r.total_56b) || 0), 0)}
                    </td>
                    <td className="p-4 text-center bg-[var(--color-primary)]/10 font-black text-[var(--color-primary)]">
                      {getProcessedData(false).allData.reduce((s, r) => s + (parseInt(r.total_56c) || 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination
              currentPage={currentPageOwned}
              totalPages={getProcessedData(false).totalPages}
              totalRecords={getProcessedData(false).totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPageOwned}
              onRowsPerPageChange={setRowsPerPage}
            />
          </div>

          {/* Print Only Table - Owned */}
          {getProcessedData(false).allData.length > 0 && (
          <PrintableTable
            title="تقرير التذاكر الطبية - العيادات المملوكة"
            subtitle={`شهر ${hierarchy.dispenseMonth}${periodFilter !== 'all' ? ` (${periodFilter})` : ''}`}
            hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
            showSignatures={false}
          >
          <div className="only-print">
            <table className="w-full text-right text-[10px] border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr className="border border-slate-300">
                  <th className="p-2 border border-slate-300">العيادة</th>
                  <th className="p-2 border border-slate-300">الصنف</th>
                  <th className="p-2 border border-slate-300" colSpan={2}>الأول</th>
                  <th className="p-2 border border-slate-300" colSpan={2}>الثاني</th>
                  <th className="p-2 border border-slate-300" colSpan={2}>الثالث</th>
                  <th className="p-2 border border-slate-300" colSpan={2}>الرابع</th>
                  <th className="p-2 border border-slate-300" colSpan={2}>الإجمالي</th>
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
            </table>
          </div>
          </PrintableTable>
          )}
        </div>
        )}

        {/* Supported Clinics Table */}
        {(tableViewMode === 'all' || tableViewMode === 'supported') && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 px-2 text-sm font-black text-emerald-600">
            <HelpCircle size={18} />
            <span>سجلات العيادات المدعومة</span>
            <span className="text-xs font-bold text-[var(--color-text-muted)] mr-2">({getProcessedData(true).totalCount} سجل)</span>
          </div>
          <div className="bg-[var(--color-bg-card)] rounded-2xl border border-[var(--color-border)] shadow-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                  <tr className="text-[var(--color-text)] font-black uppercase">
                    <th className="p-4 w-12 text-center" rowSpan={2}>#</th>
                    <th className="p-4" rowSpan={2}>العيادة</th>
                    <th className="p-4 text-center border-x border-emerald-100" colSpan={3}>الأول</th>
                    <th className="p-4 text-center border-x border-emerald-100" colSpan={3}>الثاني</th>
                    <th className="p-4 text-center border-x border-emerald-100" colSpan={3}>الثالث</th>
                    <th className="p-4 text-center border-x border-emerald-100" colSpan={3}>الرابع</th>
                    <th className="p-4 text-center bg-emerald-100/30" colSpan={4}>الإجمالي العام</th>
                  </tr>
                  <tr className="bg-[var(--color-bg-card)] text-[10px] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                    {[1, 2, 3, 4].map((w) => (
                      <React.Fragment key={`h_${w}`}>
                        <th className="p-2 border-x">هيئة</th>
                        <th className="p-2 border-x">طلاب</th>
                        <th className="p-2 border-x">رضع</th>
                      </React.Fragment>
                    ))}
                    <th className="p-2">هيئة</th>
                    <th className="p-2">طلاب</th>
                    <th className="p-2">رضع</th>
                    <th className="p-2 bg-emerald-100/30">الكل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-emerald-100">
                  {renderSupportedRows()}
                </tbody>
                <tfoot>
                  <tr className="bg-[var(--color-bg)] border-t-2 border-[var(--color-border)] font-bold text-[var(--color-text)]">
                    <td colSpan="2" className="p-4 text-right">
                      الإجمالي ({getProcessedData(true).totalCount} سجل):
                    </td>
                    {[1, 2, 3, 4].map((w) => {
                      const allData = getProcessedData(true).allData;
                      return categories.map((cat) => {
                        const sum = allData.reduce((s, r) => s + (parseInt(r[`w${w}_${cat}`]) || 0), 0);
                        return (
                          <td key={`${w}_${cat}`} className="p-4 text-center border-x font-black">{sum || '-'}</td>
                        );
                      });
                    })}
                    <td className="p-4 text-center font-black text-blue-600 bg-blue-50/10">
                      {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_هيئة) || 0), 0)}
                    </td>
                    <td className="p-4 text-center font-black text-emerald-600 bg-emerald-50/10">
                      {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_طلاب) || 0), 0)}
                    </td>
                    <td className="p-4 text-center font-black text-amber-600 bg-amber-50/10">
                      {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total_رضع) || 0), 0)}
                    </td>
                    <td className="p-4 text-center bg-[var(--color-primary)]/10 font-black text-[var(--color-primary)]">
                      {getProcessedData(true).allData.reduce((s, r) => s + (parseInt(r.total) || 0), 0)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Pagination
              currentPage={currentPageSupported}
              totalPages={getProcessedData(true).totalPages}
              totalRecords={getProcessedData(true).totalCount}
              rowsPerPage={rowsPerPage}
              onPageChange={setCurrentPageSupported}
              onRowsPerPageChange={setRowsPerPage}
            />
          </div>

          {/* Print Only Table - Supported */}
          {getProcessedData(true).allData.length > 0 && (
          <PrintableTable
            title="تقرير التذاكر الطبية - العيادات المدعومة"
            subtitle={`شهر ${hierarchy.dispenseMonth}${periodFilter !== 'all' ? ` (${periodFilter})` : ''}`}
            hierarchyLabel={buildHierarchyLabel(workspaceMode, hierarchyNames)}
            showSignatures={false}
          >
          <div className="only-print mt-8">
            <h3 className="text-center font-bold mb-4">سجلات العيادات المدعومة - {hierarchy.dispenseMonth}{periodFilter !== 'all' ? ` (${periodFilter})` : ''}</h3>
            <table className="w-full text-right text-[10px] border-collapse border border-slate-300">
              <thead className="bg-slate-100">
                <tr className="border border-slate-300">
                  <th className="p-2 border border-slate-300" rowSpan={2}>العيادة</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الأول</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الثاني</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الثالث</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={3}>الرابع</th>
                  <th className="p-2 border border-slate-300 text-center" colSpan={4}>الإجمالي</th>
                </tr>
                <tr className="border border-slate-300">
                  {[1,2,3,4].map(w => categories.map(c => <th key={`${w}${c}`} className="p-1 border border-slate-300">{c}</th>))}
                  {categories.map(c => <th key={c} className="p-1 border border-slate-300">{c}</th>)}
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
            </table>
          </div>
          </PrintableTable>
          )}
        </div>
        )}
      </div>

      {/* ── Print Footer — Unified Signatures (shows only at end in print) ── */}
      <div className="only-print print-footer-signatures print-footer-unified" style={{
        display: 'flex',
        justifyContent: 'space-between',
        textAlign: 'center',
        marginTop: '24px',
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
          </p>            <p style={{ fontSize: '9px', color: '#475569', fontWeight: 600, marginTop: '12px' }}>
              التاريخ: {new Date().toLocaleDateString('ar-EG')}
            </p>
          </div>
        </div>
        {/* Stamp line — full width below the 3 columns */}
        <div className="only-print" style={{ textAlign: 'center', marginTop: '16px', paddingTop: '8px', borderTop: '1px dashed #cbd5e1' }}>
          <p style={{ fontSize: '9px', color: '#94a3b8' }}>
            ختم الإدارة: ........................................................
          </p>
        </div>

      {/* Charts Section */}
      {filteredData.length > 0 && (
        <Card className="p-6 mt-6 shadow-xl border-none no-print">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h3 className="font-bold text-lg flex items-center gap-2"><BarChart3 className="text-[var(--color-primary)]" size={24} /> تحليل التذاكر البياني</h3>
            <div className="flex gap-2 bg-[var(--color-bg)] p-1 rounded-xl border border-[var(--color-border)]">
               <button onClick={() => setChartType('bar')} className={`p-2 rounded-lg transition-all ${chartType === 'bar' ? 'bg-[var(--color-bg-card)] shadow text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}><BarChartIcon size={18} /></button>
               <button onClick={() => setChartType('pie')} className={`p-2 rounded-lg transition-all ${chartType === 'pie' ? 'bg-[var(--color-bg-card)] shadow text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'}`}><PieChartIcon size={18} /></button>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8" ref={chartRef}>
            {/* Weekly Breakdown Chart */}
            <div>
              <h4 className="text-sm font-black text-[var(--color-text-muted)] mb-4 flex items-center gap-2"><TrendingUp size={16} /> التوزيع الأسبوعي (مملوكة vs مدعومة)</h4>
              <div className="h-[300px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyChartData} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                    <YAxis />
                    <RechartsTooltip />
                    <Legend />
                    <Bar dataKey="مملوكة" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="مدعومة" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category / Period Chart */}
            <div>
              <h4 className="text-sm font-black text-[var(--color-text-muted)] mb-4 flex items-center gap-2">
                <PieChartIcon size={16} /> {chartType === 'bar' ? 'توزيع الفترات' : 'توزيع الفئات'}
              </h4>
              <div className="h-[300px] w-full" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  {chartType === 'bar' ? (
                    <BarChart data={periodChartData} margin={{ bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" opacity={0.5} />
                      <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 600 }} />
                      <YAxis />
                      <RechartsTooltip />
                      <Bar dataKey="value" name="العدد" radius={[4, 4, 0, 0]}>
                        {periodChartData.map((_, i) => <Cell key={i} fill={['#f59e0b', '#6366f1', '#0891b2', '#10b981'][i % 4]} />)}
                      </Bar>
                    </BarChart>
                  ) : (
                    <PieChart>
                      <Pie data={categoryChartData} cx="50%" cy="50%" outerRadius={100} innerRadius={40} dataKey="value" nameKey="name" label>
                        {categoryChartData.map((_, i) => <Cell key={i} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#0891b2'][i % 5]} />)}
                      </Pie>
                      <RechartsTooltip />
                      <Legend />
                    </PieChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </Card>
      )}

    </div>
  );
};

export default TicketsReportPage;
