import React from 'react';
import Card from '../ui/Card';
import { TrendingUp, Activity, Target, CheckCircle2, AlertTriangle } from 'lucide-react';

const MetricRow = ({ label, actual, target, unit = '', color = 'var(--color-primary)' }) => {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  const isOnTrack = pct >= 90;
  const isWarning = pct >= 70 && pct < 90;
  const isCritical = pct < 70;

  const statusColor = isOnTrack
    ? 'var(--color-success)'
    : isWarning
    ? 'var(--color-warning)'
    : 'var(--color-danger)';

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <statusIcon size={12} style={{ color: statusColor }} />
          <span className="text-[11px] font-bold truncate" style={{ color: 'var(--color-text)' }}>
            {label}
          </span>
        </div>
        <span className="text-[10px] font-black" style={{ color: statusColor }}>
          {actual.toLocaleString()} / {target.toLocaleString()} {unit}
        </span>
      </div>

      {/* Progress bar */}
      <div
        className="w-full h-2 rounded-full overflow-hidden"
        style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)` }}
      >
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
      </div>

      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
          {pct.toFixed(0)}% من الهدف
        </span>
        {isOnTrack && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            جيد
          </span>
        )}
        {isWarning && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            يحتاج متابعة
          </span>
        )}
        {isCritical && (
          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400">
            متأخر
          </span>
        )}
      </div>
    </div>
  );
};

const PerformanceSummary = ({ metrics = [], title = 'ملخص الأداء الشهري' }) => {
  if (!metrics || metrics.length === 0) {
    return (
      <Card className="h-full">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Activity size={16} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)] opacity-60">
          <Target size={28} className="mb-2" />
          <p className="text-xs font-bold">لا توجد بيانات أداء متاحة</p>
          <p className="text-[10px]">اختر فرعاً وشهراً للعرض</p>
        </div>
      </Card>
    );
  }

  // Calculate overall score
  const avgPct = metrics.reduce((sum, m) => sum + (m.target > 0 ? Math.min(m.actual / m.target, 1) : 0), 0) / metrics.length;
  const overallScore = Math.round(avgPct * 100);

  return (
    <Card className="h-full">
      {/* Header with overall score */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <Activity size={16} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: 'var(--color-text)' }}>
            {title}
          </h3>
        </div>

        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-black"
          style={{
            backgroundColor:
              overallScore >= 90
                ? 'var(--color-success-bg)'
                : overallScore >= 70
                ? 'var(--color-warning-bg)'
                : 'var(--color-danger-bg)',
            color:
              overallScore >= 90
                ? 'var(--color-success)'
                : overallScore >= 70
                ? 'var(--color-warning)'
                : 'var(--color-danger)',
          }}
        >
          <TrendingUp size={12} />
          <span>{overallScore}%</span>
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-4">
        {metrics.map((m, i) => (
          <MetricRow key={i} {...m} />
        ))}
      </div>
    </Card>
  );
};

export default PerformanceSummary;
