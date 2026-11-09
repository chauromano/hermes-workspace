import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowRight01Icon,
  Cancel01Icon,
  Chat01Icon,
  CheckListIcon,
  Clock01Icon,
  EyeIcon,
  Folder01Icon,
  PinIcon,
  PlusSignIcon,
  Rocket01Icon,
  Search01Icon,
  UserGroupIcon,
  UserMultipleIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons'
import type {
  ExternalConversation,
  ExternalRuntime,
} from '@/lib/external-harness-api'
import type { ClaudeTask } from '@/lib/tasks-api'
import { usePinnedSessions } from '@/hooks/use-pinned-sessions'
import { useOperations } from '@/screens/agents/hooks/use-operations'
import { useProjects } from '@/hooks/use-projects'
import { useHarnessVisibility } from '@/screens/chat/harness-visibility'
import { fetchTasks } from '@/lib/tasks-api'
import { fetchSessions } from '@/lib/gateway-api'
import type { GatewaySession } from '@/lib/gateway-api'
import { formatModelName } from '@/lib/format-model-name'
import {
  createExternalConversation,
  fetchExternalConversations,
  fetchExternalRuntimes,
} from '@/lib/external-harness-api'
import { Button } from '@/components/ui/button'
import { MobilePageHeader } from '@/components/mobile-page-header'
import { cn } from '@/lib/utils'

type AgentCommandCenterProps = {
  selectedRuntimeId?: string
}

function relativeTime(timestamp: number | string | undefined): string {
  if (!timestamp) return 'recently'
  const value =
    typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp))
  if (!Number.isFinite(value)) return 'recently'
  const elapsed = Math.max(0, Date.now() - value)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

function runtimeStatusClass(status: ExternalRuntime['status']): string {
  if (status === 'online') return 'bg-emerald-500'
  if (status === 'offline' || status === 'missing') return 'bg-red-500'
  return 'bg-amber-400'
}

function runtimeLabel(runtime: ExternalRuntime): string {
  if (runtime.backend === 'hermes') return 'Hermes CLI'
  if (runtime.backend === 'openclaw-gateway') return 'OpenClaw Gateway'
  return runtime.name
}

function compactTaskLabel(task: ClaudeTask): string {
  return task.assignee ? `${task.title} · ${task.assignee}` : task.title
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 p-3 sm:p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-primary-900">{title}</h2>
          <p className="mt-0.5 text-xs text-primary-500 line-clamp-2">{subtitle}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function NativeSessionRow({
  session,
  isPinned = false,
  onTogglePin,
}: {
  session: GatewaySession
  isPinned?: boolean
  onTogglePin?: () => void
}) {
  const title =
    session.title ||
    session.derivedTitle ||
    session.label ||
    (session.friendlyId ? `Session ${session.friendlyId.slice(0, 8)}` : 'Session')
  const friendlyId = session.friendlyId || session.key || 'main'
  const model = session.model as string | undefined
  const count =
    typeof session.messageCount === 'number'
      ? session.messageCount
      : typeof session.message_count === 'number'
        ? session.message_count
        : undefined

  return (
    <div className="group flex w-full min-w-0 max-w-full items-center justify-between gap-1 rounded-xl border border-transparent px-2 sm:px-2.5 py-1 transition-colors hover:border-primary-200 hover:bg-primary-100">
      <Link
        to="/chat/$sessionKey"
        params={{ sessionKey: friendlyId }}
        className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3 py-1.5 overflow-hidden"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-xl',
            isPinned
              ? 'bg-accent-500/15 text-accent-600'
              : 'bg-accent-500/10 text-accent-600',
          )}
        >
          <HugeiconsIcon icon={isPinned ? PinIcon : Chat01Icon} size={16} />
        </span>
        <span className="min-w-0 flex-1 overflow-hidden">
          <span className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-900 group-hover:text-primary-950">
              {title}
            </span>
            {isPinned && (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-accent-500/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-700">
                <HugeiconsIcon icon={PinIcon} size={10} strokeWidth={2} />
                Pinned
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-primary-500">
            {typeof session.projectName === 'string' && session.projectName ? `${session.projectName} · ` : ''}
            {typeof (session as any).profileName === 'string' && (session as any).profileName && !['default', 'general'].includes(String((session as any).profileName).toLowerCase()) ? `${(session as any).profileName} · ` : ''}
            {model ? `${formatModelName(model)} · ` : ''}
            {typeof count === 'number'
              ? `${count} ${count === 1 ? 'message' : 'messages'}`
              : 'Session'}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-primary-400">
          {relativeTime(session.updatedAt)}
        </span>
      </Link>

      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onTogglePin()
          }}
          aria-label={isPinned ? 'Unpin session' : 'Pin session'}
          title={isPinned ? 'Unpin session' : 'Pin session'}
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors',
            isPinned
              ? 'text-accent-600 hover:bg-accent-500/20'
              : 'text-primary-300 opacity-60 md:opacity-0 md:group-hover:opacity-100 hover:bg-primary-200/60 hover:text-primary-700 focus:opacity-100',
          )}
        >
          <HugeiconsIcon
            icon={PinIcon}
            size={14}
            strokeWidth={isPinned ? 2 : 1.5}
          />
        </button>
      )}
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 rounded-xl border border-dashed border-primary-200 px-3 py-5 text-center text-xs text-primary-500">
      {children}
    </div>
  )
}

function ConversationRow({
  conversation,
  runtime,
}: {
  conversation: ExternalConversation
  runtime?: ExternalRuntime
}) {
  const processing = conversation.runtime?.isProcessing === true
  const needsYou = (conversation.runtime?.pendingConfirmations ?? 0) > 0
  return (
    <Link
      to="/chat/external/$conversationId"
      params={{ conversationId: conversation.id }}
      className="group flex w-full min-w-0 max-w-full items-center gap-2.5 sm:gap-3 rounded-xl border border-transparent px-2.5 sm:px-3 py-2 sm:py-2.5 transition-colors hover:border-primary-200 hover:bg-primary-100 overflow-hidden"
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          needsYou
            ? 'bg-amber-400'
            : processing
              ? 'animate-pulse bg-emerald-500'
              : 'bg-primary-300',
        )}
      />
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="block truncate text-sm font-medium text-primary-900">
          {conversation.name}
        </span>
        <span className="block truncate text-xs text-primary-500">
          {runtime?.name || conversation.backend || 'External agent'} ·{' '}
          {processing ? 'working' : needsYou ? 'needs approval' : 'ready'}
        </span>
      </span>
      <span className="shrink-0 text-[11px] text-primary-400">
        {relativeTime(conversation.modifiedAt)}
      </span>
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={15}
        className="shrink-0 text-primary-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-600"
      />
    </Link>
  )
}

export function AgentCommandCenter({
  selectedRuntimeId,
}: AgentCommandCenterProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activeProject } = useProjects()
  const [showHiddenHarnesses, setShowHiddenHarnesses] = useState(false)
  const [showAllSessions, setShowAllSessions] = useState(false)
  const [sessionSearch, setSessionSearch] = useState('')
  const [projectOnlySessions, setProjectOnlySessions] = useState(false)
  const { hiddenIds, hiddenSet, toggleHarness, showAllHarnesses } =
    useHarnessVisibility()
  const operations = useOperations()

  const runtimesQuery = useQuery({
    queryKey: ['external-harnesses'],
    queryFn: fetchExternalRuntimes,
    refetchInterval: 15_000,
  })
  const conversationsQuery = useQuery({
    queryKey: ['external-conversations'],
    queryFn: fetchExternalConversations,
    refetchInterval: 3_000,
  })
  const tasksQuery = useQuery({
    queryKey: ['command-center-tasks'],
    queryFn: () => fetchTasks({ include_done: true }),
    refetchInterval: 20_000,
  })
  const sessionsQuery = useQuery({
    queryKey: ['command-center-sessions'],
    queryFn: fetchSessions,
    staleTime: 5_000,
    refetchInterval: 15_000,
  })

  const rosterQuery = useQuery({
    queryKey: ['swarm2', 'roster', activeProject?.id],
    queryFn: async () => {
      const url = activeProject?.id
        ? `/api/swarm-roster?projectId=${encodeURIComponent(activeProject.id)}`
        : '/api/swarm-roster'
      const res = await fetch(url)
      if (!res.ok) return null
      return res.json()
    },
    refetchInterval: 30_000,
  })

  const missionsQuery = useQuery({
    queryKey: ['command-center-missions'],
    queryFn: async () => {
      const res = await fetch('/api/swarm-missions?limit=10')
      if (!res.ok) return []
      return res.json()
    },
    refetchInterval: 15_000,
  })

  const swarmRuntimeQuery = useQuery({
    queryKey: ['command-center-swarm-runtime'],
    queryFn: async () => {
      const res = await fetch('/api/swarm-runtime')
      if (!res.ok) return { entries: [] }
      return res.json()
    },
    refetchInterval: 10_000,
  })

  const runtimes = runtimesQuery.data?.runtimes ?? []
  const visibleRuntimes = runtimes.filter(
    (runtime) => !hiddenSet.has(runtime.id),
  )
  const hiddenRuntimes = runtimes.filter((runtime) => hiddenSet.has(runtime.id))
  const nativeHermesHidden = hiddenSet.has('hermes-native')
  const conversations = conversationsQuery.data ?? []
  const tasks = tasksQuery.data ?? []
  const selectedRuntime = runtimes.find(
    (runtime) => runtime.id === selectedRuntimeId,
  )
  const visibleConversations = selectedRuntimeId
    ? conversations.filter(
        (conversation) => conversation.runtimeId === selectedRuntimeId,
      )
    : conversations

  const swarmWorkers: Array<any> = rosterQuery.data?.roster?.workers ?? []
  const swarmScope: string = rosterQuery.data?.scope ?? 'global'
  const swarmMissions: Array<any> = Array.isArray(missionsQuery.data) ? missionsQuery.data : []
  const swarmEntries: Array<any> = Array.isArray(swarmRuntimeQuery.data?.entries)
    ? swarmRuntimeQuery.data.entries
    : []

  const activeMissions = swarmMissions.filter(
    (m) => m.state === 'executing' || m.state === 'running',
  )
  const waitingMissions = swarmMissions.filter(
    (m) =>
      m.state === 'blocked' ||
      m.state === 'needs_input' ||
      m.assignments?.some(
        (a: any) =>
          a.state === 'blocked' ||
          a.checkpoint?.checkpointStatus === 'needs_input' ||
          a.checkpoint?.checkpointStatus === 'blocked',
      ),
  )

  const activeSwarmWorkers = swarmEntries.filter(
    (e) => e.state === 'executing' || e.state === 'thinking' || e.state === 'writing',
  )
  const waitingSwarmWorkers = swarmEntries.filter(
    (e) =>
      e.state === 'waiting' ||
      e.state === 'blocked' ||
      e.checkpointStatus === 'needs_input' ||
      e.checkpointStatus === 'blocked',
  )

  const blockedTasks = tasks.filter(
    (task) => task.column === 'blocked' || task.column === 'review',
  )
  const activeTasks = tasks.filter((task) => task.column === 'in_progress')
  const doneTasks = tasks
    .filter((task) => task.column === 'done')
    .sort(
      (left, right) =>
        Date.parse(right.updated_at) - Date.parse(left.updated_at),
    )
  const pendingConversations = conversations.filter(
    (conversation) => (conversation.runtime?.pendingConfirmations ?? 0) > 0,
  )
  const processingConversations = conversations.filter(
    (conversation) => conversation.runtime?.isProcessing,
  )
  const agentsNeedingSetup = operations.agents.filter(
    (agent) => agent.needsSetup || agent.status === 'error',
  )
  const activeNativeAgents = operations.agents.filter(
    (agent) => agent.status === 'active',
  )

  const latestUpdates = useMemo(() => {
    const external = conversations.slice(0, 4).map((conversation) => ({
      id: `external-${conversation.id}`,
      label: conversation.name,
      detail: `${conversation.backend || 'Agent'} session ${conversation.runtime?.isProcessing ? 'is working' : 'updated'}`,
      timestamp: conversation.modifiedAt,
    }))
    const native = operations.recentActivity.slice(0, 4).map((activity) => ({
      id: `native-${activity.id}`,
      label:
        operations.agents.find((agent) => agent.id === activity.agentId)
          ?.name ?? activity.agentId,
      detail: activity.summary,
      timestamp: activity.timestamp,
    }))
    return [...external, ...native]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 6)
  }, [conversations, operations.agents, operations.recentActivity])

  const newExternalSession = useMutation({
    mutationFn: (runtimeId: string) =>
      createExternalConversation({ runtimeId, name: 'New session' }),
    onSuccess: async (conversation) => {
      await queryClient.invalidateQueries({
        queryKey: ['external-conversations'],
      })
      navigate({
        to: '/chat/external/$conversationId',
        params: { conversationId: conversation.id },
      })
    },
  })

  const onlineCount = visibleRuntimes.filter(
    (runtime) => runtime.status === 'online',
  ).length
  const workingCount =
    activeTasks.length +
    processingConversations.length +
    activeNativeAgents.length +
    activeMissions.length +
    activeSwarmWorkers.length

  const waitingCount =
    blockedTasks.length +
    pendingConversations.length +
    agentsNeedingSetup.length +
    waitingMissions.length +
    waitingSwarmWorkers.length

  const nativeSessions = sessionsQuery.data?.sessions ?? []
  const { pinnedSessionKeys, togglePinnedSession } = usePinnedSessions()
  const pinnedKeySet = useMemo(
    () => new Set(pinnedSessionKeys),
    [pinnedSessionKeys],
  )
  const isSessionPinned = useCallback(
    (s: GatewaySession) => {
      const key = s.key || s.friendlyId || (s as any).id
      return (
        Boolean(key && pinnedKeySet.has(key)) ||
        Boolean(s.friendlyId && pinnedKeySet.has(s.friendlyId))
      )
    },
    [pinnedKeySet],
  )

  const sortedNativeSessions = useMemo(() => {
    const sorted = [...nativeSessions].sort((a, b) => {
      const timeA =
        typeof a.updatedAt === 'number'
          ? a.updatedAt
          : Date.parse(String(a.updatedAt || 0)) || 0
      const timeB =
        typeof b.updatedAt === 'number'
          ? b.updatedAt
          : Date.parse(String(b.updatedAt || 0)) || 0
      return timeB - timeA
    })

    const pinned: Array<GatewaySession> = []
    const unpinned: Array<GatewaySession> = []
    for (const session of sorted) {
      if (isSessionPinned(session)) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }
    return [...pinned, ...unpinned]
  }, [nativeSessions, isSessionPinned])

  const sessionsMatchingProject = useMemo(() => {
    if (!projectOnlySessions || !activeProject) return sortedNativeSessions
    return sortedNativeSessions.filter(
      (s) =>
        s.projectName === activeProject.name ||
        s.projectId === activeProject.id ||
        (s as any).project_id === activeProject.id,
    )
  }, [sortedNativeSessions, projectOnlySessions, activeProject])

  const filteredNativeSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase()
    if (!q) return sessionsMatchingProject
    return sessionsMatchingProject.filter((s) => {
      const title = (
        s.title ||
        s.derivedTitle ||
        s.label ||
        (s.friendlyId ? `Session ${s.friendlyId.slice(0, 8)}` : 'Session')
      ).toLowerCase()
      const key = (s.friendlyId || s.key || (s as any).id || '').toLowerCase()
      const model = typeof s.model === 'string' ? s.model.toLowerCase() : ''
      return title.includes(q) || key.includes(q) || model.includes(q)
    })
  }, [sessionsMatchingProject, sessionSearch])

  const { pinnedSessions, unpinnedSessions } = useMemo(() => {
    const pinned: Array<GatewaySession> = []
    const unpinned: Array<GatewaySession> = []
    for (const session of filteredNativeSessions) {
      if (isSessionPinned(session)) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }
    return { pinnedSessions: pinned, unpinnedSessions: unpinned }
  }, [filteredNativeSessions, isSessionPinned])

  return (
    <main className="h-full w-full max-w-full min-w-0 overflow-x-hidden overflow-y-auto bg-surface text-primary-900">
      <MobilePageHeader
        title={selectedRuntime ? runtimeLabel(selectedRuntime) : 'Command Center'}
        className="sticky top-0 z-20 backdrop-blur bg-surface/95"
        right={
          <button
            type="button"
            onClick={() =>
              selectedRuntime
                ? newExternalSession.mutate(selectedRuntime.id)
                : navigate({
                    to: '/chat/$sessionKey',
                    params: { sessionKey: 'new' },
                  })
            }
            className="flex size-9 items-center justify-center rounded-xl text-primary-600 hover:text-primary-950 active:scale-95 transition-all touch-manipulation"
            aria-label="New chat"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={20} strokeWidth={2} />
          </button>
        }
      />
      <div className="mx-auto w-full max-w-[1180px] min-w-0 px-3 pb-24 pt-4 sm:px-4 sm:pt-6 md:px-7 md:pt-9">
        <header className="flex flex-col gap-4 border-b border-primary-200 pb-5 sm:pb-6 md:flex-row md:items-end md:justify-between min-w-0">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium uppercase tracking-[0.12em] text-primary-500">
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-700">
                <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                Live workspace
              </span>
              <Link
                to="/projects"
                className="flex items-center gap-1.5 rounded-full border border-primary-200 bg-surface px-2 py-0.5 text-primary-700 hover:border-accent-400 hover:text-accent-700 transition-colors"
                title="Switch or view projects"
              >
                <HugeiconsIcon icon={Folder01Icon} size={12} />
                <span>{activeProject ? activeProject.name : 'All Projects'}</span>
              </Link>
              <span className="flex items-center gap-1 rounded-full border border-primary-200 bg-surface px-2 py-0.5 text-primary-600">
                <HugeiconsIcon icon={UserGroupIcon} size={12} />
                <span>
                  {swarmScope === 'project' ? 'Project Swarm' : 'Global Swarm'} · {swarmWorkers.length} agents
                </span>
              </span>
            </div>
            <h1 className="truncate text-xl sm:text-2xl font-semibold tracking-tight text-primary-950">
              {selectedRuntime
                ? runtimeLabel(selectedRuntime)
                : 'Command Center'}
            </h1>
            <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-primary-600">
              {selectedRuntime
                ? `Sessions and activity for the ${runtimeLabel(selectedRuntime)} harness.`
                : 'See what every agent is doing, what needs you, and what just finished.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: '/conductor' })}
              className="border-accent-300 text-accent-700 hover:bg-accent-50"
            >
              <HugeiconsIcon icon={Rocket01Icon} size={16} />
              Launch Mission
            </Button>
            {selectedRuntime ? (
              <Button
                onClick={() => newExternalSession.mutate(selectedRuntime.id)}
                disabled={newExternalSession.isPending}
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} />
                New {runtimeLabel(selectedRuntime)} chat
              </Button>
            ) : (
              <Button
                onClick={() =>
                  navigate({
                    to: '/chat/$sessionKey',
                    params: { sessionKey: 'new' },
                  })
                }
              >
                <HugeiconsIcon icon={PlusSignIcon} size={16} />
                New Hermes chat
              </Button>
            )}
          </div>
        </header>

        <section className="grid w-full min-w-0 max-w-full grid-cols-2 gap-2 py-4 sm:py-5 md:grid-cols-4">
          {[
            { label: 'Working', value: workingCount, dot: 'bg-emerald-500' },
            { label: 'Needs you', value: waitingCount, dot: 'bg-amber-400' },
            { label: 'Completed', value: doneTasks.length, dot: 'bg-sky-500' },
            {
              label: 'Harnesses online',
              value: `${onlineCount}/${visibleRuntimes.length}`,
              dot: 'bg-violet-500',
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-0 items-center gap-2.5 sm:gap-3 rounded-xl border border-primary-200 bg-primary-50/60 px-2.5 py-2.5 sm:px-3 sm:py-3"
            >
              <span className={cn('size-2 shrink-0 rounded-full', stat.dot)} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base sm:text-lg font-semibold leading-none text-primary-950">
                  {stat.value}
                </div>
                <div className="mt-1 truncate text-[11px] text-primary-500">
                  {stat.label}
                </div>
              </div>
            </div>
          ))}
        </section>

        {!selectedRuntime && (
          <section className="mb-4 w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-primary-200 bg-primary-50/70 p-3 sm:p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 px-1 pb-2.5 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-primary-900">
                    Active Squad
                  </h2>
                  <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent-700">
                    {swarmScope === 'project' ? 'Project Roster' : 'Global Roster'}
                  </span>
                </div>
                <p className="truncate text-xs text-primary-500">
                  {swarmWorkers.length > 0
                    ? `${swarmWorkers.length} specialists active in ${swarmScope === 'project' ? activeProject?.name || 'project' : 'global scope'}`
                    : 'Pick a harness or open the full roster.'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  to="/swarm"
                  className="whitespace-nowrap text-xs font-medium text-accent-600 hover:text-accent-700"
                >
                  Open Swarm Studio →
                </Link>
              </div>
            </div>

            {/* Squad Members Grid */}
            {swarmWorkers.length > 0 && (
              <div className="grid w-full min-w-0 max-w-full gap-2 sm:grid-cols-2 lg:grid-cols-3 mb-3">
                {swarmWorkers.slice(0, 6).map((worker: any) => {
                  const entry = swarmEntries.find((e) => e.workerId === worker.id)
                  const isBusy = entry && (entry.state === 'executing' || entry.state === 'thinking' || entry.state === 'writing')
                  const isBlocked = entry && (entry.state === 'blocked' || entry.checkpointStatus === 'blocked')
                  const isWaiting = entry && (entry.state === 'waiting' || entry.checkpointStatus === 'needs_input')

                  const safetyMode = (worker.greenlightRequiredFor && worker.greenlightRequiredFor.length > 0)
                    ? 'approval'
                    : worker.reviewRequired
                      ? 'review'
                      : 'autonomous'

                  return (
                    <Link
                      key={worker.id}
                      to="/swarm"
                      className="group flex flex-col justify-between rounded-xl border border-primary-200 bg-surface p-2.5 transition-all hover:border-accent-300 hover:bg-primary-50 hover:shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={cn(
                                'size-2 shrink-0 rounded-full',
                                isBusy
                                  ? 'animate-pulse bg-emerald-500'
                                  : isBlocked
                                    ? 'bg-rose-500'
                                    : isWaiting
                                      ? 'bg-amber-400'
                                      : 'bg-primary-300',
                              )}
                            />
                            <span className="truncate text-xs font-semibold text-primary-950">
                              {worker.name || worker.id}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-primary-500">
                            {worker.role || 'Worker'}
                            {worker.specialty ? ` · ${worker.specialty}` : ''}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border',
                            safetyMode === 'autonomous'
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
                              : safetyMode === 'review'
                                ? 'border-amber-500/30 bg-amber-500/10 text-amber-700'
                                : 'border-rose-500/30 bg-rose-500/10 text-rose-700',
                          )}
                        >
                          {safetyMode === 'autonomous' ? '🟢 Auto' : safetyMode === 'review' ? '🟡 Review' : '🔴 Approval'}
                        </span>
                      </div>
                      {worker.preferredTaskTypes && worker.preferredTaskTypes.length > 0 ? (
                        <div className="mt-2 flex flex-wrap items-center gap-1">
                          {worker.preferredTaskTypes.slice(0, 3).map((tag: string) => (
                            <span
                              key={tag}
                              className="rounded-md bg-primary-100/70 px-1.5 py-0.2 text-[9px] text-primary-600"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </Link>
                  )
                })}
              </div>
            )}

            {/* Harnesses row */}
            <div className="border-t border-primary-200/80 pt-2.5">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="text-[11px] font-medium text-primary-500">Connected Harnesses & CLI</span>
                {hiddenIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowHiddenHarnesses((value) => !value)}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs text-primary-500 hover:bg-primary-100 hover:text-primary-800"
                  >
                    <HugeiconsIcon icon={ViewOffIcon} size={13} />
                    {hiddenIds.length} hidden
                  </button>
                )}
              </div>
              <div className="grid w-full min-w-0 max-w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {!nativeHermesHidden && (
                  <div className="group flex w-full min-w-0 max-w-full items-center rounded-xl border border-primary-200 bg-surface transition-colors hover:bg-primary-100">
                    <Link
                      to="/chat/$sessionKey"
                      params={{ sessionKey: sortedNativeSessions[0]?.friendlyId || 'new' }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 overflow-hidden"
                    >
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/10 text-accent-600">
                        <HugeiconsIcon icon={Chat01Icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1 overflow-hidden">
                        <span className="block truncate text-xs font-medium">Hermes</span>
                        <span className="block truncate text-[10px] text-primary-500">
                          Native · {nativeSessions.length} sessions
                        </span>
                      </span>
                      <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleHarness('hermes-native')}
                      className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-lg text-primary-300 opacity-0 transition-opacity hover:bg-primary-200 hover:text-primary-700 group-hover:opacity-100 focus:opacity-100"
                      aria-label="Hide native Hermes"
                      title="Hide harness"
                    >
                      <HugeiconsIcon icon={EyeIcon} size={14} />
                    </button>
                  </div>
                )}
                {visibleRuntimes.map((runtime) => {
                  const sessionCount = conversations.filter(
                    (conversation) => conversation.runtimeId === runtime.id,
                  ).length
                  return (
                    <div
                      key={runtime.id}
                      className="group flex w-full min-w-0 max-w-full items-center rounded-xl border border-primary-200 bg-surface transition-colors hover:bg-primary-100"
                    >
                      <Link
                        to="/chat/harness/$runtimeId"
                        params={{ runtimeId: runtime.id }}
                        className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 overflow-hidden"
                      >
                        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
                          <HugeiconsIcon icon={UserMultipleIcon} size={15} />
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-xs font-medium">
                            {runtimeLabel(runtime)}
                          </span>
                          <span className="block truncate text-[10px] text-primary-500">
                            {runtime.model
                              ? `${formatModelName(runtime.model)} · `
                              : ''}
                            {sessionCount}{' '}
                            {sessionCount === 1 ? 'session' : 'sessions'}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'size-2 shrink-0 rounded-full',
                            runtimeStatusClass(runtime.status),
                          )}
                        />
                      </Link>
                      <button
                        type="button"
                        onClick={() => toggleHarness(runtime.id)}
                        className="mr-2 flex size-6 shrink-0 items-center justify-center rounded-lg text-primary-300 opacity-0 transition-opacity hover:bg-primary-200 hover:text-primary-700 group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Hide ${runtimeLabel(runtime)}`}
                        title="Hide harness"
                      >
                        <HugeiconsIcon icon={EyeIcon} size={14} />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
            {showHiddenHarnesses && hiddenIds.length > 0 && (
              <div className="mt-3 rounded-xl border border-dashed border-primary-200 bg-primary-100/40 p-2">
                <div className="mb-1 flex items-center justify-between px-2 py-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary-500">
                    Hidden harnesses
                  </span>
                  <button
                    type="button"
                    onClick={showAllHarnesses}
                    className="text-[11px] font-medium text-accent-600 hover:text-accent-700"
                  >
                    Show all
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nativeHermesHidden && (
                    <button
                      type="button"
                      onClick={() => toggleHarness('hermes-native')}
                      className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-primary-600 hover:text-primary-900"
                    >
                      <HugeiconsIcon icon={ViewOffIcon} size={13} /> Hermes
                    </button>
                  )}
                  {hiddenRuntimes.map((runtime) => (
                    <button
                      key={runtime.id}
                      type="button"
                      onClick={() => toggleHarness(runtime.id)}
                      className="flex items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-xs text-primary-600 hover:text-primary-900"
                    >
                      <HugeiconsIcon icon={ViewOffIcon} size={13} />
                      {runtimeLabel(runtime)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <div className="grid w-full min-w-0 max-w-full gap-4 lg:grid-cols-2">
          {selectedRuntime ? (
            <SectionCard
              title={`${runtimeLabel(selectedRuntime)} chats`}
              subtitle="Open a session or start another."
            >
              {visibleConversations.length ? (
                <div className="space-y-1">
                  {visibleConversations.slice(0, 8).map((conversation) => (
                    <ConversationRow
                      key={conversation.id}
                      conversation={conversation}
                      runtime={selectedRuntime}
                    />
                  ))}
                </div>
              ) : (
                <EmptyRow>No sessions yet. Start the first chat.</EmptyRow>
              )}
            </SectionCard>
          ) : (
            <SectionCard
              title="Recent sessions"
              subtitle="Past and active sessions across this workspace."
              action={
                <div className="flex items-center gap-2">
                  {activeProject && (
                    <div className="inline-flex rounded-lg border border-primary-200 bg-surface p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setProjectOnlySessions(false)}
                        className={cn(
                          'rounded-md px-2 py-0.5 font-medium transition-colors',
                          !projectOnlySessions
                            ? 'bg-accent-500 text-white shadow-xs'
                            : 'text-primary-600 hover:text-primary-950',
                        )}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setProjectOnlySessions(true)}
                        className={cn(
                          'rounded-md px-2 py-0.5 font-medium transition-colors',
                          projectOnlySessions
                            ? 'bg-accent-500 text-white shadow-xs'
                            : 'text-primary-600 hover:text-primary-950',
                        )}
                      >
                        {activeProject.name}
                      </button>
                    </div>
                  )}
                  {nativeSessions.length > 0 && (
                    <Link
                      to="/chat/$sessionKey"
                      params={{ sessionKey: 'new' }}
                      className="whitespace-nowrap text-xs font-medium text-accent-600 hover:text-accent-700"
                    >
                      + New
                    </Link>
                  )}
                </div>
              }
            >
              {nativeSessions.length > 0 && (
                <div className="mb-2.5 relative w-full min-w-0">
                  <HugeiconsIcon
                    icon={Search01Icon}
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={sessionSearch}
                    onChange={(e) => setSessionSearch(e.target.value)}
                    placeholder="Search sessions..."
                    className="w-full text-xs rounded-xl pl-8 pr-7 py-1.5 bg-surface text-primary-900 placeholder:text-primary-400 border border-primary-200 focus:border-accent-500 focus:outline-none transition-colors"
                  />
                  {sessionSearch && (
                    <button
                      type="button"
                      onClick={() => setSessionSearch('')}
                      aria-label="Clear search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-primary-400 hover:text-primary-700 text-xs p-0.5 rounded transition-colors"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                    </button>
                  )}
                </div>
              )}

              {filteredNativeSessions.length ? (
                <div className="space-y-1">
                  {/* Pinned sessions section */}
                  {pinnedSessions.length > 0 && (
                    <div className="space-y-1 pb-1">
                      <div className="flex items-center gap-1.5 px-2 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-500">
                        <HugeiconsIcon icon={PinIcon} size={11} strokeWidth={2} />
                        <span>Pinned</span>
                        <span className="text-[10px] text-primary-400 font-normal">
                          ({pinnedSessions.length})
                        </span>
                      </div>
                      {pinnedSessions.map((session) => (
                        <NativeSessionRow
                          key={session.key || session.friendlyId}
                          session={session}
                          isPinned={true}
                          onTogglePin={() => {
                            togglePinnedSession(
                              session.key ||
                                session.friendlyId ||
                                (session as any).id,
                            )
                          }}
                        />
                      ))}
                      {unpinnedSessions.length > 0 && (
                        <div className="my-1.5 border-t border-primary-200/80" />
                      )}
                    </div>
                  )}

                  {/* Unpinned / Recent sessions */}
                  {unpinnedSessions.length > 0 && (
                    <div className="space-y-1">
                      {pinnedSessions.length > 0 && (
                        <div className="px-2 pt-0.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-500">
                          <span>Recent</span>
                        </div>
                      )}
                      {(showAllSessions || sessionSearch
                        ? unpinnedSessions
                        : unpinnedSessions.slice(0, 6)
                      ).map((session) => (
                        <NativeSessionRow
                          key={session.key || session.friendlyId}
                          session={session}
                          isPinned={false}
                          onTogglePin={() => {
                            togglePinnedSession(
                              session.key ||
                                session.friendlyId ||
                                (session as any).id,
                            )
                          }}
                        />
                      ))}
                      {!sessionSearch && unpinnedSessions.length > 6 && (
                        <button
                          type="button"
                          onClick={() => setShowAllSessions((prev) => !prev)}
                          className="mt-2 w-full rounded-lg py-1.5 text-center text-xs font-medium text-accent-600 hover:bg-primary-100/60 transition-colors"
                        >
                          {showAllSessions
                            ? 'Show fewer'
                            : `Show all ${unpinnedSessions.length} recent sessions`}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : sessionSearch ? (
                <div className="py-6 text-center text-xs text-primary-500">
                  <p>No sessions found matching &ldquo;{sessionSearch}&rdquo;</p>
                  <button
                    type="button"
                    onClick={() => setSessionSearch('')}
                    className="mt-2 text-xs font-medium text-accent-600 hover:text-accent-700"
                  >
                    Clear search
                  </button>
                </div>
              ) : sessionsQuery.isLoading ? (
                <div className="py-6 text-center text-xs text-primary-400">
                  Loading sessions...
                </div>
              ) : (
                <EmptyRow>No sessions yet. Start the first session above.</EmptyRow>
              )}
            </SectionCard>
          )}

          <SectionCard
            title="Working now"
            subtitle="Active agents, missions, and tasks across the workspace."
          >
            {activeTasks.length || processingConversations.length || activeMissions.length || activeSwarmWorkers.length ? (
              <div className="space-y-1">
                {activeMissions.map((mission: any) => (
                  <Link
                    key={mission.id}
                    to="/conductor"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <HugeiconsIcon
                      icon={Rocket01Icon}
                      size={17}
                      className="shrink-0 text-accent-600 animate-pulse"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-900">
                      Mission: {mission.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-accent-500/10 px-2 py-0.5 text-[10px] font-semibold text-accent-700 uppercase">
                      Executing
                    </span>
                  </Link>
                ))}
                {activeSwarmWorkers.map((worker: any) => (
                  <Link
                    key={worker.workerId}
                    to="/swarm"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-800">
                      <span className="font-medium text-primary-900">{worker.displayName || worker.workerId}</span>: {worker.currentTask || worker.phase || 'Working'}
                    </span>
                    <span className="shrink-0 text-[11px] text-primary-400 capitalize">
                      {worker.state}
                    </span>
                  </Link>
                ))}
                {processingConversations.slice(0, 4).map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    runtime={runtimes.find(
                      (runtime) => runtime.id === conversation.runtimeId,
                    )}
                  />
                ))}
                {activeTasks.slice(0, 4).map((task) => (
                  <Link
                    key={task.id}
                    to="/tasks"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <HugeiconsIcon
                      icon={CheckListIcon}
                      size={17}
                      className="shrink-0 text-emerald-600"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-800">
                      {compactTaskLabel(task)}
                    </span>
                    <span className="shrink-0 text-[11px] text-primary-400">
                      {relativeTime(task.updated_at)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyRow>All systems idle. Ready for dispatch.</EmptyRow>
            )}
          </SectionCard>

          <SectionCard
            title="Needs you"
            subtitle="Approvals, reviews, and blocked items requiring human greenlight."
          >
            {waitingCount ? (
              <div className="space-y-1">
                {waitingMissions.map((mission: any) => (
                  <Link
                    key={mission.id}
                    to="/conductor"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <HugeiconsIcon
                      icon={Rocket01Icon}
                      size={17}
                      className="shrink-0 text-amber-500"
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-primary-900">
                      Mission awaiting input: {mission.title}
                    </span>
                    <span className="shrink-0 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-700 uppercase">
                      Action needed
                    </span>
                  </Link>
                ))}
                {waitingSwarmWorkers.map((worker: any) => (
                  <Link
                    key={worker.workerId}
                    to="/swarm"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-amber-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-800">
                      <span className="font-medium text-primary-900">{worker.displayName || worker.workerId}</span>: {worker.blockedReason || 'Awaiting approval / greenlight'}
                    </span>
                    <span className="shrink-0 text-[11px] font-semibold text-amber-600">
                      {worker.checkpointStatus || worker.state}
                    </span>
                  </Link>
                ))}
                {pendingConversations.slice(0, 3).map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    runtime={runtimes.find(
                      (runtime) => runtime.id === conversation.runtimeId,
                    )}
                  />
                ))}
                {blockedTasks.slice(0, 4).map((task) => (
                  <Link
                    key={task.id}
                    to="/tasks"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-amber-400" />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-800">
                      {compactTaskLabel(task)}
                    </span>
                    <span className="shrink-0 rounded-md bg-amber-500/10 px-2 py-1 text-[10px] font-medium uppercase text-amber-700">
                      {task.column}
                    </span>
                  </Link>
                ))}
                {agentsNeedingSetup.slice(0, 3).map((agent) => (
                  <Link
                    key={agent.id}
                    to="/operations"
                    className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                  >
                    <span className="size-2 shrink-0 rounded-full bg-red-500" />
                    <span className="min-w-0 flex-1 truncate text-sm text-primary-800">
                      {agent.name} needs configuration
                    </span>
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      size={15}
                      className="shrink-0 text-primary-400"
                    />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyRow>You’re all caught up.</EmptyRow>
            )}
          </SectionCard>

          {!selectedRuntime && (
            <>
              <SectionCard
                title="Latest updates"
                subtitle="A compact activity trail across every agent."
              >
                {latestUpdates.length ? (
                  <div className="space-y-1">
                    {latestUpdates.map((update) => (
                      <div
                        key={update.id}
                        className="flex w-full min-w-0 max-w-full items-start gap-3 rounded-xl px-3 py-2.5 overflow-hidden"
                      >
                        <HugeiconsIcon
                          icon={Clock01Icon}
                          size={16}
                          className="mt-0.5 shrink-0 text-primary-400"
                        />
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate text-sm font-medium text-primary-800">
                            {update.label}
                          </span>
                          <span className="block truncate text-xs text-primary-500">
                            {update.detail}
                          </span>
                        </span>
                        <span className="shrink-0 text-[11px] text-primary-400">
                          {relativeTime(update.timestamp)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyRow>No recent updates yet.</EmptyRow>
                )}
              </SectionCard>

              <SectionCard
                title="Recently completed"
                subtitle="Finished work, kept out of the way until you need it."
              >
                {doneTasks.length ? (
                  <div className="space-y-1">
                    {doneTasks.slice(0, 6).map((task) => (
                      <Link
                        key={task.id}
                        to="/tasks"
                        className="flex w-full min-w-0 max-w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-primary-100 overflow-hidden"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                          ✓
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-primary-700">
                          {task.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-primary-400">
                          {relativeTime(task.updated_at)}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <EmptyRow>Completed work will appear here.</EmptyRow>
                )}
              </SectionCard>
            </>
          )}
        </div>

        {!selectedRuntime && (
          <nav className="mt-5 grid w-full min-w-0 max-w-full grid-cols-2 sm:grid-cols-5 gap-2">
            {[
              {
                to: '/operations',
                label: 'Agents',
                icon: UserMultipleIcon,
              },
              { to: '/tasks', label: 'Kanban', icon: CheckListIcon },
              { to: '/conductor', label: 'Missions', icon: Rocket01Icon },
              { to: '/swarm', label: 'Swarm Studio', icon: UserGroupIcon },
              { to: '/projects', label: 'Projects', icon: Folder01Icon },
            ].map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className="flex min-w-0 items-center justify-center gap-1.5 sm:gap-2 rounded-xl border border-primary-200 px-2 sm:px-3 py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100 hover:text-primary-950"
              >
                <HugeiconsIcon icon={item.icon} size={16} className="shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            ))}
          </nav>
        )}

        {newExternalSession.error instanceof Error && (
          <p className="mt-4 text-sm text-red-600">
            {newExternalSession.error.message}
          </p>
        )}
      </div>
    </main>
  )
}
