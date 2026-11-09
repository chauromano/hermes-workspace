import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  Cancel01Icon,
  Castle02Icon,
  Chat01Icon,
  CheckListIcon,
  DashboardSquare01Icon,
  File01Icon,
  Folder01Icon,
  Clock01Icon,
  CommandLineIcon,
  McpServerIcon,
  Menu01Icon,
  PinIcon,
  PlusSignIcon,
  PuzzleIcon,
  Rocket01Icon,
  Search01Icon,
  Settings01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessionMeta } from '@/screens/chat/types'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { getTheme, getThemeVariant, isDarkTheme, setTheme } from '@/lib/theme'
import { ProjectSwitcher } from '@/components/projects/project-switcher'
import {
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { useSettingsStore } from '@/hooks/use-settings'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'

export type MobileNavItemDef = {
  id: string
  label: string
  icon: any
  to: string
  match: (p: string) => boolean
}

export const MOBILE_COMMAND_ITEMS: Array<MobileNavItemDef> = [
  {
    id: 'command',
    label: 'Command Center',
    icon: DashboardSquare01Icon,
    to: '/chat',
    match: (p: string) => p === '/chat' || p === '/' || p === '/new',
  },
  {
    id: 'operations',
    label: 'Agents',
    icon: UserMultipleIcon,
    to: '/operations',
    match: (p: string) => p.startsWith('/operations'),
  },
  {
    id: 'tasks',
    label: 'Kanban',
    icon: CheckListIcon,
    to: '/tasks',
    match: (p: string) => p.startsWith('/tasks'),
  },
  {
    id: 'missions',
    label: 'Missions',
    icon: Rocket01Icon,
    to: '/conductor',
    match: (p: string) => p.startsWith('/conductor'),
  },
  {
    id: 'swarm',
    label: 'Swarm Studio',
    icon: UserGroupIcon,
    to: '/swarm',
    match: (p: string) => p === '/swarm' || p.startsWith('/swarm2'),
  },
  {
    id: 'echo-studio',
    label: 'Echo Studio',
    icon: Rocket01Icon,
    to: '/echo-studio',
    match: (p: string) => p.startsWith('/echo-studio'),
  },
]

export const MOBILE_WORKSPACE_ITEMS: Array<MobileNavItemDef> = [
  {
    id: 'projects',
    label: 'Projects',
    icon: Folder01Icon,
    to: '/projects',
    match: (p: string) => p.startsWith('/projects'),
  },
  {
    id: 'files',
    label: 'Files',
    icon: File01Icon,
    to: '/files',
    match: (p: string) => p.startsWith('/files'),
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: CommandLineIcon,
    to: '/terminal',
    match: (p: string) => p.startsWith('/terminal'),
  },
  {
    id: 'jobs',
    label: 'Jobs',
    icon: Clock01Icon,
    to: '/jobs',
    match: (p: string) => p.startsWith('/jobs'),
  },
]

export const MOBILE_KNOWLEDGE_ITEMS: Array<MobileNavItemDef> = [
  {
    id: 'memory',
    label: 'Memory',
    icon: BrainIcon,
    to: '/memory',
    match: (p: string) => p.startsWith('/memory'),
  },
  {
    id: 'skills',
    label: 'Skills',
    icon: PuzzleIcon,
    to: '/skills',
    match: (p: string) => p.startsWith('/skills'),
  },
  {
    id: 'mcp',
    label: 'MCP',
    icon: McpServerIcon,
    to: '/mcp',
    match: (p: string) => p.startsWith('/mcp'),
  },
  {
    id: 'profiles',
    label: 'Profiles',
    icon: UserMultipleIcon,
    to: '/profiles',
    match: (p: string) => p.startsWith('/profiles'),
  },
]

export const MOBILE_HAMBURGER_NAV_ITEMS: Array<MobileNavItemDef> = [
  ...MOBILE_COMMAND_ITEMS,
  ...MOBILE_WORKSPACE_ITEMS,
  ...MOBILE_KNOWLEDGE_ITEMS,
]

function normalizeLabel(value: string | undefined): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function getSessionTitle(session: SessionMeta): string {
  const label = normalizeLabel(session.label)
  if (label) return label
  const derivedTitle = normalizeLabel(session.derivedTitle)
  if (derivedTitle) return derivedTitle
  const title = normalizeLabel(session.title)
  if (title) return title
  return `Session ${session.friendlyId ? session.friendlyId.slice(0, 8) : 'Chat'}`
}

const dayFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
})

function formatUpdatedAt(updatedAt?: number): string {
  if (typeof updatedAt !== 'number') return ''
  const value = new Date(updatedAt)
  const now = new Date()
  if (value.toDateString() === now.toDateString()) {
    return timeFormatter.format(value)
  }
  return dayFormatter.format(value)
}

import { useWorkspaceStore } from '@/stores/workspace-store'

/** Call this from anywhere (e.g. chat header) to open the unified nav drawer */
export function openHamburgerMenu() {
  hapticTap()
  useWorkspaceStore.getState().setSidebarCollapsed(false)
}

/** The hamburger trigger button — inline, no fixed positioning */
export function HamburgerTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Open navigation menu"
      onClick={openHamburgerMenu}
      className={cn(
        'flex items-center justify-center size-9 rounded-xl',
        'text-primary-400 hover:text-primary-200 active:scale-90 transition-all duration-150',
        'touch-manipulation select-none',
        className,
      )}
    >
      <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.8} />
    </button>
  )
}

type MobileHamburgerMenuProps = {
  sessions?: Array<SessionMeta>
  activeFriendlyId?: string
  sessionsLoading?: boolean
  onNewChat?: () => void
}

function MobileSessionItem({
  session,
  active,
  isPinned,
  onSelect,
  onTogglePin,
}: {
  session: SessionMeta
  active: boolean
  isPinned: boolean
  onSelect: () => void
  onTogglePin: () => void
}) {
  const timestamp = formatUpdatedAt(session.updatedAt)
  const title = getSessionTitle(session)

  const subtitle = useMemo(() => {
    const parts: Array<string> = []
    if (timestamp) parts.push(timestamp)
    if (session.projectName) {
      parts.push(session.projectName)
    }
    const rawProfile = session.profileName ?? session.profile
    const validProfile =
      rawProfile && !['default', 'general'].includes(rawProfile.toLowerCase())
        ? rawProfile
        : null
    if (validProfile) {
      parts.push(validProfile)
    }
    return parts.join(' • ')
  }, [timestamp, session.projectName, session.profileName, session.profile])

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 w-full rounded-xl px-2.5 py-1.5 text-left transition-all active:scale-[0.99]',
        active
          ? 'bg-accent-500/10 text-accent-500 font-semibold'
          : 'text-primary-900 hover:bg-primary-200 dark:hover:bg-primary-800',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2.5 min-w-0 flex-1 text-left py-0.5"
      >
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg',
            active
              ? 'bg-accent-500/20 text-accent-500'
              : isPinned
                ? 'bg-accent-500/15 text-accent-500'
                : 'bg-primary-100 dark:bg-primary-800 text-primary-500',
          )}
        >
          {isPinned ? (
            <HugeiconsIcon icon={PinIcon} size={14} strokeWidth={1.8} />
          ) : (
            <HugeiconsIcon icon={Chat01Icon} size={15} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {title}
          </span>
          {subtitle ? (
            <span className="block truncate text-[10px] text-primary-500 dark:text-neutral-400">
              {subtitle}
            </span>
          ) : null}
        </span>
        {active && (
          <span className="size-2 rounded-full bg-accent-500 shrink-0" />
        )}
      </button>

      {/* Pin toggle button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onTogglePin()
        }}
        aria-label={isPinned ? 'Unpin session' : 'Pin session'}
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
          isPinned
            ? 'text-accent-500 hover:bg-accent-500/20'
            : 'text-primary-400 opacity-60 hover:opacity-100 hover:bg-primary-200 hover:text-primary-900 dark:hover:bg-primary-800',
        )}
      >
        <HugeiconsIcon
          icon={PinIcon}
          size={14}
          strokeWidth={isPinned ? 2 : 1.5}
        />
      </button>
    </div>
  )
}

/** Mount once in WorkspaceShell — unified navigation is powered by ChatSidebar */
export function MobileHamburgerMenu(_props?: MobileHamburgerMenuProps) {
  return null
}
