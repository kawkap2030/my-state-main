import React, { useState } from "react";
import {
  FileSpreadsheet, Upload, Eye, CheckCircle2, XCircle,
  AlertTriangle, Download, Table2, ChevronRight, RefreshCw,
  FileDown
} from "lucide-react";
import invoke from "../../api/tauriApi";
import { useToast } from "../ui/Toast";
import Button from "../ui/Button";
import Card from "../ui/Card";

// ─── Step Indicator ───────────────────────────────────────────────────────────

const StepIndicator = ({ steps, currentStep }) => (
  <div className="flex items-center gap-2 mb-6" dir="rtl">
    {steps.map((step, i) => {
      const done = i < currentStep;
      const active = i === currentStep;
      return (
        <React.Fragment key={i}>
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all ${
            done ? "bg-green-100 text-green-700" :
            active ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]" :
            "bg-[var(--color-bg)] text-[var(--color-text-muted)]"
          }`}>
            {done ? <CheckCircle2 size={14} /> : <span className="w-4 h-4 flex items-center justify-center rounded-full border-2 border-current text-[10px]">{i + 1}</span>}
            {step}
          </div>
          {i < steps.length - 1 && <ChevronRight size={14} className="text-[var(--color-border)] flex-shrink-0 rotate-180" />}
        </React.Fragment>
      );
    })}
  </div>
);

// ─── Preview Table ────────────────────────────────────────────────────────────

const PreviewTable = ({ headers, rows, maxRows = 10 }) => {
  if (!headers?.length) return null;
  const displayed = rows?.slice(0, maxRows) || [];
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-xs" dir="rtl">
        <thead>
          <tr className="bg-[var(--color-bg)]">
            <th className="px-3 py-2 text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)] w-8">#</th>
            {headers.map((h, i) => (
              <th key={i} className="px-3 py-2 text-right text-[var(--color-text-muted)] font-black border-b border-[var(--color-border)] whitespace-nowrap">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] bg-[var(--color-primary)]/10 text-[var(--color-primary)] px-1 rounded">
                    عمود {i + 1}
                  </span>
                  <span className="truncate max-w-[120px]">{h || `(فارغ)`}</span>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.map((row, ri) => (
            <tr key={ri} className="border-b border-[var(--color-border)] last:border-none hover:bg-[var(--color-bg)]">
              <td className="px-3 py-2 text-center text-[var(--color-text-muted)]">{ri + 2}</td>
              {headers.map((_, ci) => (
                <td key={ci} className="px-3 py-2 text-right text-[var(--color-text)]">
                  {row[ci] || <span className="text-[var(--color-border)]">—</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── Result Panel ─────────────────────────────────────────────────────────────

const ImportResultPanel = ({ result, onReset }) => {
  const hasErrors = result.errors?.length > 0;
  const hasWarnings = result.warnings?.length > 0;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-green-50 border border-green-200 text-center">
          <CheckCircle2 size={24} className="text-green-600 mx-auto mb-1" />
          <p className="text-2xl font-black text-green-700">{result.success_count}</p>
          <p className="text-xs font-bold text-green-600">تم بنجاح</p>
        </div>
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-center">
          <XCircle size={24} className="text-red-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-red-600">{result.error_count}</p>
          <p className="text-xs font-bold text-red-500">أخطاء</p>
        </div>
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center">
          <AlertTriangle size={24} className="text-amber-500 mx-auto mb-1" />
          <p className="text-2xl font-black text-amber-600">{result.warnings?.length || 0}</p>
          <p className="text-xs font-bold text-amber-500">تحذيرات</p>
        </div>
      </div>

      {/* Errors */}
      {hasErrors && (
        <div className="p-4 rounded-2xl bg-red-50 border border-red-200 space-y-2">
          <p className="font-black text-red-700 flex items-center gap-2 text-sm">
            <XCircle size={16} /> الأخطاء ({result.errors.length})
          </p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {result.errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 font-bold">{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
          <p className="font-black text-amber-700 flex items-center gap-2 text-sm">
            <AlertTriangle size={16} /> تحذيرات ({result.warnings.length})
          </p>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {result.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">{w}</li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="secondary" onClick={onReset} className="w-full">
        استيراد ملف آخر
      </Button>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * ExcelImportWizard - A multi-step wizard for importing data from Excel
 * 
 * Props:
 *   importType: 'monthly_drugs' | 'detailed_drugs'
 *   hierarchyContext: { branchId, areaId, clinicId, dispenseMonth }
 *   onImportComplete: (result) => void
 */
const ExcelImportWizard = ({
  importType = "monthly_drugs",
  hierarchyContext = {},
  onImportComplete,
}) => {
  const toast = useToast();

  const [step, setStep] = useState(0); // 0=select, 1=preview, 2=import, 3=result
  const [filePath, setFilePath] = useState("");
  const [previewData, setPreviewData] = useState(null);
  const [selectedSheet, setSelectedSheet] = useState("");
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const steps = ["اختر الملف", "معاينة البيانات", "تأكيد الاستيراد", "النتيجة"];

  const typeConfig = {
    monthly_drugs: {
      label: "إجمالي المنصرف الشهري",
      templateType: "monthly_drugs",
      description: "يجب أن يحتوي الملف على صف بيانات واحد بالأقل مع القيم الشهرية الإجمالية.",
      command: "import_monthly_drugs_from_excel",
    },
    detailed_drugs: {
      label: "صرف الأدوية التفصيلي",
      templateType: "detailed_drugs",
      description: "كل صف يمثل دواءً واحداً. عمود اسم الدواء مطلوب ويجب أن يطابق الأسماء في قاعدة البيانات.",
      command: "import_detailed_drugs_from_excel",
    },
  };

  const config = typeConfig[importType] || typeConfig.monthly_drugs;

  // Step 0: Pick file via dialog
  const handleFilePick = async () => {
    const { open } = window.__TAURI__?.dialog || {};
    if (!open) {
      toast.error("فتح الملفات غير متاح في هذه البيئة");
      return;
    }
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Excel Files", extensions: ["xlsx", "xls"] }],
      });
      if (!selected) return;
      setFilePath(selected);
      await handlePreview(selected);
    } catch (err) {
      toast.error("فشل اختيار الملف: " + err);
    }
  };

  const handlePreview = async (path) => {
    setLoading(true);
    try {
      const data = await invoke("preview_excel_file", { filePath: path });
      setPreviewData(data);
      setSelectedSheet(data.sheets?.[0]?.name || "");
      setStep(1);
    } catch (err) {
      toast.error(err || "فشل قراءة الملف");
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setStep(2);
    try {
      const params = {
        filePath,
        sheetName: selectedSheet || null,
        dispenseMonth: hierarchyContext.dispenseMonth || new Date().toISOString().substring(0, 7),
        branchId: hierarchyContext.branchId || 1,
        areaId: hierarchyContext.areaId || null,
        clinicId: hierarchyContext.clinicId || null,
        headerRow: 0,
      };
      const result = await invoke(config.command, params);
      setImportResult(result);
      setStep(3);
      if (onImportComplete) onImportComplete(result);
      if (result.success_count > 0) {
        toast.success(`تم استيراد ${result.success_count} سجل بنجاح`);
      }
      if (result.error_count > 0) {
        toast.error(`فشل استيراد ${result.error_count} سجل`);
      }
    } catch (err) {
      toast.error(err || "فشل الاستيراد");
      setStep(1);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await invoke("export_import_template", { templateType: config.templateType });
      toast.success("تم تحميل القالب - سيتم فتح المجلد تلقائياً");
    } catch (err) {
      toast.error(err || "فشل تحميل القالب");
    }
  };

  const handleReset = () => {
    setStep(0);
    setFilePath("");
    setPreviewData(null);
    setImportResult(null);
    setSelectedSheet("");
  };

  return (
    <div className="space-y-4" dir="rtl">
      <StepIndicator steps={steps} currentStep={step} />

      {/* Step 0: Select File */}
      {step === 0 && (
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-start gap-3">
            <AlertTriangle size={18} className="text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-black text-blue-700 text-sm">تعليمات الاستيراد</p>
              <p className="text-xs text-blue-600 mt-1">{config.description}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              icon={Upload}
              onClick={handleFilePick}
              loading={loading}
              className="flex-1"
            >
              اختر ملف Excel
            </Button>
            <Button
              variant="secondary"
              icon={FileDown}
              onClick={handleDownloadTemplate}
              title="تحميل قالب Excel جاهز للتعبئة"
            >
              تحميل القالب
            </Button>
          </div>

          {/* Format info */}
          <div className="p-4 rounded-2xl bg-[var(--color-bg)] border border-[var(--color-border)]">
            <p className="text-xs font-black text-[var(--color-text-muted)] mb-2">الصيغة المتوقعة ({config.label}):</p>
            {importType === "monthly_drugs" && (
              <div className="overflow-x-auto">
                <table className="text-[10px] border-collapse" dir="rtl">
                  <thead>
                    <tr className="bg-[var(--color-primary)]/10">
                      {["مجاني سلطة","مجاني طلاب","مجاني رضع","مجاني معيل","مدعم سلطة قيمة","مدعم سلطة حصة","مدعم طلاب قيمة","مدعم طلاب حصة","مدعم رضع قيمة","مدعم رضع حصة"].map((h, i) => (
                        <th key={i} className="border border-[var(--color-border)] px-2 py-1 font-black text-[var(--color-primary)] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-[var(--color-bg-card)]">
                      {Array(10).fill("0").map((v, i) => (
                        <td key={i} className="border border-[var(--color-border)] px-2 py-1 text-center text-[var(--color-text-muted)]">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
            {importType === "detailed_drugs" && (
              <div className="overflow-x-auto">
                <table className="text-[10px] border-collapse" dir="rtl">
                  <thead>
                    <tr className="bg-[var(--color-primary)]/10">
                      {["اسم الدواء","الكمية","عدد الحالات","سعر الوحدة"].map((h, i) => (
                        <th key={i} className="border border-[var(--color-border)] px-4 py-1 font-black text-[var(--color-primary)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {["أموكسيسيلين 500مج","100","50","5.75"].map((v, i) => (
                        <td key={i} className="border border-[var(--color-border)] px-4 py-1 text-center text-[var(--color-text-muted)]">{v}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 1: Preview */}
      {step === 1 && previewData && (
        <div className="space-y-4">
          {/* Sheet selector */}
          {previewData.sheets?.length > 1 && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-black text-[var(--color-text-muted)]">الورقة:</span>
              {previewData.sheets.map((s) => (
                <button
                  key={s.name}
                  onClick={() => setSelectedSheet(s.name)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                    selectedSheet === s.name
                      ? "bg-[var(--color-primary)] text-white"
                      : "bg-[var(--color-bg)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                  }`}
                >
                  <Table2 size={12} className="inline ml-1" />
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* File info */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-green-50 border border-green-200">
            <FileSpreadsheet size={18} className="text-green-600" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-green-700 truncate">{filePath.split("\\").pop()}</p>
              <p className="text-[10px] text-green-600">
                {previewData.total_rows} صف من البيانات • {previewData.headers?.length} عمود
              </p>
            </div>
          </div>

          {/* Preview table */}
          <div>
            <p className="text-xs font-black text-[var(--color-text-muted)] mb-2 flex items-center gap-1">
              <Eye size={13} />
              معاينة أول {Math.min(10, previewData.rows?.length || 0)} صفوف
            </p>
            <PreviewTable headers={previewData.headers} rows={previewData.rows} />
          </div>

          <div className="flex gap-3">
            <Button
              variant="primary"
              icon={CheckCircle2}
              onClick={handleImport}
              loading={loading}
              className="flex-1"
            >
              بدء الاستيراد ({previewData.total_rows} صف)
            </Button>
            <Button variant="secondary" onClick={handleReset}>
              رجوع
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Importing */}
      {step === 2 && (
        <div className="py-10 text-center space-y-4">
          <RefreshCw size={40} className="animate-spin mx-auto text-[var(--color-primary)]" />
          <p className="font-black text-[var(--color-text)]">جاري استيراد البيانات...</p>
          <p className="text-xs text-[var(--color-text-muted)]">لا تغلق النافذة أثناء الاستيراد</p>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 3 && importResult && (
        <ImportResultPanel result={importResult} onReset={handleReset} />
      )}
    </div>
  );
};

export default ExcelImportWizard;
