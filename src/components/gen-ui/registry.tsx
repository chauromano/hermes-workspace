import { useMemo, useState } from 'react'
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
  ChartPropsSchema,
  ComparisonCardsPropsSchema,
  DataTablePropsSchema,
  InteractiveFormPropsSchema,
  KpiGridPropsSchema,
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
// 4. Comparison Cards Widget (ADRs, Architecture Options, Tradeoffs)
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
// 6. A2UI Declarative Surface Renderer (Google / CopilotKit A2UI Pattern)
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
        ) : (
          <A2UISurfaceWidget rawProps={block.props} />
        )}
      </div>
    </div>
  )
}
