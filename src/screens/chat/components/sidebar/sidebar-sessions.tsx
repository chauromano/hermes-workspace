'use client'

import { HugeiconsIcon } from '@hugeicons/react'
import {
  PinIcon,
  PlusSignIcon,
  Folder01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  MoreVerticalIcon,
  CheckmarkCircle01Icon,
} from '@hugeicons/core-free-icons'
import { memo, useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SessionItem } from './session-item'
import type { SessionMeta } from '../../types'
import { Button } from '@/components/ui/button'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'
import { useProjects, useSetActiveProject, type Project } from '@/hooks/use-projects'
import { ProjectModal } from '@/components/projects/project-modal'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuTrigger,
} from '@/components/ui/menu'
import { cn } from '@/lib/utils'

export type DateFilterOption = 'none' | '3d' | '7d' | '30d'
export type SessionsGroupOption = 'projects' | 'status'
export type StatusCategory = 'Active' | 'Idle' | 'Archived'

type SidebarSessionsProps = {
  sessions: Array<SessionMeta>
  activeFriendlyId: string
  defaultOpen?: boolean
  onSelect?: () => void
  onRename: (session: SessionMeta) => void
  onDelete: (session: SessionMeta) => void
  loading: boolean
  fetching: boolean
  error: string | null
  onRetry: () => void
}

function FunnelFilterIcon({
  className,
  size = 12,
}: {
  className?: string
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  )
}

function matchesDateFilter(session: SessionMeta, filter: DateFilterOption): boolean {
  if (filter === 'none') return true
  const ts =
    typeof session.updatedAt === 'number'
      ? session.updatedAt
      : session.lastMessage?.timestamp
        ? session.lastMessage.timestamp * 1000
        : Date.now()
  const diffMs = Date.now() - ts
  if (filter === '3d') return diffMs <= 3 * 24 * 60 * 60 * 1000
  if (filter === '7d') return diffMs <= 7 * 24 * 60 * 60 * 1000
  if (filter === '30d') return diffMs <= 30 * 24 * 60 * 60 * 1000
  return true
}

function deriveSessionStatusCategory(session: SessionMeta): StatusCategory {
  if (session.status === 'ended' || (session as any).archived) {
    return 'Archived'
  }
  if (session.status === 'streaming' || session.status === 'running') {
    return 'Active'
  }
  const ts = typeof session.updatedAt === 'number' ? session.updatedAt : 0
  const isRecent = Date.now() - ts < 24 * 60 * 60 * 1000
  if (isRecent) {
    return 'Active'
  }
  return 'Idle'
}

export const SidebarSessions = memo(function SidebarSessions({
  sessions,
  activeFriendlyId,
  defaultOpen = true,
  onSelect,
  onRename,
  onDelete,
  loading,
  fetching,
  error,
  onRetry,
}: SidebarSessionsProps) {
  const navigate = useNavigate()
  const { pinnedSessionKeys, togglePinnedSession } = usePinnedSessions()
  const { projects } = useProjects()
  const setActiveProjectMutation = useSetActiveProject()

  // Project Modal state
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)

  // 1. Chat date filter: 'none' | '7d' | '30d' (persisted in localStorage)
  const [chatDateFilter, setChatDateFilter] = useState<DateFilterOption>(() => {
    try {
      return (
        (localStorage.getItem('hermes_chat_date_filter') as DateFilterOption) ||
        'none'
      )
    } catch {
      return 'none'
    }
  })

  // 2. Sessions grouping: 'projects' | 'status' (persisted in localStorage, default 'projects')
  const [sessionsGroupBy, setSessionsGroupBy] = useState<SessionsGroupOption>(
    () => {
      try {
        return (
          (localStorage.getItem(
            'hermes_sessions_group_by',
          ) as SessionsGroupOption) || 'projects'
        )
      } catch {
        return 'projects'
      }
    },
  )

  // 3. Sessions date filter: 'none' | '7d' | '30d' (persisted in localStorage)
  const [sessionsDateFilter, setSessionsDateFilter] =
    useState<DateFilterOption>(() => {
      try {
        return (
          (localStorage.getItem(
            'hermes_sessions_date_filter',
          ) as DateFilterOption) || 'none'
        )
      } catch {
        return 'none'
      }
    })

  // 4. Collapsed project IDs
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('hermes_collapsed_projects')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  // 5. Collapsed status categories
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('hermes_collapsed_statuses')
      return raw ? new Set(JSON.parse(raw)) : new Set()
    } catch {
      return new Set()
    }
  })

  const handleSetChatFilter = (filter: DateFilterOption) => {
    setChatDateFilter(filter)
    try {
      localStorage.setItem('hermes_chat_date_filter', filter)
    } catch {}
  }

  const handleSetSessionsGroupBy = (group: SessionsGroupOption) => {
    setSessionsGroupBy(group)
    try {
      localStorage.setItem('hermes_sessions_group_by', group)
    } catch {}
  }

  const handleSetSessionsDateFilter = (filter: DateFilterOption) => {
    setSessionsDateFilter(filter)
    try {
      localStorage.setItem('hermes_sessions_date_filter', filter)
    } catch {}
  }

  const toggleProjectCollapse = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      try {
        localStorage.setItem(
          'hermes_collapsed_projects',
          JSON.stringify([...next]),
        )
      } catch {}
      return next
    })
  }, [])

  const toggleStatusCollapse = useCallback((status: string) => {
    setCollapsedStatuses((prev) => {
      const next = new Set(prev)
      if (next.has(status)) {
        next.delete(status)
      } else {
        next.add(status)
      }
      try {
        localStorage.setItem(
          'hermes_collapsed_statuses',
          JSON.stringify([...next]),
        )
      } catch {}
      return next
    })
  }, [])

  function handleTogglePin(session: SessionMeta) {
    togglePinnedSession(session.key)
  }

  // Action: Create new chat session (untied, latest active profile)
  const handleNewChat = useCallback(() => {
    setActiveProjectMutation.mutate(null, {
      onSettled: () => {
        navigate({
          to: '/chat/$sessionKey',
          params: { sessionKey: 'new' },
        })
        onSelect?.()
      },
    })
  }, [setActiveProjectMutation, navigate, onSelect])

  // Action: Start new session for a specific project
  const handleNewProjectSession = useCallback(
    (project: Project) => {
      setActiveProjectMutation.mutate(project.id, {
        onSettled: () => {
          navigate({
            to: '/chat/$sessionKey',
            params: { sessionKey: 'new' },
          })
          onSelect?.()
        },
      })
    },
    [setActiveProjectMutation, navigate, onSelect],
  )

  // Action: Open project modal to edit project
  const handleEditProject = useCallback((project: Project) => {
    setEditingProject(project)
    setProjectModalOpen(true)
  }, [])

  // Action: Open project modal to create new project
  const handleCreateProject = useCallback(() => {
    setEditingProject(null)
    setProjectModalOpen(true)
  }, [])

  // Partition sessions into Pinned, Chat (untied), and Project/Status
  const { pinnedSessions, chatSessions, projectSessions } = useMemo(() => {
    const pinnedKeys = new Set(pinnedSessionKeys)
    const pinned: Array<SessionMeta> = []
    const chats: Array<SessionMeta> = []
    const projectSess: Array<SessionMeta> = []

    for (const session of sessions) {
      if (pinnedKeys.has(session.key)) {
        pinned.push(session)
        continue
      }

      // Check if session belongs to a project
      if (!session.projectId) {
        if (matchesDateFilter(session, chatDateFilter)) {
          chats.push(session)
        }
      } else {
        if (matchesDateFilter(session, sessionsDateFilter)) {
          projectSess.push(session)
        }
      }
    }

    return {
      pinnedSessions: pinned,
      chatSessions: chats,
      projectSessions: projectSess,
    }
  }, [pinnedSessionKeys, sessions, chatDateFilter, sessionsDateFilter])

  // Group project sessions by Project
  const sessionsByProject = useMemo(() => {
    const map = new Map<string, Array<SessionMeta>>()
    for (const p of projects) {
      map.set(p.id, [])
    }
    for (const session of projectSessions) {
      if (session.projectId && map.has(session.projectId)) {
        map.get(session.projectId)!.push(session)
      } else if (session.projectId) {
        map.set(session.projectId, [session])
      }
    }
    return map
  }, [projects, projectSessions])

  // Group sessions by Status Category (Active, Idle, Archived)
  const sessionsByStatus = useMemo(() => {
    const categories: Record<StatusCategory, Array<SessionMeta>> = {
      Active: [],
      Idle: [],
      Archived: [],
    }
    for (const session of projectSessions) {
      const cat = deriveSessionStatusCategory(session)
      categories[cat].push(session)
    }
    return categories
  }, [projectSessions])

  return (
    <div className="flex flex-col gap-2 w-full">
            {/* ── 1. PINNED SESSIONS ── */}
            {pinnedSessions.length > 0 ? (
              <div className="flex flex-col gap-1 pb-1">
                <div className="flex items-center gap-1.5 px-2.5 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-500 select-none">
                  <HugeiconsIcon icon={PinIcon} size={12} strokeWidth={2} />
                  <span>Pinned</span>
                  <span className="text-primary-400 font-normal">
                    ({pinnedSessions.length})
                  </span>
                </div>
                {pinnedSessions.map((session) => (
                  <SessionItem
                    key={session.key}
                    session={session}
                    active={session.friendlyId === activeFriendlyId}
                    isPinned
                    onSelect={onSelect}
                    onTogglePin={handleTogglePin}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))}
                <div className="my-1 mx-2 border-t border-primary-200/60 dark:border-primary-800/40" />
              </div>
            ) : null}

            {/* ── 2. CHAT SECTION (No Associated Project) ── */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 select-none">
                <div className="flex items-center gap-1.5">
                  <span>Chat</span>
                  <span className="text-primary-400 font-normal">
                    ({chatSessions.length})
                  </span>
                </div>

                <div className="flex items-center gap-0.5">
                  {/* Chat Filter Dropdown */}
                  <MenuRoot>
                    <MenuTrigger
                      className={cn(
                        'flex size-6 items-center justify-center rounded-md transition-colors cursor-pointer',
                        'text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-200/60 dark:hover:bg-primary-800/60',
                        chatDateFilter !== 'none' &&
                          'text-accent-500 font-bold bg-accent-500/10',
                      )}
                      title={`Filter chats${chatDateFilter !== 'none' ? ` (${chatDateFilter})` : ''}`}
                    >
                      <FunnelFilterIcon size={11} />
                    </MenuTrigger>
                    <MenuContent className="w-40 z-50 py-1 bg-surface border border-[var(--theme-border)] shadow-xl rounded-xl">
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider select-none">
                        Filter
                      </div>
                      <MenuItem
                        onClick={() => handleSetChatFilter('none')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          chatDateFilter === 'none' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>None</span>
                        {chatDateFilter === 'none' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetChatFilter('3d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          chatDateFilter === '3d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 3 days</span>
                        {chatDateFilter === '3d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetChatFilter('7d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          chatDateFilter === '7d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 7 days</span>
                        {chatDateFilter === '7d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetChatFilter('30d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          chatDateFilter === '30d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 30 days</span>
                        {chatDateFilter === '30d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>

                  {/* New Chat Session Button (+) */}
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex size-5 items-center justify-center rounded transition-colors text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-200/60 dark:hover:bg-primary-800/60 cursor-pointer"
                    title="New Chat Session"
                  >
                    <HugeiconsIcon icon={PlusSignIcon} size={12} strokeWidth={2} />
                  </button>
                </div>
              </div>

              {/* Chat Sessions list */}
              {chatSessions.length > 0 ? (
                chatSessions.map((session) => (
                  <SessionItem
                    key={session.key}
                    session={session}
                    active={session.friendlyId === activeFriendlyId}
                    isPinned={false}
                    onSelect={onSelect}
                    onTogglePin={handleTogglePin}
                    onRename={onRename}
                    onDelete={onDelete}
                  />
                ))
              ) : (
                <div className="px-3 py-1.5 text-[11px] text-primary-400 italic">
                  {chatDateFilter !== 'none'
                    ? 'No chats in this timeframe'
                    : 'No chat sessions'}
                </div>
              )}
            </div>

            <div className="my-1 mx-2 border-t border-primary-200/60 dark:border-primary-800/40" />

            {/* ── 3. SESSIONS / PROJECTS SECTION ── */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary-500 dark:text-neutral-400 select-none">
                <div className="flex items-center gap-1.5">
                  <span>
                    {sessionsGroupBy === 'projects' ? 'Projects' : 'Sessions'}
                  </span>
                  <span className="text-primary-400 font-normal">
                    ({projectSessions.length})
                  </span>
                </div>

                <div className="flex items-center gap-0.5">
                  {/* Sessions Group & Date Filter Dropdown */}
                  <MenuRoot>
                    <MenuTrigger
                      className={cn(
                        'flex size-6 items-center justify-center rounded-md transition-colors cursor-pointer',
                        'text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-200/60 dark:hover:bg-primary-800/60',
                        (sessionsDateFilter !== 'none' ||
                          sessionsGroupBy !== 'projects') &&
                          'text-accent-500 font-bold bg-accent-500/10',
                      )}
                      title="Group and Filter sessions"
                    >
                      <FunnelFilterIcon size={11} />
                    </MenuTrigger>
                    <MenuContent className="w-44 z-50 py-1 bg-surface border border-[var(--theme-border)] shadow-xl rounded-xl">
                      <div className="px-2.5 py-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider select-none">
                        Group By
                      </div>
                      <MenuItem
                        onClick={() => handleSetSessionsGroupBy('projects')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsGroupBy === 'projects' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Projects</span>
                        {sessionsGroupBy === 'projects' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetSessionsGroupBy('status')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsGroupBy === 'status' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Status</span>
                        {sessionsGroupBy === 'status' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>

                      <div className="my-1 border-t border-[var(--theme-border)]" />

                      <div className="px-2.5 py-1 text-[10px] font-semibold text-primary-400 uppercase tracking-wider select-none">
                        Filter
                      </div>
                      <MenuItem
                        onClick={() => handleSetSessionsDateFilter('none')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsDateFilter === 'none' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>None</span>
                        {sessionsDateFilter === 'none' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetSessionsDateFilter('3d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsDateFilter === '3d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 3 days</span>
                        {sessionsDateFilter === '3d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetSessionsDateFilter('7d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsDateFilter === '7d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 7 days</span>
                        {sessionsDateFilter === '7d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                      <MenuItem
                        onClick={() => handleSetSessionsDateFilter('30d')}
                        className={cn(
                          'flex items-center justify-between text-xs px-2.5 py-1.5 cursor-pointer rounded-md mx-1',
                          sessionsDateFilter === '30d' &&
                            'font-semibold text-accent-500 bg-accent-500/10',
                        )}
                      >
                        <span>Last 30 days</span>
                        {sessionsDateFilter === '30d' && (
                          <HugeiconsIcon
                            icon={CheckmarkCircle01Icon}
                            size={12}
                            className="text-accent-500"
                          />
                        )}
                      </MenuItem>
                    </MenuContent>
                  </MenuRoot>

                  {/* Create Project Button (+) — only when Group by Projects */}
                  {sessionsGroupBy === 'projects' && (
                    <button
                      type="button"
                      onClick={handleCreateProject}
                      className="flex size-5 items-center justify-center rounded transition-colors text-primary-400 hover:text-primary-700 dark:hover:text-primary-200 hover:bg-primary-200/60 dark:hover:bg-primary-800/60 cursor-pointer"
                      title="Create Project"
                    >
                      <HugeiconsIcon
                        icon={PlusSignIcon}
                        size={12}
                        strokeWidth={2}
                      />
                    </button>
                  )}
                </div>
              </div>

              {/* Group View: BY PROJECTS */}
              {sessionsGroupBy === 'projects' && (
                <div className="flex flex-col gap-1">
                  {projects.map((project) => {
                    const isCollapsed = collapsedProjects.has(project.id)
                    const projSessions = sessionsByProject.get(project.id) ?? []

                    return (
                      <div key={project.id} className="flex flex-col">
                        {/* Project Header Row */}
                        <div
                          onClick={() => toggleProjectCollapse(project.id)}
                          className={cn(
                            'group/proj flex items-center justify-between px-3 py-2 rounded-lg transition-colors select-none cursor-pointer',
                            'hover:bg-primary-200/60 dark:hover:bg-primary-800/50 text-neutral-900 dark:text-neutral-100',
                          )}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <HugeiconsIcon
                              icon={
                                isCollapsed
                                  ? ArrowRight01Icon
                                  : ArrowDown01Icon
                              }
                              size={11}
                              className="shrink-0 text-primary-400 group-hover/proj:text-primary-600 transition-transform"
                            />
                            <HugeiconsIcon icon={Folder01Icon} size={18} className="shrink-0 text-accent-500" />
                            <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                              {project.name}
                            </span>
                            <span className="text-xs text-primary-400 dark:text-neutral-400 font-normal shrink-0">
                              ({projSessions.length})
                            </span>
                          </div>

                          {/* Hover Action Buttons: Edit Project & New Session */}
                          <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover/proj:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEditProject(project)
                              }}
                              className="flex size-6 items-center justify-center rounded hover:bg-primary-200 dark:hover:bg-primary-700 text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
                              title={`Edit ${project.name}`}
                            >
                              <HugeiconsIcon
                                icon={MoreVerticalIcon}
                                size={12}
                              />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleNewProjectSession(project)
                              }}
                              className="flex size-6 items-center justify-center rounded hover:bg-primary-200 dark:hover:bg-primary-700 text-primary-400 hover:text-primary-800 dark:hover:text-primary-200"
                              title={`New session in ${project.name}`}
                            >
                              <HugeiconsIcon
                                icon={PlusSignIcon}
                                size={12}
                                strokeWidth={2}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Child Sessions when Project Expanded */}
                        {!isCollapsed && (
                          <div className="pl-3 flex flex-col gap-1 border-l border-primary-200/50 dark:border-primary-800/40 ml-3.5 my-1">
                            {projSessions.length > 0 ? (
                              projSessions.map((session) => (
                                <SessionItem
                                  key={session.key}
                                  session={{ ...session, projectName: null }}
                                  active={
                                    session.friendlyId === activeFriendlyId
                                  }
                                  isPinned={false}
                                  onSelect={onSelect}
                                  onTogglePin={handleTogglePin}
                                  onRename={onRename}
                                  onDelete={onDelete}
                                />
                              ))
                            ) : (
                              <div className="px-2 py-1 text-[11px] text-primary-400 italic">
                                No sessions yet
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {projects.length === 0 && (
                    <div className="px-3 py-2 text-[11px] text-primary-400 italic">
                      No projects created yet. Click + to add one.
                    </div>
                  )}
                </div>
              )}

              {/* Group View: BY STATUS (Option A: Active, Idle, Archived) */}
              {sessionsGroupBy === 'status' && (
                <div className="flex flex-col gap-1">
                  {(['Active', 'Idle', 'Archived'] as StatusCategory[]).map(
                    (status) => {
                      const isCollapsed = collapsedStatuses.has(status)
                      const statusSessions = sessionsByStatus[status] || []

                      const dotColor =
                        status === 'Active'
                          ? 'bg-emerald-500'
                          : status === 'Idle'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'

                      return (
                        <div key={status} className="flex flex-col">
                          {/* Status Header Row (No settings or + icon per user requirement) */}
                          <div
                            onClick={() => toggleStatusCollapse(status)}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 rounded-lg transition-colors select-none cursor-pointer',
                              'hover:bg-primary-200/60 dark:hover:bg-primary-800/50 text-neutral-900 dark:text-neutral-100',
                            )}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <HugeiconsIcon
                                icon={
                                  isCollapsed
                                    ? ArrowRight01Icon
                                    : ArrowDown01Icon
                                }
                                size={11}
                                className="shrink-0 text-primary-400 transition-transform"
                              />
                              <span
                                className={cn(
                                  'size-2 rounded-full shrink-0',
                                  dotColor,
                                )}
                              />
                              <span className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
                                {status}
                              </span>
                              <span className="text-[10px] text-primary-400 font-normal shrink-0">
                                ({statusSessions.length})
                              </span>
                            </div>
                          </div>

                          {/* Child Sessions under Status */}
                          {!isCollapsed && (
                            <div className="pl-3 flex flex-col gap-0.5 border-l border-primary-200/50 dark:border-primary-800/40 ml-2.5 my-0.5">
                              {statusSessions.length > 0 ? (
                                statusSessions.map((session) => (
                                  <SessionItem
                                    key={session.key}
                                    session={session}
                                    active={
                                      session.friendlyId === activeFriendlyId
                                    }
                                    isPinned={false}
                                    onSelect={onSelect}
                                    onTogglePin={handleTogglePin}
                                    onRename={onRename}
                                    onDelete={onDelete}
                                  />
                                ))
                              ) : (
                                <div className="px-2 py-1 text-[11px] text-primary-400 italic">
                                  No {status.toLowerCase()} sessions
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    },
                  )}
                </div>
              )}
            </div>

            {loading && (
              <div className="px-3 py-2 text-xs text-primary-500">
                Loading sessions…
              </div>
            )}
            {error && (
              <div className="px-3 py-2 text-xs text-primary-500">
                <div className="mb-2">Failed to load sessions.</div>
                <div className="text-[11px] opacity-80">{error}</div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={onRetry}
                >
                  Retry
                </Button>
              </div>
            )}
            {fetching && !loading && !error && sessions.length > 0 ? (
              <div className="px-3 py-1 text-[11px] text-primary-400">
                Updating…
              </div>
            ) : null}

      {/* Project Modal for Creating / Editing Projects */}
      <ProjectModal
        open={projectModalOpen}
        onOpenChange={setProjectModalOpen}
        project={editingProject}
      />
    </div>
  )
}, areSidebarSessionsEqual)

function areSidebarSessionsEqual(
  prev: SidebarSessionsProps,
  next: SidebarSessionsProps,
) {
  if (prev.activeFriendlyId !== next.activeFriendlyId) return false
  if (prev.defaultOpen !== next.defaultOpen) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onRename !== next.onRename) return false
  if (prev.onDelete !== next.onDelete) return false
  if (prev.loading !== next.loading) return false
  if (prev.fetching !== next.fetching) return false
  if (prev.error !== next.error) return false
  if (prev.onRetry !== next.onRetry) return false
  if (prev.sessions === next.sessions) return true
  if (prev.sessions.length !== next.sessions.length) return false
  for (let i = 0; i < prev.sessions.length; i += 1) {
    const prevSession = prev.sessions[i]
    const nextSession = next.sessions[i]
    if (prevSession.key !== nextSession.key) return false
    if (prevSession.friendlyId !== nextSession.friendlyId) return false
    if (prevSession.label !== nextSession.label) return false
    if (prevSession.title !== nextSession.title) return false
    if (prevSession.derivedTitle !== nextSession.derivedTitle) return false
    if (prevSession.updatedAt !== nextSession.updatedAt) return false
    if (prevSession.titleStatus !== nextSession.titleStatus) return false
    if (prevSession.titleSource !== nextSession.titleSource) return false
    if (prevSession.titleError !== nextSession.titleError) return false
    if (prevSession.projectName !== nextSession.projectName) return false
    if (prevSession.profileName !== nextSession.profileName) return false
    if (prevSession.profile !== nextSession.profile) return false
  }
  return true
}
