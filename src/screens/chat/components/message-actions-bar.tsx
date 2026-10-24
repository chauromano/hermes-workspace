import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons'
import { MessageTimestamp } from './message-timestamp'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { writeTextToClipboard } from '@/lib/clipboard'
import { formatModelName } from '@/lib/format-model-name'
import { cn } from '@/lib/utils'

export type MessageTokenUsage = {
  inputTokens?: number | null
  outputTokens?: number | null
  cacheReadTokens?: number | null
  cacheWriteTokens?: number | null
}

type MessageActionsBarProps = {
  text: string
  align: 'start' | 'end'
  timestamp: number
  model?: string | null
  tokenUsage?: MessageTokenUsage | null
  forceVisible?: boolean
  isQueued?: boolean
  isFailed?: boolean
  onRetry?: () => void
}

function formatCompact(value: number): string {
  const absolute = Math.abs(value)
  if (absolute < 1000) return `${Math.round(value)}`
  if (absolute < 10_000) return `${(value / 1000).toFixed(1)}k`
  if (absolute < 100_000) return `${Math.round(value / 100) / 10}k`
  if (absolute < 1_000_000) return `${Math.round(value / 1000)}k`
  return `${Math.round(value / 100_000) / 10}m`
}

export function MessageActionsBar({
  text,
  align,
  timestamp,
  model,
  tokenUsage,
  forceVisible = false,
  isQueued = false,
  isFailed = false,
  onRetry,
}: MessageActionsBarProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await writeTextToClipboard(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      setCopied(false)
    }
  }

  const isAssistant = align === 'start'
  const formattedModel = model ? formatModelName(model) : null

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-xs text-primary-600 duration-100 ease-out mt-1 pl-1',
        isAssistant ? 'justify-start' : 'justify-end',
      )}
    >
      {/* For assistant responses: always-visible model badge */}
      {isAssistant && formattedModel && (
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100/90 dark:bg-neutral-800/90 px-2.5 py-0.5 text-[10.5px] font-medium text-neutral-600 dark:text-neutral-300 border border-neutral-200/60 dark:border-neutral-700/60 select-none shadow-2xs"
          title={`Model used: ${model}`}
        >
          <span className="size-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="max-w-[200px] truncate">{formattedModel}</span>
        </span>
      )}

      {/* Token usage if available on assistant message */}
      {isAssistant &&
        tokenUsage &&
        (tokenUsage.inputTokens != null || tokenUsage.outputTokens != null) && (
          <span className="font-mono text-[10px] tabular-nums text-neutral-400 dark:text-neutral-500 opacity-80 select-none">
            {tokenUsage.inputTokens != null && `↑${formatCompact(tokenUsage.inputTokens)}`}
            {tokenUsage.inputTokens != null && tokenUsage.outputTokens != null && ' '}
            {tokenUsage.outputTokens != null && `↓${formatCompact(tokenUsage.outputTokens)}`}
          </span>
        )}

      {/* Actions (Retry, Copy, Timestamp) — visible on hover/focus or forceVisible */}
      <div
        className={cn(
          'flex items-center gap-1.5 transition-opacity duration-100',
          forceVisible || isQueued || isFailed
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
        )}
      >
        {isFailed && onRetry && (
          <TooltipProvider>
            <TooltipRoot>
              <TooltipTrigger
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.6} />
                <span className="text-[11px] font-medium">Retry</span>
              </TooltipTrigger>
              <TooltipContent side="top">Resend failed message</TooltipContent>
            </TooltipRoot>
          </TooltipProvider>
        )}
        <TooltipProvider>
          <TooltipRoot>
            <TooltipTrigger
              type="button"
              onClick={() => {
                handleCopy().catch(() => {})
              }}
              className="inline-flex items-center justify-center rounded border border-transparent bg-transparent p-1 text-primary-700 hover:text-primary-900 hover:bg-primary-100 dark:hover:bg-primary-800"
            >
              <HugeiconsIcon
                icon={copied ? Tick02Icon : Copy01Icon}
                size={16}
                strokeWidth={1.6}
              />
            </TooltipTrigger>
            <TooltipContent side="top">Copy</TooltipContent>
          </TooltipRoot>
        </TooltipProvider>
        <MessageTimestamp timestamp={timestamp} />
      </div>
    </div>
  )
}
