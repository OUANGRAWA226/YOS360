import { useState, useEffect } from 'react';

type BarChartProps = {
  data: { label: string; value: number; color?: string }[];
  formatValue?: (v: number) => string;
  height?: number;
};

export function BarChart({ data, formatValue, height = 200 }: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="flex items-end justify-between gap-2 sm:gap-3" style={{ height }}>
      {data.map((d, i) => {
        const h = animated ? (d.value / max) * 100 : 0;
        const isMax = d.value === max && max > 0;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <div className="text-xs font-semibold text-slate-700 tabular-nums">
              {formatValue ? formatValue(d.value) : d.value}
            </div>
            <div
              className="w-full rounded-t-lg transition-all duration-700 ease-out relative group cursor-pointer"
              style={{
                height: `${h}%`,
                backgroundColor: d.color || (isMax ? '#0ea5e9' : '#cbd5e1'),
                minHeight: d.value > 0 ? '4px' : '0',
                transitionDelay: `${i * 60}ms`,
              }}
            >
              <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none z-10">
                {d.label}: {formatValue ? formatValue(d.value) : d.value}
              </div>
            </div>
            <div className="text-[10px] sm:text-xs text-slate-500 text-center truncate max-w-full">
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

type LineChartProps = {
  data: { label: string; value: number }[];
  formatValue?: (v: number) => string;
  height?: number;
  color?: string;
};

export function LineChart({ data, formatValue, height = 200, color = '#0ea5e9' }: LineChartProps) {
  const [animated, setAnimated] = useState(false);
  void formatValue;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, [data]);

  if (data.length === 0) return <div style={{ height }} className="flex items-center justify-center text-slate-400 text-sm">Aucune donnée</div>;

  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const width = 100;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = height - ((d.value - min) / range) * (height - 40) - 20;
    return { x, y, ...d };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[300px]">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} preserveAspectRatio="none">
          <defs>
            <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r) => (
            <line key={r} x1="0" y1={height * r} x2={width} y2={height * r} stroke="#e2e8f0" strokeWidth="0.3" />
          ))}
          <path d={areaD} fill="url(#lineGradient)" />
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 1000,
              strokeDashoffset: animated ? 0 : 1000,
              transition: 'stroke-dashoffset 1.5s ease-out',
            }}
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r="1.5"
                fill={color}
                className="opacity-0"
                style={{
                  animation: `fadeIn 0.3s ease-out ${i * 100 + 500}ms forwards`,
                }}
              />
            </g>
          ))}
        </svg>
        <div className="flex justify-between mt-2 px-1">
          {data.map((d, i) => (
            <div key={i} className="text-[10px] text-slate-500 flex-1 text-center truncate">{d.label}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

type DonutChartProps = {
  data: { label: string; value: number; color: string }[];
  size?: number;
};

export function DonutChart({ data, size = 160 }: DonutChartProps) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(t);
  }, [data]);

  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div style={{ width: size, height: size }} className="flex items-center justify-center text-slate-400 text-sm">Aucune donnée</div>;

  const radius = size / 2 - 10;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const segments = data.map((d) => {
    const fraction = d.value / total;
    const dash = fraction * circumference * (animated ? 1 : 0);
    const seg = {
      dash,
      gap: circumference - dash,
      offset: -offset,
      ...d,
    };
    offset += dash;
    return seg;
  });

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width={size} height={size} className="flex-shrink-0">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={strokeWidth} />
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={s.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${s.dash} ${s.gap}`}
              strokeDashoffset={s.offset}
              strokeLinecap="round"
              style={{ transition: `stroke-dasharray 1s ease-out ${i * 150}ms` }}
            />
          ))}
        </g>
        <text x={size / 2} y={size / 2} textAnchor="middle" dominantBaseline="central" className="text-2xl font-bold fill-slate-900">
          {total}
        </text>
        <text x={size / 2} y={size / 2 + 16} textAnchor="middle" dominantBaseline="central" className="text-[10px] fill-slate-400">
          Total
        </text>
      </svg>
      <div className="space-y-2 flex-1 min-w-[120px]">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-slate-600 flex-1 truncate">{d.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{d.value}</span>
            <span className="text-slate-400 text-xs tabular-nums">
              {((d.value / total) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

type SparklineProps = {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
};

export function Sparkline({ data, color = '#0ea5e9', width = 120, height = 36 }: SparklineProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 4) - 2}`);
  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={`spark-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.15" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#spark-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
