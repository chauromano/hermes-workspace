'use client'

import { memo, useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import {
  PreviewCard,
  PreviewCardPopup,
  PreviewCardTrigger,
} from '@/components/ui/preview-card'

const POLL_MS = 15_000

type ContextData = {
  contextPercent: number
  model: string
  maxTokens: number
  usedTokens: number
}

const EMPTY: ContextData = {
  contextPercent: 0,
  model: '',
  maxTokens: 0,
  usedTokens: 0,
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return String(n)
}

function ContextBarComponent({
  compact = false,
  sessionId,
}: {
  compact?: boolean
  sessionId?: string
}) {
  const [ctx, setCtx] = useState<ContextData>(EMPTY)
  const [showLabel, setShowLabel] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const params = sessionId
        ? `?sessionId=${encodeURIComponent(sessionId)}`
        : ''
      const res = await fetch(`/api/context-usage${params}`)
      if (!res.ok) return
      const data = await res.json()
      if (data.ok) {
        setCtx({
          contextPercent: data.contextPercent ?? 0,
          model: data.model ?? '',
          maxTokens: data.maxTokens ?? 0,
          usedTokens: data.usedTokens ?? 0,
        })
      }
    } catch {
      /* ignore */
    }
  }, [sessionId])

  useEffect(() => {
    void refresh()
    const id = window.setInterval(refresh, POLL_MS)
    return () => window.clearInterval(id)
  }, [refresh])

  useEffect(() => {
    if (!showLabel) return
    const id = setTimeout(() => setShowLabel(false), 3000)
    return () => clearTimeout(id)
  }, [showLabel])

  const pct = ctx.contextPercent
  const clampedPct = Math.min(Math.max(pct, 0), 100)

  // Hide only before any model/context info has loaded.
  if (ctx.maxTokens <= 0 && ctx.usedTokens <= 0 && !ctx.model) return null
  const isCritical = clampedPct > 90
  const isDanger = clampedPct >= 75 && clampedPct <= 90
  const isWarning = clampedPct >= 50 && clampedPct < 75

  const barColor = isCritical
    ? 'bg-red-500'
    : isDanger
      ? 'bg-orange-500'
      : isWarning
        ? 'bg-yellow-400'
        : 'bg-emerald-500'

  const barBg = isCritical
    ? 'bg-red-100'
    : isDanger
      ? 'bg-orange-100'
      : isWarning
        ? 'bg-yellow-100'
        : 'bg-emerald-100'

  const textColor = isCritical
    ? 'text-red-600'
    : isDanger
      ? 'text-orange-600'
      : isWarning
        ? 'text-yellow-600'
        : 'text-emerald-600'

  if (compact) {
    const radius = 7
    const circumference = 2 * Math.PI * radius
    const strokeDashoffset = circumference * (1 - clampedPct / 100)

    const strokeColor = isCritical
      ? 'text-red-500'
      : isDanger
        ? 'text-orange-500'
        : isWarning
          ? 'text-amber-500'
          : 'text-emerald-500'

    const trackColor = isCritical
      ? 'text-red-200 dark:text-red-950/60'
      : isDanger
        ? 'text-orange-200 dark:text-orange-950/60'
        : isWarning
          ? 'text-amber-200 dark:text-amber-950/60'
          : 'text-neutral-200 dark:text-neutral-700/80'

    return (
      <PreviewCard open={open} onOpenChange={setOpen}>
        <PreviewCardTrigger
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen((prev) => !prev)
          }}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer select-none"
          title={`Context window: ${Math.round(clampedPct)}% (${formatTokens(ctx.usedTokens)}/${formatTokens(ctx.maxTokens)})`}
          aria-label={`Context window: ${Math.round(clampedPct)}% used`}
        >
          <svg
            className="size-4 -rotate-90"
            viewBox="0 0 20 20"
            aria-hidden="true"
          >
            {/* Background track circle */}
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className={trackColor}
            />
            {/* Filled progress donut segment */}
            <circle
              cx="10"
              cy="10"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className={cn('transition-all duration-500 ease-out', strokeColor)}
            />
          </svg>
        </PreviewCardTrigger>

        <PreviewCardPopup
          align="end"
          sideOffset={8}
          className="w-64 rounded-xl p-3 shadow-xl"
        >
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-neutral-800 dark:text-neutral-100">
                Context Window
              </span>
              <span className={cn('font-bold tabular-nums', textColor)}>
                {Math.round(clampedPct)}%
              </span>
            </div>
            <div className={cn('w-full h-1.5 rounded-full overflow-hidden', barBg)}>
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  barColor,
                )}
                style={{ width: `${clampedPct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
              <span className="tabular-nums">
                {formatTokens(ctx.usedTokens)} / {formatTokens(ctx.maxTokens)} tokens
              </span>
              {ctx.model && (
                <span
                  className="truncate max-w-[100px] font-mono text-[10px]"
                  title={ctx.model}
                >
                  {ctx.model}
                </span>
              )}
            </div>
            {isCritical && (
              <p className="text-[10px] text-red-600 dark:text-red-400 font-medium pt-1 border-t border-neutral-100 dark:border-neutral-800">
                Context almost full — consider starting a new chat
              </p>
            )}
          </div>
        </PreviewCardPopup>
      </PreviewCard>
    )
  }

  if (isMobile) {
    return (
      <div className="relative w-full">
        {/* Invisible tap target */}
        <button
          type="button"
          className="absolute inset-x-0 -top-2 -bottom-2 z-10"
          onClick={() => setShowLabel((prev) => !prev)}
          aria-label={`Context: ${Math.round(clampedPct)}% used`}
        />
        {/* Bar — always 3px, never moves */}
        <div className={cn('w-full h-[3px]', barBg)}>
          <div
            className={cn(
              'h-full transition-all duration-700 ease-out',
              barColor,
            )}
            style={{ width: `${clampedPct}%` }}
          />
        </div>
        {/* Label floats below bar on tap */}
        {showLabel && (
          <div className="absolute right-2 top-[5px] z-20 flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary-900/85 shadow-sm animate-in fade-in duration-150">
            <span className="text-[10px] font-semibold tabular-nums text-white">
              {Math.round(clampedPct)}%
            </span>
            <span className="text-[9px] text-white/70 tabular-nums">
              {formatTokens(ctx.usedTokens)}/{formatTokens(ctx.maxTokens)}
            </span>
          </div>
        )}
      </div>
    )
  }

  return (
    <PreviewCard>
      <PreviewCardTrigger className="block w-full cursor-pointer">
        <div
          className={cn(
            'shrink-0 w-full h-2 transition-colors duration-300 relative',
            barBg,
          )}
        >
          <div
            className={cn(
              'h-full transition-all duration-700 ease-out',
              barColor,
            )}
            style={{ width: `${clampedPct}%` }}
          />
          {/* % shown on hover via popup only */}
        </div>
      </PreviewCardTrigger>

      <PreviewCardPopup
        align="center"
        sideOffset={2}
        className="w-64 px-3 py-2.5 rounded-lg"
      >
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-primary-900">
              Context Window
            </span>
            <span
              className={cn(
                'text-[11px] font-semibold tabular-nums',
                textColor,
              )}
            >
              {Math.round(clampedPct)}%
            </span>
          </div>
          <div className={cn('w-full h-2 rounded-full overflow-hidden', barBg)}>
            <div
              className={cn(
                'h-full rounded-full transition-all duration-500',
                barColor,
              )}
              style={{ width: `${clampedPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-primary-500 tabular-nums">
              {formatTokens(ctx.usedTokens)} / {formatTokens(ctx.maxTokens)}{' '}
              tokens
            </span>
            {ctx.model && (
              <span className="text-[10px] text-primary-400 truncate max-w-[100px]">
                {ctx.model}
              </span>
            )}
          </div>
          {isCritical && (
            <p className="text-[10px] text-red-600 font-medium">
              Context almost full — consider starting a new chat
            </p>
          )}
        </div>
      </PreviewCardPopup>
    </PreviewCard>
  )
}

export const ContextBar = memo(ContextBarComponent)
