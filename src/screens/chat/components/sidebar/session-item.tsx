'use client'

import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Delete01Icon,
  Folder01Icon,
  MoreHorizontalIcon,
  Pen01Icon,
  PinIcon,
} from '@hugeicons/core-free-icons'
import { memo, useMemo, useState } from 'react'
import { getMessageTimestamp } from '../../utils'
import type { SessionMeta } from '../../types'
import { cn } from '@/lib/utils'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'

export type SessionItemProps = {
  session: SessionMeta
  active: boolean
  isPinned: boolean
  showProjectSubtitle?: boolean
  isSessionActive?: boolean
  isSessionBlocked?: boolean
  draggable?: boolean
  onSelect?: () => void
  onTogglePin: (session: SessionMeta) => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
  onDragStartSession?: (key: string) => void
  onDropSession?: (targetKey: string) => void
}

export function formatRelativeTimeShort(timestamp?: number | null): string {
  if (!timestamp) return ''
  const diffMs = Math.max(0, Date.now() - timestamp)
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return 'now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours}h`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d`
  const diffWeeks = Math.floor(diffDays / 7)
  if (diffDays < 30) return `${diffWeeks}w`
  const diffMonths = Math.floor(diffDays / 30)
  if (diffDays < 365) return `${diffMonths}mo`
  const diffYears = Math.floor(diffDays / 365)
  return `${diffYears}y`
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuidLike(value: string): boolean {
  return UUID_PATTERN.test(value.trim())
}

function normalizeTitleValue(value: string | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  if (isUuidLike(trimmed)) return null
  return trimmed
}

function getSessionShortId(session: SessionMeta): string {
  const candidates = [session.friendlyId, session.key]
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (trimmed.length === 0) continue
    return trimmed.slice(0, 8)
  }
  return ''
}

function getSessionDisplayTitle(
  session: SessionMeta,
  isGenerating: boolean,
): string {
  const label = normalizeTitleValue(session.label)
  if (label) return label

  const derivedTitle = normalizeTitleValue(session.derivedTitle)
  if (derivedTitle) return derivedTitle

  const title = normalizeTitleValue(session.title)
  if (title) return title

  if (isGenerating) return 'Naming…'
  const shortId = getSessionShortId(session)
  return shortId ? `Session ${shortId}` : 'Session'
}

function SessionItemComponent({
  session,
  active,
  isPinned,
  showProjectSubtitle = false,
  isSessionActive = false,
  isSessionBlocked = false,
  draggable = false,
  onSelect,
  onTogglePin,
  onRename,
  onDelete,
  onDragStartSession,
  onDropSession,
}: SessionItemProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const isGenerating = session.titleStatus === 'generating'
  const isError = session.titleStatus === 'error'
  const baseTitle = getSessionDisplayTitle(session, isGenerating)

  const updatedAt = useMemo(() => {
    if (typeof session.updatedAt === 'number') return session.updatedAt
    if (session.lastMessage) return getMessageTimestamp(session.lastMessage)
    return null
  }, [session.lastMessage, session.updatedAt])

  const relativeTime = useMemo(
    () => formatRelativeTimeShort(updatedAt),
    [updatedAt],
  )

  const projectName = session.projectName || 'Personal Sandbox'

  return (
    <div
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return
        e.dataTransfer.setData('text/plain', session.key)
        onDragStartSession?.(session.key)
      }}
      onDragOver={(e) => {
        if (!draggable) return
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        if (!draggable) return
        e.preventDefault()
        setIsDragOver(false)
        onDropSession?.(session.key)
      }}
      className={cn(
        'group relative flex w-full items-center rounded-lg transition-colors',
        draggable && 'cursor-grab active:cursor-grabbing',
        isDragOver && 'border-t-2 border-accent-500',
        active
          ? 'bg-primary-200/80 dark:bg-neutral-800/80 font-medium'
          : 'hover:bg-primary-100/70 dark:hover:bg-neutral-800/40',
      )}
    >
      <Link
        to="/chat/$sessionKey"
        params={{ sessionKey: session.friendlyId }}
        onClick={() => {
          try {
            localStorage.setItem('claude-last-session', session.friendlyId)
          } catch {}
          onSelect?.()
        }}
        className={cn(
          'flex min-w-0 flex-1 items-center justify-between px-2.5 py-1.5 text-left text-xs select-none',
          showProjectSubtitle ? 'py-1.5' : 'py-1.5',
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col justify-center">
          {/* Main Title Row */}
          <div className="flex min-w-0 items-center gap-1.5">
            {session.source === 'antigravity' && (
              <span
                className="shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/20 dark:text-indigo-300 border border-indigo-500/25"
                title={
                  session.surface === 'both'
                    ? 'Antigravity (Desktop + CLI synced)'
                    : session.surface === 'cli'
                      ? 'Antigravity CLI session'
                      : 'Antigravity Desktop session'
                }
              >
                AGY
              </span>
            )}
            <span
              className={cn(
                'truncate text-[13px] leading-tight text-primary-900 dark:text-neutral-200',
                active && 'font-medium text-accent-700 dark:text-neutral-100',
                isGenerating && 'animate-pulse text-primary-600',
              )}
            >
              {baseTitle}
            </span>
          </div>

          {/* Subtitle with Project Name (shown in Status and None group modes) */}
          {showProjectSubtitle && (
            <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-primary-500 dark:text-neutral-400">
              <HugeiconsIcon
                icon={Folder01Icon}
                size={11}
                className="shrink-0 opacity-70"
              />
              <span className="truncate">{projectName}</span>
            </div>
          )}

          {isError && (
            <span className="text-[10px] text-red-500 truncate">
              {session.titleError || 'Title generation failed'}
            </span>
          )}
        </div>

        {/* Right side status indicator or relative time */}
        <div className="ml-2 flex shrink-0 items-center gap-1.5">
          {/* Context menu trigger on hover */}
          <div
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <MenuRoot>
              <MenuTrigger
                type="button"
                className={cn(
                  'inline-flex size-5 items-center justify-center rounded text-primary-400 dark:text-neutral-500',
                  'opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary-200 dark:hover:bg-neutral-700 hover:text-primary-700 dark:hover:text-neutral-200',
                  'aria-expanded:opacity-100 aria-expanded:bg-primary-200 dark:aria-expanded:bg-neutral-700',
                )}
                aria-label="Session options"
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={1.8} />
              </MenuTrigger>
              <MenuContent side="bottom" align="end">
                <MenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onTogglePin(session)
                  }}
                  className="gap-2"
                >
                  <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.5} />
                  <span>{isPinned ? 'Unpin session' : 'Pin session'}</span>
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onRename(session)
                  }}
                  className="gap-2"
                >
                  <HugeiconsIcon icon={Pen01Icon} size={16} strokeWidth={1.5} />
                  <span>Rename</span>
                </MenuItem>
                <MenuItem
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    onDelete(session)
                  }}
                  className="gap-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.5} />
                  <span>Delete</span>
                </MenuItem>
              </MenuContent>
            </MenuRoot>
          </div>

          {/* Status Dot vs Relative Time */}
          {isSessionActive ? (
            <span
              className="size-2 rounded-full bg-[#0091ff] shadow-[0_0_8px_rgba(0,145,255,0.8)] animate-pulse"
              title="Active — reasoning with LLM"
            />
          ) : isSessionBlocked ? (
            <span
              className="size-2 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]"
              title="Waiting for input"
            />
          ) : (
            <span className="text-[11px] tabular-nums text-primary-400 dark:text-neutral-500 group-hover:text-primary-600 dark:group-hover:text-neutral-400">
              {relativeTime}
            </span>
          )}
        </div>
      </Link>
    </div>
  )
}

function areSessionItemsEqual(prev: SessionItemProps, next: SessionItemProps) {
  if (prev.active !== next.active) return false
  if (prev.isPinned !== next.isPinned) return false
  if (prev.showProjectSubtitle !== next.showProjectSubtitle) return false
  if (prev.isSessionActive !== next.isSessionActive) return false
  if (prev.isSessionBlocked !== next.isSessionBlocked) return false
  if (prev.draggable !== next.draggable) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onTogglePin !== next.onTogglePin) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.session === next.session) return true
  return (
    prev.session.key === next.session.key &&
    prev.session.friendlyId === next.session.friendlyId &&
    prev.session.label === next.session.label &&
    prev.session.title === next.session.title &&
    prev.session.derivedTitle === next.session.derivedTitle &&
    prev.session.updatedAt === next.session.updatedAt &&
    prev.session.lastPromptAt === next.session.lastPromptAt &&
    prev.session.projectId === next.session.projectId &&
    prev.session.projectName === next.session.projectName &&
    prev.session.status === next.session.status &&
    prev.session.titleStatus === next.session.titleStatus &&
    prev.session.titleSource === next.session.titleSource &&
    prev.session.titleError === next.session.titleError &&
    prev.session.source === next.session.source &&
    prev.session.surface === next.session.surface
  )
}

export const SessionItem = memo(SessionItemComponent, areSessionItemsEqual)
