import React from "react";
import Card from "../ui/Card";
import { TrendingUp, TrendingDown, Minus, Target, Award } from "lucide-react";

const getPerformanceStyle = (trend) => {
  if (trend === "up") return { badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400", icon: TrendingUp, label: "ارتفاع" };
  if (trend === "down") return { badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400", icon: TrendingDown, label: "انخفاض" };
  if (trend === "none") return { badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", icon: Minus, label: "لا توجد بيانات للمقارنة" };
  return { badge: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400", icon: Minus, label: "ثبات" };
};

const formatNumber = (num) => {
  if (typeof num !== "number" && typeof num !== "string") return "0";
  const n = typeof num === "string" ? parseFloat(num.replace(/,/g, "")) : num;
  if (isNaN(n)) return num; // e.g. "غير متاح" → show the label as-is
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + " مليار";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + " مليون";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + " ألف";
  return n.toLocaleString();
};

const StatCard = ({
  label,
  value,
  subValue,
  trend,
  trendValue,
  icon: _Icon,
  color,
  progress,           // 0–100 optional
  progressLabel,      // e.g. "65% من الهدف"
  target,            // optional target value
  badge,             // optional badge text
  onClick,           // optional click handler
}) => {
  const perf = getPerformanceStyle(trend);
  const TrendIcon = perf.icon;
  const displayValue = formatNumber(value);

  return (
    <Card
      className="relative overflow-hidden group cursor-default transition-all duration-500 hover:shadow-xl hover:-translate-y-1"
      onClick={onClick}
      style={{
        borderLeft: `4px solid ${color}`,
      }}
    >
      {/* Background gradient glow */}
      <div
        className="absolute -top-20 -right-20 w-40 h-40 rounded-full opacity-[0.04] group-hover:opacity-[0.08] transition-opacity duration-700"
        style={{ background: `radial-gradient(circle, ${color}, transparent)` }}
      />

      {/* Top row: icon + optional badge */}
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 shadow-sm"
          style={{
            backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)`,
            color: color,
          }}
        >
          <_Icon size={20} strokeWidth={2.5} />
        </div>
        {badge && (
          <span
            className="text-[9px] font-black px-2 py-1 rounded-md"
            style={{
              backgroundColor: `color-mix(in srgb, ${color}, transparent 90%)`,
              color: color,
            }}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Label */}
      <p
        className="text-[11px] font-semibold mb-1.5 truncate"
        style={{ color: "var(--color-text-muted)" }}
      >
        {label}
      </p>

      {/* Value row */}
      <div className="flex items-baseline gap-2 mb-3">
        <h3
          className="text-2xl font-black tracking-tight"
          style={{ color: "var(--color-text)" }}
        >
          {displayValue}
        </h3>
        {subValue && (
          <span
            className="text-sm font-bold"
            style={{ color: "var(--color-text-muted)" }}
          >
            {subValue}
          </span>
        )}
      </div>

      {/* Trend & Target row */}
      <div className="flex items-center gap-2 flex-wrap">
        {trend && (
          <div
            className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${perf.badge}`}
          >
            <TrendIcon size={11} />
            <span>{trendValue || "-"}</span>
          </div>
        )}

        {target && (
          <div
            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${color}, transparent 90%)`,
              color: color,
            }}
          >
            <Target size={10} />
            <span>الهدف: {formatNumber(target)}</span>
          </div>
        )}
      </div>

      {/* Optional Progress Bar */}
      {progress !== undefined && (
        <div className="mt-4">
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: `color-mix(in srgb, ${color}, transparent 85%)` }}
          >
            <div
              className="h-full rounded-full transition-all duration-1000 ease-out group-hover:brightness-110"
              style={{
                width: `${Math.min(progress, 100)}%`,
                backgroundColor: color,
                boxShadow: `0 0 8px ${color}`,
              }}
            />
          </div>
          {progressLabel && (
            <p
              className="text-[9px] font-bold mt-1.5"
              style={{ color: "var(--color-text-muted)" }}
            >
              {progressLabel}
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

export default StatCard;
