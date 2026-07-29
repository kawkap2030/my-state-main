import React, { useState, useMemo, useEffect } from 'react';
import PageHeader from '../../../components/ui/PageHeader';
import Breadcrumb from '../../../components/ui/Breadcrumb';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { useToast } from '../../../components/ui/Toast';
import invoke from '../../../api/tauriApi';
import ExportMenu from '../../../components/ui/ExportMenu';
import PrintableTable from '../../../components/common/PrintableTable';
import { exportToWord, exportToPDF, exportMultiSheetExcel } from '../../../utils/exportUtils';
import AutoComplete from '../../../components/ui/AutoComplete';
import {
  LayoutGrid, Search, Download, Printer, ListFilter,
  ArrowUp, ArrowDown, ChevronDown, ChevronLeft,
  Calendar, Layers, CheckSquare, Square, Eye, Play, Sparkles
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

const PivotReportsPage = () => {
  const toast = useToast();

  const [dataSource, setDataSource] = useState('detailed_drugs');
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  
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
      setColumnDim(def.columnDim);
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
        endMonth
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

  // Compute unique values for the selected column dimension
  const uniqueColKeys = useMemo(() => {
    if (!columnDim || !rawData) return [];
    const keys = new Set();
    rawData.forEach(r => {
      if (r[columnDim] !== undefined && r[columnDim] !== null) {
        keys.add(String(r[columnDim]));
      }
    });
    return Array.from(keys).sort();
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

  // Premium Export Handler
  const handlePremiumExport = async (type, { options }) => {
    if (!rawData || visibleRows.length === 0) return false;
    
    // Set headers
    const headers = ['الأبعاد والتقسيمات المحورية'];
    uniqueColKeys.forEach(ck => headers.push(ck));
    headers.push('الإجمالي العام');

    // Build data matrix
    const dataMatrix = [];
    
    const flattenForExport = (nodes) => {
      nodes.forEach(n => {
        const row = [];
        // Apply visual indentation in Excel/Word/PDF cells
        const prefix = '   '.repeat(n.level) + (n.level > 0 ? '├─ ' : '');
        row.push(prefix + n.value);
        
        uniqueColKeys.forEach(ck => {
          row.push(n.colValues[ck] !== undefined ? n.colValues[ck] : 0);
        });
        row.push(n.grandTotal);
        
        dataMatrix.push(row);
        
        // Export children if expanded or if exporting the full hierarchy
        if (n.children && n.children.length > 0 && (searchQuery || expandedKeys[n.key])) {
          flattenForExport(n.children);
        }
      });
    };
    
    flattenForExport(pivotTree);
    
    // Add Grand Total row at the end
    const totalRow = ['إجمالي التقرير'];
    uniqueColKeys.forEach(ck => totalRow.push(globalColTotals[ck] || 0));
    totalRow.push(globalGrandTotal);
    dataMatrix.push(totalRow);

    // Format columns config for export engine
    const columnsConfig = headers.map((h, idx) => ({
      header: h,
      accessor: String(idx)
    }));

    // Structure raw rows to fit engine
    const rowsFormatted = dataMatrix.map(row => {
      const formatted = {};
      row.forEach((v, idx) => {
        formatted[idx] = v;
      });
      return formatted;
    });

    const srcName = DATA_SOURCES.find(d => d.id === dataSource)?.name || 'تقرير محوري';
    
    const exportOptions = {
      ...options,
      title: 'التقرير المحوري الديناميكي الشامل',
      subtitle: `مصدر البيانات: ${srcName} | الفترة من: ${startMonth} إلى: ${endMonth}`,
      fileName: `Dynamic_Pivot_${dataSource}_${startMonth}_to_${endMonth}`
    };

    if (type === 'excel') {
      // Build summary info sheet
      const summaryCols = [
        { header: 'البيان', accessor: 'label' },
        { header: 'القيمة', accessor: 'value' }
      ];
      const summaryRows = [
        { label: 'مصدر البيانات', value: srcName },
        { label: 'بداية الفترة', value: startMonth },
        { label: 'نهاية الفترة', value: endMonth },
        { label: 'أبعاد الصفوف', value: rowDims.map(d => translate(d)).join(' ◄ ') },
        { label: 'بُعد الأعمدة', value: columnDim ? translate(columnDim) : 'لا يوجد' },
        { label: 'المقياس المحسوب', value: translate(measure) },
        { label: 'دالة التجميع', value: aggType === 'sum' ? 'مجموع' : aggType === 'avg' ? 'متوسط' : aggType === 'count' ? 'عدد' : 'حد أقصى' },
        { label: 'عدد صفوف التقرير', value: `${visibleRows.length} صف مرئي` },
        { label: 'الإجمالي العام', value: formatNumber(globalGrandTotal, measure) }
      ];

      const sheetsData = {
        'معلومات التقرير': { data: summaryRows, columns: summaryCols, options: exportOptions },
        'بيانات التقرير المحوري': { data: rowsFormatted, columns: columnsConfig, options: exportOptions }
      };
      await exportMultiSheetExcel(sheetsData, {
        fileName: exportOptions.fileName,
        title: exportOptions.title
      });
      return true;
    }
    if (type === 'word') {
      exportToWord(rowsFormatted, columnsConfig, exportOptions);
      return true;
    }
    if (type === 'pdf') {
      await exportToPDF(rowsFormatted, columnsConfig, exportOptions);
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
              data={rawData}
              columns={[]}
              onCustomExport={handlePremiumExport}
              options={{
                title: 'التقرير المحوري الديناميكي الشامل',
                fileName: `Dynamic_Pivot_${dataSource}_${startMonth}_to_${endMonth}`
              }}
            />
          )
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* ─── Sidebar Configuration Panel ─────────────────────────────────── */}
        <Card className="xl:col-span-1 p-6 space-y-6 bg-white/75 dark:bg-slate-900/75 backdrop-blur-md border border-[var(--color-border)] shadow-sm no-print">
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

          {/* 2. Date Range Picker */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">الفترة الزمنية للتحليل</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-[var(--color-text-muted)]">من شهر</span>
                <input
                  type="month"
                  className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-2 rounded-xl text-xs outline-none text-[var(--color-text)] focus:border-cyan-500"
                  value={startMonth}
                  onChange={(e) => setStartMonth(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-[var(--color-text-muted)]">إلى شهر</span>
                <input
                  type="month"
                  className="bg-[var(--color-bg-card)] border border-[var(--color-border)] p-2 rounded-xl text-xs outline-none text-[var(--color-text)] focus:border-cyan-500"
                  value={endMonth}
                  onChange={(e) => setEndMonth(e.target.value)}
                />
              </div>
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

          {/* 4. Column Dimension Selection */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-[var(--color-text-muted)]">بُعد الأعمدة (أفقي)</label>
            <AutoComplete
              value={columnDim || ''}
              onChange={(val) => setColumnDim(val || null)}
              options={availableDims.map(d => ({ id: d, name: translate(d) }))}
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
        <div className="xl:col-span-3 space-y-6">
          {rawData ? (
            <PrintableTable
              title="التقرير المحوري الديناميكي الشامل"
              subtitle={`مصدر: ${DATA_SOURCES.find(d => d.id === dataSource)?.name} | الفترة: ${startMonth} إلى ${endMonth}`}
            >
              <Card className="p-6 space-y-6 border border-[var(--color-border)] shadow-sm bg-white/70 dark:bg-slate-900/70 backdrop-blur-md">
              
              {/* Toolbar */}
              <div className="flex flex-col md:flex-row gap-4 justify-between items-center no-print">
                <div className="relative w-full md:w-80">
                  <Search className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input
                    type="text"
                    placeholder="ابحث داخل صفوف التقرير..."
                    className="w-full bg-[var(--color-bg-card)] border border-[var(--color-border)] pr-10 pl-4 py-2.5 rounded-xl text-xs outline-none text-[var(--color-text)] focus:border-cyan-500"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={expandAll} className="h-9 px-4 text-[10px] rounded-lg">
                    توسيع الكل
                  </Button>
                  <Button variant="outline" onClick={collapseAll} className="h-9 px-4 text-[10px] rounded-lg">
                    طي الكل
                  </Button>
                </div>
              </div>

              {/* Table Container */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm bg-white dark:bg-slate-900">
                <table className="w-full border-collapse text-right text-xs">
                  
                  {/* Table Headers */}
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800">
                      <th className="p-4 font-black text-slate-700 dark:text-slate-200 border-l border-slate-100 dark:border-slate-800">
                        {rowDims.map(d => translate(d)).join(' ◄ ')}
                      </th>
                      {uniqueColKeys.map(ck => (
                        <th key={ck} className="p-4 font-black text-slate-700 dark:text-slate-200 text-center border-l border-slate-100 dark:border-slate-800 whitespace-nowrap min-w-[90px]">
                          {ck}
                        </th>
                      ))}
                      <th className="p-4 font-black text-cyan-700 dark:text-cyan-400 text-center whitespace-nowrap min-w-[100px]">
                        الإجمالي العام
                      </th>
                    </tr>
                  </thead>

                  {/* Table Body */}
                  <tbody>
                    {visibleRows.length > 0 ? (
                      visibleRows.map((node) => {
                        const hasChildren = node.children && node.children.length > 0;
                        const isExpanded = expandedKeys[node.key];
                        const indent = node.level * 20;

                        return (
                          <tr
                            key={node.key}
                            className={`border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-all ${
                              node.level === 0 ? 'font-bold bg-slate-50/20 dark:bg-slate-800/10' : ''
                            }`}
                          >
                            {/* Group Header cell with Indentation */}
                            <td
                              className="p-3 border-l border-slate-100 dark:border-slate-800 flex items-center gap-2 whitespace-nowrap"
                              style={{ paddingRight: `${indent + 12}px` }}
                            >
                              {hasChildren && !searchQuery ? (
                                <button
                                  onClick={() => toggleExpand(node.key)}
                                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded cursor-pointer"
                                >
                                  {isExpanded ? (
                                    <ChevronDown size={14} className="text-cyan-600 dark:text-cyan-400" />
                                  ) : (
                                    <ChevronLeft size={14} className="text-slate-400" />
                                  )}
                                </button>
                              ) : (
                                <span className="w-6 h-6 inline-block" />
                              )}
                              <span>{node.value}</span>
                              {searchQuery && (
                                <span className="text-[8px] bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 px-1.5 py-0.5 rounded-full font-normal">
                                  {translate(node.dimension)}
                                </span>
                              )}
                            </td>

                            {/* Column Values */}
                            {uniqueColKeys.map(ck => (
                              <td key={ck} className="p-3 text-center border-l border-slate-100 dark:border-slate-800 font-mono text-[11px]">
                                {formatNumber(node.colValues[ck], measure)}
                              </td>
                            ))}

                            {/* Grand Total Value */}
                            <td className="p-3 text-center font-bold font-mono text-cyan-600 dark:text-cyan-400 text-[11px] bg-cyan-50/10 dark:bg-cyan-950/5">
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
                    )}
                  </tbody>

                  {/* Table Footer (Global Totals) */}
                  <tfoot>
                    <tr className="bg-cyan-50/10 dark:bg-cyan-950/10 font-bold border-t-2 border-cyan-500 dark:border-cyan-900">
                      <td className="p-4 text-cyan-800 dark:text-cyan-300">
                        إجمالي تقرير التجميع
                      </td>
                      {uniqueColKeys.map(ck => (
                        <td key={ck} className="p-4 text-center font-mono text-cyan-800 dark:text-cyan-300 text-[11px]">
                          {formatNumber(globalColTotals[ck], measure)}
                        </td>
                      ))}
                      <td className="p-4 text-center font-mono text-cyan-600 dark:text-cyan-400 text-sm font-black bg-cyan-50/20 dark:bg-cyan-950/20">
                        {formatNumber(globalGrandTotal, measure)}
                      </td>
                    </tr>
                  </tfoot>

                </table>
              </div>
            </Card>
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
