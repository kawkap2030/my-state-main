import React, { useState, useMemo, useEffect, useRef } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import useReportPrintShortcut from '../../../hooks/useReportPrintShortcut';
import PrintableTable from '../../../components/common/PrintableTable';
import { exportToWord, exportToPDF, exportMultiSheetExcel } from '../../../utils/exportUtils';
import AutoComplete from '../../../components/ui/AutoComplete';
import MonthInput from '../../../components/ui/MonthInput';
import HierarchySelector from '../../../components/common/HierarchySelector';
import { useGlobalApp } from '../../../context/useGlobalApp';
import { buildHierarchyLabel } from '../../../utils/reportUtils';
import {
  LayoutGrid, Search, Download, Printer, ListFilter,
  ArrowUp, ArrowDown, ChevronDown, ChevronLeft,
  Calendar, Layers, CheckSquare, Square, Eye, Play, Sparkles, X
} from 'lucide-react';

const TRANSLATIONS = {
  branch: 'الفرع',
  area: 'المنطقة',
  clinic: 'العيادة',
  month: 'الشهر',
  drug: 'اسم الدواء',
  category: 'التصنيف/الفئة',
  insulin: 'اسم الإنسولين',
  type: 'النوع',
  patient: 'اسم المريض',
  diagnosis: 'التشخيص',
  medicine: 'الدواء القضائي',
  supply: 'اسم المستلزم',
  period: 'الفترة',
  qty: 'الكمية/الجرعة',
  cases: 'عدد الحالات',
  cost: 'التكلفة الإجمالية',
  free_authority: 'مجاني - هيئة',
  free_students: 'مجاني - طلاب',
  free_infants: 'مجاني - أطفال',
  free_women: 'مجاني - معيلات',
  supported_authority: 'مدعم - هيئة',
  supported_students: 'مدعم - طلاب',
  supported_infants: 'مدعم - أطفال',
  total_free: 'إجمالي المجاني',
  total_supported: 'إجمالي المدعم',
  total_cost: 'التكلفة الكلية',
  consumer_val: 'قيمة المستهلك',
  collective_val: 'قيمة الجهات',
  total_val: 'القيمة الإجمالية',
  tickets_56b: 'تذاكر 56ب',
  tickets_56c: 'تذاكر 56ج',
  total_tickets: 'إجمالي التذاكر'
};

const translate = (key) => TRANSLATIONS[key] || key;

const DATA_SOURCES = [
  {
    id: 'detailed_drugs',
    name: 'منصرف الأدوية (التفصيلي)',
    dimensions: ['branch', 'area', 'clinic', 'month', 'drug', 'category'],
    measures: ['qty', 'cases', 'cost']
  },
  {
    id: 'monthly_totals',
    name: 'المنصرف الإجمالي للأدوية (شهري)',
    dimensions: ['branch', 'area', 'clinic', 'month'],
    measures: [
      'free_authority', 'free_students', 'free_infants', 'free_women',
      'supported_authority', 'supported_students', 'supported_infants',
      'total_free', 'total_supported', 'total_cost'
    ]
  },
  {
    id: 'insulin',
    name: 'صرف الإنسولين',
    dimensions: ['branch', 'area', 'clinic', 'month', 'insulin', 'type', 'category'],
    measures: ['qty', 'cases', 'cost']
  },
  {
    id: 'judicial',
    name: 'أحكام المحكمة',
    dimensions: ['branch', 'area', 'clinic', 'month', 'patient', 'diagnosis', 'medicine'],
    measures: ['qty', 'cost']
  },
  {
    id: 'supplies',
    name: 'المستلزمات الطبية',
    dimensions: ['branch', 'area', 'clinic', 'month', 'supply', 'category'],
    measures: ['consumer_val', 'collective_val', 'total_val']
  },
  {
    id: 'medical_tickets',
    name: 'التذاكر الطبية',
    dimensions: ['branch', 'area', 'clinic', 'month', 'category', 'period'],
    measures: ['tickets_56b', 'tickets_56c', 'total_tickets']
  }
];

const DEFAULT_CONFIGS = {
  detailed_drugs: {
    rowDims: ['branch', 'area', 'clinic'],
    columnDim: 'month',
    measure: 'cost',
    aggType: 'sum'
  },
  monthly_totals: {
    rowDims: ['branch', 'area', 'clinic'],
    columnDim: 'month',
    measure: 'total_cost',
    aggType: 'sum'
  },
  insulin: {
    rowDims: ['branch', 'area', 'clinic', 'insulin'],
    columnDim: 'month',
    measure: 'cost',
    aggType: 'sum'
  },
  judicial: {
    rowDims: ['branch', 'area', 'clinic', 'patient'],
    columnDim: 'month',
    measure: 'cost',
    aggType: 'sum'
  },
  supplies: {
    rowDims: ['branch', 'area', 'clinic', 'supply'],
    columnDim: 'month',
    measure: 'total_val',
    aggType: 'sum'
  },
  medical_tickets: {
    rowDims: ['branch', 'area', 'clinic', 'category'],
    columnDim: 'month',
    measure: 'total_tickets',
    aggType: 'sum'
  }
};

const formatNumber = (num, measure) => {
  if (num === undefined || num === null) return '-';
  if (isNaN(num)) return num;
  
  const isCost = measure && (measure.includes('cost') || measure.includes('val') || measure.includes('share') || measure.includes('free') || measure.includes('supported'));
  
  if (isCost) {
    return new Intl.NumberFormat('ar-EG', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
  }
  return new Intl.NumberFormat('ar-EG', { style: 'decimal', maximumFractionDigits: 0 }).format(num);
};

const aggregateValues = (rows, measureId, aggType) => {
  if (rows.length === 0) return 0;
  const vals = rows.map(r => Number(r[measureId]) || 0);
  switch (aggType) {
    case 'count':
      return vals.length;
    case 'avg':
      return vals.reduce((sum, v) => sum + v, 0) / vals.length;
    case 'min':
      return Math.min(...vals);
    case 'max':
      return Math.max(...vals);
    case 'sum':
    default:
      return vals.reduce((sum, v) => sum + v, 0);
  }
};

// High-cardinality dimensions that should NOT be used as column (horizontal) dim
const HIGH_CARDINALITY_DIMS = ['drug', 'insulin', 'patient', 'supply', 'medicine'];
const MAX_COL_KEYS = 25; // Cap to protect table structure

// Synced Top Scrollbar Container Component for Pivot Table
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
          className="overflow-x-auto no-print h-3.5 mb-1.5 bg-cyan-500/15 dark:bg-slate-800 rounded-lg cursor-pointer"
          dir="rtl"
        >
          <div style={{ width: `${scrollWidth}px`, height: '1px' }} />
        </div>
      )}
      <div
        ref={bottomScrollRef}
        onScroll={handleBottomScroll}
        className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-900"
        dir="rtl"
      >
        {children}
      </div>
    </div>
  );
};

const PivotReportsPage = () => {
  const toast = useToast();
  const { workspaceMode: globalWorkspaceMode, hierarchyNames: globalHierarchyNames } = useGlobalApp();
  // Ref to the toolbar ExportMenu — Ctrl+P opens the EXACT same PrintPreviewModal
  // that ExportMenu → "طباعة التقرير" opens (shared imperative API, no native
  // WebView2 print dialog, no window.print() path).
  const exportMenuRef = useRef(null);
  useReportPrintShortcut(exportMenuRef);

  const [dataSource, setDataSource] = useState('detailed_drugs');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const [hierarchy, setHierarchy] = useState({ branchId: '', areaId: '', clinicId: '' });
  
  const [availableDims, setAvailableDims] = useState([]);
  const [availableMeasures, setAvailableMeasures] = useState([]);

  const [rowDims, setRowDims] = useState([]);
  const [columnDim, setColumnDim] = useState('month');
  const [measure, setMeasure] = useState('cost');
  const [aggType, setAggType] = useState('sum');

  const [rawData, setRawData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedKeys, setExpandedKeys] = useState({});
  const [viewMode, setViewMode] = useState('flat'); // 'flat' | 'tree'

  // Initialize start and end month to trailing 6 months
  useEffect(() => {
    const today = new Date();
    const current = today.toISOString().substring(0, 7);
    today.setMonth(today.getMonth() - 5);
    const start = today.toISOString().substring(0, 7);
    setStartMonth(start);
    setEndMonth(current);
  }, []);

  // Update configuration when data source changes
  useEffect(() => {
    const src = DATA_SOURCES.find(d => d.id === dataSource);
    if (src) {
      setAvailableDims(src.dimensions);
      setAvailableMeasures(src.measures);
      
      const def = DEFAULT_CONFIGS[dataSource] || {
        rowDims: src.dimensions.slice(0, 2),
        columnDim: src.dimensions.includes('month') ? 'month' : null,
        measure: src.measures[0],
        aggType: 'sum'
      };
      
      setRowDims(def.rowDims);
      // Ensure columnDim is not a high cardinality item like drug/patient/insulin
      const safeColDim = ['drug', 'insulin', 'patient', 'supply', 'medicine'].includes(def.columnDim) ? 'month' : def.columnDim;
      setColumnDim(safeColDim);
      setMeasure(def.measure);
      setAggType(def.aggType);
      setRawData(null);
      setExpandedKeys({});
    }
  }, [dataSource]);

  const handleGenerate = async () => {
    if (!startMonth || !endMonth) {
      toast.warning('يرجى تحديد الفترة الزمنية للتقرير');
      return;
    }
    if (startMonth > endMonth) {
      toast.error('بداية الفترة لا يمكن أن تتعدى نهايتها');
      return;
    }
    if (rowDims.length === 0) {
      toast.warning('يرجى اختيار بعد واحد على الأقل للصفوف');
      return;
    }

    setLoading(true);
    try {
      const data = await invoke('get_pivot_data', {
        dataSource,
        startMonth,
        endMonth,
        branchId: hierarchy.branchId ? parseInt(hierarchy.branchId, 10) : null,
        areaId: hierarchy.areaId ? parseInt(hierarchy.areaId, 10) : null,
        clinicId: hierarchy.clinicId ? parseInt(hierarchy.clinicId, 10) : null,
      });
      setRawData(data);
      setExpandedKeys({});
      toast.success('تم جلب البيانات وإعداد التقرير المحوري بنجاح');
    } catch (err) {
      console.error(err);
      toast.error(`حدث خطأ أثناء معالجة التقرير: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  // Dimensions order helpers
  const moveDimUp = (index) => {
    if (index === 0) return;
    const newDims = [...rowDims];
    const temp = newDims[index - 1];
    newDims[index - 1] = newDims[index];
    newDims[index] = temp;
    setRowDims(newDims);
  };

  const moveDimDown = (index) => {
    if (index === rowDims.length - 1) return;
    const newDims = [...rowDims];
    const temp = newDims[index + 1];
    newDims[index + 1] = newDims[index];
    newDims[index] = temp;
    setRowDims(newDims);
  };

  const toggleRowDim = (dim) => {
    if (rowDims.includes(dim)) {
      setRowDims(rowDims.filter(d => d !== dim));
    } else {
      setRowDims([...rowDims, dim]);
    }
  };

  // Filtered column dimension options (exclude item-level dims)
  const allowedColumnDims = useMemo(() => {
    return availableDims.filter(d => !HIGH_CARDINALITY_DIMS.includes(d));
  }, [availableDims]);

  // Compute unique values for the selected column dimension (capped)
  const uniqueColKeys = useMemo(() => {
    if (!columnDim || !rawData) return [];
    const keys = new Set();
    rawData.forEach(r => {
      if (r[columnDim] !== undefined && r[columnDim] !== null) {
        keys.add(String(r[columnDim]));
      }
    });
    const sorted = Array.from(keys).sort();
    return sorted.slice(0, MAX_COL_KEYS);
  }, [rawData, columnDim]);

  // Recursively build the hierarchical pivot tree
  const pivotTree = useMemo(() => {
    if (!rawData || rowDims.length === 0) return [];

    const buildNode = (rows, depth, parentKey = '') => {
      const dim = rowDims[depth];
      const groups = {};
      
      rows.forEach(r => {
        const val = r[dim] != null ? String(r[dim]) : 'غير محدد';
        if (!groups[val]) groups[val] = [];
        groups[val].push(r);
      });

      return Object.keys(groups).map((val, idx) => {
        const groupRows = groups[val];
        const key = `${parentKey}_${depth}_${val}_${idx}`;
        
        // Calculate aggregated values for each column value
        const colValues = {};
        if (columnDim) {
          uniqueColKeys.forEach(ck => {
            const matchingRows = groupRows.filter(r => String(r[columnDim]) === ck);
            colValues[ck] = aggregateValues(matchingRows, measure, aggType);
          });
        }
        
        // Grand total for this group
        const grandTotal = aggregateValues(groupRows, measure, aggType);
        
        const isLeaf = depth === rowDims.length - 1;
        const children = isLeaf ? [] : buildNode(groupRows, depth + 1, key);

        return {
          key,
          dimension: dim,
          value: val,
          level: depth,
          colValues,
          grandTotal,
          children,
          isLeaf,
          rowsCount: groupRows.length
        };
      });
    };

    return buildNode(rawData, 0);
  }, [rawData, rowDims, columnDim, uniqueColKeys, measure, aggType]);

  // Flatten the expanded tree nodes into visible rows for rendering
  const visibleRows = useMemo(() => {
    const list = [];
    const traverse = (nodes) => {
      nodes.forEach(n => {
        const matchesSearch = !searchQuery || n.value.toLowerCase().includes(searchQuery.toLowerCase());
        
        // If searching, we flatten and show matches, otherwise respect expansion state
        if (searchQuery) {
          if (matchesSearch) list.push(n);
          if (n.children && n.children.length > 0) traverse(n.children);
        } else {
          list.push(n);
          if (n.children && n.children.length > 0 && expandedKeys[n.key]) {
            traverse(n.children);
          }
        }
      });
    };
    traverse(pivotTree);
    return list;
  }, [pivotTree, expandedKeys, searchQuery]);

  // Flatten tree to matrix rows (Flat Pivot View)
  const flatRows = useMemo(() => {
    if (!pivotTree || pivotTree.length === 0) return [];
    const list = [];
    const buildPath = (nodes, currentPath = {}) => {
      nodes.forEach(n => {
        const newPath = { ...currentPath, [n.dimension]: n.value };
        if (n.isLeaf || !n.children || n.children.length === 0) {
          // Check search query across all dimension values
          const matchesSearch = !searchQuery || Object.values(newPath).some(v => String(v).toLowerCase().includes(searchQuery.toLowerCase()));
          if (matchesSearch) {
            list.push({
              dimValues: newPath,
              colValues: n.colValues,
              grandTotal: n.grandTotal
            });
          }
        } else {
          buildPath(n.children, newPath);
        }
      });
    };
    buildPath(pivotTree);
    return list;
  }, [pivotTree, searchQuery]);


  // Global Grand Totals
  const globalGrandTotal = useMemo(() => {
    if (!rawData) return 0;
    return aggregateValues(rawData, measure, aggType);
  }, [rawData, measure, aggType]);

  const globalColTotals = useMemo(() => {
    if (!rawData || !columnDim) return {};
    const totals = {};
    uniqueColKeys.forEach(ck => {
      const matchingRows = rawData.filter(r => String(r[columnDim]) === ck);
      totals[ck] = aggregateValues(matchingRows, measure, aggType);
    });
    return totals;
  }, [rawData, columnDim, uniqueColKeys, measure, aggType]);

  const toggleExpand = (key) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const expandAll = () => {
    const keys = {};
    const traverse = (nodes) => {
      nodes.forEach(n => {
        if (n.children && n.children.length > 0) {
          keys[n.key] = true;
          traverse(n.children);
        }
      });
    };
    traverse(pivotTree);
    setExpandedKeys(keys);
  };

  const collapseAll = () => {
    setExpandedKeys({});
  };

  // ── Memoized period text display ────────────────────────────────────
  const periodText = useMemo(() => {
    if (!startMonth && !endMonth) return '';
    if (startMonth === endMonth) return `شهر العرض: ${startMonth}`;
    return `الفترة من: ${startMonth} إلى: ${endMonth}`;
  }, [startMonth, endMonth]);

  // ── Memoized export-ready pivot data & columns ──────────────────────
  // These are used by BOTH handlePremiumExport AND ExportMenu's built-in
  // print preview (PrintPreviewModal), dynamically adapting to viewMode ('flat' vs 'tree')
  const pivotExportColumns = useMemo(() => {
    if (!rawData || (rowDims.length === 0 && uniqueColKeys.length === 0)) return [];

    if (viewMode === 'flat') {
      const cols = rowDims.map(d => ({
        header: translate(d),
        accessor: d,
        exportAccessor: r => r[d]
      }));
      uniqueColKeys.forEach((ck, idx) => {
        const key = `col_${idx}`;
        cols.push({
          header: ck,
          accessor: key,
          exportAccessor: r => r[key]
        });
      });
      cols.push({
        header: 'الإجمالي العام',
        accessor: 'grandTotal',
        exportAccessor: r => r['grandTotal']
      });
      return cols;
    } else {
      // Tree view mode
      const mainHeader = rowDims.map(d => translate(d)).join(' ◄ ') || 'الأبعاد والتقسيمات المحورية';
      const cols = [{
        header: mainHeader,
        accessor: 'dim',
        exportAccessor: r => r['dim']
      }];
      uniqueColKeys.forEach((ck, idx) => {
        const key = `col_${idx}`;
        cols.push({
          header: ck,
          accessor: key,
          exportAccessor: r => r[key]
        });
      });
      cols.push({
        header: 'الإجمالي العام',
        accessor: 'grandTotal',
        exportAccessor: r => r['grandTotal']
      });
      return cols;
    }
  }, [rawData, uniqueColKeys, rowDims, viewMode]);

  const pivotExportData = useMemo(() => {
    if (!rawData || rowDims.length === 0) return [];

    if (viewMode === 'flat') {
      if (!flatRows || flatRows.length === 0) return [];
      const matrix = flatRows.map(r => {
        const row = {};
        rowDims.forEach(d => {
          row[d] = r.dimValues[d] !== undefined ? r.dimValues[d] : 'غير محدد';
        });
        uniqueColKeys.forEach((ck, idx) => {
          const val = r.colValues[ck];
          row[`col_${idx}`] = val !== undefined ? formatNumber(val, measure) : '-';
        });
        row['grandTotal'] = formatNumber(r.grandTotal, measure);
        return row;
      });

      // Total row for Flat matrix
      const totalRow = {};
      if (rowDims.length > 0) {
        totalRow[rowDims[0]] = 'إجمالي التقرير';
        for (let i = 1; i < rowDims.length; i++) {
          totalRow[rowDims[i]] = '';
        }
      }
      uniqueColKeys.forEach((ck, idx) => {
        totalRow[`col_${idx}`] = formatNumber(globalColTotals[ck] || 0, measure);
      });
      totalRow['grandTotal'] = formatNumber(globalGrandTotal, measure);
      matrix.push(totalRow);
      return matrix;
    } else {
      // Tree view mode
      if (!pivotTree || pivotTree.length === 0) return [];
      const matrix = [];
      const flatten = (nodes) => {
        nodes.forEach(n => {
          const row = {};
          const prefix = '   '.repeat(n.level) + (n.level > 0 ? '├─ ' : '');
          row['dim'] = prefix + n.value;
          uniqueColKeys.forEach((ck, idx) => {
            const val = n.colValues[ck];
            row[`col_${idx}`] = val !== undefined ? formatNumber(val, measure) : '-';
          });
          row['grandTotal'] = formatNumber(n.grandTotal, measure);
          matrix.push(row);
          if (n.children && n.children.length > 0) {
            flatten(n.children);
          }
        });
      };
      flatten(pivotTree);

      // Total row for Tree view
      const totalRow = { 'dim': 'إجمالي التقرير' };
      uniqueColKeys.forEach((ck, idx) => {
        totalRow[`col_${idx}`] = formatNumber(globalColTotals[ck] || 0, measure);
      });
      totalRow['grandTotal'] = formatNumber(globalGrandTotal, measure);
      matrix.push(totalRow);
      return matrix;
    }
  }, [rawData, pivotTree, flatRows, uniqueColKeys, rowDims, measure, globalColTotals, globalGrandTotal, viewMode]);

  // Premium Export Handler
  const handlePremiumExport = async (type, { options }) => {
    if (!rawData || visibleRows.length === 0) return false;
    
    // Reuse memoized export columns/data matching viewMode
    const columnsConfig = pivotExportColumns;
    const rowsFormatted = pivotExportData;

    const srcName = DATA_SOURCES.find(d => d.id === dataSource)?.name || 'تقرير محوري';
    const hierarchyText = buildHierarchyLabel(globalWorkspaceMode, globalHierarchyNames, hierarchy);
    
    const exportOptions = {
      ...options,
      title: 'التقرير المحوري الديناميكي الشامل',
      subtitle: `مصدر البيانات: ${srcName} | ${periodText}`,
      hierarchyLabel: hierarchyText,
      periodLabel: periodText,
      startMonth,
      endMonth,
      fileName: `Dynamic_Pivot_${dataSource}_${startMonth}_to_${endMonth}`
    };

    // Build summary info sheet (shared by Excel multi-sheet and Word/PDF tables)
    const summaryCols = [
      { header: 'البيان', accessor: 'label' },
      { header: 'القيمة', accessor: 'value' }
    ];
    const summaryRows = [
      { label: 'مصدر البيانات', value: srcName },
      { label: 'النطاق الإداري / الجهة', value: hierarchyText },
      ...(startMonth === endMonth
        ? [{ label: 'شهر العرض', value: startMonth }]
        : [
            { label: 'بداية الفترة', value: startMonth },
            { label: 'نهاية الفترة', value: endMonth },
          ]
      ),
      { label: 'نمط عرض الجدول', value: viewMode === 'flat' ? 'مصفوفة مسطحة (Pivot Matrix)' : 'عرض شجري (Tree View)' },
      { label: 'أبعاد الصفوف', value: rowDims.map(d => translate(d)).join(' ◄ ') },
      { label: 'بُعد الأعمدة', value: columnDim ? translate(columnDim) : 'لا يوجد' },
      { label: 'المقياس المحسوب', value: translate(measure) },
      { label: 'دالة التجميع', value: aggType === 'sum' ? 'مجموع' : aggType === 'avg' ? 'متوسط' : aggType === 'count' ? 'عدد' : 'حد أقصى' },
      { label: 'عدد صفوف التقرير', value: `${viewMode === 'flat' ? flatRows.length : visibleRows.length} صف مرئي` },
      { label: 'الإجمالي العام', value: formatNumber(globalGrandTotal, measure) }
    ];

    // Print: return false to let ExportMenu use its built-in PrintPreviewModal
    // with the properly formatted pivotExportData/pivotExportColumns we pass as props
    if (type === 'print') return false;

    if (type === 'excel') {
      const sheetsData = {
        'معلومات التقرير': { data: summaryRows, columns: summaryCols, options: exportOptions },
        'بيانات التقرير المحوري': { data: rowsFormatted, columns: columnsConfig, options: exportOptions }
      };
      await exportMultiSheetExcel(sheetsData, {
        fileName: exportOptions.fileName,
        title: exportOptions.title,
        periodLabel: periodText,
        hierarchyLabel: hierarchyText
      });
      return true;
    }
    // Word/PDF: mirror the Excel sheets as separate titled tables
    const multiTables = [
      { data: summaryRows, columns: summaryCols, title: 'معلومات التقرير' },
      { data: rowsFormatted, columns: columnsConfig, title: 'بيانات التقرير المحوري' },
    ];
    const wordPdfOptions = { ...exportOptions, tables: multiTables };
    if (type === 'word') {
      exportToWord(summaryRows, summaryCols, wordPdfOptions);
      return true;
    }
    if (type === 'pdf') {
      await exportToPDF(summaryRows, summaryCols, wordPdfOptions);
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-20 text-[var(--color-text)]" dir="rtl">
      <Breadcrumb items={[{ label: 'التقارير المتطورة' }, { label: 'التقرير المحوري التفاعلي' }]} />

      <PageHeader
        title="شاشة التقارير المحورية الديناميكية"
        icon={LayoutGrid}
        description="أداة استخراج ذكية تتيح لمتخذي القرار والمحللين الماليين تجميع وقرصنة البيانات الإحصائية والمالية بحرية كاملة."
        actions={
          rawData && (
            <ExportMenu
              ref={exportMenuRef}
              data={pivotExportData}
              columns={pivotExportColumns}
              onCustomExport={handlePremiumExport}
              options={{
                title: 'التقرير المحوري الديناميكي الشامل',
                subtitle: `مصدر البيانات: ${DATA_SOURCES.find(d => d.id === dataSource)?.name || ''} | ${periodText}`,
                hierarchyLabel: buildHierarchyLabel(globalWorkspaceMode, globalHierarchyNames, hierarchy),
                periodLabel: periodText,
                fileName: `Dynamic_Pivot_${dataSource}_${startMonth}_to_${endMonth}`
              }}
            />
          )
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start pivot-print-grid">
        
        {/* ─── Sidebar Configuration Panel ─────────────────────────────────── */}
        <Card className="xl:col-span-1 p-6 space-y-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-[var(--color-border)] shadow-sm no-print min-w-[280px]">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <ListFilter className="text-cyan-600 dark:text-cyan-400" size={16} />
            <h3 className="font-black text-sm text-[var(--color-primary)]">إعداد أبعاد التجميع</h3>
          </div>

          {/* 1. Data Source Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">مصدر البيانات الإحصائية</label>
            <AutoComplete
              value={dataSource}
              onChange={setDataSource}
              options={DATA_SOURCES}
              getOptionLabel={(s) => s.name}
              getOptionValue={(s) => s.id}
              placeholder="اختر مصدر البيانات"
            />
          </div>

          {/* 1.5 Hierarchy Filter Selector (Branch / Area / Clinic) */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">تصفية النطاق الإداري (اختياري)</label>
            <HierarchySelector
              hideMonth
              onSelectionChange={(data) => setHierarchy({
                branchId: data.branchId ? String(data.branchId) : '',
                areaId: data.areaId ? String(data.areaId) : '',
                clinicId: data.clinicId ? String(data.clinicId) : ''
              })}
            />
          </div>

          {/* 2. Date Range Picker */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">الفترة الزمنية للتحليل</label>
            <div className="grid grid-cols-1 gap-3">
              <MonthInput
                label="من شهر"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
              <MonthInput
                label="إلى شهر"
                value={endMonth}
                onChange={(e) => setEndMonth(e.target.value)}
              />
            </div>
          </div>

          {/* 3. Row Dimensions Selection */}
          <div className="space-y-3">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)] flex justify-between">
              <span>أبعاد الصفوف (الترتيب الشجري)</span>
              <span className="text-[8px] text-cyan-600 dark:text-cyan-400 font-normal">رتب المستويات</span>
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {availableDims.map((dim) => {
                const isSelected = rowDims.includes(dim);
                const pos = rowDims.indexOf(dim);
                return (
                  <div
                    key={dim}
                    className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                      isSelected
                        ? 'border-cyan-300 bg-cyan-50/20 dark:border-cyan-900 dark:bg-cyan-950/10 font-bold'
                        : 'border-[var(--color-border)] opacity-60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleRowDim(dim)}
                      className="flex items-center gap-2 cursor-pointer flex-1 text-right"
                    >
                      {isSelected ? (
                        <CheckSquare size={13} className="text-cyan-600 dark:text-cyan-400" />
                      ) : (
                        <Square size={13} className="text-[var(--color-text-muted)]" />
                      )}
                      <span>{translate(dim)}</span>
                    </button>

                    {isSelected && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => moveDimUp(pos)}
                          disabled={pos === 0}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30"
                        >
                          <ArrowUp size={11} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDimDown(pos)}
                          disabled={pos === rowDims.length - 1}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded disabled:opacity-30"
                        >
                          <ArrowDown size={11} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Column Dimension Selection (filtered to exclude item-level dims) */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">
              بُعد الأعمدة (أفقي)
              <span className="text-[8px] font-normal text-amber-500 mr-2">* يُستبعد أسماء الأدوية والمرضى تلقائياً</span>
            </label>
            <AutoComplete
              value={columnDim || ''}
              onChange={(val) => setColumnDim(val || null)}
              options={allowedColumnDims.map(d => ({ id: d, name: translate(d) }))}
              getOptionLabel={(d) => d.name}
              getOptionValue={(d) => d.id}
              placeholder="لا يوجد تقطيع أفقي"
            />
          </div>

          {/* 5. Value/Measure Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">البيانات المراد تجميعها (المقاييس)</label>
            <AutoComplete
              value={measure}
              onChange={setMeasure}
              options={availableMeasures.map(m => ({ id: m, name: translate(m) }))}
              getOptionLabel={(m) => m.name}
              getOptionValue={(m) => m.id}
              placeholder="اختر المقياس"
            />
          </div>

          {/* 6. Aggregation Type */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">دالة التجميع</label>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'sum', name: 'مجموع (Sum)' },
                { id: 'count', name: 'عدد الأسطر (Count)' },
                { id: 'avg', name: 'متوسط (Average)' },
                { id: 'max', name: 'الحد الأقصى (Max)' }
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAggType(opt.id)}
                  className={`p-2 rounded-xl border text-[10px] font-bold transition-all ${
                    aggType === opt.id
                      ? 'border-cyan-500 bg-cyan-500 text-white shadow-md'
                      : 'border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text)] hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <div className="pt-2">
            <Button
              variant="primary"
              icon={Play}
              onClick={handleGenerate}
              loading={loading}
              className="w-full h-11 rounded-xl shadow-lg shadow-cyan-500/10 cursor-pointer bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-700 hover:to-cyan-600"
            >
              عرض التقرير المحوري
            </Button>
          </div>
        </Card>

        {/* ─── Main Pivot Table Display Panel ─────────────────────────────── */}
        <div className="xl:col-span-2 space-y-6 pivot-print-main">
          {rawData ? (
            <PrintableTable
              title={`التقرير المحوري الديناميكي - ${DATA_SOURCES.find(d => d.id === dataSource)?.name || ''}`}
              subtitle={`الجهة: ${buildHierarchyLabel(globalWorkspaceMode, globalHierarchyNames, hierarchy)} | ${periodText}`}
              hierarchyLabel={buildHierarchyLabel(globalWorkspaceMode, globalHierarchyNames, hierarchy)}
            >
              <div className="space-y-6">
                
                {/* ─── KPI Summary Cards Bar ───────────────────────────────── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 no-print">
                  <div className="p-4 rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 dark:from-cyan-950/30 dark:to-cyan-950/10">
                    <div className="text-[10px] font-black text-cyan-600 dark:text-cyan-400">إجمالي {translate(measure)}</div>
                    <div className="text-lg font-black font-mono text-cyan-700 dark:text-cyan-300 mt-1">
                      {formatNumber(globalGrandTotal, measure)}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 dark:from-emerald-950/30 dark:to-emerald-950/10">
                    <div className="text-[10px] font-black text-emerald-600 dark:text-emerald-400">إجمالي سجلات البيانات</div>
                    <div className="text-lg font-black font-mono text-emerald-700 dark:text-emerald-300 mt-1">
                      {rawData.length} سجل
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/10 to-purple-500/5 dark:from-purple-950/30 dark:to-purple-950/10">
                    <div className="text-[10px] font-black text-purple-600 dark:text-purple-400">الأبعاد المحورية النشطة</div>
                    <div className="text-lg font-black text-purple-700 dark:text-purple-300 mt-1">
                      {rowDims.length} {columnDim ? '+ 1 أفقي' : ''}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 to-amber-500/5 dark:from-amber-950/30 dark:to-amber-950/10">
                    <div className="text-[10px] font-black text-amber-600 dark:text-amber-400">دالة التجميع المطبقة</div>
                    <div className="text-lg font-black text-amber-700 dark:text-amber-300 mt-1">
                      {aggType === 'sum' ? 'مجموع' : aggType === 'avg' ? 'متوسط' : aggType === 'count' ? 'عدد' : 'حد أقصى'}
                    </div>
                  </div>
                </div>

                {/* ─── Quick Measure Toggle Bar ───────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-2 no-print bg-[var(--color-bg)] p-3 rounded-2xl border border-[var(--color-border)]">
                  <span className="text-[10px] font-black text-[var(--color-text-muted)] ml-2 shrink-0">⚡ تبديل سريع للمقياس:</span>
                  {availableMeasures.map(m => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setMeasure(m)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer border ${
                        measure === m
                          ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm'
                          : 'bg-[var(--color-bg-card)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:border-cyan-400 hover:text-cyan-600'
                      }`}
                    >
                      {translate(m)}
                    </button>
                  ))}
                </div>

                <Card className="p-6 space-y-6 border border-[var(--color-border)] shadow-sm bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
                
                  {/* Toolbar & View Mode Switcher */}
                  <div className="flex flex-col md:flex-row gap-4 justify-between items-center no-print">
                    <div className="relative w-full md:w-80">
                      <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        type="text"
                        placeholder="ابحث داخل صفوف التقرير..."
                        className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] pr-10 pl-10 py-2.5 rounded-xl text-xs outline-none text-[var(--color-text)] focus:border-cyan-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery('')}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                          title="مسح البحث"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => setViewMode('flat')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'flat'
                              ? 'bg-cyan-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:text-cyan-600'
                          }`}
                        >
                          مصفوفة مسطحة (Flat Matrix)
                        </button>
                        <button
                          type="button"
                          onClick={() => setViewMode('tree')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            viewMode === 'tree'
                              ? 'bg-cyan-600 text-white shadow-xs'
                              : 'text-slate-600 dark:text-slate-300 hover:text-cyan-600'
                          }`}
                        >
                          عرض شجري (Tree View)
                        </button>
                      </div>

                      {viewMode === 'tree' && (
                        <>
                          <Button variant="outline" onClick={expandAll} className="h-9 px-3 text-[10px] rounded-lg">
                            توسيع
                          </Button>
                          <Button variant="outline" onClick={collapseAll} className="h-9 px-3 text-[10px] rounded-lg">
                            طي
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Table Container with Top Scrollbar */}
                  <SyncedTableContainer>
                    <table className="w-full border-collapse text-right text-xs">
                      
                      {/* Table Headers */}
                      <thead>
                        <tr className="bg-slate-100/80 dark:bg-slate-800 border-b-2 border-slate-200 dark:border-slate-700">
                          {viewMode === 'flat' ? (
                            rowDims.map(d => (
                              <th key={d} className="p-3.5 font-black text-slate-800 dark:text-slate-100 border-l border-slate-200 dark:border-slate-700 whitespace-nowrap bg-slate-200/50 dark:bg-slate-800">
                                {translate(d)}
                              </th>
                            ))
                          ) : (
                            <th className="p-3.5 font-black text-slate-800 dark:text-slate-100 border-l border-slate-200 dark:border-slate-700">
                              {rowDims.map(d => translate(d)).join(' ◄ ')}
                            </th>
                          )}

                          {uniqueColKeys.map(ck => (
                            <th key={ck} className="p-3.5 font-black text-cyan-800 dark:text-cyan-300 text-center border-l border-slate-200 dark:border-slate-700 whitespace-nowrap min-w-[95px] bg-cyan-50/30 dark:bg-cyan-950/20">
                              {ck}
                            </th>
                          ))}

                          <th className="p-3.5 font-black text-emerald-800 dark:text-emerald-300 text-center whitespace-nowrap min-w-[110px] bg-emerald-50/40 dark:bg-emerald-950/30">
                            الإجمالي العام
                          </th>
                        </tr>
                      </thead>

                      {/* Table Body */}
                      <tbody>
                        {viewMode === 'flat' ? (
                          // Flat Matrix View Rendering
                          flatRows.length > 0 ? (
                            flatRows.map((row, rIdx) => (
                              <tr
                                key={rIdx}
                                className={`border-b border-slate-200/60 dark:border-slate-800/60 hover:bg-cyan-50/30 dark:hover:bg-slate-800/50 transition-colors ${
                                  rIdx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/40 dark:bg-slate-900/40'
                                }`}
                              >
                                {rowDims.map((d, dIdx) => (
                                  <td
                                    key={d}
                                    className={`p-3 border-l border-slate-200/60 dark:border-slate-800/60 whitespace-nowrap font-semibold ${
                                      dIdx === 0 ? 'font-black text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                                    }`}
                                  >
                                    {row.dimValues[d]}
                                  </td>
                                ))}

                                {uniqueColKeys.map(ck => (
                                  <td key={ck} className="p-3 text-center border-l border-slate-200/60 dark:border-slate-800/60 font-mono text-[11px]">
                                    {formatNumber(row.colValues[ck], measure)}
                                  </td>
                                ))}

                                <td className="p-3 text-center font-bold font-mono text-emerald-700 dark:text-emerald-400 text-[11px] bg-emerald-50/10 dark:bg-emerald-950/5">
                                  {formatNumber(row.grandTotal, measure)}
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={rowDims.length + uniqueColKeys.length + 1} className="p-12 text-center text-slate-400">
                                لا توجد نتائج مطابقة لبحثك.
                              </td>
                            </tr>
                          )
                        ) : (
                          // Tree View Rendering
                          visibleRows.length > 0 ? (
                            visibleRows.map((node) => {
                              const hasChildren = node.children && node.children.length > 0;
                              const isExpanded = expandedKeys[node.key];
                              const indent = node.level * 20;

                              return (
                                <tr
                                  key={node.key}
                                  className={`border-b border-slate-200/60 dark:border-slate-800/50 hover:bg-cyan-50/30 dark:hover:bg-slate-800/30 transition-all ${
                                    node.level === 0 ? 'font-bold bg-slate-100/40 dark:bg-slate-800/20' : ''
                                  }`}
                                >
                                  <td
                                    className="p-3 border-l border-slate-200/60 dark:border-slate-800 flex items-center gap-2 whitespace-nowrap"
                                    style={{ paddingRight: `${indent + 12}px` }}
                                  >
                                    {hasChildren && !searchQuery ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpand(node.key)}
                                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer shrink-0"
                                      >
                                        {isExpanded ? (
                                          <ChevronDown size={14} className="text-cyan-600 dark:text-cyan-400" />
                                        ) : (
                                          <ChevronLeft size={14} className="text-slate-400" />
                                        )}
                                      </button>
                                    ) : (
                                      <span className="w-5 h-5 inline-block shrink-0" />
                                    )}
                                    <span className="font-extrabold text-slate-900 dark:text-slate-100">{node.value}</span>
                                    {searchQuery && (
                                      <span className="text-[8px] bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300 px-1.5 py-0.5 rounded-full font-normal">
                                        {translate(node.dimension)}
                                      </span>
                                    )}
                                  </td>

                                  {uniqueColKeys.map(ck => (
                                    <td key={ck} className="p-3 text-center border-l border-slate-200/60 dark:border-slate-800 font-mono text-[11px]">
                                      {formatNumber(node.colValues[ck], measure)}
                                    </td>
                                  ))}

                                  <td className="p-3 text-center font-bold font-mono text-cyan-700 dark:text-cyan-400 text-[11px] bg-cyan-50/10 dark:bg-cyan-950/5">
                                    {formatNumber(node.grandTotal, measure)}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={uniqueColKeys.length + 2} className="p-12 text-center text-slate-400 dark:text-slate-500">
                                لا توجد نتائج مطابقة لبحثك.
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>

                      {/* Table Footer (Global Totals) */}
                      <tfoot>
                        <tr className="bg-cyan-50/20 dark:bg-cyan-950/20 font-black border-t-2 border-cyan-500 dark:border-cyan-800">
                          <td
                            colSpan={viewMode === 'flat' ? rowDims.length : 1}
                            className="p-4 text-cyan-900 dark:text-cyan-200 text-xs"
                          >
                            الإجمالي العام للتقرير المحوري
                          </td>
                          {uniqueColKeys.map(ck => (
                            <td key={ck} className="p-4 text-center font-mono text-cyan-900 dark:text-cyan-200 text-[12px] font-bold">
                              {formatNumber(globalColTotals[ck], measure)}
                            </td>
                          ))}
                          <td className="p-4 text-center font-mono text-emerald-600 dark:text-emerald-400 text-sm font-black bg-emerald-100/30 dark:bg-emerald-950/30">
                            {formatNumber(globalGrandTotal, measure)}
                          </td>
                        </tr>
                      </tfoot>

                    </table>
                  </SyncedTableContainer>
                </Card>
              </div>
            </PrintableTable>
          ) : (
            <Card className="p-16 text-center border border-dashed border-slate-300 dark:border-slate-800 flex flex-col items-center justify-center space-y-4">
              <div className="p-4 rounded-full bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 shadow-inner">
                <Sparkles size={32} />
              </div>
              <div className="space-y-1">
                <h4 className="font-black text-sm text-[var(--color-text)]">جاهز لتجميع البيانات</h4>
                <p className="text-xs text-[var(--color-text-muted)] max-w-sm">
                  اختر مصدر البيانات، ورتب أبعاد الصفوف والأعمدة على لوحة التحكم الجانبية، ثم اضغط على زر "عرض التقرير المحوري" للبدء.
                </p>
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
};

export default PivotReportsPage;
