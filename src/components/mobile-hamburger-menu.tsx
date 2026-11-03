import { useNavigate, useRouterState } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  Cancel01Icon,
  Castle02Icon,
  Chat01Icon,
  CheckListIcon,
  Folder01Icon,
  Clock01Icon,
  CommandLineIcon,
  McpServerIcon,
  Menu01Icon,
  PlusSignIcon,
  PuzzleIcon,
  Rocket01Icon,
  Settings01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import type { SessionMeta } from '@/screens/chat/types'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'
import { getTheme, getThemeVariant, isDarkTheme, setTheme } from '@/lib/theme'
import { SidebarSessions } from '@/screens/chat/components/sidebar/sidebar-sessions'
import { SessionRenameDialog } from '@/screens/chat/components/sidebar/session-rename-dialog'
import { SessionDeleteDialog } from '@/screens/chat/components/sidebar/session-delete-dialog'
import { useDeleteSession } from '@/screens/chat/hooks/use-delete-session'
import { useRenameSession } from '@/screens/chat/hooks/use-rename-session'
import {
  selectChatProfileDisplayName,
  useChatSettingsStore,
} from '@/hooks/use-chat-settings'
import { useSettingsStore } from '@/hooks/use-settings'

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
    id: 'projects',
    label: 'Projects',
    icon: Folder01Icon,
    to: '/projects',
    match: (p: string) => p.startsWith('/projects'),
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

  const [activeTab, setActiveTab] = useState<'sessions' | 'apps'>('sessions')

  const { deleteSession } = useDeleteSession()
  const { renameSession } = useRenameSession()

  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renameSessionKey, setRenameSessionKey] = useState<string | null>(null)
  const [renameFriendlyId, setRenameFriendlyId] = useState<string | null>(null)
  const [renameSessionTitle, setRenameSessionTitle] = useState('')

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSessionKey, setDeleteSessionKey] = useState<string | null>(null)
  const [deleteFriendlyId, setDeleteFriendlyId] = useState<string | null>(null)
  const [deleteSessionTitle, setDeleteSessionTitle] = useState('')

  function handleOpenRename(session: SessionMeta) {
    setRenameSessionKey(session.key)
    setRenameFriendlyId(session.friendlyId)
    setRenameSessionTitle(
      session.label || session.title || session.derivedTitle || '',
    )
    setRenameDialogOpen(true)
  }

  function handleSaveRename(newTitle: string) {
    if (renameSessionKey) {
      void renameSession(renameSessionKey, renameFriendlyId, newTitle)
    }
    setRenameDialogOpen(false)
    setRenameSessionKey(null)
    setRenameFriendlyId(null)
  }

  function handleOpenDelete(session: SessionMeta) {
    setDeleteSessionKey(session.key)
    setDeleteFriendlyId(session.friendlyId)
    setDeleteSessionTitle(
      session.label ||
        session.title ||
        session.derivedTitle ||
        session.friendlyId,
    )
    setDeleteDialogOpen(true)
  }

  function handleConfirmDelete() {
    if (deleteSessionKey && deleteFriendlyId) {
      const isActive = deleteFriendlyId === activeFriendlyId
      void deleteSession(deleteSessionKey, deleteFriendlyId, isActive)
    }
    setDeleteDialogOpen(false)
    setDeleteSessionKey(null)
    setDeleteFriendlyId(null)
  }

  // Automatically switch tab when opening based on current route
  useEffect(() => {
    if (open) {
      setActiveTab(isChatRoute ? 'sessions' : 'apps')
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
          <div className="flex-1 min-h-0 flex flex-col px-2 pt-1 overflow-y-auto">
            <SidebarSessions
              sessions={sessions}
              activeFriendlyId={activeFriendlyId}
              onSelect={() => setOpen(false)}
              onRename={handleOpenRename}
              onDelete={handleOpenDelete}
              loading={sessionsLoading}
              fetching={false}
              error={null}
              onRetry={() => {}}
            />
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

      {renameDialogOpen && (
        <SessionRenameDialog
          open={renameDialogOpen}
          onOpenChange={setRenameDialogOpen}
          initialTitle={renameSessionTitle}
          onSave={handleSaveRename}
        />
      )}
      {deleteDialogOpen && (
        <SessionDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          sessionTitle={deleteSessionTitle}
          onConfirm={handleConfirmDelete}
        />
      )}
    </>
  )
}
