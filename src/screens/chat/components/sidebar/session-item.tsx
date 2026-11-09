'use client'

import { Link } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Archive02Icon,
  Chat01Icon,
  Delete01Icon,
  MoreHorizontalIcon,
  Pen01Icon,
  PinIcon,
} from '@hugeicons/core-free-icons'
import { memo, useMemo } from 'react'
import { getMessageTimestamp } from '../../utils'
import type { SessionMeta } from '../../types'
import { cn } from '@/lib/utils'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'

type SessionItemProps = {
  session: SessionMeta
  active: boolean
  isPinned: boolean
  onSelect?: () => void
  onTogglePin: (session: SessionMeta) => void
  onRename: (session: SessionMeta) => void
  onToggleArchive: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function formatSessionTimestamp(timestamp?: number | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const sameDay = date.toDateString() === now.toDateString()
  return (sameDay ? timeFormatter : dayFormatter).format(date)
}

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
  return 'Chat'
}

function SessionItemComponent({
  session,
  active,
  isPinned,
  onSelect,
  onTogglePin,
  onRename,
  onToggleArchive,
  onDelete,
}: SessionItemProps) {
  const isGenerating = session.titleStatus === 'generating'
  const isError = session.titleStatus === 'error'
  const baseTitle = getSessionDisplayTitle(session, isGenerating)

  const updatedAt = useMemo(() => {
    if (typeof session.updatedAt === 'number') return session.updatedAt
    if (session.lastMessage) return getMessageTimestamp(session.lastMessage)
    return null
  }, [session.lastMessage, session.updatedAt])

  const subtitle = useMemo(() => {
    if (isError) {
      return session.titleError || 'Could not generate a title'
    }
    const parts: Array<string> = []
    const formatted = formatSessionTimestamp(updatedAt)
    if (formatted) parts.push(formatted)
    if (session.projectName) {
      parts.push(session.projectName)
    }
    const rawProfile = session.profileName ?? session.profile
    const validProfile =
      rawProfile && !['default', 'general'].includes(rawProfile.toLowerCase())
        ? rawProfile
        : null
    if (validProfile) {
      const cleanProfile = validProfile.startsWith('@') ? validProfile : `@${validProfile}`
      parts.push(cleanProfile)
    }
    if (session.archived) {
      parts.push('Archived')
    }
    return parts.join(' • ')
  }, [
    isError,
    session.projectName,
    session.profileName,
    session.profile,
    session.titleError,
    session.archived,
    updatedAt,
  ])

  return (
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
        'group flex items-center gap-2 w-full text-left px-2.5 py-1.5 rounded-md transition-all duration-150',
        'select-none relative',
        active
          ? 'bg-accent-500/10 text-accent-500 font-semibold'
          : 'text-primary-900 dark:text-neutral-100 hover:bg-primary-200/60 dark:hover:bg-primary-800/50',
      )}
    >
      {/* Left Icon (chat bubble, no bulky box) */}
      <span
        className={cn(
          'flex size-4 shrink-0 items-center justify-center transition-colors',
          active
            ? 'text-accent-500'
            : isPinned
              ? 'text-accent-500'
              : 'text-primary-400 group-hover:text-primary-700 dark:text-neutral-400 dark:group-hover:text-neutral-200',
        )}
      >
        {isPinned ? (
          <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={1.8} />
        ) : (
          <HugeiconsIcon icon={Chat01Icon} size={14} strokeWidth={1.6} />
        )}
      </span>

      {/* Title & Subtitle */}
      <div className="flex-1 min-w-0 py-0.5">
        <div
          className={cn(
            'truncate text-xs font-medium leading-snug',
            active
              ? 'text-accent-500 dark:text-accent-400 font-semibold'
              : 'text-primary-900 dark:text-neutral-100',
            isGenerating ? 'animate-pulse text-primary-500' : '',
          )}
        >
          {baseTitle}
        </div>
        {subtitle ? (
          <div
            className={cn(
              'mt-0.5 text-[11px] text-primary-500 dark:text-neutral-400 truncate leading-tight',
              isError ? 'text-red-500' : undefined,
            )}
          >
            {subtitle}
          </div>
        ) : null}
      </div>

      {/* Pinned Icon Indicator (visible on row when pinned and not hovered) */}
      {isPinned && (
        <span
          className="flex size-5 items-center justify-center text-accent-500 shrink-0 group-hover:hidden"
          title="Pinned session"
        >
          <HugeiconsIcon icon={PinIcon} size={12} strokeWidth={2} />
        </span>
      )}

      {/* Active Dot (when not pinned) */}
      {active && !isPinned && (
        <span className="size-1.5 rounded-full bg-accent-500 shrink-0 mr-1 group-hover:hidden" />
      )}

      {/* Actions: Quick Pin Button + More Menu */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onTogglePin(session)
          }}
          aria-label={isPinned ? 'Unpin session' : 'Pin session'}
          title={isPinned ? 'Unpin session' : 'Pin session'}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md transition-all',
            isPinned
              ? 'text-accent-500 hover:bg-accent-500/20 opacity-0 group-hover:opacity-100'
              : 'text-primary-400 hover:text-primary-900 dark:hover:text-primary-100 hover:bg-primary-200 dark:hover:bg-primary-700 opacity-0 group-hover:opacity-100',
          )}
        >
          <HugeiconsIcon
            icon={PinIcon}
            size={13}
            strokeWidth={isPinned ? 2 : 1.5}
          />
        </button>

        <MenuRoot>
          <MenuTrigger
            type="button"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
            }}
            className={cn(
              'inline-flex size-6 items-center justify-center rounded-md text-primary-500 dark:text-primary-400',
              'opacity-0 transition-opacity group-hover:opacity-100 hover:bg-primary-200 dark:hover:bg-primary-700',
              'aria-expanded:opacity-100 aria-expanded:bg-primary-200 dark:aria-expanded:bg-primary-700',
            )}
            aria-label="Session options"
          >
            <HugeiconsIcon
              icon={MoreHorizontalIcon}
              size={16}
              strokeWidth={1.5}
            />
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
              <HugeiconsIcon icon={PinIcon} size={16} strokeWidth={1.5} />{' '}
              {isPinned ? 'Unpin session' : 'Pin session'}
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onRename(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={Pen01Icon} size={16} strokeWidth={1.5} />{' '}
              Rename
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onToggleArchive(session)
              }}
              className="gap-2"
            >
              <HugeiconsIcon icon={Archive02Icon} size={16} strokeWidth={1.5} />{' '}
              {session.archived ? 'Unarchive' : 'Archive'}
            </MenuItem>
            <MenuItem
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onDelete(session)
              }}
              className="text-red-700 dark:text-red-400 gap-2 hover:bg-red-50 dark:hover:bg-red-900/30 data-highlighted:bg-red-50/80"
            >
              <HugeiconsIcon icon={Delete01Icon} size={16} strokeWidth={1.5} />{' '}
              Delete
            </MenuItem>
          </MenuContent>
        </MenuRoot>
      </div>
    </Link>
  )
}

function areSessionItemsEqual(prev: SessionItemProps, next: SessionItemProps) {
  if (prev.active !== next.active) return false
  if (prev.isPinned !== next.isPinned) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onTogglePin !== next.onTogglePin) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onToggleArchive !== next.onToggleArchive) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.session === next.session) return true
  return (
    prev.session.key === next.session.key &&
    prev.session.friendlyId === next.session.friendlyId &&
    prev.session.label === next.session.label &&
    prev.session.title === next.session.title &&
    prev.session.derivedTitle === next.session.derivedTitle &&
    prev.session.updatedAt === next.session.updatedAt &&
    prev.session.titleStatus === next.session.titleStatus &&
    prev.session.titleSource === next.session.titleSource &&
    prev.session.titleError === next.session.titleError &&
    prev.session.projectName === next.session.projectName &&
    prev.session.archived === next.session.archived &&
    (prev.session.profileName ?? prev.session.profile) ===
      (next.session.profileName ?? next.session.profile)
  )
}

const SessionItem = memo(SessionItemComponent, areSessionItemsEqual)

export { SessionItem }
