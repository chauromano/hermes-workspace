import { useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import { Markmap } from 'markmap-view'
import { Transformer } from 'markmap-lib'
import plantumlEncoder from 'plantuml-encoder'
import Form from '@rjsf/core'
import validator from '@rjsf/validator-ajv8'

import {
  ArchitectureCanvasPropsSchema,
  C4DiagramPropsSchema,
  ChartPropsSchema,
  ComparisonCardsPropsSchema,
  DataTablePropsSchema,
  InteractiveFormPropsSchema,
  KpiGridPropsSchema,
  MindmapPropsSchema,
  PlantUMLPropsSchema,
  SchemaFormPropsSchema,
} from './schemas'
import type { A2UINode, GenUiBlock } from './schemas'
import { CHAT_SUBMIT_SELECTION_EVENT } from '@/screens/chat/chat-events'
import { cn } from '@/lib/utils'

const DEFAULT_CHART_COLORS = [
  'var(--theme-accent, #6366f1)',
  '#10b981',
  '#f59e0b',
  '#ec4899',
  '#3b82f6',
  '#8b5cf6',
]

export function dispatchGenUiAction(text: string) {
  if (typeof window === 'undefined' || !text.trim()) return
  window.dispatchEvent(
    new CustomEvent(CHAT_SUBMIT_SELECTION_EVENT, {
      detail: { text: text.trim() },
    }),
  )
}

function StatusBadge({
  text,
  status,
}: {
  text: string
  status?: 'healthy' | 'warning' | 'error' | 'info' | string
}) {
  const normalized = (status || text).toLowerCase()
  const styleClass =
    normalized.includes('healthy') ||
    normalized.includes('up') ||
    normalized.includes('running') ||
    normalized.includes('accept') ||
    normalized.includes('pass') ||
    normalized.includes('ok')
      ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400'
      : normalized.includes('warn') ||
          normalized.includes('propos') ||
          normalized.includes('pend') ||
          normalized.includes('medium')
        ? 'border-amber-500/30 bg-amber-500/15 text-amber-400'
        : normalized.includes('err') ||
            normalized.includes('crit') ||
            normalized.includes('down') ||
            normalized.includes('fail') ||
            normalized.includes('high')
          ? 'border-rose-500/30 bg-rose-500/15 text-rose-400'
          : 'border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)]'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        styleClass,
      )}
    >
      {text}
    </span>
  )
}

// ---------------------------------------------------------------------------
// 1. Chart Widget (Recharts)
// ---------------------------------------------------------------------------
function ChartWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = ChartPropsSchema.safeParse(rawProps)
  if (!parsed.success || parsed.data.data.length === 0) {
    return <FallbackJsonView data={rawProps} reason="Chart data is empty" />
  }
  const { chartType, data, xKey, series, height, subtitle } = parsed.data

  const resolvedSeries =
    series.length > 0
      ? series
      : Object.keys(data[0] || {})
          .filter((k) => k !== xKey && typeof data[0]?.[k] === 'number')
          .map((key) => ({ key, label: key, color: undefined }))

  return (
    <div className="space-y-2">
      {subtitle ? (
        <p className="text-xs text-[var(--theme-muted)]">{subtitle}</p>
      ) : null}
      <div style={{ width: '100%', height: height || 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" opacity={0.5} />
              <XAxis dataKey={xKey} tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  borderRadius: '0.75rem',
                  color: 'var(--theme-text)',
                }}
              />
              <Legend />
              {resolvedSeries.map((s, idx) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label || s.key}
                  stroke={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              ))}
            </LineChart>
          ) : chartType === 'area' ? (
            <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" opacity={0.5} />
              <XAxis dataKey={xKey} tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  borderRadius: '0.75rem',
                  color: 'var(--theme-text)',
                }}
              />
              <Legend />
              {resolvedSeries.map((s, idx) => {
                const color = s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label || s.key}
                    stroke={color}
                    fill={color}
                    fillOpacity={0.2}
                  />
                )
              })}
            </AreaChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  borderRadius: '0.75rem',
                  color: 'var(--theme-text)',
                }}
              />
              <Legend />
              <Pie
                data={data}
                nameKey={xKey}
                dataKey={resolvedSeries[0]?.key || 'value'}
                cx="50%"
                cy="50%"
                outerRadius={90}
                label
              >
                {data.map((_, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--theme-border)" opacity={0.5} />
              <XAxis dataKey={xKey} tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--theme-muted)', fontSize: 12 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--theme-card)',
                  borderColor: 'var(--theme-border)',
                  borderRadius: '0.75rem',
                  color: 'var(--theme-text)',
                }}
              />
              <Legend />
              {resolvedSeries.map((s, idx) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label || s.key}
                  fill={s.color || DEFAULT_CHART_COLORS[idx % DEFAULT_CHART_COLORS.length]}
                  radius={[6, 6, 0, 0]}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 2. Data Table Widget
// ---------------------------------------------------------------------------
function DataTableWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = DataTablePropsSchema.safeParse(rawProps)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [page, setPage] = useState(0)

  if (!parsed.success || parsed.data.rows.length === 0) {
    return <FallbackJsonView data={rawProps} reason="Table rows are empty" />
  }

  const { columns, rows, searchable, pageSize, rowActionLabel, rowActionPromptTemplate } =
    parsed.data

  const resolvedColumns =
    columns.length > 0
      ? columns
      : Object.keys(rows[0] || {}).map((key) => ({
          key,
          label: key,
          align: 'left' as const,
          badge: key.toLowerCase().includes('status') || key.toLowerCase().includes('state'),
        }))

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? rows.filter((r) =>
          Object.values(r).some((v) =>
            String(v ?? '')
              .toLowerCase()
              .includes(q),
          ),
        )
      : rows

    if (!sortKey) return base
    return [...base].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortAsc ? av - bv : bv - av
      }
      return sortAsc
        ? String(av ?? '').localeCompare(String(bv ?? ''))
        : String(bv ?? '').localeCompare(String(av ?? ''))
    })
  }, [rows, query, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const currentPage = Math.min(page, totalPages - 1)
  const visibleRows = filteredRows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  )

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortAsc((prev) => !prev)
    } else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  return (
    <div className="space-y-2.5">
      {searchable && rows.length > 4 ? (
        <div className="flex items-center justify-between gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            placeholder="Filter rows…"
            className="w-full max-w-xs rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1 text-xs text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none"
          />
          <span className="text-[11px] text-[var(--theme-muted)]">
            {filteredRows.length} {filteredRows.length === 1 ? 'row' : 'rows'}
          </span>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-[var(--theme-border)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--theme-border)] bg-[var(--theme-card2)] text-[var(--theme-muted)]">
              {resolvedColumns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={cn(
                    'cursor-pointer select-none px-3 py-2 font-semibold hover:text-[var(--theme-text)]',
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left',
                  )}
                >
                  {col.label}
                  {sortKey === col.key ? (sortAsc ? ' ↑' : ' ↓') : ''}
                </th>
              ))}
              {rowActionLabel ? <th className="px-3 py-2 text-right">Action</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--theme-border)]">
            {visibleRows.map((row, rIdx) => (
              <tr
                key={rIdx}
                className="transition-colors hover:bg-[var(--theme-card2)]/60"
              >
                {resolvedColumns.map((col) => {
                  const val = row[col.key]
                  const textVal = val === null || val === undefined ? '—' : String(val)
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-3 py-2 text-[var(--theme-text)]',
                        col.align === 'right'
                          ? 'text-right tabular-nums'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left',
                      )}
                    >
                      {col.badge ? <StatusBadge text={textVal} /> : textVal}
                    </td>
                  )
                })}
                {rowActionLabel ? (
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        const firstVal = String(Object.values(row)[0] ?? '')
                        const prompt = rowActionPromptTemplate
                          ? rowActionPromptTemplate.replace(/\{value\}/g, firstVal)
                          : `${rowActionLabel}: ${firstVal}`
                        dispatchGenUiAction(prompt)
                      }}
                      className="rounded-md border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2 py-1 text-[11px] font-medium text-[var(--theme-text)] hover:border-[var(--theme-accent)]"
                    >
                      {rowActionLabel}
                    </button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-[11px] text-[var(--theme-muted)]">
          <span>
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={currentPage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded border border-[var(--theme-border)] px-2 py-0.5 disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={currentPage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="rounded border border-[var(--theme-border)] px-2 py-0.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 3. KPI Grid Widget
// ---------------------------------------------------------------------------
function KpiGridWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = KpiGridPropsSchema.safeParse(rawProps)
  if (!parsed.success || parsed.data.items.length === 0) {
    return <FallbackJsonView data={rawProps} reason="KPI items are empty" />
  }
  const { columns, items } = parsed.data
  const gridCols =
    columns === 4
      ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-3'

  return (
    <div className={cn('grid gap-2.5', gridCols)}>
      {items.map((item, idx) => (
        <div
          key={`${item.label}-${idx}`}
          className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[var(--theme-muted)]">
              {item.label}
            </span>
            {item.status ? (
              <StatusBadge text={item.status} status={item.status} />
            ) : null}
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-[var(--theme-text)]">
              {item.value}
            </span>
            {item.delta ? (
              <span
                className={cn(
                  'text-xs font-medium',
                  item.trend === 'up'
                    ? 'text-emerald-400'
                    : item.trend === 'down'
                      ? 'text-rose-400'
                      : 'text-[var(--theme-muted)]',
                )}
              >
                {item.trend === 'up' ? '↑ ' : item.trend === 'down' ? '↓ ' : ''}
                {item.delta}
              </span>
            ) : null}
          </div>
          {item.subtext ? (
            <p className="mt-1 text-[11px] text-[var(--theme-muted)]">{item.subtext}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 4. Comparison Cards Widget
// ---------------------------------------------------------------------------
function ComparisonCardsWidget({
  rawProps,
}: {
  rawProps: Record<string, unknown>
}) {
  const parsed = ComparisonCardsPropsSchema.safeParse(rawProps)
  if (!parsed.success || parsed.data.items.length === 0) {
    return <FallbackJsonView data={rawProps} reason="Comparison items are empty" />
  }
  const { items } = parsed.data

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {items.map((item, idx) => (
        <div
          key={item.id || `${item.title}-${idx}`}
          className={cn(
            'flex flex-col justify-between rounded-xl border p-3.5 transition-colors',
            item.recommended
              ? 'border-[var(--theme-accent)] bg-[var(--theme-accent-soft,rgba(99,102,241,0.08))]'
              : 'border-[var(--theme-border)] bg-[var(--theme-bg)]',
          )}
        >
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-sm font-semibold text-[var(--theme-text)]">
                  {item.title}
                </h4>
                {item.subtitle ? (
                  <p className="mt-0.5 text-xs text-[var(--theme-muted)]">
                    {item.subtitle}
                  </p>
                ) : null}
              </div>
              {item.recommended || item.badge ? (
                <StatusBadge
                  text={item.badge || 'Recommended'}
                  status={item.recommended ? 'healthy' : 'info'}
                />
              ) : null}
            </div>

            {item.metrics && item.metrics.length > 0 ? (
              <div className="mt-3 grid grid-cols-2 gap-1.5 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] p-2 text-xs">
                {item.metrics.map((m, mIdx) => (
                  <div key={mIdx}>
                    <span className="block text-[10px] text-[var(--theme-muted)]">
                      {m.label}
                    </span>
                    <span className="font-semibold text-[var(--theme-text)]">
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {item.pros && item.pros.length > 0 ? (
              <div className="mt-2.5 space-y-1">
                <div className="text-[11px] font-semibold text-emerald-400">Pros</div>
                <ul className="space-y-0.5 text-xs text-[var(--theme-text)]">
                  {item.pros.map((pro, pIdx) => (
                    <li key={pIdx} className="flex items-start gap-1.5">
                      <span className="text-emerald-400">+</span>
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {item.cons && item.cons.length > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="text-[11px] font-semibold text-rose-400">Tradeoffs</div>
                <ul className="space-y-0.5 text-xs text-[var(--theme-text)]">
                  {item.cons.map((con, cIdx) => (
                    <li key={cIdx} className="flex items-start gap-1.5">
                      <span className="text-rose-400">−</span>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="mt-3 pt-2 border-t border-[var(--theme-border)] flex justify-end">
            <button
              type="button"
              onClick={() =>
                dispatchGenUiAction(
                  item.actionPrompt || `Proceed with ${item.title}`,
                )
              }
              className="rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-primary-950 hover:opacity-90"
            >
              {item.actionLabel || `Select ${item.title}`}
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 5. Interactive Form Widget
// ---------------------------------------------------------------------------
function InteractiveFormWidget({
  rawProps,
  title,
}: {
  rawProps: Record<string, unknown>
  title: string
}) {
  const parsed = InteractiveFormPropsSchema.safeParse(rawProps)
  const fields = parsed.success ? parsed.data.fields : []

  const [values, setValues] = useState<Record<string, string | number | boolean>>(
    () => {
      const initial: Record<string, string | number | boolean> = {}
      for (const field of fields) {
        if (field.defaultValue !== undefined) {
          initial[field.name] = field.defaultValue
        } else if (field.type === 'checkbox') {
          initial[field.name] = false
        } else if (field.type === 'select' && field.options?.[0]) {
          initial[field.name] = field.options[0]
        } else {
          initial[field.name] = ''
        }
      }
      return initial
    },
  )

  if (!parsed.success || fields.length === 0) {
    return <FallbackJsonView data={rawProps} reason="Form fields are empty" />
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const summaryLines = fields.map(
      (f) => `- **${f.label}**: ${String(values[f.name] ?? '')}`,
    )
    dispatchGenUiAction(`Submitted ${title}:\n${summaryLines.join('\n')}`)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {parsed.data.description ? (
        <p className="text-xs text-[var(--theme-muted)]">
          {parsed.data.description}
        </p>
      ) : null}

      <div className="space-y-2.5">
        {fields.map((field) => (
          <div key={field.name} className="space-y-1">
            <label className="block text-xs font-medium text-[var(--theme-text)]">
              {field.label}
              {field.required ? <span className="text-rose-400"> *</span> : null}
            </label>
            {field.type === 'select' ? (
              <select
                value={String(values[field.name] ?? '')}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1.5 text-xs text-[var(--theme-text)]"
              >
                {(field.options || []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : field.type === 'textarea' ? (
              <textarea
                rows={3}
                required={field.required}
                placeholder={field.placeholder}
                value={String(values[field.name] ?? '')}
                onChange={(e) =>
                  setValues((prev) => ({ ...prev, [field.name]: e.target.value }))
                }
                className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1.5 text-xs text-[var(--theme-text)]"
              />
            ) : field.type === 'checkbox' ? (
              <input
                type="checkbox"
                checked={Boolean(values[field.name])}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]: e.target.checked,
                  }))
                }
                className="size-4 rounded border-[var(--theme-border)]"
              />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                required={field.required}
                placeholder={field.placeholder}
                value={String(values[field.name] ?? '')}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.name]:
                      field.type === 'number'
                        ? Number(e.target.value)
                        : e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] px-2.5 py-1.5 text-xs text-[var(--theme-text)]"
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="submit"
          className="rounded-lg bg-[var(--theme-accent)] px-3.5 py-1.5 text-xs font-semibold text-primary-950 hover:opacity-90"
        >
          {parsed.data.submitLabel}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// 6. A2UI Declarative Surface Renderer
// ---------------------------------------------------------------------------
function A2UINodeView({ node }: { node: A2UINode }) {
  const [activeTab, setActiveTab] = useState(0)

  if (!node || typeof node !== 'object') return null

  switch (node.type) {
    case 'grid': {
      const cols =
        node.columns === 4
          ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          : node.columns === 3
            ? 'grid-cols-1 sm:grid-cols-3'
            : 'grid-cols-1 sm:grid-cols-2'
      return (
        <div className={cn('grid gap-2.5', cols)}>
          {(node.children || []).map((child, idx) => (
            <A2UINodeView key={idx} node={child} />
          ))}
        </div>
      )
    }
    case 'stack':
      return (
        <div
          className={cn(
            'flex gap-2.5',
            node.direction === 'row' ? 'flex-row flex-wrap items-center' : 'flex-col',
          )}
        >
          {(node.children || []).map((child, idx) => (
            <A2UINodeView key={idx} node={child} />
          ))}
        </div>
      )
    case 'card':
      return (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 space-y-2">
          {node.title ? (
            <div className="text-xs font-semibold text-[var(--theme-text)]">
              {node.title}
            </div>
          ) : null}
          {node.subtitle ? (
            <div className="text-[11px] text-[var(--theme-muted)]">
              {node.subtitle}
            </div>
          ) : null}
          {node.content ? (
            <p className="text-xs text-[var(--theme-text)]">{node.content}</p>
          ) : null}
          {(node.children || []).map((child, idx) => (
            <A2UINodeView key={idx} node={child} />
          ))}
        </div>
      )
    case 'stat':
      return (
        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
          <div className="text-xs text-[var(--theme-muted)]">{node.title}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-lg font-bold text-[var(--theme-text)]">
              {node.value}
            </span>
            {node.delta ? (
              <span className="text-xs text-emerald-400">{node.delta}</span>
            ) : null}
          </div>
        </div>
      )
    case 'badge':
      return (
        <StatusBadge
          text={node.content || node.title || 'Badge'}
          status={node.variant}
        />
      )
    case 'alert':
      return (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-[var(--theme-text)]">
          {node.title ? <div className="font-semibold">{node.title}</div> : null}
          {node.content ? <div className="mt-0.5 opacity-90">{node.content}</div> : null}
        </div>
      )
    case 'tabs': {
      const tabs = Array.isArray(node.tabs) ? node.tabs : []
      const current = tabs[activeTab]
      return (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1 border-b border-[var(--theme-border)] pb-1.5">
            {tabs.map((tab, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveTab(idx)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  idx === activeTab
                    ? 'bg-[var(--theme-accent)] text-primary-950'
                    : 'text-[var(--theme-muted)] hover:text-[var(--theme-text)]',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {current ? (
            <div className="space-y-2">
              {(current.children || []).map((child, idx) => (
                <A2UINodeView key={idx} node={child} />
              ))}
            </div>
          ) : null}
        </div>
      )
    }
    case 'button':
      return (
        <button
          type="button"
          onClick={() =>
            dispatchGenUiAction(
              node.actionPrompt || node.title || node.content || 'Continue',
            )
          }
          className="inline-flex items-center rounded-lg bg-[var(--theme-accent)] px-3 py-1.5 text-xs font-semibold text-primary-950 hover:opacity-90"
        >
          {node.title || node.content || 'Action'}
        </button>
      )
    case 'divider':
      return <hr className="border-[var(--theme-border)]" />
    default:
      return node.content ? (
        <p className="text-xs text-[var(--theme-text)]">{node.content}</p>
      ) : null
  }
}

function A2UISurfaceWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const rootNode = (rawProps.root || rawProps) as A2UINode
  const nodesList = Array.isArray(rawProps.nodes)
    ? (rawProps.nodes as Array<A2UINode>)
    : null

  if (nodesList && nodesList.length > 0) {
    return (
      <div className="space-y-2.5">
        {nodesList.map((n, idx) => (
          <A2UINodeView key={idx} node={n} />
        ))}
      </div>
    )
  }

  if (rootNode && typeof rootNode.type === 'string') {
    return <A2UINodeView node={rootNode} />
  }

  return <FallbackJsonView data={rawProps} reason="Unrecognized A2UI node tree" />
}

// ---------------------------------------------------------------------------
// 7. Interactive Architecture Canvas (@xyflow/react + dagre)
// ---------------------------------------------------------------------------
function CustomArchitectureNode({ data }: { data: any }) {
  const typeColors: Record<string, string> = {
    system: 'border-indigo-500/50 bg-indigo-500/10 text-indigo-300',
    container: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    database: 'border-amber-500/50 bg-amber-500/10 text-amber-300',
    external: 'border-purple-500/50 bg-purple-500/10 text-purple-300',
    user: 'border-sky-500/50 bg-sky-500/10 text-sky-300',
    default: 'border-[var(--theme-border)] bg-[var(--theme-bg)] text-[var(--theme-text)]',
  }
  const colorClass = typeColors[data.type || 'default'] || typeColors.default

  return (
    <div
      onClick={() => {
        if (data.actionPrompt) dispatchGenUiAction(data.actionPrompt)
      }}
      className={cn(
        'min-w-[150px] max-w-[220px] rounded-xl border p-2.5 shadow-md cursor-pointer transition-transform hover:scale-105',
        colorClass,
      )}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--theme-accent)]" />
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
          {data.type || 'component'}
        </span>
        {data.status ? <StatusBadge text={data.status} status={data.status} /> : null}
      </div>
      <div className="mt-1 text-xs font-semibold text-[var(--theme-text)] truncate">
        {data.label}
      </div>
      {data.technology ? (
        <div className="mt-0.5 text-[10px] text-[var(--theme-muted)] truncate">
          [{data.technology}]
        </div>
      ) : null}
      {data.description ? (
        <div className="mt-1 text-[11px] opacity-80 line-clamp-2">
          {data.description}
        </div>
      ) : null}
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--theme-accent)]" />
    </div>
  )
}

const nodeTypes = {
  default: CustomArchitectureNode,
  system: CustomArchitectureNode,
  container: CustomArchitectureNode,
  database: CustomArchitectureNode,
  external: CustomArchitectureNode,
  user: CustomArchitectureNode,
}

function ArchitectureCanvasWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = ArchitectureCanvasPropsSchema.safeParse(rawProps)
  if (!parsed.success || parsed.data.nodes.length === 0) {
    return <FallbackJsonView data={rawProps} reason="Architecture nodes are empty" />
  }

  const { direction, nodes: inputNodes, edges: inputEdges, height } = parsed.data

  const { initialNodes, initialEdges } = useMemo(() => {
    const g = new dagre.graphlib.Graph()
    g.setDefaultEdgeLabel(() => ({}))
    g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 70 })

    inputNodes.forEach((node) => {
      g.setNode(node.id, { width: 180, height: 90 })
    })

    inputEdges.forEach((edge) => {
      g.setEdge(edge.source, edge.target)
    })

    dagre.layout(g)

    const layoutedNodes: Node[] = inputNodes.map((node) => {
      const nodeWithPosition = g.node(node.id)
      return {
        id: node.id,
        type: node.type || 'default',
        position: {
          x: nodeWithPosition ? nodeWithPosition.x - 90 : 0,
          y: nodeWithPosition ? nodeWithPosition.y - 45 : 0,
        },
        data: {
          label: node.label,
          type: node.type,
          technology: node.technology,
          description: node.description,
          status: node.status,
          actionPrompt: node.actionPrompt || `Inspect component ${node.label}`,
        },
      }
    })

    const layoutedEdges: Edge[] = inputEdges.map((edge, idx) => ({
      id: edge.id || `e-${edge.source}-${edge.target}-${idx}`,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      animated: edge.animated,
      style: { stroke: 'var(--theme-accent, #6366f1)', strokeWidth: 1.5 },
      labelStyle: { fill: 'var(--theme-muted)', fontSize: 11 },
    }))

    return { initialNodes: layoutedNodes, initialEdges: layoutedEdges }
  }, [inputNodes, inputEdges, direction])

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div
      style={{ height: height || 420 }}
      className="relative w-full overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)]"
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
      >
        <Background color="var(--theme-border)" gap={16} />
        <Controls className="!bg-[var(--theme-card)] !border-[var(--theme-border)] !fill-[var(--theme-text)]" />
      </ReactFlow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 8. Mind Map Widget (markmap-view + markmap-lib)
// ---------------------------------------------------------------------------
const markmapTransformer = new Transformer()

function MindmapWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = MindmapPropsSchema.safeParse(rawProps)
  const markdownText = parsed.success
    ? (parsed.data.markdown || parsed.data.content || '').trim()
    : ''
  const height = parsed.success ? parsed.data.height : 380

  const svgRef = useRef<SVGSVGElement | null>(null)
  const mmRef = useRef<Markmap | null>(null)

  useEffect(() => {
    if (svgRef.current && !mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current, {
        autoFit: true,
        duration: 300,
      })
    }
  }, [])

  useEffect(() => {
    if (mmRef.current && markdownText) {
      const { root } = markmapTransformer.transform(markdownText)
      mmRef.current.setData(root)
      mmRef.current.fit()
    }
  }, [markdownText])

  if (!markdownText) {
    return <FallbackJsonView data={rawProps} reason="Mindmap markdown is empty" />
  }

  return (
    <div
      style={{ height }}
      className="w-full overflow-hidden rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2"
    >
      <svg ref={svgRef} className="size-full" />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 9. C4 Diagram / Flowchart Widget (mermaid)
// ---------------------------------------------------------------------------
function C4DiagramWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = C4DiagramPropsSchema.safeParse(rawProps)
  const definition = parsed.success
    ? (parsed.data.chartDefinition || parsed.data.code || '').trim()
    : ''

  const uniqueId = useId().replace(/:/g, '')
  const [svgContent, setSvgContent] = useState<string>('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true
    async function renderMermaid() {
      if (!definition) return
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          theme: 'dark',
          securityLevel: 'loose',
        })
        const { svg } = await mermaid.render(`c4-svg-${uniqueId}`, definition)
        if (isMounted) setSvgContent(svg)
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : 'Mermaid render error')
      }
    }
    renderMermaid()
    return () => {
      isMounted = false
    }
  }, [definition, uniqueId])

  if (!definition) {
    return <FallbackJsonView data={rawProps} reason="Diagram definition is empty" />
  }

  if (error) {
    return <FallbackJsonView data={definition} reason={error} />
  }

  return (
    <div
      className="w-full overflow-auto rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 flex justify-center"
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  )
}

// ---------------------------------------------------------------------------
// 10. PlantUML Diagram Widget (plantuml-encoder)
// ---------------------------------------------------------------------------
function PlantUMLWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = PlantUMLPropsSchema.safeParse(rawProps)
  const code = parsed.success ? (parsed.data.code || '').trim() : ''
  const server = parsed.success ? parsed.data.server : 'https://www.plantuml.com/plantuml'

  if (!code) {
    return <FallbackJsonView data={rawProps} reason="PlantUML code is empty" />
  }

  try {
    const encoded = plantumlEncoder.encode(code)
    const svgUrl = `${server}/svg/${encoded}`

    return (
      <div className="w-full overflow-auto rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3 flex flex-col items-center gap-2">
        <img src={svgUrl} alt="PlantUML Diagram" className="max-h-[500px] object-contain" />
        <div className="flex justify-end w-full">
          <a
            href={svgUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-[var(--theme-accent)] hover:underline"
          >
            Open Full SVG ↗
          </a>
        </div>
      </div>
    )
  } catch (err) {
    return <FallbackJsonView data={code} reason="Failed to encode PlantUML string" />
  }
}

// ---------------------------------------------------------------------------
// 11. Schema Form Widget (@rjsf/core)
// ---------------------------------------------------------------------------
function SchemaFormWidget({ rawProps }: { rawProps: Record<string, unknown> }) {
  const parsed = SchemaFormPropsSchema.safeParse(rawProps)
  if (!parsed.success) {
    return <FallbackJsonView data={rawProps} reason="Invalid JSON Schema" />
  }

  const { schema, uiSchema, formData, submitLabel } = parsed.data

  function handleSubmit({ formData }: any) {
    dispatchGenUiAction(`Submitted Configuration:\n${JSON.stringify(formData, null, 2)}`)
  }

  return (
    <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 text-xs">
      <Form
        schema={schema as any}
        uiSchema={uiSchema as any}
        formData={formData}
        validator={validator}
        onSubmit={handleSubmit}
      >
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            className="rounded-lg bg-[var(--theme-accent)] px-3.5 py-1.5 text-xs font-semibold text-primary-950 hover:opacity-90"
          >
            {submitLabel}
          </button>
        </div>
      </Form>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fallback & Top-Level Dispatcher (<GenUiRenderer />)
// ---------------------------------------------------------------------------
function FallbackJsonView({
  data,
  reason,
}: {
  data: unknown
  reason?: string
}) {
  return (
    <details className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-bg)] p-2.5 text-xs">
      <summary className="cursor-pointer font-medium text-[var(--theme-muted)]">
        {reason ? `Structured Data (${reason})` : 'View Raw Payload'}
      </summary>
      <pre className="mt-2 max-h-60 overflow-auto text-[11px] text-[var(--theme-text)]">
        {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
      </pre>
    </details>
  )
}

export function GenUiRenderer({ block }: { block: GenUiBlock }) {
  const componentType = block.component.toLowerCase()

  return (
    <div
      className="my-2.5 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-sm"
      data-gen-ui-component={componentType}
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-3.5 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden="true" className="text-sm">
            ✨
          </span>
          <span className="truncate text-xs font-semibold text-[var(--theme-text)]">
            {block.title}
          </span>
        </div>
        <span className="rounded-full bg-[var(--theme-card2)] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[var(--theme-muted)]">
          {componentType.replace(/_/g, ' ')}
        </span>
      </div>

      <div className="p-3.5">
        {block.isStreaming ? (
          <div className="flex items-center gap-2.5 py-4 text-xs text-[var(--theme-muted)]">
            <span className="size-2 animate-ping rounded-full bg-[var(--theme-accent)]" />
            <span>Rendering interactive {componentType.replace(/_/g, ' ')}…</span>
          </div>
        ) : !block.props ? (
          <FallbackJsonView
            data={block.rawPayload}
            reason={block.error || 'Malformed JSON'}
          />
        ) : componentType === 'chart' ? (
          <ChartWidget rawProps={block.props} />
        ) : componentType === 'data_table' || componentType === 'table' ? (
          <DataTableWidget rawProps={block.props} />
        ) : componentType === 'kpi_grid' || componentType === 'metrics' ? (
          <KpiGridWidget rawProps={block.props} />
        ) : componentType === 'comparison_cards' || componentType === 'comparison' ? (
          <ComparisonCardsWidget rawProps={block.props} />
        ) : componentType === 'interactive_form' || componentType === 'form' ? (
          <InteractiveFormWidget rawProps={block.props} title={block.title} />
        ) : componentType === 'architecture_canvas' || componentType === 'canvas' ? (
          <ArchitectureCanvasWidget rawProps={block.props} />
        ) : componentType === 'mindmap' || componentType === 'mind_map' ? (
          <MindmapWidget rawProps={block.props} />
        ) : componentType === 'c4_diagram' || componentType === 'mermaid' ? (
          <C4DiagramWidget rawProps={block.props} />
        ) : componentType === 'plantuml' ? (
          <PlantUMLWidget rawProps={block.props} />
        ) : componentType === 'schema_form' || componentType === 'rjsf' ? (
          <SchemaFormWidget rawProps={block.props} />
        ) : (
          <A2UISurfaceWidget rawProps={block.props} />
        )}
      </div>
    </div>
  )
}
