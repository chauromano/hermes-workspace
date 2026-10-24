import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  Cancel01Icon,
  Castle02Icon,
  Chat01Icon,
  CheckListIcon,
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

export const MOBILE_HAMBURGER_NAV_ITEMS = [
  {
    id: 'chat',
    label: 'Chat',
    icon: Chat01Icon,
    to: '/chat',
    match: (p: string) => p.startsWith('/chat') || p === '/new' || p === '/',
  },
  {
    id: 'operations',
    label: 'Assistants',
    icon: UserMultipleIcon,
    to: '/operations',
    match: (p: string) => p.startsWith('/operations'),
  },
  {
    id: 'tasks',
    label: 'Tasks',
    icon: CheckListIcon,
    to: '/tasks',
    match: (p: string) => p.startsWith('/tasks'),
  },
  {
    id: 'swarm',
    label: 'Teams',
    icon: UserGroupIcon,
    to: '/swarm',
    match: (p: string) => p === '/swarm' || p.startsWith('/swarm2'),
  },
  {
    id: 'playground',
    label: 'HermesWorld',
    icon: Castle02Icon,
    to: '/playground',
    match: (p: string) => p.startsWith('/playground'),
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
  {
    id: 'echo-studio',
    label: 'Echo Studio',
    icon: Rocket01Icon,
    to: '/echo-studio',
    match: (p: string) => p.startsWith('/echo-studio'),
  },
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
    icon: UserGroupIcon,
    to: '/profiles',
    match: (p: string) => p.startsWith('/profiles'),
  },
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

/** Shared drawer state — used by both the trigger button and the drawer itself */
let _setOpen: ((v: boolean) => void) | null = null

/** Call this from anywhere (e.g. chat header) to open the nav drawer */
export function openHamburgerMenu() {
  hapticTap()
  _setOpen?.(true)
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

  return (
    <div
      className={cn(
        'group flex items-center gap-1.5 w-full rounded-xl px-2.5 py-1.5 text-left transition-all active:scale-[0.99]',
        active
          ? 'bg-accent-500/10 text-accent-700 font-semibold'
          : 'hover:bg-primary-100/70 text-ink',
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
              ? 'bg-accent-500/20 text-accent-600'
              : isPinned
                ? 'bg-accent-500/15 text-accent-600'
                : 'bg-primary-100 text-primary-500',
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
          {timestamp ? (
            <span className="block truncate text-[10px] text-primary-400">
              {timestamp}
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
            ? 'text-accent-600 hover:bg-accent-500/20'
            : 'text-primary-300 opacity-60 hover:opacity-100 hover:bg-primary-200/60 hover:text-primary-700',
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

/** Mount once in WorkspaceShell — renders the drawer + backdrop */
export function MobileHamburgerMenu({
  sessions = [],
  activeFriendlyId = '',
  sessionsLoading = false,
  onNewChat,
}: MobileHamburgerMenuProps) {
  const [open, setOpen] = useState(false)
  _setOpen = setOpen

  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const isChatRoute =
    pathname.startsWith('/chat') || pathname === '/new' || pathname === '/'

  const { pinnedSessionKeys, togglePinnedSession } = usePinnedSessions()
  const [activeTab, setActiveTab] = useState<'sessions' | 'apps'>('sessions')
  const [sessionSearch, setSessionSearch] = useState('')

  // Automatically switch tab when opening based on current route
  useEffect(() => {
    if (open) {
      setActiveTab(isChatRoute ? 'sessions' : 'apps')
      setSessionSearch('')
    }
  }, [open, isChatRoute])

  // Add/remove body class to push main content
  useEffect(() => {
    document.body.classList.toggle('nav-drawer-open', open)
    return () => {
      document.body.classList.remove('nav-drawer-open')
    }
  }, [open])

  const profileDisplayName = useChatSettingsStore(selectChatProfileDisplayName)
  const echoStudioEnabled = useSettingsStore(
    (state) => state.settings.experimentalEchoStudio,
  )
  const visibleNavItems = MOBILE_HAMBURGER_NAV_ITEMS.filter(
    (item) => item.id !== 'echo-studio' || echoStudioEnabled,
  )

  function handleNav(to: string) {
    hapticTap()
    void navigate({ to })
    setOpen(false)
  }

  const pinnedKeySet = useMemo(() => new Set(pinnedSessionKeys), [pinnedSessionKeys])
  const isSessionPinned = useCallback(
    (s: SessionMeta) => {
      return (
        pinnedKeySet.has(s.key) ||
        (Boolean(s.friendlyId) && pinnedKeySet.has(s.friendlyId))
      )
    },
    [pinnedKeySet],
  )

  const filteredSessions = useMemo(() => {
    if (!sessions) return []
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return sessions
    return sessions.filter((s) => {
      const title = getSessionTitle(s).toLowerCase()
      const key = (s.friendlyId || s.key || '').toLowerCase()
      return title.includes(q) || key.includes(q)
    })
  }, [sessions, sessionSearch])

  const { pinnedSessions, unpinnedSessions } = useMemo(() => {
    const pinned: Array<SessionMeta> = []
    const unpinned: Array<SessionMeta> = []
    for (const session of filteredSessions) {
      if (isSessionPinned(session)) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }
    return { pinnedSessions: pinned, unpinnedSessions: unpinned }
  }, [filteredSessions, isSessionPinned])

  return (
    <>
      {/* Push-style layout wrapper — sidebar pushes content right */}
      <div
        className={cn(
          'fixed inset-0 z-[95] md:hidden',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : 'pointer-events-none',
        )}
      >
        {/* Main content overlay — dims and shifts right when sidebar is open */}
        <div
          className={cn(
            'absolute inset-0 transition-all duration-300 ease-in-out',
            open
              ? 'translate-x-72 opacity-40 scale-[0.92] rounded-2xl overflow-hidden'
              : 'translate-x-0 opacity-100 scale-100',
          )}
          onClick={() => open && setOpen(false)}
          style={open ? { transformOrigin: 'left center' } : undefined}
        />
      </div>

      {/* Slide-over drawer */}
      <div
        className={cn(
          'fixed top-0 left-0 bottom-0 z-[96] w-80 max-w-[85vw] md:hidden',
          'shadow-2xl',
          'flex flex-col pt-[max(env(safe-area-inset-top,20px),20px)] pb-[max(env(safe-area-inset-bottom,20px),20px)]',
          'transition-transform duration-300 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        style={{
          background: 'var(--color-surface, #fff)',
          borderColor: 'var(--color-border, #e5e7eb)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 pb-3"
          style={{ borderBottom: '1px solid var(--color-border, #e5e7eb)' }}
        >
          <div className="flex items-center gap-2.5">
            <img
              src="/claude-avatar.webp"
              alt="Hermes Agent"
              className="size-8 rounded-xl shrink-0"
            />
            <div className="flex flex-col leading-tight">
              <span
                className="font-bold text-[15px] tracking-tight"
                style={{ color: 'var(--color-ink, #111)' }}
              >
                Hermes Agent
              </span>
              <span
                className="text-[11px]"
                style={{ color: 'var(--color-muted, #888)' }}
              >
                Workspace
              </span>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center size-8 rounded-full active:scale-90 transition-all text-primary-400 hover:text-primary-600"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.8} />
          </button>
        </div>

        {/* Action + Segmented Tab Control */}
        <div className="px-3 pt-3 pb-2 flex flex-col gap-2 shrink-0">
          {/* New Session Button */}
          <button
            type="button"
            onClick={() => {
              hapticTap()
              if (onNewChat) {
                onNewChat()
              } else {
                void navigate({
                  to: '/chat/$sessionKey',
                  params: { sessionKey: 'new' },
                })
              }
              setOpen(false)
            }}
            className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-accent-600 text-white font-medium text-sm shadow-sm active:scale-[0.98] transition-all hover:bg-accent-700"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={16} strokeWidth={2.2} />
            <span>New Session</span>
          </button>

          {/* Active Project Switcher */}
          <div className="pt-0.5">
            <ProjectSwitcher variant="mobile" />
          </div>

          {/* Segmented Switch: Sessions vs Workspace */}
          <div className="grid grid-cols-2 rounded-xl bg-primary-100/70 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => {
                hapticTap()
                setActiveTab('sessions')
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all',
                activeTab === 'sessions'
                  ? 'bg-surface text-ink font-semibold shadow-xs'
                  : 'text-primary-500 hover:text-primary-800',
              )}
            >
              <HugeiconsIcon
                icon={Chat01Icon}
                size={14}
                strokeWidth={activeTab === 'sessions' ? 2 : 1.6}
              />
              <span>
                Sessions{sessions.length > 0 ? ` (${sessions.length})` : ''}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                hapticTap()
                setActiveTab('apps')
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all',
                activeTab === 'apps'
                  ? 'bg-surface text-ink font-semibold shadow-xs'
                  : 'text-primary-500 hover:text-primary-800',
              )}
            >
              <HugeiconsIcon
                icon={UserMultipleIcon}
                size={14}
                strokeWidth={activeTab === 'apps' ? 2 : 1.6}
              />
              <span>Workspace</span>
            </button>
          </div>
        </div>

        {/* Content area: Sessions Tab */}
        {activeTab === 'sessions' && (
          <div className="flex-1 min-h-0 flex flex-col px-3 pt-1">
            {/* Search filter if there are several sessions */}
            {sessions.length > 4 && (
              <div className="mb-2 relative shrink-0">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400"
                />
                <input
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search sessions..."
                  className="w-full text-xs rounded-lg pl-8 pr-7 py-1.5 bg-primary-100/60 text-ink placeholder:text-primary-400 border border-transparent focus:border-accent-300 focus:outline-none transition-colors"
                />
                {sessionSearch && (
                  <button
                    type="button"
                    onClick={() => setSessionSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-600 text-xs px-1"
                  >
                    ×
                  </button>
                )}
              </div>
            )}

            {/* Scrollable session list */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1 pr-0.5">
              {filteredSessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-3 text-center text-primary-400">
                  <HugeiconsIcon
                    icon={Chat01Icon}
                    size={28}
                    strokeWidth={1.5}
                    className="mb-2 opacity-50"
                  />
                  <p className="text-xs font-medium text-primary-600">
                    {sessionSearch
                      ? 'No sessions found matching query'
                      : sessionsLoading
                        ? 'Loading sessions...'
                        : 'No sessions yet'}
                  </p>
                  <p className="mt-1 text-[11px] text-primary-400">
                    {sessionSearch
                      ? 'Try a different search keyword.'
                      : 'Tap "+ New Session" to start a conversation.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Pinned sessions section */}
                  {pinnedSessions.length > 0 && (
                    <div className="space-y-1 pb-1">
                      <div className="flex items-center gap-1.5 px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-500">
                        <HugeiconsIcon icon={PinIcon} size={11} strokeWidth={2} />
                        <span>Pinned</span>
                      </div>
                      {pinnedSessions.map((session) => (
                        <MobileSessionItem
                          key={session.key}
                          session={session}
                          active={session.friendlyId === activeFriendlyId}
                          isPinned={true}
                          onSelect={() => {
                            hapticTap()
                            void navigate({
                              to: '/chat/$sessionKey',
                              params: {
                                sessionKey: session.friendlyId || session.key,
                              },
                            })
                            setOpen(false)
                          }}
                          onTogglePin={() => {
                            togglePinnedSession(session.key || session.friendlyId)
                          }}
                        />
                      ))}
                      {unpinnedSessions.length > 0 && (
                        <div className="my-1 border-t border-primary-200/80" />
                      )}
                    </div>
                  )}

                  {/* Regular / unpinned sessions section */}
                  {unpinnedSessions.length > 0 && (
                    <div className="space-y-1">
                      {pinnedSessions.length > 0 && (
                        <div className="px-2 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-500">
                          <span>Recent</span>
                        </div>
                      )}
                      {unpinnedSessions.map((session) => (
                        <MobileSessionItem
                          key={session.key}
                          session={session}
                          active={session.friendlyId === activeFriendlyId}
                          isPinned={false}
                          onSelect={() => {
                            hapticTap()
                            void navigate({
                              to: '/chat/$sessionKey',
                              params: {
                                sessionKey: session.friendlyId || session.key,
                              },
                            })
                            setOpen(false)
                          }}
                          onTogglePin={() => {
                            togglePinnedSession(session.key || session.friendlyId)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Content area: Workspace Apps Tab */}
        {activeTab === 'apps' && (
          <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 px-3 pt-1">
            {visibleNavItems.map((item) => {
              const isActive = item.match(pathname)
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.to)}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-left w-full',
                    'transition-all duration-150 active:scale-[0.98]',
                  )}
                  style={
                    isActive
                      ? {
                          background:
                            'var(--theme-accent-subtle, color-mix(in srgb, var(--theme-accent, #6366f1) 12%, transparent))',
                          color:
                            'var(--theme-accent, var(--color-accent, #6366f1))',
                        }
                      : {
                          color:
                            'var(--theme-muted, var(--color-ink-muted, #555))',
                        }
                  }
                >
                  <HugeiconsIcon
                    icon={item.icon}
                    size={19}
                    strokeWidth={isActive ? 2 : 1.6}
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              )
            })}
          </nav>
        )}

        {/* Bottom — user profile + settings + theme toggle */}
        <div
          className="px-3 pb-2 pt-3 shrink-0"
          style={{ borderTop: '1px solid var(--color-border, #e5e7eb)' }}
        >
          <div className="flex items-center gap-3 px-2">
            {/* User avatar + name + status dot */}
            <div
              className="size-9 rounded-xl shrink-0 flex items-center justify-center"
              style={{
                background:
                  'var(--theme-accent-subtle, color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent))',
              }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  color: 'var(--theme-accent, var(--color-accent, #6366f1))',
                }}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <span
              className="text-[15px] font-semibold truncate"
              style={{ color: 'var(--color-ink, #111)' }}
            >
              {profileDisplayName}
            </span>
            <span className="size-2.5 rounded-full bg-green-500 shrink-0" />

            <div className="flex-1" />

            {/* Settings cog */}
            <button
              type="button"
              onClick={() => handleNav('/settings')}
              className="flex items-center justify-center size-9 rounded-xl active:bg-white/10 transition-colors"
              aria-label="Settings"
              style={{ color: 'var(--color-ink-muted, #888)' }}
            >
              <HugeiconsIcon
                icon={Settings01Icon}
                size={20}
                strokeWidth={1.5}
              />
            </button>

            {/* Theme toggle — sun/moon */}
            <button
              type="button"
              onClick={() => {
                const current = getTheme()
                const dark = isDarkTheme(current)
                const next = getThemeVariant(current, dark ? 'light' : 'dark')
                setTheme(next)
              }}
              className="flex items-center justify-center size-9 rounded-xl active:bg-white/10 transition-colors"
              aria-label="Toggle theme"
              style={{ color: 'var(--color-ink-muted, #888)' }}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
