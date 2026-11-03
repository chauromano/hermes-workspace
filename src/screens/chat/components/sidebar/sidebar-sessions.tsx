'use client'

import { memo, useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  CheckmarkCircle01Icon,
  FilterHorizontalIcon,
  Folder01Icon,
  FolderAddIcon,
  MoreVerticalIcon,
  PlusSignIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons'
import { useNavigate } from '@tanstack/react-router'
import { SessionItem } from './session-item'
import type { SessionMeta } from '../../types'
import { Button } from '@/components/ui/button'
import {
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuSubmenuContent,
  MenuSubmenuRoot,
  MenuSubmenuTrigger,
  MenuTrigger,
} from '@/components/ui/menu'
import { ProjectModal } from '@/components/projects/project-modal'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'
import {
  useProjects,
  useSetActiveProject,
  type Project,
} from '@/hooks/use-projects'
import {
  useSessionOrganizationStore,
  type SessionFilterDays,
  type SessionGroupBy,
  type SessionSortBy,
} from '@/hooks/use-session-organization'
import { useChatStore } from '@/stores/chat-store'
import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/haptics'

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

const DEFAULT_GROUP_LIMIT = 6

export const SidebarSessions = memo(function SidebarSessions({
  sessions,
  activeFriendlyId,
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
  const { projects } = useProjects({ includeArchived: false })
  const setActiveProjectMutation = useSetActiveProject()

  const groupBy = useSessionOrganizationStore((s) => s.groupBy)
  const sortBy = useSessionOrganizationStore((s) => s.sortBy)
  const filterDays = useSessionOrganizationStore((s) => s.filterDays)
  const customOrder = useSessionOrganizationStore((s) => s.customOrder)
  const setGroupBy = useSessionOrganizationStore((s) => s.setGroupBy)
  const setSortBy = useSessionOrganizationStore((s) => s.setSortBy)
  const setFilterDays = useSessionOrganizationStore((s) => s.setFilterDays)
  const moveSessionInCustomOrder = useSessionOrganizationStore(
    (s) => s.moveSessionInCustomOrder,
  )

  const [createProjectOpen, setCreateProjectOpen] = useState(false)
  const [editingProject, setEditingProject] = useState<Project | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {},
  )
  const [draggedKey, setDraggedKey] = useState<string | null>(null)

  // Realtime activity signals from chat store
  const waitingSessionKeys = useChatStore((s) => s.waitingSessionKeys)
  const streamingState = useChatStore((s) => s.streamingState)

  function isSessionActive(s: SessionMeta): boolean {
    if (waitingSessionKeys.has(s.key) || waitingSessionKeys.has(s.friendlyId)) {
      return true
    }
    const stream = streamingState.get(s.key) || streamingState.get(s.friendlyId)
    if (stream && stream.runId) {
      return true
    }
    if (s.status === 'active' || s.titleStatus === 'generating') {
      return true
    }
    return false
  }

  function isSessionBlocked(s: SessionMeta): boolean {
    return s.status === 'blocked'
  }

  // 1. Filter sessions by date
  const filteredSessions = useMemo(() => {
    if (filterDays === 'none') return sessions
    const now = Date.now()
    const cutoffMs =
      filterDays === '7_days'
        ? 7 * 86_400_000
        : 30 * 86_400_000

    return sessions.filter((s) => {
      const ts = s.updatedAt ?? 0
      return ts > 0 && now - ts <= cutoffMs
    })
  }, [sessions, filterDays])

  // 2. Sort sessions
  const sortedSessions = useMemo(() => {
    const list = [...filteredSessions]
    if (sortBy === 'last_updated') {
      return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    }
    if (sortBy === 'last_prompt') {
      return list.sort((a, b) => {
        const aTs = a.lastPromptAt ?? a.updatedAt ?? 0
        const bTs = b.lastPromptAt ?? b.updatedAt ?? 0
        return bTs - aTs
      })
    }
    if (sortBy === 'custom_order') {
      if (customOrder.length === 0) {
        return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      }
      const orderMap = new Map(customOrder.map((key, idx) => [key, idx]))
      return list.sort((a, b) => {
        const aIdx = orderMap.get(a.key) ?? orderMap.get(a.friendlyId) ?? 999999
        const bIdx = orderMap.get(b.key) ?? orderMap.get(b.friendlyId) ?? 999999
        if (aIdx !== bIdx) return aIdx - bIdx
        return (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      })
    }
    return list
  }, [filteredSessions, sortBy, customOrder])

  function handleTogglePin(session: SessionMeta) {
    togglePinnedSession(session.key)
  }

  function handleDrop(targetKey: string) {
    if (!draggedKey || draggedKey === targetKey) return
    const allVisibleKeys = sortedSessions.map((s) => s.key)
    moveSessionInCustomOrder(draggedKey, targetKey, allVisibleKeys)
    setDraggedKey(null)
  }

  const handleStartProjectChat = (projectId: string | null) => {
    hapticTap()
    setActiveProjectMutation.mutate(projectId)
    void navigate({
      to: '/chat/$sessionKey',
      params: { sessionKey: 'new' },
    })
    onSelect?.()
  }

  // Renders a list of sessions up to limit 6 with "See all (X)" / "See less"
  function renderSessionList(
    groupKey: string,
    items: Array<SessionMeta>,
    showProjectSubtitle: boolean,
  ) {
    if (items.length === 0) return null

    const isExpanded = Boolean(expandedGroups[groupKey])
    const visibleItems = isExpanded
      ? items
      : items.slice(0, DEFAULT_GROUP_LIMIT)
    const hiddenCount = items.length - DEFAULT_GROUP_LIMIT

    return (
      <div className="flex flex-col gap-px">
        {visibleItems.map((session) => (
          <SessionItem
            key={session.key}
            session={session}
            active={session.friendlyId === activeFriendlyId}
            isPinned={pinnedSessionKeys.includes(session.key)}
            showProjectSubtitle={showProjectSubtitle}
            isSessionActive={isSessionActive(session)}
            isSessionBlocked={isSessionBlocked(session)}
            draggable={sortBy === 'custom_order'}
            onSelect={onSelect}
            onTogglePin={handleTogglePin}
            onRename={onRename}
            onDelete={onDelete}
            onDragStartSession={(key) => setDraggedKey(key)}
            onDropSession={handleDrop}
          />
        ))}

        {items.length > DEFAULT_GROUP_LIMIT && (
          <div className="pt-0.5 pb-1">
            {!isExpanded ? (
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((prev) => ({ ...prev, [groupKey]: true }))
                }
                className="px-2.5 py-1 text-left text-xs text-primary-400 hover:text-primary-600 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              >
                See all ({hiddenCount})
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setExpandedGroups((prev) => ({ ...prev, [groupKey]: false }))
                }
                className="px-2.5 py-1 text-left text-xs text-primary-400 hover:text-primary-600 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
              >
                See less
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Groups when groupBy === 'project'
  const projectGroups = useMemo(() => {
    if (groupBy !== 'project') return []

    const map = new Map<string, Array<SessionMeta>>()
    const knownProjectIds = new Set(projects.map((p) => p.id))

    // Initialize groups for all registered projects
    for (const p of projects) {
      map.set(p.id, [])
    }
    // Sandbox group
    map.set('sandbox', [])

    for (const session of sortedSessions) {
      if (session.projectId && knownProjectIds.has(session.projectId)) {
        map.get(session.projectId)!.push(session)
      } else {
        map.get('sandbox')!.push(session)
      }
    }

    const groups: Array<{
      id: string
      name: string
      items: Array<SessionMeta>
      isSandbox?: boolean
    }> = []

    for (const p of projects) {
      groups.push({
        id: p.id,
        name: p.name,
        items: map.get(p.id) || [],
      })
    }

    const sandboxItems = map.get('sandbox') || []
    groups.push({
      id: 'sandbox',
      name: 'Personal Sandbox',
      items: sandboxItems,
      isSandbox: true,
    })

    return groups
  }, [groupBy, projects, sortedSessions])

  // Groups when groupBy === 'status'
  const statusGroups = useMemo(() => {
    if (groupBy !== 'status') return { active: [], idle: [] }
    const active: Array<SessionMeta> = []
    const idle: Array<SessionMeta> = []

    for (const session of sortedSessions) {
      if (isSessionActive(session)) {
        active.push(session)
      } else {
        idle.push(session)
      }
    }
    return { active, idle }
  }, [groupBy, sortedSessions, waitingSessionKeys, streamingState])

  const sectionTitle = groupBy === 'project' ? 'Projects' : 'Conversations'

  return (
    <div className="flex h-full flex-col flex-1 min-h-0 w-full">
      {/* ── Header: Title + 2 Action Icons ──────────────────────────── */}
      <div className="w-full flex items-center justify-between px-3 pt-3 pb-2 shrink-0">
        <span className="text-xs font-semibold text-primary-900 dark:text-neutral-100 select-none">
          {sectionTitle}
        </span>

        <div className="flex items-center gap-1">
          {/* Action 1: Filter / Organization Menu */}
          <MenuRoot>
            <MenuTrigger
              type="button"
              className="flex items-center justify-center rounded-lg p-1 text-primary-400 dark:text-neutral-400 hover:bg-primary-200 dark:hover:bg-neutral-800 hover:text-primary-700 dark:hover:text-neutral-200 transition-colors"
              aria-label="Filter and organize conversations"
            >
              <HugeiconsIcon icon={FilterHorizontalIcon} size={15} strokeWidth={1.8} />
            </MenuTrigger>

            <MenuContent side="bottom" align="end" className="w-56 p-1.5 shadow-2xl">
              {/* Group By Submenu */}
              <MenuSubmenuRoot>
                <MenuSubmenuTrigger className="flex items-center justify-between text-xs py-1.5 px-2">
                  <span>Group By</span>
                  <div className="flex items-center gap-1 text-[11px] text-primary-400 dark:text-neutral-500">
                    <span className="capitalize">
                      {groupBy === 'project'
                        ? 'Project'
                        : groupBy === 'status'
                          ? 'Status'
                          : 'None'}
                    </span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                  </div>
                </MenuSubmenuTrigger>
                <MenuSubmenuContent side="right" align="start" className="w-36 p-1">
                  <MenuItem
                    onClick={() => setGroupBy('project')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>Project</span>
                    {groupBy === 'project' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setGroupBy('status')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>Status</span>
                    {groupBy === 'status' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setGroupBy('none')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>None</span>
                    {groupBy === 'none' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                </MenuSubmenuContent>
              </MenuSubmenuRoot>

              {/* Sort Conversations Submenu */}
              <MenuSubmenuRoot>
                <MenuSubmenuTrigger className="flex items-center justify-between text-xs py-1.5 px-2">
                  <span>Sort Conversations</span>
                  <div className="flex items-center gap-1 text-[11px] text-primary-400 dark:text-neutral-500">
                    <span>
                      {sortBy === 'last_updated'
                        ? 'Last Updated'
                        : sortBy === 'last_prompt'
                          ? 'Last Prompt'
                          : 'Custom Order'}
                    </span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                  </div>
                </MenuSubmenuTrigger>
                <MenuSubmenuContent side="right" align="start" className="w-40 p-1">
                  <MenuItem
                    onClick={() => setSortBy('last_updated')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>Last Updated</span>
                    {sortBy === 'last_updated' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setSortBy('last_prompt')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>Last Prompt</span>
                    {sortBy === 'last_prompt' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setSortBy('custom_order')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>Custom Order</span>
                    {sortBy === 'custom_order' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                </MenuSubmenuContent>
              </MenuSubmenuRoot>

              <MenuSeparator />

              {/* Filters Submenu */}
              <MenuSubmenuRoot>
                <MenuSubmenuTrigger className="flex items-center justify-between text-xs py-1.5 px-2">
                  <span>Filter</span>
                  <div className="flex items-center gap-1 text-[11px] text-primary-400 dark:text-neutral-500">
                    <span>
                      {filterDays === '7_days'
                        ? '7 Days'
                        : filterDays === '30_days'
                          ? '30 Days'
                          : 'None'}
                    </span>
                    <HugeiconsIcon icon={ArrowRight01Icon} size={12} />
                  </div>
                </MenuSubmenuTrigger>
                <MenuSubmenuContent side="right" align="start" className="w-36 p-1">
                  <MenuItem
                    onClick={() => setFilterDays('7_days')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>7 Days</span>
                    {filterDays === '7_days' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setFilterDays('30_days')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>30 Days</span>
                    {filterDays === '30_days' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                  <MenuItem
                    onClick={() => setFilterDays('none')}
                    className="flex items-center justify-between text-xs py-1.5 px-2"
                  >
                    <span>None</span>
                    {filterDays === 'none' && (
                      <HugeiconsIcon icon={Tick02Icon} size={14} className="text-accent-600" />
                    )}
                  </MenuItem>
                </MenuSubmenuContent>
              </MenuSubmenuRoot>
            </MenuContent>
          </MenuRoot>

          {/* Action 2: Create New Project Icon */}
          <button
            type="button"
            onClick={() => {
              hapticTap()
              setCreateProjectOpen(true)
            }}
            className="flex items-center justify-center rounded-lg p-1 text-primary-400 dark:text-neutral-400 hover:bg-primary-200 dark:hover:bg-neutral-800 hover:text-primary-700 dark:hover:text-neutral-200 transition-colors"
            title="Create New Project"
            aria-label="Create New Project"
          >
            <HugeiconsIcon icon={FolderAddIcon} size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* ── Scrollable Session Content ─────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-2 space-y-3 pb-4">
        {loading ? (
          <div className="px-3 py-4 text-xs text-primary-500">
            Loading sessions…
          </div>
        ) : error ? (
          <div className="px-3 py-3 text-xs text-primary-500">
            <div className="mb-1 text-red-500">Failed to load sessions</div>
            <div className="text-[11px] opacity-80">{error}</div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="mt-2 text-xs"
              onClick={onRetry}
            >
              Retry
            </Button>
          </div>
        ) : sortedSessions.length === 0 ? (
          <div className="px-3 py-4 text-xs text-primary-400 dark:text-neutral-500">
            {filterDays !== 'none'
              ? 'No sessions in this time filter.'
              : 'No conversations yet.'}
          </div>
        ) : (
          <>
            {/* 1. Group By: Project */}
            {groupBy === 'project' && (
              <div className="space-y-4">
                {projectGroups.map((group) => (
                  <div key={group.id} className="space-y-1">
                    {/* Project Folder Header */}
                    <div className="group/hdr flex items-center justify-between px-2 py-1 text-primary-700 dark:text-neutral-300">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <HugeiconsIcon
                          icon={Folder01Icon}
                          size={15}
                          className="text-primary-500 dark:text-neutral-400 shrink-0"
                        />
                        <span className="truncate text-xs font-medium">
                          {group.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover/hdr:opacity-100 transition-opacity">
                        {!group.isSandbox && (
                          <button
                            type="button"
                            onClick={() => {
                              const proj = projects.find((p) => p.id === group.id)
                              if (proj) setEditingProject(proj)
                            }}
                            className="hover:text-accent-600 dark:hover:text-neutral-100 p-0.5 rounded transition-colors"
                            title={`Project options for ${group.name}`}
                            aria-label={`Project options for ${group.name}`}
                          >
                            <HugeiconsIcon icon={MoreVerticalIcon} size={13} strokeWidth={2} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleStartProjectChat(
                              group.isSandbox ? null : group.id,
                            )
                          }
                          className="hover:text-accent-600 dark:hover:text-neutral-100 p-0.5 rounded transition-colors"
                          title={`New conversation in ${group.name}`}
                          aria-label={`New conversation in ${group.name}`}
                        >
                          <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
                        </button>
                      </div>
                    </div>

                    {/* Project Sessions or Empty State */}
                    {group.items.length === 0 ? (
                      <div className="px-6 py-1 text-xs text-primary-400/80 dark:text-neutral-500">
                        No conversations yet
                      </div>
                    ) : (
                      renderSessionList(group.id, group.items, false)
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 2. Group By: Status */}
            {groupBy === 'status' && (
              <div className="space-y-4">
                {/* Active Group */}
                {statusGroups.active.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 px-2 py-1 text-primary-700 dark:text-neutral-300">
                      <span className="size-2 rounded-full bg-[#0091ff] animate-pulse" />
                      <span className="text-xs font-medium">Active</span>
                      <span className="text-[10px] text-primary-400 dark:text-neutral-500 font-mono">
                        ({statusGroups.active.length})
                      </span>
                    </div>
                    {renderSessionList('status:active', statusGroups.active, true)}
                  </div>
                )}

                {/* Idle Group */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-2 py-1 text-primary-700 dark:text-neutral-300">
                    <HugeiconsIcon
                      icon={CheckmarkCircle01Icon}
                      size={14}
                      className="text-primary-500 dark:text-neutral-400"
                    />
                    <span className="text-xs font-medium">Idle</span>
                    <span className="text-[10px] text-primary-400 dark:text-neutral-500 font-mono">
                      ({statusGroups.idle.length})
                    </span>
                  </div>
                  {renderSessionList('status:idle', statusGroups.idle, true)}
                </div>
              </div>
            )}

            {/* 3. Group By: None */}
            {groupBy === 'none' && (
              <div className="space-y-1">
                {renderSessionList('none:all', sortedSessions, true)}
              </div>
            )}
          </>
        )}

        {fetching && !loading && !error && sortedSessions.length > 0 ? (
          <div className="px-3 py-1 text-[11px] text-primary-400">
            Updating…
          </div>
        ) : null}
      </div>

      {/* Project Creation Modal */}
      <ProjectModal
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        onCreated={(project) => {
          setActiveProjectMutation.mutate(project.id)
        }}
      />

      {/* Project Edit Modal */}
      {editingProject && (
        <ProjectModal
          open={Boolean(editingProject)}
          project={editingProject}
          onOpenChange={(open) => {
            if (!open) setEditingProject(null)
          }}
          onUpdated={() => {
            setEditingProject(null)
          }}
        />
      )}
    </div>
  )
})
