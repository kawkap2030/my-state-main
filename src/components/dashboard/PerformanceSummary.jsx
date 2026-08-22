import React from 'react';
import Card from '../ui/Card';
import { Activity, Pill, Syringe, Ticket, Layers, Scale, Package, ClipboardList, Info } from 'lucide-react';

const SECTION_ICONS = [
  Pill,          // الأدوية التفصيلية
  Pill,          // الأدوية (إجماليات شهرية)
  Syringe,       // الإنسولين
  Ticket,        // التذاكر الطبية
  Layers,        // المجموعات الدوائية
  Scale,         // أحكام المحكمة
  Package,       // المستلزمات
];

const formatNumber = (num) => {
  const n = typeof num === 'string' ? parseFloat(num.replace(/,/g, '')) : num;
  if (typeof n !== 'number' || isNaN(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + ' مليون';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + ' ألف';
  return n.toLocaleString();
};

const MetricItem = ({ label, actual, unit = '', color = 'var(--color-primary)', hasData, icon, breakdown = [] }) => {
  const Icon = icon || ClipboardList;
  return (
    <div
      className="flex items-center gap-3 p-3 rounded-xl border transition-colors"
      style={{
        borderColor: hasData ? `color-mix(in srgb, ${color}, transparent 78%)` : 'var(--color-border)',
        background: hasData ? `color-mix(in srgb, ${color}, transparent 94%)` : 'transparent',
      }}
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{
          backgroundColor: hasData ? `color-mix(in srgb, ${color}, transparent 88%)` : 'var(--color-border)',
          color: hasData ? color : 'var(--color-text-muted)',
        }}
      >
        <Icon size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold truncate" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </p>
        <p className="text-sm font-black truncate" style={{ color: hasData ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
          {hasData
            ? `${formatNumber(actual)} ${unit}`
            : 'لا توجد بيانات'}
        </p>
        {hasData && breakdown.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {breakdown.map((b, j) => (
              <p key={j} className="text-[9px] font-bold" style={{ color: 'var(--color-text-muted)' }}>
                {b.label}: {formatNumber(b.value)} {b.unit}
              </p>
            ))}
          </div>
        )}
      </div>

      {hasData && (
        <span
          className="text-[9px] font-black px-2 py-1 rounded-full shrink-0"
          style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 90%)`, color }}
        >
          {formatNumber(actual)} {unit}
        </span>
      )}
    </div>
  );
};

const PerformanceSummary = ({ metrics = [], title = 'ملخص الأداء الشهري' }) => {
  const isEmpty = !metrics || metrics.length === 0;

  return (
    <Card className="w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Activity size={18} />
        </div>
        <div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
          <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
            قيم فعلية لكل قسم — بدون أهداف أو نسب تقديرية
          </p>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)] opacity-60">
          <Info size={28} className="mb-2" />
          <p className="text-xs font-bold">لا توجد بيانات أداء متاحة</p>
          <p className="text-[10px]">اختر فرعاً وشهراً للعرض</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {metrics.map((m, i) => {
            const Icon = SECTION_ICONS[i] || ClipboardList;
            return (
              <MetricItem
                key={i}
                label={m.label}
                actual={m.actual ?? 0}
                unit={m.unit}
                color={m.color}
                hasData={!!m.has_data}
                icon={Icon}
                breakdown={Array.isArray(m.breakdown) ? m.breakdown : []}
              />
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default PerformanceSummary;
