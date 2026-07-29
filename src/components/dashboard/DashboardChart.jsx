import React, { useState } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import Card from '../ui/Card';
import { BarChart3, DollarSign, Users, Ticket, TrendingUp } from 'lucide-react';

const METRICS = [
  { key: 'spending', label: 'التكلفة الإجمالية', icon: DollarSign, color: 'var(--color-primary)', suffix: ' ج.م' },
  { key: 'cases', label: 'عدد الحالات', icon: Users, color: 'var(--color-dash-3)', suffix: ' حالة' },
  { key: 'tickets', label: 'التذاكر الطبية', icon: Ticket, color: 'var(--color-dash-4)', suffix: ' تذكرة' },
];

const DashboardChart = ({ data = [] }) => {
  const [activeMetric, setActiveMetric] = useState('spending');
  const [chartType, setChartType] = useState('area'); // 'area' | 'bar'
  const safeData = Array.isArray(data) ? data : [];

  const metric = METRICS.find((m) => m.key === activeMetric) || METRICS[0];
  const MetricIcon = metric.icon;

  return (
    <Card className="h-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <BarChart3 size={20} />
          </div>
          <div>
            <h2 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>
              تحليل المنصرف الشهري
            </h2>
            <p className="text-[10px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
              آخر 6 أشهر
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Chart type toggle */}
          <button
            onClick={() => setChartType(chartType === 'area' ? 'bar' : 'area')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border"
            style={{
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)',
              background: 'var(--color-bg-card)',
            }}
          >
            <TrendingUp size={13} />
            {chartType === 'area' ? 'أعمدة' : 'منطقة'}
          </button>

          {/* Metric switcher */}
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setActiveMetric(m.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all duration-200"
              style={{
                backgroundColor:
                  activeMetric === m.key
                    ? `color-mix(in srgb, ${m.color}, transparent 85%)`
                    : 'transparent',
                color: activeMetric === m.key ? m.color : 'var(--color-text-muted)',
                border: `1px solid ${
                  activeMetric === m.key
                    ? `color-mix(in srgb, ${m.color}, transparent 60%)`
                    : 'var(--color-border)'
                }`,
              }}
            >
              <m.icon size={13} />
              <span className="hidden sm:inline">{m.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'area' ? (
            <AreaChart
              data={safeData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorMetric" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={metric.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={metric.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--color-border)"
                opacity={0.5}
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}أ`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-premium)',
                  fontSize: '12px',
                  padding: '10px 14px',
                }}
                itemStyle={{ color: metric.color, fontWeight: 'bold' }}
                labelStyle={{
                  color: 'var(--color-text)',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                }}
                formatter={(value) => [
                  `${value.toLocaleString()}${metric.suffix}`,
                  metric.label,
                ]}
              />
              <Area
                type="monotone"
                dataKey={metric.key}
                stroke={metric.color}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorMetric)"
                activeDot={{
                  r: 5,
                  strokeWidth: 0,
                  fill: metric.color,
                  stroke: 'var(--color-bg-card)',
                }}
              />
            </AreaChart>
          ) : (
            <BarChart
              data={safeData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--color-border)"
                opacity={0.5}
              />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11, fontWeight: 500 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}أ`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '12px',
                  boxShadow: 'var(--shadow-premium)',
                  fontSize: '12px',
                  padding: '10px 14px',
                }}
                itemStyle={{ color: metric.color, fontWeight: 'bold' }}
                labelStyle={{
                  color: 'var(--color-text)',
                  marginBottom: '4px',
                  fontWeight: 'bold',
                }}
                formatter={(value) => [
                  `${value.toLocaleString()}${metric.suffix}`,
                  metric.label,
                ]}
              />
              <Bar
                dataKey={metric.key}
                fill={metric.color}
                radius={[6, 6, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </Card>
  );
};

export default DashboardChart;
