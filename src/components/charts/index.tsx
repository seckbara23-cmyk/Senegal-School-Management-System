// ─── Dependency-free chart kit (Phase 5) ─────────────────────────────────────
//
// Pure presentational, server-component-safe (no hooks, no client lib). SVG +
// CSS only, matching the existing finance-dashboard bar style. Colours are
// driven by Tailwind text-* classes via currentColor so charts theme cleanly.

import type { ReactNode } from 'react'

const TONE_ACCENT: Record<string, string> = {
  primary: 'text-primary-700', emerald: 'text-emerald-600', amber: 'text-amber-600',
  red: 'text-red-600', sky: 'text-sky-600', gray: 'text-gray-700', accent: 'text-accent-700',
}

// ── KPI card ──────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, href, tone = 'gray', icon }: {
  label: string; value: ReactNode; sub?: string; href?: string; tone?: keyof typeof TONE_ACCENT | string; icon?: ReactNode
}) {
  const inner = (
    <div className="h-full rounded-xl border border-sand-200 bg-white p-4 shadow-sm transition-colors hover:border-primary-200">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
        {icon}
      </div>
      <p className={`mt-1 text-2xl font-bold ${TONE_ACCENT[tone] ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  )
  return href ? <a href={href} className="block">{inner}</a> : inner
}

// ── Horizontal labelled bar ───────────────────────────────────────────────────
export function HBar({ label, value, max, display, barClass = 'bg-primary-500' }: {
  label: string; value: number; max: number; display?: string; barClass?: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="truncate text-gray-600">{label}</span>
        <span className="ml-2 shrink-0 font-semibold text-gray-900">{display ?? value}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sand-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Vertical bar chart (responsive flexbox) ───────────────────────────────────
export function BarChart({ data, barClass = 'bg-primary-500', height = 140 }: {
  data: { label: string; value: number; display?: string }[]; barClass?: string; height?: number
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
          <span className="text-[10px] font-semibold text-gray-500">{d.display ?? (d.value || '')}</span>
          <div className={`w-full rounded-t ${barClass}`} style={{ height: `${Math.max(2, Math.round((d.value / max) * (height - 28)))}px` }} title={`${d.label}: ${d.value}`} />
          <span className="w-full truncate text-center text-[10px] text-gray-400" title={d.label}>{d.label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sparkline / line chart (SVG polyline, currentColor) ───────────────────────
export function Sparkline({ points, className = 'text-primary-600', width = 260, height = 60 }: {
  points: number[]; className?: string; width?: number; height?: number
}) {
  if (points.length === 0) return <div className="text-xs text-gray-400">Aucune donnée</div>
  const max = Math.max(...points), min = Math.min(...points)
  const span = max - min || 1
  const stepX = points.length > 1 ? width / (points.length - 1) : 0
  const coords = points.map((p, i) => {
    const x = i * stepX
    const y = height - 4 - ((p - min) / span) * (height - 8)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={`w-full ${className}`} preserveAspectRatio="none" style={{ height }}>
      <polyline points={coords.join(' ')} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.length === 1 && <circle cx={0} cy={height / 2} r={3} fill="currentColor" />}
    </svg>
  )
}

// ── Donut / progress ring (single value 0–100) ────────────────────────────────
export function ProgressRing({ value, label, className = 'text-emerald-500', size = 96 }: {
  value: number; label?: string; className?: string; size?: number
}) {
  const r = (size - 12) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(100, value))
  const dash = (pct / 100) * c
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className={className} style={{ width: size, height: size }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="text-sand-100" stroke="currentColor" strokeWidth={8} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute text-center">
        <p className="text-lg font-bold text-gray-900">{Math.round(pct)}%</p>
        {label && <p className="text-[10px] text-gray-400">{label}</p>}
      </div>
    </div>
  )
}

// ── Section wrapper for analytics panels ──────────────────────────────────────
export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-sand-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
